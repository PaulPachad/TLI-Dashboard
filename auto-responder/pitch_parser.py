"""
Structured pitch email parser for Authority Magazine Auto Responder.
Extracts strongly-typed, validated pitch attributes from incoming emails using Pydantic.
"""

import re
from urllib.parse import unquote_plus
from typing import Optional, List, Tuple
from pydantic import BaseModel, Field


class ParsedPitch(BaseModel):
    """Structured representation of a pitch email."""
    raw_topic: Optional[str] = None
    clean_topic: Optional[str] = None
    primary_series: Optional[str] = None
    subtitle_angle: Optional[str] = None
    interviewee_name: Optional[str] = None
    interviewee_title: Optional[str] = None
    occupation: Optional[str] = None
    pitch_text: Optional[str] = None
    followup_email: Optional[str] = None
    is_extension: bool = False
    is_pitch_form: bool = False


class PitchParser:
    """Parses raw email content into structured ParsedPitch data."""

    DESCRIPTION_MARKERS = [
        r'\s+This\s+(?:aligns|is\s+a|is\s+the|was|would|could|should|will|has|focuses|covers|fits|matches|relates)',
        r'\s+I\s+(?:would\s+like|believe|think|feel|am\s+pitching|have\s+been|want\s+to)',
        r'\s+My\s+(?:client|pitch|expertise|background|experience)',
        r'\s+We\s+(?:would\s+like|believe|think|are\s+pitching|have\s+been|want\s+to)',
        r'\s+As\s+(?:a\s+(?:client|company|firm|brand)|an\s+(?:expert|author|executive|organization))',
        r'\s+Our\s+(?:client|pitch|CEO|founder|expert)',
        r'\s+Based\s+on\s+(?:my|our|the|this)',
        r'\s+Please\s+(?:consider|see|note|let)',
    ]

    @staticmethod
    def clean_topic_string(raw: str) -> str:
        """Sanitize topic string from HTML, URLs, form boilerplate, and stray punctuation."""
        if not raw:
            return ""
        topic = re.sub(r'\s+', ' ', raw).strip()

        # 1. Strip HTML tags
        if '<' in topic and '>' in topic:
            topic = re.sub(r'<[^>]+>', ' ', topic)
            topic = re.sub(r'\s+', ' ', topic).strip()

        # 2. Extract topic from search URLs
        url_match = re.match(r'https?://\S+', topic)
        if url_match:
            q_match = re.search(r'[?&]q=([^&]+)', topic)
            if q_match:
                topic = unquote_plus(q_match.group(1)).strip()

        # 2b. Strip trailing URLs
        topic = re.sub(r'\s*-\s*https?://\S+', '', topic)
        topic = re.sub(r'\s*https?://\S+', '', topic).strip()

        # 3. Normalize quotes and dashes
        topic = topic.replace('\u2014', '-').replace('\u2013', '-')
        topic = topic.replace('\u201c', '"').replace('\u201d', '"')
        topic = topic.replace('\u2018', "'").replace('\u2019', "'")
        topic = topic.replace('\u00e2\u0080\u0093', '-').replace('\u00e2\u0080\u0094', '-')

        # 4. Strip arrows and numbered list prefixes
        topic = re.sub(r'\s*>+\s*$', '', topic).strip()
        topic = re.sub(r'\s*>+\s*', ' ', topic)
        topic = re.sub(r'^\d+[\.:]\s*', '', topic).strip()

        # 5. Remove form field boilerplate prefixes
        for form_prefix in [r'\(Choose one[^)]*\)\s*', r'\(Select one[^)]*\)\s*', r'\(Pick one[^)]*\)\s*']:
            topic = re.sub(form_prefix, '', topic, flags=re.IGNORECASE)
        topic = topic.strip()

        # 6. Leading/trailing punctuation noise
        topic = re.sub(r'^[.\-,;:!?*#]+\s*', '', topic).strip()

        # 7. Truncate trailing description sentences that bleed into topic field
        if ':' in topic:
            colon_pos = topic.index(':')
            before_colon = topic[:colon_pos].strip()
            after_colon = topic[colon_pos + 1:].strip()
            if (len(before_colon) > 15 and len(after_colon) > 20 and
                (after_colon[0].islower() or after_colon.lower().startswith(('a ', 'an ', 'the ', 'how ', 'why ', 'what ')))):
                topic = before_colon

        for marker in PitchParser.DESCRIPTION_MARKERS:
            marker_match = re.search(marker, topic, re.IGNORECASE)
            if marker_match and marker_match.start() >= 30:
                truncated = topic[:marker_match.start()].strip()
                if len(truncated) > 3:
                    topic = truncated
                    break

        return topic.strip()

    @classmethod
    def parse_pitch(cls, email_content: str, subject: str = "", sender: str = "", reply_to: Optional[str] = None) -> ParsedPitch:
        """Extract all structured fields from email content into a validated ParsedPitch object."""
        if not email_content:
            return ParsedPitch()

        parsed = ParsedPitch()

        # Check pitch form markers
        markers = [
            r'summary and confirmation of your pitch',
            r'Dear Authority Magazine Editors',
            r'consider me or my client for the following interview topic',
            r'Name and Title of The Interviewee',
            r'Your 200 word pitch',
            r'What is the best email to follow up with you',
            r'What is the name of the interview topic'
        ]
        marker_hits = sum(1 for m in markers if re.search(m, email_content, re.IGNORECASE))
        parsed.is_pitch_form = (marker_hits >= 2)

        # Check deadline extension request
        subj_or_body = f"{subject} {email_content[:400]}"
        if re.search(r'\bexten[st]ions?\b', subj_or_body, re.IGNORECASE) and not re.search(r'thank\s*s?\s*(you)?', subj_or_body, re.IGNORECASE):
            # Avoid false positives like 'chrome extension'
            if not re.search(r'\b(chrome|browser|hair|domain)\s+exten[st]ions?\b', subj_or_body, re.IGNORECASE):
                parsed.is_extension = True

        # Extract follow-up email
        email_patterns = [
            r'What is the best email to follow up with you\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            r'best email to follow up\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            r'follow up with you\??\s*[:\-\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
        ]
        for pattern in email_patterns:
            m = re.search(pattern, email_content, re.IGNORECASE | re.MULTILINE)
            if m:
                email_val = m.group(1).strip().lower()
                if 'authoritymag' not in email_val:
                    parsed.followup_email = email_val
                    break
        if not parsed.followup_email:
            target = reply_to if reply_to else sender
            if '<' in target:
                parsed.followup_email = target.split('<')[1].strip('>').lower()
            else:
                parsed.followup_email = target.strip().lower() if target else None

        # Extract interviewee name & title
        name_patterns = [
            r'Name and Title of The Interviewee\??\s*[:\t]*([^\r\n]+)',
            r'Name of The Interviewee\??\s*[:\t]*([^\r\n]+)',
            r'Interviewee Name\??\s*[:\t]*([^\r\n]+)',
        ]
        for p in name_patterns:
            m = re.search(p, email_content, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if ',' in val:
                    parts = val.split(',', 1)
                    parsed.interviewee_name = parts[0].strip()
                    parsed.interviewee_title = parts[1].strip()
                else:
                    parsed.interviewee_name = val
                break

        # Extract occupation
        occ_patterns = [
            r'What is the occupation of the interviewee\??\s*[:\t]*([^\r\n]+)',
            r'Occupation of the interviewee\??\s*[:\t]*([^\r\n]+)',
        ]
        for p in occ_patterns:
            m = re.search(p, email_content, re.IGNORECASE)
            if m:
                parsed.occupation = m.group(1).strip()
                break

        # Extract pitch text
        pitch_patterns = [
            r'Your 200 word pitch\??\s*[:\t]*((?:(?!\r?\n\r?\n[A-Z])[\s\S])+)',
            r'Your pitch\??\s*[:\t]*((?:(?!\r?\n\r?\n[A-Z])[\s\S])+)',
        ]
        for p in pitch_patterns:
            m = re.search(p, email_content, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                val = re.sub(r'\s+', ' ', val)
                if len(val) > 20:
                    parsed.pitch_text = val[:1000]
                break

        # Extract topic
        topic_patterns = [
            r'What is the name of the interview topic you are pitching for\??(?:\s*\([^)]*\))?[:\s\t]*((?:(?!\r?\n\r?\n)(?!Your \d+ word)[\s\S])+)',
            r'interview topic you are pitching for\??(?:\s*\([^)]*\))?[:\s\t]*((?:(?!\r?\n\r?\n)(?!Your \d+ word)[\s\S])+)',
        ]
        for p in topic_patterns:
            m = re.search(p, email_content, re.IGNORECASE)
            if m:
                raw_topic = m.group(1).strip()
                parsed.raw_topic = raw_topic
                clean = cls.clean_topic_string(raw_topic)
                parsed.clean_topic = clean
                
                # Decompose primary series from subtitle
                from matcher import decompose_pitch_topic
                prim, sub = decompose_pitch_topic(clean)
                parsed.primary_series = prim
                parsed.subtitle_angle = sub
                break

        return parsed
