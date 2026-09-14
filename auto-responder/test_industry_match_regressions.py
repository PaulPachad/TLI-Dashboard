"""Regression tests for templated titles whose industry names differ."""

import unittest

from matcher import TopicMatcher, _industry_discriminator_words


class IndustryMatchRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matcher = TopicMatcher()

    def assert_best_match(self, submitted_title, expected_title, expected_type=None):
        matches = self.matcher.find_matches(submitted_title, top_n=3)
        self.assertTrue(matches, f"No match returned for {submitted_title!r}")
        self.assertEqual(expected_title, matches[0].name)
        self.assertGreaterEqual(matches[0].score, 90)
        if expected_type:
            self.assertEqual(expected_type, matches[0].match_type)

    def test_hybrid_modern_beauty_title_does_not_match_ai(self):
        self.assert_best_match(
            "Five Things You Need To Create a Highly Successful Career "
            "In the Modern Beauty Industry",
            "Five Things You Need To Know To Succeed In The Modern Beauty Industry",
            "industry_discriminator",
        )

    def test_structured_pitch_uses_the_beauty_topic(self):
        self.assert_best_match(
            "What is the name of the interview topic you are pitching for?\t"
            "Five Things You Need To Create a Highly Successful Career "
            "In the Modern Beauty Industry\n\nYour 200 word pitch\tTest pitch",
            "Five Things You Need To Know To Succeed In The Modern Beauty Industry",
            "industry_discriminator",
        )

    def test_exact_ai_title_is_unchanged(self):
        self.assert_best_match(
            "Five Things You Need To Create A Highly Successful Career In The AI Industry",
            "Five Things You Need To Create A Highly Successful Career In The AI Industry",
            "exact_name",
        )

    def test_exact_finance_title_is_unchanged(self):
        self.assert_best_match(
            "Five Things You Need To Create A Highly Successful Career In The Finance Industry",
            "Five Things You Need To Create A Highly Successful Career In The Finance Industry",
            "exact_name",
        )

    def test_industry_discriminators_capture_short_names(self):
        self.assertEqual(
            {"ai"},
            _industry_discriminator_words(
                "Five Things You Need To Create A Highly Successful Career In The AI Industry"
            ),
        )
        self.assertEqual(
            {"modern", "beauty"},
            _industry_discriminator_words(
                "Five Things You Need To Create a Highly Successful Career "
                "In the Modern Beauty Industry"
            ),
        )


if __name__ == "__main__":
    unittest.main()
