"""
Authority Magazine 24/7 Cloud Auto Responder Daemon.

Runs headless in any cloud environment (Railway, Render, Google Cloud Run, AWS, VPS).
Handles:
- Loading OAuth secrets from environment variables
- Continuous dual-mailbox polling (Pitch + Collab)
- Bi-directional sync with SaaS control plane (https://tli.authoritymag.co/admin/automation)
- HTTP health check server on $PORT for cloud runners
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


class DaemonState:
    """Shared state for status and health check reporting."""
    def __init__(self):
        self.start_time = time.time()
        self.pitch_running = False
        self.collab_running = False
        self.last_pitch_check = 0.0
        self.last_collab_check = 0.0
        self.pitch_drafts_created = 0
        self.collab_drafts_created = 0
        self.is_shutting_down = False


state = DaemonState()


class HealthHandler(BaseHTTPRequestHandler):
    """Lightweight HTTP server for cloud platform health checks."""
    def log_message(self, format, *args):
        # Suppress noisy access logs for health probes
        pass

    def do_GET(self):
        if self.path in ["/health", "/healthz", "/ping"]:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "healthy"}')
            return

        # Status dashboard endpoint
        uptime = int(time.time() - state.start_time)
        status_payload = {
            "status": "running" if not state.is_shutting_down else "shutting_down",
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
            except Exception as e:
                logger.error(f"Error in Pitch Responder loop: {e}", exc_info=True)

            # Sleep in 1-second slices so shutdown is instant
            for _ in range(CHECK_INTERVAL):
                if state.is_shutting_down:
                    break
                time.sleep(1)

    except Exception as exc:
        logger.critical(f"Pitch Responder failed to start: {exc}", exc_info=True)
    finally:
        state.pitch_running = False
        logger.info("Pitch Responder worker exited.")


def run_collab_worker():
    """Background thread running the Collaboration Auto Responder."""
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
            except Exception as e:
                logger.error(f"Error in Collab Responder loop: {e}", exc_info=True)

            for _ in range(COLLAB_CHECK_INTERVAL):
                if state.is_shutting_down:
                    break
                time.sleep(1)

    except Exception as exc:
        logger.warning(f"Collab Responder not started or disabled: {exc}")
    finally:
        state.collab_running = False
        logger.info("Collab Responder worker exited.")


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

    # 6. Main thread keepalive
    logger.info("Cloud Auto Responder is active and running 24/7.")
    while not state.is_shutting_down:
        time.sleep(2)

    logger.info("Shutdown complete. Goodbye.")


if __name__ == "__main__":
    main()
