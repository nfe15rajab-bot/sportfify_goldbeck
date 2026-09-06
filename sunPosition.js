/**
 * sunPosition.js — thin wrapper around the SunCalc CDN global, converting
 * its outputs into this app's conventions. No DOM code lives here —
 * siteField.js renders whatever this file computes, same split as
 * rules.js (logic) vs combineField.js (renderer).
 *
 * SunCalc's getPosition() (v2.x) already returns azimuth/altitude in
 * degrees, azimuth measured clockwise from true north (0=N, 90=E, 180=S,
 * 270=W) — standard compass bearing, so canvasSunAngleDeg below needs no
 * unit conversion, just a subtraction of the roof's own north offset.
 */

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function siteDateTime(siteState) {
  const [y, m, d] = (siteState.date || todayIsoDate()).split("-").map(Number);
  const [hh, mm] = (siteState.time || "12:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Returns { azimuthDeg, altitudeDeg } for siteState's date/time + location, or null if no location is set yet / SunCalc hasn't loaded. */
function getSunPosition(siteState) {
  if (siteState.lat == null || siteState.lng == null || typeof SunCalc === "undefined") return null;
  const pos = SunCalc.getPosition(siteDateTime(siteState), siteState.lat, siteState.lng);
  return { azimuthDeg: pos.azimuth, altitudeDeg: pos.altitude };
}

/** Sun's angle in degrees clockwise from "up" on the combine canvas, folding in the roof's own north-rotation offset. */
function canvasSunAngleDeg(siteState) {
  const sun = getSunPosition(siteState);
  return sun ? ((sun.azimuthDeg - siteState.northDeg) % 360 + 360) % 360 : null;
}

/** Sunrise/sunset/solar-noon etc. for siteState's date + location, or null if no location is set yet / SunCalc hasn't loaded. */
function getSunTimes(siteState) {
  if (siteState.lat == null || siteState.lng == null || typeof SunCalc === "undefined") return null;
  return SunCalc.getTimes(siteDateTime(siteState), siteState.lat, siteState.lng);
}
