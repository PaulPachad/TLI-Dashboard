import unittest
import json
import os
from matcher import TopicMatcher


class TestGoldenDataset(unittest.TestCase):
    """
    Evaluates topic matching accuracy against historical real-world predictions
    logged in data/prediction_log.json.
    """

    @classmethod
    def setUpClass(cls):
        cls.matcher = TopicMatcher()
        cls.log_path = os.path.join(os.path.dirname(__file__), 'data', 'prediction_log.json')
        cls.test_cases = []
        if os.path.exists(cls.log_path):
            with open(cls.log_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # Deduplicate extracted -> predicted topic mappings
            seen = {}
            for entry in data:
                ext = entry.get('extracted_topic')
                pred = entry.get('predicted_topic')
                status = entry.get('status')
                if ext and pred and status == 'confirmed':
                    ext_clean = ext.strip()
                    if ext_clean not in seen:
                        seen[ext_clean] = pred.strip()
                        cls.test_cases.append((ext_clean, pred.strip()))

    def test_golden_dataset_overall_accuracy(self):
        """Verify that matcher achieves >= 95% accuracy across historical confirmed matches."""
        if not self.test_cases:
            self.skipTest("No prediction log available for golden test")

        correct = 0
        total = len(self.test_cases)
        mismatches = []

        for ext, expected in self.test_cases:
            matches = self.matcher.find_matches(ext, top_n=1)
            if matches and matches[0].name.lower() == expected.lower():
                correct += 1
            else:
                actual = matches[0].name if matches else "None"
                mismatches.append((ext, expected, actual))

        accuracy = correct / total if total > 0 else 0
        print(f"\n[Golden Dataset] Evaluated {total} historical pitches: {correct}/{total} correct ({accuracy * 100:.1f}%)")
        self.assertGreaterEqual(
            accuracy, 0.95,
            f"Expected at least 95% golden dataset accuracy, got {accuracy * 100:.1f}%. Mismatches: {len(mismatches)}"
        )

    def test_critical_historical_anchors(self):
        """Ensure key historical anchor pitches match their verified target series."""
        anchors = [
            ("The Future of AI: Control Points", "The Future Of Artificial Intelligence"),
            ("Meet Nashville's Rising Stars", "Meet Nashville's Rising Stars"),
            ("PR Pros: 5 Things You Need To Create A Highly Successful Career As A Public Relations Pro", "PR Pros: 5 Things You Need To Create A Highly Successful Career As A Public Relations Pro"),
            ("Social Impact Heroes", "Social Impact Heroes"),
            ("Women in Wellness", "Women In Wellness"),
        ]
        for query, expected in anchors:
            matches = self.matcher.find_matches(query, top_n=1)
            self.assertTrue(len(matches) > 0, f"No match found for anchor '{query}'")
            self.assertEqual(matches[0].name.lower(), expected.lower(), f"Anchor '{query}' matched '{matches[0].name}' instead of '{expected}'")


if __name__ == '__main__':
    unittest.main()
