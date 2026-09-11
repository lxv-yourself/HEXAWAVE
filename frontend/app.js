/*
 * FIRETRACE AI client
 *
 * This static client deliberately talks only to the FastAPI API mounted at the
 * same origin. It never contains API keys and it never upgrades demo data into
 * a live-data claim. A future frontend can keep these contracts when real
 * backend adapters replace the CSV sources.
 */

(() => {
  "use strict";

  const API_TIMEOUT_MS = 12000;
  const REFRESH_INTERVAL_MS = 120000;
  const CLASS_LABELS = {
    industrial_persistent: "Industrial / persistent",
    natural_wildfire: "Natural / wildfire",
    other_uncertain: "Other / uncertain",
  };

  const state = {
    alerts: [],
    facilities: [],
    health: null,
    hotspots: [],
    lastUpdated: null,
    map: null,
    mapLayers: null,
    mapTiles: "pending",
    metadata: null,
    selectedHotspotId: null,
    selectedLocation: null,
    isLoading: false,
    hasFittedMap: false,
  };

  const elements = {
    alertCount: document.getElementById("alert-count"),
    alertList: document.getElementById("alert-list"),
    analysisStatus: document.getElementById("analysis-status"),
    classFilter: document.getElementById("class-filter"),
    dataNote: document.getElementById("data-note"),
    details: document.getElementById("details"),
    errorBanner: document.getElementById("error-banner"),
    hotspotTable: document.getElementById("hotspot-table"),
    industrialCount: document.getElementById("industrial-count"),
    lastUpdated: document.getElementById("last-updated"),
    map: document.getElementById("map"),
    mapNote: document.getElementById("map-note"),
    modeLabel: document.getElementById("mode-label"),
    modeNotice: document.getElementById("mode-notice"),
    modeStatus: document.getElementById("mode-status"),
    naturalCount: document.getElementById("natural-count"),
    refreshButton: document.getElementById("refresh-button"),
    refreshTime: document.getElementById("refresh-time"),
    severityFilter: document.getElementById("severity-filter"),
    sourceStatuses: document.getElementById("source-statuses"),
    totalCount: document.getElementById("total-count"),
    uncertainCount: document.getElementById("uncertain-count"),
  };

  function escapeHtml(value) {
    return String(value ?? "Unavailable")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function formatShortTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(date);
  }

  function formatCoordinates(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "Unavailable";
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  function formatDistance(distance) {
    const numericDistance = Number(distance);
    return Number.isFinite(numericDistance) ? `${numericDistance.toFixed(2)} km` : "Unavailable";
  }

  function classLabel(classKey) {
    return CLASS_LABELS[classKey] || "Other / uncertain";
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  async function fetchJson(path) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(path, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
      return await response.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function mapErrorToMessage(endpoint) {
    const names = {
      alerts: "review alerts",
      facilities: "facility context",
      health: "backend health",
      hotspots: "hotspot observations",
      metadata: "data-source metadata",
    };
    return `Unable to refresh ${names[endpoint] || endpoint}. Existing information may be stale.`;
  }

  function showErrors(errors) {
    if (!errors.length) {
      elements.errorBanner.classList.add("is-hidden");
      elements.errorBanner.textContent = "";
      return;
    }
    elements.errorBanner.classList.remove("is-hidden");
    elements.errorBanner.innerHTML = `<strong>Data refresh incomplete.</strong> ${errors.map(escapeHtml).join(" ")} Use “Refresh data” to retry.`;
  }

  function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.refreshButton.disabled = isLoading;
    elements.refreshButton.textContent = isLoading ? "Refreshing…" : "Refresh data";
  }

  function initialiseMap() {
    if (!window.L) {
      elements.map.innerHTML = "<div class=\"map-fallback\"><div><strong>Interactive map unavailable.</strong><br>Leaflet could not be loaded. Backend data, filters, alerts, and details remain available below.</div></div>";
      state.mapTiles = "unavailable";
      setText(elements.mapNote, "Map controls are unavailable because Leaflet did not load. API-driven observations remain usable in the table.");
      return;
    }

    const map = window.L.map("map", {
      zoomControl: true,
      preferCanvas: true,
    }).setView([22.8, 78.9], 5);
    state.map = map;
    state.mapLayers = {
      alert: window.L.layerGroup().addTo(map),
      facility: window.L.layerGroup().addTo(map),
      industrial: window.L.layerGroup().addTo(map),
      natural: window.L.layerGroup().addTo(map),
      selection: window.L.layerGroup().addTo(map),
      uncertain: window.L.layerGroup().addTo(map),
    };

    const tiles = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    tiles.on("tileload", () => {
      if (state.mapTiles !== "ok") {
        state.mapTiles = "ok";
        setText(elements.mapNote, "OpenStreetMap base tiles are available. Observation and alert layers come from the current backend response.");
        renderSourceStatuses();
      }
    });
    tiles.on("tileerror", () => {
      state.mapTiles = "unavailable";
      setText(elements.mapNote, "Map tiles are unavailable. API-driven markers and details remain available on the map background.");
      renderSourceStatuses();
    });

    window.L.control.layers(null, {
      "Potential-event review alerts": state.mapLayers.alert,
      "Industrial / persistent hotspots": state.mapLayers.industrial,
      "Natural / wildfire hotspots": state.mapLayers.natural,
      "Other / uncertain hotspots": state.mapLayers.uncertain,
      "Demo facility context": state.mapLayers.facility,
    }, { collapsed: true }).addTo(map);

    map.on("click", (event) => selectMapLocation(event.latlng.lat, event.latlng.lng));
  }

  function makeMarkerIcon(classKey, symbol = "•") {
    return window.L.divIcon({
      className: "",
      html: `<div class="map-marker ${escapeHtml(classKey)}">${escapeHtml(symbol)}</div>`,
      iconAnchor: [11, 11],
      iconSize: [22, 22],
      popupAnchor: [0, -12],
    });
  }

  function makeAlertIcon() {
    return window.L.divIcon({
      className: "",
      html: '<div class="alert-marker">!</div>',
      iconAnchor: [16, 16],
      iconSize: [32, 32],
      popupAnchor: [0, -18],
    });
  }

  function filteredHotspots() {
    const classKey = elements.classFilter.value;
    return classKey === "all"
      ? state.hotspots
      : state.hotspots.filter((hotspot) => hotspot.classification?.class_key === classKey);
  }

  function filteredAlerts() {
    const severity = elements.severityFilter.value;
    return severity === "all"
      ? state.alerts
      : state.alerts.filter((alert) => alert.severity === severity);
  }

  function popupForHotspot(hotspot) {
    const classification = hotspot.classification || {};
    return `<strong>${escapeHtml(hotspot.hotspot_id)}</strong><br>${escapeHtml(classification.label)}<br><small>${escapeHtml(formatDateTime(hotspot.acq_datetime))}</small>`;
  }

  function renderMap() {
    if (!state.map || !state.mapLayers) return;
    Object.values(state.mapLayers).forEach((layer) => layer.clearLayers());

    const visibleHotspots = filteredHotspots();
    visibleHotspots.forEach((hotspot) => {
      const classKey = hotspot.classification?.class_key || "other_uncertain";
      const targetLayer = state.mapLayers[classKey === "industrial_persistent" ? "industrial" : classKey === "natural_wildfire" ? "natural" : "uncertain"];
      const marker = window.L.marker([hotspot.latitude, hotspot.longitude], {
        icon: makeMarkerIcon(classKey),
        title: `${hotspot.hotspot_id}: ${classLabel(classKey)}`,
      });
      marker.bindPopup(popupForHotspot(hotspot));
      marker.on("click", () => showHotspotDetails(hotspot, true));
      targetLayer.addLayer(marker);
    });

    state.facilities.forEach((facility) => {
      const marker = window.L.marker([facility.latitude, facility.longitude], {
        icon: makeMarkerIcon("facility", "■"),
        title: facility.name,
      });
      marker.bindPopup(`<strong>${escapeHtml(facility.name)}</strong><br>${escapeHtml(facility.facility_type)} context<br><small>Source: ${escapeHtml(facility.source)}</small>`);
      state.mapLayers.facility.addLayer(marker);
    });

    filteredAlerts().forEach((alert) => {
      const marker = window.L.marker([alert.latitude, alert.longitude], {
        icon: makeAlertIcon(),
        title: `${alert.event_type}: ${alert.severity}`,
      });
      marker.bindPopup(`<strong>${escapeHtml(alert.event_type)}</strong><br>${escapeHtml(alert.severity).toUpperCase()} priority · review required`);
      marker.on("click", () => showAlertDetails(alert));
      state.mapLayers.alert.addLayer(marker);
    });

    if (!state.hasFittedMap && state.hotspots.length) {
      const bounds = window.L.latLngBounds(state.hotspots.map((hotspot) => [hotspot.latitude, hotspot.longitude]));
      state.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 6 });
      state.hasFittedMap = true;
    }
  }

  function renderMetrics() {
    const counts = state.hotspots.reduce((accumulator, hotspot) => {
      const key = hotspot.classification?.class_key || "other_uncertain";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    setText(elements.totalCount, String(state.hotspots.length));
    setText(elements.industrialCount, String(counts.industrial_persistent || 0));
    setText(elements.naturalCount, String(counts.natural_wildfire || 0));
    setText(elements.uncertainCount, String(counts.other_uncertain || 0));
    setText(elements.refreshTime, state.lastUpdated ? formatShortTime(state.lastUpdated) : "—");
    setText(elements.lastUpdated, state.lastUpdated ? `Updated ${formatShortTime(state.lastUpdated)}` : "Not refreshed");
  }

  function renderAlerts() {
    const alerts = filteredAlerts();
    setText(elements.alertCount, `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}`);
    if (!alerts.length) {
      elements.alertList.innerHTML = `<p class="alert-empty">No ${elements.severityFilter.value === "all" ? "review alerts" : `${escapeHtml(elements.severityFilter.value)}-priority alerts`} are available in the current response.</p>`;
      return;
    }
    elements.alertList.innerHTML = alerts.map((alert) => `
      <article class="alert-card ${escapeHtml(alert.severity)}">
        <div class="alert-topline">
          <strong class="event-type">${escapeHtml(alert.event_type)}</strong>
          <span class="severity ${escapeHtml(alert.severity)}">${escapeHtml(alert.severity)}</span>
        </div>
        <p class="alert-status">${escapeHtml(String(alert.status || "HUMAN_REVIEW_REQUIRED").replaceAll("_", " "))}</p>
        <ul class="alert-evidence">${(alert.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
        <p class="alert-disclaimer"><strong>Detected:</strong> ${escapeHtml(formatDateTime(alert.detected_at))}<br>${escapeHtml(alert.disclaimer || "Human verification is required.")}</p>
        <button class="alert-button" type="button" data-alert-id="${escapeHtml(alert.alert_id)}">Inspect on map</button>
      </article>
    `).join("");
    elements.alertList.querySelectorAll("[data-alert-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const alert = state.alerts.find((item) => item.alert_id === button.dataset.alertId);
        if (alert) focusAlert(alert);
      });
    });
  }

  function renderTable() {
    const hotspots = filteredHotspots();
    if (!hotspots.length) {
      elements.hotspotTable.innerHTML = '<tr><td colspan="6">No observations match this filter.</td></tr>';
      return;
    }
    elements.hotspotTable.innerHTML = hotspots.map((hotspot) => {
      const classification = hotspot.classification || {};
      const features = hotspot.contextual_features || {};
      return `<tr>
        <td><strong>${escapeHtml(hotspot.hotspot_id)}</strong><br><small>${escapeHtml(formatShortTime(hotspot.acq_datetime))}</small></td>
        <td><span class="small-tag ${escapeHtml(classification.class_key || "other_uncertain")}">${escapeHtml(classLabel(classification.class_key))}</span></td>
        <td>${Number.isFinite(Number(classification.confidence)) ? `${Math.round(Number(classification.confidence) * 100)}%` : "Unavailable"}</td>
        <td>${escapeHtml(features.persistence_detection_days ?? "Unavailable")} day(s)</td>
        <td>${escapeHtml(formatDistance(features.nearest_facility_distance_km))}</td>
        <td><button class="row-button" type="button" data-hotspot-id="${escapeHtml(hotspot.hotspot_id)}">Details</button></td>
      </tr>`;
    }).join("");
    elements.hotspotTable.querySelectorAll("[data-hotspot-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const hotspot = state.hotspots.find((item) => item.hotspot_id === button.dataset.hotspotId);
        if (hotspot) focusHotspot(hotspot);
      });
    });
  }

  function renderMode() {
    const modeIsKnown = typeof state.metadata?.demo_mode === "boolean";
    const isDemo = state.metadata?.demo_mode === true;
    const isHealthy = state.health?.status === "ok";
    elements.modeStatus.classList.toggle("error", !isHealthy);
    elements.modeStatus.classList.toggle("warning", isHealthy && !modeIsKnown);
    setText(elements.modeLabel, !isHealthy ? "Backend unavailable" : !modeIsKnown ? "Data mode unverified" : isDemo ? "Offline demo dataset" : "Live backend data");
    elements.modeNotice.innerHTML = isDemo
      ? "<strong>AI-assisted decision support only.</strong> These synthetic points are not live fire alerts or confirmed incidents."
      : "<strong>AI-assisted decision support only.</strong> Verify returned observations with authoritative sources before taking action. The data mode is never inferred from stale content.";
  }

  function sourceStatus(name, tone, detail) {
    return `<div class="source-status"><span class="source-name">${escapeHtml(name)}</span><span class="source-state ${escapeHtml(tone)}">${escapeHtml(detail)}</span></div>`;
  }

  function renderSourceStatuses() {
    const sources = state.metadata?.data_sources || {};
    const metadataIsAvailable = Boolean(state.metadata);
    const isDemo = state.metadata?.demo_mode === true;
    const backendTone = state.health?.status === "ok" ? "ok" : "error";
    const backendDetail = state.health?.status === "ok" ? "Online" : "Unavailable";
    const sourceTone = !metadataIsAvailable ? "error" : isDemo ? "warn" : sources.thermal_hotspots ? "ok" : "error";
    const sourceDetail = !metadataIsAvailable ? "Status unavailable" : isDemo ? "Demo fallback" : sources.thermal_hotspots ? "Reported by API" : "Unavailable";
    const tiles = state.mapTiles === "ok" ? ["ok", "Tiles active"] : state.mapTiles === "pending" ? ["warn", "Checking tiles"] : ["error", "Unavailable"];
    elements.sourceStatuses.innerHTML = [
      sourceStatus("Backend API", backendTone, backendDetail),
      sourceStatus("Thermal hotspots", sourceTone, sourceDetail),
      sourceStatus("Facility context", !metadataIsAvailable ? "error" : isDemo ? "warn" : sources.industrial_facilities ? "ok" : "error", !metadataIsAvailable ? "Status unavailable" : isDemo ? "Demo fallback" : sources.industrial_facilities ? "Reported by API" : "Unavailable"),
      sourceStatus("OSM base map", tiles[0], tiles[1]),
      sourceStatus("Sentinel-2", "warn", "Not integrated"),
      sourceStatus("Earth Engine", "warn", "Not integrated"),
      sourceStatus("Database / PostGIS", "warn", "Not configured"),
    ].join("");
  }

  function renderAnalysisStatus() {
    const hasData = state.hotspots.length > 0;
    elements.analysisStatus.innerHTML = hasData
      ? `<p><strong>Explainable rule-based evidence is available.</strong> The backend returns classification reasons, persistence, nearby-facility distance, and an evidence score for each observation.</p><p><strong>Risk prediction is unavailable.</strong> The current API does not expose a validated ML risk model; evidence scores are not shown as probabilities or confirmed incident risk.</p>`
      : "<p><strong>Analysis unavailable.</strong> Refresh the backend data to load current classification context.</p>";
  }

  function renderDataNote() {
    const metadata = state.metadata;
    if (!metadata) {
      elements.dataNote.innerHTML = "<p><strong>Data-source metadata is unavailable.</strong> The dashboard will retain only information returned by currently available endpoints.</p>";
      return;
    }
    const sources = Object.entries(metadata.data_sources || {})
      .map(([name, detail]) => `<li><strong>${escapeHtml(name.replaceAll("_", " "))}:</strong> ${escapeHtml(detail)}</li>`)
      .join("");
    const limitations = (metadata.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    elements.dataNote.innerHTML = `<p><strong>${escapeHtml(metadata.project || "Data notes")}</strong> · ${metadata.demo_mode ? "DEMO SIMULATION — data is not live." : "Backend-reported data mode."}</p><ul>${sources}</ul><p><strong>Limitations</strong></p><ul>${limitations}</ul>`;
  }

  function renderAll() {
    renderMode();
    renderMetrics();
    renderSourceStatuses();
    renderAnalysisStatus();
    renderAlerts();
    renderTable();
    renderMap();
    renderDataNote();
  }

  function detailRows(rows) {
    return `<ul class="feature-list">${rows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join("")}</ul>`;
  }

  function showHotspotDetails(hotspot, keepMapPosition = false) {
    state.selectedHotspotId = hotspot.hotspot_id;
    state.selectedLocation = null;
    const classification = hotspot.classification || {};
    const features = hotspot.contextual_features || {};
    const confidence = Number(classification.confidence);
    elements.details.className = "details-content";
    elements.details.innerHTML = `
      <span class="tag ${escapeHtml(classification.class_key || "other_uncertain")}">${escapeHtml(classification.label || classLabel(classification.class_key))}</span>
      <h3>${escapeHtml(hotspot.hotspot_id)}</h3>
      <p class="subtitle">${escapeHtml(formatCoordinates(hotspot.latitude, hotspot.longitude))} · ${escapeHtml(formatDateTime(hotspot.acq_datetime))}</p>
      <div class="score"><strong>${Number.isFinite(confidence) ? `${Math.round(confidence * 100)}% evidence score` : "Evidence score unavailable"}</strong><p>${escapeHtml(classification.confidence_note || "No confidence note was returned.")}</p></div>
      ${detailRows([
        ["Source", hotspot.source || "Unavailable"],
        ["Brightness", Number.isFinite(Number(hotspot.brightness)) ? `${Number(hotspot.brightness).toFixed(1)} K` : "Unavailable"],
        ["Fire Radiative Power", Number.isFinite(Number(hotspot.frp)) ? `${Number(hotspot.frp).toFixed(1)}` : "Unavailable"],
        ["Land-cover context", features.land_cover_context || "Unavailable"],
        ["Nearest facility", features.nearest_facility_name || "Unavailable"],
        ["Facility distance", formatDistance(features.nearest_facility_distance_km)],
        ["Nearby observations", features.nearby_observation_count ?? "Unavailable"],
        ["Detection days", features.persistence_detection_days ?? "Unavailable"],
      ])}
      <p class="section-label">RETURNED EVIDENCE</p>
      <ul class="reason-list">${(classification.reasons || ["No supporting reasons were returned."]).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`;
    if (state.map && !keepMapPosition) state.map.setView([hotspot.latitude, hotspot.longitude], Math.max(state.map.getZoom(), 9));
  }

  function showAlertDetails(alert) {
    state.selectedHotspotId = null;
    state.selectedLocation = null;
    elements.details.className = "details-content";
    elements.details.innerHTML = `
      <span class="tag ${escapeHtml(alert.severity === "high" ? "industrial_persistent" : "other_uncertain")}">${escapeHtml(String(alert.severity || "review").toUpperCase())} PRIORITY</span>
      <h3>${escapeHtml(alert.event_type)}</h3>
      <p class="subtitle">${escapeHtml(formatCoordinates(alert.latitude, alert.longitude))} · ${escapeHtml(formatDateTime(alert.detected_at))}</p>
      ${detailRows([
        ["Status", String(alert.status || "HUMAN_REVIEW_REQUIRED").replaceAll("_", " ")],
        ["Linked observations", (alert.linked_hotspot_ids || []).join(", ") || "Unavailable"],
        ["Source", state.metadata?.demo_mode === true ? "Demo simulation" : state.metadata ? "Backend alert response" : "Data-source status unavailable"],
        ["Confidence", "Not provided by backend"],
      ])}
      <p class="section-label">REVIEW INDICATORS</p>
      <ul class="reason-list">${(alert.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <p class="alert-disclaimer">${escapeHtml(alert.disclaimer || "This alert requires human review.")}</p>`;
  }

  function haversineKm(latA, lonA, latB, lonB) {
    const earthRadiusKm = 6371;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(latB - latA);
    const deltaLon = toRadians(lonB - lonA);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(deltaLon / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
  }

  function selectMapLocation(latitude, longitude) {
    if (!state.map || !state.mapLayers) return;
    state.selectedHotspotId = null;
    state.selectedLocation = { latitude, longitude };
    state.mapLayers.selection.clearLayers();
    window.L.circleMarker([latitude, longitude], {
      color: "#10212b",
      fillColor: "#ffffff",
      fillOpacity: 1,
      radius: 7,
      weight: 2,
    }).addTo(state.mapLayers.selection);
    const nearest = state.hotspots.reduce((best, hotspot) => {
      const distance = haversineKm(latitude, longitude, hotspot.latitude, hotspot.longitude);
      return !best || distance < best.distance ? { hotspot, distance } : best;
    }, null);
    elements.details.className = "details-content";
    elements.details.innerHTML = `
      <span class="tag other_uncertain">SELECTED LOCATION</span>
      <h3>${escapeHtml(formatCoordinates(latitude, longitude))}</h3>
      <p class="subtitle">This is a user-selected map coordinate, not a backend-generated risk zone.</p>
      ${detailRows([
        ["Risk model", "Not exposed by backend"],
        ["Nearest API observation", nearest ? nearest.hotspot.hotspot_id : "No observations loaded"],
        ["Distance to nearest observation", nearest ? formatDistance(nearest.distance) : "Unavailable"],
        ["Selected at", formatDateTime(new Date())],
      ])}
      <p class="alert-disclaimer">Use the observation and alert layers for returned evidence. This coordinate has no inferred incident status.</p>`;
  }

  function focusHotspot(hotspot) {
    showHotspotDetails(hotspot);
    if (state.map) {
      state.map.setView([hotspot.latitude, hotspot.longitude], Math.max(state.map.getZoom(), 9));
      document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function focusAlert(alert) {
    showAlertDetails(alert);
    if (state.map) {
      state.map.setView([alert.latitude, alert.longitude], Math.max(state.map.getZoom(), 8));
      document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function refreshData({ silent = false } = {}) {
    if (state.isLoading) return;
    setLoading(true);
    const endpoints = {
      health: "/api/health",
      metadata: "/api/metadata",
      hotspots: "/api/hotspots",
      facilities: "/api/facilities",
      alerts: "/api/alerts",
    };
    const results = await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
      try {
        return [key, { ok: true, value: await fetchJson(path) }];
      } catch (error) {
        return [key, { ok: false, error }];
      }
    }));

    const errors = [];
    for (const [key, result] of results) {
      if (!result.ok) {
        if (key === "health") state.health = null;
        if (key === "metadata") state.metadata = null;
        errors.push(mapErrorToMessage(key));
        continue;
      }
      if (key === "hotspots") state.hotspots = Array.isArray(result.value.hotspots) ? result.value.hotspots : [];
      else if (key === "facilities") state.facilities = Array.isArray(result.value.facilities) ? result.value.facilities : [];
      else if (key === "alerts") state.alerts = Array.isArray(result.value.alerts) ? result.value.alerts : [];
      else state[key] = result.value;
    }
    if (results.some(([, result]) => result.ok)) state.lastUpdated = new Date();
    if (!silent || errors.length) showErrors(errors);
    renderAll();
    setLoading(false);
  }

  function bindControls() {
    elements.classFilter.addEventListener("change", () => {
      renderTable();
      renderMap();
    });
    elements.severityFilter.addEventListener("change", () => {
      renderAlerts();
      renderMap();
    });
    elements.refreshButton.addEventListener("click", () => refreshData());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.lastUpdated && Date.now() - state.lastUpdated.getTime() > REFRESH_INTERVAL_MS) refreshData({ silent: true });
    });
  }

  initialiseMap();
  bindControls();
  renderSourceStatuses();
  refreshData();
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshData({ silent: true });
  }, REFRESH_INTERVAL_MS);
})();
