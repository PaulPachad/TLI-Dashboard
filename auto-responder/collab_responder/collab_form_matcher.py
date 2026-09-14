"""
Collab Form Matcher

Reads topic/form pairs from a Google Spreadsheet and fuzzy-matches
an incoming pitch text to the best Google Form URL.

Spreadsheet layout (assumed):
  Column A  - Topic/Series name (e.g. "Women In Wellness", "Rising Stars")
  Column B  - Description / keywords (optional but improves matching)
  Column C  - Category (optional)
  Column D  - Google Form URL (the link we send to sources)

The matcher refreshes the spreadsheet data every CACHE_TTL_SECONDS seconds
so that changes to the sheet take effect without restarting the service.
"""

import os
import time
import logging
import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

try:
    from rapidfuzz import fuzz, process as rfprocess
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Public spreadsheet ID parsed from the URL the user provided
SPREADSHEET_ID = "1y5NjdBt_6_KsYKhMHNRxmGGb9KtJ3UvmIxYgB0LB5Y0"

# Sheet name / tab to read.  "Sheet1" is the default name for the first tab.
SHEET_TAB = "Sheet1"

# Columns to read  (A=0, B=1, C=2, D=3  when 0-indexed)
COL_TOPIC   = 1   # Column B – topic/series name
COL_KEYWORDS= 2   # Column C – extra keywords / description (optional)
COL_FORM    = 3   # Column D – Google Form URL

# Minimum fuzzy-match score (0-100) to accept a match
MATCH_THRESHOLD = 60

# How often to refresh the spreadsheet cache (seconds)
CACHE_TTL_SECONDS = 3600  # 1 hour

# Maximum number of active topics to keep in the pool (taken from the bottom of the sheet).
# This dynamically updates and slides forward when you add new rows, keeping the pool small
# and avoiding the need to manually change hardcoded row numbers.
MAX_ACTIVE_TOPICS = 35


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class FormEntry:
    """One row from the spreadsheet."""
    topic: str       # Column A value
    keywords: str    # Column B value (may be empty)
    form_url: str    # Column D value
    row_index: int   # 1-based row number for debugging


@dataclass
class FormMatch:
    """Result of a match attempt."""
    entry: FormEntry
    score: float     # 0–100
    match_type: str  # 'exact', 'fuzzy', or 'keyword'


# ---------------------------------------------------------------------------
# Spreadsheet reader
# ---------------------------------------------------------------------------

def _fetch_sheet_data_via_api(spreadsheet_id: str, sheet_tab: str, service) -> List[List[str]]:
    """Fetch sheet rows using the Google Sheets API service object."""
    range_name = f"{sheet_tab}!A:D"
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=range_name
    ).execute()
    return result.get("values", [])


def _fetch_sheet_data_public_csv(spreadsheet_id: str) -> List[List[str]]:
    """
    Fallback: fetch the first sheet as a CSV export (works for sheets that
    are publicly shared with 'Anyone with the link can view').
    """
    import urllib.request
    import csv
    import io

    url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=csv&gid=0"
    )
    logger.info(f"[CollabMatcher] Fetching spreadsheet via public CSV export: {url}")
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            content = resp.read().decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        return list(reader)
    except Exception as e:
        logger.error(f"[CollabMatcher] CSV export fetch failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Main matcher class
# ---------------------------------------------------------------------------

class CollabFormMatcher:
    """
    Reads Google Form topic/URL pairs from a spreadsheet and matches
    incoming pitch text to the best form.
    """

    def __init__(
        self,
        spreadsheet_id: str = SPREADSHEET_ID,
        sheet_tab: str = SHEET_TAB,
        sheets_service=None,
        match_threshold: float = MATCH_THRESHOLD,
        cache_ttl: float = CACHE_TTL_SECONDS,
    ):
        self.spreadsheet_id = spreadsheet_id
        self.sheet_tab = sheet_tab
        self.sheets_service = sheets_service   # Google Sheets API service (optional)
        self.match_threshold = match_threshold
        self.cache_ttl = cache_ttl

        self._entries: List[FormEntry] = []
        self._cache_time: float = 0.0

        # Load immediately
        self._refresh_if_needed(force=True)

    # ------------------------------------------------------------------
    # Cache management
    # ------------------------------------------------------------------

    def _refresh_if_needed(self, force: bool = False):
        """Reload entries from the spreadsheet if the cache has expired."""
        now = time.time()
        if not force and (now - self._cache_time) < self.cache_ttl:
            return

        logger.info("[CollabMatcher] Refreshing spreadsheet data...")
        rows = self._load_rows()
        entries = self._parse_rows(rows)

        if entries:
            self._entries = entries
            self._cache_time = now
            logger.info(f"[CollabMatcher] Loaded {len(entries)} form entries from spreadsheet")
        else:
            logger.warning("[CollabMatcher] No entries loaded — keeping previous cache")

    def _load_rows(self) -> List[List[str]]:
        """Load raw rows from the spreadsheet (API first, then CSV fallback)."""
        if self.sheets_service:
            try:
                return _fetch_sheet_data_via_api(
                    self.spreadsheet_id, self.sheet_tab, self.sheets_service
                )
            except Exception as e:
                logger.warning(f"[CollabMatcher] Sheets API failed: {e} — falling back to CSV")

        return _fetch_sheet_data_public_csv(self.spreadsheet_id)

    def _parse_rows(self, rows: List[List[str]]) -> List[FormEntry]:
        """Parse raw rows into FormEntry objects."""
        entries = []
        for i, row in enumerate(rows):
            # Skip header row (row 0) if it looks like a header
            if i == 0:
                first = (row[0] if row else "").lower()
                if first in ("topic", "series", "name", "title", ""):
                    continue

            # Need at least 4 columns for a form URL in column D
            if len(row) < 4:
                continue

            topic   = str(row[COL_TOPIC]).strip()
            keywords= str(row[COL_KEYWORDS]).strip() if len(row) > COL_KEYWORDS else ""
            form_url= str(row[COL_FORM]).strip()

            # Skip rows where topic or form URL are empty
            if not topic or not form_url:
                continue

            # Basic URL validation
            if not form_url.startswith("http"):
                continue

            entries.append(FormEntry(
                topic=topic,
                keywords=keywords,
                form_url=form_url,
                row_index=i + 1
            ))

        # Only keep the N most recently added topics from the bottom of the spreadsheet.
        # This keeps the selection pool small and automatically updates when new rows are added.
        return entries[-MAX_ACTIVE_TOPICS:]

    def force_refresh(self):
        """Force an immediate refresh of the spreadsheet cache."""
        self._refresh_if_needed(force=True)

    @property
    def entries(self) -> List[FormEntry]:
        """Current form entries (may trigger a cache refresh)."""
        self._refresh_if_needed()
        return self._entries

    # ------------------------------------------------------------------
    # Matching logic
    # ------------------------------------------------------------------

    def _get_subject_score(self, subject: str, entry: FormEntry) -> float:
        """Compute the subject match score for an entry."""
        if not subject:
            return 0.0
        topic = entry.topic.strip()
        if not topic:
            return 0.0

        topic_lower = topic.lower()
        
        # Primary topic is before the colon
        primary = topic_lower.split(":", 1)[0].strip() if ":" in topic_lower else topic_lower
        
        topic_core = _strip_common_prefixes(topic_lower)
        primary_core = _strip_common_prefixes(primary)

        clean_topic = _clean_text(topic_lower)
        clean_primary = _clean_text(primary)
        clean_core = _clean_text(topic_core)
        clean_prim_core = _clean_text(primary_core)
        clean_subj = _clean_text(subject)

        if not clean_subj:
            return 0.0

        scores = []
        if clean_topic:
            scores.append(fuzz.token_set_ratio(clean_subj, clean_topic))
        if clean_primary:
            scores.append(fuzz.token_set_ratio(clean_subj, clean_primary))
        if clean_core:
            scores.append(fuzz.token_set_ratio(clean_subj, clean_core))
        if clean_prim_core:
            scores.append(fuzz.token_set_ratio(clean_subj, clean_prim_core))

        return float(max(scores)) if scores else 0.0

    def find_best_match(self, pitch_text: str, top_n: int = 1) -> List[FormMatch]:
        """
        Find the best matching form entry for the given pitch text.
        Accepts pitch_text formatted as "Subject\n\nBody" to match them separately.

        Returns a list of up to `top_n` FormMatch results, ordered by score descending.
        Returns an empty list if no entry meets the MATCH_THRESHOLD.
        """
        self._refresh_if_needed()

        if not self._entries:
            logger.warning("[CollabMatcher] No entries available for matching")
            return []

        if not pitch_text or not pitch_text.strip():
            return []

        # Split into subject and body (if formatted as "subject\n\nbody")
        subject = ""
        body = pitch_text
        if "\n\n" in pitch_text:
            parts = pitch_text.split("\n\n", 1)
            subject = parts[0]
            body = parts[1]

        # Calculate subject scores first to identify any strong subject match
        subject_scores = {}
        for entry in self._entries:
            subject_scores[entry.row_index] = self._get_subject_score(subject, entry)

        has_strong_subject_match = any(score >= 50 for score in subject_scores.values())

        scored: List[FormMatch] = []

        for entry in self._entries:
            # If there is a topic that matches the subject line well (score >= 50),
            # exclude any topics that do not match the subject line (score < 35).
            if has_strong_subject_match and subject_scores[entry.row_index] < 35:
                continue

            score = self._score_entry(subject, body, entry)
            if score >= self.match_threshold:
                # Determine match type label
                if score >= 95:
                    match_type = "exact"
                elif score >= 80:
                    match_type = "fuzzy"
                else:
                    match_type = "keyword"

                scored.append(FormMatch(entry=entry, score=score, match_type=match_type))

        # Sort by score descending
        scored.sort(key=lambda m: m.score, reverse=True)

        return scored[:top_n]

    def _score_entry(self, subject: str, body: str, entry: FormEntry) -> float:
        """
        Compute a match score (0–100) between pitch subject/body and a form entry.
        Cleans both texts first by removing common stop words to prevent false positives,
        and heavily prioritizes subject line matches.
        """
        topic = entry.topic.strip()
        if not topic:
            return 0.0

        topic_lower = topic.lower()
        topic_core = _strip_common_prefixes(topic_lower)

        # Clean strings by removing stop words and punctuation
        clean_topic = _clean_text(topic_lower)
        clean_core = _clean_text(topic_core)

        if not clean_topic:
            return 0.0

        # 1. Score against Subject (high-signal)
        subject_score = self._get_subject_score(subject, entry)

        # 2. Score against Body (secondary-signal, noisier)
        body_score = 0.0
        if body:
            clean_body = _clean_text(body)
            if clean_body:
                if HAS_RAPIDFUZZ:
                    b_token = fuzz.token_set_ratio(clean_body, clean_topic)
                    b_partial = fuzz.partial_ratio(clean_body, clean_topic)
                    b_core = fuzz.token_set_ratio(clean_body, clean_core) if clean_core else 0
                    # Body is noisier, penalize it slightly to avoid false positives
                    body_score = max(b_token * 0.7, b_partial * 0.9, b_core * 0.8)
                else:
                    body_score = _simple_keyword_overlap(clean_body, clean_topic)

        # 3. Combined base scoring: prioritize subject match
        if subject_score >= 60:
            # If the subject has a solid match, boost the final base score
            # to make sure it beats any accidental body matches of other topics
            base_score = max(subject_score * 1.2, body_score)
            final_score = base_score + 15
        else:
            # Otherwise, use normal combination
            final_score = max(subject_score * 1.1, body_score)

        # 4. Keyword boost
        keyword_bonus = 0.0
        topic_words = clean_core.split()
        if topic_words:
            subj_hits = sum(1 for w in topic_words if subject and w in subject.lower()) if subject else 0
            body_hits = sum(1 for w in topic_words if body and w in body.lower()) if body else 0
            ratio = max(subj_hits / len(topic_words), body_hits / len(topic_words))
            keyword_bonus = ratio * 15  # up to 15 point boost

        # 5. Keywords column match
        keywords_score = 0.0
        if entry.keywords:
            clean_kw = _clean_text(entry.keywords)
            if clean_kw:
                subj_kw = fuzz.token_set_ratio(_clean_text(subject), clean_kw) * 0.9 if subject else 0.0
                body_kw = fuzz.token_set_ratio(_clean_text(body), clean_kw) * 0.7 if body else 0.0
                keywords_score = max(subj_kw, body_kw)

        return min(100.0, max(final_score, keywords_score) + keyword_bonus)

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get_all_topics(self) -> List[str]:
        """Return a list of all topic names in the spreadsheet."""
        return [e.topic for e in self.entries]

    def count(self) -> int:
        """Number of loaded form entries."""
        return len(self._entries)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COMMON_PREFIX_PATTERNS = [
    r'^(?:5|five)\s+things\s+i\s+wish\s+(?:someone|somebody)\s+told\s+me\s+before\s+i\s+became\s+(?:an?\s+)?',
    r'^(?:5|five)\s+things\s+i\s+wish\s+(?:someone|somebody)\s+told\s+me\s+',
    r'^(?:5|five)\s+things\s+',
    r'^how\s+to\s+',
    r'^the\s+',
    r'^a\s+',
    r'^an\s+',
]


def _strip_common_prefixes(text: str) -> str:
    """Strip common non-distinctive prefixes from a topic string."""
    original = text
    for pattern in _COMMON_PREFIX_PATTERNS:
        new = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
        if new and new != text:
            text = new
            break  # Only strip one prefix
    return text if text else original


def _simple_keyword_overlap(text: str, target: str) -> float:
    """Fallback scorer: fraction of target words found in text, scaled 0-100."""
    target_words = [w for w in re.split(r'\W+', target) if len(w) > 3]
    if not target_words:
        return 0.0
    hits = sum(1 for w in target_words if w in text)
    return (hits / len(target_words)) * 100.0


_STOP_WORDS = {
    'what', 'with', 'from', 'your', 'them', 'their', 'that', 'this', 'they', 
    'have', 'here', 'about', 'some', 'were', 'been', 'would', 'could', 'should',
    'will', 'shall', 'than', 'then', 'into', 'only', 'other', 'more', 'some',
    'how', 'who', 'why', 'when', 'where', 'which', 'whom', 'these', 'those',
    'and', 'the', 'for', 'you', 'are', 'our', 'not', 'can', 'before', 'became',
    'told', 'someone', 'somebody', 'wish', 'things', 'five', 'things', 'is', 
    'it', 'to', 'in', 'of', 'on', 'at', 'i', 'a', 'an', 'we', 'us', 'our', 'ours'
}


def _clean_text(text: str) -> str:
    """Strip punctuation and stop words to improve matching accuracy."""
    if not text:
        return ""
    words = re.findall(r'[a-z0-9]+', text.lower())
    filtered = [w for w in words if len(w) > 2 and w not in _STOP_WORDS]
    return " ".join(filtered)
