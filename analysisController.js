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

const WHEELCHAIR_MIN_WIDTH_M = 1.5; // common reference figure for a two-way accessible route
const WIND_EXPOSURE_ZONE_M = 2.0;   // distance from the roof edge treated as elevated wind exposure

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
  const exposed = combineState.items.filter(it => edgeDistanceM(it, roof) < WIND_EXPOSURE_ZONE_M);
  return { status: "ok", exposedCount: exposed.length, totalCount: combineState.items.length };
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

/** Activity items currently export empty sourceJson (buildActivityPayload() isn't defined yet — see Ali's PDF item), so fall back to looking the label up in the reference data directly. */
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
    const meta = findActivityMeta(item.label);
    relevance = meta ? `${titleCase(meta.category)} — ${meta.norm}` : "Not available yet (buildActivityPayload() isn't wired up)";
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
      <p class="hint"><strong>Gradin type:</strong> ${m.gradin_type || "—"}</p>`;
  }
  if (item.kind === "garden" && item.sourceJson?.garden) {
    const g = item.sourceJson.garden;
    const layers = (g.layers || []).map(l => `
      <div class="dim-card"><div class="val">${(l.thickness_m * 100).toFixed(0)} cm</div><div class="lbl">${titleCase(l.layer_name)} — ${l.material}</div></div>
    `).join("");
    return `
      <p class="hint"><strong>Waterproofing:</strong> ${g.materials?.waterproofing || "—"}</p>
      <p class="hint"><strong>Drainage:</strong> ${g.materials?.drainage || "—"}</p>
      <div class="dims" style="grid-template-columns:1fr;margin-top:6px;">${layers}</div>`;
  }
  return `<p class="hint">Not available yet — activity pieces don't export material data (see Ali's PDF item on buildActivityPayload()).</p>`;
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
  const widthOk = DESIGN_RULES.circulationWidth_m >= WHEELCHAIR_MIN_WIDTH_M;
  const circulation = combineState.entryPoints.length > 0 ? computeCirculation(combineState, DESIGN_RULES) : null;
  const reachable = circulation ? !circulation.unreachable.has(item.id) : false;
  return `
    <p class="hint">${widthOk ? "✅" : "⚠️"} Circulation width set to ${DESIGN_RULES.circulationWidth_m.toFixed(1)} m (wheelchair two-way reference: ${WHEELCHAIR_MIN_WIDTH_M} m) — a layout-wide setting, not per-piece.</p>
    <p class="hint">${reachable ? "✅ This piece has a walkable route from an entry point." : "⚠️ Not reachable from an entry point yet."}</p>`;
}

function waterManagementDetailHtml(item) {
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const area = fp.w * fp.h;
  const theme = GARDEN_THEMES[item.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
  const depthCm = Object.values(theme.layers).reduce((sum, l) => sum + l.thickness_m * 100, 0);
  const retentionPercent = Math.min(90, Math.round(30 + depthCm * 2));
  return `
    <p class="hint">${area.toFixed(1)} m², ${depthCm.toFixed(0)} cm buildup depth.</p>
    <p class="hint">Estimated rainfall retention: <strong>~${retentionPercent}%</strong> (illustrative — not a certified hydrology figure).</p>`;
}

function windExposureDetailHtml(item) {
  const dist = edgeDistanceM(item, combineState.roof);
  const exposed = dist < WIND_EXPOSURE_ZONE_M;
  if (dist < 0) return `<p class="hint">⚠️ This piece extends past the roof boundary — resize or move it before this check means anything.</p>`;
  return `<p class="hint">${exposed ? "⚠️" : "✅"} ${dist.toFixed(1)} m from the nearest roof edge${exposed ? ` — inside the ${WIND_EXPOSURE_ZONE_M} m elevated-exposure zone.` : "."}</p>`;
}

function lcaDetailHtml(item) {
  const materialNames = item.kind === "field"
    ? [item.sourceJson?.materials?.floor_surface, item.sourceJson?.materials?.line_marking, item.sourceJson?.materials?.gradin_type].filter(Boolean)
    : item.kind === "garden"
    ? [item.sourceJson?.garden?.materials?.waterproofing, item.sourceJson?.garden?.materials?.drainage, ...(item.sourceJson?.garden?.layers || []).map(l => l.material)].filter(Boolean)
    : [];
  return `
    <p class="hint">Needs embodied-carbon coefficients per material, which aren't in the reference database yet.</p>
    ${materialNames.length ? `<p class="hint"><strong>Would assess:</strong> ${materialNames.join(", ")}.</p>` : ""}`;
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
  sections.push({ icon: "ti-recycle", title: "LCA", badge: "soon", html: lcaDetailHtml(item) });
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
}

function updateAnalysisUI() {
  renderAnalysisContent();
}
