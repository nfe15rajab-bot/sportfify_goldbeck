/**
 * siteField.js — Leaflet site-location map + sun-compass widget rendering.
 * Owns the Leaflet map instance and the small SVG sun compass; main.js
 * orchestrates via updateSiteUI, same split as updateCombineUI/drawCombineCanvas.
 */

let siteMap = null, siteMarker = null;

/**
 * Idempotent — safe to call on every combine-mode entry. Lazy: only runs
 * once #combineConfigurator (and #site-map inside it) is already
 * display:block, since setMode() flips that display before calling
 * updateCombineUI() — so #site-map always has real dimensions by the time
 * L.map() constructs, sidestepping Leaflet's classic zero-size-container
 * bug by construction. invalidateSize() below is just cheap insurance.
 */
function initSiteMap() {
  if (siteMap) return;
  const el = document.getElementById("site-map");
  if (!el || typeof L === "undefined") return;

  siteMap = L.map(el).setView([48.8566, 2.3522], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(siteMap);
  siteMap.on("click", e => setSiteLocation(e.latlng.lat, e.latlng.lng));
  requestAnimationFrame(() => siteMap.invalidateSize());
}

function setSiteLocation(lat, lng) {
  siteState.lat = lat;
  siteState.lng = lng;
  if (!siteMarker) {
    siteMarker = L.marker([lat, lng], { draggable: true }).addTo(siteMap);
    siteMarker.on("dragend", () => {
      const p = siteMarker.getLatLng();
      siteState.lat = p.lat; siteState.lng = p.lng;
      if (typeof updateSiteUI === "function") updateSiteUI();
    });
  } else {
    siteMarker.setLatLng([lat, lng]);
  }
  if (typeof updateSiteUI === "function") updateSiteUI();
}

/**
 * Nominatim (OSM's own geocoder) — triggered only by an explicit button
 * click or Enter keypress, never per-keystroke, per its usage policy.
 * Clicking the map always works as a fallback if a search comes up empty.
 */
async function searchAddress(query) {
  const statusEl = document.getElementById("site-coords-status");
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const results = await res.json();
    if (!results.length) {
      if (statusEl) statusEl.textContent = "Address not found — try clicking the map instead.";
      return;
    }
    const { lat, lon, display_name } = results[0];
    siteState.address = display_name;
    setSiteLocation(Number(lat), Number(lon));
    siteMap.setView([lat, lon], 13);
  } catch (err) {
    if (statusEl) statusEl.textContent = "Address search failed — try clicking the map instead.";
  }
}

/**
 * Browser Geolocation → reverse-geocoded through Nominatim for a readable
 * address label. Requires a secure context (https, or localhost during
 * dev) and a permission grant; both failure paths fall back to the same
 * "click the map instead" guidance searchAddress already uses.
 */
function useMyLocation() {
  const statusEl = document.getElementById("site-coords-status");
  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = "Geolocation isn't available in this browser — try searching or clicking the map instead.";
    return;
  }
  if (statusEl) statusEl.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      setSiteLocation(latitude, longitude);
      siteMap.setView([latitude, longitude], 13);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        if (data.display_name) {
          siteState.address = data.display_name;
          if (typeof updateSiteUI === "function") updateSiteUI();
        }
      } catch (err) { /* coordinates are already set — a missing label isn't worth surfacing an error for */ }
    },
    () => { if (statusEl) statusEl.textContent = "Couldn't get your location — try searching or clicking the map instead."; },
    { timeout: 10000 }
  );
}

/** Small compass SVG: a dashed line to north, plus a sun marker at the current azimuth/altitude (dimmed once the sun is below the horizon). */
function drawSunCompass(siteState) {
  const el = document.getElementById("sun-compass");
  if (!el) return;

  const W = 120, H = 120, cx = 60, cy = 60, r = 46;
  const northRad = (-siteState.northDeg) * Math.PI / 180;
  const nx = cx + Math.sin(northRad) * r, ny = cy - Math.cos(northRad) * r;

  const sun = typeof getSunPosition === "function" ? getSunPosition(siteState) : null;
  const angle = typeof canvasSunAngleDeg === "function" ? canvasSunAngleDeg(siteState) : null;

  let sunEl = "";
  if (angle !== null) {
    const rad = angle * Math.PI / 180;
    const t = clamp(1 - sun.altitudeDeg / 90, 0.15, 1);
    const ax = cx + Math.sin(rad) * r * t, ay = cy - Math.cos(rad) * r * t;
    const color = sun.altitudeDeg > 0 ? "var(--suggestion-color)" : "var(--text-muted)";
    sunEl = `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${ax}" cy="${ay}" r="5" fill="${color}"/>`;
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-strong)" stroke-width="1"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--text-secondary)" stroke-width="1.5" stroke-dasharray="2,2"/>
    <text x="${nx}" y="${ny}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text-secondary)">N</text>
    ${sunEl}</svg>`;
}
