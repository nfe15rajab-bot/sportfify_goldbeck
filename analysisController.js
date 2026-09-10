/**
 * analysisController.js — Analysis Tools tab
 * Early, approximate previews of checks the Revit add-in later runs at
 * full BIM fidelity — pure calculations against the current Combine
 * layout (circulation paths, garden theme data, roof geometry), no
 * physics or rendering. Two parts: a layout-wide summary (5 cards, same
 * as before) and a per-component explorer below it — click a pushed
 * piece on the left, see its own parameters/analysis breakdown on the
 * right, organized the same way a BIM family's properties would be.
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
  if (activeMode === "analysis" && typeof updateAnalysisUI === "function") updateAnalysisUI();
}
initAnalysisReferenceData();

/** The reference material a piece was pushed with (Sport/Garden's "Reference material (database)" dropdown) — the LCA lookup key. Null if the piece was pushed before that field existed, or manual text was typed that isn't a real catalog name. */
function getReferenceMaterialName(item) {
  if (item.kind === "field") return item.sourceJson?.materials?.reference_material || null;
  if (item.kind === "garden") return item.sourceJson?.garden?.materials?.reference_material || null;
  return null;
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

/** Sums embodied carbon (area × material's kg CO2e/m²) across every piece with both a picked reference material and that material's carbon figure filled in — pieces missing either are reported separately, never silently assumed zero. */
function analyzeLCA() {
  if (combineState.items.length === 0) return { status: "empty" };
  let totalKg = 0, coveredCount = 0;
  combineState.items.forEach(it => {
    const matName = getReferenceMaterialName(it);
    const material = matName ? analysisMaterialsCache.find(m => m.name === matName) : null;
    if (material && material.embodiedCarbonValue != null) {
      const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
      totalKg += material.embodiedCarbonValue * fp.w * fp.h;
      coveredCount++;
    }
  });
  return { status: "ok", totalKg, coveredCount, missingCount: combineState.items.length - coveredCount, totalCount: combineState.items.length };
}

function edgeDistanceM(item, roof) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const distLeft = item.x_m;
  const distRight = roof.length - (item.x_m + fp.w);
  const distTop = item.y_m;
  const distBottom = roof.width - (item.y_m + fp.h);
  return Math.min(distLeft, distRight, distTop, distBottom);
}

function emptyCardBody(status) {
  if (status === "empty") return `<p class="hint">Push a sport, activity, or garden piece to Combine to check this.</p>`;
  if (status === "no-entries") return `<p class="hint">Add an entry point on the Combine board to check this.</p>`;
  return null;
}

function fireSafetyCardHtml() {
  const r = analyzeFireSafety();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty
    : r.status === "fail" ? `<p class="hint">⚠️ ${r.unreachableCount} piece(s) have no walkable route to any entry point at all.</p>`
    : `<p class="hint">${r.withinLimit ? "✅" : "⚠️"} Longest route from a piece to its nearest entry point: <strong>${r.maxDist.toFixed(1)} m</strong> (max. travel distance reference: ${r.maxTravelDistance} m, MBO §35).</p>`;
  return `<div class="section"><label>Fire Safety <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function accessibilityCardHtml() {
  const r = analyzeAccessibility();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty : `
    <p class="hint">${r.widthOk ? "✅" : "⚠️"} Circulation width set to ${r.currentWidth.toFixed(1)} m (wheelchair two-way reference: ${r.minWidth} m).</p>
    <p class="hint">${r.reachOk ? "✅ Every piece has a walkable route from an entry point." : "⚠️ Not every piece is reachable — add or move entry points."}</p>`;
  return `<div class="section"><label>Accessibility <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function waterManagementCardHtml() {
  const r = analyzeWaterManagement();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty : `
    <p class="hint">${r.totalAreaM2.toFixed(1)} m² of garden coverage, ${r.avgDepthCm.toFixed(0)} cm average buildup depth.</p>
    <p class="hint">Estimated rainfall retention: <strong>~${r.retentionPercent}%</strong> (illustrative — not a certified hydrology figure).</p>`;
  return `<div class="section"><label>Water Management <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function windExposureCardHtml() {
  const r = analyzeWindExposure();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty : `
    <p class="hint">${r.exposedCount} of ${r.totalCount} piece(s) sit within ${r.zoneM} m of the roof edge — the zone with the highest rooftop wind exposure.</p>`;
  return `<div class="section"><label>Wind Exposure <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function lcaCardHtml() {
  const r = analyzeLCA();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty
    : r.coveredCount === 0
    ? `<p class="hint">None of the ${r.totalCount} piece(s) have both a reference material picked (Sport/Garden's "Reference material (database)" dropdown) and embodied-carbon data filled in yet.</p>
       <p class="hint">Add missing embodied-carbon figures from the Data tab's Materials edit form.</p>`
    : `<p class="hint">Estimated embodied carbon: <strong>~${Math.round(r.totalKg).toLocaleString("en-US")} kg CO2e</strong> (A1-A3, illustrative) across ${r.coveredCount} of ${r.totalCount} piece(s).</p>
       ${r.missingCount ? `<p class="hint">${r.missingCount} piece(s) excluded — no reference material picked, or that material has no embodied-carbon figure yet. Fill gaps in from the Data tab.</p>` : ""}`;
  return `<div class="section"><label>LCA Estimate <span class="mode-status available">Available now</span></label>${body}</div>`;
}

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

  return `<svg id="sunPathSvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#ffffff;border-radius:8px;">
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sportify_sun_path.png";
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Chart downloaded", "sportify_sun_path.png — pick this file in Revit's Generate Analysis Report command.");
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

/* ── Per-component explorer ──
 * Left: one clickable card per pushed piece. Right: that piece's own
 * parameters, organized into the same section taxonomy a BIM family's
 * properties would use — General, Providers & Materials, then each
 * relevant analysis, each shown only when it actually applies to this
 * item's kind (no manual toggle needed: a garden item just never shows
 * a Water Management section irrelevant to a sport piece, and vice
 * versa) since the item's own kind already determines what's relevant.
 */

let selectedComponentId = null;

const KIND_LABELS = { field: "Sport Field", activity: "Activity", garden: "Garden" };
const KIND_ICONS = { field: "ti-square-rounded", activity: "ti-run", garden: "ti-leaf" };

/** Fallback for activity pieces pushed before buildActivityPayload() existed (empty sourceJson) — looks the label up in the reference data directly instead. */
function findActivityMeta(label) {
  if (typeof ACTIVITIES !== "object") return null;
  return Object.values(ACTIVITIES).find(a => a.label === label) || null;
}

function titleCase(s) {
  return typeof s === "string" && s.length ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—";
}

function componentListItemHtml(item) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const active = item.id === selectedComponentId ? " active" : "";
  return `
    <button class="analysis-component-item${active}" data-component-id="${item.id}">
      <i class="ti ${KIND_ICONS[item.kind] || "ti-square-rounded"}" aria-hidden="true"></i>
      <span class="analysis-component-item-text">
        <span class="analysis-component-item-label">${item.label}</span>
        <span class="analysis-component-item-dims">${fp.w.toFixed(1)} × ${fp.h.toFixed(1)} m</span>
      </span>
    </button>`;
}

function detailSectionHtml(icon, title, badgeHtml, bodyHtml) {
  return `
    <div class="analysis-detail-section">
      <div class="analysis-detail-section-head">
        <i class="ti ${icon}" aria-hidden="true"></i>
        <label>${title}</label>
        ${badgeHtml || ""}
      </div>
      ${bodyHtml}
    </div>`;
}

function generalSectionHtml(item) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  let relevance = "—";
  let quality = "—";

  if (item.kind === "field" && item.sourceJson?.field) {
    relevance = `${titleCase(item.sourceJson.field.sport)} — ${item.sourceJson.field.norm || "—"}`;
    quality = titleCase(item.sourceJson.materials?.quality_level);
  } else if (item.kind === "garden" && item.sourceJson?.garden) {
    const g = item.sourceJson.garden;
    relevance = `${titleCase(g.type_id)} — ${titleCase(g.theme)} (${titleCase(g.category)})`;
    quality = titleCase(g.materials?.quality_level);
  } else if (item.kind === "activity") {
    if (item.sourceJson?.activity) {
      const a = item.sourceJson.activity;
      relevance = `${titleCase(a.category)} — ${a.norm}`;
      quality = titleCase(item.sourceJson.materials?.quality_level);
    } else {
      // Pieces pushed before buildActivityPayload() existed have no
      // sourceJson.activity to read — fall back to the reference data.
      const meta = findActivityMeta(item.label);
      relevance = meta ? `${titleCase(meta.category)} — ${meta.norm}` : "—";
    }
  }

  return `
    <div class="dims" style="grid-template-columns:repeat(2,1fr);">
      <div class="dim-card"><div class="val">${fp.w.toFixed(1)} × ${fp.h.toFixed(1)} m</div><div class="lbl">Dimensions</div></div>
      <div class="dim-card"><div class="val">${KIND_LABELS[item.kind] || item.kind}</div><div class="lbl">Kind</div></div>
    </div>
    <p class="hint" style="margin-top:8px"><strong>Field of relevance:</strong> ${relevance}</p>
    <p class="hint"><strong>Overall quality:</strong> ${quality}</p>`;
}

function materialsSectionHtml(item) {
  if (item.kind === "field" && item.sourceJson?.materials) {
    const m = item.sourceJson.materials;
    return `
      <p class="hint"><strong>Floor surface:</strong> ${m.floor_surface || "—"}</p>
      <p class="hint"><strong>Line marking:</strong> ${m.line_marking || "—"}</p>
      <p class="hint"><strong>Gradin type:</strong> ${m.gradin_type || "—"}</p>
      <p class="hint"><strong>Reference material:</strong> ${m.reference_material || "— none picked"}</p>
      <p class="hint"><strong>Reference provider:</strong> ${m.reference_provider || "— none picked"}</p>`;
  }
  if (item.kind === "garden" && item.sourceJson?.garden) {
    const g = item.sourceJson.garden;
    const layers = (g.layers || []).map(l => `
      <div class="dim-card"><div class="val">${(l.thickness_m * 100).toFixed(0)} cm</div><div class="lbl">${titleCase(l.layer_name)} — ${l.material}</div></div>
    `).join("");
    return `
      <p class="hint"><strong>Waterproofing:</strong> ${g.materials?.waterproofing || "—"}</p>
      <p class="hint"><strong>Drainage:</strong> ${g.materials?.drainage || "—"}</p>
      <p class="hint"><strong>Reference material:</strong> ${g.materials?.reference_material || "— none picked"}</p>
      <p class="hint"><strong>Reference provider:</strong> ${g.materials?.reference_provider || "— none picked"}</p>
      <div class="dims" style="grid-template-columns:1fr;margin-top:6px;">${layers}</div>`;
  }
  if (item.kind === "activity" && item.sourceJson?.materials) {
    const m = item.sourceJson.materials;
    return `
      <p class="hint"><strong>Surface:</strong> ${m.surface || "—"}</p>
      <p class="hint"><strong>Structure:</strong> ${m.structure || "—"}</p>
      <p class="hint"><strong>Reference material:</strong> ${m.reference_material || "— none picked"}</p>
      <p class="hint"><strong>Reference provider:</strong> ${m.reference_provider || "— none picked"}</p>`;
  }
  return `<p class="hint">No material data available for this piece — it was likely pushed before buildActivityPayload() existed. Push it again to pick up real data.</p>`;
}

function fireSafetyDetailHtml(item) {
  if (combineState.entryPoints.length === 0) return `<p class="hint">Add an entry point on the Combine board to check this.</p>`;
  const circulation = computeCirculation(combineState, DESIGN_RULES);
  if (circulation.unreachable.has(item.id)) {
    return `<p class="hint">⚠️ No walkable route to any entry point at all.</p>`;
  }
  const path = circulation.paths.find(p => p.itemId === item.id);
  if (!path) return `<p class="hint">No route computed yet — try recalculating (add/move an item or entry point).</p>`;
  return `<p class="hint">Route to nearest entry point: <strong>${pathLengthM(path.points).toFixed(1)} m</strong>.</p>`;
}

function accessibilityDetailHtml(item) {
  const minWidth = getAnalysisParam("Accessibility", "min_circulation_width_m");
  const widthOk = DESIGN_RULES.circulationWidth_m >= minWidth;
  const circulation = combineState.entryPoints.length > 0 ? computeCirculation(combineState, DESIGN_RULES) : null;
  const reachable = circulation ? !circulation.unreachable.has(item.id) : false;
  return `
    <p class="hint">${widthOk ? "✅" : "⚠️"} Circulation width set to ${DESIGN_RULES.circulationWidth_m.toFixed(1)} m (wheelchair two-way reference: ${minWidth} m) — a layout-wide setting, not per-piece.</p>
    <p class="hint">${reachable ? "✅ This piece has a walkable route from an entry point." : "⚠️ Not reachable from an entry point yet."}</p>`;
}

function waterManagementDetailHtml(item) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const area = fp.w * fp.h;
  const theme = GARDEN_THEMES[item.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
  const depthCm = Object.values(theme.layers).reduce((sum, l) => sum + l.thickness_m * 100, 0);
  const retentionPercent = computeRetentionPercent(depthCm);
  return `
    <p class="hint">${area.toFixed(1)} m², ${depthCm.toFixed(0)} cm buildup depth.</p>
    <p class="hint">Estimated rainfall retention: <strong>~${retentionPercent}%</strong> (illustrative — not a certified hydrology figure).</p>`;
}

function windExposureDetailHtml(item) {
  const zoneM = getAnalysisParam("Wind Exposure", "edge_exposure_zone_m");
  const dist = edgeDistanceM(item, combineState.roof);
  const exposed = dist < zoneM;
  if (dist < 0) return `<p class="hint">⚠️ This piece extends past the roof boundary — resize or move it before this check means anything.</p>`;
  return `<p class="hint">${exposed ? "⚠️" : "✅"} ${dist.toFixed(1)} m from the nearest roof edge${exposed ? ` — inside the ${zoneM} m elevated-exposure zone.` : "."}</p>`;
}

function lcaDetailHtml(item) {
  const matName = getReferenceMaterialName(item);
  if (!matName) {
    return `<p class="hint">No reference material selected for this piece — pick one from the "Reference material (database)" dropdown in Sport/Garden mode to enable this.</p>`;
  }
  const material = analysisMaterialsCache.find(m => m.name === matName);
  if (!material) {
    return `<p class="hint"><strong>Reference material:</strong> ${matName}</p><p class="hint">Not found in the database (likely typed as manual text) — no embodied-carbon figure to look up.</p>`;
  }
  if (material.embodiedCarbonValue == null) {
    return `<p class="hint"><strong>Reference material:</strong> ${matName}</p><p class="hint">⚠️ No embodied-carbon figure yet for this material — add one from the Data tab's Materials edit form.</p>`;
  }
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const area = fp.w * fp.h;
  const total = material.embodiedCarbonValue * area;
  return `
    <p class="hint"><strong>Reference material:</strong> ${matName}</p>
    <p class="hint">${area.toFixed(1)} m² × ${material.embodiedCarbonValue} ${material.embodiedCarbonUnit} = <strong>~${total.toFixed(0)} kg CO2e</strong> (A1-A3, illustrative).</p>
    <p class="hint">${material.embodiedCarbonSource || ""}</p>`;
}

/** Which sections apply to which item kind — the "toggle" the user asked for: automatic per selected item, not a manual switch, since the item's own kind already determines what's relevant. */
function componentSections(item) {
  const sections = [
    { icon: "ti-info-circle", title: "General", html: generalSectionHtml(item) },
    { icon: "ti-package", title: "Providers & Materials", html: materialsSectionHtml(item) },
    { icon: "ti-flame", title: "Fire Safety", badge: "available", html: fireSafetyDetailHtml(item) },
    { icon: "ti-wheelchair", title: "Accessibility", badge: "available", html: accessibilityDetailHtml(item) },
  ];
  if (item.kind === "garden") {
    sections.push({ icon: "ti-droplet", title: "Water Management", badge: "available", html: waterManagementDetailHtml(item) });
  }
  sections.push({ icon: "ti-wind", title: "Wind Exposure", badge: "available", html: windExposureDetailHtml(item) });
  sections.push({ icon: "ti-recycle", title: "LCA", badge: "available", html: lcaDetailHtml(item) });
  return sections;
}

function componentDetailHtml(item) {
  const badgeHtml = b => b === "available" ? `<span class="mode-status available">Available now</span>` : b === "soon" ? `<span class="mode-status vision">Coming soon</span>` : "";
  const sections = componentSections(item).map(s => detailSectionHtml(s.icon, s.title, badgeHtml(s.badge), s.html)).join("");
  return `
    <div class="analysis-component-detail-head">
      <i class="ti ${KIND_ICONS[item.kind] || "ti-square-rounded"}" aria-hidden="true"></i>
      <div>
        <div class="analysis-component-detail-title">${item.label}</div>
        <div class="hint">${KIND_LABELS[item.kind] || item.kind} — parameters below are exactly what gets sent to Revit for family placement and deeper analysis.</div>
      </div>
    </div>
    <div class="analysis-detail-sections">${sections}</div>`;
}

function renderComponentExplorer() {
  const listEl = document.getElementById("analysis-component-list");
  const detailEl = document.getElementById("analysis-component-detail");
  if (!listEl || !detailEl) return;

  if (combineState.items.length === 0) {
    listEl.innerHTML = `<p class="hint" style="padding:10px 14px;">Nothing pushed to Combine yet.</p>`;
    detailEl.innerHTML = `<p class="hint" style="padding:10px 14px;">Push a sport, activity, or garden piece to see its parameters here.</p>`;
    return;
  }

  if (!combineState.items.some(it => it.id === selectedComponentId)) {
    selectedComponentId = combineState.items[0].id;
  }

  listEl.innerHTML = combineState.items.map(componentListItemHtml).join("");
  const selected = combineState.items.find(it => it.id === selectedComponentId);
  detailEl.innerHTML = componentDetailHtml(selected);

  listEl.querySelectorAll(".analysis-component-item").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedComponentId = btn.dataset.componentId;
      renderComponentExplorer();
    });
  });
}

function renderAnalysisContent() {
  const contentEl = document.getElementById("analysis-content");
  if (!contentEl) return;
  contentEl.innerHTML = `
    <div class="step-grid">
      ${fireSafetyCardHtml()}
      ${accessibilityCardHtml()}
      ${waterManagementCardHtml()}
      ${windExposureCardHtml()}
      ${lcaCardHtml()}
    </div>
    <div class="step-grid">
      ${sunPathSectionHtml()}
    </div>
    <div class="analysis-components-heading">
      <i class="ti ti-list-details" aria-hidden="true"></i>
      <span>Component Details</span>
      <span class="hint">Click a pushed piece to see its own parameters — the same data Revit uses for family placement.</span>
    </div>
    <div class="analysis-components">
      <div class="analysis-component-list" id="analysis-component-list"></div>
      <div class="analysis-component-detail" id="analysis-component-detail"></div>
    </div>`;
  renderComponentExplorer();
  document.getElementById("btn-download-sunpath")?.addEventListener("click", downloadSunPathPng);
}

function updateAnalysisUI() {
  renderAnalysisContent();
}
