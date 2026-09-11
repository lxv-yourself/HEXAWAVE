# FIRETRACE AI — Hackathon Guide

This document explains the first working version in plain language. Read it before the hackathon demo. It is deliberately short enough to revise and detailed enough to help you modify the project safely.

## 1. The idea in one sentence

FIRETRACE AI takes a thermal hotspot, checks whether heat repeats nearby over time and whether an industrial facility is close, then shows a cautious classification and the reasons behind it.

## 2. What is already built

The Phase 1 MVP is a complete local demo:

```text
Synthetic hotspot CSV + synthetic facility CSV
                  ↓
     validation + distance + persistence features
                  ↓
         explainable rule-based classification
                  ↓
               FastAPI endpoints
                  ↓
        browser dashboard with an interactive map
```

The alert layer groups related points into potential events:

```text
Enriched hotspots + severity rules + volcano reference locations
                         ↓
      grouped potential wildfire / thermal-anomaly review alerts
                         ↓
     severity + evidence + linked hotspots + human-review warning
```

The CSV data is deliberately marked `DEMO_FIRMS` and `DEMO_OSM`. Do not describe it as live NASA FIRMS or OpenStreetMap data.

## 3. Folder map

```text
FIRETRACE-AI/
├── README.md                    # Setup and honest limitations
├── backend/
│   ├── requirements.txt          # FastAPI and Uvicorn dependencies
│   ├── .env.example              # Place future API-key names here, never real keys
│   ├── app/
│   │   ├── main.py               # Starts the API and serves the dashboard
│   │   ├── data/
│   │   │   ├── demo_firms_hotspots.csv
│   │   │   └── demo_industrial_facilities.csv
│   │   │   └── demo_volcanoes.csv
│   │   └── services/
│   │       ├── data_loader.py    # Reads and validates the CSV input
│   │       └── classifier.py     # Feature calculation and visible rules
│   │       └── alerts.py         # Groups high-priority evidence into review alerts
│   └── tests/
│       └── test_classifier.py    # Checks expected demo classifications
├── frontend/
│   ├── index.html                # Dashboard page structure
│   ├── styles.css                # Dashboard appearance and mobile layout
│   └── app.js                    # Calls the API and draws the Leaflet map
└── docs/
    └── HACKATHON_GUIDE.md        # This guide
```

## 4. Explain every backend file

### `backend/app/data/demo_firms_hotspots.csv`

This is the input list of thermal detections. Each row has a location, time, brightness, FRP (Fire Radiative Power), and a small land-cover context field.

**Why it exists:** The project can run without an internet connection or API key.

**Later replacement:** A NASA FIRMS loader can produce the same columns. Keep the `source` field so the dashboard can honestly say where each record came from.

### `backend/app/data/demo_industrial_facilities.csv`

This is the offline replacement for industrial facilities found from OSM/Overpass. The locations are synthetic.

**Why it exists:** It lets us demonstrate the important spatial question: “Is a thermal point close to a known industrial location?”

### `backend/app/services/data_loader.py`

This module safely loads CSV files. It rejects missing fields, invalid dates, invalid coordinates, and negative heat values.

**Why validation matters:** Satellite and map APIs are external data sources. We should never assume they always return clean data.

### `backend/app/services/classifier.py`

This is the decision engine. It calculates:

- **nearest facility distance:** Haversine distance between two latitude/longitude points;
- **nearby observation count:** how many detections appear close to the hotspot;
- **persistence days:** how many separate dates show nearby activity during a 30-day window;
- **land-cover context:** a supplied context field, or `unavailable` when absent.

The current demonstration rules are:

| If the evidence is… | Then label it… |
| --- | --- |
| Within 2 km of a facility and repeated on at least 3 days | Industrial / Persistent Thermal Source |
| Forest, grassland, or cropland; more than 5 km from a facility; present on 2 or fewer days | Natural / Wildfire |
| Anything else | Other / Uncertain |

The evidence score is **not a probability** and **not an accuracy number**. It simply helps communicate the strength of the matching rule in the demo.

### `backend/app/services/alerts.py`

This module turns related hotspots into a single alert so the dashboard does not raise an alert for every satellite point.

| Potential event | Demonstration rule | What the system says |
| --- | --- | --- |
| Wildfire | Natural-fire class, FRP of at least 25, then nearby points within 5 km and 3 days are grouped | **Potential Wildfire — Human Review Required** |
| Volcano | Bright thermal points within 5 km of a volcano reference location, on at least 2 days | **Potential Volcanic Thermal Anomaly — Human Review Required** |

The app never calls a volcanic alert an “eruption.” Heat near a reference point can have different causes, so expert/authority verification remains essential.

The volcano CSV is synthetic in this version. A real version needs a trusted volcano observatory catalogue and a validated satellite-data pipeline.

### `backend/app/main.py`

This creates the local FastAPI server.

| URL | What it returns |
| --- | --- |
| `/` | The dashboard page |
| `/api/health` | A quick “is the server alive?” check |
| `/api/hotspots` | Enriched and classified hotspots |
| `/api/hotspots?class_key=natural_wildfire` | Only one class of hotspot |
| `/api/facilities` | Demo facility locations |
| `/api/alerts` | Grouped potential-event review alerts |
| `/api/metadata` | Data availability and limitations |
| `/docs` | Interactive API documentation generated by FastAPI |

### `frontend/`

The frontend is intentionally a small HTML/CSS/JavaScript dashboard, served by FastAPI. It uses Leaflet for the map so there is no Mapbox key to manage in this phase.

**Map colours:** orange means likely industrial/persistent, green means likely natural/wildfire, amber means uncertain, and blue dots are facilities.

## 5. How to run it

### Fastest demo-day start

Double-click `backend/run_demo.bat`, then open <http://127.0.0.1:8000>. This works after the one-time setup below has created the `.venv` folder.

### One-time setup or command-line start

Open PowerShell in `FIRETRACE-AI\backend`, then run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m unittest discover -s tests -v
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000> in a browser. Keep the PowerShell window open while demonstrating the app. Stop the server with `Ctrl+C` when finished.

If PowerShell blocks virtual-environment activation once, run this command in that PowerShell window only, then try again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## 6. A 60-second judge explanation

> “A thermal satellite hotspot only tells us that the satellite observed heat. It does not tell us whether the source is a wildfire, a factory, or something uncertain. FIRETRACE AI enriches that point with nearby industrial-facility information and temporal persistence. Our explainable baseline then displays an AI-assisted class, a cautious evidence score, and the exact reasons. This helps a disaster-management team prioritise which alerts may need human review. The current release is an offline demonstration using synthetic data, and it makes unavailable data explicit instead of inventing it.”

## 7. Click-through demo script

1. Start at the map and say it is the spatial decision view.
2. Start with the alert centre. Explain that one card represents a grouped event, not a confirmed disaster.
3. Click the Potential Wildfire card. Point out the forest context, maximum FRP, and linked observations.
4. Click the volcanic thermal-anomaly card. Explain why we say “potential anomaly,” not “eruption.”
5. Click an orange point. Point out nearby facility distance and four persistence days.
6. Click an amber point. Say the system does not force a decision when evidence is weak.
7. Open `/docs` to show the API behind the dashboard.
8. End on the limitations section: real FIRMS, OSM, land-cover, and volcano-catalog adapters are the next work, not claims already made.

## 8. Safe changes your team can make

### Add a new demo hotspot

Add a CSV row with a unique ID, valid latitude/longitude, ISO date-time, non-negative brightness and FRP, a land-cover value, and `DEMO_FIRMS` as source. Refresh the browser after saving. Run the tests afterwards.

### Change the rule thresholds

At the top of `classifier.py`, change constants such as `INDUSTRIAL_PROXIMITY_KM`. Explain the reason during presentation and do not claim those thresholds are scientifically validated.

### Add real data later

Create a new module, for example `firms_client.py`, which fetches data, validates it, and converts it to the same fields used by `load_hotspots()`. Do not replace the demo data until the real adapter has error handling and visible source labels.

## 9. What we should build next

1. A real NASA FIRMS CSV/API ingestion adapter with an API key in `.env`.
2. An OSM/Overpass adapter with cached results and a demo fallback.
3. A real land-cover source, clearly marked when unavailable.
4. Optional PostgreSQL/PostGIS only after the CSV workflow is stable.
5. A small, evaluated Random Forest only after obtaining labelled examples. Report metrics only from a real train/test evaluation.

## 10. Common questions and direct answers

**Is this deep learning?** No. This first version uses visible rules because we lack labelled data and need explainability.

**Why not call every point a fire?** Satellite thermal detections can arise from industrial processes, agricultural burning, natural fires, and other heat sources.

**Why does a point become “uncertain”?** That is an honest output when available evidence does not support either main class.

**What does “AI-assisted” mean here?** The system helps a human review satellite evidence; it does not replace an emergency responder or confirm an incident.
