"""Regressions for the three incorrect inbox drafts reported September 9."""
import unittest
import contextlib
import os
import tempfile
from unittest.mock import patch
from matcher import TopicMatcher


class InboxSubjectRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matcher = TopicMatcher()

    def test_reported_pitches_direct_and_form(self):
        cases = [
            ('Women of the C-Suite', 41),
            ('Five Things You Need To Be A Highly Effective Leader', 239),
            ("The Future of Space Innovation: Building the World's First Fully Reusable Medium-Lift Launch Vehicle", 648),
        ]
        for topic, expected in cases:
            for text in (topic, 'What is the name of the interview topic you are pitching for? (Choose one please) '
                         + topic + '\nYour 200 word pitch We build successful companies.'):
                with self.subTest(topic=topic, form=text != topic):
                    matches = self.matcher.find_matches(text)
                    self.assertTrue(matches)
                    self.assertEqual(matches[0].series_id, expected)
                    self.assertGreaterEqual(matches[0].score, 90)
                    self.assertEqual([m.series_id for m in matches if m.score >= 90], [expected])

    def test_specific_titles_still_match_themselves(self):
        for topic_id in (41, 239, 261, 349, 535, 625, 648, 690):
            topic = self.matcher.id_to_series[topic_id]
            with self.subTest(topic=topic['name']):
                matches = self.matcher.find_matches(topic['name'])
                self.assertEqual(matches[0].series_id, topic_id)

    def test_unknown_subjects_do_not_inherit_template_confidence(self):
        for text in ('The Future of Zorblax Innovation: Building a New World',
                     'Five Things You Need To Be A Highly Effective Zorblax'):
            with self.subTest(text=text):
                self.assertFalse([m for m in self.matcher.find_matches(text) if m.score >= 90])

    def test_formula_selection_is_independent_of_database_order(self):
        # Reversing only the formula iteration order must not change the result.
        matcher = TopicMatcher()
        matcher.series = list(reversed(matcher.series))
        self.assertEqual(matcher.find_matches('Women of the C-Suite')[0].series_id, 41)

    def test_source_csv_rebuild_preserves_correct_matches(self):
        """Use the real source CSV, rebuilding only inside a disposable folder."""
        import rebuild_database
        source = rebuild_database.get_csv_path()
        if not os.path.isfile(source):
            self.skipTest('Source CSV is not available on this machine')
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(rebuild_database, 'get_csv_path', return_value=source):
                with contextlib.chdir(directory):
                    rebuilt = rebuild_database.build_from_csv()
            self.assertTrue(rebuilt)
            matcher = TopicMatcher(os.path.join(directory, 'data', 'interview_series.json'))
            for query, expected_id in (
                ('Women of the C-Suite', 41),
                ('Five Things You Need To Be A Highly Effective Leader', 239),
                ("The Future of Space Innovation: Building the World's First Fully Reusable Medium-Lift Launch Vehicle", 648),
            ):
                with self.subTest(query=query):
                    results = matcher.find_matches(query)
                    expected_link = self.matcher.id_to_series[expected_id]['link']
                    self.assertEqual([m.link for m in results if m.score >= 90], [expected_link])


if __name__ == '__main__':
    unittest.main()
