"""
Authority Magazine SaaS automation bridge.

This keeps Gmail OAuth tokens local while letting the SaaS admin panel control
templates, thresholds, safety switches, and activity logs.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional


logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 12


@dataclass
class BridgeConfig:
    enabled: bool
    profile: dict[str, Any]
    mailbox: dict[str, Any]
    templates: dict[str, dict[str, Any]]
    suppressions: list[dict[str, Any]]
    fetched_at: float

    def template(self, key: str) -> Optional[dict[str, Any]]:
        template = self.templates.get(key)
        if template and template.get("enabled", True):
            return template
        return None

    def is_template_enabled(self, key: str) -> bool:
        template = self.templates.get(key)
        if template is None:
            return True
        return bool(template.get("enabled", True))


class AutomationBridge:
    """Small HTTP client for the SaaS bridge endpoints."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ):
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except Exception:
            pass

        self.base_url = (base_url or os.getenv("AUTHORITY_SAAS_URL") or "https://tli.authoritymag.co").rstrip("/")
        self.token = token or os.getenv("AUTHORITY_PITCH_BRIDGE_TOKEN") or os.getenv("AUTHORITY_AUTOMATION_BRIDGE_TOKEN") or ""
        self.timeout_seconds = timeout_seconds
        self._config: Optional[BridgeConfig] = None
        self._config_time = 0.0
        self._config_ttl = 60.0
        self._config_max_stale_seconds = 300.0  # 5 minutes max stale age

    def is_configured(self) -> bool:
        return bool(self.base_url and self.token)

    def get_config(self, force: bool = False) -> Optional[BridgeConfig]:
        if not self.is_configured():
            return None

        # Expire stale cache if older than max allowed stale duration
        if self._config is not None and (time.time() - self._config_time > self._config_max_stale_seconds):
            logger.warning(
                "Cached SaaS bridge config is older than %ds; invalidating stale cache.",
                self._config_max_stale_seconds,
            )
            self._config = None

        if (
            not force
            and self._config is not None
            and time.time() - self._config_time < self._config_ttl
        ):
            return self._config

        try:
            payload = self._request("GET", "/api/automation/bridge/config")
            templates = {
                item["key"]: item
                for item in payload.get("templates", [])
                if isinstance(item, dict) and item.get("key")
            }
            profile = payload.get("profile", {})
            mailbox = payload.get("mailbox", {})
            config = BridgeConfig(
                enabled=bool(profile.get("enabled") and mailbox.get("enabled")),
                profile=profile,
                mailbox=mailbox,
                templates=templates,
                suppressions=payload.get("suppressions", []),
                fetched_at=time.time(),
            )
            self._config = config
            self._config_time = time.time()
            return config
        except Exception as exc:
            logger.warning("SaaS bridge config unavailable: %s", exc)
            if self._config is not None and (time.time() - self._config_time > self._config_max_stale_seconds):
                logger.error("Cached SaaS bridge config has exceeded maximum stale age; blocking unmanaged work.")
                self._config = None
            return self._config

    def post_status(
        self,
        auth_status: str = "OK",
        bridge_status: str = "CONNECTED",
        last_error: Optional[str] = None,
        run: Optional[dict[str, Any]] = None,
    ) -> bool:
        if not self.is_configured():
            return False
        try:
            self._request(
                "POST",
                "/api/automation/bridge/status",
                {
                    "authStatus": auth_status,
                    "bridgeStatus": bridge_status,
                    "lastError": last_error,
                    "run": run,
                },
            )
            return True
        except Exception as exc:
            logger.warning("Could not post SaaS bridge status: %s", exc)
            return False

    def post_log(self, entry: dict[str, Any]) -> bool:
        if not self.is_configured():
            return False
        safe_entry = dict(entry)
        if "body" in safe_entry:
            safe_entry.pop("body")
        try:
            self._request("POST", "/api/automation/bridge/run-log", safe_entry)
            return True
        except Exception as exc:
            logger.warning("Could not post SaaS bridge log: %s", exc)
            return False

    def post_learned_rules(self, rules: list[dict[str, Any]]) -> bool:
        if not self.is_configured():
            return False
        try:
            self._request("POST", "/api/automation/bridge/learned-rules", {"rules": rules})
            return True
        except Exception as exc:
            logger.warning("Could not post learned rules to SaaS bridge: %s", exc)
            return False

    def post_templates(self, templates: list[dict[str, Any]]) -> bool:
        if not self.is_configured():
            return False
        try:
            self._request("POST", "/api/automation/bridge/templates", {"templates": templates})
            return True
        except Exception as exc:
            logger.warning("Could not post templates to SaaS bridge: %s", exc)
            return False

    def claim_workflow_run(
        self,
        workflow_key: str,
        local_date: str,
        lease_owner: str,
    ) -> Optional[dict[str, Any]]:
        """Atomically claim or resume a daily workflow run in the SaaS control plane."""
        if not self.is_configured():
            return None
        try:
            return self._request(
                "POST",
                "/api/automation/bridge/workflow",
                {
                    "action": "claim_run",
                    "workflowKey": workflow_key,
                    "localDate": local_date,
                    "leaseOwner": lease_owner,
                },
            )
        except Exception as exc:
            logger.warning("Could not claim workflow run '%s' for %s: %s", workflow_key, local_date, exc)
            return None

    def enqueue_delivery_candidates(
        self,
        workflow_id: str,
        run_id: str,
        candidates: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        """Enqueue discovered queue candidates into the durable audit ledger."""
        if not self.is_configured() or not candidates:
            return None
        try:
            return self._request(
                "POST",
                "/api/automation/bridge/workflow",
                {
                    "action": "enqueue_candidates",
                    "workflowId": workflow_id,
                    "runId": run_id,
                    "candidates": candidates,
                },
            )
        except Exception as exc:
            logger.warning("Could not enqueue delivery candidates: %s", exc)
            return None

    def claim_delivery(
        self,
        workflow_id: str,
        delivery_id: str,
        lease_owner: str,
    ) -> Optional[dict[str, Any]]:
        """Atomically claim delivery right before sending (PREPARED -> SENDING)."""
        if not self.is_configured():
            return None
        try:
            return self._request(
                "POST",
                "/api/automation/bridge/workflow",
                {
                    "action": "claim_delivery",
                    "workflowId": workflow_id,
                    "deliveryId": delivery_id,
                    "leaseOwner": lease_owner,
                },
            )
        except Exception as exc:
            logger.warning("Could not claim delivery %s: %s", delivery_id, exc)
            return None

    def record_delivery_outcome(
        self,
        delivery_id: str,
        state: str,
        gmail_sent_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Record outcome (SENT, HELD, UNKNOWN, SUPPRESSED) in durable ledger."""
        if not self.is_configured():
            return None
        try:
            return self._request(
                "POST",
                "/api/automation/bridge/workflow",
                {
                    "action": "record_outcome",
                    "deliveryId": delivery_id,
                    "state": state,
                    "gmailSentId": gmail_sent_id,
                    "errorMessage": error_message,
                },
            )
        except Exception as exc:
            logger.warning("Could not record delivery outcome for %s: %s", delivery_id, exc)
            return None

    def complete_delivery_cleanup(self, delivery_id: str) -> Optional[dict[str, Any]]:
        """Record completed label cleanup (SENT -> CLEANED)."""
        if not self.is_configured():
            return None
        try:
            return self._request(
                "POST",
                "/api/automation/bridge/workflow",
                {
                    "action": "complete_cleanup",
                    "deliveryId": delivery_id,
                },
            )
        except Exception as exc:
            logger.warning("Could not record completed cleanup for %s: %s", delivery_id, exc)
            return None


    def _request(self, method: str, path: str, body: Optional[dict[str, Any]] = None):
        url = f"{self.base_url}{path}"
        data = None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc


def render_template(template: str, values: dict[str, Any]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace("{" + key + "}", str(value or ""))
    return rendered
