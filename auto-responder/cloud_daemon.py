"""
Authority Magazine 24/7 Cloud Auto Responder Daemon.

Runs headless in any cloud environment (Railway, Render, Google Cloud Run, AWS, VPS).
Handles:
- Loading OAuth secrets from environment variables
- Continuous dual-mailbox polling (Pitch + Collab)
- Bi-directional sync with SaaS control plane (https://tli.authoritymag.co/admin/automation)
- HTTP health check server on $PORT for cloud runners
- Email alerts on worker crash / disconnection
- Graceful shutdown handling
"""

import os
import sys
import json
import time
import base64
import signal
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Configure structured logging to stdout (standard for cloud runners)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("cloud_daemon")

# ── Alert Configuration ──────────────────────────────────────────────────────
ALERT_EMAIL = os.getenv("ALERT_EMAIL", "rabbiweiner@gmail.com")
ALERT_COOLDOWN_SECONDS = 3600  # 1 hour between duplicate alerts
CONSECUTIVE_ERROR_THRESHOLD = 3  # send alert after this many back-to-back loop errors
BUILD_VERSION = "2026.09.15.2"
# ──────────────────────────────────────────────────────────────────────────────


def restore_secret_file(filename: str, env_json_key: str, env_b64_key: str) -> bool:
    """Restore a credentials or token JSON file from environment variables if not present on disk."""
    file_path = os.path.join(BASE_DIR, filename)
    if os.path.exists(file_path):
        logger.info(f"Secret file '{filename}' already exists on disk.")
        return True

    # Check for raw JSON in env
    raw_json = os.getenv(env_json_key)
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(parsed, f, indent=2)
            logger.info(f"Successfully restored '{filename}' from {env_json_key}.")
            return True
        except Exception as e:
            logger.error(f"Failed to parse {env_json_key}: {e}")

    # Check for base64-encoded JSON in env
    b64_content = os.getenv(env_b64_key)
    if b64_content:
        try:
            decoded = base64.b64decode(b64_content).decode("utf-8")
            parsed = json.loads(decoded)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(parsed, f, indent=2)
            logger.info(f"Successfully restored '{filename}' from {env_b64_key}.")
            return True
        except Exception as e:
            logger.error(f"Failed to parse {env_b64_key}: {e}")

    logger.warning(f"Secret file '{filename}' not found on disk and no env var ({env_json_key} / {env_b64_key}) provided.")
    return False


def setup_cloud_secrets():
    """Ensure all required OAuth tokens and credentials exist."""
    restore_secret_file("credentials.json", "GMAIL_CREDENTIALS_JSON", "GMAIL_CREDENTIALS_B64")
    restore_secret_file("token.json", "GMAIL_TOKEN_JSON", "GMAIL_TOKEN_B64")
    restore_secret_file("credentials_collab.json", "GMAIL_COLLAB_CREDENTIALS_JSON", "GMAIL_COLLAB_CREDENTIALS_B64")
    restore_secret_file("token_collab.json", "GMAIL_COLLAB_TOKEN_JSON", "GMAIL_COLLAB_TOKEN_B64")
    restore_secret_file("credentials_editor.json", "GMAIL_EDITOR_CREDENTIALS_JSON", "GMAIL_EDITOR_CREDENTIALS_B64")
    restore_secret_file("token_editor.json", "GMAIL_EDITOR_TOKEN_JSON", "GMAIL_EDITOR_TOKEN_B64")


class DaemonState:
    """Shared state for status and health check reporting."""
    def __init__(self):
        self.start_time = time.time()
        self.pitch_running = False
        self.collab_running = False
        self.generic_running = False
        self.last_pitch_check = 0.0
        self.last_collab_check = 0.0
        self.last_generic_check = 0.0
        self.pitch_drafts_created = 0
        self.collab_drafts_created = 0
        self.is_shutting_down = False


state = DaemonState()


# ── Alert Manager ─────────────────────────────────────────────────────────────

class AlertManager:
    """
    Sends email alerts when the cloud daemon encounters critical failures.
    
    Uses the existing Gmail API (support@authoritymag.co) to send alerts.
    Enforces a per-type cooldown to prevent spam (default: 1 hour).
    """
    
    def __init__(self, alert_email: str = ALERT_EMAIL, cooldown: int = ALERT_COOLDOWN_SECONDS):
        self.alert_email = alert_email
        self.cooldown = cooldown
        self._last_alert_times: dict[str, float] = {}  # alert_type -> timestamp
        self._lock = threading.Lock()
        self._gmail = None  # lazy-initialized
    
    def _get_gmail(self):
        """Lazy-init a Gmail client for sending alerts."""
        if self._gmail is None:
            try:
                from gmail_client import GmailClient
                self._gmail = GmailClient()
                self._gmail.authenticate(interactive=False)
                logger.info(f"AlertManager: Gmail client authenticated as {self._gmail.user_email}")
            except Exception as e:
                logger.error(f"AlertManager: Failed to initialize Gmail client: {e}")
                self._gmail = None
        return self._gmail
    
    def send_alert(self, alert_type: str, subject: str, body: str):
        """
        Send an alert email if the cooldown for this alert type has elapsed.
        
        Args:
            alert_type: Unique key for cooldown tracking (e.g. 'pitch_worker_crash')
            subject: Email subject line
            body: Email body text
        """
        with self._lock:
            now = time.time()
            last_sent = self._last_alert_times.get(alert_type, 0)
            if now - last_sent < self.cooldown:
                logger.info(f"AlertManager: Suppressed '{alert_type}' alert (cooldown active, {int(self.cooldown - (now - last_sent))}s remaining)")
                return
            
            gmail = self._get_gmail()
            if gmail is None:
                logger.error(f"AlertManager: Cannot send alert — Gmail client unavailable")
                return
            
            try:
                result = gmail.send_email(
                    to=self.alert_email,
                    subject=f"⚠️ Authority Mag Auto Responder: {subject}",
                    body=(
                        f"{body}\n\n"
                        f"---\n"
                        f"Cloud Runner: {os.getenv('RAILWAY_PUBLIC_DOMAIN', 'auto-responder-production.up.railway.app')}\n"
                        f"Dashboard: https://tli.authoritymag.co/admin/automation\n"
                        f"Uptime: {int(now - state.start_time)}s\n"
                        f"Alert Type: {alert_type}\n"
                        f"This is an automated alert from the Authority Magazine Auto Responder system."
                    )
                )
                if result:
                    self._last_alert_times[alert_type] = now
                    logger.info(f"AlertManager: Sent '{alert_type}' alert to {self.alert_email}")
                else:
                    logger.error(f"AlertManager: send_email returned None for '{alert_type}'")
            except Exception as e:
                logger.error(f"AlertManager: Failed to send '{alert_type}' alert: {e}")


alert_manager = AlertManager()

# ──────────────────────────────────────────────────────────────────────────────


class HealthHandler(BaseHTTPRequestHandler):
    """Lightweight HTTP server for cloud platform health checks."""
    def log_message(self, format, *args):
        # Suppress noisy access logs for health probes
        pass

    def do_GET(self):
        if self.path in ["/healthz", "/ping"]:
            # Liveness probe: returns 200 as long as process is alive and not shutting down
            status_code = 200 if not state.is_shutting_down else 503
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = b'{"status": "alive"}' if status_code == 200 else b'{"status": "shutting_down"}'
            self.wfile.write(resp)
            return

        if self.path == "/health":
            # Readiness probe: returns 200 only if workers are healthy and running
            uptime = time.time() - state.start_time
            is_ready = not state.is_shutting_down
            # Allow 30s grace period during initialization
            if uptime > 30 and not state.pitch_running:
                is_ready = False

            status_code = 200 if is_ready else 503
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status_text = "healthy" if is_ready else "degraded"
            self.wfile.write(json.dumps({
                "status": status_text,
                "version": BUILD_VERSION,
                "pitch_running": state.pitch_running,
                "collab_running": state.collab_running,
                "uptime_seconds": int(uptime),
            }).encode("utf-8"))
            return

        # Status dashboard endpoint
        uptime = int(time.time() - state.start_time)
        status_payload = {
            "status": "running" if not state.is_shutting_down else "shutting_down",
            "version": BUILD_VERSION,
            "service": "Authority Magazine 24/7 Cloud Auto Responder",
            "uptime_seconds": uptime,
            "saas_bridge_url": os.getenv("AUTHORITY_SAAS_URL", "https://tli.authoritymag.co"),
            "workers": {
                "pitch_responder": {
                    "running": state.pitch_running,
                    "last_check_ago_seconds": int(time.time() - state.last_pitch_check) if state.last_pitch_check else None,
                },
                "collab_responder": {
                    "running": state.collab_running,
                    "last_check_ago_seconds": int(time.time() - state.last_collab_check) if state.last_collab_check else None,
                },
                "generic_responder": {
                    "running": state.generic_running,
                    "last_check_ago_seconds": int(time.time() - state.last_generic_check) if state.last_generic_check else None,
                }
            }
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(status_payload, indent=2).encode("utf-8"))


def start_health_server(port: int):
    """Run HTTP health check server in background daemon thread."""
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    logger.info(f"Health check server listening on port {port}")
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()


def run_pitch_worker():
    """Background thread running the Pitch Auto Responder."""
    consecutive_errors = 0
    try:
        from auto_responder import AutoResponder, CHECK_INTERVAL
        responder = AutoResponder()

        logger.info("Authenticating Pitch Responder Gmail client...")
        responder.gmail.authenticate()
        logger.info(f"Pitch Responder authenticated as: {responder.gmail.user_email}")
        state.pitch_running = True

        while not state.is_shutting_down:
            try:
                responder.check_inbox()
                responder.check_reload_topics()
                responder.check_master_doc_weekly_sync()
                state.last_pitch_check = time.time()
                consecutive_errors = 0  # reset on success
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Error in Pitch Responder loop ({consecutive_errors}x): {e}", exc_info=True)
                if consecutive_errors >= CONSECUTIVE_ERROR_THRESHOLD:
                    alert_manager.send_alert(
                        "pitch_loop_errors",
                        "Pitch Responder Repeated Errors",
                        f"The Pitch Responder has hit {consecutive_errors} consecutive errors.\n\n"
                        f"Latest error: {e}\n\n"
                        f"The worker is still running but may not be processing pitches."
                    )

            # Sleep in 1-second slices so shutdown is instant
            for _ in range(CHECK_INTERVAL):
                if state.is_shutting_down:
                    break
                time.sleep(1)

    except Exception as exc:
        logger.critical(f"Pitch Responder failed to start: {exc}", exc_info=True)
        alert_manager.send_alert(
            "pitch_worker_crash",
            "Pitch Responder CRASHED",
            f"The Pitch Responder worker has crashed and is no longer processing pitches.\n\n"
            f"Error: {exc}\n\n"
            f"Manual intervention required — check Railway logs and redeploy if needed."
        )
    finally:
        state.pitch_running = False
        logger.info("Pitch Responder worker exited.")


def run_collab_worker():
    """Background thread running the Collaboration Auto Responder."""
    consecutive_errors = 0
    try:
        from collab_responder.collab_auto_responder import CollabAutoResponder, COLLAB_CHECK_INTERVAL
        responder = CollabAutoResponder()

        logger.info("Authenticating Collab Responder Gmail client...")
        responder.gmail.authenticate()
        logger.info(f"Collab Responder authenticated as: {responder.gmail.user_email}")
        state.collab_running = True

        while not state.is_shutting_down:
            try:
                responder.check_inbox()
                state.last_collab_check = time.time()
                consecutive_errors = 0  # reset on success
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Error in Collab Responder loop ({consecutive_errors}x): {e}", exc_info=True)
                if consecutive_errors >= CONSECUTIVE_ERROR_THRESHOLD:
                    alert_manager.send_alert(
                        "collab_loop_errors",
                        "Collab Responder Repeated Errors",
                        f"The Collab Responder has hit {consecutive_errors} consecutive errors.\n\n"
                        f"Latest error: {e}\n\n"
                        f"The worker is still running but may not be processing collaboration emails."
                    )

            for _ in range(COLLAB_CHECK_INTERVAL):
                if state.is_shutting_down:
                    break
                time.sleep(1)

    except Exception as exc:
        logger.warning(f"Collab Responder not started or disabled: {exc}")
        alert_manager.send_alert(
            "collab_worker_crash",
            "Collab Responder CRASHED",
            f"The Collab Responder worker has crashed.\n\n"
            f"Error: {exc}\n\n"
            f"The Pitch Responder may still be running, but collaboration emails are not being processed."
        )
    finally:
        state.collab_running = False
        logger.info("Collab Responder worker exited.")


def run_generic_worker():
    """Background thread running the Daily Generic Response worker."""
    consecutive_errors = 0
    try:
        from generic_responder import GenericAutoResponder
        responder = GenericAutoResponder()
        logger.info("Daily Generic Responder thread initialized.")
        state.generic_running = True

        while not state.is_shutting_down:
            state.last_generic_check = time.time()
            try:
                responder.process_queue()
                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Generic Responder error: {e}", exc_info=True)
                if consecutive_errors >= CONSECUTIVE_ERROR_THRESHOLD:
                    alert_manager.send_alert(
                        "generic_worker_errors",
                        "Generic Responder Repeated Errors",
                        f"The Generic Responder has hit {consecutive_errors} consecutive errors.\n\n"
                        f"Latest error: {e}\n\n"
                        f"The daily generic responses may not be processing."
                    )

            for _ in range(30):
                if state.is_shutting_down:
                    break
                time.sleep(1)

    except Exception as exc:
        logger.warning(f"Generic Responder not started: {exc}")
        alert_manager.send_alert(
            "generic_worker_crash",
            "Generic Responder CRASHED",
            f"The Generic Responder worker has crashed.\n\n"
            f"Error: {exc}"
        )
    finally:
        state.generic_running = False
        logger.info("Generic Responder worker exited.")


def run_watchdog():
    """
    Main-thread watchdog that periodically checks if workers are alive.
    Sends an alert if a worker was running but is now stopped (not during shutdown).
    """
    WATCHDOG_INTERVAL = 60  # check every 60 seconds
    # Wait for workers to have a chance to start
    time.sleep(30)
    
    pitch_was_running = state.pitch_running
    collab_was_running = state.collab_running
    generic_was_running = state.generic_running
    
    while not state.is_shutting_down:
        time.sleep(WATCHDOG_INTERVAL)
        if state.is_shutting_down:
            break
        
        # Check if pitch worker died unexpectedly
        if pitch_was_running and not state.pitch_running:
            alert_manager.send_alert(
                "pitch_worker_stopped",
                "Pitch Responder STOPPED",
                "The Pitch Responder worker was running but has stopped unexpectedly.\n\n"
                "Pitches are NOT being processed. Check Railway logs for details."
            )
        
        # Check if collab worker died unexpectedly
        if collab_was_running and not state.collab_running:
            alert_manager.send_alert(
                "collab_worker_stopped",
                "Collab Responder STOPPED",
                "The Collab Responder worker was running but has stopped unexpectedly.\n\n"
                "Collaboration emails are NOT being processed. Check Railway logs for details."
            )

        # Check if generic worker died unexpectedly
        if generic_was_running and not state.generic_running:
            alert_manager.send_alert(
                "generic_worker_stopped",
                "Generic Responder STOPPED",
                "The Generic Responder worker was running but has stopped unexpectedly.\n\n"
                "Daily generic responses are NOT being processed. Check Railway logs for details."
            )
        
        # Check for stale last-check timestamps (no successful poll in 10+ minutes)
        now = time.time()
        if state.pitch_running and state.last_pitch_check and (now - state.last_pitch_check > 600):
            alert_manager.send_alert(
                "pitch_stale",
                "Pitch Responder STALLED",
                f"The Pitch Responder has not completed a successful poll in "
                f"{int(now - state.last_pitch_check)} seconds.\n\n"
                f"It may be stuck or hanging. Check Railway logs for details."
            )
        
        pitch_was_running = state.pitch_running
        collab_was_running = state.collab_running
        generic_was_running = state.generic_running


def main():
    logger.info("=" * 60)
    logger.info("Authority Magazine 24/7 Cloud Auto Responder Initializing")
    logger.info("=" * 60)

    # 1. Restore OAuth credentials from environment variables if set
    setup_cloud_secrets()

    # 2. Start health check server for cloud platform (Railway/Render/Cloud Run)
    port = int(os.getenv("PORT", "8080"))
    start_health_server(port)

    # 3. Handle termination signals gracefully
    def handle_signal(signum, frame):
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        state.is_shutting_down = True

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # 4. Start Pitch Responder thread
    pitch_thread = threading.Thread(target=run_pitch_worker, name="PitchWorker", daemon=True)
    pitch_thread.start()

    # 5. Start Collab Responder thread if credentials exist
    collab_cred = os.path.join(BASE_DIR, "credentials_collab.json")
    if os.path.exists(collab_cred) or os.getenv("GMAIL_COLLAB_CREDENTIALS_JSON"):
        collab_thread = threading.Thread(target=run_collab_worker, name="CollabWorker", daemon=True)
        collab_thread.start()
    else:
        logger.info("No Collab credentials found; running Pitch Responder only.")

    # 6. Start Daily Generic Responder thread
    generic_thread = threading.Thread(target=run_generic_worker, name="GenericWorker", daemon=True)
    generic_thread.start()

    # 7. Start watchdog thread to monitor worker health
    watchdog_thread = threading.Thread(target=run_watchdog, name="Watchdog", daemon=True)
    watchdog_thread.start()

    # 8. Main thread keepalive
    logger.info(f"Cloud Auto Responder is active and running 24/7. Alerts → {ALERT_EMAIL}")
    while not state.is_shutting_down:
        time.sleep(2)

    logger.info("Shutdown complete. Goodbye.")


if __name__ == "__main__":
    main()

