"""Load and validate small CSV adapters used by the offline MVP."""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Any


DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"


class DataValidationError(ValueError):
    """Raised when an input CSV cannot safely be used by the app."""


def _read_csv(filename: str) -> list[dict[str, str]]:
    path = DATA_DIRECTORY / filename
    if not path.exists():
        raise DataValidationError(f"Required demo data file was not found: {filename}")

    with path.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))

    if not rows:
        raise DataValidationError(f"The data file {filename} is empty.")
    return rows


def _require_fields(row: dict[str, str], required: set[str], row_number: int) -> None:
    missing = [field for field in required if not row.get(field)]
    if missing:
        raise DataValidationError(
            f"Row {row_number} is missing required field(s): {', '.join(sorted(missing))}."
        )


def _coordinate(value: str, axis: str, row_number: int) -> float:
    try:
        numeric_value = float(value)
    except (TypeError, ValueError) as error:
        raise DataValidationError(f"Row {row_number} has an invalid {axis} coordinate.") from error

    minimum, maximum = (-90, 90) if axis == "latitude" else (-180, 180)
    if not minimum <= numeric_value <= maximum:
        raise DataValidationError(
            f"Row {row_number} has a {axis} outside the valid range {minimum} to {maximum}."
        )
    return numeric_value


def _positive_number(value: str, field: str, row_number: int) -> float:
    try:
        numeric_value = float(value)
    except (TypeError, ValueError) as error:
        raise DataValidationError(f"Row {row_number} has an invalid {field} value.") from error
    if numeric_value < 0:
        raise DataValidationError(f"Row {row_number} has a negative {field} value.")
    return numeric_value


def load_hotspots() -> list[dict[str, Any]]:
    """Return validated hotspot rows in a format safe for feature engineering."""
    required = {
        "hotspot_id",
        "latitude",
        "longitude",
        "acq_datetime",
        "brightness",
        "frp",
        "land_cover_context",
        "source",
    }
    hotspots: list[dict[str, Any]] = []

    for row_number, row in enumerate(_read_csv("demo_firms_hotspots.csv"), start=2):
        _require_fields(row, required, row_number)
        try:
            acquired_at = datetime.fromisoformat(row["acq_datetime"])
        except ValueError as error:
            raise DataValidationError(
                f"Row {row_number} has an invalid ISO date/time in acq_datetime."
            ) from error

        hotspots.append(
            {
                "hotspot_id": row["hotspot_id"],
                "latitude": _coordinate(row["latitude"], "latitude", row_number),
                "longitude": _coordinate(row["longitude"], "longitude", row_number),
                "acq_datetime": acquired_at,
                "brightness": _positive_number(row["brightness"], "brightness", row_number),
                "frp": _positive_number(row["frp"], "frp", row_number),
                "land_cover_context": row["land_cover_context"].strip().lower(),
                "source": row["source"],
            }
        )
    return hotspots


def load_facilities() -> list[dict[str, Any]]:
    """Return validated industrial facility rows for proximity calculations."""
    required = {"facility_id", "name", "facility_type", "latitude", "longitude", "source"}
    facilities: list[dict[str, Any]] = []

    for row_number, row in enumerate(_read_csv("demo_industrial_facilities.csv"), start=2):
        _require_fields(row, required, row_number)
        facilities.append(
            {
                "facility_id": row["facility_id"],
                "name": row["name"],
                "facility_type": row["facility_type"],
                "latitude": _coordinate(row["latitude"], "latitude", row_number),
                "longitude": _coordinate(row["longitude"], "longitude", row_number),
                "source": row["source"],
            }
        )
    return facilities


def load_volcanoes() -> list[dict[str, Any]]:
    """Return validated volcano reference locations for thermal-anomaly alerts."""
    required = {"volcano_id", "name", "latitude", "longitude", "source"}
    volcanoes: list[dict[str, Any]] = []

    for row_number, row in enumerate(_read_csv("demo_volcanoes.csv"), start=2):
        _require_fields(row, required, row_number)
        volcanoes.append(
            {
                "volcano_id": row["volcano_id"],
                "name": row["name"],
                "latitude": _coordinate(row["latitude"], "latitude", row_number),
                "longitude": _coordinate(row["longitude"], "longitude", row_number),
                "source": row["source"],
            }
        )
    return volcanoes
