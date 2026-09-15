"""
Authority Magazine Auto Responder - Background Service

Monitors Gmail inbox for pitch emails and automatically creates draft responses
with the correct interview questions link.

Run this script in the background - it will check for new pitches every 2 minutes.
"""

import os
import re
import sys
import time
import json
import logging
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from matcher import TopicMatcher
from email_generator import EmailGenerator
from gmail_client import GmailClient
from correction_tracker import CorrectionTracker
from automation_bridge import AutomationBridge
from pitch_parser import PitchParser, ParsedPitch

# Configure logging - only set up handlers if none exist yet.
# When tray_controller.py imports this module, it will have already configured
# a RotatingFileHandler, so basicConfig becomes a no-op.
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('auto_responder.log'),
            logging.StreamHandler()
        ]
    )
logger = logging.getLogger(__name__)

# How often to check for new emails (seconds)
CHECK_INTERVAL = 120  # 2 minutes


class AutoResponder:
    """Automatic pitch responder service."""
    
    def __init__(self):
        # Auto-rebuild JSON from CSV if CSV is newer (ensures sync on every startup)
        self._ensure_json_synced()
        
        self.matcher = TopicMatcher()
        self.email_generator = EmailGenerator()
        self.gmail = GmailClient()
        self.correction_tracker = CorrectionTracker()
        self.bridge = AutomationBridge(token=os.getenv("AUTHORITY_PITCH_BRIDGE_TOKEN"))
        self.match_threshold = 90
        self.max_matches = 3
        self.max_emails_per_run = 30
        self.blocked_senders: list[str] = []
        self.blocked_domains: list[str] = []
        self.skip_phrases: list[str] = []
        # Set Gmail client for correction tracking (after auth)
        self.correction_tracker.set_gmail_client(self.gmail)
        self._sync_bridge_config(force=True)
        self.sync_learned_rules_to_bridge()
        self.sync_templates_to_bridge()
        
        logger.info(f"AutoResponder initialized with {len(self.matcher.series)} interview series")
    
    def _ensure_json_synced(self):
        """Rebuild JSON from CSV if the CSV has been modified since last rebuild."""
        try:
            import rebuild_database
            csv_path = rebuild_database.get_csv_path()
            base_dir = os.path.dirname(os.path.abspath(__file__))
            json_path = os.path.join(base_dir, 'data', 'interview_series.json')
            
            if not os.path.exists(csv_path):
                logger.warning(f"CSV not found at {csv_path} - using existing JSON")
                return
            
            if not os.path.exists(json_path):
                logger.info("No JSON database found - building from CSV...")
                rebuild_database.build_from_csv()
                return
            
            csv_mtime = os.path.getmtime(csv_path)
            json_mtime = os.path.getmtime(json_path)
            
            if csv_mtime > json_mtime:
                try:
                    with open(json_path, 'r', encoding='utf-8') as jf:
                        json_count = len(json.load(jf))
                    csv_rows = rebuild_database.read_csv_robust(csv_path)
                    csv_count = sum(1 for r in csv_rows if len(r) >= 2 and 'docs.google.com' in r[1])
                    if csv_count < json_count:
                        logger.warning(
                            f"CSV has fewer topics ({csv_count}) than JSON database ({json_count}). "
                            "Preserving JSON database to prevent topic loss."
                        )
                        return
                except Exception as check_err:
                    logger.warning(f"Could not verify CSV topic count: {check_err}")

                logger.info("CSV is newer than JSON - rebuilding database to sync...")
                rebuild_database.build_from_csv()
                logger.info("Database rebuilt successfully from CSV")
            else:
                logger.info("JSON database is up-to-date with CSV")
        except Exception as e:
            logger.warning(f"Auto-rebuild check failed (using existing JSON): {e}")

    def _sync_bridge_config(self, force: bool = False):
        """Pull SaaS-managed settings/templates when the bridge is configured."""
        config = self.bridge.get_config(force=force)
        if not config:
            return None

        profile = config.profile
        self.match_threshold = int(profile.get("matchThreshold") or self.match_threshold)
        self.max_matches = int(profile.get("maxMatches") or self.max_matches)
        self.max_emails_per_run = int(profile.get("maxEmailsPerRun") or self.max_emails_per_run)

        # Safety rules sync from SaaS
        self.blocked_senders = [s.strip().lower() for s in profile.get("blockedSenders", []) if s.strip()]
        self.blocked_domains = [d.strip().lower() for d in profile.get("blockedDomains", []) if d.strip()]
        self.skip_phrases = [p.strip().lower() for p in profile.get("skipPhrases", []) if p.strip()]

        # Suppressions
        for sup in getattr(config, "suppressions", []):
            if sup.get("enabled", True):
                val = str(sup.get("value", "")).strip().lower()
                kind = sup.get("kind", "")
                if kind == "SENDER" and val:
                    self.blocked_senders.append(val)
                elif kind == "DOMAIN" and val:
                    self.blocked_domains.append(val)
                elif kind == "PHRASE" and val:
                    self.skip_phrases.append(val)

        # Deduplicate safety lists
        self.blocked_senders = list(dict.fromkeys(self.blocked_senders))
        self.blocked_domains = list(dict.fromkeys(self.blocked_domains))
        self.skip_phrases = list(dict.fromkeys(self.skip_phrases))

        template_map = {
            "pitch_acceptance": "ACCEPTANCE_TEMPLATE",
            "pitch_no_match": "NO_MATCH_TEMPLATE",
            "pitch_multiple_match": "MULTIPLE_MATCH_TEMPLATE",
            "pitch_extension": "EXTENSION_TEMPLATE",
        }
        for key, attr in template_map.items():
            template = config.template(key)
            if template and template.get("body"):
                setattr(self.email_generator, attr, template["body"])
            elif not config.is_template_enabled(key):
                setattr(self.email_generator, attr, None)

        return config

    def sync_learned_rules_to_bridge(self) -> bool:
        """Push local learned rules to SaaS bridge so they display in Learning & Intelligence."""
        if not self.bridge.is_configured():
            return False
        try:
            local_rules = self.correction_tracker.get_learned_rules()
            if not local_rules:
                return False
            payload = [
                {
                    "originalTopic": r.get("original_topic", ""),
                    "correctTopicName": r.get("correct_topic_name", ""),
                    "correctDocId": r.get("correct_doc_id"),
                    "confidence": r.get("confidence", 1.0),
                }
                for r in local_rules
                if r.get("original_topic") and r.get("correct_topic_name")
            ]
            success = self.bridge.post_learned_rules(payload)
            if success:
                logger.info(f"Successfully synced {len(payload)} learned rules to SaaS control plane")
            return success
        except Exception as e:
            logger.warning(f"Could not sync learned rules to bridge: {e}")
            return False

    def sync_templates_to_bridge(self) -> bool:
        """Push local desktop email templates to SaaS bridge so website matches latest copy."""
        if not self.bridge.is_configured():
            return False
        try:
            templates = [
                {
                    "templateKey": "pitch_acceptance",
                    "name": "Pitch acceptance",
                    "subject": "Authority Magazine - {series_name} Interview Invitation",
                    "body": self.email_generator.ACCEPTANCE_TEMPLATE,
                    "allowedVariables": ["series_name", "interview_link", "signature", "review_note"],
                },
                {
                    "templateKey": "pitch_no_match",
                    "name": "Pitch no match",
                    "subject": "Authority Magazine - Please Select an Interview Series",
                    "body": self.email_generator.NO_MATCH_TEMPLATE,
                    "allowedVariables": ["signature"],
                },
                {
                    "templateKey": "pitch_multiple_match",
                    "name": "Pitch multiple matches",
                    "subject": "Authority Magazine - Interview Invitation",
                    "body": self.email_generator.MULTIPLE_MATCH_TEMPLATE,
                    "allowedVariables": ["series_list", "signature"],
                },
                {
                    "templateKey": "pitch_extension",
                    "name": "Deadline extension",
                    "subject": "Re: {original_subject}",
                    "body": getattr(self.email_generator, "EXTENSION_TEMPLATE", "Sure! :-)"),
                    "allowedVariables": ["original_subject"],
                },
            ]
            success = self.bridge.post_templates(templates)
            if success:
                logger.info("Successfully synced latest desktop templates to SaaS control plane")
            return success
        except Exception as e:
            logger.warning(f"Could not sync templates to bridge: {e}")
            return False

    def _bridge_log(self, **entry):
        """Send a privacy-safe activity entry to the SaaS bridge."""
        try:
            self.bridge.post_log(entry)
        except Exception as e:
            logger.debug(f"Bridge log skipped: {e}")
    
    def check_reload_topics(self):
        """Check for reload flag and hot-reload the topic matcher if needed."""
        flag_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', '.reload_topics')
        
        if os.path.exists(flag_file):
            try:
                # Remove the flag first to prevent repeated reloads
                os.remove(flag_file)
                
                # Reload the matcher module to pick up any code changes as well
                import importlib, matcher
                importlib.reload(matcher)

                # Reload the matcher with fresh data from disk
                logger.info("Hot-reloading topic database (new topics detected)...")
                self.matcher = matcher.TopicMatcher()
                logger.info(f"Reloaded {len(self.matcher.series)} interview series")

                # Re-sync SaaS automation bridge with fresh token from .env
                try:
                    from automation_bridge import AutomationBridge
                    self.bridge = AutomationBridge()
                    if self.bridge.is_configured():
                        self._sync_bridge_config(force=True)
                        self.bridge.post_status(auth_status="OK", bridge_status="CONNECTED")
                        logger.info("Bridge connected to SaaS control plane (https://tli.authoritymag.co)")
                except Exception as bridge_err:
                    logger.warning(f"Bridge hot-reload sync warning: {bridge_err}")
                
            except Exception as e:
                logger.error(f"Error during hot-reload: {e}")

    def check_master_doc_weekly_sync(self):
        """Periodically phone home to Master Google Doc once a week for new topics."""
        sync_flag_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', '.last_master_doc_sync')
        now = time.time()
        one_week_seconds = 7 * 24 * 3600  # 7 days

        last_sync = 0
        if os.path.exists(sync_flag_file):
            try:
                with open(sync_flag_file, 'r', encoding='utf-8') as f:
                    last_sync = float(f.read().strip())
            except Exception:
                last_sync = 0

        if now - last_sync >= one_week_seconds:
            logger.info("Weekly scheduled check: Phoning home to Master Google Doc for latest topics...")
            try:
                from sync_master_doc import sync_topics
                total_live, new_topics = sync_topics(dry_run=False)
                if new_topics:
                    logger.info(f"Weekly phone-home found and added {len(new_topics)} new topics from Master Doc!")
                else:
                    logger.info(f"Weekly phone-home check complete: Database is fully up-to-date with Master Doc ({total_live} topics).")

                with open(sync_flag_file, 'w', encoding='utf-8') as f:
                    f.write(str(now))
            except Exception as e:
                logger.warning(f"Weekly phone-home to Master Doc encountered a temporary issue: {e}")

    def _is_extension_request(self, subject: str, body: str) -> bool:
        """Check if the email is requesting a deadline extension."""
        
        subject = subject or ""
        body = body or ""
        
        # Avoid false positives like "Chrome Extention" or "Domain Extension"
        false_positives = [
            r'\bchrome\s+exten[st]ions?\b',
            r'\bbrowser\s+exten[st]ions?\b',
            r'\bhair\s+exten[st]ions?\b',
            r'\bdomain\s+exten[st]ions?\b'
        ]
        for fp in false_positives:
            if re.search(fp, subject, re.IGNORECASE) or re.search(fp, body, re.IGNORECASE):
                return False

        # 1. Subject explicitly says extension request
        subject_patterns = [
            r'\bdeadline\s+exten[st]ions?\b',
            r'\bexten[st]ions?\s+request\b',
            r'\bneed\s+(an\s+)?exten[st]ions?\b',
            r'\bexten[st]ion\s+on\b',
            r'\binterview\s+exten[st]ion\b',
            r'^\s*(re:\s*)?exten[st]ions?\s*[.!]*$'  # Just the word "Extension" or "Extention"
        ]
        for pattern in subject_patterns:
            if re.search(pattern, subject, re.IGNORECASE):
                return True

        # 2. Check if it's a reply
        is_reply = re.match(r'^\s*(re|fw|fwd)\s*:', subject, re.IGNORECASE) is not None
        
        # Limit body analysis to first 1000 characters to avoid matching old thread history
        body_snippet = body[:1000]
        
        # Guard against acknowledgments (e.g., "Thanks for the extension!")
        ack_patterns = [
            r'thank\s*s?\s*(you)?\s*for\s*(the|an)?\s*exten[st]ion',
            r'received\s*(the|an)?\s*exten[st]ion'
        ]
        for pattern in ack_patterns:
            if re.search(pattern, body_snippet, re.IGNORECASE):
                return False

        # 3. Contextual clues in body
        body_patterns = [
            r'\b(need|request|ask(ing)? for|can i (have|get)|possible to get|may i (have|get))\s+(a|an|some)?\s*exten[st]ions?\b',
            r'\bexten[st]ions?\b.{0,50}\b(deadline)\b', # extension within 50 chars of deadline
            r'\b(deadline)\b.{0,50}\bexten[st]ions?\b'
        ]
        
        # Pitches contain form questions - we want to ensure we don't accidentally intercept a pitch
        is_pitch_form = re.search(r'What is the name of the interview topic|best email to follow up', body_snippet, re.IGNORECASE)
        
        for pattern in body_patterns:
            if re.search(pattern, body_snippet, re.IGNORECASE):
                if not is_pitch_form:
                    return True
                
        # 4. If it's a reply and mentions an extension prominently
        if is_reply and re.search(r'\bexten[st]ions?\b', body_snippet, re.IGNORECASE):
             if not is_pitch_form:
                 # Check for "thanks" nearby to avoid false positives on thanks replies
                 if not re.search(r'thank\s*s?\s*(you)?', body_snippet, re.IGNORECASE):
                    return True

        return False

    def _is_likely_pitch(self, content: str) -> bool:
        """Check if the email content looks like an actual pitch form."""
        if not content:
            return False
            
        # Pitch Signature markers (from the automated form emails)
        markers = [
            r'summary and confirmation of your pitch',
            r'Dear Authority Magazine Editors',
            r'consider me or my client for the following interview topic',
            r'Name and Title of The Interviewee',
            r'Your 200 word pitch',
            r'What is the best email to follow up with you',
            r'What is the name of the interview topic'
        ]
        
        matches = 0
        for marker in markers:
            if re.search(marker, content, re.IGNORECASE):
                matches += 1
                
        # If we have at least 2 markers, it's very likely a pitch
        # (Using 2 because sometimes parts of the form might be missing/truncated)
        return matches >= 2

    def _is_short_acknowledgment(self, body: str) -> bool:
        """Check if the email is just a short 'thanks' or acknowledgment."""
        if not body:
            return True
            
        # 1. Strip quoted text and identify message body (before signatures or thread history)
        lines = body.split('\n')
        message_lines = []
        for line in lines:
            line_strip = line.strip()
            # Stop if we hit common "On ... wrote:" or other thread headers
            if re.search(r'^\s*(On|From|Sent|To|Subject):', line_strip, re.IGNORECASE):
                break
            # Skip quoted lines
            if line_strip.startswith('>'):
                continue
            # Stop if we hit signature markers
            if line_strip == '--' or line_strip == '___':
                break
            message_lines.append(line_strip)
            
        # Join into a single searchable string of the "real" new content
        message_content = ' '.join(message_lines).strip()
        message_lower = message_content.lower()
        
        # Phrases that indicate it's just a response/acknowledgment
        ack_phrases = [
            r'^\s*thanks[!\.]*$',
            r'^\s*thank you[!\.]*$',
            r'^\s*got it[!\.]*$',
            r'^\s*confirmed[!\.]*$',
            r'^\s*will do[!\.]*$',
            r'^\s*received[!\.]*$',
            r'^\s*much appreciated[!\.]*$',
            r'^\s*looks good[!\.]*$',
            r'^\s*sounds (great|good)[!\.]*$',
            r'^\s*perfect[!\.]*$',
            r'^\s*wonderful[!\.]*$',
            r'thanks\s+so\s+much',
            r'thank\s+you\s+for\s+the\s+update',
            r'thank\s+you\s+for\s+letting\s+me\s+know',
            r'thank\s+you\s+very\s+much',
            r'really\s+appreciate\s+it',
            r'thank\s*s?\s*(you)?\s*for\s*(the|an)?\s*exten[st]ion',
            r'thank\s*s?\s*(you)?\s*for\s*(the|an)?\s*acceptance'
        ]

        # If it's a very short message (under 300 chars) we check if the primary sentence matches
        if len(message_content) < 300:
            # Check the first significant line for an acknowledgment
            first_real_line = ""
            for line in message_lines:
                if line.strip():
                    first_real_line = line.strip().lower()
                    break
                    
            for phrase in ack_phrases:
                # Match against the first non-empty line (e.g. "Thank you!"), 
                # or against the whole stripped body (e.g. for "thanks so much")
                if re.search(phrase, first_real_line, re.IGNORECASE) or re.search(phrase, message_lower, re.IGNORECASE):
                    # Don't treat as a simple acknowledgment if there's a question or extension keyword
                    if '?' in message_content or 'exten' in message_lower:
                        return False
                    return True
                    
        return False


    def _extract_reply_email(self, sender: str, body: str, reply_to_header: str = None) -> str:
        """Extract the best email to reply to from the pitch form."""
        
        # Priority: Look for the specific "best email to follow up" field first
        patterns = [
            # specific full question with loose separator (tabs, spaces, newlines, colons)
            r'What is the best email to follow up with you\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            # simplified versions
            r'best email to follow up\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            r'follow up with you\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
        ]
        
        for pattern in patterns:
            # Use DOTALL to allow matching across newlines if needed, though strictly we look for headers
            match = re.search(pattern, body, re.IGNORECASE | re.MULTILINE)
            if match:
                email = match.group(1).strip().lower()
                # Validate it's not an authoritymag email
                if 'authoritymag' not in email:
                    logger.info(f"  Found follow-up email in form: {email}")
                    return email
        
        # Use reply-to header if available
        target_email = reply_to_header if reply_to_header else sender
        if '<' in target_email:
            email = target_email.split('<')[1].strip('>')
        else:
            email = target_email
        
        logger.info(f"  Using fallback email: {email}")
        return email
    
    @staticmethod
    def _matches_skip_phrase(phrase: str, text: str) -> bool:
        """Match a phrase using whole-word boundaries so 'legal' doesn't match 'illegal' and 'confidential' doesn't match 'confidentially'."""
        if not phrase or not text:
            return False
        phrase_clean = phrase.strip().lower()
        if not phrase_clean:
            return False
        pattern = rf'\b{re.escape(phrase_clean)}\b'
        return bool(re.search(pattern, text, re.IGNORECASE))

    def process_pitch(self, msg_id: str, subject: str, sender: str) -> bool:
        """
        Process a single pitch email.
        
        Returns True if draft was created successfully.
        """
        subject = subject or ""
        logger.info(f"Processing: {subject}")
        
        sender_lower = (sender or "").lower()

        # Check safety rules: blocked senders
        for bs in self.blocked_senders:
            if bs in sender_lower:
                logger.info(f"  Skipping: sender '{sender}' is in blocked senders list ({bs})")
                self._bridge_log(
                    status="SKIPPED",
                    workflowType="PITCH_RESPONDER",
                    recipient=sender,
                    subject=subject,
                    reason=f"Blocked sender: {bs}",
                )
                return False

        # Check safety rules: blocked domains
        for bd in self.blocked_domains:
            if bd in sender_lower:
                logger.info(f"  Skipping: sender domain matches blocked domain ({bd})")
                self._bridge_log(
                    status="SKIPPED",
                    workflowType="PITCH_RESPONDER",
                    recipient=sender,
                    subject=subject,
                    reason=f"Blocked domain: {bd}",
                )
                return False

        # Check safety rules: skip phrases in subject (using word boundaries)
        for sp in self.skip_phrases:
            if self._matches_skip_phrase(sp, subject):
                logger.info(f"  Skipping: subject contains skip phrase ({sp})")
                self._bridge_log(
                    status="SKIPPED",
                    workflowType="PITCH_RESPONDER",
                    recipient=sender,
                    subject=subject,
                    reason=f"Skip phrase in subject: {sp}",
                )
                return False

        # Get full email content
        content = self.gmail.get_message_content(msg_id)
        if not content:
            logger.error(f"Failed to get content for {msg_id}")
            return False

        # Get thread details for reply threading
        msg_details = self.gmail.get_message_details(msg_id)
        thread_id = msg_details.get('threadId') if msg_details else None
        message_id_header = msg_details.get('messageIdHeader') if msg_details else None
        reply_to_header = msg_details.get('replyTo') if msg_details else None

        # 1. Determine if this is a structured form based on the email field
        parsed_pitch = PitchParser.parse_pitch(
            email_content=content,
            subject=subject,
            sender=sender,
            reply_to=reply_to_header
        )
        is_pitch_form = parsed_pitch.is_pitch_form or self._is_likely_pitch(content)

        # Check safety rules: skip phrases in body
        # Broad single words like 'legal' or 'confidential' are standard vocabulary in pitch forms
        # (e.g. executives discussing compliance/legal exposure, confidential clients, or agency footers)
        # and must NOT discard a legitimate pitch. They only apply to non-pitch / direct support emails.
        PITCH_FORM_SAFE_EXCLUSIONS = {'legal', 'confidential'}
        for sp in self.skip_phrases:
            sp_clean = sp.strip().lower()
            if is_pitch_form and sp_clean in PITCH_FORM_SAFE_EXCLUSIONS:
                continue

            if self._matches_skip_phrase(sp_clean, content):
                logger.info(f"  Skipping: body contains skip phrase ({sp_clean}) [is_pitch_form={is_pitch_form}]")
                self._bridge_log(
                    status="SKIPPED",
                    workflowType="PITCH_RESPONDER",
                    recipient=sender,
                    subject=subject,
                    reason=f"Skip phrase in body: {sp_clean}",
                )
                return False

        if parsed_pitch.followup_email and 'authoritymag' not in parsed_pitch.followup_email:
            extracted_email = parsed_pitch.followup_email
            logger.info(f"  Found follow-up email in form: {extracted_email}")
        else:
            extracted_email = self._extract_reply_email(sender, content, reply_to_header)
        
        # --- NEW CHECK: Intercept Extension Requests ---
        if parsed_pitch.is_extension or self._is_extension_request(subject, content):
            logger.info("  Detected deadline extension request")
            email = self.email_generator.generate_extension_email()
            
            # Prevent adding double "Re:"
            reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
            
            draft = self.gmail.create_draft(
                to=extracted_email,
                subject=reply_subject,
                body=email.body,
                thread_id=thread_id,
                message_id=message_id_header
            )
            
            if draft:
                logger.info("  Draft created for extension request!")
                try:
                    # Log prediction for tracking
                    self.correction_tracker.log_prediction(
                        pitch_message_id=msg_id,
                        thread_id=thread_id,
                        recipient=extracted_email,
                        predicted_topic="Extension Request",
                        predicted_link=None,
                        extracted_topic=None
                    )
                except Exception as e:
                    pass
                self._bridge_log(
                    status="DRAFT_CREATED",
                    workflowType="PITCH_RESPONDER",
                    recipient=extracted_email,
                    subject=reply_subject,
                    gmailThreadId=thread_id,
                    gmailMessageId=message_id_header,
                    matchedTopic="Extension Request",
                    templateKey="pitch_extension",
                    matchScore=95,
                    snippet=content[:500],
                )
                return True
            else:
                logger.error("  Failed to create extension draft")
                return False
        # --- END NEW CHECK ---

        # --- PITCH GUARD: Filter out non-pitch emails ---
        is_reply = re.match(r'^\s*(re|fw|fwd)\s*:', subject, re.IGNORECASE) is not None
        is_likely_pitch = self._is_likely_pitch(content)
        extracted_topic = None
        is_fallback_reply = False
        
        if not is_likely_pitch:
            if self._is_short_acknowledgment(content):
                logger.info(f"  Skipping: '{subject[:30]}...' appears to be a short acknowledgment/thanks.")
                return False
            
            if is_reply:
                # If it's a reply and doesn't look like a pitch form, we check for topic extraction
                # before deciding to skip. This handles the case where someone replies with a pitch.
                extracted_topic = self.matcher.extract_topic_from_pitch(content)
                if not extracted_topic:
                    # Check if it's a reply to the fallback email
                    fallback_markers = [
                        r'choose one of our ongoing interview series topics from our list here',
                        r'Once you.?ve selected a topic that fits your expertise',
                        r'authority-magazine-bot',
                        r'submit your selection in our pitch form here'
                    ]
                    if any(re.search(m, content, re.IGNORECASE) for m in fallback_markers):
                        logger.info("  Detected reply to fallback email. Checking for topic in reply.")
                        
                        # Extract the new message content (ignoring quoted history)
                        lines = content.split('\n')
                        message_lines = []
                        for line in lines:
                            line_strip = line.strip()
                            if re.search(r'^\s*(On\s+.*wrote:|From:|Sent:|To:|Subject:)', line_strip, re.IGNORECASE) and not line_strip.lower().startswith('one of'):
                                break
                            if line_strip.startswith('>'):
                                continue
                            if line_strip == '--' or line_strip == '___':
                                break
                            message_lines.append(line_strip)
                        
                        new_message_content = ' '.join(message_lines).strip()
                        
                        clean_topic = new_message_content
                        prefixes_to_strip = [
                            r'^i(?:\')?(?:m|\s+am)?\s+(?:choosing|going with|selecting|picking)\s+',
                            r'^i(?:\')?(?:d|\s+would)?\s+like\s+to\s+(?:choose|go with|select|pick|do)\s+',
                            r'^let(?:\')?s\s+(?:do|go with|choose)\s+',
                            r'^(?:my\s+)?preferred\s+series\s+is\s+',
                            r'^i\s+choose\s+',
                            r'^the\s+topic\s+i\s+choose\s+is\s+',
                            r'^i(?:\')?(?:ll|\s+will)\s+(?:do|go with|choose)\s+',
                            r'^my\s+choice\s+is\s+',
                            r'^i\s+would\s+like\s+to\s+go\s+with\s+',
                            r'^i\s+would\s+like\s+to\s+do\s+',
                            r'^we\s+would\s+like\s+to\s+(?:choose|go with|select|pick|do)\s+',
                            r'^we(?:\')?(?:ll|\s+will)\s+(?:do|go with|choose)\s+',
                            r'^we\s+choose\s+',
                            r'^we\s+are\s+(?:choosing|going with|selecting|picking)\s+'
                        ]
                        for prefix in prefixes_to_strip:
                            clean_topic = re.sub(prefix, '', clean_topic, flags=re.IGNORECASE)
                            
                        clean_topic = re.sub(r'\s*(?:thanks|thank you|best|regards|sincerely|cheers|warmly).*$', '', clean_topic, flags=re.IGNORECASE | re.DOTALL)
                        clean_topic = clean_topic.strip()
                        
                        if clean_topic:
                            extracted_topic = clean_topic
                            is_fallback_reply = True
                            logger.info(f"  Extracted potential topic from fallback reply: '{extracted_topic}'")
                        else:
                            logger.info(f"  Skipping: '{subject[:30]}...' is a reply to fallback but no topic found.")
                            return False
                    else:
                        logger.info(f"  Skipping: '{subject[:30]}...' is a reply but doesn't contain a pitch form or fallback marker.")
                        return False
                else:
                    logger.info(f"  Processed reply email because a pitch form was detected.")
            else:
                # For non-replies that don't look like pitches, we still log but proceed
                # (they might be valid pitches that just don't match our signature yet)
                logger.info("  Email does not match standard pitch form signature.")
        # --- END PITCH GUARD ---
        
        # If we didn't extract it in the guard above, try now
        if extracted_topic is None:
            extracted_topic = parsed_pitch.clean_topic or self.matcher.extract_topic_from_pitch(content)
        
        matches = []
        high_score_matches = []
        
        if extracted_topic:
            # Check the full extracted topic string first
            matches = self.matcher.find_matches(extracted_topic, top_n=self.max_matches)
            
            # If the full string did not match strongly, check if it was a list of multiple topics
            if not matches or matches[0].score < self.match_threshold:
                parts = re.split(r';\s*|\n+|\r\n|,\s*(?:or\s+|and\s+)?|\s+\d+[\.:]\s+', extracted_topic, flags=re.IGNORECASE)
                parts = [p.strip() for p in parts if len(p.strip()) > 5]
                
                if len(parts) > 1:
                    logger.info(f"  Full string match was below threshold. Trying delimited parts: {parts}")
                    multiple_strong_matches = []
                    seen_series_ids = set()
                    
                    for part in parts:
                        part_matches = self.matcher.find_matches(part, top_n=1)
                        if part_matches and part_matches[0].score >= self.match_threshold:
                            match = part_matches[0]
                            if match.series_id not in seen_series_ids:
                                multiple_strong_matches.append(match)
                                seen_series_ids.add(match.series_id)
                    
                    if len(multiple_strong_matches) > 1:
                        logger.info(f"  MULTIPLE DISTINCT MATCHES: Found {len(multiple_strong_matches)} strong topic matches from parsed list")
                        logger.info(f"  Sending email with all choices for interviewee to select")
                        email = self.email_generator.generate_multiple_match_email(multiple_strong_matches)
                        matches = multiple_strong_matches
                    elif len(multiple_strong_matches) == 1:
                        logger.info(f"  Found 1 strong match from parsed list: {multiple_strong_matches[0].name} ({multiple_strong_matches[0].score:.0f}%)")
                        matches = multiple_strong_matches
                        email = self.email_generator.generate_acceptance_email(
                            series_name=matches[0].name,
                            interview_link=matches[0].link
                        )
                    else:
                        logger.info(f"  No strong matches found for any part of the delimited list")
                        email = self.email_generator.generate_no_match_email()
                        matches = []
            else:
                if is_fallback_reply:
                    logger.info(f"  Extracted topic from fallback reply: '{extracted_topic}'")
                else:
                    logger.info(f"  Extracted topic from form: '{extracted_topic}'")
        
        elif "What is the name of the interview topic" in content:
            # It IS a form, but extraction failed.
            logger.warning("  Detected structured form field but failed to extract topic value.")
            logger.warning("  Aborting match to avoid false positives.")
            matches = []  # Force no match
        
        else:
            # Not a structured form - allow body search (legacy mode)
            logger.info("  No structured topic found - searching full text")
            matches = self.matcher.find_matches(content, top_n=self.max_matches)

        if matches and 'email' not in locals(): # Only run if email hasn't been generated by multiple-topic logic
            # Log top matches for debugging
            for i, m in enumerate(matches):
                logger.info(f"  Candidate {i+1}: {m.name} ({m.score:.0f}%)")
            
            # Check for multiple high-confidence matches (ties)
            high_score_matches = [m for m in matches if m.score >= self.match_threshold]
            
            if len(high_score_matches) > 1:
                # Deduplicate high score matches by series_id before sending
                unique_matches = []
                seen_ids = set()
                for m in high_score_matches:
                    if m.series_id not in seen_ids:
                        unique_matches.append(m)
                        seen_ids.add(m.series_id)
                
                if len(unique_matches) > 1:
                    # Multiple strong matches - give them ALL the links and let interviewee choose
                    logger.info(f"  MULTIPLE MATCHES: {len(unique_matches)} unique topics matched with score >= {self.match_threshold}%")
                    logger.info(f"  Sending email with all {len(unique_matches)} links for interviewee to choose")
                    email = self.email_generator.generate_multiple_match_email(unique_matches)
                else:
                    # Deduplication left us with only one
                    match = unique_matches[0]
                    logger.info(f"  Selected (high confidence) after deduplication: {match.name} ({match.score:.0f}%)")
                    email = self.email_generator.generate_acceptance_email(
                        series_name=match.name,
                        interview_link=match.link
                    )
            
            elif matches[0].score >= self.match_threshold:
                # Single match >= match_threshold - check confidence tier
                match = matches[0]
                review_note = None
                if match.score < 95.0:
                    review_note = f"[NOTE FOR REVIEW: Matched '{match.name}' with {match.score:.0f}% confidence ({match.match_type}). Please verify before sending.]"
                    logger.info(f"  Ambiguous match (Tier 2): {match.name} ({match.score:.0f}%) - added review note")
                else:
                    logger.info(f"  Selected (high confidence, Tier 1): {match.name} ({match.score:.0f}%)")
                
                email = self.email_generator.generate_acceptance_email(
                    series_name=match.name,
                    interview_link=match.link,
                    review_note=review_note
                )
            else:
                # Score below threshold - use fallback email
                logger.info(f"  Top match score {matches[0].score:.1f}% < {self.match_threshold}% - using fallback")
                email = self.email_generator.generate_no_match_email()
        elif 'email' not in locals():
            # No match - create "please choose a topic" email
            logger.info("  No match found - using fallback template")
            email = self.email_generator.generate_no_match_email()
        
        # Guard against disabled template
        if not email or not getattr(email, 'body', None):
            logger.info("  Template is disabled in SaaS; skipping draft creation")
            self._bridge_log(
                status="SKIPPED",
                workflowType="PITCH_RESPONDER",
                recipient=extracted_email,
                reason="Template disabled in SaaS",
                subject=subject,
                gmailThreadId=thread_id,
                gmailMessageId=message_id_header,
            )
            return False

        # Get reply-to address (re-run logic or use previously extracted)
        logger.info(f"  Reply to: {extracted_email}")
        
        # Create draft as reply in the same thread
        draft = self.gmail.create_draft(
            to=extracted_email,
            subject=f"Re: {subject}",
            body=email.body,
            thread_id=thread_id,
            message_id=message_id_header
        )
        
        if draft:
            logger.info(f"  Draft created in thread!")
            
            # Invalidate draft cache so next poll sees this new draft immediately
            if hasattr(self.gmail, 'invalidate_draft_cache'):
                self.gmail.invalidate_draft_cache()
            
            # Mark the original email as read so it won't be re-processed
            # REMOVED: User prefers emails to remain unread. 
            # We rely purely on gmail.thread_has_draft() to prevent duplicate processing.
            
            # Log prediction for correction tracking
            try:
                # Determine what we predicted (handle all code paths)
                predicted_topic = None
                predicted_link = None
                
                if matches and matches[0].score >= self.match_threshold:
                    if len(high_score_matches) > 1:
                        # Multiple matches - log first one as predicted
                        predicted_topic = matches[0].name
                        predicted_link = matches[0].link
                    else:
                        # Single high-confidence match
                        predicted_topic = matches[0].name
                        predicted_link = matches[0].link
                
                self.correction_tracker.log_prediction(
                    pitch_message_id=msg_id,
                    thread_id=thread_id,
                    recipient=extracted_email,
                    predicted_topic=predicted_topic,
                    predicted_link=predicted_link,
                    extracted_topic=extracted_topic  # For learning system
                )
            except Exception as e:
                logger.warning(f"  Failed to log prediction for correction tracking: {e}")

            best_match = matches[0] if matches else None
            self._bridge_log(
                status="DRAFT_CREATED",
                workflowType="PITCH_RESPONDER",
                recipient=extracted_email,
                subject=f"Re: {subject}",
                gmailThreadId=thread_id,
                gmailMessageId=message_id_header,
                matchedTopic=best_match.name if best_match else None,
                matchedUrl=best_match.link if best_match else None,
                matchScore=int(best_match.score) if best_match else None,
                templateKey="pitch_acceptance" if best_match and best_match.score >= self.match_threshold else "pitch_no_match",
                snippet=content[:500],
            )
            
            return True
        else:
            logger.error(f"  Failed to create draft")
            return False
    
    def check_inbox(self):
        """Check inbox for new pitch emails."""
        logger.info("Checking inbox for new pitches...")
        
        try:
            bridge_config = self._sync_bridge_config()
            if bridge_config and not bridge_config.enabled:
                logger.info("SaaS bridge has this pitch responder paused; skipping inbox check.")
                self.bridge.post_status(
                    auth_status="OK",
                    bridge_status="PAUSED",
                    run={
                        "status": "SKIPPED",
                        "emailsScanned": 0,
                        "draftsCreated": 0,
                        "skippedCount": 0,
                        "summary": "Pitch responder paused in SaaS admin.",
                    },
                )
                return

            # Search for pitch emails in the inbox (auto-replies from form contain the pitch)
            messages = self.gmail.list_messages(
                query='subject:pitch in:inbox',
                max_results=self.max_emails_per_run
            )
            
            new_count = 0
            skipped_count = 0
            for msg in messages:
                # Get thread ID for this message
                msg_details = self.gmail.get_message_details(msg['id'])
                thread_id = msg_details.get('threadId') if msg_details else None
                
                # Check if this thread already has a draft - skip if so
                if thread_id and self.gmail.thread_has_draft(thread_id):
                    logger.info(f"Skipping (already has draft): {msg['subject'][:50]}")
                    skipped_count += 1
                    continue
                
                # New unprocessed pitch!
                success = self.process_pitch(
                    msg_id=msg['id'],
                    subject=msg['subject'],
                    sender=msg['sender']
                )
                
                if success:
                    new_count += 1
            
            if new_count > 0:
                logger.info(f"Processed {new_count} new pitch(es)")
            else:
                logger.info("No new pitches found")

            self.bridge.post_status(
                auth_status="OK",
                bridge_status="CONNECTED",
                run={
                    "status": "SUCCESS",
                    "emailsScanned": len(messages),
                    "draftsCreated": new_count,
                    "skippedCount": skipped_count,
                    "summary": f"Pitch responder checked {len(messages)} message(s).",
                },
            )
                
        except Exception as e:
            logger.error(f"Error checking inbox: {e}")
            self.bridge.post_status(
                auth_status="ERROR",
                bridge_status="ERROR",
                last_error=str(e),
                run={
                    "status": "FAILED",
                    "errorCount": 1,
                    "summary": str(e),
                },
            )
            raise  # Propagate error to main loop for recovery logic
    
    def run(self):
        """Run the auto-responder service."""
        logger.info("=" * 50)
        logger.info("Authority Magazine Auto Responder Started")
        logger.info(f"Checking every {CHECK_INTERVAL} seconds")
        logger.info("Press Ctrl+C to stop")
        logger.info("=" * 50)
        
        # Authenticate on startup
        try:
            self.gmail.authenticate()
            logger.info(f"Authenticated as: {self.gmail.user_email}")
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return
        
        # Connection error counter for recovery logic
        consecutive_errors = 0
        MAX_CONSECUTIVE_ERRORS = 3
        
        # Main loop
        while True:
            try:
                self.check_inbox()
                
                # Check if admin panel added new topics - hot-reload if so
                self.check_reload_topics()
                
                # Phone home to Master Google Doc once a week
                self.check_master_doc_weekly_sync()
                
                consecutive_errors = 0  # Reset on success
                logger.info("Sync complete")
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                break
            except Exception as e:
                consecutive_errors += 1
                error_str = str(e)
                
                # Check if this is a connection/SSL error
                is_connection_error = any(pattern in error_str for pattern in [
                    'SSL', 'DECRYPTION', 'Connection', 'socket', 'timed out'
                ])
                
                if is_connection_error:
                    logger.warning(f"Connection error ({consecutive_errors}/{MAX_CONSECUTIVE_ERRORS}): {e}")
                    
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        logger.info("Multiple connection failures - resetting Gmail connection...")
                        try:
                            self.gmail = GmailClient()
                            self.gmail.authenticate()
                            logger.info(f"Re-authenticated as: {self.gmail.user_email}")
                            consecutive_errors = 0
                        except Exception as auth_error:
                            logger.error(f"Re-authentication failed: {auth_error}")
                else:
                    logger.error(f"Error in main loop: {e}")
            
            time.sleep(CHECK_INTERVAL)


def main():
    """Entry point."""
    responder = AutoResponder()
    responder.run()


if __name__ == "__main__":
    main()
