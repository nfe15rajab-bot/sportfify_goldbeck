/**
 * siteWeather.js — a compact annual weather overview for the Site conditions tab: monthly mean temperature and
 * total precipitation for the site's location, from Open-Meteo's archive API (no key, CORS-open for any origin —
 * the one other external service besides Nominatim this app calls, and like Nominatim only once a location settles,
 * never per keystroke or per pixel dragged). Roof and sport planning both care about it: a wet month changes what
 * the rain analysis assumes, a hot or cold one changes how much shade or shelter actually gets used.
 *
 * No DOM code lives here except the chart's own SVG string (a plain markup builder, not an element) — siteController.js
 * assigns it with innerHTML, same split as sunPosition.js (logic) / siteField.js (renders it) and analysisController.js's
 * buildSunPathSvg. Revit-free: nothing here needs the add-in.
 */

const SITE_WEATHER_CACHE = new Map();   // "lat,lng" (rounded to 0.01 deg, about 1 km) -> the fetched summary, so re-rendering (or a small marker nudge) doesn't refetch the same place

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** The most recently fully completed calendar year — a year still in progress has no data for its later months yet. */
function annualWeatherYear() {
  return new Date().getFullYear() - 1;
}

/**
 * Monthly mean temperature (deg C) and total precipitation (mm) for lat/lng's most recently completed calendar
 * year, from Open-Meteo's archive API (ERA5 reanalysis, about 9 km resolution — a regional picture, not a reading
 * for the exact roof). Throws on a network problem or a reply with nothing usable in it; the caller decides what
 * to show meanwhile / instead (the same shape resolveSiteRegion already uses for the wind zone lookup).
 */
async function fetchAnnualWeather(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (SITE_WEATHER_CACHE.has(key)) return SITE_WEATHER_CACHE.get(key);
  const year = annualWeatherYear();
  // Inlined into fetch() itself (not built into a variable first) so tools/csp-test.js's scan for "every host a
  // script fetches from" — a real check, not decoration — actually finds this one, the same as the Nominatim calls.
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${year}-01-01&end_date=${year}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`);
  if (!res.ok) throw new Error("The weather service answered " + res.status + ".");
  const data = await res.json();
  const days = data && data.daily && Array.isArray(data.daily.time) ? data.daily.time.length : 0;
  if (days === 0) throw new Error("The weather service had nothing for this place.");

  const months = Array.from({ length: 12 }, () => ({ tempSum: 0, tempCount: 0, precipSum: 0 }));
  for (let i = 0; i < days; i++) {
    const mi = Number(data.daily.time[i].slice(5, 7)) - 1;
    const t = data.daily.temperature_2m_mean[i], p = data.daily.precipitation_sum[i];
    if (Number.isFinite(t)) { months[mi].tempSum += t; months[mi].tempCount++; }
    if (Number.isFinite(p)) months[mi].precipSum += p;
  }
  const summary = {
    year,
    months: months.map((m, i) => ({
      label: MONTH_LABELS[i],
      tempMeanC: m.tempCount ? Math.round((m.tempSum / m.tempCount) * 10) / 10 : null,
      precipMm: Math.round(m.precipSum),
    })),
  };
  SITE_WEATHER_CACHE.set(key, summary);
  return summary;
}

/**
 * A small SVG: one bar per month for precipitation (left axis, mm) and a line for mean temperature (right axis,
 * deg C) — the two things a roof's rain design and a sport's outdoor-use calendar most want a shape for. Fixed
 * colors on purpose, same reasoning as buildSunPathSvg: this is meant to end up in a printed report page too.
 */
function buildAnnualWeatherSvg(summary) {
  if (!summary || !Array.isArray(summary.months) || summary.months.length !== 12) return null;
  const W = 280, H = 150, PAD_L = 28, PAD_R = 28, PAD_T = 10, PAD_B = 20;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const months = summary.months;
  const maxPrecip = Math.max(10, ...months.map(m => m.precipMm));
  const temps = months.map(m => m.tempMeanC).filter(Number.isFinite);
  const minT = Math.min(0, ...temps), maxT = Math.max(20, ...temps);
  const barW = plotW / 12;
  const xFor = i => PAD_L + i * barW;
  const yForPrecip = mm => PAD_T + (1 - mm / maxPrecip) * plotH;
  const yForTemp = c => PAD_T + (1 - (c - minT) / (maxT - minT)) * plotH;

  const bars = months.map((m, i) => {
    const y = yForPrecip(m.precipMm);
    return `<rect x="${(xFor(i) + barW * 0.18).toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.64).toFixed(1)}" height="${(PAD_T + plotH - y).toFixed(1)}" fill="#4a90c4" rx="1.5"/>`;
  }).join("");
  const labels = months.map((m, i) => `<text x="${(xFor(i) + barW / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="#8a8a9a" text-anchor="middle" font-family="Arial,sans-serif">${escapeHtml(m.label)}</text>`).join("");
  const linePts = months.map((m, i) => Number.isFinite(m.tempMeanC) ? `${(xFor(i) + barW / 2).toFixed(1)},${yForTemp(m.tempMeanC).toFixed(1)}` : null).filter(Boolean);
  const line = linePts.length > 1 ? `<polyline points="${linePts.join(" ")}" fill="none" stroke="#e0664a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : "";
  const dots = months.map((m, i) => Number.isFinite(m.tempMeanC) ? `<circle cx="${(xFor(i) + barW / 2).toFixed(1)}" cy="${yForTemp(m.tempMeanC).toFixed(1)}" r="2.5" fill="#e0664a"/>` : "").join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    ${bars}${labels}${line}${dots}
    <text x="2" y="${PAD_T + 4}" font-size="9" fill="#4a90c4" font-family="Arial,sans-serif">mm</text>
    <text x="${W - 2}" y="${PAD_T + 4}" font-size="9" fill="#e0664a" text-anchor="end" font-family="Arial,sans-serif">°C</text>
  </svg>`;
}
