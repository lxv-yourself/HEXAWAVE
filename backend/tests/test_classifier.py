import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.classifier import classify_hotspots, haversine_km


class ClassifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results = {item["hotspot_id"]: item for item in classify_hotspots()}

    def test_distance_between_same_point_is_zero(self):
        self.assertEqual(haversine_km(20.0, 70.0, 20.0, 70.0), 0.0)

    def test_repeated_hotspot_near_facility_is_industrial(self):
        result = self.results["DEMO-IND-001"]
        self.assertEqual(result["classification"]["class_key"], "industrial_persistent")
        self.assertGreaterEqual(result["contextual_features"]["persistence_detection_days"], 3)
        self.assertLessEqual(result["contextual_features"]["nearest_facility_distance_km"], 2.0)

    def test_remote_forest_hotspot_is_natural_fire(self):
        result = self.results["DEMO-WLD-001"]
        self.assertEqual(result["classification"]["class_key"], "natural_wildfire")
        self.assertEqual(result["contextual_features"]["land_cover_context"], "forest")

    def test_missing_context_stays_uncertain(self):
        result = self.results["DEMO-UNC-001"]
        self.assertEqual(result["classification"]["class_key"], "other_uncertain")
        self.assertIn("not a confirmed", result["classification"]["reasons"][-1])


if __name__ == "__main__":
    unittest.main()
