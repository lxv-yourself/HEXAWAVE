"""FastAPI entry point for the FIRETRACE AI offline MVP."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.services.alerts import generate_alerts
from app.services.classifier import classify_hotspots
from app.services.data_loader import DataValidationError, load_facilities


PROJECT_DIRECTORY = Path(__file__).resolve().parents[2]
FRONTEND_DIRECTORY = PROJECT_DIRECTORY / "frontend"
ALLOWED_CLASS_KEYS = {"industrial_persistent", "natural_wildfire", "other_uncertain"}

app = FastAPI(
    title="FIRETRACE AI API",
    version="0.1.0",
    description="Offline-first, explainable thermal-hotspot demonstration API.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "mode": "offline demo data"}


@app.get("/api/metadata")
def metadata() -> dict:
    return {
        "project": "FIRETRACE AI",
        "demo_mode": True,
        "data_sources": {
            "thermal_hotspots": "DEMO_FIRMS synthetic CSV (not live NASA FIRMS)",
            "industrial_facilities": "DEMO_OSM synthetic CSV (not live OpenStreetMap)",
            "land_cover": "Demo context field in hotspot CSV; satellite-derived land cover is unavailable in this release.",
            "volcano_references": "DEMO_VOLCANO_CATALOG synthetic CSV (not a live volcano observatory feed)",
        },
        "limitations": [
            "This is AI-assisted decision support, not a fire-alerting system.",
            "Confidence is a rule-based evidence score, not a measured probability.",
            "Rules are demonstration thresholds and must be validated before real-world use.",
        ],
    }


@app.get("/api/hotspots")
def get_hotspots(class_key: str | None = Query(default=None)) -> dict:
    if class_key is not None and class_key not in ALLOWED_CLASS_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"class_key must be one of: {', '.join(sorted(ALLOWED_CLASS_KEYS))}.",
        )
    try:
        hotspots = classify_hotspots()
    except (DataValidationError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Demo data error: {error}") from error

    if class_key:
        hotspots = [item for item in hotspots if item["classification"]["class_key"] == class_key]
    return {"count": len(hotspots), "hotspots": hotspots}


@app.get("/api/facilities")
def get_facilities() -> dict:
    try:
        facilities = load_facilities()
    except DataValidationError as error:
        raise HTTPException(status_code=500, detail=f"Demo data error: {error}") from error
    return {"count": len(facilities), "facilities": facilities}


@app.get("/api/alerts")
def get_alerts() -> dict:
    """Return grouped potential-event alerts; every result requires human review."""
    try:
        alerts = generate_alerts()
    except (DataValidationError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Demo data error: {error}") from error
    return {
        "count": len(alerts),
        "alerts": alerts,
        "notice": "All alerts are AI-assisted, rule-based demonstration alerts and require human review.",
    }


# Mount this last so API routes continue to take priority over the dashboard.
app.mount("/", StaticFiles(directory=FRONTEND_DIRECTORY, html=True), name="frontend")
