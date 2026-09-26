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
  // Plants read as a crown outline rather than a solid block — a tree occupies
  // its canopy, but you can still see the ground it is standing on.
  vegetation: { stroke: "#2f7a43", fill: "rgba(47,122,67,0.22)" },
  // Pieces pushed from the Revit Families tab — the user's own loaded
  // content rather than one of the app's built-in presets. Its own colour
  // so a designer can see at a glance which pieces came from their model.
  revit:    { stroke: "#d97706", fill: "rgba(217,119,6,0.32)" },
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

let _algoZoneLookup = null;

/**
 * Maps a sport/activity key (item.sourceJson.field.sport or
 * .activity.type_id — the one identifier both catalogues agree on; item
 * labels differ between them, e.g. "Ping Pong Station" vs "Ping Pong" for
 * the same thing) to the algorithmic engine's zone classification. Built
 * once from ALGO_CATALOGUE (algoPlacementUI.js) cross-referenced with
 * AlgoPlacement.zoneOf/noSetback (algoPlacementCore.js) — lazily, since
 * those scripts load after this one; by the time a redraw actually runs
 * (after the page has fully loaded) both are available.
 */
function algoZoneLookup() {
  if (_algoZoneLookup) return _algoZoneLookup;
  if (typeof ALGO_CATALOGUE === "undefined" || typeof AlgoPlacement === "undefined") return {};
  const map = {};
  Object.keys(ALGO_CATALOGUE).forEach(engineName => {
    const cat = ALGO_CATALOGUE[engineName];
    const key = cat.kind === "field" ? cat.sport : cat.id;
    map[key] = { zone: AlgoPlacement.zoneOf(engineName), noSetback: AlgoPlacement.noSetback(engineName) };
  });
  _algoZoneLookup = map;
  return map;
}

/**
 * A Combine item's zone ("indoor"/"garden"/"outdoor") and whether it is
 * exempt from the boundary setback (only the two service modules, which
 * stand against a real wall, are). Falls back to "outdoor"/not-exempt for
 * anything the algorithmic catalogue doesn't cover.
 */
function itemZoneInfo(item) {
  const key = item.kind === "field" ? item.sourceJson?.field?.sport
    : item.kind === "activity" ? item.sourceJson?.activity?.type_id
      : null;
  return (key && algoZoneLookup()[key]) || { zone: "outdoor", noSetback: false };
}

/**
 * Zone-aware replacement for a flat clearance rule: two pieces in the same
 * zone need DESIGN_RULES.zoneClearance_m between them, two pieces in
 * different zones need the wider crossZoneClearance_m, and a piece within
 * entryClearance_m of an entry point also fails — mirroring the
 * algorithmic engine's own in-zone/primary/entry gaps (algoPlacementCore.js:
 * ZONE_GAP_OPTIONS_M / PRIMARY_OPTIONS_M / ENTRY_GAP_M) so a hand-placed
 * board is held to the same rule an Applied one already is. A pair that
 * are both setback-exempt (Locker + Bathroom) is skipped entirely — they
 * share a real wall by design, 0 m apart.
 */
function findClearanceViolations(items, entries, rules) {
  const violating = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i], za = itemZoneInfo(a);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j], zb = itemZoneInfo(b);
      if (za.noSetback && zb.noSetback) continue;
      const need = za.zone === zb.zone ? rules.zoneClearance_m : rules.crossZoneClearance_m;
      if (zoneGapM(a, b) < need) { violating.add(a.id); violating.add(b.id); }
    }
  }
  items.forEach(it => {
    const fp = getFootprint(it);
    entries.forEach(ep => {
      const dx = Math.max(it.x_m - ep.x_m, 0, ep.x_m - (it.x_m + fp.w));
      const dy = Math.max(it.y_m - ep.y_m, 0, ep.y_m - (it.y_m + fp.h));
      if (Math.hypot(dx, dy) < rules.entryClearance_m) violating.add(it.id);
    });
  });
  return violating;
}

/**
 * Ids of every placed sport/service piece sitting inside the boundary-
 * setback band — the same band setbackGuideSvg draws as a dashed guide,
 * now actually enforced. Only the two service modules (Locker, Bathroom)
 * are exempt; garden/furniture/vegetation pieces aren't checked at all,
 * since the setback band is the garden band by design.
 */
function findSetbackViolations(items, roof, rules) {
  const violating = new Set();
  const sb = rules.boundarySetback_m;
  items.forEach(it => {
    if (it.kind !== "field" && it.kind !== "activity") return;
    if (itemZoneInfo(it).noSetback) return;
    const fp = getFootprint(it);
    const inside = it.x_m >= sb - 1e-6 && it.y_m >= sb - 1e-6 &&
      (it.x_m + fp.w) <= roof.length - sb + 1e-6 && (it.y_m + fp.h) <= roof.width - sb + 1e-6;
    if (!inside) violating.add(it.id);
  });
  return violating;
}

/**
 * The algorithmic engine's indoor-zone wall + door (combineState.walls,
 * populated by algoApply — see algoPlacementUI.js), drawn the same way
 * algoDrawPreview already draws it in the Algorithmic placement preview so
 * the board doesn't make a different claim about the zone than the panel
 * that produced it. Purely visual: pointer-events none, not part of
 * combineState.items, so it is never selectable/draggable and never enters
 * the clearance/setback/overlap checks.
 */
function combineWallSvg(walls, scale, roofOx, roofOy) {
  if (!walls || !walls.length) return "";
  // Solid white, like a real wall drawn in plan — with a dark outline for
  // definition (a plain white fill would vanish against a light-theme
  // canvas otherwise) and a thicker stroke so it reads at roof scale
  // instead of disappearing next to the courts' own 1.5px item borders.
  const wallColor = "#ffffff", lineColor = "#2b2f38";
  let svg = "";
  walls.forEach(w => {
    svg += `<g pointer-events="none">` + w.rects.map(r => {
      const x = roofOx + r[0] * scale, y = roofOy + r[1] * scale;
      const rw = (r[2] - r[0]) * scale, rh = (r[3] - r[1]) * scale;
      return `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${wallColor}" stroke="${lineColor}" stroke-width="1.5"/>`;
    }).join("") + `</g>`;
    if (w.door) {
      const d = w.door;
      const x1 = roofOx + d.x0 * scale, y1 = roofOy + d.y0 * scale, x2 = roofOx + d.x1 * scale, y2 = roofOy + d.y1 * scale;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="2" stroke-dasharray="4,3" pointer-events="none"/>`;
    }
  });
  return svg;
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

/** Snaps a click (plan metres) onto the nearest side of the real roof outline and stores it as a new entry point, facing into the roof. */
function addEntryPoint(xm, ym) {
  const snap = nearestBoundaryPoint(combineState.roof, xm, ym);
  const ep = { id: `entry_${Date.now()}_${entryCounter++}`, edge: snap.edge, x_m: snap.x, y_m: snap.y, nx: snap.nx, ny: snap.ny };
  combineState.entryPoints.push(ep);
  combineState.selectedKind = "entry";
  combineState.selectedId = ep.id;
  drawCombineCanvas();
  if (typeof showToast === "function") {
    showToast("Entrance added", `Entry point ${combineState.entryPoints.length} placed on the ${snap.edge} edge.`);
  }
  if (typeof refreshSuggestions === "function") refreshSuggestions();
}

/**
 * The colour a label on the canvas has to be.
 *
 * These were hardcoded near-white, which reads on the dark canvas and vanishes
 * on the light one. A label sitting on a saturated court can stay white in
 * both themes; a label sitting on the canvas background — every piece name,
 * which is drawn below its shape — cannot.
 */
function canvasLabelFill() {
  return (typeof isDarkMode === "function" && isDarkMode()) ? "#e8ece8" : "#2a2d3a";
}

/**
 * The board's numbering: pieces 1, 2, 3… in placement order, ground zones G1, G2…
 * Entry points get none. Names written out on a 60 m roof overlapped each other,
 * so the board carries only these numbers and the legend (renderCombineLegend)
 * says what each one is.
 */
function combineBoardNumbers() {
  const nums = new Map();
  combineState.items.forEach((it, i) => nums.set(it.id, String(i + 1)));
  (combineState.zones || []).forEach((z, i) => nums.set(z.id, "G" + (i + 1)));
  return nums;
}

/** A round number badge, the same size on screen at any zoom; red when the piece breaks a rule, amber when it can't be reached. */
function boardBadgeSvg(cx, cy, label, color, state) {
  const r = 9, w = Math.max(2 * r, 7 * label.length + 8);
  const ring = state === "warn" ? "#ef4444" : state === "cut" ? "#f59e0b" : color;
  const bg = (typeof isDarkMode === "function" && isDarkMode()) ? "#1c1e2b" : "#ffffff";
  return `<g pointer-events="none">
      <rect x="${cx - w / 2}" y="${cy - r}" width="${w}" height="${2 * r}" rx="${r}" fill="${bg}" stroke="${ring}" stroke-width="${state ? 2 : 1.5}"/>
      <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="10" font-weight="700"
            font-family="'Titillium Web', Arial, sans-serif" fill="${canvasLabelFill()}">${escapeHtml(label)}</text>
    </g>`;
}

let combineLegendFolded = false;

/**
 * The legend beside the board: badge, colour, name and size of every numbered
 * piece and zone, with what it breaks. A row selects its piece, the way a click
 * on the board does. `st` carries the rule results drawCombineCanvas already
 * computed, so nothing is checked twice.
 */
function renderCombineLegend(st) {
  const box = document.getElementById("combine-legend");
  if (!box) return;
  const items = combineState.items, zones = combineState.zones || [];
  const count = items.length + zones.length;
  box.hidden = count === 0;
  box.classList.toggle("open", count > 0 && !combineLegendFolded);
  if (!count) return;
  const head = `<div class="combine-legend-head"><span><i class="ti ti-list-numbers" aria-hidden="true"></i> Legend</span><span class="combine-legend-count">${count}</span>
      <button class="combine-legend-fold" data-legend-fold title="${combineLegendFolded ? "Show the legend" : "Hide the legend"}"><i class="ti ${combineLegendFolded ? "ti-chevron-down" : "ti-chevron-up"}" aria-hidden="true"></i></button></div>`;
  if (combineLegendFolded) { box.innerHTML = head; return; }

  const sel = combineState.selectedId;
  const row = (kind, id, color, name, size, flag) => `
      <button class="combine-legend-row${sel === id ? " selected" : ""}" data-legend-kind="${kind}" data-legend-id="${escapeHtml(id)}">
        <span class="combine-legend-num" style="border-color:${escapeHtml(color)}">${escapeHtml(st.nums.get(id))}</span>
        <span class="combine-legend-chip" style="background:${escapeHtml(color)}"></span>
        <span class="combine-legend-name">${escapeHtml(name)}</span>
        <span class="combine-legend-size">${size}</span>${flag ? `<span class="combine-legend-flag" title="${escapeHtml(flag.tip)}">${flag.icon}</span>` : ""}
      </button>`;

  const pieceRows = items.map(it => {
    const fp = getFootprint(it);
    const flag = st.overlappingIds.has(it.id) ? { icon: "⚠", tip: "Too close to a neighbour or an entry point" }
      : st.outOfBoundsIds.has(it.id) ? { icon: "⚠", tip: "Outside the roof boundary" }
      : st.setbackIds.has(it.id) ? { icon: "⚠", tip: "Inside the setback band" }
      : st.unreachable.has(it.id) ? { icon: "🚫", tip: "Not reachable from an entrance" } : null;
    return row("item", it.id, (KIND_COLORS[it.kind] || KIND_COLORS.field).stroke, it.label, `${fp.w.toFixed(1)} × ${fp.h.toFixed(1)} m`, flag);
  }).join("");
  const zoneRows = zones.map(z => {
    const kind = (typeof ZONE_KINDS !== "undefined" && (ZONE_KINDS[z.kind] || ZONE_KINDS.green_roof)) || { color: "#0ea355", short: "Zone" };
    const area = typeof zoneAreaM2 === "function" ? `${zoneAreaM2(z).toFixed(0)} m²` : "";
    return row("zone", z.id, kind.color, kind.short, area, st.zoneBad.has(z.id) ? { icon: "⚠", tip: "Breaks a zone rule" } : null);
  }).join("");

  box.innerHTML = head + `<div class="combine-legend-body">
      ${pieceRows ? `<div class="combine-legend-group">Pieces</div>${pieceRows}` : ""}
      ${zoneRows ? `<div class="combine-legend-group">Ground zones</div>${zoneRows}` : ""}
    </div>`;
}

document.getElementById("combine-legend")?.addEventListener("click", e => {
  if (e.target.closest("[data-legend-fold]")) {
    combineLegendFolded = !combineLegendFolded;
    drawCombineCanvas();
    return;
  }
  const r = e.target.closest("[data-legend-id]");
  if (!r) return;
  combineState.selectedKind = r.dataset.legendKind;
  combineState.selectedId = r.dataset.legendId;
  if (r.dataset.legendKind === "zone") {
    drawCombineCanvas();
    if (typeof renderZonePanel === "function") renderZonePanel();
  } else if (typeof refreshSuggestions === "function") refreshSuggestions();
  else drawCombineCanvas();
});

function drawCombineCanvas() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;
  const roof = combineState.roof;
  const items = combineState.items;
  const entries = combineState.entryPoints;
  const { scale, roofPxW, roofPxH, roofOx, roofOy } = combineLayout();

  let el = `
    <text x="${CVW / 2}" y="24" text-anchor="middle" font-size="12"
          font-family="'Titillium Web', Arial, sans-serif" fill="${isDarkMode() ? "#8c90a8" : "#666"}">
      Roof boundary — ${roof.length} m × ${roof.width} m
    </text>
    ${roofShapeSvg(roof, scale, roofOx, roofOy, roofPxW, roofPxH)}
    ${typeof revitBoundarySvg === "function" ? revitBoundarySvg(scale, roofOx, roofOy) : ""}
    ${snapGridSvg(roof, scale, roofOx, roofOy)}
    ${typeof zonesSvg === "function" ? zonesSvg(scale, roofOx, roofOy) : ""}
    ${typeof structureSvg === "function" ? structureSvg(scale, roofOx, roofOy) : ""}
    ${typeof roofFeaturesSvg === "function" ? roofFeaturesSvg(scale, roofOx, roofOy) : ""}
    ${setbackGuideSvg(roof, scale, roofOx, roofOy)}
  `;

  // These two are the expensive-ish operations (grid build + BFS), so run
  // them once per redraw and hand the results to both the SVG and the
  // rules checklist rather than recomputing per consumer.
  const overlappingIds = findClearanceViolations(items, entries, DESIGN_RULES);
  const circulation = computeCirculation(combineState, DESIGN_RULES);
  const outOfBoundsIds = findOutOfBoundsIds(items, roof);
  const anyOutOfBounds = outOfBoundsIds.size > 0;
  const zoneConflicts = findZoneConflicts(items, DESIGN_RULES);
  const setbackIds = findSetbackViolations(items, roof, DESIGN_RULES);

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
    const inSetback = setbackIds.has(item.id);
    const cutOff = circulation.unreachable.has(item.id);
    const warn = tooClose || outOfBounds || inSetback;
    const colors = KIND_COLORS[item.kind] || KIND_COLORS.field;
    const strokeColor = warn ? "#ef4444" : cutOff ? "#f59e0b" : colors.stroke;

    // A tree's crown is round, so it is drawn round. Courts and equipment stay
    // rectangular because that is genuinely their shape. The trunk sits at the
    // centre of the crown.
    const isCrown = item.kind === "vegetation";

    // A specified sport draws itself here too. The same renderer the panel
    // uses, at roof scale — otherwise the two would be making different claims
    // about one court. Rotation is applied to the group rather than baked into
    // the geometry, so the markings turn with it.
    // Furniture is small — a bench is 1.8 m on a 60 m roof — so it draws a
    // shape that reads at that size rather than a miniature of itself.
    if (typeof isFurnitureItem === "function" && isFurnitureItem(item)) {
      const spin = item.rotation
        ? ` transform="rotate(${item.rotation}, ${x + w / 2}, ${y + h / 2})"` : "";
      el += `<g${spin}>${furnitureSvg(x, y, w, h, item, selected, strokeColor, isPlanner)}</g>`;
      return;
    }

    // Volleyball's free zone is part of the court, so the footprint drawn here
    // is the whole facility — which is the point: it is what has to fit.
    if (typeof isVolleyballItem === "function" && isVolleyballItem(item)) {
      const st = volleyballStateForItem(item);
      const spin = item.rotation
        ? ` transform="rotate(${item.rotation}, ${x + w / 2}, ${y + h / 2})"` : "";
      const detail = w < 110 ? "simple" : "full";
      el += `<g${spin}>
          ${volleyballCourtSvg(x, y, w, h, st, detail, isDarkMode())}
          <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
                fill="transparent" stroke="${strokeColor}"
                stroke-width="${selected ? 2.5 : 1.5}"
                stroke-dasharray="${warn || cutOff ? "4,2" : "none"}"
                style="cursor:${isPlanner ? "grab" : "pointer"}"/>
        </g>`;
      return;
    }

    // A basketball court's markings are the court — a plain rectangle on the
    // roof says nothing about whether the thing fits or reads as one.
    if (typeof isBasketballItem === "function" && isBasketballItem(item)) {
      const st = basketballStateForItem(item);
      const spin = item.rotation
        ? ` transform="rotate(${item.rotation}, ${x + w / 2}, ${y + h / 2})"` : "";
      // The key, the arcs and the no-charge semicircle collapse into noise
      // below roughly this width; simple keeps the court legible.
      const detail = w < 110 ? "simple" : "full";
      el += `<g${spin}>
          ${basketballCourtSvg(x, y, w, h, st, detail, isDarkMode())}
          <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
                fill="transparent" stroke="${strokeColor}"
                stroke-width="${selected ? 2.5 : 1.5}"
                stroke-dasharray="${warn || cutOff ? "4,2" : "none"}"
                style="cursor:${isPlanner ? "grab" : "pointer"}"/>
        </g>`;
      return;
    }

    if (typeof isPadelItem === "function" && isPadelItem(item)) {
      const st = padelStateForItem(item);
      const spin = item.rotation
        ? ` transform="rotate(${item.rotation}, ${x + w / 2}, ${y + h / 2})"` : "";
      // Below ~90px across, the service lines and mesh hatch turn to mush —
      // simple keeps the court legible instead of busy.
      const detail = w < 90 ? "simple" : "full";
      el += `<g${spin}>
          ${padelCourtSvg(x, y, w, h, st, detail, isDarkMode())}
          <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
                fill="transparent" stroke="${strokeColor}"
                stroke-width="${selected ? 2.5 : 1.5}"
                stroke-dasharray="${warn || cutOff ? "4,2" : "none"}"
                style="cursor:${isPlanner ? "grab" : "pointer"}"/>
        </g>`;
      return;
    }

    el += isCrown
      ? `
      <circle data-id="${escapeHtml(item.id)}" cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"
              fill="${colors.fill}" stroke="${strokeColor}"
              stroke-width="${selected ? 2.5 : 1.5}"
              stroke-dasharray="${warn || cutOff ? '4,2' : 'none'}"
              style="cursor:${isPlanner ? 'grab' : 'pointer'}"/>
      <circle cx="${x + w / 2}" cy="${y + h / 2}" r="1.6"
              fill="${strokeColor}" pointer-events="none"/>
    `
      : `
      <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${colors.fill}" stroke="${strokeColor}"
            stroke-width="${selected ? 2.5 : 1.5}"
            stroke-dasharray="${warn || cutOff ? '4,2' : 'none'}"
            style="cursor:${isPlanner ? 'grab' : 'pointer'}"/>
    `;
  });

  // The indoor zone's wall, drawn over the pieces (a real wall reads as a
  // boundary standing above the floor, not underneath it) but under the
  // suggestion ghosts and entry markers so those stay the topmost, clickable layer.
  el += combineWallSvg(combineState.walls, scale, roofOx, roofOy);

  // One badge per zone and per piece, above the pieces so none hides under a
  // neighbour; the legend beside the board names them.
  const nums = combineBoardNumbers();
  const zoneBad = typeof zonesInViolation === "function" ? zonesInViolation() : new Set();
  (combineState.zones || []).forEach(z => {
    if (!z.points || !z.points.length) return;
    const kind = (typeof ZONE_KINDS !== "undefined" && (ZONE_KINDS[z.kind] || ZONE_KINDS.green_roof)) || { color: "#0ea355" };
    const cx = roofOx + z.points.reduce((s, p) => s + p.x_m, 0) / z.points.length * scale;
    const cy = roofOy + z.points.reduce((s, p) => s + p.y_m, 0) / z.points.length * scale;
    el += boardBadgeSvg(cx, cy, nums.get(z.id), kind.color, zoneBad.has(z.id) ? "warn" : "");
  });
  items.forEach(item => {
    const fp = getFootprint(item);
    const cx = roofOx + (item.x_m + fp.w / 2) * scale, cy = roofOy + (item.y_m + fp.h / 2) * scale;
    const state = overlappingIds.has(item.id) || outOfBoundsIds.has(item.id) || setbackIds.has(item.id) ? "warn"
      : circulation.unreachable.has(item.id) ? "cut" : "";
    el += boardBadgeSvg(cx, cy, nums.get(item.id), (KIND_COLORS[item.kind] || KIND_COLORS.field).stroke, state);
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
    // Square to the side it stands on, pointing into the roof (any side of the Revit outline, not just the four of the bounding box).
    const [nx, ny] = entryInwardNormal(ep);
    // Base of the chevron must run perpendicular to the inward normal (a
    // 90°-rotated copy of it) so the triangle stays visible on every edge
    // — using a fixed horizontal base collapses to zero height on the
    // left/right edges, where the normal itself is horizontal.
    const tx = -ny, ty = nx;
    const selected = combineState.selectedKind === "entry" && combineState.selectedId === ep.id;
    el += `
      <g class="entry-marker${selected ? ' selected' : ''}" data-entry-id="${escapeHtml(ep.id)}" style="cursor:${isPlanner ? 'grab' : 'pointer'}">
        <circle cx="${x}" cy="${y}" r="7" />
        <path class="entry-arrow" d="M${x - 5 * tx},${y - 5 * ty} L${x + nx * 11},${y + ny * 11} L${x + 5 * tx},${y + 5 * ty} Z" />
      </g>
    `;
  });

  svg.innerHTML = el;
  renderCombineTray();
  renderCombineLegend({ nums, overlappingIds, outOfBoundsIds, setbackIds, unreachable: circulation.unreachable, zoneBad });

  const statusEl = document.getElementById("combine-status");
  if (statusEl) {
    const zoneCount = (combineState.zones || []).length;
    if (items.length === 0 && zoneCount === 0) {
      statusEl.textContent = "Push a sport or activity, or draw a ground zone, to begin.";
    } else if (items.length === 0) {
      statusEl.textContent = `${zoneCount} ground zone(s) drawn. Push a sport or activity to place pieces.`;
    } else if (overlappingIds.size > 0) {
      statusEl.textContent = `⚠ ${overlappingIds.size} piece(s) too close to a neighbor or an entry point (${DESIGN_RULES.zoneClearance_m.toFixed(1)} m same-zone / ${DESIGN_RULES.crossZoneClearance_m.toFixed(1)} m cross-zone / ${DESIGN_RULES.entryClearance_m.toFixed(1)} m from an entrance).`;
    } else if (anyOutOfBounds) {
      statusEl.textContent = "⚠ One or more pieces extend outside the roof boundary.";
    } else if (setbackIds.size > 0) {
      statusEl.textContent = `⚠ ${setbackIds.size} piece(s) sit inside the ${DESIGN_RULES.boundarySetback_m.toFixed(1)} m setback band.`;
    } else if (entries.length === 0) {
      statusEl.textContent = `${items.length} piece(s) placed. Add an entry point to check circulation.`;
    } else if (circulation.unreachable.size > 0) {
      statusEl.textContent = `⚠ ${circulation.unreachable.size} piece(s) aren't reachable from an entrance.`;
    } else if (typeof findZoneClashes === "function" && findZoneClashes().length > 0) {
      const n = findZoneClashes().length;
      statusEl.textContent = `⚠ ${n} ground zone clash(es) with a placed piece.`;
    } else if (typeof findZonesOutOfBounds === "function" && findZonesOutOfBounds().length > 0) {
      statusEl.textContent = "⚠ One or more ground zones extend outside the roof boundary.";
    } else {
      statusEl.textContent = `${items.length} piece(s) placed. Layout OK — all rules satisfied.`;
    }
  }

  renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, zoneConflicts, setbackIds);
  renderCombineSummary(circulation);
  if (typeof renderDesignPanel === "function") renderDesignPanel(circulation);
  // What is selected, and a record of the change — both read the state the
  // redraw just finished producing, so neither needs telling separately.
  if (typeof renderInspector === "function") renderInspector();
  if (typeof recordCombineHistory === "function") recordCombineHistory();
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
/**
 * Off by choice, and it stays off. The advisory recalculates on every drag, so
 * a designer who has already decided their rules gets the same suggestion
 * argued at them dozens of times while laying out a roof — the preference is
 * remembered rather than reset each session.
 */
const SMART_RULE_PREF_KEY = "sportify-smart-rules";

function smartRulesEnabled() {
  try { return localStorage.getItem(SMART_RULE_PREF_KEY) !== "off"; }
  catch (e) { return true; }
}

function setSmartRulesEnabled(on) {
  try { localStorage.setItem(SMART_RULE_PREF_KEY, on ? "on" : "off"); } catch (e) {}
  const box = document.getElementById("smart-rule-toggle");
  if (box) box.checked = on;
  const lbl = document.querySelector('label[for="smart-rule-toggle"]');
  if (lbl) lbl.textContent = on ? "On" : "Off";
  renderSmartRuleAdvisory();
}

function renderSmartRuleAdvisory() {
  const el = document.getElementById("smart-rule-advisory");
  if (!el) return;

  if (!smartRulesEnabled()) {
    el.innerHTML = `<p class="hint">Off — turn it on to see an area-based recommendation for entries and circulation width.</p>`;
    return;
  }

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
function renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, zoneConflicts, setbackIds) {
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
      label: `Clearance (${DESIGN_RULES.zoneClearance_m.toFixed(1)} m same-zone / ${DESIGN_RULES.crossZoneClearance_m.toFixed(1)} m cross-zone)`,
      detail: overlappingIds.size === 0 ? "All pieces respect the zone-aware gap." : `${overlappingIds.size} piece(s) too close to a neighbor or an entry point.`,
    });
    rows.push({
      passed: !anyOutOfBounds,
      label: "Inside site boundary",
      detail: !anyOutOfBounds ? "Everything fits inside the roof footprint." : "One or more pieces extend past the edge.",
    });
    rows.push({
      passed: !setbackIds || setbackIds.size === 0,
      label: `Setback respected (${DESIGN_RULES.boundarySetback_m.toFixed(1)} m)`,
      detail: !setbackIds || setbackIds.size === 0
        ? "No sport sits inside the boundary setback."
        : `${setbackIds.size} piece(s) inside the setback band (only the locker and bathroom modules may stand there).`,
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
        <div class="rule-label">${escapeHtml(r.label)}</div>
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
      <span class="suggestion-num">${i + 1}</span><span class="suggestion-text">${escapeHtml(c.reason)}</span><span class="suggestion-score">${c.score}</span>
    </button>`).join("");
  listEl.querySelectorAll(".suggestion-row").forEach(btn => {
    btn.addEventListener("click", () => { if (typeof applySuggestion === "function") applySuggestion(Number(btn.dataset.suggestionIndex)); });
  });
}

/**
 * A tray thumbnail: the piece itself, not a coloured square.
 *
 * The tray is where you decide which of three pushed pieces to drag out next,
 * and "rounded rectangle, rounded rectangle, rounded rectangle" does not help
 * with that. Everything here can already draw itself — the courts draw their
 * markings on the roof, the furniture draws its elevation in the catalogue —
 * so the thumbnail reuses those renderers rather than inventing a third
 * picture of the same object that could drift out of step with them.
 *
 * Which view depends on what identifies the thing. A court is its markings, so
 * it is shown in plan, the same way it will look once dropped. A bench in plan
 * is a 1.8 m bar and so is a table and so is a bin, so furniture is shown in
 * elevation instead — the view that answers "which one is this".
 */
function trayThumbSvg(item, boxW, boxH) {
  // Furniture: elevation, stripped of dimensions and the scale figure.
  if (typeof isFurnitureItem === "function" && isFurnitureItem(item)
      && typeof furnitureElevationSvg === "function") {
    const f = item.sourceJson?.furniture;
    if (f) return furnitureElevationSvg(f, { width: boxW, height: boxH, bare: true });
  }

  const pad = 3;
  const fp = typeof getFootprint === "function"
    ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  const fit = Math.min((boxW - pad * 2) / fp.w, (boxH - pad * 2) / fp.h);
  const w = fp.w * fit, h = fp.h * fit;
  const x = (boxW - w) / 2, y = (boxH - h) / 2;
  const dark = typeof isDarkMode === "function" && isDarkMode();
  const colors = (typeof KIND_COLORS !== "undefined" && KIND_COLORS[item.kind]) || { fill: "#6f7681", stroke: "#8a9099" };

  let art;
  // "simple" throughout: at 64 px the service lines and the three-point arc
  // turn to mush, and the court is recognised by its outline and key anyway.
  if (typeof isPadelItem === "function" && isPadelItem(item)) {
    art = padelCourtSvg(x, y, w, h, padelStateForItem(item), "simple", dark);
  } else if (typeof isBasketballItem === "function" && isBasketballItem(item)) {
    art = basketballCourtSvg(x, y, w, h, basketballStateForItem(item), "simple", dark);
  } else if (typeof isVolleyballItem === "function" && isVolleyballItem(item)) {
    art = volleyballCourtSvg(x, y, w, h, volleyballStateForItem(item), "simple", dark);
  } else if (item.kind === "vegetation") {
    // A crown and a trunk, the same as on the roof.
    const r = Math.min(w, h) / 2;
    art = `<circle cx="${boxW / 2}" cy="${boxH / 2}" r="${r}" fill="${colors.fill}"
                   stroke="${colors.stroke}" stroke-width="1.5"/>
           <circle cx="${boxW / 2}" cy="${boxH / 2}" r="1.6" fill="${colors.stroke}"/>`;
  } else {
    // Anything without a renderer of its own still gets its real proportions,
    // which is more than the old square said.
    art = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
                 rx="2" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"/>`;
  }

  return `<svg viewBox="0 0 ${boxW} ${boxH}" width="${boxW}" height="${boxH}">${art}</svg>`;
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
      <div class="tray-thumb" data-tray-id="${escapeHtml(it.id)}" style="--thumb-fill:${colors.fill};--thumb-stroke:${colors.stroke}" title="${escapeHtml(it.label)} — ${it.length_m}m × ${it.width_m}m">
        <button class="tray-thumb-remove" data-tray-remove="${escapeHtml(it.id)}" title="Remove"><i class="ti ti-x" aria-hidden="true"></i></button>
        <div class="tray-thumb-box">${trayThumbSvg(it, 64, 50)}</div>
        <span class="tray-thumb-label">${escapeHtml(it.label)}</span>
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
    ghost.style.left = `${e.clientX - 39}px`;   // half the thumb's width
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

    if (combineState.tool === "drawZone") {
      const { scale, roofOx, roofOy } = combineLayout();
      beginZoneDraw((pt.x - roofOx) / scale, (pt.y - roofOy) / scale);
      dragState = { kind: "zoneDraw" };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // A corner handle is tested before the zone body, or grabbing a corner
    // would move the whole zone instead of resizing it.
    // A + on an edge inserts a corner there and hands you the drag, so adding
    // a point and placing it are one gesture rather than two.
    const addEl = e.target.closest("[data-zone-addpoint]");
    if (addEl && typeof addZonePoint === "function") {
      const zid = addEl.dataset.zoneId;
      const edge = Number(addEl.dataset.zoneAddpoint);
      addZonePoint(zid, edge);
      combineState.selectedKind = "zone"; combineState.selectedId = zid;
      dragState = { kind: "zonePoint", id: zid, index: edge + 1 };
      drawCombineCanvas();
      return;
    }

    const pointEl = e.target.closest("[data-zone-point]");
    if (pointEl) {
      const zid = pointEl.dataset.zoneId;
      const idx = Number(pointEl.dataset.zonePoint);
      // Double-click removes it; a bed that gained a corner by accident should
      // not need undo to lose it again.
      if (e.detail >= 2 && typeof removeZonePoint === "function") {
        removeZonePoint(zid, idx);
        drawCombineCanvas();
        return;
      }
      combineState.selectedKind = "zone"; combineState.selectedId = zid;
      dragState = { kind: "zonePoint", id: zid, index: idx };
      drawCombineCanvas();
      return;
    }

    const handleEl = e.target.closest("[data-zone-handle]");
    if (handleEl) {
      dragState = { kind: "zoneResize", id: handleEl.dataset.zoneId, corner: handleEl.dataset.zoneHandle };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    const zoneEl = e.target.closest("[data-zone-id]");
    if (zoneEl) {
      const zone = getZone(zoneEl.dataset.zoneId);
      combineState.selectedKind = "zone";
      combineState.selectedId = zoneEl.dataset.zoneId;
      drawCombineCanvas();
      if (typeof renderZonePanel === "function") renderZonePanel();

      if (document.documentElement.dataset.role === "client" || !zone) return;
      const { scale, roofOx, roofOy } = combineLayout();
      dragState = {
        kind: "zoneMove", id: zone.id,
        grabXm: (pt.x - roofOx) / scale - zone.x_m,
        grabYm: (pt.y - roofOy) / scale - zone.y_m,
      };
      svg.setPointerCapture(e.pointerId);
      return;
    }

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

    if (dragState.kind === "zoneDraw" || dragState.kind === "zoneMove"
        || dragState.kind === "zoneResize" || dragState.kind === "zonePoint") {
      const { scale, roofOx, roofOy } = combineLayout();
      const zp = svgPoint(svg, e);
      const xm = (zp.x - roofOx) / scale, ym = (zp.y - roofOy) / scale;
      if (dragState.kind === "zoneDraw") updateZoneDraw(xm, ym);
      else if (dragState.kind === "zoneMove") moveZoneTo(dragState.id, xm - dragState.grabXm, ym - dragState.grabYm);
      else if (dragState.kind === "zonePoint") moveZonePoint(dragState.id, dragState.index, xm, ym);
      else resizeZoneTo(dragState.id, dragState.corner, xm, ym);
      drawCombineCanvas();
      return;
    }

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
      // Entries only ever live on the roof's edge — re-snap to whichever
      // side of the outline is nearest the pointer (can cross to a different
      // side mid-drag), grid-stepping ALONG that side so it never leaves it.
      const snap = nearestBoundaryPoint(combineState.roof, rawXm, rawYm, SNAP_GRID_M);
      entry.edge = snap.edge;
      entry.x_m = snap.x;
      entry.y_m = snap.y;
      entry.nx = snap.nx;
      entry.ny = snap.ny;
      drawCombineCanvas();
      return;
    }

    const dxM = (pt.x - dragState.startPtX) / dragState.scale;
    const dyM = (pt.y - dragState.startPtY) / dragState.scale;
    const item = combineState.items.find(i => i.id === dragState.id);
    if (!item) return;

    const nextX = snapToGrid(dragState.startXm + dxM);
    const nextY = snapToGrid(dragState.startYm + dyM);

    // The drag simply doesn't follow into a drawn zone, which reads as the
    // piece bumping into it rather than as an error.
    const itemFp = getFootprint(item);
    if (typeof zonesUnder === "function" && item.kind !== "vegetation"
        && zonesUnder(nextX, nextY, itemFp.w, itemFp.h).length > 0) return;

    item.x_m = nextX;
    item.y_m = nextY;
    drawCombineCanvas();
  });

  ["pointerup", "pointercancel"].forEach(evtName =>
    svg.addEventListener(evtName, () => {
      const wasDrawingZone = dragState && dragState.kind === "zoneDraw";
      const wasZoneGesture = dragState && dragState.kind && dragState.kind.startsWith("zone");
      const wasDragging = dragState && dragState.kind !== "pan";
      dragState = null;

      if (wasDrawingZone) {
        finishZoneDraw();
        // One rectangle per click of the tool, matching Add Entry Point —
        // otherwise every later canvas click keeps drawing.
        combineState.tool = null;
        if (typeof syncDrawZoneTool === "function") syncDrawZoneTool();
        return;
      }
      if (wasZoneGesture) { if (typeof renderZonePanel === "function") renderZonePanel(); return; }
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