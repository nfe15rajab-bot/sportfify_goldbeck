/**
 * analysisController.js — the app's own quick estimates
 * Early, approximate previews of checks the Revit add-in later runs at full BIM fidelity — pure calculations against the current Combine layout (circulation paths, garden theme data, roof
 * geometry), no physics or rendering. Four kinds of things here:
 *   analyze*()         the layout-wide number of each estimate (fire safety, accessibility, water, wind exposure, LCA)
 *   the *CardHtml()    the card each one is drawn as, shown under its analysis in the Analysis tab when Revit has not sent its full one (analysisResults.js resultsCardHtml)
 *   piece*()           what each says about ONE piece, which Combine's inspector shows live (resultsStore.js)
 *   sun path chart     this app's own drawing of the sun's height across the day at the site, under the Sun group
 * The overview of the tab (a tile per analysis: Revit's number if it has run, else the estimate) is resultsStore.js; the words on every tile, card and row come from resultsStoreCore.js.
 */

/* ── Reference figures, sourced from the .NET database's AnalysisParameter
   rows (Data tab → Analysis domain) instead of living as bare constants.
   The literal values below are only the offline fallback — used verbatim
   if the backend can't be reached, so this tab never breaks standalone,
   and identical to what this file hardcoded before this was wired up. ── */
const ANALYSIS_PARAM_DEFAULTS = {
  "Fire Safety": { max_travel_distance_m: 35 },
  "Accessibility": { min_circulation_width_m: 1.5 },
  "Water Management": { retention_base_percent: 30, retention_depth_coefficient_percent_per_cm: 2, retention_max_percent: 90 },
  "Wind Exposure": { edge_exposure_zone_m: 2.0 },
  // not read by the app itself, but the database seeds them and the add-in's structural and carbon analyses use them: the same list in all three places (Tools/SourceParity)
  "Live Loads": { assumed_load_per_person_kg: 90, reference_capacity_kn_per_m2: 4.0 },
  "Carbon Impact": { energy_density_wh_per_m2_per_hour: 0.5, assumed_daily_usage_hours: 4 },
};
let analysisParametersCache = [];
let analysisMaterialsCache = [];

function getAnalysisParam(category, key) {
  const found = analysisParametersCache.find(p => p.category === category && p.key === key);
  return found ? found.value : ANALYSIS_PARAM_DEFAULTS[category]?.[key];
}

async function initAnalysisReferenceData() {
  try {
    const [params, materials] = await Promise.all([fetchAnalysisParameters(), fetchReferenceMaterials()]);
    analysisParametersCache = params;
    analysisMaterialsCache = materials;
  } catch (err) {
    // Offline: caches stay empty, getAnalysisParam() falls back to
    // ANALYSIS_PARAM_DEFAULTS and LCA reports every piece as missing data
    // (true, in the sense that it can't be looked up right now) rather
    // than throwing.
  }
  // main.js (which declares activeMode) is the last script: an API that answers before it has run must not throw here
  if (typeof activeMode !== "undefined" && activeMode === "analysis" && typeof updateAnalysisUI === "function") updateAnalysisUI();
}
initAnalysisReferenceData();

/** The reference material a piece is made of: the one picked in Sport/Garden, else the one its quality tier means. One rule, in carbon.js (referenceMaterialName). */
function getReferenceMaterialName(item) {
  return referenceMaterialName(item);
}

function pathLengthM(points) {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

/* ── Layout-wide summary (unchanged from before) ── */

/** Reuses the same circulation engine the Combine board's own rules checklist runs — never a second, disagreeing implementation. */
function analyzeFireSafety() {
  if (combineState.items.length === 0) return { status: "empty" };
  if (combineState.entryPoints.length === 0) return { status: "no-entries" };

  const circulation = computeCirculation(combineState, DESIGN_RULES);
  if (circulation.unreachable.size > 0) {
    return { status: "fail", unreachableCount: circulation.unreachable.size };
  }
  const maxTravelDistance = getAnalysisParam("Fire Safety", "max_travel_distance_m");
  const distances = circulation.paths.map(p => pathLengthM(p.points));
  const maxDist = distances.length ? Math.max(...distances) : 0;
  return { status: "ok", maxDist, maxTravelDistance, withinLimit: maxDist <= maxTravelDistance };
}

function analyzeAccessibility() {
  if (combineState.items.length === 0) return { status: "empty" };

  const minWidth = getAnalysisParam("Accessibility", "min_circulation_width_m");
  const widthOk = DESIGN_RULES.circulationWidth_m >= minWidth;
  const circulation = computeCirculation(combineState, DESIGN_RULES);
  const reachOk = combineState.entryPoints.length > 0 && circulation.unreachable.size === 0;
  return { status: "ok", widthOk, reachOk, currentWidth: DESIGN_RULES.circulationWidth_m, minWidth };
}

/**
 * Illustrative estimate, not a certified hydrology calculation: retention
 * scaling with total buildup depth is consistent with FLL guidance
 * (deeper substrate retains more), but the exact coefficient here is a
 * simple, clearly-approximate formula, not a cited coefficient table. The
 * three coefficients themselves come from AnalysisParameter (Water
 * Management category) — see initAnalysisReferenceData() above.
 */
function computeRetentionPercent(depthCm) {
  const base = getAnalysisParam("Water Management", "retention_base_percent");
  const coeff = getAnalysisParam("Water Management", "retention_depth_coefficient_percent_per_cm");
  const max = getAnalysisParam("Water Management", "retention_max_percent");
  return Math.min(max, Math.round(base + depthCm * coeff));
}

function analyzeWaterManagement() {
  const gardenItems = combineState.items.filter(it => it.kind === "garden");
  if (gardenItems.length === 0) return { status: "empty" };

  let totalAreaM2 = 0;
  let weightedDepthCm = 0;
  gardenItems.forEach(it => {
    const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
    const area = fp.w * fp.h;
    const theme = GARDEN_THEMES[it.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
    const depthCm = Object.values(theme.layers).reduce((sum, l) => sum + l.thickness_m * 100, 0);
    totalAreaM2 += area;
    weightedDepthCm += area * depthCm;
  });
  const avgDepthCm = weightedDepthCm / totalAreaM2;
  const retentionPercent = computeRetentionPercent(avgDepthCm);
  return { status: "ok", totalAreaM2, avgDepthCm, retentionPercent };
}

/** Purely geometric proxy for rooftop wind exposure — real wind-field simulation is the Revit-side AnalyzeWindErosionRiskCommand's job, not this. */
function analyzeWindExposure() {
  if (combineState.items.length === 0) return { status: "empty" };
  const roof = combineState.roof;
  const zoneM = getAnalysisParam("Wind Exposure", "edge_exposure_zone_m");
  const exposed = combineState.items.filter(it => edgeDistanceM(it, roof) < zoneM);
  return { status: "ok", exposedCount: exposed.length, totalCount: combineState.items.length, zoneM };
}

/** Embodied carbon of the layout (carbon.js: the one implementation, shared with the Design panel and mirrored by the add-in's LCA): pieces missing a material or its carbon figure are reported separately, never silently assumed zero. */
function analyzeLCA() {
  if (combineState.items.length === 0) return { status: "empty" };
  const { totalKg, coveredCount, missingCount, totalCount } = embodiedCarbon(combineState.items, analysisMaterialsCache);
  return { status: "ok", totalKg, coveredCount, missingCount, totalCount };
}

function edgeDistanceM(item, roof) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const distLeft = item.x_m;
  const distRight = roof.length - (item.x_m + fp.w);
  const distTop = item.y_m;
  const distBottom = roof.width - (item.y_m + fp.h);
  return Math.min(distLeft, distRight, distTop, distBottom);
}

/**
 * The quick estimates' cards. They use the same building blocks as the results of the Revit add-in (resCard/resTile/resBar/resFindings, analysisResults.js) and the same tone and chip words
 * (estimateSummary, resultsStoreCore.js: the overview's tile says exactly what the card says), and each says it is this app's own quick estimate. They are shown by resultsCardHtml
 * (analysisResults.js) under the analysis they estimate, when Revit has not sent its full analysis of it.
 */
function estimateCard(key, kind, r, sub, bodyFn) {
  const s = estimateSummary(kind, r);
  const title = resultsCatalogueEntry(key).title;
  if (s.tone === "none") return resCard({ key, source: "estimate", title, sub, tone: "neutral", chip: s.chip, body: `<p class="hint">${escapeHtml(s.note || "")}</p>` });
  return resCard({ key, source: "estimate", title, sub, tone: s.tone, chip: s.chip, body: bodyFn(r, s) });
}

function fireSafetyCardHtml() {
  return estimateCard("fire_safety", "fire", analyzeFireSafety(), "Travel-distance reference: MBO §35", r => {
    if (r.status === "fail") {
      const tiles = `<div class="res-tiles">${resTile("Unreachable pieces", String(r.unreachableCount), "of " + combineState.items.length, "bad")}</div>`;
      return tiles + resFindings([{ kind: "Recommendation", text: "Add or reposition an entry point so every piece has a walkable route to at least one." }]);
    }
    const tone = r.withinLimit ? "ok" : "warn";
    const barMax = Math.max(r.maxDist, r.maxTravelDistance) * 1.15;
    const bar = resBar("Longest route to an entry point", r.maxDist, barMax, { ref: r.maxTravelDistance, tone, text: `${r.maxDist.toFixed(1)} m / ${r.maxTravelDistance} m limit` });
    const rec = r.withinLimit ? "" : resFindings([{ kind: "Recommendation", text: `Shorten the longest route by ${(r.maxDist - r.maxTravelDistance).toFixed(1)} m — move the piece closer to an entry, or add another entry point nearby.` }]);
    return bar + rec;
  });
}

function accessibilityCardHtml() {
  return estimateCard("accessibility", "access", analyzeAccessibility(), "Wheelchair two-way passage reference", r => {
    const barMax = Math.max(r.currentWidth, r.minWidth) * 1.3;
    const bar = resBar("Circulation width", r.currentWidth, barMax, { ref: r.minWidth, tone: r.widthOk ? "ok" : "bad", text: `${r.currentWidth.toFixed(1)} m / ${r.minWidth} m reference` });
    const tiles = `<div class="res-tiles">${resTile("Every piece reachable", r.reachOk ? "Yes" : "No", "from an entry point", r.reachOk ? "ok" : "bad")}</div>`;
    const recs = [];
    if (!r.widthOk) recs.push({ kind: "Recommendation", text: `Widen circulation to at least ${r.minWidth} m for two-way wheelchair passage.` });
    if (!r.reachOk) recs.push({ kind: "Recommendation", text: "Add or move entry points so every piece is reachable." });
    return bar + tiles + resFindings(recs);
  });
}

function waterManagementCardHtml() {
  return estimateCard("soil_percolation", "water", analyzeWaterManagement(), "Quick estimate from the build-up depth. The rain events and the real layers are the full analysis in Revit", r => {
    const tiles = `<div class="res-tiles">
      ${resTile("Garden coverage", r.totalAreaM2.toFixed(1) + " m²")}
      ${resTile("Average buildup depth", r.avgDepthCm.toFixed(0) + " cm")}
    </div>`;
    const bar = resBar("Estimated rainfall retention", r.retentionPercent, 100, { tone: "neutral", text: r.retentionPercent + "%" });
    const note = resFindings([{ kind: "Note", text: "A rule of thumb from buildup depth alone, not a certified hydrology figure. Run the Soil Percolation analysis in Revit for real layers and rain events." }]);
    return tiles + bar + note;
  });
}

function windExposureCardHtml() {
  return estimateCard("wind_erosion", "wind", analyzeWindExposure(), "Geometric proxy: a real wind field needs Revit's Wind & Erosion analysis", r => {
    const tone = r.exposedCount > 0 ? "warn" : "ok";
    const tiles = `<div class="res-tiles">${resTile("In the exposure zone", `${r.exposedCount} / ${r.totalCount}`, `within ${r.zoneM} m of the roof edge`, tone)}</div>`;
    const bar = resBar("Pieces within the edge-exposure zone", r.exposedCount, r.totalCount, { tone, text: `${r.exposedCount} of ${r.totalCount}` });
    const rec = r.exposedCount > 0 ? resFindings([{ kind: "Recommendation", text: `Move exposed piece(s) at least ${r.zoneM} m from the roof edge where the layout allows, or run the Wind & Erosion analysis in Revit for real pressure and anchoring figures.` }]) : "";
    return tiles + bar + rec;
  });
}

function lcaCardHtml() {
  return estimateCard("lca", "lca", analyzeLCA(), "Embodied carbon of the picked reference materials (A1 to A3), illustrative", r => {
    if (r.coveredCount === 0) {
      return `<p class="hint">None of the ${r.totalCount} piece(s) have both a reference material picked and embodied-carbon data filled in yet.</p>`
        + resFindings([{ kind: "Recommendation", text: "Pick a reference material for each piece (Sport/Garden's \"Reference material (database)\" dropdown) and add missing embodied-carbon figures from the Data tab." }]);
    }
    const tone = r.missingCount > 0 ? "warn" : "ok";
    const tiles = `<div class="res-tiles">
      ${resTile("Embodied carbon", "~" + Math.round(r.totalKg).toLocaleString("en-US") + " kg", "CO2e, A1-A3, illustrative")}
      ${resTile("Pieces covered", `${r.coveredCount} / ${r.totalCount}`, r.missingCount ? `${r.missingCount} missing data` : "all covered", tone)}
    </div>`;
    const rec = r.missingCount > 0 ? resFindings([{ kind: "Recommendation", text: `Fill in missing reference materials or embodied-carbon figures for ${r.missingCount} piece(s) in the Data tab to complete this estimate.` }]) : "";
    return tiles + rec;
  });
}

/** The quick estimate each analysis has, by the name the catalogue gives it (resultsStoreCore.js). */
const ESTIMATE_CARDS = { fire: fireSafetyCardHtml, access: accessibilityCardHtml, water: waterManagementCardHtml, wind: windExposureCardHtml, lca: lcaCardHtml };

/**
 * ── Sun Path chart ──
 * The first prototype of "graphs the web app can do that Revit can't as
 * a simple 2D chart" (Revit's own sun tool only visualizes a path on the
 * 3D model) — feeds into the Revit Deliverables report as a PNG. Samples
 * getSunPosition() (sunPosition.js) across the day by handing it a
 * shallow siteState copy per time slice rather than mutating the real
 * siteState, since that function reads siteState.time internally.
 * Fixed, non-theme colors on purpose: this is meant to become a page in
 * a printed/embedded report, not something that should shift with the
 * live viewer's dark-mode preference. CSS custom properties (var(...))
 * also wouldn't resolve correctly once serialized out to a standalone
 * PNG anyway — a real constraint, not just a style choice.
 */
function sampleSunPathToday() {
  const samples = [];
  for (let totalMin = 4 * 60; totalMin <= 22 * 60; totalMin += 20) {
    const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const mm = String(totalMin % 60).padStart(2, "0");
    const sun = typeof getSunPosition === "function" ? getSunPosition({ ...siteState, time: `${hh}:${mm}` }) : null;
    if (sun) samples.push({ minutes: totalMin, altitudeDeg: sun.altitudeDeg });
  }
  return samples;
}

function buildSunPathSvg() {
  const samples = sampleSunPathToday();
  if (samples.length === 0) return null;

  const W = 640, H = 300, PAD_L = 42, PAD_R = 16, PAD_T = 16, PAD_B = 30;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const minMin = samples[0].minutes, maxMin = samples[samples.length - 1].minutes;
  const altitudes = samples.map(s => s.altitudeDeg);
  const minAlt = Math.min(-10, Math.floor(Math.min(...altitudes) / 10) * 10);
  const maxAlt = Math.max(10, Math.ceil(Math.max(...altitudes) / 10) * 10);
  const xFor = min => PAD_L + ((min - minMin) / (maxMin - minMin)) * plotW;
  const yFor = alt => PAD_T + (1 - (alt - minAlt) / (maxAlt - minAlt)) * plotH;

  let gridSvg = "";
  for (let h = Math.ceil(minMin / 120) * 2; h <= Math.floor(maxMin / 60); h += 2) {
    const x = xFor(h * 60);
    gridSvg += `<line x1="${x.toFixed(1)}" y1="${PAD_T}" x2="${x.toFixed(1)}" y2="${PAD_T + plotH}" stroke="#e2e2ea" stroke-width="1"/>`;
    gridSvg += `<text x="${x.toFixed(1)}" y="${H - 10}" font-size="10" fill="#8a8a9a" text-anchor="middle" font-family="Arial,sans-serif">${h}:00</text>`;
  }
  for (let a = minAlt; a <= maxAlt; a += 20) {
    const y = yFor(a);
    gridSvg += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${PAD_L + plotW}" y2="${y.toFixed(1)}" stroke="#e2e2ea" stroke-width="1"/>`;
    gridSvg += `<text x="${PAD_L - 8}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#8a8a9a" text-anchor="end" font-family="Arial,sans-serif">${a}°</text>`;
  }

  const pathD = samples.map((s, i) => `${i === 0 ? "M" : "L"}${xFor(s.minutes).toFixed(1)},${yFor(s.altitudeDeg).toFixed(1)}`).join(" ");
  const horizonY = yFor(0).toFixed(1);

  return `<svg id="sunPathSvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;display:block;background:#ffffff;border-radius:8px;">
    ${gridSvg}
    <line x1="${PAD_L}" y1="${horizonY}" x2="${PAD_L + plotW}" y2="${horizonY}" stroke="#e0664a" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${(PAD_L + plotW - 4).toFixed(1)}" y="${(Number(horizonY) - 6).toFixed(1)}" font-size="10" fill="#e0664a" text-anchor="end" font-family="Arial,sans-serif">horizon</text>
    <path d="${pathD}" fill="none" stroke="#1a1a2e" stroke-width="2.5"/>
  </svg>`;
}

function downloadSunPathPng() {
  const svgEl = document.getElementById("sunPathSvg");
  if (!svgEl) return;
  const svgString = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const scale = 2; // supersample so it isn't blurry once placed on a Revit sheet
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // the PNG needs an opaque background; the SVG itself has none
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      deliverFile("analysis", "sportify_sun_path.png", blob).then(r => {
        if (!r.kept) showToast("Chart downloaded", "sportify_sun_path.png");
      });
    }, "image/png");
  };
  img.onerror = () => showToast("Export failed", "Couldn't render the chart to an image.");
  img.src = url;
}

function sunPathSectionHtml() {
  const svg = buildSunPathSvg();
  if (!svg) {
    return `<div class="section span-2"><label>Sun Path <span class="mode-status available">Available now</span></label>
      <p class="hint">Set a site location on Combine's Site step first — this chart needs a real latitude/longitude to compute sun altitude.</p></div>`;
  }
  return `<div class="section span-2">
    <label>Sun Path — Today <span class="mode-status available">Available now</span></label>
    <p class="hint">Altitude across the day at the current site — a 2D analytical chart Revit's own sun tool doesn't offer (it only draws a path on the 3D model). Exports as a PNG for the Revit Deliverables report.</p>
    ${svg}
    <button class="btn-export accent" id="btn-download-sunpath" style="margin-top:8px">
      <i class="ti ti-file-download" aria-hidden="true"></i>Download Chart (PNG)
    </button>
  </div>`;
}

/* ── One piece: what the quick estimates say about it ──
 * Combine's inspector shows these live for the selected piece (resultsStore.js draws them, resultsStoreCore.js pieceSummary words them). Each function returns the numbers
 * and nothing else: `circulation` is the one drawCombineCanvas has just computed, so a drag does not run the routing twice.
 */

/** "field" -> "Field", "garden_bed" -> "Garden bed": the reference data's ids, said for people (compareController.js uses it too). */
function titleCase(s) {
  return typeof s === "string" && s.length ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—";
}

function pieceFireSafety(item, circulation) {
  if (combineState.entryPoints.length === 0) return { state: "no-entries" };
  const c = circulation || computeCirculation(combineState, DESIGN_RULES);
  if (c.unreachable.has(item.id)) return { state: "unreachable" };
  const path = c.paths.find(p => p.itemId === item.id);
  if (!path) return { state: "no-route" };
  return { state: "ok", lengthM: pathLengthM(path.points), limitM: getAnalysisParam("Fire Safety", "max_travel_distance_m") };
}

function pieceAccessibility(item, circulation) {
  const minWidth = getAnalysisParam("Accessibility", "min_circulation_width_m");
  const hasEntries = combineState.entryPoints.length > 0;
  const c = hasEntries ? (circulation || computeCirculation(combineState, DESIGN_RULES)) : null;
  return { hasEntries, reachable: c ? !c.unreachable.has(item.id) : false, widthOk: DESIGN_RULES.circulationWidth_m >= minWidth, currentWidth: DESIGN_RULES.circulationWidth_m, minWidth };
}

function pieceWater(item) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const theme = GARDEN_THEMES[item.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
  const depthCm = Object.values(theme.layers).reduce((sum, l) => sum + l.thickness_m * 100, 0);
  return { areaM2: fp.w * fp.h, depthCm, retentionPercent: computeRetentionPercent(depthCm) };
}

function pieceWind(item) {
  return { distM: edgeDistanceM(item, combineState.roof), zoneM: getAnalysisParam("Wind Exposure", "edge_exposure_zone_m") };
}

function pieceLca(item) {
  return pieceEmbodiedCarbon(item, analysisMaterialsCache);
}

/** The numbers of one analysis for one piece, by the catalogue's key (resultsStoreCore.js). */
function pieceAnalysisData(key, item, circulation) {
  if (key === "fire_safety") return pieceFireSafety(item, circulation);
  if (key === "accessibility") return pieceAccessibility(item, circulation);
  if (key === "soil_percolation") return pieceWater(item);
  if (key === "wind_erosion") return pieceWind(item);
  if (key === "lca") return pieceLca(item);
  return null;
}

/** The overview of the tab: one tile per analysis (resultsStore.js). Every group of the tab below it has the card behind each tile. */
function renderAnalysisContent() {
  const contentEl = document.getElementById("analysis-content");
  if (!contentEl) return;
  contentEl.innerHTML = typeof resultsOverviewHtml === "function" ? resultsOverviewHtml() : "";
  if (typeof resultsOverviewWire === "function") resultsOverviewWire(contentEl);
}

function updateAnalysisUI() {
  // The rail's other buttons (Safety, Garden, Structure, Sun, Sport, Other) show the card of each analysis: Revit's full analysis, else this app's quick estimate: analysisResults.js.
  if (typeof analysisSub !== "undefined" && analysisSub !== "overview" && typeof renderAnalysisResultsView === "function") {
    renderAnalysisResultsView();
    return;
  }
  if (typeof restoreAnalysisOverviewPanel === "function") restoreAnalysisOverviewPanel();
  renderAnalysisContent();
  if (typeof renderIterationsPanels === "function") renderIterationsPanels();
}
