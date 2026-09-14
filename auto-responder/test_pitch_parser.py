import unittest
from pitch_parser import PitchParser, ParsedPitch


class TestPitchParser(unittest.TestCase):

    def test_clean_topic_string_with_boilerplates(self):
        cases = [
            ("(Choose one please) The Future of AI: Control Points", "The Future of AI: Control Points"),
            ("(Select one please) Power Women >>", "Power Women"),
            ("12. 5 Lessons I Learned As A Founder", "5 Lessons I Learned As A Founder"),
            ("https://medium.com/authority-magazine/search?q=Creating+a+Culture+of+Courage", "Creating a Culture of Courage"),
            ("Women In Tech - https://medium.com/authority-magazine/...", "Women In Tech"),
            ("Big Ideas that May Change The World: a new methodology to herald in...", "Big Ideas that May Change The World"),
        ]
        for raw, expected in cases:
            cleaned = PitchParser.clean_topic_string(raw)
            self.assertEqual(cleaned, expected, f"Failed cleaning '{raw}' -> got '{cleaned}'")

    def test_parse_pitch_full_form(self):
        email_content = """Dear Authority Magazine Editors,

Please kindly consider me or my client for the following interview topic:

Name and Title of The Interviewee\tJane Doe, VP of Engineering
Has this interviewee been featured in Authority Magazine before?\tNo
What is the name of the interview topic you are pitching for?\t(Choose one please) The Future of AI: Control Points
Your 200 word pitch\tArtificial intelligence is transforming cloud compute architectures...
What is the occupation of the interviewee?\tSoftware Architect
What is the best email to follow up with you?\tjane.doe@example.com
"""
        parsed = PitchParser.parse_pitch(email_content, subject="Interview Pitch", sender="pr@example.com")
        self.assertTrue(parsed.is_pitch_form)
        self.assertEqual(parsed.interviewee_name, "Jane Doe")
        self.assertEqual(parsed.interviewee_title, "VP of Engineering")
        self.assertEqual(parsed.clean_topic, "The Future of AI: Control Points")
        self.assertEqual(parsed.primary_series, "The Future of AI")
        self.assertEqual(parsed.subtitle_angle, "Control Points")
        self.assertEqual(parsed.followup_email, "jane.doe@example.com")
        self.assertEqual(parsed.occupation, "Software Architect")
        self.assertFalse(parsed.is_extension)

    def test_parse_extension_request(self):
        email_content = "Hi Yitzi,\nCould we please request a 1-week deadline extension for our submission?\nBest,\nMark"
        parsed = PitchParser.parse_pitch(email_content, subject="Deadline extension request", sender="mark@example.com")
        self.assertTrue(parsed.is_extension)
        self.assertFalse(parsed.is_pitch_form)


if __name__ == '__main__':
    unittest.main()
