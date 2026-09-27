/**
 * analysisResults.js — the Results tab's groups, and what the Revit add-in found.
 *
 * The Revit add-in publishes what its analyses found (GET localhost:5679/analysis-results): the numbers of the garden analyses (rain, wind, erosion), the structural ones (static loads,
 * dynamic analysis), the ball simulation, fire safety and accessibility, sun and shade, LCA and carbon. The Unity recordings that go with them are served beside them (GET /recording).
 * The Results tab is a second rail with one button per group, the way Sport shows its sports. (The Revit button "Send All to Web App" sends the physical analyses in one go; each analysis
 * command also publishes its own result as soon as it has one.) Compare is not in this: it compares the user's saved iterations.
 *
 *   Overview   the whole layout at a glance: one tile per analysis (resultsStore.js), each saying its headline and where it comes from; a tile opens its card below
 *   Safety     fire safety and circulation, accessibility
 *   Garden     rain and soil percolation, wind and erosion
 *   Structure  static loads by bay, balance, advice; the dynamic analysis (crowds, weather, resonance)
 *   Sun        direct sun hours per zone, shade at midday, the shading equipment to place and what it weighs on the deck; the sun path chart of the site
 *   Sport      ball trajectories, roof exits and fences
 *   Other      LCA and carbon
 *
 * There is ONE card per analysis (resultsCardHtml): Revit's full analysis when it has run, else this app's own quick estimate where there is one (analysisController.js: fire safety,
 * accessibility, rain, wind, LCA), else "not run" with where to run it. The same rule picks each tile of the overview, and the words on both come from resultsStoreCore.js.
 * Nothing is computed here: it reads, lays out and says what state each result is in (from Revit now, received earlier, not run yet). A result that rests on inputs nobody confirmed
 * (deck capacity, snow zone ...) is shown as PRELIMINARY, with the inputs, never as a verdict.
 * The last results received are kept in localStorage so the tabs still show them when Revit is closed (the recordings then are not playable).
 */

const RESULTS_CACHE_KEY = "sportify-analysis-results";
const RESULTS_POLL_MS = 3000;
const RESULTS_POLL_CLOSED_MS = 10000;

// Where each analysis is in Revit's Sportify tab. The physical (Unity based) ones are in Simulation & Analytics, in drop-downs by kind; the rule-based ones have a panel of their own.
const RUN_PATH_PHYSICAL = "Sportify ribbon → Simulation & Analytics → ";
const RUN_PATH_ALGORITHMIC = "Sportify ribbon → Algorithmic Analysis → ";

/** What each published section is called, and which button in Revit produces it. */
const RESULT_SECTIONS = {
  soil_percolation: { title: "Rain and soil percolation", run: RUN_PATH_PHYSICAL + "Environmental → Soil Percolation (Rain)" },
  wind_erosion: { title: "Wind and erosion", run: RUN_PATH_PHYSICAL + "Environmental → Wind Uplift & Erosion" },
  structural_loads: { title: "Structural loads", run: RUN_PATH_PHYSICAL + "Structural → Run Bay Utilization Check" },
  dynamic_analysis: { title: "Dynamic analysis", run: RUN_PATH_PHYSICAL + "Structural → Dynamic Frequency & Vibration" },
  ball_trajectory: { title: "Ball trajectories", run: RUN_PATH_PHYSICAL + "Ball Trajectory Simulation" },
  fire_safety: { title: "Fire safety", run: RUN_PATH_ALGORITHMIC + "Fire Safety Analysis" },
  accessibility: { title: "Accessibility", run: RUN_PATH_ALGORITHMIC + "Accessibility Analysis" },
  lca: { title: "LCA", run: RUN_PATH_ALGORITHMIC + "LCA Analysis" },
  carbon_impact: { title: "Carbon impact", run: RUN_PATH_ALGORITHMIC + "Carbon Impact Analysis" },
  sun_and_shading: { title: "Sun and shade", run: RUN_PATH_PHYSICAL + "Environmental → Sun & Shade Analysis" },
  // Shown in the Improve tab (kineticsPostAnalysis.js), not this rail — see ANALYSIS_SUBTABS's note above. Still
  // listed here so results-keys-parity.js can confirm the add-in and the web app agree on what "kinetics" means.
  kinetics: { title: "Kinetics", run: "Sportify ribbon → Kinetics" }
};

/** The rail: id, caption, icon, heading and what the group shows. */
const ANALYSIS_SUBTABS = [
  { id: "overview", label: "Overview", icon: "ti-layout-grid", title: "Results: the whole layout at a glance", intro: "One tile per analysis. Revit's full analysis when it has run on this layout, this app's quick estimate otherwise. Click a tile for the details." },
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
    id: "conditions", label: "Conditions", icon: "ti-cloud-snow", title: "Site conditions: what the roof lives through",
    intro: "The wind, the snow, the day's use and the sun the analyses assume for this roof, with who decided each, and which results use them. They are entered in the Site conditions tab.",
    sections: []
  },
  {
    id: "sun", label: "Sun", icon: "ti-sun", title: "Sun: shade and shading equipment",
    intro: "How much direct sun each part of the roof gets on the design days, which play areas are too sunny at midday and which gardens too shaded, and the shading equipment that would fix it with what it weighs on the deck.",
    sections: ["sun_and_shading"]
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
    id: "other", label: "Other", icon: "ti-leaf", title: "Carbon and materials",
    intro: "The remaining Revit analyses: embodied carbon of the materials and the energy the playing surface could harvest.",
    sections: ["lca", "carbon_impact"]
  }
];

const resultsState = { payload: null, receivedAt: null, connected: null, cached: false, raw: null, lastRenderKey: null };
let analysisSub = "overview";
let resultsPollHandle = null;
let resultsPollGen = 0;

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
    const res = await localFetch("/analysis-results");
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
  if (changed) {
    renderAnalysisIfShowingResults();
    if (typeof updateRevitLayersUI === "function") updateRevitLayersUI();      // "results from Revit: n of 10" in Combine's layers panel
    if (typeof activeMode !== "undefined" && activeMode === "combine" && typeof renderInspector === "function") renderInspector();      // the selected piece's "run in Revit" line
  }
}

/** While Revit answers, ask often; while it is closed, ask rarely (each question to a closed add-in is a refused connection the browser logs). */
function scheduleResultsPoll() {
  const gen = resultsPollGen;      // a stop then a start while a question is still out must not leave two chains asking
  resultsPollHandle = setTimeout(async () => {
    await pollAnalysisResults();
    if (gen === resultsPollGen && resultsPollHandle) scheduleResultsPoll();
  }, resultsState.connected === false ? RESULTS_POLL_CLOSED_MS : RESULTS_POLL_MS);
}

function startResultsPolling() {
  if (resultsPollHandle) return;
  pollAnalysisResults();
  scheduleResultsPoll();
}

function stopResultsPolling() {
  if (resultsPollHandle) clearTimeout(resultsPollHandle);
  resultsPollHandle = null;
  resultsPollGen++;
}

function renderAnalysisIfShowingResults() {
  if (typeof activeMode !== "undefined" && activeMode === "analysis") {
    if (analysisSub !== "overview") renderAnalysisResultsView();
    else if (typeof renderAnalysisOverviewIfChanged === "function") renderAnalysisOverviewIfChanged();      // the overview's tiles show what Revit sent too (resultsStore.js)
  }
  if (typeof renderPostAnalysisIfShowing === "function") renderPostAnalysisIfShowing();
}

// ---------------------------------------------------------------------------------------------------- the rail

/** Fills the second rail (the one Sport uses for its sports) with the Results tab's groups. */
function buildAnalysisRail() {
  const bar = document.getElementById("activity-bar");
  if (!bar) return;
  bar.innerHTML = ANALYSIS_SUBTABS.map(t => `
    <button class="activity-icon${t.id === analysisSub ? " active" : ""}" data-sub="${escapeHtml(t.id)}" title="${resEsc(t.title)}">
      <i class="ti ${t.icon}"></i><span class="activity-icon-label">${resEsc(t.label)}</span>
    </button>`).join("");
  bar.querySelectorAll(".activity-icon").forEach(btn => btn.addEventListener("click", () => setAnalysisSub(btn.dataset.sub)));
}

function setAnalysisSub(id) {
  if (!ANALYSIS_SUBTABS.some(t => t.id === id)) return;
  analysisSub = id;
  document.querySelectorAll("#activity-bar .activity-icon").forEach(b => b.classList.toggle("active", b.dataset.sub === id));
  resultsState.lastRenderKey = null;
  if (typeof updateAnalysisUI === "function") updateAnalysisUI();
  startResultsPolling();      // every group of the tab, the overview too, shows what Revit sent
}

// ---------------------------------------------------------------------------------------------------- small helpers

function resEsc(s) {
  return escapeHtml(s);
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

/**
 * Which layout a received section was computed for, against the layout on screen. The add-in stamps every section it publishes with
 * { layout_id, computed_at } (the results document's "sections") and drops the sections of other layouts when it publishes, so what arrives here is
 * about one layout, but that layout is not necessarily the one on screen now: the designer moves a court and the result is out of date until it is run again.
 * The layout's id is the first 16 hex characters of the SHA-256 of the layout JSON the app sends (workspaceBridge.js computes it, the add-in too).
 *   current    the section is about the layout on screen
 *   stale      it is about another one
 *   unknown    it carries no stamp (from an older add-in, or kept in this browser from before results were stamped)
 *   unchecked  nothing is on screen to compare with
 */
function sectionFreshness(payload, name, currentId) {
  const info = payload && payload.sections ? payload.sections[name] : null;
  if (!info || !info.layout_id) return { state: "unknown" };
  if (!currentId) return { state: "unchecked", computedAt: info.computed_at || null, layoutId: info.layout_id };
  return { state: info.layout_id === currentId ? "current" : "stale", computedAt: info.computed_at || null, layoutId: info.layout_id };
}

function resFreshness(name) {
  return sectionFreshness(resultsState.payload, name, typeof workspaceState !== "undefined" ? workspaceState.layoutIdNow : null);
}

/** "12:41" for a time from today, "20 Sep, 12:41" otherwise; "" when there is none. */
function resWhen(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + t;
}

/** The note on a card whose section is not about the layout on screen; "" for a current one. */
function resFreshnessNote(f) {
  if (f.state === "stale") {
    const when = resWhen(f.computedAt);
    return `<div class="res-stale-note"><i class="ti ti-history" aria-hidden="true"></i><div><strong>Out of date.</strong> This was computed for an earlier layout${when ? ` (${resEsc(when)})` : ""}, not the one on screen. Run the analysis again to get the numbers for this layout.</div></div>`;
  }
  if (f.state === "unknown") {
    return `<div class="res-stale-note unknown"><i class="ti ti-help-circle" aria-hidden="true"></i><div>This result does not say which layout it was computed for. Run the analysis again to be sure it is about the layout on screen.</div></div>`;
  }
  return "";
}

function resVideoUrl(path) {
  return path ? localUrl("/recording?path=" + encodeURIComponent(path)) : null;
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
    <div class="res-bar-track"><div class="res-bar-fill tone-${escapeHtml(o.tone || "neutral")}" style="width:${pct}%"></div>${refPct != null ? `<div class="res-bar-ref" style="left:${refPct}%"></div>` : ""}</div>
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
    <div class="hint">Enter your own values or accept the built-in ones (the Structure inputs and Site conditions tabs, or the window Revit opens before the analysis) to make this a result rather than a screening.</div></div></div>`;
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

/** The line that says where a card's numbers come from: the same words as the overview's tile (resultsStoreCore.js). */
function resSourceLine(source, freshness) {
  const est = source === "estimate";
  return `<div class="res-source ${est ? "estimate" : "revit"}" title="${resEsc((RESULT_SOURCES[source] || RESULT_SOURCES.none).title)}"><i class="ti ${est ? "ti-bolt" : "ti-building"}" aria-hidden="true"></i>${resEsc(resultSourceText({ source, freshness }))}</div>`;
}

/**
 * One analysis's card. opts.key (or opts.section, the name Revit publishes it under) is the analysis: it gives the card its icon and its anchor (the overview's tile scrolls here) and, with
 * opts.source "estimate", says the numbers are this app's own quick estimate.
 */
function resCard(opts) {
  const tone = opts.tone || "neutral";
  const key = opts.key || opts.section || "";
  // a card that stands for something the add-in sent says whether it is about the layout on screen; the app's own estimates have no section
  const received = !!(opts.section && resSection(opts.section));
  const f = received ? resFreshness(opts.section) : { state: "current" };
  const stale = f.state === "stale";
  const cat = key ? resultsCatalogueEntry(key) : null;
  const icon = opts.icon || (cat ? cat.icon : "");
  const iconHtml = icon ? `<i class="ti ${escapeHtml(icon)} res-title-icon" aria-hidden="true"></i>` : "";
  const source = received ? resSourceLine("revit", f.state) : opts.source === "estimate" ? resSourceLine("estimate", "current") : "";
  return `<section class="res-card tone-${stale ? "warn" : tone}${stale ? " res-stale" : ""}"${key ? ` id="res-${escapeHtml(key)}"` : ""}>
    <header class="res-head"><div><h3 class="res-title">${iconHtml}${resEsc(opts.title)}</h3>${opts.sub ? `<div class="res-sub">${resText(opts.sub)}</div>` : ""}</div>
      <span class="res-chip tone-${stale ? "warn" : tone}">${resEsc(stale ? "out of date" : opts.chip || "")}</span></header>
    ${source}
    ${resFreshnessNote(f)}
    ${opts.prelim ? resPrelim(opts.prelim) : ""}
    ${opts.body || ""}
  </section>`;
}

function resNotRun(name) {
  const s = RESULT_SECTIONS[name];
  const cat = resultsCatalogueEntry(name);
  const icon = cat ? `<i class="ti ${escapeHtml(cat.icon)} res-title-icon" aria-hidden="true"></i>` : "";
  return `<section class="res-card tone-neutral res-empty" id="res-${escapeHtml(name)}"><header class="res-head"><div><h3 class="res-title">${icon}${resEsc(s.title)}</h3><div class="res-sub">Not run for the layout on screen</div></div><span class="res-chip tone-neutral">not run</span></header>
    <p class="hint">${resEsc(s.run)}</p></section>`;
}

/**
 * The one card of an analysis, whichever program computed it: Revit's full analysis when it has run, else this app's quick estimate (analysisController.js: only fire safety, accessibility, rain, wind and LCA
 * have one), else "not run". The same rule as the overview's tile (pickResult in resultsStoreCore.js).
 */
function resultsCardHtml(key) {
  const r = resSection(key);
  if (r && REVIT_CARDS[key]) return REVIT_CARDS[key](r);
  const cat = resultsCatalogueEntry(key);
  if (cat && cat.estimate && typeof ESTIMATE_CARDS !== "undefined" && ESTIMATE_CARDS[cat.estimate]) return ESTIMATE_CARDS[cat.estimate]();
  return resNotRun(key);
}

// ---------------------------------------------------------------------------------------------------- garden

function soilCard(r) {
  const rv = revitSummary("soil_percolation", r), tone = rv.tone;
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
    section: "soil_percolation", title: RESULT_SECTIONS.soil_percolation.title, sub: r.case_study, tone,
    chip: rv.chip,
    body: tiles + zones + resFindings(r.findings) + resVideo(r.video_path) + resAssumptions(r.assumptions)
  });
}

function windCard(r) {
  const rv = revitSummary("wind_erosion", r), tone = rv.tone;
  const tiles = `<div class="res-tiles">
    ${resTile("Wind zone", resEsc(r.wind_zone || "—"), resText(r.wind_zone_source || ""))}
    ${resTile("Peak pressure", resNum(r.peak_pressure_pa, 0) + " Pa", "at " + resNum(r.roof_height_m, 1) + " m" + (r.roof_height_assumed ? " (assumed)" : ""))}
    ${resTile("Trees failing", String(r.trees_failing), "of " + r.trees_checked + (r.trees_marginal ? ", " + r.trees_marginal + " marginal" : ""), r.trees_failing > 0 ? "bad" : r.trees_marginal > 0 ? "warn" : "ok")}
    ${resTile("Build-ups that lift", String(r.zones_uplift_flagged), "of " + r.zones_checked + ", " + resNum(r.percent_planted_area_uplift_flagged, 0) + "% of the planted area", r.zones_uplift_flagged > 0 ? "bad" : "ok")}
    ${resTile("Erosion risk", resNum(r.percent_planted_area_erosion_flagged, 0) + "%", "of the planted area; bare medium moves from " + resNum(r.lowest_bare_onset_ms, 1) + " m/s")}
  </div>`;
  return resCard({
    section: "wind_erosion", title: RESULT_SECTIONS.wind_erosion.title, sub: r.case_study, tone,
    chip: rv.chip,
    body: tiles + resFindings(r.findings) + resVideo(r.video_path) + resAssumptions(r.assumptions)
  });
}

function renderGardenResults() {
  return ["soil_percolation", "wind_erosion"].map(resultsCardHtml).join("");
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
    // a bay that is not a rectangle (a skewed grid, a roof with an outline) is drawn as its own polygon, its label at the polygon's centroid
    const poly = Array.isArray(b.polygon_m) && b.polygon_m.length >= 3 ? b.polygon_m : null;
    let cx = x + w / 2, cy = y + h / 2, shape;
    if (poly) {
      const pts = poly.map(p => [pad + p.x_m * scale, pad + p.y_m * scale]);
      let a = 0, sx = 0, sy = 0;
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1]; a += cr; sx += (p[0] + q[0]) * cr; sy += (p[1] + q[1]) * cr; });
      if (Math.abs(a) > 1e-9) { cx = sx / (3 * a); cy = sy / (3 * a); }
      const d = pts.map(p => p.join(",")).join(" ");
      shape = `<polygon points="${d}" fill="${utilisationColour(b.utilisation_percent, prelim)}" fill-opacity="${prelim ? 0.5 : 1}" stroke="#0f172a" stroke-width="1" ${prelim ? 'stroke-dasharray="4,3"' : ""}/>${prelim ? `<polygon points="${d}" fill="url(#prelimHatch)"/>` : ""}`;
    } else {
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${utilisationColour(b.utilisation_percent, prelim)}" fill-opacity="${prelim ? 0.5 : 1}" stroke="#0f172a" stroke-width="1" ${prelim ? 'stroke-dasharray="4,3"' : ""}/>${prelim ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#prelimHatch)"/>` : ""}`;
    }
    const big = poly ? (b.area_m2 || 0) * scale * scale > 1600 : w > 46 && h > 28;
    return `<g><title>${resEsc(b.label)}${b.grid_names ? " (" + resEsc(b.grid_names) + ")" : ""}: ${resNum(b.load_kn_m2, 1)} kN/m², ${resNum(b.utilisation_percent, 0)}% of the capacity, about ${resNum(b.persons, 0)} people</title>
      ${shape}
      ${big ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${resNum(b.utilisation_percent, 0)}%</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9.5" fill="#0f172a">${resEsc(b.label)}</text>` : ""}</g>`;
  }).join("");
  const defs = prelim ? `<defs><pattern id="prelimHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#0f172a" stroke-width="1.6" opacity="0.45"/></pattern></defs>` : "";
  return `<svg class="res-plan" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bays of the structural grid coloured by load against the deck capacity">${defs}${rects}</svg>
    <div class="res-legend"><span class="sw" style="background:#22c55e"></span> under 80%<span class="sw" style="background:#f59e0b"></span> 80 to 100%<span class="sw" style="background:#ef4444"></span> over the capacity${prelim ? " · hatched: measured against a capacity nobody has confirmed, not a verdict" : ""}</div>`;
}

function structuralCard(r) {
  const over = r.bays_over_capacity > 0, offBalance = r.balance_status && r.balance_status !== "balanced";
  const rv = revitSummary("structural_loads", r), tone = rv.tone;
  const capNote = r.deck_capacity_assumed ? " (built-in)" : "";
  const tiles = `<div class="res-tiles">
    ${resTile("Most loaded bay", resEsc(r.worst_bay || "—"), resNum(r.peak_utilisation_percent, 0) + "% of " + resNum(r.deck_capacity_kn_m2, 1) + " kN/m²" + capNote, over ? "bad" : "")}
    ${resTile("Bays over capacity", String(r.bays_over_capacity), "of " + r.bays_checked + ", " + r.bays_marginal + " marginal", over ? "bad" : "ok")}
    ${resTile("Load", resNum(r.permanent_load_kn + r.imposed_load_kn, 0) + " kN", resNum(r.permanent_load_kn, 0) + " permanent + " + resNum(r.imposed_load_kn, 0) + " imposed")}
    ${resTile("Balance", resEsc(r.balance_status || "—"), (r.heavy_side ? "heavy on the " + resEsc(r.heavy_side) + ", " : "") + resNum(Math.abs(r.load_centre_offset_x_percent), 1) + "% / " + resNum(Math.abs(r.load_centre_offset_y_percent), 1) + "% off centre", offBalance ? "warn" : "ok")}
    ${resTile("Columns high", String(r.columns_high), "of " + r.columns_checked + " take more than 1.5x the mean", r.columns_high > 0 ? "warn" : "")}
    ${resTile("People", resNum(r.expected_persons, 0), "expected on the roof at once")}
  </div>`;
  const chip = rv.chip;
  const plan = bayPlanSvg(r.bays, null, null, r.preliminary);
  const bayTable = Array.isArray(r.bays) && r.bays.length ? `<details class="res-details"><summary>All bays (${r.bays.length})</summary><table class="res-table"><thead><tr><th>Bay</th><th>Grid</th><th>kN/m²</th><th>% of capacity</th><th>People</th></tr></thead><tbody>
    ${r.bays.map(b => `<tr><td>${resEsc(b.label)}</td><td>${resEsc(b.grid_names || "")}</td><td>${resNum(b.load_kn_m2, 1)}</td><td>${resNum(b.utilisation_percent, 0)}%</td><td>${resNum(b.persons, 0)}</td></tr>`).join("")}</tbody></table></details>` : "";
  return resCard({
    section: "structural_loads", title: RESULT_SECTIONS.structural_loads.title, sub: r.case_study, tone, chip,
    prelim: r.preliminary ? r.preliminary_note : "",
    body: tiles + plan + resFindings((r.findings || []).filter(f => f.kind !== "grid")) + bayTable + resVideo(r.video_path) + resInputs(r.inputs) + resAssumptions(r.assumptions)
  });
}

function dynamicCard(r) {
  const rv = revitSummary("dynamic_analysis", r), tone = rv.tone;
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
    ${resTile("Deck frequency", resNum(r.lowest_frequency_hz, 1) + " to " + resNum(r.highest_frequency_hz, 1) + " Hz", r.frequency_estimated ? (r.slab_depth_given ? "estimated from the slab's " + resNum(r.slab_depth_mm, 0) + " mm and the spans (±25%)" : "estimated from the spans, slab thickness not given (±25%)") : "the engineer's figure")}
    ${resTile("Resonance", resNum(r.worst_acceleration_g, 3) + " g", (r.worst_resonance_bay ? resEsc(r.worst_resonance_bay) + ", " + resText(String(r.worst_resonance_activity || "").toLowerCase()) : "") + " · limit " + resNum(r.worst_limit_g, 2) + " g", r.bays_exceeding_comfort > 0 ? "bad" : "ok")}
    ${resTile("Bays above the comfort limit", String(r.bays_exceeding_comfort), "of " + r.bays_checked + " under some activity", r.bays_exceeding_comfort > 0 ? "bad" : "ok")}
  </div>`;
  const chip = rv.chip;
  return resCard({
    section: "dynamic_analysis", title: RESULT_SECTIONS.dynamic_analysis.title, sub: r.case_study, tone, chip,
    prelim: r.preliminary ? r.preliminary_note : "",
    body: tiles + cases + resFindings(r.findings) + resVideo(r.video_path) + resInputs(r.inputs) + resAssumptions(r.assumptions)
  });
}

function renderStructureResults() {
  const s = resSection("structural_loads"), d = resSection("dynamic_analysis");
  return (s ? structuralCard(s) : resNotRun("structural_loads")) + (d ? dynamicCard(d) : resNotRun("dynamic_analysis"));
}

// ---------------------------------------------------------------------------------------------------- sun

const SUN_STATUS_TEXT = { ok: "ok", "too-sunny": "too sunny", "too-shaded": "too shaded" };

function sunStatusPill(status) {
  const tone = status === "ok" ? "ok" : status === "too-sunny" ? "bad" : "warn";
  return `<span class="res-pill tone-${tone}">${resEsc(SUN_STATUS_TEXT[status] || status || "—")}</span>`;
}

function sunCard(r) {
  // A result from before the sun analysis existed only said the sun had been configured: nothing to show but a nudge.
  if (!Array.isArray(r.days)) {
    return resCard({ section: "sun_and_shading", title: RESULT_SECTIONS.sun_and_shading.title, sub: "A result from an earlier version of the add-in", tone: "neutral", chip: "old result",
      body: `<p class="hint">It carries no sun hours or shading advice. ${resEsc(RESULT_SECTIONS.sun_and_shading.run)} produces the current one.</p>` });
  }
  const zones = r.zones || [], equipment = r.equipment || [];
  const withEquipment = r.pieces > 0;
  const people = zones.filter(z => z.kind === "people" || z.kind === "spectators");
  const gardens = zones.filter(z => z.kind === "garden");
  const sunnyNow = withEquipment ? r.people_zones_too_sunny_after : r.people_zones_too_sunny;
  const shadedNow = withEquipment ? r.garden_zones_too_shaded_after : r.garden_zones_too_shaded;
  const rv = revitSummary("sun_and_shading", r), tone = rv.tone, chip = rv.chip;
  const arrow = (before, after) => withEquipment ? `${before} → ${after}` : String(before);

  const tiles = `<div class="res-tiles">
    ${resTile("People zones too sunny", arrow(r.people_zones_too_sunny, r.people_zones_too_sunny_after), "of " + r.people_zones + " at midday" + (withEquipment ? ", before → with the equipment" : ""), sunnyNow > 0 ? "warn" : "ok")}
    ${resTile("Gardens too shaded", arrow(r.garden_zones_too_shaded, r.garden_zones_too_shaded_after), "of " + r.garden_zones + ", under " + resNum(r.garden_min_sun_hours, 1) + " h of sun on 21 June", shadedNow > 0 ? "warn" : "ok")}
    ${resTile("Equipment", String(r.pieces), withEquipment ? "+" + resNum(r.added_load_kn, 1) + " kN on the deck" : "none needed or none that fits", "")}
    ${withEquipment ? resTile("Deck's busiest bay", resNum(r.deck_peak_utilisation_before_percent, 0) + "% → " + resNum(r.deck_peak_utilisation_after_percent, 0) + "%", "of the deck capacity, " + r.deck_bays_over_before + " → " + r.deck_bays_over_after + " bays over", r.deck_bays_over_after > r.deck_bays_over_before ? "bad" : "") : ""}
    ${resTile("Site", resNum(r.latitude_deg, 1) + "° N", (r.latitude_assumed ? "latitude assumed" : "latitude from the site") + ", roof turned " + resNum(r.north_deg, 0) + "°" + (r.north_assumed ? " (assumed)" : ""))}
    ${withEquipment && r.peak_wind_pressure_pa > 0 ? resTile("Wind on the equipment", resNum(r.peak_wind_pressure_pa, 0) + " Pa", "peak pressure at the roof: anchors need the structural engineer") : ""}
  </div>`;

  const shadeBars = people.length ? `<div class="res-bars"><div class="res-bars-title">Shade between 11 and 16 h on 21 June, against the target of ${resNum(r.shade_target_percent, 0)}%</div>
    ${people.map(z => {
      const value = withEquipment ? z.after_peak_shade_percent : z.peak_shade_percent, status = withEquipment ? z.after_status : z.status;
      return resBar(resText(z.label), value, 100, { ref: r.shade_target_percent, tone: r.preliminary ? "prelim" : status === "ok" ? "ok" : "bad",
        text: withEquipment ? `${resNum(z.peak_shade_percent, 0)}% → ${resNum(z.after_peak_shade_percent, 0)}%` : `${resNum(z.peak_shade_percent, 0)}%` });
    }).join("")}</div>` : "";

  const days = `<table class="res-table"><thead><tr><th>Day</th><th>Sun up</th><th>Noon height</th><th>Roof, mean sun hours</th></tr></thead><tbody>
    ${r.days.map(d => `<tr><td>${resText(d.name)}</td><td>${resNum(d.sunrise_h, 1)} to ${resNum(d.sunset_h, 1)} h</td><td>${resNum(d.noon_elevation_deg, 0)}°</td>
      <td>${resNum(d.roof_mean_sun_hours, 1)} h${withEquipment ? " → " + resNum(d.roof_mean_sun_hours_after, 1) + " h" : ""}</td></tr>`).join("")}</tbody></table>`;

  const zoneTable = zones.length ? `<details class="res-details"><summary>Every zone (${zones.length})</summary><table class="res-table"><thead><tr><th>Zone</th><th>m²</th><th>Sun h: 21 Jun</th><th>21 Mar</th><th>21 Dec</th><th>Midday shade</th><th>Verdict</th></tr></thead><tbody>
    ${zones.map(z => {
      const judged = z.kind !== "court";
      return `<tr><td>${resText(z.label)} <span class="res-muted">${resEsc(z.kind)}</span></td><td>${resNum(z.area_m2, 0)}</td>
        <td>${resNum(z.sun_hours_june, 1)}${withEquipment && judged ? " → " + resNum(z.after_sun_hours_june, 1) : ""}</td><td>${resNum(z.sun_hours_march, 1)}</td><td>${resNum(z.sun_hours_december, 1)}</td>
        <td>${resNum(z.peak_shade_percent, 0)}%${withEquipment && judged ? " → " + resNum(z.after_peak_shade_percent, 0) + "%" : ""}</td>
        <td>${judged ? sunStatusPill(withEquipment ? z.after_status : z.status) : '<span class="res-muted">never covered</span>'}</td></tr>`;
    }).join("")}</tbody></table></details>` : "";

  const equipmentTable = equipment.length ? `<div class="res-bars-title">Shading equipment to place</div><table class="res-table"><thead><tr><th>Piece</th><th>At (m)</th><th>Size (m)</th><th>For</th><th>Shade there</th><th>Weight</th><th>Wind uplift</th></tr></thead><tbody>
    ${equipment.map(p => `<tr><td>${resText(p.name)}</td><td>${resNum(p.x_m + p.width_m / 2, 1)}, ${resNum(p.y_m + p.depth_m / 2, 1)}</td>
      <td>${resNum(p.width_m, 1)} x ${resNum(p.depth_m, 1)}, ${resNum(p.height_m, 1)} high</td><td>${resText(p.zone)}</td>
      <td>${resNum(p.shade_before_percent, 0)}% → ${resNum(p.shade_after_percent, 0)}%</td><td>${resNum(p.added_load_kn, 1)} kN</td><td>${p.wind_uplift_kn > 0.05 ? resNum(p.wind_uplift_kn, 1) + " kN" : "—"}</td></tr>`).join("")}</tbody></table>` : "";

  return resCard({
    section: "sun_and_shading", title: RESULT_SECTIONS.sun_and_shading.title, sub: r.case_study, tone, chip,
    prelim: r.preliminary ? r.preliminary_note : "",
    body: tiles + shadeBars + days + equipmentTable + resFindings(r.findings) + zoneTable + resVideo(r.video_path) + resInputs(r.inputs) + resAssumptions(r.assumptions)
  });
}

function renderSunResults() {
  // the sun path chart is this app's own drawing for the site: it has no Revit counterpart, so it sits under the analysis rather than in place of it
  return resultsCardHtml("sun_and_shading") + (typeof sunPathSectionHtml === "function" ? `<div class="res-chart-card">${sunPathSectionHtml()}</div>` : "");
}

// ---------------------------------------------------------------------------------------------------- sport

function ballCard(r) {
  const rv = revitSummary("ball_trajectory", r), tone = rv.tone;
  const fences = Array.isArray(r.fences) && r.fences.length ? `<table class="res-table"><thead><tr><th>Edge</th><th>From to (m)</th><th>Height</th><th>Stops</th></tr></thead><tbody>
    ${r.fences.map(f => `<tr><td>${resEsc(f.edge)}</td><td>${resNum(f.from_m, 1)} to ${resNum(f.to_m, 1)}</td><td>${resNum(f.height_m, 1)} m <span class="res-muted">(${resNum(f.full_height_m, 1)} m for all)</span></td><td>${resNum(f.stops_percent_of_exits, 0)}% of the exits</td></tr>`).join("")}</tbody></table>` : "";
  const tiles = `<div class="res-tiles">
    ${resTile("Stray shots flown", String(r.shots_simulated), "from every placed court")}
    ${resTile("Boundary crossings", String(r.crossing_count), "into a neighbouring court, the roof edge or circulation", r.crossing_count > 0 ? "warn" : "ok")}
    ${r.swept_shots > 0 ? resTile("Leave the roof", resNum(r.percent_leaving_roof, 0) + "%", "of " + r.swept_shots + " extra shots", r.percent_leaving_roof > 0 ? "warn" : "ok") : ""}
    ${r.swept_shots > 0 ? resTile("With the fences", resNum(r.percent_leaving_after_fences, 0) + "%", "still leave the roof", r.percent_leaving_after_fences > 0 ? "warn" : "ok") : ""}
  </div>`;
  return resCard({
    section: "ball_trajectory", title: RESULT_SECTIONS.ball_trajectory.title, sub: r.case_study, tone,
    chip: rv.chip,
    body: tiles + (fences ? `<div class="res-bars-title">Where fences would stop them</div>` + fences : "") + resVideo(r.video_path)
  });
}

function renderSportResults() {
  return resultsCardHtml("ball_trajectory");
}

// ---------------------------------------------------------------------------------------------------- safety

/** Fire safety and accessibility: Revit's figure when it has run, else the app's own routing (the Combine rules' engine) as a quick estimate. */
function fireCard(fs) {
  const rv = revitSummary("fire_safety", fs), tone = rv.tone;
  return resCard({
    section: "fire_safety", title: RESULT_SECTIONS.fire_safety.title, tone, chip: rv.chip,
    body: `<div class="res-bars">${resBar("Longest route to an entry", fs.max_dist_m, Math.max(fs.max_travel_distance_m * 1.3, fs.max_dist_m * 1.1), { ref: fs.max_travel_distance_m, tone: fs.within_limit ? "ok" : "bad", text: `${resNum(fs.max_dist_m, 1)} m <span class="res-muted">limit ${resNum(fs.max_travel_distance_m, 0)} m</span>` })}</div>
      <div class="res-tiles">${resTile("Unreachable pieces", String(fs.unreachable_count), "no walkable route to any entry", fs.unreachable_count > 0 ? "bad" : "ok")}</div>`
  });
}

function accessibilityCard(ac) {
  const rv = revitSummary("accessibility", ac), tone = rv.tone;
  return resCard({
    section: "accessibility", title: RESULT_SECTIONS.accessibility.title, tone, chip: rv.chip,
    body: `<div class="res-bars">${resBar("Circulation width", ac.current_width_m, Math.max(ac.min_width_m * 1.6, ac.current_width_m * 1.1), { ref: ac.min_width_m, tone: ac.width_ok ? "ok" : "bad", text: `${resNum(ac.current_width_m, 1)} m <span class="res-muted">wheelchair two-way ${resNum(ac.min_width_m, 1)} m</span>` })}</div>
      <div class="res-tiles">${resTile("Every piece reachable from an entry", ac.reach_ok ? "yes" : "no", "", ac.reach_ok ? "ok" : "bad")}</div>`
  });
}

function renderSafetyResults() {
  return ["fire_safety", "accessibility"].map(resultsCardHtml).join("");
}

// ---------------------------------------------------------------------------------------------------- other

function lcaCard(lca) {
  const rv = revitSummary("lca", lca);
  return resCard({
    section: "lca", title: RESULT_SECTIONS.lca.title, tone: rv.tone, chip: rv.chip,
    sub: "Embodied carbon of the picked reference materials (A1 to A3), illustrative",
    body: `<div class="res-tiles">${resTile("Embodied carbon", "~" + resNum(lca.total_kg, 0) + " kg CO₂e", "")}${resTile("Pieces with a material", String(lca.covered_count), "of " + lca.total_count, lca.missing_count ? "warn" : "ok")}</div>`
  });
}

function carbonCard(ci) {
  const rv = revitSummary("carbon_impact", ci);
  return resCard({
    section: "carbon_impact", title: RESULT_SECTIONS.carbon_impact.title, tone: rv.tone, chip: rv.chip,
    sub: "A ceiling for what piezoelectric flooring could harvest across the playing surface",
    body: `<div class="res-tiles">${resTile("Energy harvest", "~" + resNum(ci.estimated_daily_wh, 0) + " Wh/day", "over " + resNum(ci.active_surface_area_m2, 0) + " m² of active surface")}</div>`
  });
}

function renderOtherResults() {
  return ["lca", "carbon_impact"].map(resultsCardHtml).join("");
}

/** The card of each analysis that Revit's section fills (resultsCardHtml picks it when Revit has run). */
const REVIT_CARDS = {
  soil_percolation: soilCard, wind_erosion: windCard, structural_loads: structuralCard, dynamic_analysis: dynamicCard,
  sun_and_shading: sunCard, ball_trajectory: ballCard, fire_safety: fireCard, accessibility: accessibilityCard, lca: lcaCard, carbon_impact: carbonCard
};

// ---------------------------------------------------------------------------------------------------- the view

function resultsStatusHtml(withHow) {
  const t = resultsState.receivedAt ? new Date(resultsState.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const line = resultsRevitLine(resultsState.connected, !!resultsState.payload, resultsState.cached, t);
  const dot = { live: "live", idle: "live", cached: "stale", closed: "off", looking: "" }[line.key];
  // with nothing received and Revit closed, say how to get the full analyses; the words of Revit's state are the top bar's
  const how = withHow && line.key === "closed" ? " Open this project in Revit and click Send All to Web App (Sportify ribbon, Simulation & Analytics panel): the results appear here." : "";
  return `<span class="res-dot${dot ? " " + dot : ""}"></span> ${resEsc(line.text + how)}`;
}

function renderAnalysisResultsView() {
  const tab = ANALYSIS_SUBTABS.find(t => t.id === analysisSub);
  if (!tab || tab.id === "overview") return;

  const key = JSON.stringify([analysisSub, resultsState.raw, resultsState.receivedAt, resultsState.connected, resultsState.cached, typeof workspaceState !== "undefined" ? [workspaceState.stamp, workspaceState.layoutIdNow] : 0]);
  if (key === resultsState.lastRenderKey) return;   // nothing changed: leave a playing video alone
  resultsState.lastRenderKey = key;

  // the left panel: what this group is, where its results come from, what has run
  document.getElementById("analysis-heading").textContent = tab.title;
  document.getElementById("analysis-intro").textContent = tab.intro;
  const iterations = document.getElementById("analysisIterationsSection");
  if (iterations) iterations.style.display = "none";
  const panel = document.getElementById("analysisResultsSection");
  if (panel) {
    panel.style.display = "";
    panel.innerHTML = (typeof wsRunPanelHtml === "function" ? wsRunPanelHtml() : "") + `<label>Results</label><p class="hint res-status">${resultsStatusHtml(true)}</p>
      <ul class="res-run-list">${tab.sections.map(n => {
        const got = !!resSection(n), stale = got && resFreshness(n).state === "stale";
        return `<li class="${got && !stale ? "done" : stale ? "stale" : ""}"><i class="ti ${stale ? "ti-history" : got ? "ti-circle-check" : "ti-circle-dashed"}" aria-hidden="true"></i>
        <span><strong>${resEsc(RESULT_SECTIONS[n].title)}</strong><br><span class="hint">${stale ? "out of date: the layout has changed since" : got ? "received" : resEsc(RESULT_SECTIONS[n].run)}</span></span></li>`;
      }).join("")}</ul>
      <p class="hint">Run analysis (above) runs them in the Revit add-in on your current layout, with nothing to export or import; in Revit, <strong>Send All to Web App</strong> (Simulation & Analytics panel) does the same and each analysis button sends its own. What a result rests on (its inputs and assumptions) is under each card; anything unconfirmed is marked PRELIMINARY.</p>`;
  }

  const body = analysisSub === "garden" ? renderGardenResults()
    : analysisSub === "structure" ? (typeof structureInputsCardHtml === "function" ? structureInputsCardHtml(true) : "") + renderStructureResults()
    : analysisSub === "conditions" ? (typeof renderConditionsResults === "function" ? renderConditionsResults() : "")
    : analysisSub === "sun" ? renderSunResults()
    : analysisSub === "sport" ? renderSportResults()
    : analysisSub === "safety" ? renderSafetyResults()
    : renderOtherResults();
  // the charts of these analyses, drawn by the add-in for the layout on screen, under the numbers
  const charts = typeof wsChartsHtml === "function" && tab.sections.length ? wsChartsHtml(tab.sections) : "";
  if (typeof ensureCharts === "function" && tab.sections.length) ensureCharts();
  const content = document.getElementById("analysis-content");
  if (content) content.innerHTML = `<div class="res-wrap">${body}${charts}</div>`;
  document.getElementById("btn-download-sunpath")?.addEventListener("click", downloadSunPathPng);      // the Sun group's own chart (analysisController.js)
}

/** Undoes what the results views changed in the left panel, for the overview. */
function restoreAnalysisOverviewPanel() {
  const overview = ANALYSIS_SUBTABS[0];
  const heading = document.getElementById("analysis-heading");
  if (heading) heading.textContent = overview.title;
  const intro = document.getElementById("analysis-intro");
  if (intro) intro.textContent = overview.intro;
  const panel = document.getElementById("analysisResultsSection");
  if (panel) panel.style.display = "none";
  const iterations = document.getElementById("analysisIterationsSection");
  if (iterations) iterations.style.display = "";
  resultsState.lastRenderKey = null;
}
