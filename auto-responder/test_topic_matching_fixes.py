import unittest
from matcher import TopicMatcher, extract_topic_distinctive_part, normalize_topic_for_exact


class TestTopicMatchingFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matcher = TopicMatcher()

    def test_rising_stars_tv_film_slash_match(self):
        """Test 'meet the rising stars of tv/film' matches 'Meet The Rising Stars of TV and Film' with 100% confidence."""
        topic_input = "meet the rising stars of tv/film"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0, "Should find matches for rising stars tv/film")
        top_match = matches[0]
        self.assertEqual(top_match.name, "Meet The Rising Stars of TV and Film")
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_prefix_detection_rising_stars(self):
        """Test that extract_topic_distinctive_part does NOT falsely flag common prefix for 'meet the rising stars'."""
        distinctive, had_prefix = extract_topic_distinctive_part("meet the rising stars of tv/film")
        self.assertFalse(had_prefix, "Should not flag 'meet the rising stars' as having a '5 Things' common prefix")

    def test_guardians_of_ai_full_match(self):
        """Test that full 'Guardians of AI...' title matches correctly at 100%."""
        topic_input = "Guardians of AI: How AI Leaders Are Keeping AI Safe, Ethical, Responsible, and True"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertIn("Guardians of AI", top_match.name)
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_healthy_to_a_hundred_full_match(self):
        """Test that full 'Healthy To A Hundred...' title matches correctly at 100%."""
        topic_input = "Healthy To A Hundred: 5 Things You Need To Live A Long, Healthy, & Happy Life"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertIn("Healthy To A Hundred", top_match.name)
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_short_word_false_positives_rejected(self):
        """Test that single words like 'Ethical', 'Healthy', 'Safe' do NOT match long topic titles at >= 90%."""
        for word in ["Ethical", "Healthy", "Safe", "Future", "Responsible"]:
            matches = self.matcher.find_matches(word)
            high_matches = [m for m in matches if m.score >= 90.0]
            for m in high_matches:
                self.assertLess(len(m.name), 25, f"Short word '{word}' falsely matched long topic '{m.name}' with score {m.score}")

    def test_normalize_topic_for_exact(self):
        """Test string normalization helper for slashes, ampersands, numbers, and punctuation."""
        self.assertEqual(
            normalize_topic_for_exact("Meet The Rising Stars of TV/Film"),
            "meet the rising stars of tv and film"
        )
        self.assertEqual(
            normalize_topic_for_exact("Healthy To A Hundred: 5 Things You Need To Live A Long, Healthy, & Happy Life"),
            "healthy to a 100 5 things you need to live a long healthy and happy life"
        )

    def test_future_of_beauty_matches_topic_688(self):
        """Test 'The Future of Beauty' matches 'The Future Of Beauty...' (ID 688), NOT 'Beauty Without Cruelty...' (ID 155)."""
        topic_input = "The Future of Beauty"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 688)
        self.assertIn("The Future Of Beauty", top_match.name)
        self.assertGreaterEqual(top_match.score, 95.0)


    def test_male_dominated_industry_matches_topic_207(self):
        """Test 'Five Things You Need To Thrive and Succeed as a Woman In a Male-Dominated Industry' matches ID 207, not ID 75."""
        topic_input = "Five Things You Need To Thrive and Succeed as a Woman In a Male-Dominated Industry"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 207)
        self.assertIn("Male Dominated Industry", top_match.name)
        self.assertGreaterEqual(top_match.score, 95.0)


    def test_title_formula_matching(self):
        """Test that a pitch matching an article title formula from the CSV resolves to that series."""
        topic_input = "Rising Star On The Five Things You Need To Shine In The Entertainment Industry"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 2)
        self.assertIn("Meet The Rising Stars of TV and Film", top_match.name)
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_nashville_apostrophe_healed(self):
        """Test that Meet Nashville's Rising Stars is correctly decoded and matches."""
        matches = self.matcher.find_matches("Meet Nashville's Rising Stars")
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.name, "Meet Nashville's Rising Stars")

    def test_future_of_ai_control_points_matches_topic_649(self):
        """Test that 'The Future of AI: Control Points' matches Topic 649, NOT Topic 372."""
        topic_input = "The Future of AI: Control Points"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0, "Should find matches for 'The Future of AI: Control Points'")
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 649, f"Expected topic 649, got {top_match.series_id}: {top_match.name}")
        self.assertEqual(top_match.name, "The Future Of Artificial Intelligence")
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_future_of_ai_direct_matches_topic_649(self):
        """Test that 'The Future of AI' directly matches Topic 649."""
        topic_input = "The Future of AI"
        matches = self.matcher.find_matches(topic_input)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 649)
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_control_points_not_matched_to_turning_points(self):
        """Test that 'Control Points' and 'Points' do NOT match Topic 372 (Turning Points) at high confidence."""
        for phrase in ["Control Points", "Points"]:
            matches = self.matcher.find_matches(phrase)
            high_matches = [m for m in matches if m.score >= 90.0]
            for m in high_matches:
                self.assertNotEqual(m.series_id, 372, f"'{phrase}' falsely matched Topic 372 ({m.name}) with score {m.score}")

    def test_esther_harris_pitch_form_match(self):
        """Test full pitch email text for Esther Harris matches Topic 649."""
        pitch_body = (
            "What is the name of the interview topic you are pitching for? (Choose one please) The Future of AI: Control Points\n"
            "Your 200 word pitch For enterprises, the bigger lesson is that A.I. strategy should be about position and advantage...\n"
            "What is the best email to follow up with you? esther.harris@thebookpublicist.co.uk"
        )
        matches = self.matcher.find_matches(pitch_body)
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 649)
        self.assertEqual(top_match.name, "The Future Of Artificial Intelligence")
        self.assertGreaterEqual(top_match.score, 95.0)

    def test_decompose_pitch_topic(self):
        """Test decomposition of pitch topics with colons, hyphens, and dashes."""
        from matcher import decompose_pitch_topic
        self.assertEqual(
            decompose_pitch_topic("The Future of AI: Control Points"),
            ("The Future of AI", "Control Points")
        )
        self.assertEqual(
            decompose_pitch_topic("Power Women - How To Lead"),
            ("Power Women", "How To Lead")
        )
        self.assertEqual(
            decompose_pitch_topic("Women in Tech — Breaking Barriers"),
            ("Women in Tech", "Breaking Barriers")
        )
        self.assertEqual(
            decompose_pitch_topic("Simple Single Topic"),
            ("Simple Single Topic", None)
        )

    def test_domain_aliases_normalization(self):
        """Test domain alias acronym normalization in normalize_numbers_to_digits."""
        from matcher import normalize_numbers_to_digits
        self.assertEqual(normalize_numbers_to_digits("The Future of Artificial Intelligence"), "the future of ai")
        self.assertEqual(normalize_numbers_to_digits("Looking for Public Relations Pro"), "looking for pr pro")
        self.assertEqual(normalize_numbers_to_digits("Chief Executive Officer"), "ceo")
        self.assertEqual(normalize_numbers_to_digits("Human Resources Director"), "hr director")

    def test_dash_separated_topic_match(self):
        """Test that dash-separated pitch titles match the primary series."""
        matches = self.matcher.find_matches("The Future of AI - Control Points")
        self.assertTrue(len(matches) > 0)
        top_match = matches[0]
        self.assertEqual(top_match.series_id, 649)
        self.assertEqual(top_match.name, "The Future Of Artificial Intelligence")

    def test_llm_arbiter_graceful_offline(self):
        """Test that LLMArbiter initializes safely and doesn't crash offline."""
        from llm_arbiter import LLMArbiter
        arbiter = LLMArbiter()
        # Should return boolean without crashing
        self.assertIsInstance(arbiter.is_available(), bool)
        # Should gracefully return None without error when not configured or given empty list
        self.assertIsNone(arbiter.verify_candidates("test pitch", []))


    def test_female_founders_does_not_match_founder_series(self):
        """Ensure 'Female Founders' matches Female Founders series, NOT 5 Things Before I Became a Founder."""
        matches = self.matcher.find_matches("Female Founders")
        self.assertTrue(len(matches) > 0)
        self.assertEqual(matches[0].name, "Female Founders: Five Things You Need To Thrive and Succeed as a Woman Founder")
        self.assertGreaterEqual(matches[0].score, 90.0)
        # Ensure 5 Things Founder is not top match
        for m in matches[:3]:
            if "became a founder" in m.name.lower():
                self.assertLess(m.score, 90.0)

    def test_multi_topic_splitting_with_quotes(self):
        """Test multi-topic string with curly quotes and 'or' splits and matches both."""
        import re
        extracted = 'Highly Effective Networking\u201d or \u201cFemale Founders.'
        parts = re.split(r'["\'“”„‟]\s*(?:or|and)\s*["\'“”„‟]|;\s*|\n+|\r\n|,\s*(?:or\s+|and\s+)?|\s+\d+[\.:]\s+|\s+or\s+', extracted, flags=re.IGNORECASE)
        clean_parts = []
        for p in parts:
            clean_p = p.strip().strip('"\'“”„‟. ,;:')
            clean_p = re.sub(r'^\d+[\.:]\s*', '', clean_p).strip()
            if len(clean_p) > 5:
                clean_parts.append(clean_p)
        self.assertEqual(len(clean_parts), 2)
        self.assertEqual(clean_parts[0], "Highly Effective Networking")
        self.assertEqual(clean_parts[1], "Female Founders")

        matches_1 = self.matcher.find_matches(clean_parts[0], top_n=1)
        self.assertTrue(len(matches_1) > 0)
        self.assertIn("Highly Effective Networking", matches_1[0].name)
        self.assertGreaterEqual(matches_1[0].score, 90.0)

        matches_2 = self.matcher.find_matches(clean_parts[1], top_n=1)
        self.assertTrue(len(matches_2) > 0)
        self.assertIn("Female Founders", matches_2[0].name)
        self.assertGreaterEqual(matches_2[0].score, 90.0)

    def test_top_5_mistakes_legal_counsel_match(self):
        """Ensure 'Top 5 Mistakes Businesses Make Without Legal Counsel' matches exactly."""
        matches = self.matcher.find_matches("Top 5 Mistakes Businesses Make Without Legal Counsel")
        self.assertTrue(len(matches) > 0)
        self.assertEqual(matches[0].name, "Top 5 Mistakes Businesses Make Without Legal Counsel")
        self.assertEqual(matches[0].score, 100.0)


if __name__ == '__main__':
    unittest.main()


