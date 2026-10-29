import os
import sys
import json
import unittest

# Ensure parent directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from matcher import TopicMatcher, decompose_pitch_topic
from correction_tracker import CorrectionTracker


class TestGoldenRegressionGate(unittest.TestCase):
    """
    Golden Regression Gate:
    Verifies that critical topic queries, unique colon-prefixes, learned rules,
    and boilerplate prevention invariants hold with 100% precision.
    """

    @classmethod
    def setUpClass(cls):
        cls.matcher = TopicMatcher()
        cls.correction_tracker = CorrectionTracker()
        
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        cls.series_path = os.path.join(base_dir, 'data', 'interview_series.json')
        cls.rules_path = os.path.join(base_dir, 'data', 'learned_rules.json')

    def test_guardians_of_ai_matches_id_614(self):
        """Guardians of AI must match Series 614 and NEVER be hijacked by The Future of AI."""
        query = "Guardians of AI"
        matches = self.matcher.find_matches(query)
        self.assertTrue(len(matches) > 0, f"No matches found for '{query}'")
        top = matches[0]
        self.assertEqual(top.series_id, 614, f"Expected Series ID 614, got {top.series_id} ({top.name})")
        self.assertIn("Guardians of AI", top.name)
        self.assertGreaterEqual(top.score, 95.0)
        self.assertNotEqual(top.match_type, "learned_pattern", "Should not match via fuzzy learned_pattern")

    def test_the_future_of_ai_matches_topic_649(self):
        """The Future of AI must match The Future Of Artificial Intelligence."""
        query = "The Future of AI"
        matches = self.matcher.find_matches(query)
        self.assertTrue(len(matches) > 0, f"No matches found for '{query}'")
        top = matches[0]
        self.assertEqual(top.name, "The Future Of Artificial Intelligence")
        self.assertGreaterEqual(top.score, 95.0)
        self.assertIn("1uBHZ9soQZYdcgatw7BZ02lAgM8Nay8G2jQiPQn-1fj0", top.link)

    def test_starting_or_winding_down_a_business_matches_id_74(self):
        """5 things I wish someone told me about starting (or winding down) a business must match ID 74 and NEVER Showrunner."""
        query = "5 things I wish someone told me about starting (or winding down) a business"
        matches = self.matcher.find_matches(query)
        self.assertTrue(len(matches) > 0, f"No matches found for '{query}'")
        top = matches[0]
        self.assertEqual(
            top.name,
            "Five Things I Wish Someone Told Me When I First Launched My Business or Startup",
            f"Expected Business/Startup launch, got: {top.name}"
        )
        self.assertGreaterEqual(top.score, 95.0)
        self.assertIn("1Ck6SJBSimdyDM-eEuTK_gNXT6rSUJ_6lAEWzd9fdT8Y", top.link)
        self.assertNotIn("Showrunner", top.name, "CRITICAL: Must never falsely match Showrunner!")

    def test_unique_colon_prefixes_not_hijacked_by_learned_pattern(self):
        """Every unique colon-prefix in interview_series.json matches its own catalog series and is not hijacked."""
        sample_prefixes = [
            ("Guardians of AI", 614, "Guardians of AI"),
            ("The Future Of Beauty", 688, "The Future Of Beauty"),
            ("Health Tech", 655, "Health Tech"),
            ("Power Women", 491, "Power Women"),
            ("Purpose Before Profit", 183, "Purpose Before Profit")
        ]
        for prefix, expected_id, expected_title_part in sample_prefixes:
            matches = self.matcher.find_matches(prefix)
            self.assertTrue(len(matches) > 0, f"No matches for prefix '{prefix}'")
            top = matches[0]
            self.assertEqual(
                top.series_id,
                expected_id,
                f"Prefix '{prefix}' matched series ID {top.series_id} ({top.name}) instead of {expected_id}"
            )
            self.assertIn(expected_title_part, top.name)
            self.assertGreaterEqual(top.score, 95.0)
            self.assertNotEqual(top.match_type, "learned_pattern", f"Prefix '{prefix}' was hijacked by learned_pattern!")

    def test_all_exact_learned_rules_fidelity(self):
        """Every exact original_topic in data/learned_rules.json matches its correct_doc_id / correct_topic_name."""
        if not os.path.exists(self.rules_path):
            self.skipTest("learned_rules.json does not exist")
        
        with open(self.rules_path, 'r', encoding='utf-8') as f:
            rules = json.load(f)
        
        for rule in rules:
            original = rule.get("original_topic")
            expected_name = rule.get("correct_topic_name")
            expected_doc_id = rule.get("correct_doc_id")
            
            if not original or not expected_name:
                continue
            
            match = self.correction_tracker.find_learned_match(original)
            self.assertIsNotNone(match, f"Learned rule failed to match original topic: '{original}'")
            self.assertEqual(
                match.get("topic_name"),
                expected_name,
                f"Mismatch for '{original}': expected '{expected_name}', got '{match.get('topic_name')}'"
            )
            if expected_doc_id:
                self.assertEqual(
                    match.get("doc_id"),
                    expected_doc_id,
                    f"Doc ID mismatch for '{original}': expected '{expected_doc_id}', got '{match.get('doc_id')}'"
                )

    def test_novel_5_things_strings_never_match_showrunner(self):
        """Random novel '5 things I wish someone told me about <unlisted topic>' strings never match Showrunner via typo_tolerant_word_match."""
        novel_queries = [
            "5 things I wish someone told me about underwater basket weaving",
            "5 things I wish someone told me about origami folding",
            "5 things I wish someone told me about modern glaciology",
            "5 things I wish someone told me about medieval cartography",
            "5 things I wish someone told me about alpine skiing",
            "5 things I wish someone told me about quantum optics"
        ]
        for query in novel_queries:
            matches = self.matcher.find_matches(query)
            if matches:
                top = matches[0]
                self.assertNotIn(
                    "showrunner",
                    top.name.lower(),
                    f"CRITICAL: Query '{query}' falsely matched Showrunner series with score {top.score} ({top.match_type})!"
                )
                self.assertNotEqual(
                    top.match_type,
                    "typo_tolerant_word_match",
                    f"Query '{query}' unexpectedly matched via typo_tolerant_word_match: {top.name}"
                )


if __name__ == '__main__':
    unittest.main()
