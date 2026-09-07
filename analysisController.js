/**
 * analysisController.js — Analysis Tools tab
 * Early, approximate previews of checks the Revit add-in later runs at
 * full BIM fidelity — pure calculations against the current Combine
 * layout (circulation paths, garden theme data, roof geometry), no
 * physics or rendering. Mirrors dataTab.js's shape: compute, render a
 * card grid, no persistent state of its own beyond what's already in
 * combineState/DESIGN_RULES.
 */

const WHEELCHAIR_MIN_WIDTH_M = 1.5; // common reference figure for a two-way accessible route
const WIND_EXPOSURE_ZONE_M = 2.0;   // distance from the roof edge treated as elevated wind exposure

function pathLengthM(points) {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

/** Reuses the same circulation engine the Combine board's own rules checklist runs — never a second, disagreeing implementation. */
function analyzeFireSafety() {
  if (combineState.items.length === 0) return { status: "empty" };
  if (combineState.entryPoints.length === 0) return { status: "no-entries" };

  const circulation = computeCirculation(combineState, DESIGN_RULES);
  if (circulation.unreachable.size > 0) {
    return { status: "fail", unreachableCount: circulation.unreachable.size };
  }
  const distances = circulation.paths.map(p => pathLengthM(p.points));
  return { status: "ok", maxDist: distances.length ? Math.max(...distances) : 0 };
}

function analyzeAccessibility() {
  if (combineState.items.length === 0) return { status: "empty" };

  const widthOk = DESIGN_RULES.circulationWidth_m >= WHEELCHAIR_MIN_WIDTH_M;
  const circulation = computeCirculation(combineState, DESIGN_RULES);
  const reachOk = combineState.entryPoints.length > 0 && circulation.unreachable.size === 0;
  return { status: "ok", widthOk, reachOk, currentWidth: DESIGN_RULES.circulationWidth_m };
}

/**
 * Illustrative estimate, not a certified hydrology calculation: retention
 * scaling with total buildup depth is consistent with FLL guidance
 * (deeper substrate retains more), but the exact coefficient here is a
 * simple, clearly-approximate formula, not a cited coefficient table.
 */
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
  const retentionPercent = Math.min(90, Math.round(30 + avgDepthCm * 2));
  return { status: "ok", totalAreaM2, avgDepthCm, retentionPercent };
}

/** Purely geometric proxy for rooftop wind exposure — real wind-field simulation is the Revit-side AnalyzeWindErosionRiskCommand's job, not this. */
function analyzeWindExposure() {
  if (combineState.items.length === 0) return { status: "empty" };
  const roof = combineState.roof;
  const exposed = combineState.items.filter(it => {
    const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
    const distLeft = it.x_m;
    const distRight = roof.length - (it.x_m + fp.w);
    const distTop = it.y_m;
    const distBottom = roof.width - (it.y_m + fp.h);
    return Math.min(distLeft, distRight, distTop, distBottom) < WIND_EXPOSURE_ZONE_M;
  });
  return { status: "ok", exposedCount: exposed.length, totalCount: combineState.items.length };
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
    : `<p class="hint">Longest route from a piece to its nearest entry point: <strong>${r.maxDist.toFixed(1)} m</strong>.</p>`;
  return `<div class="section"><label>Fire Safety <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function accessibilityCardHtml() {
  const r = analyzeAccessibility();
  const empty = emptyCardBody(r.status);
  const body = empty ? empty : `
    <p class="hint">${r.widthOk ? "✅" : "⚠️"} Circulation width set to ${r.currentWidth.toFixed(1)} m (wheelchair two-way reference: ${WHEELCHAIR_MIN_WIDTH_M} m).</p>
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
    <p class="hint">${r.exposedCount} of ${r.totalCount} piece(s) sit within ${WIND_EXPOSURE_ZONE_M} m of the roof edge — the zone with the highest rooftop wind exposure.</p>`;
  return `<div class="section"><label>Wind Exposure <span class="mode-status available">Available now</span></label>${body}</div>`;
}

function lcaCardHtml() {
  return `<div class="section"><label>LCA Estimate <span class="mode-status vision">Coming soon</span></label>
    <p class="hint">Needs embodied-carbon coefficients per material, which aren't in the reference database yet — see the Data tab's Materials list.</p></div>`;
}

function renderAnalysisContent() {
  const contentEl = document.getElementById("analysis-content");
  if (!contentEl) return;
  contentEl.innerHTML = `<div class="step-grid">
    ${fireSafetyCardHtml()}
    ${accessibilityCardHtml()}
    ${waterManagementCardHtml()}
    ${windExposureCardHtml()}
    ${lcaCardHtml()}
  </div>`;
}

function updateAnalysisUI() {
  renderAnalysisContent();
}
