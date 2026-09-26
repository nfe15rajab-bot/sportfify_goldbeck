/**
 * siteController.js — Site & Sun panel controller
 * State, sun-compass readout, address search/geolocate for Combine's Site
 * tab. Split out of main.js — mirrors siteField.js's rendering boundary.
 */

const siteState = {
  lat: null, lng: null, address: "", northDeg: 0, date: null, time: "12:00",
  /** True once the designer has set the orientation (or a saved session had): 0° is a real answer, so "untouched" needs its own flag. */
  northSet: false,
  /** The address parts Nominatim gave for the location (state, Landkreis, Gemeinde...), what the wind zone is looked up from. */
  region: null,
  /** "auto" or "1".."4": the designer's choice. The DIBt list is a compilation; the states' own lists are binding. */
  windZoneChoice: "auto",
  windZoneAuto: null,
  /** Roof height above ground typed by hand; null = use what the Revit model gave. */
  roofHeightOverride: null,
};

/** The address fields a wind zone lookup (and a saved session) needs, out of a Nominatim reply. */
function pickRegion(addr) {
  if (!addr) return null;
  const keep = ["country_code", "ISO3166-2-lvl4", "state", "county", "city", "town", "municipality", "village", "hamlet"];
  const out = {};
  keep.forEach(k => { if (addr[k]) out[k] = addr[k]; });
  return out;
}

/** The wind zone the analysis will use, and where it came from. */
function effectiveWindZone() {
  if (siteState.windZoneChoice !== "auto") {
    return { zone: Number(siteState.windZoneChoice), confidence: "manual", basis: "set by hand in the Site conditions tab", note: "" };
  }
  const auto = siteState.windZoneAuto;
  return auto && auto.zone ? auto : { zone: null, confidence: "none", basis: "", note: auto ? auto.note : "" };
}

/** Roof height above ground: the designer's value, else the Revit model's. */
function effectiveRoofHeight() {
  if (siteState.roofHeightOverride != null && siteState.roofHeightOverride > 0) {
    return { height_m: siteState.roofHeightOverride, source: "set by hand in the Site tab" };
  }
  const roof = typeof combineState !== "undefined" ? combineState.roof : null;
  if (roof && roof.heightAboveGroundM > 0) {
    return { height_m: roof.heightAboveGroundM, source: roof.heightSource || "the Revit model" };
  }
  return { height_m: 0, source: "" };
}

let regionRequestId = 0;
let regionTimer = null;

/**
 * Looks up the state, Landkreis and Gemeinde of the site through Nominatim (the geocoder the Site tab already uses,
 * and only for a chosen location, never per keystroke), then the wind zone from them. Debounced: dragging the marker
 * or clicking around asks once, for where it stopped.
 */
function resolveSiteRegion() {
  clearTimeout(regionTimer);
  if (siteState.lat == null) return;
  const id = ++regionRequestId;
  regionTimer = setTimeout(async () => {
    const statusEl = document.getElementById("site-region-status");
    if (statusEl) statusEl.textContent = "Looking up the region…";
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=de&zoom=14&lat=${siteState.lat}&lon=${siteState.lng}`);
      const data = await res.json();
      if (id !== regionRequestId) return;   // the marker moved on: this answer is for somewhere else
      siteState.region = pickRegion(data.address);
      if (!siteState.address && data.display_name) siteState.address = data.display_name;
      siteState.windZoneAuto = typeof lookupWindZone === "function" ? lookupWindZone(siteState.region) : null;
    } catch (err) {
      if (id !== regionRequestId) return;
      siteState.region = null;
      siteState.windZoneAuto = { zone: null, confidence: "none", basis: "", note: "The region couldn't be looked up (no connection?). Set the wind zone by hand." };
    }
    updateSiteUI();
  }, 700);
}

function updateWindAndHeightUI() {
  const regionEl = document.getElementById("site-region-status");
  if (regionEl) {
    const r = siteState.region;
    regionEl.textContent = r
      ? [r.municipality || r.town || r.city || r.village || r.hamlet, r.county, r.state].filter(Boolean).join(", ")
      : (regionEl.textContent === "Looking up the region…" ? regionEl.textContent : "");
  }

  const windEl = document.getElementById("site-wind-status");
  if (windEl) {
    const w = effectiveWindZone();
    if (w.zone) {
      const mark = w.confidence === "conservative" ? " — the higher of the possible zones" : "";
      windEl.textContent = `Zone ${w.zone}${mark}. ${w.basis}${w.note ? " " + w.note : ""}`;
    } else {
      windEl.textContent = w.note || "Set a site location in Germany and the zone is looked up.";
    }
  }

  const heightEl = document.getElementById("site-height-status");
  if (heightEl) {
    const h = effectiveRoofHeight();
    heightEl.textContent = h.height_m > 0
      ? `Using ${h.height_m} m — ${h.source}.`
      : "Comes with a roof pushed from Revit; type a value to override it. Without one the analyses assume 12 m.";
  }
}

/** Refreshes the site-location readout + sun compass/summary from siteState — mirrors updateGardenUI/updateCombineUI's role for the new Site & Sun panel. */
function updateSiteUI() {
  if (typeof updateAssumptionsUI === "function") updateAssumptionsUI();   // the latitude and the orientation are also inputs of the sun analysis (assumptions panel)
  const coordsEl = document.getElementById("site-coords-status");
  if (coordsEl) {
    coordsEl.textContent = siteState.lat == null
      ? "No location set — click the map to place the site."
      : `${siteState.lat.toFixed(5)}, ${siteState.lng.toFixed(5)}${siteState.address ? " — " + siteState.address : ""}`;
  }
  const summaryEl = document.getElementById("sun-summary");
  if (summaryEl) {
    const sun = typeof getSunPosition === "function" ? getSunPosition(siteState) : null;
    if (!sun) {
      summaryEl.textContent = "Set a site location to see sun position and shading guidance.";
    } else {
      const times = typeof getSunTimes === "function" ? getSunTimes(siteState) : null;
      const fmt = t => t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
      summaryEl.textContent = sun.altitudeDeg > 0
        ? `Sun at ${Math.round(sun.azimuthDeg)}° azimuth, ${Math.round(sun.altitudeDeg)}° above horizon. Sunrise ${fmt(times?.sunrise)}, sunset ${fmt(times?.sunset)}.`
        : `Sun is below the horizon at this time. Sunrise ${fmt(times?.sunrise)}, sunset ${fmt(times?.sunset)}.`;
    }
  }
  if (typeof drawSunCompass === "function") drawSunCompass(siteState);
  updateWindAndHeightUI();
  if (typeof updateStructureUI === "function") updateStructureUI();
  if (typeof updateRoofFeaturesUI === "function") updateRoofFeaturesUI();
  if (typeof updateSiteTabsUI === "function") updateSiteTabsUI();      // the Structure and Site conditions tabs show the same site
}

document.getElementById("siteWindZone").addEventListener("change", e => {
  siteState.windZoneChoice = e.target.value;
  updateSiteUI();
});
document.getElementById("siteRoofHeight").addEventListener("input", e => {
  const v = parseFloat(e.target.value);
  siteState.roofHeightOverride = Number.isFinite(v) && v > 0 ? v : null;
  updateSiteUI();
});
document.getElementById("siteNorthDeg").addEventListener("input", e => {
  siteState.northSet = true;
  siteState.northDeg = Number(e.target.value) || 0;
  document.getElementById("site-north-val").textContent = `${siteState.northDeg}°`;
  updateSiteUI();
});
/** Sets the roof's orientation (degrees clockwise from the top of the plan to true north) as if the slider had been moved: the state, the slider, its label. The quiz sends it. */
function siteApplyNorth(deg) {
  const d = Math.round(((Number(deg) % 360) + 360) % 360);
  siteState.northSet = true;
  siteState.northDeg = d;
  const slider = document.getElementById("siteNorthDeg");
  if (slider) slider.value = String(d);
  const label = document.getElementById("site-north-val");
  if (label) label.textContent = `${d}°`;
  updateSiteUI();
}

document.getElementById("siteDate").addEventListener("input", e => { siteState.date = e.target.value; updateSiteUI(); });
document.getElementById("siteTime").addEventListener("input", e => { siteState.time = e.target.value; updateSiteUI(); });

function doSiteAddressSearch() {
  const q = document.getElementById("siteAddressSearch").value.trim();
  if (q && typeof searchAddress === "function") searchAddress(q);
}
document.getElementById("btn-site-search").addEventListener("click", doSiteAddressSearch);
document.getElementById("siteAddressSearch").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); doSiteAddressSearch(); }
});
document.getElementById("btn-site-geolocate").addEventListener("click", () => { if (typeof useMyLocation === "function") useMyLocation(); });
