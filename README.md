<<<<<<< HEAD
# Thermal-X

An offline-first Smart India Hackathon MVP for explaining whether satellite thermal hotspots are more consistent with a persistent industrial source, a natural fire, or an uncertain event.

> **Demo status:** The included hotspots, facilities, and land-cover context are synthetic demonstration data. They must not be presented as live fire alerts or NASA FIRMS results.

## What this first version demonstrates

1. Loads and validates hotspot and facility CSV data.
2. Measures each hotspot's nearest industrial facility.
3. Counts recurring observations near the same location over the last 30 days.
4. Uses transparent rules to produce a class, confidence, and reasons.
5. Shows results in a clickable map and details panel.
6. Groups high-priority evidence into potential wildfire and volcanic thermal-anomaly review alerts.

## Quick start

1. Install Python 3.11 or later from [python.org](https://www.python.org/downloads/). During setup, select **Add Python to PATH**.
2. Open PowerShell in the `backend` folder.
3. Run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

4. Open `http://127.0.0.1:8000` in a browser.
5. API documentation is at `http://127.0.0.1:8000/docs`.

After this one-time setup, double-click `backend/run_demo.bat` for the fastest demo-day launch.

## Test the classification logic

From the `backend` folder, with the virtual environment active:

```powershell
python -m unittest discover -s tests -v
```

## Honest limitations

- This is a decision-support prototype, not an emergency-alerting system.
- The rule thresholds are demonstration settings, not scientifically validated thresholds.
- The first release contains no live NASA FIRMS, OSM, Sentinel, or land-cover download.
- Real sources can replace the CSV adapters later, but unavailable data must remain visibly labelled as unavailable.
- Confidence is a rule-based evidence score, not a measured probability or an accuracy claim.

## Why this baseline matters

Raw thermal points do not explain *what* caused the heat. Thermal-X combines location, nearby facility context, and repeated observations to make a cautious, explainable classification. A judge-friendly summary is: **"We enrich a hotspot with spatial and temporal context, then show the evidence behind a probabilistic decision."**
=======
# HEXAWAVE
>>>>>>> 3fdfef82e36d2c0cd82ab3e2172e79061c9f4d33
