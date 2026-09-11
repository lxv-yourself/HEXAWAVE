import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.alerts import generate_alerts


class AlertTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.alerts = generate_alerts()

    def test_generates_wildfire_and_volcanic_review_alerts(self):
        event_keys = {alert["event_key"] for alert in self.alerts}
        self.assertIn("potential_wildfire", event_keys)
        self.assertIn("potential_volcanic_thermal_anomaly", event_keys)

    def test_every_alert_requires_human_review(self):
        for alert in self.alerts:
            self.assertEqual(alert["status"], "HUMAN_REVIEW_REQUIRED")
            self.assertIn("not confirm", alert["disclaimer"].lower())

    def test_volcanic_alert_is_grouped_not_confirmed(self):
        volcanic_alert = next(
            alert for alert in self.alerts if alert["event_key"] == "potential_volcanic_thermal_anomaly"
        )
        self.assertEqual(len(volcanic_alert["linked_hotspot_ids"]), 2)
        self.assertNotIn("eruption", volcanic_alert["event_type"].lower())


if __name__ == "__main__":
    unittest.main()
