"""
Unit tests for the Daily Generic Response Autoresponder and Bridge Hardening.
"""

import os
import sys
import time
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from generic_responder import (
    GENERIC_RESPONSE_BODY,
    GENERIC_RESPONSE_SUBJECT_FALLBACK,
    GenericAutoResponder,
    EditorGmailClient,
    DEFAULT_TIMEZONE,
)
from automation_bridge import AutomationBridge, BridgeConfig


class TestGenericResponder(unittest.TestCase):
    def configured_worker(self):
        bridge = MagicMock(spec=AutomationBridge)
        wf = {"id": "wf", "key": "GENERIC_RESPONSE", "enabled": True,
              "mode": "SEND", "queueLabelId": "queue"}
        bridge.get_config.return_value = BridgeConfig(
            enabled=True, profile={}, mailbox={"workflows": [wf]},
            templates={}, suppressions=[], fetched_at=time.time())
        bridge.claim_workflow_run.return_value = {
            "workflow": {"id": "wf", "active": True}, "run": {"id": "run"}}
        gmail = MagicMock()
        gmail.user_email = "editor@authoritymag.co"
        gmail._format_plain_body.return_value = "Test reply"
        gmail._format_html_body.return_value = "<p>Test reply</p>"
        worker = GenericAutoResponder(bridge=bridge, gmail_client=gmail)
        worker.is_due = MagicMock(return_value=(True, "2026-09-16"))
        worker.fetch_queued_messages = MagicMock(return_value=[{"id": "m", "threadId": "t"}])
        worker.inspect_thread = MagicMock(return_value={"eligible": True,
            "anchorInboundId": "m", "recipient": "pitch@example.com", "subject": "Re: Pitch",
            "sourceMessageIds": ["m"], "rfcMessageId": "<original@example.com>"})
        return worker, bridge, gmail

    def test_config_outage_clears_previous_enabled_state(self):
        worker, bridge, gmail = self.configured_worker()
        worker.sync_config()
        bridge.get_config.return_value = None
        self.assertEqual(worker.process_queue()["status"], "CONFIG_UNAVAILABLE")
        self.assertFalse(worker.is_enabled)
        gmail.authenticate.assert_not_called()

    def test_wrong_mailbox_never_sends(self):
        worker, bridge, gmail = self.configured_worker()
        gmail.user_email = "support@authoritymag.co"
        self.assertEqual(worker.process_queue()["status"], "WRONG_MAILBOX")
        bridge.claim_workflow_run.assert_not_called()

    def test_missing_ledger_or_rejected_claim_never_sends(self):
        for deliveries in [[], [{"id": "d", "gmailThreadId": "t"}]]:
            worker, bridge, gmail = self.configured_worker()
            bridge.enqueue_delivery_candidates.return_value = {"deliveries": deliveries}
            bridge.claim_delivery.return_value = {"error": "Already sent"}
            worker.process_queue()
            gmail.service.users().messages().send.assert_not_called()

    def test_confirmed_send_records_then_cleans(self):
        worker, bridge, gmail = self.configured_worker()
        bridge.enqueue_delivery_candidates.return_value = {"deliveries": [{"id": "d", "gmailThreadId": "t"}]}
        bridge.claim_delivery.return_value = {"success": True}
        bridge.record_delivery_outcome.return_value = {"success": True}
        gmail.service.users().messages().send().execute.return_value = {"id": "sent"}
        gmail.service.users().messages().send.reset_mock()
        self.assertEqual(worker.process_queue()["sent"], 1)
        bridge.claim_delivery.assert_called_once_with("wf", "d", worker.worker_id)
        bridge.record_delivery_outcome.assert_called_once_with("d", state="SENT", gmail_sent_id="sent")
        bridge.complete_delivery_cleanup.assert_called_once_with("d")

    def test_failed_scan_is_not_empty_success(self):
        worker, bridge, gmail = self.configured_worker()
        del worker.fetch_queued_messages
        gmail.service.users().messages().list().execute.side_effect = RuntimeError("Gmail unavailable")
        with self.assertRaises(RuntimeError):
            worker.process_queue()
        self.assertIsNone(worker._last_processed_date)

    def test_generic_response_body_fixture_integrity(self):
        """Verify the exact required copy and all 4 links are present in GENERIC_RESPONSE_BODY."""
        self.assertIn("Hi There!", GENERIC_RESPONSE_BODY)
        self.assertIn("Yitzi Weiner", GENERIC_RESPONSE_BODY)
        self.assertIn("Editor-In-Chief", GENERIC_RESPONSE_BODY)
        self.assertIn("Authority Magazine", GENERIC_RESPONSE_BODY)

        # 4 Required URLs
        self.assertIn(
            "https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753",
            GENERIC_RESPONSE_BODY,
        )
        self.assertIn(
            "https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4",
            GENERIC_RESPONSE_BODY,
        )
        self.assertIn(
            "https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot",
            GENERIC_RESPONSE_BODY,
        )
        self.assertIn(
            "https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform",
            GENERIC_RESPONSE_BODY,
        )

    def test_schedule_check_dst_aware(self):
        """Verify scheduler detects 10:00 AM America/New_York correctly."""
        bridge = MagicMock(spec=AutomationBridge)
        bridge.get_config.return_value = None
        responder = GenericAutoResponder(bridge=bridge, gmail_client=MagicMock())
        responder.schedule_hour = 10
        responder.schedule_minute = 0
        responder.timezone_str = "America/New_York"

        # Mock 10:00 AM NY
        dt_10am = datetime(2026, 9, 15, 10, 0, 0, tzinfo=ZoneInfo("America/New_York"))
        with patch("generic_responder.datetime") as mock_dt:
            mock_dt.now.return_value = dt_10am
            is_due, dt_str = responder.is_due()
            self.assertTrue(is_due)
            self.assertEqual(dt_str, "2026-09-15")

        # Mock 9:55 AM NY (before scheduled time)
        dt_955am = datetime(2026, 9, 15, 9, 55, 0, tzinfo=ZoneInfo("America/New_York"))
        with patch("generic_responder.datetime") as mock_dt:
            mock_dt.now.return_value = dt_955am
            is_due, _ = responder.is_due()
            self.assertFalse(is_due)

    def test_inspect_thread_human_replied_guard(self):
        """Verify inspect_thread rejects threads where human/editor already sent a reply."""
        bridge = MagicMock(spec=AutomationBridge)
        bridge.get_config.return_value = None
        mock_gmail = MagicMock()
        mock_gmail.user_email = "editor@authoritymag.co"
        mock_gmail.thread_has_draft.return_value = False
        mock_gmail.service.users().threads().get(userId='me', id='thread_1').execute.return_value = {
            "messages": [
                {
                    "id": "msg1",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "pitcher@example.com"},
                            {"name": "Subject", "value": "Pitch Idea"},
                            {"name": "Message-ID", "value": "<msg1@example.com>"},
                        ]
                    },
                    "labelIds": ["INBOX"],
                },
                {
                    "id": "msg2",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "editor@authoritymag.co"},
                            {"name": "Subject", "value": "Re: Pitch Idea"},
                        ]
                    },
                    "labelIds": ["SENT"],
                },
            ]
        }
        responder = GenericAutoResponder(bridge=bridge, gmail_client=mock_gmail)

        result = responder.inspect_thread("thread_1", ["msg1"])
        self.assertFalse(result["eligible"])
        self.assertEqual(result["reason"], "HUMAN_REPLIED")

    def test_inspect_thread_human_draft_guard(self):
        """Verify inspect_thread rejects threads where a draft already exists."""
        bridge = MagicMock(spec=AutomationBridge)
        bridge.get_config.return_value = None
        mock_gmail = MagicMock()
        mock_gmail.user_email = "editor@authoritymag.co"
        mock_gmail.thread_has_draft.return_value = True
        mock_gmail.service.users().threads().get(userId='me', id='thread_1').execute.return_value = {
            "messages": [
                {
                    "id": "msg1",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "pitcher@example.com"},
                            {"name": "Subject", "value": "Pitch Idea"},
                            {"name": "Message-ID", "value": "<msg1@example.com>"},
                        ]
                    },
                    "labelIds": ["INBOX"],
                }
            ]
        }
        responder = GenericAutoResponder(bridge=bridge, gmail_client=mock_gmail)

        result = responder.inspect_thread("thread_1", ["msg1"])
        self.assertFalse(result["eligible"])
        self.assertEqual(result["reason"], "HUMAN_DRAFT_EXISTS")

    def test_inspect_thread_blocked_sender(self):
        """Verify inspect_thread blocks suppressed senders and domains."""
        bridge = MagicMock(spec=AutomationBridge)
        bridge.get_config.return_value = None
        mock_gmail = MagicMock()
        mock_gmail.user_email = "editor@authoritymag.co"
        mock_gmail.thread_has_draft.return_value = False
        mock_gmail.service.users().threads().get(userId='me', id='thread_1').execute.return_value = {
            "messages": [
                {
                    "id": "msg1",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "Spammer <spammer@blocked.com>"},
                            {"name": "Subject", "value": "Cold Pitch"},
                        ]
                    },
                    "labelIds": ["INBOX"],
                }
            ]
        }
        responder = GenericAutoResponder(bridge=bridge, gmail_client=mock_gmail)
        responder.blocked_domains = ["blocked.com"]

        result = responder.inspect_thread("thread_1", ["msg1"])
        self.assertFalse(result["eligible"])
        self.assertIn("Blocked domain", result["reason"])

    def test_inspect_thread_eligible_pitch(self):
        """Verify inspect_thread approves a clean queued message and formats subject with Re:."""
        bridge = MagicMock(spec=AutomationBridge)
        bridge.get_config.return_value = None
        mock_gmail = MagicMock()
        mock_gmail.user_email = "editor@authoritymag.co"
        mock_gmail.thread_has_draft.return_value = False
        mock_gmail.service.users().threads().get(userId='me', id='thread_1').execute.return_value = {
            "messages": [
                {
                    "id": "msg1",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "Publicist Jane <jane@prfirm.com>"},
                            {"name": "Subject", "value": "Pitch: Female Tech Founders 2026"},
                            {"name": "Message-ID", "value": "<inbound_123@prfirm.com>"},
                        ]
                    },
                    "labelIds": ["INBOX", "QUEUE_LABEL"],
                }
            ]
        }
        responder = GenericAutoResponder(bridge=bridge, gmail_client=mock_gmail)

        result = responder.inspect_thread("thread_1", ["msg1"])
        self.assertTrue(result["eligible"])
        self.assertEqual(result["recipient"], "jane@prfirm.com")
        self.assertEqual(result["subject"], "Re: Pitch: Female Tech Founders 2026")
        self.assertEqual(result["threadId"], "thread_1")


class TestBridgeHardening(unittest.TestCase):
    def test_bridge_cache_stale_invalidation(self):
        """Verify bridge config cache expires after _config_max_stale_seconds."""
        bridge = AutomationBridge(base_url="http://localhost:3000", token="test_tok")
        fake_config = BridgeConfig(
            enabled=True,
            profile={"isEnabled": True, "configVersion": 1},
            mailbox={},
            templates={},
            suppressions=[],
            fetched_at=time.time() - 350.0,
        )
        bridge._config = fake_config
        bridge._config_time = time.time() - 350.0  # Older than 300s

        # With network failure, it returns None when stale
        with patch.object(bridge, "_request", return_value=None):
            cfg = bridge.get_config()
            self.assertIsNone(cfg, "Stale cache older than 300s must be invalidated")

    def test_bridge_template_enabled_check(self):
        """Verify is_template_enabled returns False when template is disabled in SaaS."""
        cfg = BridgeConfig(
            enabled=True,
            profile={"isEnabled": True},
            mailbox={},
            templates={
                "generic_response": {"enabled": False},
                "pitch_acceptance": {"enabled": True},
            },
            suppressions=[],
            fetched_at=time.time(),
        )
        self.assertFalse(cfg.is_template_enabled("generic_response"))
        self.assertTrue(cfg.is_template_enabled("pitch_acceptance"))
        self.assertTrue(cfg.is_template_enabled("unknown_template"))  # Default true if not listed


if __name__ == "__main__":
    unittest.main()
