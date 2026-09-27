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

function pad2(n) { return String(n).padStart(2, "0"); }

/**
 * The real UTC instant for a clock reading (y, m, d, hh, mm) that is meant as SOLAR time at longitude lng — noon is
 * when the sun stands highest there, whatever time zone the computer running this page happens to be in (a roof in
 * Germany designed from a laptop in another zone, say). 15 degrees of longitude is one hour. With no location yet
 * there is nothing to convert against, so the reading is taken as the browser's own local time instead — the only
 * behaviour there ever was before a site was placed.
 */
function solarTimeToInstant(y, m, d, hh, mm, lng) {
  return lng == null ? new Date(y, m - 1, d, hh, mm) : new Date(Date.UTC(y, m - 1, d, hh, mm) - (lng / 15) * 3600000);
}

/** The reverse of solarTimeToInstant: a UTC instant's clock reading as solar time at longitude lng (or the browser's own local reading with no lng), as { y, m, d, hh, mm }. */
function instantToSolarTime(date, lng) {
  const t = lng == null ? date : new Date(date.getTime() + (lng / 15) * 3600000);
  return lng == null
    ? { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), hh: t.getHours(), mm: t.getMinutes() }
    : { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

/** "HH:MM" for a UTC instant, in solar time at longitude lng (or the browser's own local time with no lng) — the same convention siteDateTime reads the typed time in, so a sunrise/sunset label and the typed time always agree. */
function solarTimeLabel(date, lng) {
  if (!date || !Number.isFinite(date.getTime())) return "—";
  const t = instantToSolarTime(date, lng);
  return `${pad2(t.hh)}:${pad2(t.mm)}`;
}

/** Right now, read as the date/time fields would show it: today's date and the current time, in solar time at longitude lng (or the browser's own local reading with no lng yet). */
function solarNow(lng) {
  const t = instantToSolarTime(new Date(), lng);
  return { date: `${t.y}-${pad2(t.m)}-${pad2(t.d)}`, time: `${pad2(t.hh)}:${pad2(t.mm)}` };
}

function siteDateTime(siteState) {
  const [y, m, d] = (siteState.date || todayIsoDate()).split("-").map(Number);
  const [hh, mm] = (siteState.time || "12:00").split(":").map(Number);
  return solarTimeToInstant(y, m, d, hh, mm, siteState.lng);
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
