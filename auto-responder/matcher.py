"""
Topic matcher using fuzzy string matching to find the best interview series for a pitch.
Uses rapidfuzz for fast fuzzy matching and keyword-based scoring.
"""

from rapidfuzz import fuzz, process
import json
import os
import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class MatchResult:
    """Result of a topic match."""
    series_id: int
    name: str
    category: str
    link: str
    score: float
    match_type: str  # 'exact', 'fuzzy', 'keyword'


COMMON_PREFIXES = [
    # "5 Things I Wish Someone Told Me / I Knew Before I Became / Becoming" variations
    r'^(?:5|five) things i wish (?:someone|somebody) told me before (?:i became|becoming)\s+(?:an|a)?\s*',
    r'^(?:5|five) things i wish (?:i|someone|somebody) (?:knew|had known|told me) before (?:i became|becoming)\s+(?:an|a)?\s*',
    r'^(?:5|five) things i wish (?:i|someone|somebody) (?:knew|had known) when i (?:first )?became\s+(?:an|a)?\s*',
    r'^(?:5|five) things i wish (?:someone|somebody) told me before i became\s+(?:an|a)?\s*',
    r'^(?:5|five) things i wish (?:someone|somebody) told me when i first became\s+(?:an|a)?\s*',
    # New prefix patterns for "5 things/lessons I learned"
    r'^(?:5|five) (?:things|lessons) i learned (?:as|being)\s+(?:an|a)?\s*',
    r'^the (?:5|five) (?:things|lessons) i learned (?:as|being)\s+(?:an|a)?\s*',
    # "5 Things" variations
    r'^(?:5|five) things you need to know',
    r'^(?:5|five) things you need',
    r'^(?:5|five) things i wish (?:someone|somebody) told me when i first',
    r'^(?:5|five) things i wish (?:someone|somebody) told me',
    r'^(?:5|five) things i wish',
    r'^the (?:5|five) things',
    r'^(?:5|five) things',
    # Other common patterns
    r'^how to create a highly successful career',
    r'^to create a highly successful career',
    r'^create a highly successful career',
    r'^a highly successful career',
    r'^highly successful career',
]


def normalize_topic_for_exact(text: str) -> str:
    """Normalize text for exact title matching: normalize &, /, numbers, remove non-alphanumeric."""
    if not text:
        return ""
    t = text.lower()
    t = re.sub(r'&', ' and ', t)
    t = re.sub(r'/', ' and ', t)
    t = normalize_numbers_to_digits(t)
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def extract_topic_distinctive_part(text: str) -> tuple[str, bool]:
    """
    Extract distinctive part and return (distinctive_text, had_common_prefix).
    had_common_prefix is True ONLY when an actual prefix pattern from COMMON_PREFIXES matched.
    """
    text_lower = text.lower().strip()
    
    # Remove common form field prefixes that appear in some inputs
    text_norm = re.sub(r'\(choose one[^)]*\)\s*', '', text_lower)
    text_norm = re.sub(r'\(select one[^)]*\)\s*', '', text_norm)
    text_norm = re.sub(r'\(pick one[^)]*\)\s*', '', text_norm)
    text_norm = text_norm.strip()
    
    # Normalize "five" to "5" for prefix matching
    text_norm = re.sub(r'\bfive\b', '5', text_norm)
    
    # Strip numbered list prefixes (e.g., "120: How to Build..." or "53. 5 Tips...")
    text_norm = re.sub(r'^\d+[\.:]\s*', '', text_norm).strip()
    
    # Normalize symbols for clean matching
    text_norm = re.sub(r'&', ' and ', text_norm)
    text_norm = re.sub(r'/', ' and ', text_norm)
    
    # Remove non-alphanumeric noise characters (keep spaces, hyphens for names)
    text_norm = re.sub(r'[^a-z0-9\s\-]', ' ', text_norm)
    text_norm = re.sub(r'\s+', ' ', text_norm).strip()
    
    for pattern in COMMON_PREFIXES:
        match = re.match(pattern, text_norm, re.IGNORECASE)
        if match:
            # Return the part after the match
            remainder = text_norm[match.end():].strip()
            # Remove leading prepositions/helper words recursively
            while True:
                new_remainder = re.sub(r'^(in|as|to|about|for|the|a|an|before|after|on|of|with|by|how|successfully|successful)\s+', '', remainder)
                if new_remainder == remainder:
                    break
                remainder = new_remainder
            if len(remainder) >= 2:  # Allow short distinctive words like "ceo"
                return remainder, True
    
    # Also apply recursive leading word stripping if no prefix matched
    cleaned_norm = text_norm
    while True:
        new_text_norm = re.sub(r'^(in|as|to|about|for|the|a|an|before|after|on|of|with|by|how|successfully|successful)\s+', '', cleaned_norm)
        if new_text_norm == cleaned_norm:
            break
        cleaned_norm = new_text_norm
        
    return cleaned_norm, False


def strip_common_prefix(text: str) -> str:
    """
    Strip common topic prefixes to get the distinctive part of a topic name.
    
    For "5 Things I Wish Someone Told Me Before I Became a Chef", returns "chef".
    For "(Choose one please) 5 Things I Wish... CEO", returns "ceo".
    """
    distinctive, _ = extract_topic_distinctive_part(text)
    return distinctive


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOMAIN_ALIASES_PATH = os.path.join(BASE_DIR, "data", "domain_aliases.json")

ACRONYM_EQUIVALENCES = {
    "artificial intelligence": "ai",
    "public relations": "pr",
    "human resources": "hr",
    "virtual reality": "vr",
    "augmented reality": "ar",
    "chief revenue officer": "cro",
    "chief marketing officer": "cmo",
    "chief executive officer": "ceo",
    "chief financial officer": "cfo",
    "chief technology officer": "cto",
    "chief operating officer": "coo",
    "employee stock ownership plan": "esop",
    "employee stock ownership plans": "esops",
    "software as a service": "saas",
    "c suite exec": "c-suite executive",
    "c-suite exec": "c-suite executive",
    "c suite": "c-suite",
}

# Synonym mappings for common role/industry equivalents
# Maps search terms to what they should also match in topic names
# NOTE: Be SPECIFIC - avoid generic terms like 'business' that match many topics
ROLE_SYNONYMS = {
    # CEO/C-Suite mappings
    'ceo': ['c-suite executive', 'c-suite', 'chief executive'],
    'c-suite': ['c-suite executive', 'ceo'],
    'c suite': ['c-suite executive', 'c-suite', 'ceo'],
    'c suite exec': ['c-suite executive', 'c-suite', 'ceo'],
    'c-suite exec': ['c-suite executive', 'c-suite', 'ceo'],
    'exec': ['executive', 'c-suite executive'],
    
    # Filmmaker mappings
    'filmmaker': ['directors', 'producers'],
    'film maker': ['directors', 'producers', 'filmmaker'],
    'director': ['directors', 'producers'],
    'producer': ['directors', 'producers'],
    
    # Restaurant/Chef mappings
    'restauranteur': ['restaurateur'],  # Common misspelling
    'restaurateur': ['chef', 'restaurant'],
    'chef': ['restaurateur', 'restaurant'],
    
    # Athlete mappings  
    'athlete': ['professional athlete'],
    'professional athlete': ['athlete'],
    
    # Comedian mappings
    'comedian': ['professional comedian'],
    'professional comedian': ['comedian'],
    
    # Magician mappings
    'magician': ['professional magician'],
    'professional magician': ['magician'],
}

# Load domain aliases from external configuration if available
if os.path.exists(DOMAIN_ALIASES_PATH):
    try:
        with open(DOMAIN_ALIASES_PATH, "r", encoding="utf-8") as f:
            _aliases_data = json.load(f)
            if "acronym_equivalences" in _aliases_data:
                ACRONYM_EQUIVALENCES.update(_aliases_data["acronym_equivalences"])
            if "role_synonyms" in _aliases_data:
                for _k, _v in _aliases_data["role_synonyms"].items():
                    if _k in ROLE_SYNONYMS:
                        ROLE_SYNONYMS[_k] = list(dict.fromkeys(ROLE_SYNONYMS[_k] + _v))
                    else:
                        ROLE_SYNONYMS[_k] = _v
    except Exception:
        pass


def decompose_pitch_topic(text: str) -> tuple[str, Optional[str]]:
    """
    Decompose a pitch topic into an umbrella series name and an article subtitle/hook.
    e.g., 'The Future of AI: Control Points' -> ('The Future of AI', 'Control Points')
    Returns (primary, subtitle). Subtitle is None if no separator found.
    """
    if not text:
        return "", None

    for sep in [":", " — ", " – ", " - "]:
        if sep in text:
            parts = text.split(sep, 1)
            primary = parts[0].strip()
            subtitle = parts[1].strip()
            if len(primary) >= 3 and len(subtitle) >= 3:
                return primary, subtitle

    return text.strip(), None

BECAME_FINGERPRINTS = {
    # 'founder' is now a real topic - no redirect needed
    # Keep 'entrepreneur' redirecting since it's semantically similar to "Launched My Business"
    'entrepreneur': 'launched my business or startup',
    'startup founder': 'founder',  # Redirect to the actual Founder topic
    'business owner': 'launched my business or startup',
}


def expand_synonyms(term: str) -> list:
    """Get a list of synonyms for a term, including the term itself."""
    term_lower = term.lower()
    synonyms = [term_lower]
    if term_lower in ROLE_SYNONYMS:
        synonyms.extend(ROLE_SYNONYMS[term_lower])
    return synonyms


# Stopwords to exclude from fingerprint matching
# These common words should never be used as unique fingerprints
FINGERPRINT_STOPWORDS = {
    # Articles and determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those',
    # Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'over', 'out', 'off', 'up', 'down',
    # Conjunctions
    'and', 'or', 'but', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    # Pronouns
    'you', 'your', 'yours', 'we', 'our', 'ours', 'they', 'their', 'theirs',
    'it', 'its', 'who', 'whom', 'whose', 'which', 'what', 'that',
    'i', 'me', 'my', 'mine', 'he', 'him', 'his', 'she', 'her', 'hers',
    # Common verbs
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'need', 'want', 'get', 'got', 'make', 'made', 'take', 'took',
    'come', 'came', 'go', 'went', 'give', 'gave', 'know', 'knew', 'see', 'saw',
    'find', 'found', 'keep', 'kept', 'let', 'put', 'say', 'said', 'tell', 'told',
    # Common adverbs/adjectives
    'how', 'when', 'where', 'why', 'all', 'each', 'every', 'any', 'some',
    'many', 'much', 'more', 'most', 'other', 'such', 'only', 'own', 'same',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
    'again', 'ever', 'never', 'always', 'often', 'still', 'already', 'even',
    'well', 'back', 'long', 'little', 'big', 'great', 'good', 'new', 'old',
    'first', 'last', 'next', 'high', 'few',
    # Topic-common words (appear in many topic titles)
    'things', 'thing', 'ways', 'way', 'tips', 'top', 'best', 'create',
    'become', 'successful', 'highly', 'industry', 'career', 'business',
    'work', 'people', 'life', 'world', 'time', 'year', 'today', 'future',
    'interview', 'interviewer', 'series',
    # Common gerunds/participles that appear as fragments of compound words
    # e.g., "high-performing" -> "performing", "team-building" -> "building"
    'performing', 'leading', 'building', 'creating', 'making',
    'rising', 'growing', 'changing', 'transforming', 'improving',
    # Common English verbs/nouns that should NOT be unique fingerprints
    # e.g., 'works' was falsely unique to the PR topic, causing
    # "Weight Loss That Works" -> "Public Relations: How PR Works"
    'works', 'working', 'help', 'helping', 'lose', 'losing',
    'weight', 'brain', 'loss', 'using', 'power', 'turn', 'turning',
    'start', 'started', 'starting', 'live', 'lived', 'living',
    'look', 'looking', 'looks', 'open', 'opened', 'opening',
    'run', 'running', 'runs', 'play', 'playing', 'plays',
    'read', 'reading', 'write', 'writing', 'learn', 'learning',
    'move', 'moving', 'show', 'showing', 'call', 'calling',
    'point', 'points', 'side', 'sides', 'part', 'parts', 'place', 'places',
    'case', 'cases', 'fact', 'facts', 'line', 'lines', 'step', 'steps',
    'idea', 'ideas', 'rule', 'rules', 'goal', 'goals', 'trait', 'traits',
    'right', 'left', 'real', 'true', 'free', 'full', 'name',
    'school', 'schools', 'parents', 'parent', 'children', 'child', 
    'thrive', 'thriving', 'excel', 'excelling', 'personal', 'leaders', 
    'leadership', 'women', 'woman', 'female', 'male', 'men', 'man', 
    'family', 'families',
}


# Number-word equivalence mapping for normalization
# Converts spelled-out numbers to digit form so "20-Something" matches "Twenty-Something"
NUMBER_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
    'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
    'eighty': '80', 'ninety': '90', 'hundred': '100',
}

# Reverse mapping: digits to words (for normalizing in the other direction)
DIGIT_TO_WORD = {v: k for k, v in NUMBER_WORDS.items()}

def normalize_numbers_to_digits(text: str) -> str:
    """Normalize spelled-out numbers to digits, gender terms, and domain acronyms for consistent matching.
    
    E.g., 'twenty-something' -> '20-something', 'five things' -> '5 things', 'female'/'woman' -> 'women',
    'artificial intelligence' -> 'ai', 'public relations' -> 'pr', etc.
    """
    result = text.lower()
    # Sort by length descending to replace longer words first (e.g., 'seventeen' before 'seven')
    for word in sorted(NUMBER_WORDS.keys(), key=len, reverse=True):
        # Use word boundary matching to avoid partial replacements
        result = re.sub(r'\b' + word + r'\b', NUMBER_WORDS[word], result)
    # Normalize gender synonyms (female, woman -> women) for better fuzzy match scores
    result = re.sub(r'\bfemale\b', 'women', result)
    result = re.sub(r'\bwoman\b', 'women', result)
    # Normalize acronym equivalences (sorted by length descending, e.g. multi-word phrases first)
    for phrase, acronym in sorted(ACRONYM_EQUIVALENCES.items(), key=lambda x: len(x[0]), reverse=True):
        result = re.sub(r'\b' + re.escape(phrase) + r'\b', acronym, result)
    return result


def _clean_word_set(text: str, *, keep_short: bool = False) -> set:
    """Return meaningful lowercase words for guarded exact/near-exact checks."""
    min_len = 2 if keep_short else 4
    words = re.findall(r'\b[a-z0-9]+\b', text.lower())
    return {
        word
        for word in words
        if len(word) >= min_len and word not in FINGERPRINT_STOPWORDS
    }


def _industry_discriminator_words(text: str) -> set:
    """Return the meaningful words immediately identifying an industry.

    Many series names share a long template such as "Five Things You Need To
    Create A Highly Successful Career In The ... Industry".  Whole-string
    similarity therefore overweights the template and can hide a contradictory
    industry name.  Looking at the short phrase immediately before "industry"
    preserves the part that actually distinguishes those topics (for example,
    ``{"modern", "beauty"}`` versus ``{"ai"}``).
    """
    words = re.findall(r'\b[a-z0-9]+\b', (text or "").lower())
    discriminators = set()

    for index, word in enumerate(words):
        if word not in {'industry', 'industries'}:
            continue

        # Six words is long enough for qualifiers such as "health and wellness"
        # while the existing stopword list removes the shared title scaffolding.
        for candidate in words[max(0, index - 6):index]:
            if len(candidate) >= 2 and candidate not in FINGERPRINT_STOPWORDS:
                discriminators.add(candidate)

    return discriminators


def _industry_terms_are_compatible(search_text: str, topic_name: str) -> bool:
    """Reject a candidate when both titles name disjoint industries or conflicting topics."""
    search_lower = (search_text or "").lower()
    topic_lower = (topic_name or "").lower()

    # Shared title scaffolding is not evidence that the subjects agree.
    # Compare the subject before the subtitle, so "space travel" in a subtitle
    # cannot turn a space pitch into the unrelated Future of Travel series.
    for pattern, heading_only in (
        (r'\bthe future of (.+)', True),
        (r'\bhighly effective (.+?)(?:\s+during\b|$)', False),
    ):
        search_subject = re.search(pattern, search_lower.split(':', 1)[0] if heading_only else search_lower)
        topic_subject = re.search(pattern, topic_lower.split(':', 1)[0] if heading_only else topic_lower)
        if search_subject and topic_subject:
            search_words = set(normalize_topic_for_exact(search_subject.group(1)).split())
            topic_words = set(normalize_topic_for_exact(topic_subject.group(1)).split())
            if not search_words & topic_words:
                return False

    # Reject male-dominated vs female-founder contradiction
    if ("male dominated" in search_lower or "male-dominated" in search_lower) and ("female founder" in topic_lower or "woman founder" in topic_lower):
        return False
    if ("female founder" in search_lower or "woman founder" in search_lower) and ("male dominated" in topic_lower or "male-dominated" in topic_lower):
        return False

    search_terms = _industry_discriminator_words(search_text)
    topic_terms = _industry_discriminator_words(topic_name)
    return not search_terms or not topic_terms or bool(search_terms & topic_terms)


def _looks_like_direct_topic_text(text: str) -> bool:
    """Return True when find_matches received a topic string, not a full email."""
    stripped = (text or "").strip()
    if not stripped or len(stripped) > 250:
        return False

    if re.search(
        r'(Dear Authority Magazine Editors|Your \d+ word pitch|What is the name of the interview topic|best email to follow up)',
        stripped,
        re.IGNORECASE,
    ):
        return False

    non_empty_lines = [line for line in stripped.splitlines() if line.strip()]
    return len(non_empty_lines) <= 2


class TopicMatcher:

    """Matches pitch text to interview series topics."""
    
    def __init__(self, database_path: str = None):
        """Initialize with the interview series database."""
        if database_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            database_path = os.path.join(base_dir, "data", "interview_series.json")
        
        with open(database_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Handle both old format {'series': [...]} and new format [...]
        if isinstance(data, list):
            self.series = data
        else:
            self.series = data.get('series', data)
        
        # Build lookups - use ID-based keys to handle duplicate names safely
        self.id_to_series = {s['id']: s for s in self.series}
        
        # For fuzzy matching, use the series names directly (mapping matched choice by sequence index)
        self.series_choices = [s['name'] for s in self.series]
        # Precompute normalized choices for faster matching
        self.series_choices_normalized = [normalize_numbers_to_digits(c) for c in self.series_choices]
        
        # Keep series_names for compatibility but note it may have duplicates
        self.series_names = [s['name'] for s in self.series]
        
        # Build keyword index for faster keyword matching
        self.keyword_index = {}
        for s in self.series:
            for kw in s.get('keywords', []):
                if kw not in self.keyword_index:
                    self.keyword_index[kw] = []
                self.keyword_index[kw].append(s['id'])
        
        # Build unique word fingerprint index
        # Maps each word to the set of topic IDs it appears in
        self._word_to_topic_ids = {}
        for s in self.series:
            # Extract words from topic name (lowercase, alphanumeric only)
            name_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', s['name'].lower())
            words = name_clean.split()
            for word in words:
                # Only index words that are 4+ chars and not stopwords
                if len(word) >= 4 and word not in FINGERPRINT_STOPWORDS:
                    if word not in self._word_to_topic_ids:
                        self._word_to_topic_ids[word] = set()
                    self._word_to_topic_ids[word].add(s['id'])
        
        # Create reverse lookup: unique words (appear in only 1 topic)
        self._unique_fingerprints = {
            word: list(topic_ids)[0]
            for word, topic_ids in self._word_to_topic_ids.items()
            if len(topic_ids) == 1
        }
        
        # Initialize learned rules lookup (lazy import to avoid circular dependency)
        self._learned_rules_tracker = None
        self._init_learned_rules()

        # Initialize optional LLM arbiter for ambiguous/borderline cases
        self.arbiter = None
        self._init_arbiter()
    
    def _init_learned_rules(self):
        """Initialize the learned rules tracker for Stage 0 matching."""
        try:
            from correction_tracker import CorrectionTracker
            self._learned_rules_tracker = CorrectionTracker()
        except Exception as e:
            # If correction_tracker isn't available, continue without learned rules
            import logging
            logging.getLogger(__name__).warning(f"Could not initialize learned rules: {e}")
            self._learned_rules_tracker = None

    def _init_arbiter(self):
        """Initialize optional LLM arbiter."""
        try:
            from llm_arbiter import LLMArbiter
            self.arbiter = LLMArbiter()
        except Exception:
            self.arbiter = None
    
    def reload_learned_rules(self):
        """Reload learned rules (call after service restart or rules change)."""
        self._init_learned_rules()
    
    def _check_fingerprint_confirmation(self, search_text: str, candidate_topic_id: int) -> bool:
        """
        Check if any unique word fingerprint in the search text confirms the candidate topic.
        
        Returns True if a unique word points to the same topic as the candidate.
        """
        # Extract words from search text
        search_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', search_text.lower())
        search_words = search_clean.split()
        
        for word in search_words:
            # Skip short words and stopwords
            if len(word) < 4 or word in FINGERPRINT_STOPWORDS:
                continue
            
            # Check if this word is a unique fingerprint
            if word in self._unique_fingerprints:
                fingerprint_topic_id = self._unique_fingerprints[word]
                if fingerprint_topic_id == candidate_topic_id:
                    candidate = self.id_to_series.get(candidate_topic_id)
                    if candidate and len(search_words) == 1:
                        cand_words = _clean_word_set(candidate['name'])
                        if len(cand_words) > 4 and len(candidate['name']) > 30:
                            continue
                    # Found a unique word that confirms this candidate!
                    return True
        
        return False

    def extract_topic_from_pitch(self, pitch_text: str) -> Optional[str]:
        """
        Extract the interview topic from a structured pitch format.
        Pitches often contain: "What is the name of the interview topic you are pitching for?"
        """
        patterns = [
            r'What is the name of the interview topic you are pitching for\??(?:\s*\([^)]*\))?[:\s\t]*((?:(?!\r?\n\r?\n)(?!Your \d+ word)[\s\S])+)',
            r'interview topic you are pitching for\??(?:\s*\([^)]*\))?[:\s\t]*((?:(?!\r?\n\r?\n)(?!Your \d+ word)[\s\S])+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, pitch_text, re.IGNORECASE)
            if match:
                topic = match.group(1).strip()
                # Clean up the topic
                topic = re.sub(r'\s+', ' ', topic)
                
                # === INPUT CLEANING (handles real-world noise patterns) ===
                
                # 1. Strip HTML tags (some pitches have raw HTML table markup)
                if '<' in topic and '>' in topic:
                    topic = re.sub(r'<[^>]+>', ' ', topic)
                    topic = re.sub(r'\s+', ' ', topic).strip()
                
                # 2. Extract topic from URL (some people paste Medium search URLs)
                #    e.g. "https://medium.com/.../search?q=Creating+a+Culture+of+Courage"
                #    -> "Creating a Culture of Courage"
                url_match = re.match(r'https?://\S+', topic)
                if url_match:
                    q_match = re.search(r'[?&]q=([^&]+)', topic)
                    if q_match:
                        from urllib.parse import unquote_plus
                        topic = unquote_plus(q_match.group(1)).strip()
                    else:
                        # URL with no query param — can't extract, skip
                        continue
                
                # 2b. Strip trailing URLs or search links from the topic name
                #     e.g. "Women in Tech - https://medium.com/..." -> "Women in Tech"
                topic = re.sub(r'\s*-\s*https?://\S+', '', topic)
                topic = re.sub(r'\s*https?://\S+', '', topic).strip()
                
                # 3. Normalize special characters
                #    Em-dash → hyphen, smart quotes → straight quotes
                topic = topic.replace('\u2014', '-')   # em-dash —
                topic = topic.replace('\u2013', '-')   # en-dash –
                topic = topic.replace('\u201c', '"')   # left smart quote "
                topic = topic.replace('\u201d', '"')   # right smart quote "
                topic = topic.replace('\u2018', "'")   # left single smart quote '
                topic = topic.replace('\u2019', "'")   # right single smart quote '
                topic = topic.replace('\u00e2\u0080\u0093', '-')  # mojibake en-dash
                topic = topic.replace('\u00e2\u0080\u0094', '-')  # mojibake em-dash
                
                # 4. Strip trailing ">" arrows (common noise from form pasting)
                #    e.g. "Social impact >>" -> "Social impact"
                topic = re.sub(r'\s*>+\s*$', '', topic).strip()
                # Also handle interspersed arrows: "The Myth >>>> of Aging >>>>"
                topic = re.sub(r'\s*>+\s*', ' ', topic)
                topic = re.sub(r'\s+', ' ', topic).strip()
                
                # 5. Strip numbered list prefixes (people copy from numbered lists)
                #    e.g. "120: How to Build..." or "53. 5 Tips..."
                #    The existing leading-punctuation strip handles "." but not "120:"
                topic = re.sub(r'^\d+[\.:]\s*', '', topic).strip()
                
                # Remove common form field prefixes that appear in some pitches
                # e.g., "(Choose one please) 5 Things I Wish..."
                # Remove ALL occurrences (some pitches have it twice)
                topic = re.sub(r'\(Choose one[^)]*\)\s*', '', topic, flags=re.IGNORECASE)
                topic = re.sub(r'\(Select one[^)]*\)\s*', '', topic, flags=re.IGNORECASE)
                topic = re.sub(r'\(Pick one[^)]*\)\s*', '', topic, flags=re.IGNORECASE)
                topic = topic.strip()
                
                # Strip leading punctuation noise (stray periods, commas, dashes, etc.)
                topic = re.sub(r'^[.\-,;:!?*#]+\s*', '', topic).strip()
                
                # Fix 2: Smart colon truncation for description-contaminated topics
                # e.g. "Big Ideas that May Change The World: a new methodology to herald..."
                # -> "Big Ideas that May Change The World"
                # Only truncate if text AFTER colon is long (>20 chars) indicating description,
                # NOT for legitimate colons in topic names like "Power Women: How To..."
                if ':' in topic:
                    colon_pos = topic.index(':')
                    before_colon = topic[:colon_pos].strip()
                    after_colon = topic[colon_pos + 1:].strip()
                    # Only truncate if: before has enough content (>15 chars = real topic),
                    # after is long (>20 chars = description text), and
                    # after starts lowercase or with articles (description pattern)
                    if (len(before_colon) > 15 and len(after_colon) > 20 and
                        (after_colon[0].islower() or after_colon.lower().startswith(('a ', 'an ', 'the ', 'how ', 'why ', 'what ')))):
                        topic = before_colon
                
                # Truncate contaminating description text that sometimes 
                # bleeds in from pitch forms (e.g., "Topic Name This aligns strongly...")
                # Real topic names don't contain these sentence-starting phrases.
                # Only trigger if the marker appears after 30+ chars (a real topic name
                # exists before it) to avoid false positives on short phrases.
                description_markers = [
                    r'\s+This\s+(?:aligns|is\s+a|is\s+the|was|would|could|should|will|has|focuses|covers|fits|matches|relates)',
                    r'\s+I\s+(?:would\s+like|believe|think|feel|am\s+pitching|have\s+been|want\s+to)',
                    r'\s+My\s+(?:client|pitch|expertise|background|experience)',
                    r'\s+We\s+(?:would\s+like|believe|think|are\s+pitching|have\s+been|want\s+to)',
                    r'\s+As\s+(?:a\s+(?:client|company|firm|brand)|an\s+(?:expert|author|executive|organization))',
                    r'\s+Our\s+(?:client|pitch|CEO|founder|expert)',
                    r'\s+Based\s+on\s+(?:my|our|the|this)',
                    r'\s+Please\s+(?:consider|see|note|let)',
                ]
                for marker in description_markers:
                    marker_match = re.search(marker, topic, re.IGNORECASE)
                    if marker_match and marker_match.start() >= 30:
                        # Truncate at this point — everything before is the topic name
                        truncated = topic[:marker_match.start()].strip()
                        if len(truncated) > 3:
                            topic = truncated
                            break
                
                if len(topic) > 3 and len(topic) < 600: # Increased from 200 to 600 to allow multiple topics with URLs
                    return topic
        
        return None
    
    def find_matches(self, pitch_text: str, top_n: int = 5) -> List[MatchResult]:
        """Apply subject compatibility to every matching path, including boosts and optional LLM arbitration."""
        search_text = self.extract_topic_from_pitch(pitch_text) or pitch_text
        results = self._find_matches(pitch_text, top_n=len(self.series))
        filtered = [result for result in results
                    if result.link and _industry_terms_are_compatible(search_text, result.name)]
        
        # Optional LLM second opinion for ambiguous / borderline matches
        if self.arbiter and self.arbiter.is_available() and filtered:
            needs_arbiter = False
            if 70.0 <= filtered[0].score < 96.0:
                needs_arbiter = True
            elif len(filtered) > 1 and abs(filtered[0].score - filtered[1].score) < 5.0 and filtered[0].score < 98.0:
                needs_arbiter = True
            
            if needs_arbiter:
                verification = self.arbiter.verify_candidates(pitch_text, filtered[:5])
                if verification and verification.get("matched_series_id"):
                    target_id = verification["matched_series_id"]
                    for idx, res in enumerate(filtered):
                        if res.series_id == target_id:
                            boosted = MatchResult(
                                series_id=res.series_id,
                                name=res.name,
                                category=res.category,
                                link=res.link,
                                score=97.0,
                                match_type=f"llm_verified_{res.match_type}"
                            )
                            filtered.pop(idx)
                            filtered.insert(0, boosted)
                            break
        
        return filtered[:top_n]

    def _find_matches(self, pitch_text: str, top_n: int = 5) -> List[MatchResult]:
        """
        Find the best matching interview series for the given pitch text.
        
        Args:
            pitch_text: The text of the pitch to analyze
            top_n: Number of top matches to return
            
        Returns:
            List of MatchResult objects sorted by score (highest first)
        """
        pitch_lower = pitch_text.lower()
        results = []
        seen_ids = set()
        
        # Stage 0: Try to extract the topic from structured pitch format
        extracted_topic = self.extract_topic_from_pitch(pitch_text)
        search_text = extracted_topic if extracted_topic else pitch_text
        search_lower = search_text.lower()
        
        # EXACT OVERRIDE for "5 things ceo" vs "founder" confusion
        # The user asked that when we see specifically "5 things ceo" or "five things ceo", we auto-get the right link.
        test_norm = re.sub(r'[^a-z0-9\s]', '', search_lower.strip())
        test_norm = re.sub(r'\s+', ' ', test_norm)
        if test_norm in ['5 things ceo', 'five things ceo', '5 things i wish someone told me before i became a ceo', 'five things i wish someone told me before i became a ceo']:
            for s in self.series:
                if '5 Things I Wish Someone Told Me Before I Became a CEO' in s['name'] or s['name'] == '5 Things I Wish Someone Told Me Before I Became a CEO':
                    return [MatchResult(
                        series_id=s['id'],
                        name=s['name'],
                        category=s['category'],
                        link=s['link'],
                        score=100.0,
                        match_type='exact_override'
                    )]
        
        # Stage 0.4: Check learned rules (Priority Override)
        # Moved BEFORE Stage 0.5 to ensure manual corrections win over fuzzy-exact matches.
        # Check either extracted_topic or search_text when it represents direct topic text.
        if (extracted_topic or _looks_like_direct_topic_text(search_text)) and self._learned_rules_tracker:
            target_topic = extracted_topic or search_text
            learned_match = self._learned_rules_tracker.find_learned_match(target_topic)
            if learned_match:
                topic_name = learned_match.get("topic_name")
                doc_id = learned_match.get("doc_id")
                match_type = learned_match.get("match_type", "learned")
                
                # A fuzzy learned pattern match must never override an exact database topic match.
                # Only learned_exact (an explicit user correction for this exact phrase) can override exact topics.
                skip_learned = False
                if match_type == "learned_pattern":
                    target_norm = normalize_topic_for_exact(target_topic)
                    if any(normalize_topic_for_exact(s['name']) == target_norm for s in self.series):
                        skip_learned = True

                if not skip_learned:
                    for series in self.series:
                        series_doc_id = None
                        if series.get('link'):
                            import re as re_local
                            doc_match = re_local.search(r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)', series['link'])
                            if doc_match:
                                series_doc_id = doc_match.group(1)
                        
                        if (series_doc_id == doc_id or series['name'] == topic_name) and _industry_terms_are_compatible(target_topic, series['name']):
                            return [MatchResult(
                                series_id=series['id'],
                                name=series['name'],
                                category=series['category'],
                                link=series['link'],
                                score=98.0,
                                match_type=match_type
                            )]

        # Stage 0.45: Unique known topic prefix before a colon or separator.
        # Some form choices preserve the series brand before ":" but slightly vary the
        # subtitle. Also, submitters frequently write only the primary series title
        # (e.g. "The Future of Beauty" or "Guardians of AI") without the explanatory subtitle.
        # Conversely, submitters may add a colon with their specific article angle
        # (e.g. "The Future of AI: Control Points") to a series that has no colon in the DB.
        # If that prefix identifies exactly one topic in the database, trust it directly.
        primary_submitted, submitted_sub = decompose_pitch_topic(search_text)
        submitted_prefix = re.sub(r'\s+', ' ', primary_submitted).strip().lower()
        basic_stopwords = {'the', 'a', 'an', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'is', 'at', 'by'}
        prefix_substantive_words = [w for w in submitted_prefix.split() if w not in basic_stopwords]

        if len(submitted_prefix) >= 8 and len(prefix_substantive_words) >= 1 and len(submitted_prefix.split()) >= 2:
            prefix_matches = []
            for series in self.series:
                series_primary, series_sub = decompose_pitch_topic(series['name'])
                # Prefix matching applies when either the search text or the series name uses a separator/colon
                if not submitted_sub and not series_sub and ":" not in series['name'] and ":" not in search_text:
                    continue
                series_prefix = re.sub(r'\s+', ' ', series_primary).strip().lower()
                if (series_prefix == submitted_prefix or 
                    normalize_topic_for_exact(series_prefix) == normalize_topic_for_exact(submitted_prefix) or
                    fuzz.ratio(submitted_prefix, series_prefix) >= 95 or
                    (series_prefix.startswith('the future of ') and
                     submitted_prefix.startswith(series_prefix + ' '))):
                    if _industry_terms_are_compatible(search_text, series['name']):
                        prefix_matches.append(series)

            if len(prefix_matches) == 1:
                series = prefix_matches[0]
                return [MatchResult(
                    series_id=series['id'],
                    name=series['name'],
                    category=series['category'],
                    link=series['link'],
                    score=98.0,
                    match_type='unique_colon_prefix'
                )]
        
        # Stage 0.5: Exact Name Match (highest fidelity)
        # Compare the full topic string against ALL topic names in the DB.
        # This MUST run before learned rules to prevent fuzzy rules from overriding actual topics.
        # This prevents false positives where word fragments (CEO, Founder) cause
        # wrong matches via fuzzy/substring logic.
        # process_pitch() passes already-extracted form values into find_matches(),
        # so allow this path for short direct topic strings too.
        if extracted_topic or _looks_like_direct_topic_text(search_text):
            best_exact_score = 0
            best_exact_series = None
            search_norm = re.sub(r'\s+', ' ', search_text).strip()
            
            # Fix D: Normalize numbers for comparison so "20" matches "twenty", etc.
            search_norm_digits = normalize_numbers_to_digits(search_norm)
            search_norm_full = normalize_topic_for_exact(search_text)
            
            for series in self.series:
                name_norm = re.sub(r'\s+', ' ', series['name']).strip()
                # Full-name similarity using fuzz.ratio (character-level, order-sensitive)
                exact_score = fuzz.ratio(search_norm.lower(), name_norm.lower())
                
                # Fix D: Also try with number-normalized versions
                name_norm_digits = normalize_numbers_to_digits(name_norm)
                exact_score_digits = fuzz.ratio(search_norm_digits, name_norm_digits)
                
                # Full normalization (numbers, &, /, punctuation)
                name_norm_full = normalize_topic_for_exact(series['name'])
                exact_score_full = fuzz.ratio(search_norm_full, name_norm_full)
                exact_score = max(exact_score, exact_score_digits, exact_score_full)
                
                if exact_score > best_exact_score:
                    best_exact_score = exact_score
                    best_exact_series = series
            
            if (best_exact_score >= 92 and best_exact_series and
                _industry_terms_are_compatible(search_text, best_exact_series['name'])):
                if "women leading" in best_exact_series['name'].lower() and "industry" in best_exact_series['name'].lower():
                    search_norm_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', search_norm.lower())
                    search_words = set(search_norm_clean.split())
                    
                    # Extract industry name from topic (e.g. "AI", "Space", "Cybersecurity")
                    # Patterns: "Leading the [Industry] Industry" or "Leading the [Industry] Industries"
                    industry_pattern = r'leading (?:the )?(.*?) industr(?:y|ies)'
                    industry_match = re.search(industry_pattern, best_exact_series['name'].lower())
                    if industry_match:
                        target_industry = industry_match.group(1).strip()
                        # Use word matching to be safe
                        target_words = set(re.sub(r'[^a-z0-9\s]', ' ', target_industry).split())
                        # If target_words (e.g. {'ai'}) not in search_words, it's a false positive
                        if not (target_words & search_words):
                            # Not an exact match after all! Fall through to later stages.
                            pass
                        else:
                            # Confirmed match
                            return [MatchResult(
                                series_id=best_exact_series['id'],
                                name=best_exact_series['name'],
                                category=best_exact_series['category'],
                                link=best_exact_series['link'],
                                score=100.0,
                                match_type='exact_name'
                            )]
                else:
                    # Normal exact match
                    return [MatchResult(
                        series_id=best_exact_series['id'],
                        name=best_exact_series['name'],
                        category=best_exact_series['category'],
                        link=best_exact_series['link'],
                        score=100.0,
                        match_type='exact_name'
                    )]
        
            # Stage 0.5b: Exact Number Normalization Match
            # If number-normalized ratio was >= 90 (close match with number equivalence like "20" vs "twenty"), accept it.
            if (best_exact_score >= 90 and best_exact_series and
                _industry_terms_are_compatible(search_text, best_exact_series['name'])):
                name_norm_check = re.sub(r'\s+', ' ', best_exact_series['name']).strip()
                raw_score = fuzz.ratio(search_norm.lower(), name_norm_check.lower())
                digit_score = fuzz.ratio(search_norm_digits, normalize_numbers_to_digits(name_norm_check))
                if digit_score > raw_score and digit_score >= 90:
                    return [MatchResult(
                        series_id=best_exact_series['id'],
                        name=best_exact_series['name'],
                        category=best_exact_series['category'],
                        link=best_exact_series['link'],
                        score=100.0,
                        match_type='exact_name_number_normalized'
                    )]

            # Stage 0.6: Industry discriminator recovery.
            # A submitted title can accidentally combine one standard title's
            # boilerplate with another title's industry phrase.  When every
            # submitted discriminator word occurs in one database topic, prefer
            # that topic rather than the superficially similar boilerplate.
            search_industry_terms = _industry_discriminator_words(search_text)
            if len(search_industry_terms) >= 2:
                industry_candidates = []
                for series in self.series:
                    candidate_terms = _industry_discriminator_words(series['name'])
                    shared_terms = search_industry_terms & candidate_terms
                    if shared_terms == search_industry_terms:
                        candidate_score = fuzz.token_set_ratio(
                            search_norm_digits,
                            normalize_numbers_to_digits(series['name'])
                        )
                        industry_candidates.append((
                            len(shared_terms),
                            len(shared_terms) / len(candidate_terms) if candidate_terms else 0,
                            candidate_score,
                            series,
                        ))

                if industry_candidates:
                    industry_candidates.sort(key=lambda item: item[:3], reverse=True)
                    _, candidate_coverage, candidate_score, industry_series = industry_candidates[0]
                    if candidate_coverage >= 0.5 and candidate_score >= 70:
                        return [MatchResult(
                            series_id=industry_series['id'],
                            name=industry_series['name'],
                            category=industry_series['category'],
                            link=industry_series['link'],
                            score=96.0,
                            match_type='industry_discriminator'
                        )]

            # Stage 0.65: Title Formula Match
            # Many pitches copy the full article formula from Authority Magazine's pitch form
            # (e.g. "On The Five Things You Need To Thrive and Succeed as a Woman In a Male-Dominated Industry").
            # Matching against title_formula from the CSV captures these directly.
            if len(search_norm_full) >= 15:
                formula_candidates = []
                for series in self.series:
                    formula = series.get('title_formula', '')
                    if not formula:
                        continue
                    if not _industry_terms_are_compatible(search_text, series['name']):
                        continue
                    clean_formula = re.sub(r'\([^\)]+\)', ' ', formula)
                    clean_formula = re.sub(r'\s+', ' ', clean_formula).strip()
                    formula_norm = normalize_topic_for_exact(clean_formula)

                    # A formula's exact series heading outranks an embedded
                    # substring. Never prefer a more qualified title merely
                    # because it is longer (e.g. Black Men and Women...).
                    formula_heading = normalize_topic_for_exact(clean_formula.split(':', 1)[0])
                    heading_exact = search_norm_full == formula_heading
                    title_similarity = fuzz.ratio(search_norm_full, normalize_topic_for_exact(series['name']))
                    if search_norm_full in formula_norm:
                        formula_candidates.append((101 if heading_exact else 100, title_similarity, series))
                    else:
                        pr = fuzz.partial_ratio(search_norm_full, formula_norm)
                        if pr >= 95 and fuzz.token_set_ratio(search_norm_full, formula_norm) >= 90:
                            formula_candidates.append((pr, title_similarity, series))

                if formula_candidates:
                    formula_candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                    best_formula_series = formula_candidates[0][2]
                    return [MatchResult(
                        series_id=best_formula_series['id'],
                        name=best_formula_series['name'],
                        category=best_formula_series['category'],
                        link=best_formula_series['link'],
                        score=98.0,
                        match_type='title_formula'
                    )]

            # Stage 0.8b: Token-set secondary check for short-search-vs-long-DB-name
            # e.g., "How to build a successful eCommerce business" vs
            # "Founders And CEOs On How To Build A Successful E-Commerce Business In A Saturated..."
            if best_exact_score < 92:
                stopwords = {'the','a','an','in','on','to','for','of','how','and','or','is','as','it','by'}
                search_words = set(search_norm.lower().split()) - stopwords
                tsr_candidates = []
                best_tsr_score = 0
                
                for series in self.series:
                    if not _industry_terms_are_compatible(search_text, series['name']):
                        continue
                    name_norm_s = re.sub(r'\s+', ' ', series['name']).strip()
                    tsr = fuzz.token_set_ratio(search_norm.lower(), name_norm_s.lower())
                    if tsr > best_tsr_score:
                        best_tsr_score = tsr
                    if tsr >= 90:
                        pr = fuzz.partial_ratio(search_norm.lower(), name_norm_s.lower())
                        is_sub = search_norm.lower() in name_norm_s.lower()
                        name_words = set(name_norm_s.lower().split()) - stopwords
                        overlap = len(search_words & name_words)
                        reverse_overlap = overlap / len(name_words) if name_words else 0
                        tsr_candidates.append({
                            'series': series,
                            'tsr': tsr,
                            'pr': pr,
                            'is_sub': is_sub,
                            'overlap': overlap,
                            'reverse_overlap': reverse_overlap
                        })
                
                if tsr_candidates:
                    # Sort candidates: prefer exact contiguous substring, high partial_ratio, high tsr, then reverse_overlap
                    tsr_candidates.sort(
                        key=lambda c: (c['is_sub'], c['pr'] >= 85, c['pr'], c['tsr'], c['reverse_overlap']),
                        reverse=True
                    )
                    best_cand = tsr_candidates[0]
                    min_words = 2 if best_cand['tsr'] >= 95 else 3
                    overlap_threshold = 0.80 if len(search_words) <= 3 else 0.60
                    min_reverse_overlap = 0.25
                    
                    # For short queries (<= 2 words), require either contiguous substring or high partial_ratio
                    # to prevent scattered-word false positives (e.g. "Future" and "Beauty" separated in two different clauses)
                    passes_proximity = True
                    if len(search_words) <= 2:
                        passes_proximity = best_cand['is_sub'] or best_cand['pr'] >= 85
                    
                    if (len(search_words) >= min_words and passes_proximity and
                        best_cand['overlap'] / len(search_words) >= overlap_threshold and
                        best_cand['reverse_overlap'] >= min_reverse_overlap):
                        return [MatchResult(
                            series_id=best_cand['series']['id'],
                            name=best_cand['series']['name'],
                            category=best_cand['series']['category'],
                            link=best_cand['series']['link'],
                            score=95.0,
                            match_type='exact_name_subset'
                        )]
                
                # Stage 0.8c: Typo-tolerant word-level matching
                if best_tsr_score < 90 and len(search_words) >= 2:
                    best_fuzzy_word_series = None
                    best_fuzzy_word_score = 0
                    best_fuzzy_word_reverse_score = 0
                    search_words_fp = set(re.findall(r'\b[a-z0-9]+\b', search_norm.lower())) - FINGERPRINT_STOPWORDS - {'as', 'five', 'things'}
                    if len(search_words_fp) < 2:
                        search_words_fp = search_words 
                    
                    for series in self.series:
                        if not _industry_terms_are_compatible(search_text, series['name']):
                            continue
                        name_norm_s = re.sub(r'\s+', ' ', series['name']).strip().lower()
                        name_w = set(re.findall(r'\b[a-z0-9]+\b', name_norm_s)) - FINGERPRINT_STOPWORDS - {'as', 'five', 'things'}
                        fuzzy_match_count = 0
                        for sw in search_words_fp:
                            if sw in name_w:
                                fuzzy_match_count += 1
                            else:
                                for nw in name_w:
                                    if fuzz.ratio(sw, nw) >= 85:
                                        fuzzy_match_count += 1
                                        break
                        fuzzy_pct = fuzzy_match_count / len(search_words_fp) if search_words_fp else 0
                        reverse_match_count = 0
                        if name_w:
                            for nw in name_w:
                                if nw in search_words_fp:
                                    reverse_match_count += 1
                                else:
                                    for sw in search_words_fp:
                                        if fuzz.ratio(nw, sw) >= 85:
                                            reverse_match_count += 1
                                            break
                            reverse_pct = reverse_match_count / len(name_w)
                        else:
                            reverse_pct = 0
                        if fuzzy_pct > best_fuzzy_word_score or (fuzzy_pct == best_fuzzy_word_score and reverse_pct > best_fuzzy_word_reverse_score):
                            best_fuzzy_word_score = fuzzy_pct
                            best_fuzzy_word_reverse_score = reverse_pct
                            best_fuzzy_word_series = series
                    if best_fuzzy_word_score >= 0.75 and best_fuzzy_word_reverse_score >= 0.50 and best_fuzzy_word_series:
                        return [MatchResult(
                            series_id=best_fuzzy_word_series['id'],
                            name=best_fuzzy_word_series['name'],
                            category=best_fuzzy_word_series['category'],
                            link=best_fuzzy_word_series['link'],
                            score=93.0,
                            match_type='typo_tolerant_word_match'
                        )]

        # Get the distinctive part of the search text (without common prefixes)
        # Stage 0.9: Short query with one unique database fingerprint.
        # This must run for plain extracted topic text too, because process_pitch()
        # calls find_matches() with the already-extracted value.
        short_query_words = _clean_word_set(search_text)
        if 1 <= len(short_query_words) <= 3:
            fingerprint_ids = {
                self._unique_fingerprints[word]
                for word in short_query_words
                if word in self._unique_fingerprints
            }
            if len(fingerprint_ids) == 1:
                series = self.id_to_series.get(next(iter(fingerprint_ids)))
                if series and _industry_terms_are_compatible(search_text, series['name']):
                    series_words = _clean_word_set(series['name'])
                    matching_words = short_query_words & series_words
                    # Single-word match guard: Never let a single word match a long topic title
                    # (> 4 words / > 30 chars) at >= 90% confidence.
                    # Multi-word queries must have all substantive words in the series (matching_words == short_query_words).
                    # Single-word queries can only match genuinely short topics (<= 4 words or <= 30 chars).
                    is_multi_word_match = len(matching_words) >= 2 and matching_words == short_query_words
                    is_short_topic = (len(series_words) <= 4 or len(series['name']) <= 30) and len(short_query_words) == 1 and len(matching_words) == 1
                    if is_multi_word_match or is_short_topic:
                        return [MatchResult(
                            series_id=series['id'],
                            name=series['name'],
                            category=series['category'],
                            link=series['link'],
                            score=94.0,
                            match_type='short_unique_fingerprint'
                        )]

        search_distinctive, search_had_prefix = extract_topic_distinctive_part(search_text)
        # Stage 1: Check for exact/near-exact topic name mentions
        for series in self.series:
            if not _industry_terms_are_compatible(search_text, series['name']):
                continue
            name_lower = series['name'].lower()
            name_distinctive, name_had_prefix = extract_topic_distinctive_part(series['name'])
            
            # FIRST: Check if distinctive parts match (including synonyms)
            # This is critical for "5 Things I Wish..." topics where the only difference
            # is the last word(s) like "Chef", "CEO", "Restaurateur"
            
            # Get synonyms for the search distinctive term
            search_synonyms = expand_synonyms(search_distinctive)
            
            # Calculate a Stage 1 score based on match quality
            stage1_score = 0
            
            # Check direct fingerprint mappings first (highest priority)
            fingerprint_target = BECAME_FINGERPRINTS.get(search_distinctive)
            
            # Specific check for common typos/variations that should be 100%
            if fingerprint_target and fingerprint_target == name_distinctive:
                stage1_score = 100
            elif (search_distinctive == 'restauranteur' and name_distinctive == 'restaurateur') or \
               (search_distinctive == 'restaurateur' and name_distinctive == 'restauranteur'):
                stage1_score = 100
            elif name_distinctive == search_distinctive:
                stage1_score = 100
            elif any(syn == name_distinctive for syn in search_synonyms):
                stage1_score = 99.5
            elif name_distinctive in search_distinctive or search_distinctive in name_distinctive:
                # One is a substring of the other
                if len(search_distinctive) >= 20 and (search_distinctive in name_distinctive or name_distinctive in search_distinctive):
                    stage1_score = 100.0
                elif len(search_distinctive) >= 12 and len(search_distinctive) / max(len(name_distinctive), 1) >= 0.5:
                    stage1_score = 90.0
                else:
                    stage1_score = 0.0
            elif any(syn in name_distinctive for syn in search_synonyms) or \
                 any(name_distinctive in syn for syn in search_synonyms if len(syn) > 3):
                stage1_score = 99.5
            
            # If both topics had actual common prefix patterns stripped,
            # we MUST rely on distinctive parts matching
            both_had_prefix = search_had_prefix and name_had_prefix
            
            # GUARD: If we have a high stage1_score from distinctive-part matching
            # but the FULL names are very different, reject the match.
            if stage1_score >= 90 and len(series['name']) > 10:
                full_name_similarity = fuzz.ratio(search_lower, name_lower)
                if full_name_similarity < 40 and len(search_text) < len(series['name']) * 0.5:
                    stage1_score = 0
            
            if both_had_prefix:
                # Both topics have the common prefix pattern - ONLY match on distinctive parts
                is_exact_match = (stage1_score >= 95)
                final_score = float(stage1_score)
            else:
                # One or both don't have the prefix - use traditional matching
                if stage1_score >= 98:  # Only for very strong distinctive matches
                    is_exact_match = True
                    final_score = float(stage1_score)
                else:
                    # Traditional substring matching on full names
                    if name_lower == search_lower:
                        is_exact_match = True
                        final_score = 100.0
                    elif name_lower.startswith(search_lower) and len(search_lower) > 20:
                        is_exact_match = True
                        final_score = 100.0
                    elif name_lower in search_lower or search_lower in name_lower:
                        # Full name is a substring. Check if it's a "clean" match (not just a single word snippet)
                        if search_lower in name_lower:
                            is_sub = (len(search_lower) >= 20 and re.search(r'\b' + re.escape(search_lower) + r'\b', name_lower)) or \
                                     (len(name_lower) > 0 and len(search_lower) / len(name_lower) >= 0.6 and len(search_lower) >= 12)
                            if is_sub:
                                is_exact_match = True
                                final_score = 90.0
                            else:
                                is_exact_match = False
                                final_score = 0
                        elif name_lower in search_lower:
                            if len(name_lower) >= 15 or len(name_lower) / max(len(search_lower), 1) >= 0.5:
                                is_exact_match = True
                                final_score = 90.0
                            else:
                                is_exact_match = False
                                final_score = 0
                        else:
                            is_exact_match = False
                            final_score = 0
                    elif (name_distinctive == search_distinctive and len(name_distinctive) > 3):
                        is_exact_match = True
                        final_score = 95.0
                    elif (name_distinctive in search_distinctive and len(name_distinctive) > 5) or \
                         (search_distinctive in name_distinctive and len(search_distinctive) > 5):
                        is_exact_match = True
                        final_score = 85.0
                    else:
                        is_exact_match = False
                        final_score = 0
            
            if is_exact_match and series['id'] not in seen_ids:
                results.append(MatchResult(
                    series_id=series['id'],
                    name=series['name'],
                    category=series['category'],
                    link=series['link'],
                    score=final_score,
                    match_type='exact'
                ))
                seen_ids.add(series['id'])

        # Stage 1.5: Unique Fingerprint Pre-Match
        # If a distinctive word in the search text is unique to exactly one topic,
        # and that topic isn't already the top result, boost it.
        # This catches cases like "CreativePreneurs" where the unique word exists
        # but a generic fuzzy match (Writer/Author) scored higher.
        #
        # Fix 1: CRITICAL - Only scan the extracted topic (search_text), NOT the
        # full pitch body. Scanning the full body causes false 97% matches when
        # a unique word appears in the email signature/bio/body but NOT in the
        # actual topic name. E.g., the word "digital" in a bio triggers a false
        # match to "Digital Marketing, PPC & Email".
        fp_scan_text = search_lower  # This is already extracted_topic or pitch_text
        search_clean_fp = re.sub(r'[^a-zA-Z0-9\s]', ' ', fp_scan_text)
        search_words_fp = search_clean_fp.split()
        fingerprint_candidates = {}
        for word in search_words_fp:
            if len(word) >= 4 and word not in FINGERPRINT_STOPWORDS:
                if word in self._unique_fingerprints:
                    topic_id = self._unique_fingerprints[word]
                    fingerprint_candidates[topic_id] = fingerprint_candidates.get(topic_id, 0) + 1
        
        if fingerprint_candidates:
            # Pick the topic with the most fingerprint word hits
            best_fp_id = max(fingerprint_candidates, key=fingerprint_candidates.get)
            # Only apply if this topic isn't already the top result at >= 90%
            already_top = (results and results[0].series_id == best_fp_id and results[0].score >= 90)
            # Fix 1 continued: Require at least 2 fingerprint word hits to prevent
            # a single stray word from overriding real matches
            # Only allow 1 hit if the search text is very short (under 3 words or 15 chars)
            is_very_short = len(search_words_fp) <= 2 or len(fp_scan_text) < 15
            min_hits = 1 if (extracted_topic and is_very_short) else 2
            if not already_top and best_fp_id in self.id_to_series and fingerprint_candidates[best_fp_id] >= min_hits:
                fp_series = self.id_to_series[best_fp_id]
                # Insert as a high-scoring result (97%) so it beats generic fuzzy matches
                results.insert(0, MatchResult(
                    series_id=fp_series['id'],
                    name=fp_series['name'],
                    category=fp_series['category'],
                    link=fp_series['link'],
                    score=97.0,
                    match_type='fingerprint_prescan'
                ))
                seen_ids.add(fp_series['id'])
        
        # Stage 1.8: EXACT SUBSTRING OVERRIDE FOR SHORT SEARCHES
        # Short multi-word searches (under 25 chars) like "Women in Tech" or "Social Impact" 
        # should match topics that contain the EXACT phrase FIRST
        # before we allow WRatio to hallucinate matches like "Women in Hollywood"
        if 5 < len(search_distinctive) <= 25:
            # Require at least 2 words or covering at least 50% of the target name
            # to prevent single generic words ("ethical", "healthy") from matching long topics at 95%
            has_multiple_words = len(search_distinctive.split()) >= 2
            for series in self.series:
                name_lower = series['name'].lower()
                if (has_multiple_words or len(search_distinctive) / max(len(name_lower), 1) >= 0.5):
                    if search_distinctive in name_lower and series['id'] not in seen_ids:
                        results.append(MatchResult(
                            series_id=series['id'],
                            name=series['name'],
                            category=series['category'],
                            link=series['link'],
                            score=95.0,
                            match_type='exact_substring_boost'
                        ))
                        seen_ids.add(series['id'])
                    
        # Stage 2: Fuzzy matching on topic names with number normalization and index mapping
        if len(search_text) > 5:  # Only do fuzzy match if search has substance
            # Use different scorer based on search length:
            is_short_search = len(search_text.split()) <= 2 or len(search_text) < 25
            scorer = fuzz.WRatio if is_short_search else fuzz.token_set_ratio
            
            # Normalize spelled-out numbers to digits for better matching
            search_text_norm = normalize_numbers_to_digits(search_text)
            
            fuzzy_matches = process.extract(
                search_text_norm,
                self.series_choices_normalized,
                scorer=scorer,
                limit=20  # Get more candidates so we can filter
            )
            
            for choice_norm, score, index in fuzzy_matches:
                series = self.series[index]
                name = series['name']

                if not _industry_terms_are_compatible(search_text, name):
                    continue
                
                if series['id'] not in seen_ids and score > 40:  # Lower threshold
                    # SPECIAL GUARD: For "Women Leading" topics, ensure specific industry keywords match.
                    if "women leading" in name.lower() and "industry" in name.lower():
                        search_norm_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', search_lower)
                        search_words = set(search_norm_clean.split())
                        industry_pattern = r'leading (?:the )?(.*?) industr(?:y|ies)'
                        industry_match = re.search(industry_pattern, name.lower())
                        if industry_match:
                            target_industry = industry_match.group(1).strip()
                            target_words = set(re.sub(r'[^a-z0-9\s]', ' ', target_industry).split())
                            if not (target_words & search_words):
                                # Industry mismatch for a "Women Leading" series - reject this candidate
                                continue

                    name_distinctive, name_had_prefix = extract_topic_distinctive_part(name)
                    
                    # Check for extreme WRatio false positives
                    match_is_suspect = False
                    if scorer == fuzz.WRatio:
                        search_words = set(re.findall(r'\b[a-z]{4,}\b', search_lower))
                        name_words = set(re.findall(r'\b[a-z]{4,}\b', name.lower()))
                        
                        generic_words = FINGERPRINT_STOPWORDS.union({'meet', 'rising', 'stars', 'star', 'women', 'woman', 'inspirational'})
                        search_words_filtered = {w for w in search_words if w not in generic_words}
                        
                        if search_words_filtered and not (search_words_filtered & name_words):
                            # No significant words overlap
                            match_is_suspect = True

                    if search_had_prefix and name_had_prefix:
                        # Both have common prefix - score based on distinctive part matching
                        distinctive_score = fuzz.ratio(search_distinctive, name_distinctive)
                        
                        # If distinctive parts don't match well, cap the overall score
                        if distinctive_score < 80:
                            if distinctive_score >= 65:
                                adjusted_score = max(score * 0.5, distinctive_score)
                            else:
                                adjusted_score = min(score * 0.5, distinctive_score)
                        else:
                            adjusted_score = max(score, distinctive_score)
                    elif search_had_prefix and not name_had_prefix:
                        # Search has a prefix pattern but matched topic doesn't
                        if search_distinctive in name.lower():
                            adjusted_score = min(100, score * 0.9)
                        else:
                            adjusted_score = score * 0.5
                    elif not search_had_prefix and name_had_prefix:
                        # Matched topic has prefix but search didn't
                        if search_distinctive in name_distinctive:
                            adjusted_score = min(100, score * 0.9)
                        else:
                            adjusted_score = score * 0.5
                    else:
                        # Normal case - use the original scoring with bonus
                        bonus = self._calculate_distinctive_bonus(search_lower, name.lower())
                        if match_is_suspect:
                            # Heavy penalty to prevent WRatio from overriding real word mismatches
                            adjusted_score = (score * 0.6) + bonus
                        else:
                            adjusted_score = min(100, score * 0.9 + bonus)
                        
                        # Fix E: Guard against short-input inflation with token_set_ratio
                        if scorer == fuzz.token_set_ratio:
                            search_len = len(search_text_norm)
                            name_len = len(normalize_numbers_to_digits(name))
                            length_ratio = search_len / name_len if name_len > 0 else 1.0
                            if length_ratio < 0.40:
                                # Search is less than 40% of topic length — likely inflated
                                adjusted_score = adjusted_score * length_ratio * 2  # Significant penalty
                    
                    results.append(MatchResult(
                        series_id=series['id'],
                        name=series['name'],
                        category=series['category'],
                        link=series['link'],
                        score=adjusted_score,
                        match_type='fuzzy'
                    ))
                    seen_ids.add(series['id'])
        
        # Stage 3: Keyword matching
        pitch_words = set(re.findall(r'\b\w+\b', pitch_lower))
        keyword_scores = {}
        for word in pitch_words:
            if word in self.keyword_index:
                for series_id in self.keyword_index[word]:
                    keyword_scores[series_id] = keyword_scores.get(series_id, 0) + 10
        
        for series_id, kw_score in keyword_scores.items():
            if series_id not in seen_ids:
                series = next(s for s in self.series if s['id'] == series_id)
                # Weight keyword score (max ~80)
                final_score = min(80, kw_score)
                if final_score > 20:  # Only include if enough keywords matched
                    results.append(MatchResult(
                        series_id=series['id'],
                        name=series['name'],
                        category=series['category'],
                        link=series['link'],
                        score=final_score,
                        match_type='keyword'
                    ))
                    seen_ids.add(series['id'])
        
        # Sort by score (highest first) and return top N
        results.sort(key=lambda x: x.score, reverse=True)
        
        # Stage 4: Special Logic for Typo-Resilient High-Keyword Topics 
        # (E.g. FinTech typo drops score to 85% instead of 90%. If both share key words, safely boost to 90%)
        if results and 80 <= results[0].score < 90:
            top = results[0]
            top_series = next((s for s in self.series if s['id'] == top.series_id), None)
            if top_series:
                # Check for strong keyword intersection (e.g., "fintech", "c-level")
                search_words = set(re.findall(r'\b[a-z]{4,}\b', search_lower))
                name_words = set(re.findall(r'\b[a-z]{4,}\b', top_series['name'].lower()))
                
                # Filter out stopwords and generic words to prevent false overlapping (like "Meet", "Rising", "Stars")
                generic_words = FINGERPRINT_STOPWORDS.union({'meet', 'rising', 'stars', 'star', 'women'})
                search_words_filtered = {w for w in search_words if w not in generic_words}
                name_words_filtered = {w for w in name_words if w not in generic_words}
                
                overlap = search_words_filtered & name_words_filtered
                
                # If we share at least 2 significant words and the fuzzy score was already high, it's likely a typo
                if len(overlap) >= 2 and top.score >= 82:
                    results[0] = MatchResult(
                        series_id=top.series_id,
                        name=top.name,
                        category=top.category,
                        link=top.link,
                        score=91.0,  # Just barely passes threshold
                        match_type='fuzzy_keyword_boost'
                    )

        # Stage 5: Fingerprint Confirmation Boost
        # If top match is below 90% but confirmed by a unique fingerprint, boost it
        # Fix 4: Extended to work down to score 20 when extracted topic exists.
        # When a topic IS extracted from a form, a fingerprint confirmation is very
        # reliable (e.g., "Big Ideas" has unique word "ideas" confirming the match).
        # When using full-text body search, keep the higher threshold (60) to avoid noise.
        fp_confirm_min = 20 if extracted_topic else 60
        if results and results[0].score < 90 and results[0].score >= fp_confirm_min:
            top_match = results[0]
            if self._check_fingerprint_confirmation(search_text, top_match.series_id):
                # Fingerprint confirms this is the right topic - boost to 95%
                results[0] = MatchResult(
                    series_id=top_match.series_id,
                    name=top_match.name,
                    category=top_match.category,
                    link=top_match.link,
                    score=95.0,
                    match_type='fingerprint_confirmed'
                )
        
        return results[:top_n]

    
    def _calculate_distinctive_bonus(self, search_text: str, topic_name: str) -> float:
        """
        Calculate bonus points for distinctive phrase matches.
        This helps distinguish between topics that share common patterns like 'Five Things'.
        """
        # Extract distinctive multi-word phrases from topic name
        # Remove common filler words/patterns
        common_patterns = [
            'five things you need', 'things you need to know', 'how to', 
            'to succeed in', 'to create a', 'highly successful', 'career in',
            'the', 'a', 'an', 'in', 'to', 'of', 'for', 'and', 'or', 'today',
            'industry', 'business', 'interviewer', 'women in', 'woman in'
        ]
        
        # Find distinctive phrases in topic name (2-3 word phrases not in common patterns)
        topic_words = topic_name.split()
        bonus = 0.0
        
        # Check for specific distinctive phrases
        distinctive_phrases = [
            ('male dominated', 25), ('female founder', 25),
            ('real estate', 20), ('commercial real estate', 25),
            ('health tech', 20), ('mental health', 20), ('social impact', 20),
            ('wellness', 15), ('mortgage', 15), ('beauty', 15),
            ('cannabis', 20), ('hospitality', 15), ('music', 15),
            ('leadership', 15), ('resilient', 15), ('resilience', 15),
        ]
        
        for phrase, points in distinctive_phrases:
            if phrase in topic_name and phrase in search_text:
                bonus += points
        
        # Also check for any 2+ word phrases that appear in both
        for i in range(len(topic_words) - 1):
            phrase = ' '.join(topic_words[i:i+2])
            if len(phrase) > 5 and phrase not in ' '.join(common_patterns):
                if phrase in search_text:
                    bonus += 10
        
        return min(bonus, 40)  # Cap bonus at 40 points
    

    def get_best_match(self, pitch_text: str) -> Optional[MatchResult]:
        """Get the single best match for a pitch, if any."""
        matches = self.find_matches(pitch_text, top_n=1)
        return matches[0] if matches else None
    
    def search_by_name(self, query: str, top_n: int = 10) -> List[MatchResult]:
        """Search for series by name (for autocomplete/search)."""
        matches = process.extract(
            query,
            self.series_choices,  # Use clean names
            scorer=fuzz.WRatio,
            limit=top_n
        )
        
        results = []
        for choice, score, index in matches:
            series = self.series[index]
            results.append(MatchResult(
                series_id=series['id'],
                name=series['name'],
                category=series['category'],
                link=series['link'],
                score=score,
                match_type='search'
            ))
        
        return results
    
    def get_all_series(self) -> list:
        """Get all series (for browse mode)."""
        return self.series
    
    def get_series_by_category(self, category: str) -> list:
        """Get all series in a category."""
        return [s for s in self.series if s['category'] == category]


# Quick test
if __name__ == "__main__":
    matcher = TopicMatcher()
    
    # Test with structured pitch format (like real pitches)
    structured_pitch = """Dear Authority Magazine Editors,

Please kindly consider me or my client for the following interview topic:

Name and Title of The Interviewee	Stormie Calder, Soul Expert & High Performance Coach
Has this interviewee been featured in Authority Magazine before?	No
What is the name of the interview topic you are pitching for?	How To Become More Resilient
Your 200 word pitch	Resilience is the trait that saved my life...
What is the occupation of the interviewee?	Spiritual Life Coach
"""
    
    test_pitches = [
        structured_pitch,  # Structured format
        "I would like to be featured in Women in Wellness",
        "I'm a health tech founder with a new medical device",
        "I'm a female CEO running a startup",
        "I want to talk about my experience as a social impact hero",
        "I'm a musician making a comeback in rock and roll",
    ]
    
    print("Topic Matcher Test\n" + "=" * 50)
    
    for pitch in test_pitches:
        # Show first 80 chars of pitch
        display = pitch[:80].replace('\n', ' ') + "..."
        print(f"\nPitch: {display}")
        
        # Show extracted topic if any
        extracted = matcher.extract_topic_from_pitch(pitch)
        if extracted:
            print(f"  -> Extracted topic: '{extracted}'")
        
        matches = matcher.find_matches(pitch, top_n=3)
        if matches:
            for i, m in enumerate(matches, 1):
                print(f"  {i}. [{m.score:.0f}%] {m.name} ({m.category}) - {m.match_type}")
        else:
            print("  No matches found")

