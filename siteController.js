/**
 * siteController.js — Site & Sun panel controller
 * State, sun-compass readout, address search/geolocate for Combine's Site
 * tab. Split out of main.js — mirrors siteField.js's rendering boundary.
 */

const siteState = { lat: null, lng: null, address: "", northDeg: 0, date: null, time: "12:00" };

/** Refreshes the site-location readout + sun compass/summary from siteState — mirrors updateGardenUI/updateCombineUI's role for the new Site & Sun panel. */
function updateSiteUI() {
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
}

document.getElementById("siteNorthDeg").addEventListener("input", e => {
  siteState.northDeg = Number(e.target.value) || 0;
  document.getElementById("site-north-val").textContent = `${siteState.northDeg}°`;
  updateSiteUI();
});
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
