# FIRETRACE AI — Build Log

## Phase 1, Step 1: Offline end-to-end demo

**Status:** Complete and tested.

## Actions taken

| Action | What changed | Why we did it |
| --- | --- | --- |
| Created a clean project structure | `backend`, `frontend`, `docs`, and tests | Each part has one clear job, making it easier to debug and explain. |
| Added synthetic CSV data | 9 hotspots and 3 industrial facilities | The app works without keys, internet APIs, or unsupported real-world claims. |
| Added validation | Checks required columns, coordinates, dates, and numeric values | External satellite/map data can be incomplete or malformed. |
| Added spatial analysis | Haversine distance to the closest facility | Demonstrates how location changes the meaning of a hotspot. |
| Added temporal analysis | Nearby detections and distinct detection days in 30 days | Demonstrates persistent thermal behaviour instead of relying on one observation. |
| Added explainable classification | Three visible rule outcomes with reasons | We have no labelled training set, so transparent rules are the honest baseline. |
| Added API | `/api/hotspots`, `/api/facilities`, `/api/metadata`, and `/api/health` | Separates data processing from the dashboard and supports future React/mobile clients. |
| Added dashboard | Map, markers, details panel, class filter, summary cards | Lets a judge quickly answer: what, where, likely class, and why. |
| Added tests | Four unit tests for the baseline logic | Prevents simple errors when team members change data or thresholds. |
| Added documentation | `README.md` and `HACKATHON_GUIDE.md` | Gives the team an explanation and exact commands for demo day. |

## Intentional choices

- **CSV before PostGIS:** keeps the first MVP runnable for beginners. PostGIS is a later upgrade, not a blocker.
- **Rules before ML:** we cannot truthfully train or report accuracy without labelled ground truth.
- **Leaflet instead of Mapbox:** avoids API-key setup in the first dashboard.
- **Synthetic data clearly labelled:** prevents the demo from making unsupported real-fire claims.
- **No database yet:** nine CSV rows do not need database complexity; the API isolates the storage choice for a later phase.

## Verification completed

- Unit tests: 4 passed.
- API endpoint: returned 9 enriched hotspot records.
- Dashboard route: returned HTTP 200.

## The next smallest useful task

Build a NASA FIRMS CSV ingestion adapter that accepts a downloaded FIRMS file, validates it with the existing loader rules, and visibly changes the source label from demo to NASA FIRMS. Keep the demo CSV as a fallback.

## Phase 1, Step 2: Potential-event alert centre

**Status:** Complete and tested.

| Action | What changed | Why we did it |
| --- | --- | --- |
| Added wildfire event grouping | Nearby natural-fire detections are combined into one potential wildfire event | A response team needs events, not a noisy alert per satellite point. |
| Added volcanic thermal-anomaly monitoring | Two persistent high-heat demo observations near a synthetic volcano reference create one review alert | Demonstrates how a trusted volcano catalogue could enrich thermal detections. |
| Added `/api/alerts` | Returns severity, reasons, linked hotspots, status, and disclaimer | Keeps alert rules separate from the map UI and easy to test. |
| Added alert centre UI | Cards show high/medium severity and can zoom the map to an event | Gives judges a rapid, alert-oriented decision view. |
| Added safety tests | Checks both alert types and requires a non-confirmation disclaimer | Prevents the demo from making an unsupported disaster claim. |

**Important wording:** say **“potential wildfire”** and **“potential volcanic thermal anomaly.”** Never say the system has confirmed a wildfire or volcanic eruption.
