"""Generate cautious, human-review alerts from explainable hotspot evidence."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.services.classifier import haversine_km, classify_hotspots
from app.services.data_loader import load_volcanoes


EVENT_GROUP_RADIUS_KM = 5.0
EVENT_GROUP_WINDOW_DAYS = 3
VOLCANO_PROXIMITY_KM = 5.0
WILDFIRE_MIN_FRP = 25.0
VOLCANIC_ANOMALY_MIN_BRIGHTNESS = 340.0


def _parsed_time(hotspot: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(hotspot["acq_datetime"])


def _group_nearby_events(hotspots: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group detections that plausibly describe one event rather than alerting per point."""
    groups: list[list[dict[str, Any]]] = []
    for hotspot in sorted(hotspots, key=_parsed_time):
        for group in groups:
            anchor = group[0]
            is_nearby = haversine_km(
                hotspot["latitude"], hotspot["longitude"], anchor["latitude"], anchor["longitude"]
            ) <= EVENT_GROUP_RADIUS_KM
            is_close_in_time = abs((_parsed_time(hotspot) - _parsed_time(anchor)).days) <= EVENT_GROUP_WINDOW_DAYS
            if is_nearby and is_close_in_time:
                group.append(hotspot)
                break
        else:
            groups.append([hotspot])
    return groups


def _highest_frp(hotspots: list[dict[str, Any]]) -> float:
    return max(hotspot["frp"] for hotspot in hotspots)


def _latest_time(hotspots: list[dict[str, Any]]) -> str:
    return max(hotspot["acq_datetime"] for hotspot in hotspots)


def _wildfire_alerts(hotspots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = [
        hotspot
        for hotspot in hotspots
        if hotspot["classification"]["class_key"] == "natural_wildfire" and hotspot["frp"] >= WILDFIRE_MIN_FRP
    ]
    alerts: list[dict[str, Any]] = []
    for index, group in enumerate(_group_nearby_events(candidates), start=1):
        anchor = group[0]
        maximum_frp = _highest_frp(group)
        severity = "high" if maximum_frp >= 40 else "medium"
        land_cover = anchor["contextual_features"]["land_cover_context"]
        alerts.append(
            {
                "alert_id": f"WILDFIRE-DEMO-{index:03d}",
                "event_key": "potential_wildfire",
                "event_type": "Potential Wildfire",
                "severity": severity,
                "status": "HUMAN_REVIEW_REQUIRED",
                "latitude": anchor["latitude"],
                "longitude": anchor["longitude"],
                "detected_at": _latest_time(group),
                "linked_hotspot_ids": [hotspot["hotspot_id"] for hotspot in group],
                "reasons": [
                    f"{len(group)} nearby natural-fire detection(s) were grouped into one event.",
                    f"Maximum Fire Radiative Power (FRP) in the group is {maximum_frp:.1f}.",
                    f"Land-cover context is {land_cover} and the hotspot is remote from a mapped industrial facility.",
                ],
                "disclaimer": "This does not confirm a wildfire. It is a demo rule-based alert; verify with authorities and additional sources before action.",
            }
        )
    return alerts


def _closest_volcano(hotspot: dict[str, Any], volcanoes: list[dict[str, Any]]) -> tuple[dict[str, Any], float]:
    distances = [
        (
            volcano,
            haversine_km(hotspot["latitude"], hotspot["longitude"], volcano["latitude"], volcano["longitude"]),
        )
        for volcano in volcanoes
    ]
    return min(distances, key=lambda item: item[1])


def _volcanic_alerts(hotspots: list[dict[str, Any]], volcanoes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    for volcano in volcanoes:
        candidates = [
            hotspot
            for hotspot in hotspots
            if hotspot["brightness"] >= VOLCANIC_ANOMALY_MIN_BRIGHTNESS
            and haversine_km(hotspot["latitude"], hotspot["longitude"], volcano["latitude"], volcano["longitude"])
            <= VOLCANO_PROXIMITY_KM
        ]
        if not candidates:
            continue

        groups = _group_nearby_events(candidates)
        for index, group in enumerate(groups, start=1):
            anchor = group[0]
            distinct_days = len({hotspot["acq_datetime"][:10] for hotspot in group})
            if distinct_days < 2:
                continue
            _, distance_km = _closest_volcano(anchor, [volcano])
            alerts.append(
                {
                    "alert_id": f"VOLCANIC-DEMO-{volcano['volcano_id']}-{index:03d}",
                    "event_key": "potential_volcanic_thermal_anomaly",
                    "event_type": "Potential Volcanic Thermal Anomaly",
                    "severity": "high" if _highest_frp(group) >= 50 else "medium",
                    "status": "HUMAN_REVIEW_REQUIRED",
                    "latitude": anchor["latitude"],
                    "longitude": anchor["longitude"],
                    "detected_at": _latest_time(group),
                    "linked_hotspot_ids": [hotspot["hotspot_id"] for hotspot in group],
                    "reasons": [
                        f"{distinct_days} detection day(s) of elevated thermal activity were observed near a volcano reference point.",
                        f"Nearest reference location, {volcano['name']}, is {distance_km:.2f} km away.",
                        f"Maximum brightness is {max(hotspot['brightness'] for hotspot in group):.1f} K.",
                    ],
                    "disclaimer": "This does not confirm a volcanic eruption. It is a demo thermal-anomaly alert requiring expert review.",
                }
            )
    return alerts


def generate_alerts(
    hotspots: list[dict[str, Any]] | None = None, volcanoes: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Return prioritised potential-event alerts generated from current hotspot evidence."""
    enriched_hotspots = hotspots if hotspots is not None else classify_hotspots()
    volcano_references = volcanoes if volcanoes is not None else load_volcanoes()
    alerts = _wildfire_alerts(enriched_hotspots) + _volcanic_alerts(enriched_hotspots, volcano_references)
    severity_order = {"high": 0, "medium": 1, "low": 2}
    return sorted(alerts, key=lambda alert: (severity_order[alert["severity"]], alert["detected_at"]), reverse=False)
