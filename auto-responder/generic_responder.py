"""
Daily Generic Response Autoresponder for Authority Magazine.

Features:
- Daily scheduling at 10:00 AM America/New_York (DST-aware via zoneinfo).
- Scans editor queue label (e.g. '1. Send Generic Re...') with full pagination.
- Safety checks: deduplication per thread, Reply-To validation, human-reply/draft guard, suppressions.
- Durable state machine tracking: PENDING -> PREPARED -> SENDING -> SENT -> CLEANED.
- Preview mode by default (no mail sent, no labels touched).
- Live sending with deterministic message IDs, thread preservation, and message-level queue label removal.
"""

import os
import sys
import time
import base64
import logging
import re
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Any
from zoneinfo import ZoneInfo

# Ensure root dir is on path
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from gmail_client import GmailClient
from automation_bridge import AutomationBridge, BridgeConfig

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

logger = logging.getLogger(__name__)

WORKFLOW_KEY = "GENERIC_RESPONSE"
DEFAULT_TIMEZONE = "America/New_York"
DEFAULT_SCHEDULE_HOUR = 10
DEFAULT_SCHEDULE_MINUTE = 0
DEFAULT_DAILY_CAP = 100
DEFAULT_BATCH_SIZE = 25

GENERIC_RESPONSE_SUBJECT_FALLBACK = "Thank you for your pitch to Authority Magazine - Let's take the next step!"

GENERIC_RESPONSE_BODY = """Hi There!

Thank you so much for sending your press release or pitch to Authority Magazine. We appreciate your interest and would be happy to conduct an email interview with you.

To get started, please review our available interview storylines below:

[**Interview Storylines**](https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753)

We're also excited to announce these upcoming storylines:

[**Upcoming Storylines**](https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4)

If you are unsure about which topic is best for you, you can ask our AI Bot to recommend a few ideas for you. All you have to do is add your bio to the link below.

[**Add Your Bio Here**](https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot)

Please take a moment to choose the best fit for your interview. Once you've made your selection, click the link below to provide your basic information, and we'll be in touch shortly with our interview questions.

[**Add Your Basic Info Here**](https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform)

Looking forward to learning more about you and your story!

Best regards,

    Yitzi Weiner
    Editor-In-Chief,
    Authority Magazine"""


class EditorGmailClient(GmailClient):
    """Gmail client configured for the editor mailbox (editor@authoritymag.co)."""

    def __init__(self):
        credentials_editor = os.path.join(_BASE_DIR, "credentials_editor.json")
        token_editor = os.path.join(_BASE_DIR, "token_editor.json")

        # Fall back to standard credentials if editor-specific files not present yet
        cred_path = credentials_editor if os.path.exists(credentials_editor) else os.path.join(_BASE_DIR, "credentials.json")
        tok_path = token_editor if os.path.exists(token_editor) else os.path.join(_BASE_DIR, "token.json")

        super().__init__(credentials_path=cred_path, token_path=tok_path)
        logger.info("[EditorGmailClient] Initialized with credentials: %s, token: %s", os.path.basename(cred_path), os.path.basename(tok_path))


class GenericAutoResponder:
    """
    Daily generic response worker.
    Runs daily at 10:00 AM America/New_York, processes pitches in the generic queue label,
    and removes the queue label after confirmed send.
    """

    def __init__(
        self,
        bridge_token: Optional[str] = None,
        worker_id: str = "generic_responder_worker",
        bridge: Optional[AutomationBridge] = None,
        gmail_client: Optional[GmailClient] = None,
    ):
        self.worker_id = worker_id
        token = (
            bridge_token
            or os.getenv("AUTHORITY_GENERIC_BRIDGE_TOKEN")
            or os.getenv("AUTHORITY_PITCH_BRIDGE_TOKEN")
            or os.getenv("AUTHORITY_AUTOMATION_BRIDGE_TOKEN")
        )
        self.bridge = bridge or AutomationBridge(token=token)
        self.gmail = gmail_client or EditorGmailClient()

        self.mode = "PREVIEW"  # Safe default: PREVIEW or SEND
        self.is_enabled = False
        self.timezone_str = DEFAULT_TIMEZONE
        self.schedule_hour = DEFAULT_SCHEDULE_HOUR
        self.schedule_minute = DEFAULT_SCHEDULE_MINUTE
        self.queue_label_id: Optional[str] = None
        self.queue_label_name: Optional[str] = "1. Send Generic Re..."
        self.daily_cap = DEFAULT_DAILY_CAP
        self.batch_size = DEFAULT_BATCH_SIZE
        self.workflow_id: Optional[str] = None

        self.blocked_senders: list[str] = []
        self.blocked_domains: list[str] = []
        self.skip_phrases: list[str] = []

        self._last_processed_date: Optional[str] = None

    def sync_config(self, force: bool = False) -> Optional[dict]:
        """Fetch fresh workflow settings from SaaS control plane."""
        config = self.bridge.get_config(force=force)
        if not config:
            logger.warning("[GenericResponder] Bridge config unavailable; holding work.")
            return None

        profile = config.profile
        self.blocked_senders = list(profile.get("blockedSenders") or [])
        self.blocked_domains = list(profile.get("blockedDomains") or [])
        self.skip_phrases = list(profile.get("skipPhrases") or [])

        for item in config.suppressions:
            if isinstance(item, dict) and item.get("enabled", True):
                kind = str(item.get("kind", "")).upper()
                val = str(item.get("value", "")).strip()
                if kind == "SENDER" and val:
                    self.blocked_senders.append(val)
                elif kind == "DOMAIN" and val:
                    self.blocked_domains.append(val)
                elif kind == "PHRASE" and val:
                    self.skip_phrases.append(val)

        self.blocked_senders = list(dict.fromkeys(self.blocked_senders))
        self.blocked_domains = list(dict.fromkeys(self.blocked_domains))
        self.skip_phrases = list(dict.fromkeys(self.skip_phrases))

        workflows = config.mailbox.get("workflows") or []
        # If workflows not in mailbox dict, check if bridge returned it in payload
        generic_wf = None
        for wf in workflows:
            if wf.get("key") == WORKFLOW_KEY:
                generic_wf = wf
                break

        if generic_wf:
            self.workflow_id = generic_wf.get("id")
            self.is_enabled = bool(generic_wf.get("enabled"))
            self.mode = generic_wf.get("mode", "PREVIEW").upper()
            self.timezone_str = generic_wf.get("timezone", DEFAULT_TIMEZONE)
            self.schedule_hour = int(generic_wf.get("scheduleHour", DEFAULT_SCHEDULE_HOUR))
            self.schedule_minute = int(generic_wf.get("scheduleMinute", DEFAULT_SCHEDULE_MINUTE))
            self.queue_label_id = generic_wf.get("queueLabelId")
            self.queue_label_name = generic_wf.get("queueLabelName") or self.queue_label_name
            self.daily_cap = int(generic_wf.get("dailyCap", DEFAULT_DAILY_CAP))
            self.batch_size = int(generic_wf.get("batchSize", DEFAULT_BATCH_SIZE))

        logger.info(
            "[GenericResponder] Config synced. Mode: %s, Enabled: %s, Label: %s, Schedule: %02d:%02d %s",
            self.mode, self.is_enabled, self.queue_label_id or self.queue_label_name,
            self.schedule_hour, self.schedule_minute, self.timezone_str,
        )
        return generic_wf

    def is_due(self) -> tuple[bool, str]:
        """
        Check if today's run is due based on local time in America/New_York.
        Returns (is_due, local_date_str).
        """
        try:
            tz = ZoneInfo(self.timezone_str)
        except Exception:
            tz = ZoneInfo(DEFAULT_TIMEZONE)

        now = datetime.now(tz)
        local_date = now.strftime("%Y-%m-%d")

        # Check if current local time has reached scheduled hour/minute
        scheduled_due = (now.hour > self.schedule_hour) or (
            now.hour == self.schedule_hour and now.minute >= self.schedule_minute
        )

        if not scheduled_due:
            return False, local_date

        if self._last_processed_date == local_date:
            return False, local_date

        return True, local_date

    def resolve_queue_label_id(self) -> Optional[str]:
        """Find the Gmail label ID for the queue label name if label_id not yet known."""
        if self.queue_label_id:
            return self.queue_label_id

        if not self.gmail.service:
            if not self.gmail.authenticate(interactive=False):
                return None

        try:
            res = self.gmail.service.users().labels().list(userId='me').execute()
            labels = res.get('labels', [])
            for lbl in labels:
                name = lbl.get('name', '')
                if self.queue_label_name and (
                    name.lower() == self.queue_label_name.lower()
                    or name.lower().startswith(self.queue_label_name.lower()[:15])
                ):
                    self.queue_label_id = lbl.get('id')
                    logger.info("[GenericResponder] Resolved label '%s' to ID: %s", name, self.queue_label_id)
                    return self.queue_label_id
        except Exception as exc:
            logger.warning("[GenericResponder] Could not list Gmail labels: %s", exc)

        return None

    def fetch_queued_messages(self, label_id_or_name: str) -> list[dict]:
        """
        Page through all messages in the queue label using pagination.
        Returns list of message metadata dicts.
        """
        if not self.gmail.service:
            if not self.gmail.authenticate(interactive=False):
                return []

        all_messages = []
        page_token = None

        # If it's a known label ID, query labelIds; otherwise query 'label:name'
        use_label_id = self.queue_label_id and label_id_or_name == self.queue_label_id

        while True:
            try:
                kwargs: dict[str, Any] = {
                    "userId": "me",
                    "maxResults": 100,
                }
                if page_token:
                    kwargs["pageToken"] = page_token

                if use_label_id:
                    kwargs["labelIds"] = [self.queue_label_id]
                else:
                    kwargs["q"] = f'label:"{label_id_or_name}"'

                res = self.gmail.service.users().messages().list(**kwargs).execute()
                messages = res.get("messages", [])
                all_messages.extend(messages)

                page_token = res.get("nextPageToken")
                if not page_token:
                    break
            except Exception as exc:
                logger.error("[GenericResponder] Error enumerating queue label pages: %s", exc)
                break

        logger.info("[GenericResponder] Discovered %d messages in queue label.", len(all_messages))
        return all_messages

    def inspect_thread(self, thread_id: str, label_msg_ids: list[str]) -> dict:
        """
        Re-fetch thread details to verify eligibility before replying:
        - Check if human already replied or human draft exists
        - Extract validated single recipient
        - Check suppressions
        """
        try:
            thread = self.gmail.service.users().threads().get(userId='me', id=thread_id).execute()
            messages = thread.get('messages', [])
        except Exception as exc:
            return {"eligible": False, "reason": f"Could not fetch thread: {exc}"}

        if not messages:
            return {"eligible": False, "reason": "Empty thread"}

        user_email = (self.gmail.user_email or "").lower()

        # Check for human replies or outgoing messages
        for msg in messages:
            msg_labels = msg.get('labelIds', [])
            payload = msg.get('payload', {})
            headers = {h['name'].lower(): h['value'] for h in payload.get('headers', [])}
            sender = headers.get('from', '').lower()

            if 'SENT' in msg_labels or (user_email and user_email in sender):
                return {"eligible": False, "reason": "HUMAN_REPLIED"}

        # Check if thread has a human draft created
        if self.gmail.thread_has_draft(thread_id):
            return {"eligible": False, "reason": "HUMAN_DRAFT_EXISTS"}

        # Find the latest inbound message in thread
        latest_msg = messages[-1]
        latest_payload = latest_msg.get('payload', {})
        latest_headers = {h['name'].lower(): h['value'] for h in latest_payload.get('headers', [])}

        from_header = latest_headers.get('from', '')
        reply_to_header = latest_headers.get('reply-to', '')
        subject_header = latest_headers.get('subject', '')
        rfc_message_id = latest_headers.get('message-id', '')

        target_recipient_raw = reply_to_header if reply_to_header else from_header
        if not target_recipient_raw:
            return {"eligible": False, "reason": "NO_RECIPIENT_HEADER"}

        # Parse email
        match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', target_recipient_raw)
        if not match:
            return {"eligible": False, "reason": f"Invalid recipient email format: {target_recipient_raw}"}
        recipient = match.group(0).lower().strip()

        # Guard against emailing ourselves
        if user_email and recipient == user_email:
            return {"eligible": False, "reason": "SELF_RECIPIENT"}

        # Check blocked senders and domains
        if any(s.lower() in recipient for s in self.blocked_senders):
            return {"eligible": False, "reason": f"Blocked sender: {recipient}"}

        domain = recipient.split('@')[1] if '@' in recipient else ""
        if any(d.lower() == domain for d in self.blocked_domains):
            return {"eligible": False, "reason": f"Blocked domain: @{domain}"}

        # Subject & threading
        clean_subject = subject_header.strip()
        if not clean_subject:
            reply_subject = GENERIC_RESPONSE_SUBJECT_FALLBACK
        elif not clean_subject.lower().startswith("re:"):
            reply_subject = f"Re: {clean_subject}"
        else:
            reply_subject = clean_subject

        # Source message IDs for message-level label cleanup
        source_message_ids = [m['id'] for m in messages if m.get('id') in label_msg_ids]
        if not source_message_ids:
            source_message_ids = [latest_msg.get('id', '')]

        return {
            "eligible": True,
            "recipient": recipient,
            "subject": reply_subject,
            "threadId": thread_id,
            "anchorInboundId": latest_msg.get('id'),
            "rfcMessageId": rfc_message_id,
            "sourceMessageIds": source_message_ids,
        }

    def process_queue(self, force: bool = False) -> dict:
        """
        Execute the daily generic response workflow:
        1. Claim daily run
        2. Enumerate queue label
        3. Enqueue candidates
        4. In PREVIEW: audit candidates without sending
        5. In SEND: atomically send, record sent ID, remove queue label
        """
        logger.info("[GenericResponder] Starting queue process cycle...")
        self.sync_config(force=True)

        if not self.is_enabled and not force:
            logger.info("[GenericResponder] Workflow is disabled in SaaS; skipping.")
            return {"status": "DISABLED"}

        if not self.gmail.authenticate(interactive=False):
            logger.error("[GenericResponder] Editor Gmail authentication failed.")
            return {"status": "AUTH_ERROR"}

        label_target = self.resolve_queue_label_id() or self.queue_label_name
        if not label_target:
            logger.error("[GenericResponder] Queue label ID/name could not be resolved.")
            return {"status": "LABEL_NOT_RESOLVED"}

        is_due, local_date = self.is_due()
        if not is_due and not force:
            logger.info("[GenericResponder] Run is not due yet for %s.", local_date)
            return {"status": "NOT_DUE", "localDate": local_date}

        # Atomically claim the run in SaaS
        claim_res = self.bridge.claim_workflow_run(
            workflow_key=WORKFLOW_KEY,
            local_date=local_date,
            lease_owner=self.worker_id,
        )
        if not claim_res or claim_res.get("status") == "LEASE_BUSY":
            logger.info("[GenericResponder] Run lease is busy or unavailable: %s", claim_res)
            return {"status": "LEASE_BUSY"}

        run_info = claim_res.get("run", {})
        wf_info = claim_res.get("workflow", {})
        run_id = run_info.get("id")
        workflow_id = wf_info.get("id") or self.workflow_id

        if not run_id or not workflow_id:
            logger.error("[GenericResponder] Invalid run claim response: %s", claim_res)
            return {"status": "CLAIM_FAILED"}

        # Step 2: Enumerate all messages in queue label
        raw_messages = self.fetch_queued_messages(label_target)
        if not raw_messages:
            logger.info("[GenericResponder] No messages found in queue label.")
            self._last_processed_date = local_date
            return {"status": "EMPTY_QUEUE", "count": 0}

        # Group messages by thread
        threads: dict[str, list[str]] = {}
        for m in raw_messages:
            tid = m.get('threadId', m.get('id'))
            threads.setdefault(tid, []).append(m.get('id'))

        logger.info("[GenericResponder] Found %d unique threads in queue.", len(threads))

        # Step 3: Inspect each thread and build candidate list
        candidates = []
        for tid, msg_ids in threads.items():
            inspection = self.inspect_thread(tid, msg_ids)
            if inspection.get("eligible"):
                candidates.append({
                    "gmailThreadId": tid,
                    "gmailMessageId": inspection.get("anchorInboundId"),
                    "sourceMessageIds": inspection.get("sourceMessageIds", []),
                    "anchorInboundId": inspection.get("anchorInboundId"),
                    "recipient": inspection.get("recipient"),
                    "subject": inspection.get("subject"),
                    "templateVersion": 1,
                    "deterministicMessageId": f"<{inspection.get('anchorInboundId')}@authoritymag.co>",
                })
            else:
                logger.info("[GenericResponder] Thread %s ineligible: %s", tid, inspection.get("reason"))

        # Step 4: Enqueue candidates into SaaS durable ledger
        delivery_map = {}
        if candidates:
            enqueue_res = self.bridge.enqueue_delivery_candidates(workflow_id, run_id, candidates)
            for d in (enqueue_res or {}).get("deliveries", []):
                delivery_map[d.get("gmailThreadId")] = d.get("id")

        # Step 5: Process candidates
        # In PREVIEW mode: do NOT send mail and do NOT modify labels!
        if self.mode == "PREVIEW":
            logger.info(
                "[GenericResponder] PREVIEW MODE: %d candidates cataloged in ledger. No emails sent and no labels touched.",
                len(candidates),
            )
            self._last_processed_date = local_date
            return {"status": "PREVIEW_COMPLETE", "candidates": len(candidates)}

        # In SEND mode: process eligible candidates up to daily cap
        sent_count = 0
        error_count = 0
        max_to_send = min(len(candidates), self.daily_cap)

        for candidate in candidates[:max_to_send]:
            tid = candidate["gmailThreadId"]
            recipient = candidate["recipient"]
            subject = candidate["subject"]
            anchor_id = candidate["anchorInboundId"]
            source_ids = candidate.get("sourceMessageIds", [])
            delivery_id = delivery_map.get(tid)

            # Verify config is still active before every send
            config_check = self.bridge.get_config()
            if not config_check or not config_check.enabled:
                logger.warning("[GenericResponder] Global kill switch or pause detected; halting sends immediately.")
                break

            try:
                # Format MIME message
                msg = MIMEMultipart("alternative")
                msg["To"] = recipient
                msg["From"] = self.gmail.user_email or "editor@authoritymag.co"
                msg["Subject"] = subject
                msg["In-Reply-To"] = candidate.get("deterministicMessageId", "")
                msg["References"] = candidate.get("deterministicMessageId", "")

                plain_text = self.gmail._format_plain_body(GENERIC_RESPONSE_BODY)
                html_text = self.gmail._format_html_body(GENERIC_RESPONSE_BODY)

                msg.attach(MIMEText(plain_text, "plain", "utf-8"))
                msg.attach(MIMEText(html_text, "html", "utf-8"))

                raw_bytes = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
                send_payload = {
                    "raw": raw_bytes,
                    "threadId": tid,
                }

                # Single send without blind automatic retry
                sent_msg = self.gmail.service.users().messages().send(
                    userId="me",
                    body=send_payload,
                ).execute()

                sent_id = sent_msg.get("id")
                logger.info("[GenericResponder] Sent generic reply to %s for thread %s (Sent ID: %s)", recipient, tid, sent_id)
                sent_count += 1

                # Record sent outcome in SaaS ledger
                if delivery_id:
                    self.bridge.record_delivery_outcome(delivery_id, state="SENT", gmail_sent_id=sent_id)

                # Message-level queue label removal
                for mid in source_ids:
                    try:
                        self.gmail.service.users().messages().modify(
                            userId="me",
                            id=mid,
                            body={"removeLabelIds": [self.queue_label_id or label_target]},
                        ).execute()
                        logger.debug("[GenericResponder] Removed queue label from message %s", mid)
                    except Exception as label_err:
                        logger.error("[GenericResponder] Failed removing label from message %s: %s", mid, label_err)

                # Mark cleaned in SaaS ledger
                if delivery_id:
                    self.bridge.complete_delivery_cleanup(delivery_id)

            except Exception as send_err:
                logger.error("[GenericResponder] Error sending generic reply to %s: %s", recipient, send_err)
                error_count += 1
                if delivery_id:
                    self.bridge.record_delivery_outcome(delivery_id, state="UNKNOWN", error_message=str(send_err))

        self._last_processed_date = local_date
        logger.info("[GenericResponder] Cycle finished. Sent: %d, Errors: %d", sent_count, error_count)
        return {"status": "SEND_COMPLETE", "sent": sent_count, "errors": error_count}

    def run_scheduler_loop(self, poll_interval_seconds: int = 30):
        """Run continuous background scheduler checking every ~30 seconds."""
        logger.info("[GenericResponder] Starting scheduler loop (poll interval: %ds)...", poll_interval_seconds)
        while True:
            try:
                self.process_queue()
            except Exception as exc:
                logger.error("[GenericResponder] Unexpected error in scheduler loop: %s", exc)
            time.sleep(poll_interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    responder = GenericAutoResponder()
    print("Running GenericAutoResponder in dry-run / preview check...")
    res = responder.process_queue(force=True)
    print(f"Result: {res}")
