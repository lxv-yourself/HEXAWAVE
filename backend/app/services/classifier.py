"""Transparent, rule-based hotspot classification for the Phase 1 demo."""

from __future__ import annotations

from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any

from app.services.data_loader import load_facilities, load_hotspots


PERSISTENCE_RADIUS_KM = 0.8
PERSISTENCE_WINDOW_DAYS = 30
INDUSTRIAL_PROXIMITY_KM = 2.0
NATURAL_FIRE_MIN_DISTANCE_KM = 5.0
NATURAL_LAND_COVERS = {"forest", "grassland", "cropland"}


def haversine_km(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    """Calculate an approximate distance between two coordinates in kilometres."""
    earth_radius_km = 6371.0
    latitude_difference = radians(lat_b - lat_a)
    longitude_difference = radians(lon_b - lon_a)
    a = (
        sin(latitude_difference / 2) ** 2
        + cos(radians(lat_a)) * cos(radians(lat_b)) * sin(longitude_difference / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(a))


def _persistence_features(hotspot: dict[str, Any], all_hotspots: list[dict[str, Any]]) -> tuple[int, int]:
    """Count nearby observations and distinct days in the prior 30-day window."""
    matching_observations: list[dict[str, Any]] = []
    for candidate in all_hotspots:
        distance = haversine_km(
            hotspot["latitude"], hotspot["longitude"], candidate["latitude"], candidate["longitude"]
        )
        day_difference = abs((candidate["acq_datetime"] - hotspot["acq_datetime"]).days)
        if distance <= PERSISTENCE_RADIUS_KM and day_difference <= PERSISTENCE_WINDOW_DAYS:
            matching_observations.append(candidate)

    distinct_days = {item["acq_datetime"].date().isoformat() for item in matching_observations}
    return len(matching_observations), len(distinct_days)


def _nearest_facility(hotspot: dict[str, Any], facilities: list[dict[str, Any]]) -> tuple[dict[str, Any], float]:
    if not facilities:
        raise ValueError("At least one industrial facility is required for proximity analysis.")

    facility_distances = [
        (
            facility,
            haversine_km(
                hotspot["latitude"], hotspot["longitude"], facility["latitude"], facility["longitude"]
            ),
        )
        for facility in facilities
    ]
    return min(facility_distances, key=lambda item: item[1])


def _classification(
    *, distance_km: float, detection_days: int, land_cover: str
) -> tuple[str, str, float, list[str]]:
    """Apply deliberately small rules and return class, key, score, and evidence."""
    if distance_km <= INDUSTRIAL_PROXIMITY_KM and detection_days >= 3:
        confidence = min(0.94, 0.62 + (0.06 * detection_days) + 0.10)
        return (
            "Industrial / Persistent Thermal Source",
            "industrial_persistent",
            confidence,
            [
                f"Repeated detections on {detection_days} distinct day(s) within {PERSISTENCE_RADIUS_KM} km.",
                f"Nearest mapped industrial facility is {distance_km:.2f} km away.",
                "Land-cover context is built-up, which is consistent with an industrial setting.",
            ],
        )

    if land_cover in NATURAL_LAND_COVERS and distance_km > NATURAL_FIRE_MIN_DISTANCE_KM and detection_days <= 2:
        confidence = min(0.84, 0.58 + (0.10 if land_cover == "forest" else 0.06) + 0.10)
        return (
            "Natural / Wildfire",
            "natural_wildfire",
            confidence,
            [
                f"Land-cover context is {land_cover}, which can be compatible with open-land fire activity.",
                f"Nearest mapped industrial facility is {distance_km:.2f} km away.",
                f"Only {detection_days} nearby detection day(s) appear in the 30-day window.",
            ],
        )

    return (
        "Other / Uncertain",
        "other_uncertain",
        0.42,
        [
            "Available spatial and temporal evidence does not meet either demonstration rule.",
            (
                "Land-cover context is unavailable."
                if land_cover == "unavailable"
                else f"Land-cover context is {land_cover}, but is not decisive by itself."
            ),
            "This result should be reviewed; it is not a confirmed incident classification.",
        ],
    )


def classify_hotspots(
    hotspots: list[dict[str, Any]] | None = None, facilities: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Enrich every hotspot with explainable spatial and temporal features."""
    all_hotspots = hotspots if hotspots is not None else load_hotspots()
    all_facilities = facilities if facilities is not None else load_facilities()
    enriched: list[dict[str, Any]] = []

    for hotspot in all_hotspots:
        facility, distance_km = _nearest_facility(hotspot, all_facilities)
        observation_count, detection_days = _persistence_features(hotspot, all_hotspots)
        label, class_key, confidence, reasons = _classification(
            distance_km=distance_km,
            detection_days=detection_days,
            land_cover=hotspot["land_cover_context"],
        )
        enriched.append(
            {
                "hotspot_id": hotspot["hotspot_id"],
                "latitude": hotspot["latitude"],
                "longitude": hotspot["longitude"],
                "acq_datetime": hotspot["acq_datetime"].isoformat(),
                "brightness": hotspot["brightness"],
                "frp": hotspot["frp"],
                "source": hotspot["source"],
                "contextual_features": {
                    "land_cover_context": hotspot["land_cover_context"],
                    "nearest_facility_name": facility["name"],
                    "nearest_facility_distance_km": round(distance_km, 2),
                    "nearby_observation_count": observation_count,
                    "persistence_detection_days": detection_days,
                    "persistence_window_days": PERSISTENCE_WINDOW_DAYS,
                },
                "classification": {
                    "label": label,
                    "class_key": class_key,
                    "confidence": round(confidence, 2),
                    "confidence_note": "Rule-based evidence score; not a measured probability.",
                    "reasons": reasons,
                },
            }
        )
    return sorted(enriched, key=lambda item: item["acq_datetime"], reverse=True)
