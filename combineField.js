/**
 * combineField.js — Sportify Combine canvas renderer + interaction
 * Draws a roof boundary and lets the user drag/rotate any number of
 * pushed pieces (sport fields, activities, garden parcels) inside it —
 * a Y8/JeuxJeuxJeux-style drag-and-drop board. Every "Push to Combine"
 * adds a new independent piece; nothing gets overwritten.
 */

const CVW = 600, CVH = 400, CPAD = 40;
const SNAP_GRID_M = 0.5;

let dragState = null; // { kind: "item"|"entry", id, startPtX, startPtY, startXm, startYm, scale }

function snapToGrid(v) { return Math.round(v / SNAP_GRID_M) * SNAP_GRID_M; }

/** Faint 0.5m reference grid across the whole roof rectangle — the same plain (0,0)-(length,width) box placement/packing already works against, not the visual boundary polygon. Purely visual; snapToGrid() is what actually snaps drags. */
function snapGridSvg(roof, scale, roofOx, roofOy) {
  let lines = "";
  for (let x = SNAP_GRID_M; x < roof.length; x += SNAP_GRID_M) {
    const px = roofOx + x * scale;
    lines += `<line x1="${px}" y1="${roofOy}" x2="${px}" y2="${roofOy + roof.width * scale}"/>`;
  }
  for (let y = SNAP_GRID_M; y < roof.width; y += SNAP_GRID_M) {
    const py = roofOy + y * scale;
    lines += `<line x1="${roofOx}" y1="${py}" x2="${roofOx + roof.length * scale}" y2="${py}"/>`;
  }
  return `<g class="snap-grid">${lines}</g>`;
}

const KIND_COLORS = {
  field:    { stroke: "#3d6fff", fill: "rgba(61,111,255,0.35)" },
  activity: { stroke: "#9c4fe0", fill: "rgba(156,79,224,0.32)" },
  garden:   { stroke: "#0ea355", fill: "rgba(14,163,85,0.35)" },
};

/** Returns the on-canvas (possibly rotated) footprint size in meters. */
function getFootprint(obj) {
  const rotated = (obj.rotation % 180) !== 0;
  return {
    w: rotated ? obj.width_m : obj.length_m,
    h: rotated ? obj.length_m : obj.width_m,
  };
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * View-only zoom/pan for the Combine canvas — deliberately NOT part of
 * combineState: it's a per-viewer camera setting, not layout data, so it
 * never gets saved/exported/compared and never desyncs a loaded session
 * from what it looked like when saved.
 */
let combineView = { zoom: 1, panX: 0, panY: 0 };
const COMBINE_ZOOM_MIN = 0.5, COMBINE_ZOOM_MAX = 6;

function resetCombineView() {
  combineView = { zoom: 1, panX: 0, panY: 0 };
}

function combineLayout() {
  const roof = combineState.roof;
  const availW = CVW - CPAD * 2;
  const availH = CVH - CPAD * 2 - 30; // room for the title line up top
  const fitScale = Math.min(availW / roof.length, availH / roof.width);
  const scale = fitScale * combineView.zoom;
  const roofPxW = roof.length * scale;
  const roofPxH = roof.width * scale;
  const roofOx = (CVW - roofPxW) / 2 + combineView.panX;
  const roofOy = 40 + (availH - roofPxH) / 2 + combineView.panY;
  return { scale, roofPxW, roofPxH, roofOx, roofOy, fitScale };
}

/**
 * Zooms by `factor` (>1 in, <1 out) while keeping whatever roof point is
 * under (clientX, clientY) fixed on screen — the standard "zoom to
 * cursor" feel, not just zooming around the canvas center.
 */
function zoomCombineView(factor, clientX, clientY, svg) {
  const before = combineLayout();
  const cursor = svgPoint(svg, { clientX, clientY });
  const meterX = (cursor.x - before.roofOx) / before.scale;
  const meterY = (cursor.y - before.roofOy) / before.scale;

  combineView.zoom = clamp(combineView.zoom * factor, COMBINE_ZOOM_MIN, COMBINE_ZOOM_MAX);

  const availW = CVW - CPAD * 2;
  const availH = CVH - CPAD * 2 - 30;
  const scale = before.fitScale * combineView.zoom;
  const roofPxW = combineState.roof.length * scale, roofPxH = combineState.roof.width * scale;
  const baseOx = (CVW - roofPxW) / 2, baseOy = 40 + (availH - roofPxH) / 2;
  // Solve for the pan that keeps (meterX, meterY) under the same screen point.
  combineView.panX = cursor.x - baseOx - meterX * scale;
  combineView.panY = cursor.y - baseOy - meterY * scale;

  drawCombineCanvas();
}

/**
 * Draws the roof boundary itself. If combineState.roof.boundary holds an
 * exact polygon (from PushRoofBoundaryCommand's sketch extraction), draws
 * that shape. Otherwise falls back to a plain rectangle sized from
 * roof.length / roof.width (bounding box only — no sketch was available).
 */
function roofShapeSvg(roof, scale, roofOx, roofOy, roofPxW, roofPxH) {
  if (roof.boundary && roof.boundary.length >= 3) {
    // Revit's internal Y-axis increases "north" (up), but SVG's Y-axis
    // increases downward — without flipping, the imported shape renders
    // upside-down relative to its true plan orientation. Flipping against
    // the boundary's own height (roof.width) puts north back at the top.
    const pts = roof.boundary
      .map(p => `${roofOx + p.x_m * scale},${roofOy + (roof.width - p.y_m) * scale}`)
      .join(" ");
    return `<polygon points="${pts}" fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }
  return `<rect x="${roofOx}" y="${roofOy}" width="${roofPxW}" height="${roofPxH}"
                fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>`;
}

/**
 * Finds every pair of items whose (optionally buffered) bounding boxes
 * overlap. Returns a Set of item ids involved in at least one overlap.
 * Passing bufferM (e.g. DESIGN_RULES.clearance_m) turns this into a
 * "too close" check rather than a strict intersection test — the same
 * rectsOverlap test just runs against boxes grown by half the buffer.
 */
function findOverlappingIds(items, bufferM = 0) {
  const overlapping = new Set();
  const half = bufferM / 2;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const aFp = getFootprint(a);
    const aBox = { x: a.x_m - half, y: a.y_m - half, w: aFp.w + bufferM, h: aFp.h + bufferM };
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const bFp = getFootprint(b);
      const bBox = { x: b.x_m - half, y: b.y_m - half, w: bFp.w + bufferM, h: bFp.h + bufferM };
      if (rectsOverlap(aBox, bBox)) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

/** Dashed inset rectangle showing the boundary-setback margin from the rules panel. */
function setbackGuideSvg(roof, scale, roofOx, roofOy) {
  const sb = Math.min(DESIGN_RULES.boundarySetback_m, roof.length / 2 - 0.05, roof.width / 2 - 0.05);
  if (sb <= 0) return "";
  const x = roofOx + sb * scale, y = roofOy + sb * scale;
  const w = (roof.length - sb * 2) * scale, h = (roof.width - sb * 2) * scale;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#bbb" stroke-width="1" stroke-dasharray="2,4" opacity="0.6"/>`;
}

let entryCounter = 0;

/** Keeps the "Add Entry Point" button + hint text in sync with combineState.tool. */
function syncAddEntryTool() {
  const btn = document.getElementById("btn-add-entry");
  const hint = document.getElementById("add-entry-hint");
  if (!btn || !hint) return;
  const active = combineState.tool === "addEntry";
  btn.classList.toggle("active", active);
  hint.style.display = active ? "block" : "none";
}

/** Snaps a click (in roof-rectangle meters) to the nearest site edge and stores it as a new entry point. */
function addEntryPoint(xm, ym) {
  const snap = nearestBoundaryPoint(combineState.roof, xm, ym);
  const ep = { id: `entry_${Date.now()}_${entryCounter++}`, edge: snap.edge, x_m: snap.x, y_m: snap.y };
  combineState.entryPoints.push(ep);
  combineState.selectedKind = "entry";
  combineState.selectedId = ep.id;
  drawCombineCanvas();
  if (typeof showToast === "function") {
    showToast("Entrance added", `Entry point ${combineState.entryPoints.length} placed on the ${snap.edge} edge.`);
  }
  if (typeof refreshSuggestions === "function") refreshSuggestions();
}

function drawCombineCanvas() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;
  const roof = combineState.roof;
  const items = combineState.items;
  const entries = combineState.entryPoints;
  const { scale, roofPxW, roofPxH, roofOx, roofOy } = combineLayout();

  let el = `
    <text x="${CVW / 2}" y="24" text-anchor="middle" font-size="12"
          font-family="'Titillium Web', Arial, sans-serif" fill="#444">
      Roof boundary — ${roof.length} m × ${roof.width} m
    </text>
    ${roofShapeSvg(roof, scale, roofOx, roofOy, roofPxW, roofPxH)}
    ${snapGridSvg(roof, scale, roofOx, roofOy)}
    ${setbackGuideSvg(roof, scale, roofOx, roofOy)}
  `;

  // These two are the expensive-ish operations (grid build + BFS), so run
  // them once per redraw and hand the results to both the SVG and the
  // rules checklist rather than recomputing per consumer.
  const overlappingIds = findOverlappingIds(items, DESIGN_RULES.clearance_m);
  const circulation = computeCirculation(combineState, DESIGN_RULES);
  const outOfBoundsIds = findOutOfBoundsIds(items, roof);
  const anyOutOfBounds = outOfBoundsIds.size > 0;
  const zoneConflicts = findZoneConflicts(items, DESIGN_RULES);

  // Circulation paths draw under the pieces so labels stay readable.
  circulation.paths.forEach(p => {
    if (p.points.length < 2) return;
    const d = p.points.map((pt, i) => `${i === 0 ? "M" : "L"}${roofOx + pt.x * scale},${roofOy + pt.y * scale}`).join(" ");
    el += `<path d="${d}" class="circulation-path" fill="none"/>`;
  });

  const isPlanner = document.documentElement.dataset.role !== "client";

  items.forEach(item => {
    const fp = getFootprint(item);
    const x = roofOx + item.x_m * scale;
    const y = roofOy + item.y_m * scale;
    const w = fp.w * scale;
    const h = fp.h * scale;
    const outOfBounds = outOfBoundsIds.has(item.id);

    const selected = combineState.selectedKind === "item" && combineState.selectedId === item.id;
    const tooClose = overlappingIds.has(item.id);
    const cutOff = circulation.unreachable.has(item.id);
    const warn = tooClose || outOfBounds;
    const colors = KIND_COLORS[item.kind] || KIND_COLORS.field;
    const strokeColor = warn ? "#ef4444" : cutOff ? "#f59e0b" : colors.stroke;

    el += `
      <rect data-id="${item.id}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${colors.fill}" stroke="${strokeColor}"
            stroke-width="${selected ? 2.5 : 1.5}"
            stroke-dasharray="${warn || cutOff ? '4,2' : 'none'}"
            style="cursor:${isPlanner ? 'grab' : 'pointer'}"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="10"
            font-family="'Titillium Web', Arial, sans-serif" fill="#1a1a18" pointer-events="none">
        ${item.label}${item.rotation ? " (rotated)" : ""}${cutOff ? " 🚫" : ""}
      </text>
    `;
  });

  // Suggested-spot ghosts for the selected item, drawn over pieces so they
  // read as an overlay, under entry markers so pins stay easy to grab.
  combineState.suggestions.forEach((cand, i) => {
    const gx = roofOx + cand.x_m * scale, gy = roofOy + cand.y_m * scale;
    const gw = cand.w_m * scale, gh = cand.h_m * scale;
    el += `
      <g class="suggestion-ghost${i === 0 ? ' top-pick' : ''}" data-suggestion-index="${i}" style="animation-delay:${i * 70}ms">
        <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="3"/>
        <circle class="suggestion-badge" cx="${gx + 10}" cy="${gy + 10}" r="8"/>
        <text x="${gx + 10}" y="${gy + 13}" text-anchor="middle" font-size="10" font-weight="700">${i + 1}</text>
      </g>`;
  });

  entries.forEach((ep, i) => {
    const x = roofOx + ep.x_m * scale;
    const y = roofOy + ep.y_m * scale;
    const [nx, ny] = ENTRY_NORMALS[ep.edge];
    // Base of the chevron must run perpendicular to the inward normal (a
    // 90°-rotated copy of it) so the triangle stays visible on every edge
    // — using a fixed horizontal base collapses to zero height on the
    // left/right edges, where the normal itself is horizontal.
    const tx = -ny, ty = nx;
    const selected = combineState.selectedKind === "entry" && combineState.selectedId === ep.id;
    el += `
      <g class="entry-marker${selected ? ' selected' : ''}" data-entry-id="${ep.id}" style="cursor:${isPlanner ? 'grab' : 'pointer'}">
        <circle cx="${x}" cy="${y}" r="7" />
        <path class="entry-arrow" d="M${x - 5 * tx},${y - 5 * ty} L${x + nx * 11},${y + ny * 11} L${x + 5 * tx},${y + 5 * ty} Z" />
        <text x="${x + nx * 20}" y="${y + ny * 20 + 4}" text-anchor="middle" font-size="10" font-weight="700">${i + 1}</text>
      </g>
    `;
  });

  svg.innerHTML = el;
  renderCombineTray();

  const statusEl = document.getElementById("combine-status");
  if (statusEl) {
    if (items.length === 0) {
      statusEl.textContent = "Push a sport, activity, or garden configuration to begin.";
    } else if (overlappingIds.size > 0) {
      statusEl.textContent = `⚠ ${overlappingIds.size} piece(s) closer than the ${DESIGN_RULES.clearance_m.toFixed(1)} m clearance rule.`;
    } else if (anyOutOfBounds) {
      statusEl.textContent = "⚠ One or more pieces extend outside the roof boundary.";
    } else if (entries.length === 0) {
      statusEl.textContent = `${items.length} piece(s) placed. Add an entry point to check circulation.`;
    } else if (circulation.unreachable.size > 0) {
      statusEl.textContent = `⚠ ${circulation.unreachable.size} piece(s) aren't reachable from an entrance.`;
    } else {
      statusEl.textContent = `${items.length} piece(s) placed. Layout OK — all rules satisfied.`;
    }
  }

  renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, zoneConflicts);
  renderCombineSummary(circulation);
  renderSmartRuleAdvisory();
  const selectedItem = combineState.selectedKind === "item" ? items.find(it => it.id === combineState.selectedId) : null;
  renderSuggestions(selectedItem, combineState.suggestions);
}

/**
 * Area-aware "smarter rules" advisory — see recommendedRules() in
 * rules.js. Purely additive: shows a suggestion (with an Apply button)
 * when the current rules fall short of the recommendation, never changes
 * DESIGN_RULES on its own.
 */
function renderSmartRuleAdvisory() {
  const el = document.getElementById("smart-rule-advisory");
  if (!el) return;

  if (combineState.items.length === 0) {
    el.innerHTML = `<p class="hint">Push a few pieces to see an area-based recommendation.</p>`;
    return;
  }

  const rec = recommendedRules(combineState);
  const entriesOk = combineState.entryPoints.length >= rec.minEntryPoints;
  const circOk = DESIGN_RULES.circulationWidth_m >= rec.circulationWidth_m;

  if (entriesOk && circOk) {
    el.innerHTML = `<p class="hint">For ~${rec.totalAreaM2} m² programmed, your current rules already meet the recommendation (${rec.minEntryPoints} entr${rec.minEntryPoints > 1 ? "ies" : "y"}, ${rec.circulationWidth_m.toFixed(1)} m circulation).</p>`;
    return;
  }

  el.innerHTML = `
    <p class="hint">For ~${rec.totalAreaM2} m² programmed, consider at least <strong>${rec.minEntryPoints}</strong> entr${rec.minEntryPoints > 1 ? "ies" : "y"} and <strong>${rec.circulationWidth_m.toFixed(1)} m</strong> circulation — like a building code scaling egress with occupant load.</p>
    <button class="btn-export accent" id="btn-apply-smart-rules"><i class="ti ti-wand" aria-hidden="true"></i>Apply recommendation</button>
  `;
  const btn = document.getElementById("btn-apply-smart-rules");
  if (btn) btn.addEventListener("click", () => { if (typeof applySmartRuleRecommendation === "function") applySmartRuleRecommendation(rec); });
}

/**
 * Step 4 "Review"'s summary stat cards — real numbers off the current
 * layout (piece counts, programmed area, garden retention, longest route
 * to an entrance), not just the checklist's pass/fail. Retention formula
 * is the same illustrative one compareController.js/analysisController.js
 * each already use (consistent duplication across the 3 files — each
 * computes it for its own state shape rather than sharing across the
 * plain-<script> global scope, matching this app's established pattern).
 * Reuses the circulation result the caller (drawCombineCanvas) already
 * computed rather than running BFS a second time.
 */
function renderCombineSummary(circulation) {
  const el = document.getElementById("combine-summary");
  if (!el) return;
  const items = combineState.items;

  if (items.length === 0) {
    el.innerHTML = `<div class="dim-card"><div class="val">0</div><div class="lbl">Pieces placed</div></div>`;
    return;
  }

  const sportCount = items.filter(it => it.kind === "field" || it.kind === "activity").length;
  const gardenCount = items.filter(it => it.kind === "garden").length;
  const totalAreaM2 = items.reduce((s, it) => { const fp = getFootprint(it); return s + fp.w * fp.h; }, 0);

  let retentionHtml = "";
  const gardenItems = items.filter(it => it.kind === "garden");
  if (gardenItems.length > 0) {
    let gardenAreaM2 = 0, weightedDepthCm = 0;
    gardenItems.forEach(it => {
      const fp = getFootprint(it);
      const area = fp.w * fp.h;
      const theme = GARDEN_THEMES[it.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
      const depthCm = Object.values(theme.layers).reduce((s, l) => s + l.thickness_m * 100, 0);
      gardenAreaM2 += area;
      weightedDepthCm += area * depthCm;
    });
    const retentionPercent = Math.min(90, Math.round(30 + (weightedDepthCm / gardenAreaM2) * 2));
    retentionHtml = `<div class="dim-card"><div class="val">${retentionPercent}%</div><div class="lbl">Garden retention</div></div>`;
  }

  const distances = circulation.paths.map(p => pathLengthM(p.points));
  const maxDist = distances.length ? Math.max(...distances) : 0;

  el.innerHTML = `
    <div class="dim-card"><div class="val">${items.length}</div><div class="lbl">Pieces placed</div></div>
    <div class="dim-card"><div class="val">${sportCount} / ${gardenCount}</div><div class="lbl">Sport &amp; activity / garden</div></div>
    <div class="dim-card"><div class="val">${Math.round(totalAreaM2)} m²</div><div class="lbl">Total programmed</div></div>
    ${retentionHtml}
    <div class="dim-card"><div class="val">${maxDist.toFixed(1)} m</div><div class="lbl">Longest route to an entrance</div></div>
  `;
}

/**
 * Rebuilds the "Design rules checklist" panel from the same overlap /
 * circulation results the canvas just drew, so the two never disagree.
 * Rebuilding innerHTML from state matches the pattern used everywhere
 * else in this app (e.g. updateGardenUI's layer cards).
 */
function renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, zoneConflicts) {
  const panel = document.getElementById("rules-panel");
  if (!panel) return;
  const items = combineState.items;
  const entries = combineState.entryPoints;

  const rows = [{
    passed: entries.length >= DESIGN_RULES.minEntryPoints,
    label: `Entry point${DESIGN_RULES.minEntryPoints > 1 ? "s" : ""} defined`,
    detail: entries.length === 0 ? "Add at least one entrance on the site edge." : `${entries.length} entrance${entries.length > 1 ? "s" : ""} placed.`,
  }];

  if (items.length === 0) {
    rows.push({ passed: true, label: "Layout", detail: "Push a sport or garden piece to Combine to start checking rules." });
  } else {
    rows.push({
      passed: overlappingIds.size === 0,
      label: `Clearance (min ${DESIGN_RULES.clearance_m.toFixed(1)} m)`,
      detail: overlappingIds.size === 0 ? "All pieces respect the minimum gap." : `${overlappingIds.size} piece(s) too close to a neighbor.`,
    });
    rows.push({
      passed: !anyOutOfBounds,
      label: "Inside site boundary",
      detail: !anyOutOfBounds ? "Everything fits inside the roof footprint." : "One or more pieces extend past the edge.",
    });
    rows.push({
      passed: entries.length > 0 && circulation.unreachable.size === 0,
      label: `Circulation access (${DESIGN_RULES.circulationWidth_m.toFixed(1)} m paths)`,
      detail: entries.length === 0
        ? "Waiting on an entrance to check reachability."
        : circulation.unreachable.size === 0
          ? "Every piece connects back to an entrance."
          : `${circulation.unreachable.size} piece(s) can't be reached from any entrance.`,
    });
    if (zoneConflicts) {
      rows.push({
        passed: zoneConflicts.pairs.length === 0,
        label: `Quiet zones protected (${DESIGN_RULES.quietBufferM.toFixed(1)} m buffer)`,
        detail: zoneConflicts.pairs.length === 0
          ? "No wellness/garden zone sits too close to a loud court or activity."
          : zoneConflicts.pairs.map(p => `"${p.quietLabel}" is ${p.distanceM.toFixed(1)} m from "${p.loudLabel}"`).join("; ") + ".",
      });
    }
  }

  panel.innerHTML = rows.map(r => `
    <div class="rule-row ${r.passed ? "pass" : "fail"}">
      <span class="rule-icon">${r.passed ? "✓" : "!"}</span>
      <div class="rule-text">
        <div class="rule-label">${r.label}</div>
        <div class="rule-detail">${r.detail}</div>
      </div>
    </div>
  `).join("");

  panel.classList.remove("pop");
  void panel.offsetWidth; // restart the CSS animation even if the class was already present
  panel.classList.add("pop");
}

/**
 * Renders the "Suggested spots" list for the selected item and (re)binds
 * its click-to-apply buttons — rebuild-and-rebind, same pattern
 * buildActivityBar uses for its own list of buttons.
 */
function renderSuggestions(item, candidates) {
  const hintEl = document.getElementById("suggestions-hint");
  const listEl = document.getElementById("suggestions-list");
  if (!hintEl || !listEl) return;
  if (!item) {
    hintEl.style.display = "block";
    hintEl.textContent = "Select a piece to see suggested spots.";
    listEl.innerHTML = "";
    return;
  }
  if (candidates.length === 0) {
    hintEl.style.display = "block";
    hintEl.textContent = "No open spots found — try loosening a rule or removing a piece.";
    listEl.innerHTML = "";
    return;
  }
  hintEl.style.display = "none";
  listEl.innerHTML = candidates.map((c, i) => `
    <button class="suggestion-row" data-suggestion-index="${i}">
      <span class="suggestion-num">${i + 1}</span><span class="suggestion-text">${c.reason}</span><span class="suggestion-score">${c.score}</span>
    </button>`).join("");
  listEl.querySelectorAll(".suggestion-row").forEach(btn => {
    btn.addEventListener("click", () => { if (typeof applySuggestion === "function") applySuggestion(Number(btn.dataset.suggestionIndex)); });
  });
}

/**
 * Renders the tray's thumbnails from combineState.tray — called at the end
 * of every drawCombineCanvas() so it never drifts out of sync with the
 * roof (tray and canvas are two views of the same combineState).
 */
function renderCombineTray() {
  const wrap = document.getElementById("combineTrayItems");
  const countEl = document.getElementById("combineTrayCount");
  if (!wrap) return;
  const tray = combineState.tray;
  if (countEl) countEl.textContent = tray.length;

  if (tray.length === 0) {
    wrap.innerHTML = `<p class="hint combine-tray-empty">Push a sport, activity, or garden piece — it lands here first, then drag it onto the roof.</p>`;
    return;
  }
  wrap.innerHTML = tray.map(it => {
    const colors = KIND_COLORS[it.kind] || KIND_COLORS.field;
    return `
      <div class="tray-thumb" data-tray-id="${it.id}" style="--thumb-fill:${colors.fill};--thumb-stroke:${colors.stroke}" title="${it.label} — ${it.length_m}m × ${it.width_m}m">
        <button class="tray-thumb-remove" data-tray-remove="${it.id}" title="Remove"><i class="ti ti-x" aria-hidden="true"></i></button>
        <div class="tray-thumb-box"></div>
        <span class="tray-thumb-label">${it.label}</span>
      </div>`;
  }).join("");
}

let trayDragState = null; // { id, ghostEl }

/**
 * Drag-and-drop from the tray onto the roof — a "mini-game inventory"
 * pattern, kept consistent with the roof canvas's own drag (pointer events
 * + manual position math, not native HTML5 DnD, so both share the same
 * snapToGrid/combineLayout helpers and behave identically). The tray lives
 * in a different DOM region than the SVG, so this listens on `document`
 * for move/up rather than the canvas itself — a drag has to be trackable
 * even while the pointer is over the tray, empty space, or the canvas.
 */
function initTrayDragInteractions() {
  const wrap = document.getElementById("combineTrayItems");
  if (!wrap) return;

  wrap.addEventListener("pointerdown", e => {
    const removeBtn = e.target.closest("[data-tray-remove]");
    if (removeBtn) {
      if (typeof removeFromTray === "function") removeFromTray(removeBtn.dataset.trayRemove);
      return;
    }
    const thumb = e.target.closest(".tray-thumb");
    if (!thumb) return;
    const id = thumb.dataset.trayId;
    if (!combineState.tray.some(it => it.id === id)) return;

    const ghost = thumb.cloneNode(true);
    ghost.classList.add("tray-thumb-ghost");
    ghost.style.left = `${e.clientX - 32}px`;
    ghost.style.top = `${e.clientY - 32}px`;
    document.body.appendChild(ghost);

    trayDragState = { id, ghost };
    thumb.classList.add("tray-thumb-dragging");
    e.preventDefault();
  });

  document.addEventListener("pointermove", e => {
    if (!trayDragState) return;
    trayDragState.ghost.style.left = `${e.clientX - 32}px`;
    trayDragState.ghost.style.top = `${e.clientY - 32}px`;
  });

  document.addEventListener("pointerup", e => {
    if (!trayDragState) return;
    const { id, ghost } = trayDragState;
    trayDragState = null;
    ghost.remove();
    document.querySelectorAll(".tray-thumb-dragging").forEach(el => el.classList.remove("tray-thumb-dragging"));

    const svg = document.getElementById("combine-canvas");
    const svgRect = svg.getBoundingClientRect();
    const overCanvas = e.clientX >= svgRect.left && e.clientX <= svgRect.right && e.clientY >= svgRect.top && e.clientY <= svgRect.bottom;
    if (!overCanvas) return; // dropped outside the roof — stays in the tray, nothing to do

    const item = combineState.tray.find(it => it.id === id);
    if (!item) return;

    // Map the real drop pixel into the SVG's own viewBox space (it's
    // scaled to fit its container via preserveAspectRatio), then into
    // roof meters, centering the piece on the drop point.
    const { scale, roofOx, roofOy } = combineLayout();
    const svgX = (e.clientX - svgRect.left) / svgRect.width * CVW;
    const svgY = (e.clientY - svgRect.top) / svgRect.height * CVH;
    const fp = getFootprint(item);
    let x_m = snapToGrid((svgX - roofOx) / scale - fp.w / 2);
    let y_m = snapToGrid((svgY - roofOy) / scale - fp.h / 2);
    x_m = Math.max(0, Math.min(combineState.roof.length - fp.w, x_m));
    y_m = Math.max(0, Math.min(combineState.roof.width - fp.h, y_m));

    if (typeof placeTrayItemAt === "function") placeTrayItemAt(id, x_m, y_m);
  });
}

function initCombineInteractions() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;

  svg.addEventListener("contextmenu", e => e.preventDefault()); // right-drag pans instead of opening the browser menu

  svg.addEventListener("pointerdown", e => {
    if (e.button === 2) {
      dragState = { kind: "pan", startClientX: e.clientX, startClientY: e.clientY, startPanX: combineView.panX, startPanY: combineView.panY };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    const pt = svgPoint(svg, e);

    if (combineState.tool === "addEntry") {
      const { scale, roofOx, roofOy } = combineLayout();
      addEntryPoint((pt.x - roofOx) / scale, (pt.y - roofOy) / scale);
      // One pin per click — auto-stop so a stray click anywhere on the
      // canvas afterward (selecting a piece, etc.) doesn't keep dropping
      // more entrances. Click the button again to add another.
      combineState.tool = null;
      syncAddEntryTool();
      return;
    }

    // Suggested-spot ghosts are clickable by both roles — every candidate
    // is already pre-validated by the search itself, so applying one can
    // never produce an illegal placement the way free-drag could.
    const ghostEl = e.target.closest("[data-suggestion-index]");
    if (ghostEl) {
      if (typeof applySuggestion === "function") applySuggestion(Number(ghostEl.dataset.suggestionIndex));
      return;
    }

    const entryEl = e.target.closest("[data-entry-id]");
    if (entryEl) {
      combineState.selectedKind = "entry";
      combineState.selectedId = entryEl.dataset.entryId;
      // Auto-jump to the Arrange step so a selection is immediately
      // actionable, matching item selection below.
      if (typeof setWizardStep === "function") setWizardStep(2);
      // refreshSuggestions redraws the canvas itself (and clears any stale
      // item suggestions now that an entry is selected instead) — no need
      // for a separate drawCombineCanvas() call here too.
      if (typeof refreshSuggestions === "function") refreshSuggestions(); else drawCombineCanvas();

      const isPlanner = document.documentElement.dataset.role !== "client";
      if (!isPlanner) return;
      const entry = combineState.entryPoints.find(ep => ep.id === entryEl.dataset.entryId);
      if (!entry) return;
      dragState = { kind: "entry", id: entry.id };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;
    const item = combineState.items.find(i => i.id === id);
    if (!item) return;

    combineState.selectedKind = "item";
    combineState.selectedId = id;
    if (typeof setWizardStep === "function") setWizardStep(2);
    // Same reasoning: refreshSuggestions both recomputes for the newly
    // selected item and redraws, so it replaces the plain redraw here.
    if (typeof refreshSuggestions === "function") refreshSuggestions(); else drawCombineCanvas();

    // Clients can select a piece (e.g. to remove it) but only the planner
    // gets free-drag placement — that's the manual override the rule
    // engine otherwise handles for them.
    const isPlanner = document.documentElement.dataset.role !== "client";
    if (!isPlanner) return;

    const { scale } = combineLayout();
    dragState = {
      kind: "item", id,
      startPtX: pt.x, startPtY: pt.y,
      startXm: item.x_m, startYm: item.y_m,
      scale,
    };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", e => {
    if (!dragState) return;

    if (dragState.kind === "pan") {
      // Client-pixel delta converted into viewBox units via the SVG's own
      // CTM scale factor, so panning tracks the cursor 1:1 regardless of
      // how large the SVG is actually rendered on screen.
      const ctm = svg.getScreenCTM();
      combineView.panX = dragState.startPanX + (e.clientX - dragState.startClientX) / ctm.a;
      combineView.panY = dragState.startPanY + (e.clientY - dragState.startClientY) / ctm.d;
      drawCombineCanvas();
      return;
    }

    const pt = svgPoint(svg, e);

    if (dragState.kind === "entry") {
      const entry = combineState.entryPoints.find(ep => ep.id === dragState.id);
      if (!entry) return;
      const { scale, roofOx, roofOy } = combineLayout();
      const rawXm = (pt.x - roofOx) / scale;
      const rawYm = (pt.y - roofOy) / scale;
      // Entries only ever live on the site edge — re-snap to whichever
      // edge is nearest the pointer (can cross to a different edge
      // mid-drag), then grid-snap along that edge same as items.
      const snap = nearestBoundaryPoint(combineState.roof, rawXm, rawYm);
      entry.edge = snap.edge;
      entry.x_m = snapToGrid(snap.x);
      entry.y_m = snapToGrid(snap.y);
      drawCombineCanvas();
      return;
    }

    const dxM = (pt.x - dragState.startPtX) / dragState.scale;
    const dyM = (pt.y - dragState.startPtY) / dragState.scale;
    const item = combineState.items.find(i => i.id === dragState.id);
    if (!item) return;

    item.x_m = snapToGrid(dragState.startXm + dxM);
    item.y_m = snapToGrid(dragState.startYm + dyM);
    drawCombineCanvas();
  });

  ["pointerup", "pointercancel"].forEach(evtName =>
    svg.addEventListener(evtName, () => {
      const wasDragging = dragState && dragState.kind !== "pan";
      dragState = null;
      // Recompute once the drag actually settles — not mid-drag, where a
      // full candidate search on every pointermove would visibly lag.
      if (wasDragging && typeof refreshSuggestions === "function") refreshSuggestions();
    })
  );

  svg.addEventListener("wheel", e => {
    e.preventDefault();
    zoomCombineView(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY, svg);
  }, { passive: false });

  document.getElementById("btn-combine-zoom-in")?.addEventListener("click", () => {
    const r = svg.getBoundingClientRect();
    zoomCombineView(1.25, r.x + r.width / 2, r.y + r.height / 2, svg);
  });
  document.getElementById("btn-combine-zoom-out")?.addEventListener("click", () => {
    const r = svg.getBoundingClientRect();
    zoomCombineView(1 / 1.25, r.x + r.width / 2, r.y + r.height / 2, svg);
  });
  document.getElementById("btn-combine-zoom-reset")?.addEventListener("click", () => {
    resetCombineView();
    drawCombineCanvas();
  });
}

/** Converts a pointer event's client coords into this SVG's viewBox coordinate space. */
function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}