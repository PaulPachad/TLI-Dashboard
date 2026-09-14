import unittest

from matcher import TopicMatcher


class KnownTopicRegressionTests(unittest.TestCase):
    def setUp(self):
        self.matcher = TopicMatcher()

    def test_purpose_before_profit_variant_matches_known_topic(self):
        matches = self.matcher.find_matches(
            "Purpose Before Profit: Leaders Who Lead Mission-Driven Businesses "
            "That Make an Important Social Impact",
            top_n=1,
        )

        self.assertTrue(matches)
        self.assertGreaterEqual(matches[0].score, 90)
        self.assertEqual(
            matches[0].name,
            "Purpose Before Profit: Leaders Who Lead Purpose-Driven Businesses "
            "On The Benefits Of Running A Purpose-Driven Business",
        )

    def test_business_china_short_query_matches_known_topic(self):
        matches = self.matcher.find_matches("business china", top_n=1)

        self.assertTrue(matches)
        self.assertGreaterEqual(matches[0].score, 90)
        self.assertEqual(
            matches[0].name,
            "The Opportunities And Challenges Of Doing Business In China",
        )

    def test_direct_mindset_colon_variant_matches_known_topic(self):
        matches = self.matcher.find_matches(
            "Mindset Experts: 5 Things You Need To Overcome Self-Doubt "
            "and Build Confidence",
            top_n=1,
        )

        self.assertTrue(matches)
        self.assertGreaterEqual(matches[0].score, 90)
        self.assertEqual(
            matches[0].name,
            "Mindset Experts on 5 Things You Need To Overcome Self-Doubt "
            "and Build Confidence",
        )

    def test_unknown_beyond_the_game_topic_does_not_get_wrong_acceptance(self):
        matches = self.matcher.find_matches(
            "Beyond the Game: How Women Athletes Become Architects of Power, "
            "Influence, and Economic Opportunity",
            top_n=1,
        )

        self.assertTrue(matches)
        self.assertLess(matches[0].score, 90)

    def test_body_noise_does_not_create_high_confidence_digital_match(self):
        matches = self.matcher.find_matches(
            "This pitch is about something else entirely. My bio mentions "
            "digital marketing and PPC email work in passing.",
            top_n=1,
        )

        self.assertTrue(matches)
        self.assertLess(matches[0].score, 90)


if __name__ == "__main__":
    unittest.main()
