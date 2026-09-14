"""
Topic Correction Learning System

Automatically detects when the user corrects the auto-responder's topic prediction
by comparing what was predicted vs. what was actually sent.

This module:
1. Logs predictions when drafts are created
2. Scans the Sent folder to find what was actually sent
3. Detects mismatches (corrections) and logs them for learning
"""

import os
import re
import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
PREDICTION_LOG_PATH = os.path.join(DATA_DIR, 'prediction_log.json')
CORRECTIONS_PATH = os.path.join(DATA_DIR, 'corrections_learned.json')
LEARNED_RULES_PATH = os.path.join(DATA_DIR, 'learned_rules.json')
SERIES_PATH = os.path.join(DATA_DIR, 'interview_series.json')

# How long to wait before marking a prediction as "no_response"
NO_RESPONSE_HOURS = 48

# How old entries can be before cleanup (days)
CLEANUP_DAYS = 30


class CorrectionTracker:
    """Tracks predictions and detects corrections from sent emails."""
    
    def __init__(self, gmail_client=None):
        """
        Initialize the correction tracker.
        
        Args:
            gmail_client: Optional GmailClient instance for scanning sent folder
        """
        self.gmail = gmail_client
        self.doc_id_to_topic = self._build_doc_id_lookup()
        logger.info(f"CorrectionTracker initialized with {len(self.doc_id_to_topic)} topic mappings")
    
    def set_gmail_client(self, gmail_client):
        """Set the Gmail client (useful when initialized before auth)."""
        self.gmail = gmail_client
    
    def _build_doc_id_lookup(self) -> Dict[str, str]:
        """Build a mapping from Google Doc ID to topic name."""
        lookup = {}
        
        if not os.path.exists(SERIES_PATH):
            logger.warning(f"Series file not found: {SERIES_PATH}")
            return lookup
        
        try:
            with open(SERIES_PATH, 'r', encoding='utf-8') as f:
                series_list = json.load(f)
            
            for series in series_list:
                link = series.get('link', '')
                name = series.get('name', '')
                
                doc_id = self._extract_doc_id(link)
                if doc_id and name:
                    lookup[doc_id] = name
            
        except Exception as e:
            logger.error(f"Error building doc ID lookup: {e}")
        
        return lookup
    
    def _extract_doc_id(self, text: str) -> Optional[str]:
        """
        Extract Google Doc ID from a URL or text containing a URL.
        
        Handles variations like:
        - https://docs.google.com/document/d/1CgOPtTgVhj6.../edit
        - https://docs.google.com/document/d/1CgOPtTgVhj6.../edit?usp=sharing
        - https://docs.google.com/document/d/1CgOPtTgVhj6.../view
        """
        if not text:
            return None
        
        pattern = r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)'
        match = re.search(pattern, text)
        
        return match.group(1) if match else None
    
    def _atomic_write_json(self, path: str, data: Any) -> bool:
        """Write JSON data atomically using temp file + rename."""
        temp_path = path + '.tmp'
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # Atomic rename (works on Windows too with os.replace)
            os.replace(temp_path, path)
            return True
            
        except Exception as e:
            logger.error(f"Error writing to {path}: {e}")
            # Clean up temp file if it exists
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
            return False
    
    def _load_predictions(self) -> List[Dict]:
        """Load the prediction log."""
        if not os.path.exists(PREDICTION_LOG_PATH):
            return []
        
        try:
            with open(PREDICTION_LOG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading predictions: {e}")
            return []
    
    def _save_predictions(self, predictions: List[Dict]) -> bool:
        """Save the prediction log."""
        return self._atomic_write_json(PREDICTION_LOG_PATH, predictions)
    
    def _load_corrections(self) -> List[Dict]:
        """Load the corrections log."""
        if not os.path.exists(CORRECTIONS_PATH):
            return []
        
        try:
            with open(CORRECTIONS_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading corrections: {e}")
            return []
    
    def _save_corrections(self, corrections: List[Dict]) -> bool:
        """Save the corrections log."""
        return self._atomic_write_json(CORRECTIONS_PATH, corrections)
    
    def _load_learned_rules(self) -> List[Dict]:
        """Load learned rules."""
        if not os.path.exists(LEARNED_RULES_PATH):
            return []
        
        try:
            with open(LEARNED_RULES_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading learned rules: {e}")
            return []
    
    def _save_learned_rules(self, rules: List[Dict]) -> bool:
        """Save learned rules."""
        return self._atomic_write_json(LEARNED_RULES_PATH, rules)
    
    def _normalize_topic(self, topic: str) -> str:
        """
        Normalize a topic string for matching.
        Lowercase, remove punctuation, collapse spaces.
        """
        if not topic:
            return ""
        
        # Lowercase
        normalized = topic.lower()
        
        # Remove punctuation (keep alphanumeric and spaces)
        normalized = re.sub(r'[^a-z0-9\s]', ' ', normalized)
        
        # Collapse multiple spaces
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        return normalized
    
    def _strip_html(self, text: str) -> str:
        """
        Strip HTML tags and decode common entities from text.
        
        Handles cases where pitch emails contain raw HTML table markup, etc.
        """
        if not text:
            return ""
        
        # Remove HTML tags
        clean = re.sub(r'<[^>]+>', ' ', text)
        
        # Decode common HTML entities
        clean = clean.replace('&nbsp;', ' ')
        clean = clean.replace('&amp;', '&')
        clean = clean.replace('&lt;', '<')
        clean = clean.replace('&gt;', '>')
        clean = clean.replace('&quot;', '"')
        clean = clean.replace('&#39;', "'")
        
        # Remove CSS style content that might have leaked through
        clean = re.sub(r'style\s*=\s*["\'][^"\']*["\']', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'rgb\s*\([^)]+\)', '', clean)
        
        # Collapse multiple spaces and trim
        clean = re.sub(r'\s+', ' ', clean).strip()
        
        return clean
    
    def log_prediction(
        self,
        pitch_message_id: str,
        thread_id: Optional[str],
        recipient: str,
        predicted_topic: Optional[str],
        predicted_link: Optional[str],
        extracted_topic: Optional[str] = None  # NEW: for learning
    ) -> str:
        """
        Log a prediction when a draft is created.
        
        Args:
            pitch_message_id: Gmail message ID of the original pitch
            thread_id: Gmail thread ID for correlation
            recipient: Email address the draft was sent to
            predicted_topic: The topic name that was predicted (or None for no match)
            predicted_link: The Google Docs link used (or None for no match)
            extracted_topic: The topic text extracted from the pitch form (for learning)
            
        Returns:
            The prediction ID (UUID)
        """
        prediction_id = str(uuid.uuid4())
        
        # Extract doc ID from link
        predicted_doc_id = self._extract_doc_id(predicted_link) if predicted_link else None
        
        prediction = {
            "id": prediction_id,
            "pitch_message_id": pitch_message_id,
            "thread_id": thread_id,
            "recipient": recipient.lower().strip(),
            "predicted_topic": predicted_topic,
            "predicted_doc_id": predicted_doc_id,
            "extracted_topic": extracted_topic,  # NEW: for learning
            "normalized_extracted": self._normalize_topic(extracted_topic) if extracted_topic else None,
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "status": "pending"
        }
        
        predictions = self._load_predictions()
        predictions.append(prediction)
        
        if self._save_predictions(predictions):
            logger.info(f"Logged prediction: {predicted_topic or 'NO MATCH'} -> {recipient}")
        else:
            logger.error(f"Failed to log prediction for {recipient}")
        
        return prediction_id
    
    def extract_doc_id_from_email(self, email_body: str) -> Optional[str]:
        """
        Extract the first Google Doc ID from an email body.
        
        Handles both plain text URLs and HTML hyperlinks.
        """
        if not email_body:
            return None
        
        # Try to find any Google Docs link
        return self._extract_doc_id(email_body)
    
    def scan_sent_folder(self) -> Dict[str, int]:
        """
        Scan the sent folder to check pending predictions.
        
        Returns:
            Dict with counts: {confirmed, corrected, no_response, still_pending}
        """
        if not self.gmail:
            logger.warning("Cannot scan sent folder: Gmail client not available")
            return {"error": "no_gmail_client"}
        
        predictions = self._load_predictions()
        corrections = self._load_corrections()
        
        now = datetime.utcnow()
        stats = {"confirmed": 0, "corrected": 0, "no_response": 0, "still_pending": 0}
        
        pending = [p for p in predictions if p.get("status") == "pending"]
        logger.info(f"Scanning sent folder for {len(pending)} pending predictions...")
        
        for prediction in pending:
            result = self._check_prediction(prediction, now)
            
            if result == "confirmed":
                prediction["status"] = "confirmed"
                stats["confirmed"] += 1
                logger.info(f"Confirmed: {prediction.get('predicted_topic')}")
                
            elif result == "no_response":
                prediction["status"] = "no_response"
                stats["no_response"] += 1
                logger.info(f"No response for: {prediction.get('predicted_topic')}")
                
            elif isinstance(result, dict):
                # Correction detected
                prediction["status"] = "corrected"
                prediction["actual_topic"] = result.get("actual_topic")
                prediction["actual_doc_id"] = result.get("actual_doc_id")
                
                # Log the correction
                correction = {
                    "id": str(uuid.uuid4()),
                    "prediction_id": prediction["id"],
                    "predicted_topic": prediction.get("predicted_topic"),
                    "actual_topic": result.get("actual_topic"),
                    "actual_doc_id": result.get("actual_doc_id"),
                    "timestamp": datetime.utcnow().isoformat() + 'Z'
                }
                corrections.append(correction)
                stats["corrected"] += 1
                
                # AUTO-CREATE LEARNED RULE
                extracted = prediction.get("extracted_topic")
                if extracted:
                    self._create_learned_rule(
                        extracted_topic=extracted,
                        correct_topic_name=result.get("actual_topic"),
                        correct_doc_id=result.get("actual_doc_id")
                    )
                
                logger.info(f"CORRECTION DETECTED: {prediction.get('predicted_topic')} -> {result.get('actual_topic')}")
            
            else:
                # Still pending
                stats["still_pending"] += 1
        
        # Save updated data
        self._save_predictions(predictions)
        if stats["corrected"] > 0:
            self._save_corrections(corrections)
        
        # Cleanup old entries
        self.cleanup_old_entries()
        
        logger.info(f"Scan complete: {stats}")
        return stats
    
    def _check_prediction(self, prediction: Dict, now: datetime) -> Any:
        """
        Check a single prediction against sent emails.
        
        Returns:
            - "confirmed" if sent email matches prediction
            - "no_response" if 48h passed with no matching email
            - dict with actual_topic/actual_doc_id if correction detected
            - None if still pending (within 48h window, no email yet)
        """
        recipient = prediction.get("recipient", "")
        timestamp_str = prediction.get("timestamp", "")
        predicted_doc_id = prediction.get("predicted_doc_id")
        thread_id = prediction.get("thread_id")
        
        # Parse timestamp
        try:
            pred_time = datetime.fromisoformat(timestamp_str.rstrip('Z'))
        except:
            logger.error(f"Invalid timestamp: {timestamp_str}")
            return "no_response"
        
        # Check if 48h has passed
        hours_elapsed = (now - pred_time).total_seconds() / 3600
        
        # Build Gmail query - search for sent emails to this recipient after the prediction
        # Gmail query format for after: uses epoch seconds or YYYY/MM/DD
        after_date = pred_time.strftime("%Y/%m/%d")
        query = f"in:sent to:{recipient} after:{after_date}"
        
        try:
            sent_messages = self.gmail.list_messages(query=query, max_results=10)
        except Exception as e:
            logger.error(f"Error querying sent folder: {e}")
            return None  # Still pending, try again later
        
        if not sent_messages:
            # No sent emails found
            if hours_elapsed >= NO_RESPONSE_HOURS:
                return "no_response"
            return None  # Still pending
        
        # Look for a matching email - REQUIRE thread_id match to avoid false positives
        # If we don't have a thread_id for the prediction, we can't reliably detect corrections
        if not thread_id:
            logger.warning(f"Prediction has no thread_id, cannot detect corrections for: {recipient}")
            return None  # Can't process without thread_id
        
        for msg in sent_messages:
            # Get message details to check thread_id
            try:
                msg_details = self.gmail.get_message_details(msg['id'])
                msg_thread_id = msg_details.get('threadId') if msg_details else None
            except:
                continue
            
            # CRITICAL: Only consider emails in the SAME thread as the pitch
            # This prevents false positives from unrelated emails to the same person
            if msg_thread_id != thread_id:
                continue  # Different thread, skip this message
            
            # Get email content
            try:
                content = self.gmail.get_message_content(msg['id'])
            except:
                continue
            
            if not content:
                continue
            
            # Extract doc ID from the sent email
            sent_doc_id = self.extract_doc_id_from_email(content)
            
            if not sent_doc_id:
                # Email doesn't contain a topic link - might be unrelated
                continue
            
            # We found a sent email with a topic link in the same thread!
            # Compare to prediction
            
            if predicted_doc_id is None:
                # We predicted "no match" but user sent a topic - that's a learning signal!
                actual_topic = self.doc_id_to_topic.get(sent_doc_id, f"Unknown (doc: {sent_doc_id[:10]}...)")
                return {
                    "actual_topic": actual_topic,
                    "actual_doc_id": sent_doc_id
                }
            
            if sent_doc_id == predicted_doc_id:
                # Match! User sent what we predicted
                return "confirmed"
            else:
                # Mismatch - correction detected!
                actual_topic = self.doc_id_to_topic.get(sent_doc_id, f"Unknown (doc: {sent_doc_id[:10]}...)")
                return {
                    "actual_topic": actual_topic,
                    "actual_doc_id": sent_doc_id
                }
        
        # No matching email with a topic link found
        if hours_elapsed >= NO_RESPONSE_HOURS:
            return "no_response"
        
        return None  # Still pending
    
    def cleanup_old_entries(self):
        """Remove prediction entries older than CLEANUP_DAYS."""
        predictions = self._load_predictions()
        
        if not predictions:
            return
        
        cutoff = datetime.utcnow() - timedelta(days=CLEANUP_DAYS)
        original_count = len(predictions)
        
        # Keep entries newer than cutoff OR still pending
        filtered = []
        for p in predictions:
            try:
                ts = datetime.fromisoformat(p.get("timestamp", "").rstrip('Z'))
                if ts > cutoff or p.get("status") == "pending":
                    filtered.append(p)
            except:
                # Invalid timestamp, keep it to avoid data loss
                filtered.append(p)
        
        if len(filtered) < original_count:
            removed = original_count - len(filtered)
            self._save_predictions(filtered)
            logger.info(f"Cleaned up {removed} old prediction entries")
    
    def get_corrections_summary(self) -> List[Dict]:
        """Get all logged corrections for display."""
        return self._load_corrections()
    
    def get_pending_count(self) -> int:
        """Get count of pending predictions."""
        predictions = self._load_predictions()
        return sum(1 for p in predictions if p.get("status") == "pending")
    
    # Minimum length for a learned rule's normalized topic (chars).
    # Inputs shorter than this are too vague to generalize from.
    MIN_RULE_TOPIC_LENGTH = 15
    
    def _create_learned_rule(
        self,
        extracted_topic: str,
        correct_topic_name: str,
        correct_doc_id: str
    ) -> bool:
        """
        Create a learned rule from a correction.
        
        Args:
            extracted_topic: The original topic text from the pitch form
            correct_topic_name: The correct topic name (what user actually sent)
            correct_doc_id: The correct Google Doc ID
            
        Returns:
            True if rule was created successfully
        """
        if not extracted_topic or not correct_topic_name:
            logger.warning("Cannot create learned rule: missing extracted_topic or correct_topic_name")
            return False
        
        # Sanitize: strip any HTML tags that may have leaked into the topic
        extracted_topic = self._strip_html(extracted_topic)
        
        # Skip if cleaned topic is empty or too short (likely garbage)
        if not extracted_topic or len(extracted_topic) < 5:
            logger.warning(f"Cannot create learned rule: extracted_topic too short after HTML stripping: '{extracted_topic}'")
            return False
        
        normalized = self._normalize_topic(extracted_topic)
        if not normalized:
            logger.warning("Cannot create learned rule: normalized topic is empty")
            return False
        
        # === QUALITY GATES (prevent bad rules from being created) ===
        
        # Gate 1: Reject inputs that are too short/vague after normalization.
        # Single words like "Business" or "Tech" are too ambiguous to create rules from.
        if len(normalized) < self.MIN_RULE_TOPIC_LENGTH:
            logger.info(f"RULE REJECTED (too short: {len(normalized)} chars < {self.MIN_RULE_TOPIC_LENGTH}): '{extracted_topic}'")
            return False
        
        # Gate 2: Reject rules where the correction target is unknown.
        # "Unknown (doc: 1abc...)" targets can't be matched by name and are brittle.
        if correct_topic_name.startswith("Unknown (doc:"):
            logger.info(f"RULE REJECTED (unknown target): '{extracted_topic}' -> '{correct_topic_name}'")
            return False
        
        # Gate 3: Reject inputs that look like person names or personal descriptions
        # rather than interview topics. Real topics have at least one "topic word".
        topic_indicators = {
            'things', 'how', 'what', 'why', 'who', 'tips', 'ways', 'steps',
            'leaders', 'founders', 'stars', 'heroes', 'disruptors', 'women',
            'career', 'business', 'tech', 'health', 'social', 'impact',
            'create', 'build', 'scale', 'succeed', 'thrive', 'strategy',
            'innovation', 'future', 'resilience', 'leadership', 'culture',
            'marketing', 'digital', 'education', 'wellness', 'mental',
            'interview', 'topic', 'series', 'champion', 'rising',
        }
        norm_words = set(normalized.split())
        has_topic_word = bool(norm_words & topic_indicators)
        if len(norm_words) <= 3 and not has_topic_word:
            logger.info(f"RULE REJECTED (looks like name/vague, no topic indicators): '{extracted_topic}'")
            return False

        # Gate 4: Reject URLs and email artifacts
        extracted_lower = extracted_topic.lower()
        if any(u in extracted_lower for u in ['http:', 'https:', 'docs.google', 'medium.com', 'www.']):
            logger.info(f"RULE REJECTED (contains URL): '{extracted_topic}'")
            return False

        email_artifacts = [
            'sent from', 'can i submit', 'submit all my', 'successfully submitted',
            'messages in conversation', 'look forward to it', 'questions and answers',
            'i would like to submit', 'please let me know', 're:', 'fwd:'
        ]
        if any(ea in extracted_lower for ea in email_artifacts):
            logger.info(f"RULE REJECTED (conversational email artifact): '{extracted_topic}'")
            return False

        # Gate 5: Reject excessively long text or storytelling pitches
        if len(norm_words) > 16 or len(extracted_topic) > 120:
            logger.info(f"RULE REJECTED (too long / story blurb: {len(norm_words)} words): '{extracted_topic}'")
            return False

        # Gate 6: Reject overly broad or generic category terms
        broad_terms = {
            'business leaders', 'leaders', 'leadership', 'business',
            'entrepreneurs', 'founders', 'founder', 'women in business'
        }
        if normalized in broad_terms:
            logger.info(f"RULE REJECTED (overly broad generic term): '{extracted_topic}'")
            return False

        # Gate 7: Reject multi-topic either-or pitches
        if ' or ' in extracted_lower or 'whichever' in extracted_lower:
            logger.info(f"RULE REJECTED (multi-topic either-or pitch): '{extracted_topic}'")
            return False

        # Gate 8: Reject if there is no substantive semantic overlap between pitch and target topic
        stop_meta = {
            'the', 'a', 'an', 'in', 'on', 'to', 'for', 'of', 'and', 'or', 'is', 'it', 'at', 'by',
            'things', 'need', 'know', 'create', 'make', 'first', 'wish', 'someone', 'somebody',
            'told', 'became', 'successful', 'success', 'future', 'series', 'interview', 'about',
            'from', 'your', 'their', 'what', 'order', 'thrive', 'succeed', 'take', 'next', 'level',
            'how', 'why', 'who', 'we', 'our', 'with'
        }
        orig_words = {w for w in re.findall(r'[a-z0-9]+', extracted_lower) if w not in stop_meta}
        target_words = {w for w in re.findall(r'[a-z0-9]+', correct_topic_name.lower()) if w not in stop_meta}
        
        # Expand synonyms if available
        try:
            from matcher import expand_synonyms
            expanded_orig = set()
            for ow in orig_words:
                expanded_orig.update(expand_synonyms(ow))
            orig_words = expanded_orig
        except Exception:
            pass

        if orig_words and target_words and not (orig_words & target_words):
            logger.info(f"RULE REJECTED (no semantic overlap between '{extracted_topic}' and '{correct_topic_name}')")
            return False
        
        # Check if rule already exists for this normalized topic
        rules = self._load_learned_rules()
        for rule in rules:
            if rule.get("normalized_topic") == normalized:
                # Update existing rule
                rule["correct_topic_name"] = correct_topic_name
                rule["correct_doc_id"] = correct_doc_id
                rule["updated_at"] = datetime.utcnow().isoformat() + 'Z'
                logger.info(f"Updated existing learned rule: '{extracted_topic}' -> '{correct_topic_name}'")
                return self._save_learned_rules(rules)
        
        # Create new rule
        new_rule = {
            "id": str(uuid.uuid4()),
            "normalized_topic": normalized,
            "original_topic": extracted_topic,
            "correct_topic_name": correct_topic_name,
            "correct_doc_id": correct_doc_id,
            "created_at": datetime.utcnow().isoformat() + 'Z'
        }
        
        rules.append(new_rule)
        
        if self._save_learned_rules(rules):
            logger.info(f"Created learned rule: '{extracted_topic}' -> '{correct_topic_name}'")
            return True
        else:
            logger.error(f"Failed to save learned rule")
            return False
    
    def get_learned_rules(self) -> List[Dict]:
        """Get all learned rules for display in admin panel."""
        return self._load_learned_rules()
    
    def delete_learned_rule(self, rule_id: str) -> bool:
        """
        Delete a learned rule by ID.
        
        Args:
            rule_id: The UUID of the rule to delete
            
        Returns:
            True if rule was deleted successfully
        """
        rules = self._load_learned_rules()
        original_count = len(rules)
        
        rules = [r for r in rules if r.get("id") != rule_id]
        
        if len(rules) < original_count:
            if self._save_learned_rules(rules):
                logger.info(f"Deleted learned rule: {rule_id}")
                return True
        
        logger.warning(f"Learned rule not found: {rule_id}")
        return False
    
    def update_learned_rule(self, rule_id: str, original_topic: str = None, correct_topic_name: str = None) -> bool:
        """
        Update an existing learned rule.
        
        Args:
            rule_id: The UUID of the rule to update
            original_topic: New value for original_topic (optional)
            correct_topic_name: New value for correct_topic_name (optional)
            
        Returns:
            True if rule was updated successfully
        """
        rules = self._load_learned_rules()
        
        for rule in rules:
            if rule.get("id") == rule_id:
                # Update original_topic and recalculate normalized_topic
                if original_topic is not None:
                    # Strip any HTML that might be in the input
                    clean_topic = self._strip_html(original_topic)
                    rule["original_topic"] = clean_topic
                    rule["normalized_topic"] = self._normalize_topic(clean_topic)
                
                # Update correct_topic_name
                if correct_topic_name is not None:
                    rule["correct_topic_name"] = correct_topic_name
                
                rule["updated_at"] = datetime.utcnow().isoformat() + 'Z'
                
                if self._save_learned_rules(rules):
                    logger.info(f"Updated learned rule: {rule_id}")
                    return True
                else:
                    logger.error(f"Failed to save updated rule: {rule_id}")
                    return False
        
        logger.warning(f"Learned rule not found for update: {rule_id}")
        return False
    
    def _extract_topic_pattern(self, topic_text: str) -> str:
        """
        Extract the core pattern from a topic, stripping out person/company names.
        
        "EdTech: Anu Vaid of ParentSquare On How..." -> "edtech on how their technology..."
        "Digital Brand: John Smith talks about..." -> "digital brand talks about..."
        """
        if not topic_text:
            return ""
        
        import re
        
        normalized = topic_text.lower()
        
        # Remove common person-name patterns
        # Pattern: "Name of Company On How" -> "on how"
        normalized = re.sub(r'\b[a-z]+ [a-z]+ of [a-z]+\s+', ' ', normalized)
        
        # Pattern: "by Name" or "with Name"
        normalized = re.sub(r'\b(by|with|from)\s+[a-z]+(\s+[a-z]+)?\s+', ' ', normalized)
        
        # Remove single capitalized-word-looking tokens (likely names) 
        # when followed by common words
        normalized = re.sub(r'\b[a-z]+\s+(of|on|about|discusses|shares|talks)\b', r' \1', normalized)
        
        # Remove punctuation except spaces
        normalized = re.sub(r'[^a-z0-9\s]', ' ', normalized)
        
        # Collapse whitespace
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        return normalized
    
    def find_learned_match(self, extracted_topic: str) -> Optional[Dict]:
        """
        Check if there's a learned rule that matches the extracted topic.
        
        Uses pattern-based matching to handle variations in person/company names.
        
        Args:
            extracted_topic: The topic text extracted from the pitch form
            
        Returns:
            Dict with {topic_name, doc_id} if match found, None otherwise
        """
        if not extracted_topic:
            return None
        
        normalized = self._normalize_topic(extracted_topic)
        if not normalized:
            return None
        
        rules = self._load_learned_rules()
        logger.debug(f"Checking {len(rules)} learned rules against: '{extracted_topic[:80]}'")
        
        # 1. Exact match first (fastest)
        for rule in rules:
            if rule.get("normalized_topic") == normalized:
                logger.info(f"Learned rule matched (exact): '{extracted_topic}' -> '{rule.get('correct_topic_name')}'")
                return {
                    "topic_name": rule.get("correct_topic_name"),
                    "doc_id": rule.get("correct_doc_id"),
                    "match_type": "learned_exact"
                }
        
        # 2. Pattern-based matching (handles name variations)
        input_pattern = self._extract_topic_pattern(extracted_topic)
        input_tokens = set(input_pattern.split())
        
        # Also check for key topic indicators
        input_lower = extracted_topic.lower()
        
        best_match = None
        best_score = 0
        near_misses = []  # Track close-but-not-enough matches for debugging
        
        for rule in rules:
            rule_original = rule.get("original_topic", "")
            rule_pattern = self._extract_topic_pattern(rule_original)
            rule_tokens = set(rule_pattern.split())
            
            if not rule_tokens:
                continue
            
            # Jaccard similarity on pattern tokens
            intersection = input_tokens & rule_tokens
            union = input_tokens | rule_tokens
            
            if not union:
                continue
                
            similarity = len(intersection) / len(union)
            
            # Boost score if key topic keywords match
            # e.g., both have "edtech", both have "chef", etc.
            # Use a broad set of distinctive role/industry keywords that appear at the END
            # of "5 Things I Wish Someone Told Me Before I Became a [ROLE]" topics.
            # These are what make each topic unique, so mismatches should be penalized.
            key_words = {
                'edtech', 'education', 'scale', 'startup', 'founder', 'ceo',
                'cro', 'cmo', 'cto', 'cfo', 'coo', 'leader', 'leaders', 'leadership',
                'athlete', 'restaurant', 'restaurateur', 'chef', 'cook', 'culinary',
                'author', 'writer', 'lawyer', 'attorney', 'doctor', 'physician',
                'nurse', 'therapist', 'dentist', 'veterinarian',
                'burnout', 'philanthropy', 'nonprofit',
                'filmmaker', 'director', 'producer', 'actor', 'actress',
                'comedian', 'musician', 'photographer', 'artist', 'designer',
                'engineer', 'scientist', 'researcher', 'professor', 'teacher',
                'coach', 'trainer', 'consultant', 'entrepreneur', 'executive',
                'politician', 'journalist', 'reporter', 'podcaster', 'influencer',
                'ai', 'space', 'crypto', 'cybersecurity', 'gaming', 'robotics',
                'quantum', 'metaverse', 'hotels', 'banking',
            }
            
            input_keys = input_tokens & key_words
            rule_keys = rule_tokens & key_words
            
            if input_keys and input_keys == rule_keys:
                similarity = min(1.0, similarity + 0.2)  # Boost for matching key terms
            elif input_keys and input_keys != rule_keys:
                # PENALTY: The input has distinctive role/industry keyword(s) (e.g. "chef")
                # but the rule either has NONE or has a DIFFERENT keyword (e.g. "filmmaker").
                # These topics are fundamentally different even if they share the same
                # "5 Things I Wish..." template. Cut the score to prevent false matches.
                similarity = similarity * 0.5

            
            # Track near-misses for debug logging
            if 0.60 <= similarity < 0.80:
                near_misses.append((similarity, rule_original, rule.get("correct_topic_name", "")))
            
            if similarity > best_score:
                best_score = similarity
                best_match = rule
        
        # Log near-misses so we can tune the threshold if needed
        if near_misses:
            logger.debug(f"Learned rules near-misses for '{extracted_topic[:60]}':")
            for score, orig, correct in sorted(near_misses, reverse=True)[:3]:
                logger.debug(f"  {score:.0%} '{orig[:50]}' -> '{correct[:50]}'")
        
        # Require 80% similarity for pattern match (much stricter to avoid false positives)
        if best_match and best_score >= 0.80:
            logger.info(f"Learned rule matched (pattern {best_score:.0%}): '{extracted_topic}' -> '{best_match.get('correct_topic_name')}'")
            return {
                "topic_name": best_match.get("correct_topic_name"),
                "doc_id": best_match.get("correct_doc_id"),
                "match_type": "learned_pattern"
            }
        
        if best_match:
            logger.debug(f"No learned rule matched (best was {best_score:.0%} for '{best_match.get('original_topic', '')[:50]}')")
        else:
            logger.debug(f"No learned rules to compare against for '{extracted_topic[:60]}'")
        
        return None


# Quick test
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    tracker = CorrectionTracker()
    print(f"Doc ID mappings: {len(tracker.doc_id_to_topic)}")
    
    # Test doc ID extraction
    test_urls = [
        "https://docs.google.com/document/d/1CgOPtTgVhj6nq-uUAVbtnna9aDIdIDMw52Mm7KykrBw/edit",
        "https://docs.google.com/document/d/1QfP18CdjV7fQ60XshKNAKHCAqvOQ_wT3x2ZNrayuqqg/edit?usp=sharing",
        "Check out this link: https://docs.google.com/document/d/1ttUl4USNkBTF9GPL8f93IYlPQny5aRolYJeSLn3G6fI/view",
    ]
    
    for url in test_urls:
        doc_id = tracker._extract_doc_id(url)
        topic = tracker.doc_id_to_topic.get(doc_id, "Unknown")
        print(f"  {doc_id[:20]}... -> {topic}")
