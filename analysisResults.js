/**
 * analysisResults.js — Compare mode's analysis sub-tabs.
 *
 * The Revit add-in publishes what its analyses found (GET localhost:5679/analysis-results): the numbers of the garden analyses (rain, wind,
 * erosion), the structural ones (static loads, dynamic analysis), the ball simulation, fire safety and accessibility, LCA, carbon and sun. The
 * Unity recordings that go with them are served beside them (GET /recording). This file shows them here, in Compare, the way Sport shows its
 * sports: a second rail with one button per group.
 *
 *   Layout     what Compare always was: saved layouts, scored side by side (compareController.js)
 *   Garden     rain and soil percolation, wind and erosion
 *   Structure  static loads by bay, balance, advice; the dynamic analysis (crowds, weather, resonance)
 *   Sport      ball trajectories, roof exits and fences
 *   Safety     fire safety and circulation, accessibility
 *   Other      LCA, carbon, sun and shading
 *
 * Nothing is computed here: it reads, lays out and says what state each result is in (from Revit now, received earlier, not run yet). A result
 * that rests on inputs nobody confirmed (deck capacity, snow zone ...) is shown as PRELIMINARY, with the inputs, never as a verdict.
 * The last results received are kept in localStorage so the tabs still show them when Revit is closed (the recordings then are not playable).
 */

const REVIT_RESULTS_URL = "http://localhost:5679/analysis-results";
const REVIT_RECORDING_URL = "http://localhost:5679/recording?path=";
const RESULTS_CACHE_KEY = "sportify-analysis-results";
const RESULTS_POLL_MS = 3000;

const RUN_PATH_UNITY = "Sportify ribbon → Physical Analysis (Unity based) → ";
const RUN_PATH_PLAIN = "Sportify ribbon → Analysis → ";

/** What each published section is called, and which button in Revit produces it. */
const RESULT_SECTIONS = {
  soil_percolation: { title: "Rain and soil percolation", run: RUN_PATH_UNITY + "Soil Percolation Simulation" },
  wind_erosion: { title: "Wind and erosion", run: RUN_PATH_UNITY + "Wind & Erosion Analysis" },
  structural_loads: { title: "Structural loads", run: RUN_PATH_UNITY + "Structural Loads" },
  dynamic_analysis: { title: "Dynamic analysis", run: RUN_PATH_UNITY + "Dynamic Analysis" },
  ball_trajectory: { title: "Ball trajectories", run: RUN_PATH_UNITY + "Ball Trajectory Simulation" },
  fire_safety: { title: "Fire safety", run: RUN_PATH_PLAIN + "Fire Safety Analysis" },
  accessibility: { title: "Accessibility", run: RUN_PATH_PLAIN + "Accessibility Analysis" },
  lca: { title: "LCA", run: RUN_PATH_PLAIN + "LCA Analysis" },
  carbon_impact: { title: "Carbon impact", run: RUN_PATH_PLAIN + "Carbon Impact Analysis" },
  sun_and_shading: { title: "Sun and shading", run: RUN_PATH_PLAIN + "Sun & Shading Analysis" }
};

/** The rail: id, caption, icon, heading and what the group shows. */
const COMPARE_SUBTABS = [
  { id: "layout", label: "Layout", icon: "ti-layout-grid", title: "General layout", intro: "" },
  {
    id: "garden", label: "Garden", icon: "ti-plant-2", title: "Garden: rain, wind and erosion",
    intro: "What rain, wind and the weather do to the green roofs: how much water each build-up keeps, whether a build-up would lift off or a tree blow over.",
    sections: ["soil_percolation", "wind_erosion"]
  },
  {
    id: "structure", label: "Structure", icon: "ti-building", title: "Structure: loads and dynamics",
    intro: "How heavy each bay of the structural grid is against the deck's capacity, whether the load sits to one side, and how the roof behaves through a day of crowds, weather and rhythmic movement.",
    sections: ["structural_loads", "dynamic_analysis"]
  },
  {
    id: "sport", label: "Sport", icon: "ti-ball-basketball", title: "Sport: ball trajectories",
    intro: "Stray shots from every court: where balls cross into other courts, off the roof and into circulation space, and where fences would stop them.",
    sections: ["ball_trajectory"]
  },
  {
    id: "safety", label: "Safety", icon: "ti-flame", title: "Safety: fire and circulation",
    intro: "Can everybody get out, and can everybody get in: travel distance to the nearest entry and the width and reach of the walkways.",
    sections: ["fire_safety", "accessibility"]
  },
  {
    id: "other", label: "Other", icon: "ti-sun", title: "Sun, carbon and materials",
    intro: "The remaining Revit analyses: sun and shading, embodied carbon of the materials and the energy the playing surface could harvest.",
    sections: ["sun_and_shading", "lca", "carbon_impact"]
  }
];

const resultsState = { payload: null, receivedAt: null, connected: null, cached: false, raw: null, lastRenderKey: null };
let compareSub = "layout";
let resultsPollHandle = null;

(function loadResultsCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(RESULTS_CACHE_KEY) || "null");
    if (saved && saved.payload) {
      resultsState.payload = saved.payload;
      resultsState.receivedAt = saved.receivedAt || null;
      resultsState.cached = true;
    }
  } catch (e) { /* storage blocked or corrupt: start empty */ }
})();

// ---------------------------------------------------------------------------------------------------- polling

async function pollAnalysisResults() {
  let changed = false;
  try {
    const res = await fetch(REVIT_RESULTS_URL, { cache: "no-store" });
    if (resultsState.connected !== true) changed = true;
    resultsState.connected = true;
    if (res.ok) {
      const text = await res.text();
      if (text !== resultsState.raw) {
        resultsState.raw = text;
        resultsState.payload = JSON.parse(text);
        resultsState.receivedAt = Date.now();
        resultsState.cached = false;
        changed = true;
        try { localStorage.setItem(RESULTS_CACHE_KEY, JSON.stringify({ payload: resultsState.payload, receivedAt: resultsState.receivedAt })); } catch (e) { /* not kept */ }
      } else if (resultsState.cached) {
        resultsState.cached = false;
        changed = true;
      }
    }
  } catch (e) {
    if (resultsState.connected !== false) changed = true;
    resultsState.connected = false;
  }
  if (changed) renderCompareIfShowingResults();
}

function startResultsPolling() {
  if (resultsPollHandle) return;
  pollAnalysisResults();
  resultsPollHandle = setInterval(pollAnalysisResults, RESULTS_POLL_MS);
}

function stopResultsPolling() {
  if (resultsPollHandle) clearInterval(resultsPollHandle);
  resultsPollHandle = null;
}

function renderCompareIfShowingResults() {
  if (typeof activeMode !== "undefined" && activeMode === "compare" && compareSub !== "layout") renderCompareAnalysisView();
}

// ---------------------------------------------------------------------------------------------------- the rail

/** Fills the second rail (the one Sport uses for its sports) with Compare's groups. */
function buildCompareRail() {
  const bar = document.getElementById("activity-bar");
  if (!bar) return;
  bar.innerHTML = COMPARE_SUBTABS.map(t => `
    <button class="activity-icon${t.id === compareSub ? " active" : ""}" data-sub="${t.id}" title="${resEsc(t.title)}">
      <i class="ti ${t.icon}"></i><span class="activity-icon-label">${resEsc(t.label)}</span>
    </button>`).join("");
  bar.querySelectorAll(".activity-icon").forEach(btn => btn.addEventListener("click", () => setCompareSub(btn.dataset.sub)));
}

function setCompareSub(id) {
  if (!COMPARE_SUBTABS.some(t => t.id === id)) return;
  compareSub = id;
  document.querySelectorAll("#activity-bar .activity-icon").forEach(b => b.classList.toggle("active", b.dataset.sub === id));
  resultsState.lastRenderKey = null;
  if (typeof updateCompareUI === "function") updateCompareUI();
  if (id === "layout") stopResultsPolling(); else startResultsPolling();
}

// ---------------------------------------------------------------------------------------------------- small helpers

function resEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

/** "m2" as "m²" in text that came from the analyses. */
function resText(s) {
  return resEsc(String(s == null ? "" : s).replace(/m2\b/g, "m²"));
}

function resNum(v, digits) {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = digits == null ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) : digits;
  return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

function resSection(name) {
  return resultsState.payload ? resultsState.payload[name] || null : null;
}

function resVideoUrl(path) {
  return path ? REVIT_RECORDING_URL + encodeURIComponent(path) : null;
}

function resTile(label, value, sub, tone) {
  return `<div class="res-tile${tone ? " tone-" + tone : ""}"><div class="res-tile-value">${value}</div><div class="res-tile-label">${resEsc(label)}</div>${sub ? `<div class="res-tile-sub">${sub}</div>` : ""}</div>`;
}

/** A horizontal bar: `value` against `max`, with an optional mark at `ref` (e.g. the 100% line or a limit). */
function resBar(label, value, max, opts) {
  const o = opts || {};
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const refPct = o.ref != null && max > 0 ? Math.max(0, Math.min(100, (o.ref / max) * 100)) : null;
  return `<div class="res-bar"><div class="res-bar-label">${label}</div>
    <div class="res-bar-track"><div class="res-bar-fill tone-${o.tone || "neutral"}" style="width:${pct}%"></div>${refPct != null ? `<div class="res-bar-ref" style="left:${refPct}%"></div>` : ""}</div>
    <div class="res-bar-value">${o.text != null ? o.text : resNum(value)}</div></div>`;
}

function resFindings(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return `<ul class="res-list">${list.map(f => `<li><span class="res-kind">${resEsc(f.kind || "")}</span> ${resText(f.text)}</li>`).join("")}</ul>`;
}

function resAssumptions(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return `<details class="res-details"><summary>What the numbers assume (${list.length})</summary><ul class="res-list small">${list.map(a => `<li>${resText(a)}</li>`).join("")}</ul></details>`;
}

/** The inputs a structural result rests on, and whether the designer confirmed each. */
function resInputs(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) return "";
  const how = { entered: "entered by you", accepted: "built-in, accepted", unconfirmed: "built-in, not confirmed" };
  return `<details class="res-details"><summary>Inputs behind the numbers (${inputs.length})</summary>
    <table class="res-table"><tbody>${inputs.map(i => `<tr><td>${resEsc(i.label)}</td><td>${resText(i.value)}</td><td><span class="res-pill state-${resEsc(i.state)}">${how[i.state] || resEsc(i.state)}</span></td></tr>`).join("")}</tbody></table></details>`;
}

function resPrelim(note) {
  return `<div class="res-prelim"><i class="ti ti-alert-triangle" aria-hidden="true"></i><div><strong>PRELIMINARY</strong> ${resText((note || "").replace(/^PRELIMINARY:?\s*/, ""))}
    <div class="hint">Enter your own values or accept the built-in ones (Site tab → Analysis assumptions, or the window Revit opens before the analysis) to make this a result rather than a screening.</div></div></div>`;
}

/** The recording beside the numbers: playable while Revit is running and serving it. */
function resVideo(path) {
  if (!path) return `<p class="hint res-novideo"><i class="ti ti-video-off" aria-hidden="true"></i> No video was recorded for this run (it needs the Unity Editor; the numbers do not).</p>`;
  const name = String(path).split(/[\\/]/).pop();
  if (resultsState.connected !== true || resultsState.cached) {
    return `<p class="hint res-novideo"><i class="ti ti-video" aria-hidden="true"></i> Recording: ${resEsc(name)}. It plays here while Revit is running; it is on disk in the Sportify.Simulation Recordings folder.</p>`;
  }
  return `<video class="res-video" controls preload="metadata" src="${resEsc(resVideoUrl(path))}"></video><div class="hint">${resEsc(name)}</div>`;
}

function resCard(opts) {
  const tone = opts.tone || "neutral";
  return `<section class="res-card tone-${tone}">
    <header class="res-head"><div><h3 class="res-title">${resEsc(opts.title)}</h3>${opts.sub ? `<div class="res-sub">${resText(opts.sub)}</div>` : ""}</div>
      <span class="res-chip tone-${tone}">${resEsc(opts.chip || "")}</span></header>
    ${opts.prelim ? resPrelim(opts.prelim) : ""}
    ${opts.body || ""}
  </section>`;
}

function resNotRun(name) {
  const s = RESULT_SECTIONS[name];
  return `<section class="res-card tone-neutral res-empty"><header class="res-head"><div><h3 class="res-title">${resEsc(s.title)}</h3><div class="res-sub">Not run yet in this Revit session</div></div><span class="res-chip tone-neutral">no result</span></header>
    <p class="hint">${resEsc(s.run)}</p></section>`;
}

// ---------------------------------------------------------------------------------------------------- garden

function soilCard(r) {
  const tone = r.zones_saturated_in_cloudburst > 0 || r.zones_below_target > 0 ? "warn" : "ok";
  const tiles = `<div class="res-tiles">
    ${resTile("Steady rain kept", resNum(r.steady_retained_percent, 0) + "%", "10 mm/h")}
    ${resTile("Heavy shower kept", resNum(r.heavy_shower_retained_percent, 0) + "%", "40 mm/h, peak cut " + resNum(r.heavy_shower_peak_reduction_percent, 0) + "%")}
    ${resTile("Cloudburst kept", resNum(r.cloudburst_retained_percent, 0) + "%", "108 mm/h, peak cut " + resNum(r.cloudburst_peak_reduction_percent, 0) + "%", r.zones_saturated_in_cloudburst > 0 ? "warn" : "")}
    ${resTile("Cloudburst peak", resNum(r.cloudburst_peak_lps, 1) + " L/s", "bare roof " + resNum(r.cloudburst_reference_peak_lps, 1) + " L/s")}
    ${resTile("Zones under target", String(r.zones_below_target), "of " + r.zones_checked, r.zones_below_target > 0 ? "warn" : "ok")}
    ${resTile("Fill up in the cloudburst", String(r.zones_saturated_in_cloudburst), "of " + r.zones_checked, r.zones_saturated_in_cloudburst > 0 ? "bad" : "ok")}
  </div>`;
  const zones = Array.isArray(r.zones) && r.zones.length ? `<table class="res-table"><thead><tr><th>Build-up</th><th>System</th><th>Substrate</th><th>Steady</th><th>Shower</th><th>Cloudburst</th></tr></thead><tbody>
    ${r.zones.map(z => `<tr><td>${resText(z.label)}</td><td>${resText(z.system)}</td><td>${resNum(z.substrate_mm, 0)} mm</td>
      <td>${resNum(z.retained_steady_percent, 0)}%</td><td>${resNum(z.retained_heavy_shower_percent, 0)}%</td><td>${resNum(z.retained_cloudburst_percent, 0)}%</td></tr>`).join("")}</tbody></table>` : "";
  return resCard({
    title: RESULT_SECTIONS.soil_percolation.title, sub: r.case_study, tone,
    chip: r.zones_saturated_in_cloudburst > 0 ? `${r.zones_saturated_in_cloudburst} fill up` : r.zones_below_target > 0 ? `${r.zones_below_target} under target` : "within target",
    body: tiles + zones + resFindings(r.findings) + resVideo(r.video_path) + resAssumptions(r.assumptions)
  });
}

function windCard(r) {
  const tone = r.trees_failing > 0 || r.zones_uplift_flagged > 0 ? "bad" : r.trees_marginal > 0 ? "warn" : "ok";
  const tiles = `<div class="res-tiles">
    ${resTile("Wind zone", resEsc(r.wind_zone || "—"), resText(r.wind_zone_source || ""))}
    ${resTile("Peak pressure", resNum(r.peak_pressure_pa, 0) + " Pa", "at " + resNum(r.roof_height_m, 1) + " m" + (r.roof_height_assumed ? " (assumed)" : ""))}
    ${resTile("Trees failing", String(r.trees_failing), "of " + r.trees_checked + (r.trees_marginal ? ", " + r.trees_marginal + " marginal" : ""), r.trees_failing > 0 ? "bad" : r.trees_marginal > 0 ? "warn" : "ok")}
    ${resTile("Build-ups that lift", String(r.zones_uplift_flagged), "of " + r.zones_checked + ", " + resNum(r.percent_planted_area_uplift_flagged, 0) + "% of the planted area", r.zones_uplift_flagged > 0 ? "bad" : "ok")}
    ${resTile("Erosion risk", resNum(r.percent_planted_area_erosion_flagged, 0) + "%", "of the planted area; bare medium moves from " + resNum(r.lowest_bare_onset_ms, 1) + " m/s")}
  </div>`;
  return resCard({
    title: RESULT_SECTIONS.wind_erosion.title, sub: r.case_study, tone,
    chip: r.trees_failing || r.zones_uplift_flagged ? "action needed" : r.trees_marginal ? "marginal" : "holds",
    body: tiles + resFindings(r.findings) + resVideo(r.video_path) + resAssumptions(r.assumptions)
  });
}

function renderGardenResults() {
  const parts = ["soil_percolation", "wind_erosion"].map(n => {
    const r = resSection(n);
    if (!r) return resNotRun(n);
    return n === "soil_percolation" ? soilCard(r) : windCard(r);
  });
  return parts.join("");
}

// ---------------------------------------------------------------------------------------------------- structure

function utilisationColour(u, prelim) {
  return u > 100 ? "#ef4444" : u >= 80 ? "#f59e0b" : "#22c55e";
}

/** The roof's bays in plan, coloured by how full each is against the deck capacity. */
function bayPlanSvg(bays, roofL, roofW, prelim) {
  const withGeom = (bays || []).filter(b => b && b.x1_m > b.x0_m && b.y1_m > b.y0_m);
  if (!withGeom.length) return "";
  const L = roofL || Math.max(...withGeom.map(b => b.x1_m));
  const W = roofW || Math.max(...withGeom.map(b => b.y1_m));
  const pad = 6, vw = 680, scale = (vw - 2 * pad) / L, vh = W * scale + 2 * pad;
  const rects = withGeom.map(b => {
    const x = pad + b.x0_m * scale, y = pad + b.y0_m * scale, w = (b.x1_m - b.x0_m) * scale, h = (b.y1_m - b.y0_m) * scale;
    const big = w > 46 && h > 28;
    return `<g><title>${resEsc(b.label)}${b.grid_names ? " (" + resEsc(b.grid_names) + ")" : ""}: ${resNum(b.load_kn_m2, 1)} kN/m², ${resNum(b.utilisation_percent, 0)}% of the capacity, about ${resNum(b.persons, 0)} people</title>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${utilisationColour(b.utilisation_percent, prelim)}" fill-opacity="${prelim ? 0.5 : 1}" stroke="#0f172a" stroke-width="1" ${prelim ? 'stroke-dasharray="4,3"' : ""}/>
      ${prelim ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#prelimHatch)"/>` : ""}
      ${big ? `<text x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${resNum(b.utilisation_percent, 0)}%</text>
      <text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="9.5" fill="#0f172a">${resEsc(b.label)}</text>` : ""}</g>`;
  }).join("");
  const defs = prelim ? `<defs><pattern id="prelimHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#0f172a" stroke-width="1.6" opacity="0.45"/></pattern></defs>` : "";
  return `<svg class="res-plan" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bays of the structural grid coloured by load against the deck capacity">${defs}${rects}</svg>
    <div class="res-legend"><span class="sw" style="background:#22c55e"></span> under 80%<span class="sw" style="background:#f59e0b"></span> 80 to 100%<span class="sw" style="background:#ef4444"></span> over the capacity${prelim ? " · hatched: measured against a capacity nobody has confirmed, not a verdict" : ""}</div>`;
}

function structuralCard(r) {
  const over = r.bays_over_capacity > 0, offBalance = r.balance_status && r.balance_status !== "balanced";
  const tone = r.preliminary ? "prelim" : over ? "bad" : offBalance ? "warn" : "ok";
  const capNote = r.deck_capacity_assumed ? " (built-in)" : "";
  const tiles = `<div class="res-tiles">
    ${resTile("Most loaded bay", resEsc(r.worst_bay || "—"), resNum(r.peak_utilisation_percent, 0) + "% of " + resNum(r.deck_capacity_kn_m2, 1) + " kN/m²" + capNote, over ? "bad" : "")}
    ${resTile("Bays over capacity", String(r.bays_over_capacity), "of " + r.bays_checked + ", " + r.bays_marginal + " marginal", over ? "bad" : "ok")}
    ${resTile("Load", resNum(r.permanent_load_kn + r.imposed_load_kn, 0) + " kN", resNum(r.permanent_load_kn, 0) + " permanent + " + resNum(r.imposed_load_kn, 0) + " imposed")}
    ${resTile("Balance", resEsc(r.balance_status || "—"), (r.heavy_side ? "heavy on the " + resEsc(r.heavy_side) + ", " : "") + resNum(Math.abs(r.load_centre_offset_x_percent), 1) + "% / " + resNum(Math.abs(r.load_centre_offset_y_percent), 1) + "% off centre", offBalance ? "warn" : "ok")}
    ${resTile("Columns high", String(r.columns_high), "of " + r.columns_checked + " take more than 1.5x the mean", r.columns_high > 0 ? "warn" : "")}
    ${resTile("People", resNum(r.expected_persons, 0), "expected on the roof at once")}
  </div>`;
  const chip = r.preliminary ? "PRELIMINARY" : over ? `${r.bays_over_capacity} bays over` : offBalance ? "unbalanced" : "within capacity";
  const plan = bayPlanSvg(r.bays, null, null, r.preliminary);
  const bayTable = Array.isArray(r.bays) && r.bays.length ? `<details class="res-details"><summary>All bays (${r.bays.length})</summary><table class="res-table"><thead><tr><th>Bay</th><th>Grid</th><th>kN/m²</th><th>% of capacity</th><th>People</th></tr></thead><tbody>
    ${r.bays.map(b => `<tr><td>${resEsc(b.label)}</td><td>${resEsc(b.grid_names || "")}</td><td>${resNum(b.load_kn_m2, 1)}</td><td>${resNum(b.utilisation_percent, 0)}%</td><td>${resNum(b.persons, 0)}</td></tr>`).join("")}</tbody></table></details>` : "";
  return resCard({
    title: RESULT_SECTIONS.structural_loads.title, sub: r.case_study, tone, chip,
    prelim: r.preliminary ? r.preliminary_note : "",
    body: tiles + plan + resFindings((r.findings || []).filter(f => f.kind !== "grid")) + bayTable + resVideo(r.video_path) + resInputs(r.inputs) + resAssumptions(r.assumptions)
  });
}

function dynamicCard(r) {
  const tone = r.preliminary ? "prelim" : r.bays_exceeding_comfort > 0 || r.worst_case_utilisation_percent > 100 ? "bad" : "ok";
  const cases = Array.isArray(r.cases) && r.cases.length
    ? `<div class="res-bars"><div class="res-bars-title">Busiest bay in each weather case, against the deck capacity of ${resNum(r.deck_capacity_kn_m2, 1)} kN/m²</div>
       ${r.cases.map(c => resBar(resText(c.name), c.peak_utilisation_percent, Math.max(130, ...r.cases.map(x => x.peak_utilisation_percent)), {
         ref: 100, tone: r.preliminary ? "prelim" : c.peak_utilisation_percent > 100 ? "bad" : c.peak_utilisation_percent >= 80 ? "warn" : "ok",
         text: `${resNum(c.peak_utilisation_percent, 0)}% <span class="res-muted">${resEsc(c.worst_bay || "")}${c.bays_over_capacity ? ", " + c.bays_over_capacity + " over" : ""}</span>` })).join("")}</div>` : "";
  const tiles = `<div class="res-tiles">
    ${resTile("Busiest hour", resNum(r.peak_at_hour, 1).replace(/,/g, ".") + " h", "about " + resNum(r.peak_persons, 0) + " people (" + resNum(r.peak_crowd_kn, 0) + " kN, " + resNum(r.crowd_share_of_load_percent, 1) + "% of the load)")}
    ${resTile("Most crowded", resEsc(r.busiest_bay || "—"), resNum(r.busiest_bay_peak_density, 2) + " people/m²")}
    ${resTile("Snow", "sk " + resNum(r.snow_sk_kn_m2, 2), "zone " + resEsc(r.snow_zone || "—") + (r.snow_assumed ? " (assumed)" : "") + ", kN/m²")}
    ${resTile("Cloudburst", "+" + resNum(r.rain_peak_added_kn, 0) + " kN", "water added to the build-ups")}
    ${resTile("Deck frequency", resNum(r.lowest_frequency_hz, 1) + " to " + resNum(r.highest_frequency_hz, 1) + " Hz", r.frequency_estimated ? "estimated from the spans (±25%)" : "the engineer's figure")}
    ${resTile("Resonance", resNum(r.worst_acceleration_g, 3) + " g", (r.worst_resonance_bay ? resEsc(r.worst_resonance_bay) + ", " + resText(String(r.worst_resonance_activity || "").toLowerCase()) : "") + " · limit " + resNum(r.worst_limit_g, 2) + " g", r.bays_exceeding_comfort > 0 ? "bad" : "ok")}
    ${resTile("Bays above the comfort limit", String(r.bays_exceeding_comfort), "of " + r.bays_checked + " under some activity", r.bays_exceeding_comfort > 0 ? "bad" : "ok")}
  </div>`;
  const chip = r.preliminary ? "PRELIMINARY" : r.bays_exceeding_comfort > 0 ? `${r.bays_exceeding_comfort} bays vibrate` : "within limits";
  return resCard({
    title: RESULT_SECTIONS.dynamic_analysis.title, sub: r.case_study, tone, chip,
    prelim: r.preliminary ? r.preliminary_note : "",
    body: tiles + cases + resFindings(r.findings) + resVideo(r.video_path) + resInputs(r.inputs) + resAssumptions(r.assumptions)
  });
}

function renderStructureResults() {
  const s = resSection("structural_loads"), d = resSection("dynamic_analysis");
  return (s ? structuralCard(s) : resNotRun("structural_loads")) + (d ? dynamicCard(d) : resNotRun("dynamic_analysis"));
}

// ---------------------------------------------------------------------------------------------------- sport

function ballCard(r) {
  const tone = r.crossing_count > 0 || r.percent_leaving_roof > 0 ? "warn" : "ok";
  const fences = Array.isArray(r.fences) && r.fences.length ? `<table class="res-table"><thead><tr><th>Edge</th><th>From to (m)</th><th>Height</th><th>Stops</th></tr></thead><tbody>
    ${r.fences.map(f => `<tr><td>${resEsc(f.edge)}</td><td>${resNum(f.from_m, 1)} to ${resNum(f.to_m, 1)}</td><td>${resNum(f.height_m, 1)} m <span class="res-muted">(${resNum(f.full_height_m, 1)} m for all)</span></td><td>${resNum(f.stops_percent_of_exits, 0)}% of the exits</td></tr>`).join("")}</tbody></table>` : "";
  const tiles = `<div class="res-tiles">
    ${resTile("Stray shots flown", String(r.shots_simulated), "from every placed court")}
    ${resTile("Boundary crossings", String(r.crossing_count), "into a neighbouring court, the roof edge or circulation", r.crossing_count > 0 ? "warn" : "ok")}
    ${r.swept_shots > 0 ? resTile("Leave the roof", resNum(r.percent_leaving_roof, 0) + "%", "of " + r.swept_shots + " extra shots", r.percent_leaving_roof > 0 ? "warn" : "ok") : ""}
    ${r.swept_shots > 0 ? resTile("With the fences", resNum(r.percent_leaving_after_fences, 0) + "%", "still leave the roof", r.percent_leaving_after_fences > 0 ? "warn" : "ok") : ""}
  </div>`;
  return resCard({
    title: RESULT_SECTIONS.ball_trajectory.title, sub: r.case_study, tone,
    chip: r.percent_leaving_roof > 0 ? `${resNum(r.percent_leaving_roof, 0)}% leave the roof` : r.crossing_count > 0 ? `${r.crossing_count} crossings` : "contained",
    body: tiles + (fences ? `<div class="res-bars-title">Where fences would stop them</div>` + fences : "") + resVideo(r.video_path)
  });
}

function renderSportResults() {
  const r = resSection("ball_trajectory");
  return r ? ballCard(r) : resNotRun("ball_trajectory");
}

// ---------------------------------------------------------------------------------------------------- safety

/** Fire safety: Revit's figure when it has run, else the app's own routing (the Combine rules' engine) as an estimate. */
function renderSafetyResults() {
  let out = "";

  const fs = resSection("fire_safety");
  if (fs) {
    const tone = fs.within_limit && fs.unreachable_count === 0 ? "ok" : "bad";
    out += resCard({
      title: RESULT_SECTIONS.fire_safety.title, tone, chip: tone === "ok" ? "within the limit" : fs.unreachable_count ? `${fs.unreachable_count} unreachable` : "too far",
      sub: "From Revit, on the layout it was run on",
      body: `<div class="res-bars">${resBar("Longest route to an entry", fs.max_dist_m, Math.max(fs.max_travel_distance_m * 1.3, fs.max_dist_m * 1.1), { ref: fs.max_travel_distance_m, tone: fs.within_limit ? "ok" : "bad", text: `${resNum(fs.max_dist_m, 1)} m <span class="res-muted">limit ${resNum(fs.max_travel_distance_m, 0)} m</span>` })}</div>
        <div class="res-tiles">${resTile("Unreachable pieces", String(fs.unreachable_count), "no walkable route to any entry", fs.unreachable_count > 0 ? "bad" : "ok")}</div>`
    });
  } else if (typeof analyzeFireSafety === "function") {
    const a = analyzeFireSafety();
    let body;
    if (a.status === "empty") body = `<p class="hint">Push a sport, activity or garden piece to Combine to estimate this here.</p>`;
    else if (a.status === "no-entries") body = `<p class="hint">Add an entry point on the Combine board to estimate this here.</p>`;
    else if (a.status === "fail") body = `<div class="res-tiles">${resTile("Unreachable pieces", String(a.unreachableCount), "no walkable route to any entry", "bad")}</div>`;
    else body = `<div class="res-bars">${resBar("Longest route to an entry", a.maxDist, Math.max(a.maxTravelDistance * 1.3, a.maxDist * 1.1), { ref: a.maxTravelDistance, tone: a.withinLimit ? "ok" : "bad", text: `${resNum(a.maxDist, 1)} m <span class="res-muted">limit ${resNum(a.maxTravelDistance, 0)} m</span>` })}</div>`;
    out += resCard({ title: RESULT_SECTIONS.fire_safety.title, tone: "neutral", chip: "estimated in the app", sub: "The app's own routing, the same engine as the Combine rules. Revit's run is the reference.", body: body + `<p class="hint">${resEsc(RESULT_SECTIONS.fire_safety.run)}</p>` });
  } else out += resNotRun("fire_safety");

  const ac = resSection("accessibility");
  if (ac) {
    const tone = ac.width_ok && ac.reach_ok ? "ok" : "bad";
    out += resCard({
      title: RESULT_SECTIONS.accessibility.title, tone, chip: tone === "ok" ? "accessible" : !ac.width_ok ? "too narrow" : "not reachable", sub: "From Revit, on the layout it was run on",
      body: `<div class="res-bars">${resBar("Circulation width", ac.current_width_m, Math.max(ac.min_width_m * 1.6, ac.current_width_m * 1.1), { ref: ac.min_width_m, tone: ac.width_ok ? "ok" : "bad", text: `${resNum(ac.current_width_m, 1)} m <span class="res-muted">wheelchair two-way ${resNum(ac.min_width_m, 1)} m</span>` })}</div>
        <div class="res-tiles">${resTile("Every piece reachable from an entry", ac.reach_ok ? "yes" : "no", "", ac.reach_ok ? "ok" : "bad")}</div>`
    });
  } else if (typeof analyzeAccessibility === "function") {
    const a = analyzeAccessibility();
    const body = a.status === "empty" ? `<p class="hint">Push a piece to Combine to estimate this here.</p>`
      : `<div class="res-bars">${resBar("Circulation width", a.currentWidth, Math.max(a.minWidth * 1.6, a.currentWidth * 1.1), { ref: a.minWidth, tone: a.widthOk ? "ok" : "bad", text: `${resNum(a.currentWidth, 1)} m <span class="res-muted">wheelchair two-way ${resNum(a.minWidth, 1)} m</span>` })}</div>
         <div class="res-tiles">${resTile("Every piece reachable from an entry", a.reachOk ? "yes" : "no", "", a.reachOk ? "ok" : "bad")}</div>`;
    out += resCard({ title: RESULT_SECTIONS.accessibility.title, tone: "neutral", chip: "estimated in the app", sub: "The app's own check. Revit's run is the reference.", body: body + `<p class="hint">${resEsc(RESULT_SECTIONS.accessibility.run)}</p>` });
  } else out += resNotRun("accessibility");
  return out;
}

// ---------------------------------------------------------------------------------------------------- other

function renderOtherResults() {
  let out = "";
  const ss = resSection("sun_and_shading");
  out += ss ? resCard({
    title: RESULT_SECTIONS.sun_and_shading.title, tone: ss.location_configured ? "ok" : "warn", chip: ss.location_configured ? "location set" : "no location",
    sub: "So far this only sets Revit's sun and points at its own shadow tools",
    body: `<div class="res-tiles">${resTile("Configured for", resEsc(ss.configured_for_date_time || "—"), "Revit's own Sun Path and Shadows do the rendering")}</div>`
  }) : resNotRun("sun_and_shading");

  const lca = resSection("lca");
  out += lca ? resCard({
    title: RESULT_SECTIONS.lca.title, tone: lca.missing_count ? "warn" : "ok", chip: lca.missing_count ? `${lca.missing_count} pieces missing data` : "all pieces covered",
    sub: "Embodied carbon of the picked reference materials (A1 to A3), illustrative",
    body: `<div class="res-tiles">${resTile("Embodied carbon", "~" + resNum(lca.total_kg, 0) + " kg CO₂e", "")}${resTile("Pieces with a material", String(lca.covered_count), "of " + lca.total_count, lca.missing_count ? "warn" : "ok")}</div>`
  }) : resNotRun("lca");

  const ci = resSection("carbon_impact");
  out += ci ? resCard({
    title: RESULT_SECTIONS.carbon_impact.title, tone: "neutral", chip: "illustrative",
    sub: "A ceiling for what piezoelectric flooring could harvest across the playing surface",
    body: `<div class="res-tiles">${resTile("Energy harvest", "~" + resNum(ci.estimated_daily_wh, 0) + " Wh/day", "over " + resNum(ci.active_surface_area_m2, 0) + " m² of active surface")}</div>`
  }) : resNotRun("carbon_impact");
  return out;
}

// ---------------------------------------------------------------------------------------------------- the view

function resultsStatusHtml() {
  const t = resultsState.receivedAt ? new Date(resultsState.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  if (resultsState.connected === true && !resultsState.cached && resultsState.payload)
    return `<span class="res-dot live"></span> Live from Revit${t ? `, received ${t}` : ""}.`;
  if (resultsState.connected === true) return `<span class="res-dot live"></span> Connected to Revit. Nothing has been analysed yet in this session.`;
  if (resultsState.payload) return `<span class="res-dot stale"></span> Revit is not connected. Showing the last results received${t ? ` (${t}${resultsState.cached ? ", earlier session" : ""})` : ""}.`;
  if (resultsState.connected === false) return `<span class="res-dot off"></span> Revit is not connected. Run an analysis in Revit and its results appear here.`;
  return `<span class="res-dot"></span> Looking for Revit...`;
}

function renderCompareAnalysisView() {
  const tab = COMPARE_SUBTABS.find(t => t.id === compareSub);
  if (!tab || tab.id === "layout") return;

  const key = JSON.stringify([compareSub, resultsState.raw, resultsState.receivedAt, resultsState.connected, resultsState.cached]);
  if (key === resultsState.lastRenderKey) return;   // nothing changed: leave a playing video alone
  resultsState.lastRenderKey = key;

  // the left panel: what this group is, where its results come from, what has run
  document.getElementById("compare-heading").textContent = tab.title;
  document.getElementById("compare-intro").textContent = tab.intro;
  document.getElementById("field-label").textContent = `Compare — ${tab.title}`;
  document.getElementById("norm-badge").textContent = "results from Revit";
  ["comparePrioritySection", "compareFineTuneSection", "compareRoofSection", "compareGuideSection"].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = "none";
  });
  const panel = document.getElementById("compareResultsSection");
  if (panel) {
    panel.style.display = "";
    panel.innerHTML = `<label>Results</label><p class="hint res-status">${resultsStatusHtml()}</p>
      <ul class="res-run-list">${tab.sections.map(n => `<li class="${resSection(n) ? "done" : ""}"><i class="ti ${resSection(n) ? "ti-circle-check" : "ti-circle-dashed"}" aria-hidden="true"></i>
        <span><strong>${resEsc(RESULT_SECTIONS[n].title)}</strong><br><span class="hint">${resSection(n) ? "received" : resEsc(RESULT_SECTIONS[n].run)}</span></span></li>`).join("")}</ul>
      <p class="hint">Numbers and recordings come from the Revit add-in. What a result rests on (its inputs and assumptions) is under each card; anything unconfirmed is marked PRELIMINARY.</p>`;
  }

  const body = compareSub === "garden" ? renderGardenResults()
    : compareSub === "structure" ? renderStructureResults()
    : compareSub === "sport" ? renderSportResults()
    : compareSub === "safety" ? renderSafetyResults()
    : renderOtherResults();
  const content = document.getElementById("compare-content");
  if (content) content.innerHTML = `<div class="res-wrap">${body}</div>`;
}

/** Undoes what the analysis views changed in the left panel, for the layout view. */
function restoreCompareLayoutPanel() {
  const panel = document.getElementById("compareResultsSection");
  if (panel) panel.style.display = "none";
  const guide = document.getElementById("compareGuideSection");
  if (guide) guide.style.display = "";
  resultsState.lastRenderKey = null;
}
