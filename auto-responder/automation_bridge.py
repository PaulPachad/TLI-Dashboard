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

    def is_configured(self) -> bool:
        return bool(self.base_url and self.token)

    def get_config(self, force: bool = False) -> Optional[BridgeConfig]:
        if not self.is_configured():
            return None

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
            logger.warning("SaaS bridge config unavailable; using local defaults: %s", exc)
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
