"""
Regression tests for skip phrase safety filtering in AutoResponder.
Ensures pitch forms with professional vocabulary (e.g. 'legal', 'confidential')
are not falsely discarded, while genuine opt-outs and non-pitch legal disputes are safely caught.
"""

import unittest
from auto_responder import AutoResponder
from pitch_parser import PitchParser


class TestSkipPhraseRegressions(unittest.TestCase):

    def setUp(self):
        self.ar = AutoResponder()
        self.ar.skip_phrases = ["unsubscribe", "legal", "refund", "confidential"]

    def test_matches_skip_phrase_word_boundaries(self):
        """Test that _matches_skip_phrase enforces whole-word boundaries."""
        self.assertTrue(AutoResponder._matches_skip_phrase("legal", "there is legal exposure here"))
        self.assertFalse(AutoResponder._matches_skip_phrase("legal", "she is a paralegal"))
        self.assertFalse(AutoResponder._matches_skip_phrase("legal", "delegation of authority"))
        
        self.assertTrue(AutoResponder._matches_skip_phrase("confidential", "this is confidential info"))
        self.assertFalse(AutoResponder._matches_skip_phrase("confidential", "clientele confidentially including"))

    def test_ai_pitch_with_legal_exposure_not_skipped(self):
        """Pitch mentioning 'legal exposure' in the AI pitch must not be skipped."""
        content = """
*Here is a summary and confirmation of your pitch:*

Dear Authority Magazine Editors,
Please kindly consider me or my client for the following interview topic:
Name and Title of The Interviewee Daniel Mandell
What is the name of the interview topic you are pitching for? (Choose one please) The Future of Artificial Intelligence
Your 200 word pitch As enterprises move from AI experimentation to full-scale deployment, training data quality is increasingly the deciding factor, and legal exposure around where that data comes from has become a board-level concern for enterprises.
What is the best email to follow up with you? test@example.com
"""
        parsed = PitchParser.parse_pitch(content, "Thank you for your pitch to Authority Magazine!", "editor@authoritymag.co")
        is_pitch_form = parsed.is_pitch_form or self.ar._is_likely_pitch(content)
        self.assertTrue(is_pitch_form)

        PITCH_FORM_SAFE_EXCLUSIONS = {'legal', 'confidential'}
        skipped = False
        for sp in self.ar.skip_phrases:
            if is_pitch_form and sp in PITCH_FORM_SAFE_EXCLUSIONS:
                continue
            if self.ar._matches_skip_phrase(sp, content):
                skipped = True
                break

        self.assertFalse(skipped, "The Future of AI pitch should NOT be skipped because of 'legal exposure'")

    def test_wellness_pitch_with_confidentially_not_skipped(self):
        """Pitch mentioning 'confidentially including' in wellness pitch must not be skipped."""
        content = """
*Here is a summary and confirmation of your pitch:*

Dear Authority Magazine Editors,
Please kindly consider me or my client for the following interview topic:
Name and Title of The Interviewee Chloe Smith
What is the name of the interview topic you are pitching for? (Choose one please) Women In Wellness
Your 200 word pitch Has become a go-to medium for names across entertainment, with past clientele confidentially including celebrity clients.
What is the best email to follow up with you? test@example.com
"""
        parsed = PitchParser.parse_pitch(content, "Thank you for your pitch to Authority Magazine!", "editor@authoritymag.co")
        is_pitch_form = parsed.is_pitch_form or self.ar._is_likely_pitch(content)
        self.assertTrue(is_pitch_form)

        PITCH_FORM_SAFE_EXCLUSIONS = {'legal', 'confidential'}
        skipped = False
        for sp in self.ar.skip_phrases:
            if is_pitch_form and sp in PITCH_FORM_SAFE_EXCLUSIONS:
                continue
            if self.ar._matches_skip_phrase(sp, content):
                skipped = True
                break

        self.assertFalse(skipped, "Wellness pitch should NOT be skipped because of 'confidentially'")

    def test_pitch_with_unsubscribe_is_skipped(self):
        """A pitch containing an explicit opt-out MUST be skipped."""
        content = """
*Here is a summary and confirmation of your pitch:*

Dear Authority Magazine Editors,
Please kindly consider me or my client for the following interview topic:
Name and Title of The Interviewee John Doe
What is the name of the interview topic you are pitching for? The Future of Healthcare
Your 200 word pitch Please unsubscribe me from all future emails immediately.
What is the best email to follow up with you? test@example.com
"""
        parsed = PitchParser.parse_pitch(content, "Thank you for your pitch to Authority Magazine!", "editor@authoritymag.co")
        is_pitch_form = parsed.is_pitch_form or self.ar._is_likely_pitch(content)
        self.assertTrue(is_pitch_form)

        PITCH_FORM_SAFE_EXCLUSIONS = {'legal', 'confidential'}
        skipped = False
        for sp in self.ar.skip_phrases:
            if is_pitch_form and sp in PITCH_FORM_SAFE_EXCLUSIONS:
                continue
            if self.ar._matches_skip_phrase(sp, content):
                skipped = True
                break

        self.assertTrue(skipped, "Form with explicit unsubscribe MUST be skipped")

    def test_non_pitch_with_legal_or_refund_is_skipped(self):
        """A regular support email mentioning 'legal' or 'refund' MUST be skipped."""
        content = "Hi, I am reaching out because our legal team noticed an unauthorized article. We require a refund."
        subject = "Legal matter regarding charge"
        
        # Subject test
        subj_skipped = any(self.ar._matches_skip_phrase(sp, subject) for sp in self.ar.skip_phrases)
        self.assertTrue(subj_skipped, "Subject with 'legal' must be skipped")

        # Body test for non-pitch
        parsed = PitchParser.parse_pitch(content, subject, "user@example.com")
        is_pitch_form = parsed.is_pitch_form or self.ar._is_likely_pitch(content)
        self.assertFalse(is_pitch_form)

        PITCH_FORM_SAFE_EXCLUSIONS = {'legal', 'confidential'}
        body_skipped = False
        for sp in self.ar.skip_phrases:
            if is_pitch_form and sp in PITCH_FORM_SAFE_EXCLUSIONS:
                continue
            if self.ar._matches_skip_phrase(sp, content):
                body_skipped = True
                break

        self.assertTrue(body_skipped, "Non-pitch email with 'legal' or 'refund' must be skipped")


if __name__ == "__main__":
    unittest.main()
