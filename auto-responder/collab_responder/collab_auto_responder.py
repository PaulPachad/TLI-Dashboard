"""
Authority Magazine - Collaboration Team Auto Responder

Monitors articlecollaborationteam@gmail.com for pitches arriving from
HARO, SOS, Qwoted and similar media-request platforms.

For each new pitch it:
  1. Reads the pitch body
  2. Uses CollabFormMatcher to find the best matching Google Form
  3. Creates a draft reply with the form link inserted

This module mirrors the structure of auto_responder.py for consistency.
"""

import os
import re
import sys
import time
import logging

# Ensure parent directory is on path
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from collab_responder.collab_form_matcher import CollabFormMatcher
from collab_responder.collab_email_generator import CollabEmailGenerator
from collab_responder.collab_gmail_client import CollabGmailClient
from gmail_client import InteractionRequiredError
from automation_bridge import AutomationBridge

logger = logging.getLogger(__name__)

# How often to check the collab inbox (seconds)
COLLAB_CHECK_INTERVAL = 120  # 2 minutes

# Gmail search query for pitches in the collab inbox.
# Broad: everything unread in the inbox. Thread-based deduplication prevents
# re-processing emails that already have a draft.
COLLAB_SEARCH_QUERY = "in:inbox is:unread"

# Maximum emails to examine per check cycle
COLLAB_MAX_RESULTS = 30


class CollabAutoResponder:
    """
    Auto-responder for the articlecollaborationteam@gmail.com inbox.
    Handles HARO, SOS, Qwoted and similar pitch sources.
    """

    def __init__(self):
        self.matcher = CollabFormMatcher()
        self.email_generator = CollabEmailGenerator()
        self.gmail = CollabGmailClient()
        self.bridge = AutomationBridge(token=os.getenv("AUTHORITY_COLLAB_BRIDGE_TOKEN"))
        self.max_emails_per_run = COLLAB_MAX_RESULTS
        self._sync_bridge_config(force=True)
        logger.info(
            f"[CollabAutoResponder] Initialised with "
            f"{self.matcher.count()} form entries"
        )

    def _sync_bridge_config(self, force: bool = False):
        """Pull SaaS-managed collab settings/templates when configured."""
        config = self.bridge.get_config(force=force)
        if not config:
            return None

        profile = config.profile
        self.max_emails_per_run = int(profile.get("maxEmailsPerRun") or self.max_emails_per_run)

        acceptance = config.template("collab_acceptance")
        if acceptance and acceptance.get("body"):
            self.email_generator.ACCEPTANCE_TEMPLATE = acceptance["body"]

        no_match = config.template("collab_no_match")
        if no_match and no_match.get("body"):
            self.email_generator.NO_MATCH_TEMPLATE = no_match["body"]

        return config

    def _bridge_log(self, **entry):
        try:
            self.bridge.post_log(entry)
        except Exception as e:
            logger.debug(f"[CollabAutoResponder] Bridge log skipped: {e}")

    # ------------------------------------------------------------------
    # Email classification helpers
    # ------------------------------------------------------------------

    def _is_short_acknowledgment(self, body: str) -> bool:
        """Return True if the email body looks like a one-line thanks/ack."""
        if not body:
            return True

        lines = body.split("\n")
        message_lines = []
        for line in lines:
            line_strip = line.strip()
            # Stop at quoted/thread history
            if re.search(r"^\s*(On|From|Sent|To|Subject):", line_strip, re.IGNORECASE):
                break
            if line_strip.startswith(">"):
                continue
            if line_strip in ("--", "___"):
                break
            message_lines.append(line_strip)

        message_content = " ".join(message_lines).strip()
        message_lower   = message_content.lower()

        # Very short AND contains acknowledgment phrasing
        ack_phrases = [
            r"^\s*thanks[!\.]*$",
            r"^\s*thank you[!\.]*$",
            r"^\s*got it[!\.]*$",
            r"^\s*confirmed[!\.]*$",
            r"^\s*sounds (great|good)[!\.]*$",
            r"^\s*perfect[!\.]*$",
            r"thanks\s+so\s+much",
            r"thank\s+you\s+for\s+your\s+response",
            r"thank\s+you\s+for\s+getting\s+back",
            r"received[!\.]*$",
        ]

        if len(message_content) < 200:
            for phrase in ack_phrases:
                if re.search(phrase, message_lower, re.IGNORECASE):
                    return True
        return False

    # ------------------------------------------------------------------
    # Core processing
    # ------------------------------------------------------------------

    def _get_clean_body(self, body: str) -> str:
        """Strip quoted history, forwards, signatures, etc."""
        if not body:
            return ""
        lines = body.split('\n')
        message_lines = []
        for line in lines:
            line_strip = line.strip()
            # Stop at standard headers or forwarded headers
            if re.search(r'^\s*(On|From|Sent|To|Subject):', line_strip, re.IGNORECASE):
                break
            # Skip quoted lines
            if line_strip.startswith('>'):
                continue
            if line_strip == '--' or line_strip == '___':
                break
            message_lines.append(line_strip)
        return ' '.join(message_lines).strip()

    def process_pitch(self, msg_id: str, subject: str, sender: str) -> bool:
        """
        Process a single collab pitch email.

        Returns True if a draft was created successfully.
        """
        subject = subject or ""
        logger.info(f"[CollabAutoResponder] Processing: {subject[:80]}")

        # Ignore HARO query scheduled notifications
        if "your haro query has been scheduled" in subject.lower():
            logger.info(
                f"[CollabAutoResponder] Ignoring HARO query scheduled notification: '{subject}'"
            )
            # Mark it as read so it isn't repeatedly processed
            self.gmail.mark_as_read(msg_id)
            return False

        # Fetch full email content
        content = self.gmail.get_message_content(msg_id)
        if not content:
            logger.error(f"[CollabAutoResponder] Could not retrieve body for {msg_id}")
            return False

        # Skip short acknowledgment emails (replies that are just "thanks")
        if self._is_short_acknowledgment(content):
            logger.info(
                f"[CollabAutoResponder] Skipping short ack: '{subject[:40]}...'"
            )
            return False

        # Get thread details for in-thread reply threading
        msg_details = self.gmail.get_message_details(msg_id)
        thread_id         = msg_details.get("threadId")        if msg_details else None
        message_id_header = msg_details.get("messageIdHeader") if msg_details else None

        # Determine reply-to address
        reply_to_header = msg_details.get("replyTo") if msg_details else None
        target_sender = reply_to_header if reply_to_header else sender
        if "<" in target_sender:
            reply_to = target_sender.split("<")[1].strip(">").strip()
        else:
            reply_to = target_sender

        # ------------------------------------------------------------------
        # Prepend the subject to the first 1000 characters of the clean body.
        # This focuses the matcher on where the topic is actually discussed,
        # ignoring forwarded newsletters or email history.
        clean_content = self._get_clean_body(content)
        body_intro = clean_content[:1000] if clean_content else ""
        match_text = f"{subject}\n\n{body_intro}"
        matches = self.matcher.find_best_match(match_text, top_n=1)

        if matches:
            best = matches[0]
            logger.info(
                f"[CollabAutoResponder]  Matched: '{best.entry.topic}' "
                f"({best.score:.0f}%, {best.match_type})"
            )
            email = self.email_generator.generate_acceptance_email(
                topic_name=best.entry.topic,
                form_url=best.entry.form_url,
                original_subject=subject,
            )
        else:
            logger.info(
                f"[CollabAutoResponder]  No match above threshold — using fallback"
            )
            email = self.email_generator.generate_no_match_email(
                original_subject=subject
            )

        # ------------------------------------------------------------------
        # Create draft
        # ------------------------------------------------------------------
        draft = self.gmail.create_draft(
            to=reply_to,
            subject=email.subject,
            body=email.body,
            thread_id=thread_id,
            message_id=message_id_header,
        )

        if draft:
            logger.info(f"[CollabAutoResponder]  Draft created successfully!")
            if hasattr(self.gmail, "invalidate_draft_cache"):
                self.gmail.invalidate_draft_cache()
            best_match = matches[0] if matches else None
            self._bridge_log(
                status="DRAFT_CREATED",
                workflowType="COLLAB_RESPONDER",
                recipient=reply_to,
                subject=email.subject,
                gmailThreadId=thread_id,
                gmailMessageId=message_id_header,
                matchedTopic=best_match.entry.topic if best_match else None,
                matchedUrl=best_match.entry.form_url if best_match else None,
                matchScore=int(best_match.score) if best_match else None,
                templateKey="collab_acceptance" if best_match else "collab_no_match",
                snippet=content[:500],
            )
            return True
        else:
            logger.error(f"[CollabAutoResponder]  Failed to create draft")
            return False

    # ------------------------------------------------------------------
    # Inbox check loop
    # ------------------------------------------------------------------

    def check_inbox(self):
        """Check the collab inbox for new pitch emails."""
        logger.info("[CollabAutoResponder] Checking collab inbox...")

        try:
            bridge_config = self._sync_bridge_config()
            if bridge_config and not bridge_config.enabled:
                logger.info("[CollabAutoResponder] SaaS bridge has collab responder paused.")
                self.bridge.post_status(
                    auth_status="OK",
                    bridge_status="PAUSED",
                    run={
                        "status": "SKIPPED",
                        "emailsScanned": 0,
                        "draftsCreated": 0,
                        "skippedCount": 0,
                        "summary": "Collab responder paused in SaaS admin.",
                    },
                )
                return

            messages = self.gmail.list_messages(
                query=COLLAB_SEARCH_QUERY,
                max_results=self.max_emails_per_run,
            )
        except Exception as e:
            logger.error(f"[CollabAutoResponder] Error listing messages: {e}")
            self.bridge.post_status(
                auth_status="ERROR",
                bridge_status="ERROR",
                last_error=str(e),
                run={"status": "FAILED", "errorCount": 1, "summary": str(e)},
            )
            raise

        new_count = 0
        skipped_count = 0
        for msg in messages:
            # Get thread ID for deduplication
            try:
                msg_details = self.gmail.get_message_details(msg["id"])
                thread_id = msg_details.get("threadId") if msg_details else None
            except Exception:
                thread_id = None

            # Skip threads that already have a draft
            if thread_id and self.gmail.thread_has_draft(thread_id):
                logger.info(
                    f"[CollabAutoResponder] Skipping (already has draft): "
                    f"{msg.get('subject', '')[:50]}"
                )
                skipped_count += 1
                continue

            try:
                success = self.process_pitch(
                    msg_id=msg["id"],
                    subject=msg.get("subject", ""),
                    sender=msg.get("sender", ""),
                )
                if success:
                    new_count += 1
            except Exception as e:
                logger.error(
                    f"[CollabAutoResponder] Error processing message {msg['id']}: {e}"
                )

        if new_count > 0:
            logger.info(f"[CollabAutoResponder] Created {new_count} draft(s)")
        else:
            logger.info("[CollabAutoResponder] No new pitches to process")

        self.bridge.post_status(
            auth_status="OK",
            bridge_status="CONNECTED",
            run={
                "status": "SUCCESS",
                "emailsScanned": len(messages),
                "draftsCreated": new_count,
                "skippedCount": skipped_count,
                "summary": f"Collab responder checked {len(messages)} message(s).",
            },
        )

    def run(self):
        """Run the collab auto-responder as a standalone service (for testing)."""
        logger.info("=" * 50)
        logger.info("Collab Auto Responder Started")
        logger.info(f"Monitoring: articlecollaborationteam@gmail.com")
        logger.info(f"Checking every {COLLAB_CHECK_INTERVAL} seconds")
        logger.info("Press Ctrl+C to stop")
        logger.info("=" * 50)

        if not self.gmail.is_configured():
            logger.error(
                "Collab credentials not configured. "
                "Please see COLLAB_SETUP.md for setup instructions."
            )
            return

        try:
            self.gmail.authenticate()
            logger.info(f"Authenticated as: {self.gmail.user_email}")
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return

        consecutive_errors = 0
        MAX_CONSECUTIVE_ERRORS = 3

        while True:
            try:
                self.check_inbox()
                consecutive_errors = 0
            except KeyboardInterrupt:
                logger.info("[CollabAutoResponder] Shutting down...")
                break
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"[CollabAutoResponder] Loop error ({consecutive_errors}): {e}")
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    logger.info("[CollabAutoResponder] Resetting Gmail connection...")
                    try:
                        self.gmail = CollabGmailClient()
                        self.gmail.authenticate(interactive=False)
                        consecutive_errors = 0
                    except Exception as auth_err:
                        logger.error(f"[CollabAutoResponder] Re-auth failed: {auth_err}")

            time.sleep(COLLAB_CHECK_INTERVAL)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )
    responder = CollabAutoResponder()
    responder.run()
