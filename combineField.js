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

const PAIR_SNAP_M = 0.5;   // a Ping Pong table dragged this close to a pair spot beside another table snaps into it

/**
 * Ping Pong tables only (user, 2026-09-28): a table's size (e.g. 7.6 x 4.6 m) is not a multiple of the 0.5 m grid, so on the grid alone two tables can never
 * touch - they overlap by 0.1 m or leave a 0.4 m gap, and the pair rule flags both. Dragged near the spot where it would stand long edge to long edge beside
 * another table, ends lined up (the Algorithmic placement's Ping Pong pair), the table snaps exactly into that spot instead. `rawX/rawY` = where the pointer
 * puts it before any snapping; returns [x, y] (the grid position when no pair spot is near).
 */
function pingPongPairSnap(item, rawX, rawY, gridX, gridY) {
  const isTable = it => it.kind === "activity" && it.sourceJson?.activity?.type_id === "ping_pong";
  if (!isTable(item)) return [gridX, gridY];
  const fp = getFootprint(item);
  let best = null;
  combineState.items.forEach(o => {
    if (o.id === item.id || !isTable(o)) return;
    const ofp = getFootprint(o);
    if (Math.abs(ofp.w - fp.w) > 1e-6 || Math.abs(ofp.h - fp.h) > 1e-6) return;     // same size, turned the same way
    const spots = fp.w >= fp.h
      ? [[o.x_m, o.y_m + ofp.h], [o.x_m, o.y_m - fp.h]]                            // long edges run along x: above or below
      : [[o.x_m + ofp.w, o.y_m], [o.x_m - fp.w, o.y_m]];                           // long edges run along y: left or right
    spots.forEach(([x, y]) => {
      const d = Math.max(Math.abs(x - rawX), Math.abs(y - rawY));
      if (d <= PAIR_SNAP_M && (!best || d < best.d)) best = { x, y, d };
    });
  });
  return best ? [best.x, best.y] : [gridX, gridY];
}

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
  // Pieces pushed from the Revit families tab — the user's own loaded
  // content rather than one of the app's built-in presets. Its own colour
  // so a designer can see at a glance which pieces came from their model.
  revit:    { stroke: "#d97706", fill: "rgba(217,119,6,0.32)" },
  // The Garden tab's blocks (Planter S / T, Park Bench and Table): earthy brown, so they don't read as green roof zones.
  gardenBlock: { stroke: "#8a5a2b", fill: "rgba(138,90,43,0.35)" },
  // Louvre pergolas, sails, screens, fences: its own teal, distinct from every static category — these are the pieces Revit's Kinetics ribbon can put in motion.
  kinetics: { stroke: "#0891b2", fill: "rgba(8,145,178,0.32)" },
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
 * Maps a board piece's key (kind + item.sourceJson.field.sport / .activity.type_id / .gardenBlock.type — the one identifier both catalogues agree on; item
 * labels differ between them, e.g. "Ping Pong Station" vs "Ping Pong" for the same thing) to the algorithmic engine's name and zone classification. Built
 * once from ALGO_CATALOGUE (algoPlacementUI.js) cross-referenced with AlgoPlacement.zoneOf/noSetback (algoPlacementCore.js) — lazily, since those scripts
 * load after this one; by the time a redraw actually runs (after the page has fully loaded) both are available. The kinetic elements are left out: the
 * Algorithmic placement no longer offers them, so on the board they keep the plain checks of a piece the engine does not know.
 */
function algoZoneLookup() {
  if (_algoZoneLookup) return _algoZoneLookup;
  if (typeof ALGO_CATALOGUE === "undefined" || typeof AlgoPlacement === "undefined") return {};
  const map = {};
  Object.keys(ALGO_CATALOGUE).forEach(engineName => {
    const cat = ALGO_CATALOGUE[engineName];
    if (cat.kind === "kinetics") return;
    const key = cat.kind + ":" + (cat.kind === "field" ? cat.sport : cat.id);
    map[key] = { name: engineName, zone: AlgoPlacement.zoneOf(engineName), noSetback: AlgoPlacement.noSetback(engineName) };
  });
  _algoZoneLookup = map;
  return map;
}

/**
 * A Combine item's engine name (null for a piece the Algorithmic placement does not place), its zone ("indoor"/"garden"/"outdoor") and whether it is
 * exempt from the boundary setback (only the two service modules, which stand against a real wall, are). A piece the engine does not know counts as
 * "outdoor" and not exempt.
 */
function itemZoneInfo(item) {
  const id = item.kind === "field" ? item.sourceJson?.field?.sport
    : item.kind === "activity" ? item.sourceJson?.activity?.type_id
      : item.kind === "gardenBlock" ? item.sourceJson?.gardenBlock?.type
        : item.kind === "furniture" ? item.sourceJson?.furniture?.key      // only the catalogue products the Algorithmic placement offers (the Picknickset)
          : null;
  return (id && algoZoneLookup()[item.kind + ":" + id]) || { name: null, zone: "outdoor", noSetback: false };
}

/* ── The Manual board follows the Algorithmic placement's rules (user, 2026-09-28: "the manual one has to adapt") ──
 * Every number and test below is the engine's own (algoPlacementCore.js validate / requiredGapCells / hasAccess), read from the same settings the
 * Algorithmic placement panel uses (algoPlacementUI.js algoZoningOn / algoSetback / algoEntryRects / algoBuildSite), so a board that passes here is one the
 * engine would accept, and an Applied layout never shows a flag. The rule files themselves are not touched.
 */
const BOARD_SERVICE_LOBBY_M = 2.0;                        // = SERVICE_LOBBY_M in algoPlacementCore.js: clear in front of a locker / bathroom module
const BOARD_NO_CLUSTER = new Set(["Rest / Hydration Area"]); // = NO_CLUSTER in algoPlacementCore.js: indoor, but not inside the indoor zone's wall
const BOARD_PING_PONG = "Ping Pong Outdoor";              // two of these may stand long edge to long edge (the locked Ping Pong pair rule)
const BOARD_EPS = 0.02;                                   // m, slack for positions typed or dragged by hand
// THE ONE RULE DIFFERENCE from the Algorithmic placement (user, 2026-09-28): a piece a Garden Core preset placed (gardenPresets.js tags it `preset`) needs
// only this much from an entrance's way in, instead of the engine's ENTRY_GAP_M (2.5 m) - the presets' Calisthenics stands 2.28 m from one on the user's
// roof. Every other piece, and the Algorithmic placement itself, keep 2.5 m.
const BOARD_PRESET_ENTRY_GAP_M = 2.25;
const boardIsPresetPiece = it => !!(it.preset || it.sourceJson?.preset);

/**
 * The distances the engine works with, in metres. With a roof type (zoning): 1.5 m inside a zone (the narrowest in-zone path it makes), the primary path
 * width between zones and to the indoor zone's wall, 2.5 m round an entrance's way in, 2.0 m in front of a service module; without one, the plain 2.0 m
 * rule everywhere. W = the narrowest primary pathway the engine may build (the panel's "narrowest if needed", never under 2.0 m).
 */
function boardRules() {
  const A = AlgoPlacement;
  const minPath = typeof ALGO_MIN_PATH_M !== "undefined" ? ALGO_MIN_PATH_M : 2.0;
  const s = typeof algoState !== "undefined" ? algoState.settings : {};
  const W = Math.max(minPath, Math.min(Number(s.minPathW) || minPath, Number(s.pathW) || minPath));
  const zoning = typeof algoZoningOn === "function" && algoZoningOn();
  const base = { zoning, W, minAcc: Math.min(A.MIN_ACCESS_M, W), setback: typeof algoSetback === "function" ? algoSetback() : DESIGN_RULES.boundarySetback_m };
  return zoning
    ? Object.assign(base, { zgap: Math.min(...A.ZONE_GAP_OPTIONS_M), xgap: W, egap: A.ENTRY_GAP_M, lobby: BOARD_SERVICE_LOBBY_M })
    : Object.assign(base, { gap: minPath, egap: minPath });
}

/** The clear gap (m) two pieces must keep: requiredGapCells in the engine (the Locker + Bathroom share a wall; a service module needs its lobby). */
function boardRequiredGap(za, zb, R) {
  if (!R.zoning) return R.gap;
  if (za.noSetback && zb.noSetback) return 0;
  const base = za.zone === zb.zone ? R.zgap : R.xgap;
  return (za.noSetback || zb.noSetback) ? Math.max(base, R.lobby) : base;
}

const boardRect = it => { const fp = getFootprint(it); return [it.x_m, it.y_m, it.x_m + fp.w, it.y_m + fp.h]; };
/** How far apart two rectangles are, the engine's way: the larger of the x and y separations (negative = they overlap). "Closer than g" = this < g. */
const boardSep = (a, b) => Math.max(Math.max(b[0] - a[2], a[0] - b[2]), Math.max(b[1] - a[3], a[1] - b[3]));

/** Two outdoor Ping Pong tables side by side along their LONG edges, touching, ends lined up: the engine's Ping Pong pair (no path between them). */
function boardIsPingPongPair(a, b, ra, rb) {
  if (a.name !== BOARD_PING_PONG || b.name !== BOARD_PING_PONG) return false;
  const same = (p, q) => Math.abs(p - q) <= BOARD_EPS;
  const long = r => r[2] - r[0] >= r[3] - r[1] - 1e-9 ? "x" : "y";
  if (long(ra) !== long(rb)) return false;
  if (long(ra) === "x") return same(ra[0], rb[0]) && same(ra[2], rb[2]) && (same(ra[3], rb[1]) || same(rb[3], ra[1]));
  return same(ra[1], rb[1]) && same(ra[3], rb[3]) && (same(ra[2], rb[0]) || same(rb[2], ra[0]));
}

/** Is the rectangle (metres) on the real roof outline: its corners inside, and no corner of the outline (a notch) poking into it. */
function boardRectOnRoof(r, poly) {
  const P = poly.map(p => ({ x: p[0], y: p[1] })), e = BOARD_EPS;
  const cornersIn = [[r[0] + e, r[1] + e], [r[2] - e, r[1] + e], [r[0] + e, r[3] - e], [r[2] - e, r[3] - e]].every(([x, y]) => pointInPolygon(P, x, y));
  return cornersIn && !poly.some(([x, y]) => x > r[0] + e && x < r[2] - e && y > r[1] + e && y < r[3] - e);
}

let _boardSite = { key: null, site: null, error: null };
/** The engine's own site (grid of the real outline, garden band, entrance ways in, openings), built exactly as the Algorithmic placement builds it; cached. */
function boardAlgoSite() {
  if (typeof algoBuildSite !== "function" || typeof algoSiteKey !== "function") return { site: null, error: "Algorithmic placement not loaded" };
  let key;
  try { key = algoSiteKey(); } catch (ex) { return { site: null, error: ex.message }; }
  if (_boardSite.key !== key) {
    _boardSite.key = key;
    try { _boardSite.site = algoBuildSite(); _boardSite.error = null; } catch (ex) { _boardSite.site = null; _boardSite.error = ex.message; }
  }
  return _boardSite;
}

/** A rectangle in metres as the engine grid's cells (rounded to the nearest cell: the engine places on a 0.1 m grid). */
function boardCells(g, r) {
  const res = AlgoPlacement.RES;
  return [Math.round((r[0] - g.ox) / res), Math.round((r[1] - g.oy) / res), Math.round((r[2] - g.ox) / res), Math.round((r[3] - g.oy) / res)];
}

/**
 * Every rule the engine's own final check (validate) holds a layout to, applied to the pieces on the board. Returns
 *   tooClose   ids closer than the engine's gap to a neighbour, to an entrance's way in, or (zoning) to the indoor zone's wall line
 *   outOfBounds ids not on the real roof outline
 *   setback    ids in the garden band (only the service modules may stand there), on an entrance's way in, or on an opening / equipment
 *   circulation { paths, unreachable }: every piece must touch a pathway at least W wide over MIN_ACCESS_M of its edge, the pathways starting at the
 *              entrances and staying out of the garden band and the green beds - or (zoning) face a reached piece of its own zone across an in-zone path
 *   area       { total, usable, pct, limit } the courts' share of the sports area (the engine's 75 % limit)
 *   R, site, error
 * `only` = restrict the per-piece checks to these ids (the suggested spots test one piece at a time); `skipAccess` leaves the pathway search out.
 */
function boardRuleCheck(items, opts = {}) {
  const out = { tooClose: new Set(), wallIds: new Set(), outOfBounds: new Set(), setback: new Set(), circulation: { paths: [], unreachable: new Set() }, area: null, R: null, site: null, error: null };
  if (typeof AlgoPlacement === "undefined" || typeof algoFootprint !== "function") return out;
  const R = out.R = boardRules();
  const { site, error } = boardAlgoSite();
  out.site = site; out.error = error;
  const poly = algoFootprint();
  const info = items.map(itemZoneInfo), rects = items.map(boardRect);
  const entryRects = typeof algoEntryRects === "function" ? algoEntryRects() : [];
  const check = i => !opts.only || opts.only.has(items[i].id);
  const g = site ? (R.zoning && site.full ? site.full : site.grid) : null;

  // on the roof, out of the garden band, off the entrances' ways in and off openings (validate: itemFree / outdoorOk, or the plain usable zone)
  items.forEach((it, i) => {
    if (!check(i)) return;
    if (!boardRectOnRoof(rects[i], poly)) { out.outOfBounds.add(it.id); return; }
    if (!g || !info[i].name) return;
    const c = boardCells(g, rects[i]);
    const ok = R.zoning ? g.itemFree(c) && (info[i].noSetback || g.outdoorOk(c)) : g.isFree(c);
    if (!ok) out.setback.add(it.id);
  });

  // the gaps between pieces, with the Ping Pong pair's shared long edge allowed (each table has at most one partner)
  const partner = new Map();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!check(i) && !check(j)) continue;
      const need = boardRequiredGap(info[i], info[j], R), sep = boardSep(rects[i], rects[j]);
      if (sep >= need - BOARD_EPS) continue;
      if (sep > -BOARD_EPS && !partner.has(i) && !partner.has(j) && boardIsPingPongPair(info[i], info[j], rects[i], rects[j])) { partner.set(i, j); partner.set(j, i); continue; }
      out.tooClose.add(items[i].id); out.tooClose.add(items[j].id);
    }
  }
  // the entrances' ways in (validate: egap round every entry; the plain rule: the court gap)
  items.forEach((it, i) => {
    const egap = boardIsPresetPiece(it) ? Math.min(R.egap, BOARD_PRESET_ENTRY_GAP_M) : R.egap;
    if (check(i) && entryRects.some(E => boardSep(rects[i], E) < egap - BOARD_EPS)) out.tooClose.add(it.id);
  });
  // the indoor zone's wall line: nothing but indoor items within the primary-path width of the box round the indoor cluster (validate)
  if (R.zoning) {
    let box = null;
    items.forEach((it, i) => {
      if (info[i].zone !== "indoor" || !info[i].name || BOARD_NO_CLUSTER.has(info[i].name)) return;
      const r = rects[i];
      box = box ? [Math.min(box[0], r[0]), Math.min(box[1], r[1]), Math.max(box[2], r[2]), Math.max(box[3], r[3])] : r.slice();
    });
    if (box) items.forEach((it, i) => {
      if (check(i) && info[i].zone !== "indoor" && boardSep(box, rects[i]) < R.xgap - BOARD_EPS) { out.tooClose.add(it.id); out.wallIds.add(it.id); }
    });
  }

  // the courts' share of the sports area (the engine refuses more than BUILT_LIMIT_PCT)
  if (site) {
    const total = items.reduce((s, it, i) => s + (info[i].name ? (rects[i][2] - rects[i][0]) * (rects[i][3] - rects[i][1]) : 0), 0);
    out.area = { total, usable: site.usableArea, pct: site.usableArea > 0 ? 100 * total / site.usableArea : 0, limit: AlgoPlacement.BUILT_LIMIT_PCT };
  }

  if (!opts.skipAccess) out.circulation = boardCirculation(items, info, rects, g, R);
  return out;
}

/**
 * The engine's access rule (hasAccess / validate) on the board. There are no drawn pathways here, so a pathway is any free W x W square the engine could lay:
 * on the roof, out of the garden band, off the entrances' ways in, openings, pieces and green beds (green beds are not pathways). Squares are joined cell by
 * cell starting beside each entrance's way in; a piece is reached when reached squares cover at least MIN_ACCESS_M of one of its edges, or (zoning) when it
 * faces a reached piece of its own zone across a gap no wider than a primary path (an in-zone path). Returns { paths, unreachable } like computeCirculation.
 */
function boardCirculation(items, info, rects, g, R) {
  const unreachable = new Set(), paths = [];
  if (!items.length) return { paths, unreachable };
  if (!g || !combineState.entryPoints.length) { items.forEach(it => unreachable.add(it.id)); return { paths, unreachable }; }
  const res = AlgoPlacement.RES, nx = g.nx, ny = g.ny, W = Math.round(R.W / res), minAcc = Math.round(R.minAcc / res);
  const cells = rects.map(r => boardCells(g, r));
  // what a pathway may not cross besides the grid's own blocks: the pieces and the green beds
  const block = new Uint8Array(nx * ny);
  const fill = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(ny, y1); y++) block.fill(1, y * nx + Math.max(0, x0), y * nx + Math.min(nx, x1)); };
  cells.forEach(c => fill(c[0], c[1], c[2], c[3]));
  (combineState.zones || []).filter(z => (z.kind || "green_roof") === "green_roof" && Array.isArray(z.points) && z.points.length >= 3).forEach(z => {
    const P = z.points.map(p => ({ x: p.x_m, y: p.y_m }));
    const xs = P.map(p => p.x), ys = P.map(p => p.y);
    const c = boardCells(g, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    for (let y = Math.max(0, c[1] - 1); y < Math.min(ny, c[3] + 1); y++) for (let x = Math.max(0, c[0] - 1); x < Math.min(nx, c[2] + 1); x++) {
      if (pointInPolygon(P, g.ox + (x + 0.5) * res, g.oy + (y + 0.5) * res)) block[y * nx + x] = 1;
    }
  });
  const S = new Int32Array((nx + 1) * (ny + 1));
  for (let y = 0; y < ny; y++) {
    let run = 0;
    for (let x = 0; x < nx; x++) { run += block[y * nx + x]; S[(y + 1) * (nx + 1) + x + 1] = S[y * (nx + 1) + x + 1] + run; }
  }
  const px = nx - W + 1, py = ny - W + 1;
  if (px <= 0 || py <= 0) { items.forEach(it => unreachable.add(it.id)); return { paths, unreachable }; }
  const okAt = (x, y) => x >= 0 && y >= 0 && x < px && y < py && g.isFree([x, y, x + W, y + W])
    && S[(y + W) * (nx + 1) + x + W] - S[y * (nx + 1) + x + W] - S[(y + W) * (nx + 1) + x] + S[y * (nx + 1) + x] === 0;

  // breadth-first over the squares' top-left corners, from the squares that touch an entrance's way in
  const parent = new Int32Array(px * py).fill(-2), queue = [];
  const seed = (x, y) => { if (okAt(x, y) && parent[y * px + x] === -2) { parent[y * px + x] = -1; queue.push(y * px + x); } };
  g.entryCells.forEach(E => {
    for (let y = E[1] - W + 1; y < E[3]; y++) { seed(E[0] - W, y); seed(E[2], y); }
    for (let x = E[0] - W + 1; x < E[2]; x++) { seed(x, E[1] - W); seed(x, E[3]); }
  });
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi], x = k % px, y = (k - x) / px;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nxp = x + dx, nyp = y + dy;
      if (nxp < 0 || nyp < 0 || nxp >= px || nyp >= py) continue;
      const nk = nyp * px + nxp;
      if (parent[nk] !== -2 || !okAt(nxp, nyp)) continue;
      parent[nk] = k; queue.push(nk);
    }
  }
  const reachedAt = (x, y) => x >= 0 && y >= 0 && x < px && y < py && parent[y * px + x] !== -2;

  // a piece is reached by the squares lying flush along one of its edges, when they cover at least minAcc of it
  const reached = items.map(() => false), via = items.map(() => -1);
  cells.forEach((c, i) => {
    const sides = [
      { len: c[3] - c[1], at: t => [c[2], c[1] + t] }, { len: c[3] - c[1], at: t => [c[0] - W, c[1] + t] },
      { len: c[2] - c[0], at: t => [c[0] + t, c[3]] }, { len: c[2] - c[0], at: t => [c[0] + t, c[1] - W] }
    ];
    for (const s of sides) {
      const cover = new Uint8Array(Math.max(0, s.len));
      let first = -1;
      for (let t = -W + 1; t < s.len; t++) {
        const [x, y] = s.at(t);
        if (!reachedAt(x, y)) continue;
        if (first < 0) first = y * px + x;
        cover.fill(1, Math.max(0, t), Math.min(s.len, t + W));
      }
      if (cover.reduce((a, v) => a + v, 0) >= Math.min(minAcc, s.len)) { reached[i] = true; via[i] = first; break; }
    }
  });
  // zoning: across an in-zone path from a reached piece of the same zone (validate's second pass; never across the Locker / Bathroom shared wall)
  if (R.zoning) for (let moved = true; moved;) {
    moved = false;
    for (let i = 0; i < items.length; i++) {
      if (reached[i]) continue;
      for (let j = 0; j < items.length; j++) {
        if (!reached[j] || info[i].zone !== info[j].zone || (info[i].noSetback && info[j].noSetback)) continue;
        const gap = Math.round(Math.max(boardRequiredGap(info[i], info[j], R), R.W) / res), a = cells[i], b = cells[j];
        const dx = Math.max(a[0] - b[2], b[0] - a[2]), dy = Math.max(a[1] - b[3], b[1] - a[3]);
        const face = dx >= 0 && dx <= gap + 1 ? Math.min(a[3], b[3]) - Math.max(a[1], b[1]) : dy >= 0 && dy <= gap + 1 ? Math.min(a[2], b[2]) - Math.max(a[0], b[0]) : 0;
        if (face >= Math.min(minAcc, a[2] - a[0], a[3] - a[1])) { reached[i] = true; moved = true; break; }
      }
    }
  }
  items.forEach((it, i) => {
    if (!reached[i]) { unreachable.add(it.id); return; }
    if (via[i] < 0) return;
    const pts = [];
    for (let k = via[i]; k >= 0; k = parent[k]) { const x = k % px, y = (k - x) / px; pts.push({ x: g.ox + (x + W / 2) * res, y: g.oy + (y + W / 2) * res }); }
    paths.push({ itemId: it.id, points: typeof simplifyPath === "function" ? simplifyPath(pts.reverse()) : pts.reverse() });
  });
  return { paths, unreachable };
}

/** The pieces the rules flag, for the old callers (a piece closer than the engine's gap to a neighbour, an entrance's way in or the indoor zone's wall). */
function findClearanceViolations(items) {
  return boardRuleCheck(items, { skipAccess: true }).tooClose;
}

/** Ids of every piece in the garden band (only the Locker and Bathroom modules may stand there), on an entrance's way in, or on an opening. */
function findSetbackViolations(items) {
  return boardRuleCheck(items, { skipAccess: true }).setback;
}

/** Would `item` break no placement rule at (x, y, rotation)? Position and gaps only (the suggested spots ask this of many spots, so no pathway search). */
function boardSpotOk(item, x, y, rotation) {
  const moved = Object.assign({}, item, { x_m: x, y_m: y, rotation });
  const others = combineState.items.filter(it => it.id !== item.id);
  const r = boardRuleCheck(others.concat([moved]), { only: new Set([item.id]), skipAccess: true });
  return !r.tooClose.has(item.id) && !r.outOfBounds.has(item.id) && !r.setback.has(item.id);
}

/**
 * The algorithmic engine's indoor-zone wall + door (combineState.walls,
 * populated by algoApply — see algoPlacementUI.js), drawn the same way
 * algoDrawPreview already draws it in the Algorithmic placement preview so
 * the board doesn't make a different claim about the zone than the panel
 * that produced it. Not part of combineState.items, so it never enters the
 * clearance/setback/overlap checks and cannot be dragged; it CAN be selected
 * (click the wall or its door: the whole wall, kind "wall") and removed with
 * Remove selected / Delete. It also goes when the Locker or Bathroom module is
 * removed, or with Clear all (combineController.js). (user, 2026-09-27)
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
    const sel = combineState.selectedKind === "wall" && combineState.selectedId === w.id;
    const stroke = sel ? "#2563eb" : lineColor, wid = escapeHtml(w.id);
    svg += `<g data-wall-id="${wid}" style="cursor:pointer"><title>Wall of the indoor zone — click to select, then Remove selected</title>` + w.rects.map(r => {
      const x = roofOx + r[0] * scale, y = roofOy + r[1] * scale;
      const rw = (r[2] - r[0]) * scale, rh = (r[3] - r[1]) * scale;
      return `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${sel ? "#dbeafe" : wallColor}" stroke="${stroke}" stroke-width="${sel ? 2.5 : 1.5}"/>`;
    }).join("");
    if (w.door) {
      const d = w.door;
      const x1 = roofOx + d.x0 * scale, y1 = roofOy + d.y0 * scale, x2 = roofOx + d.x1 * scale, y2 = roofOy + d.y1 * scale;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" stroke-dasharray="4,3"/>`
        + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="10"/>`;   // an easier target than the thin dashed door
    }
    svg += `</g>`;
  });
  return svg;
}

/**
 * The garden band (the boundary setback) as the Algorithmic placement's engine lays it along the real roof outline: a faint shaded band, the same area the
 * setback check above flags. Falls back to the dashed inset rectangle while the engine's site is not available.
 */
function setbackGuideSvg(roof, scale, roofOx, roofOy) {
  const site = typeof boardAlgoSite === "function" ? boardAlgoSite().site : null;
  if (site && site.bandRects) {
    return `<g opacity="0.5" pointer-events="none">` + site.bandRects.map(r =>
      `<rect x="${roofOx + r[0] * scale}" y="${roofOy + r[1] * scale}" width="${(r[2] - r[0]) * scale}" height="${(r[3] - r[1]) * scale}" fill="rgba(140,140,140,0.22)"/>`).join("") + `</g>`;
  }
  const sb = Math.min(DESIGN_RULES.boundarySetback_m, roof.length / 2 - 0.05, roof.width / 2 - 0.05);
  if (sb <= 0) return "";
  const x = roofOx + sb * scale, y = roofOy + sb * scale;
  const w = (roof.length - sb * 2) * scale, h = (roof.width - sb * 2) * scale;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#bbb" stroke-width="1" stroke-dasharray="2,4" opacity="0.6"/>`;
}

/**
 * A court or activity on the board drawn the way the Sport tab draws it (user, 2026-09-29). Every drawing here is the Sport tab's own function, called and
 * never copied (field.js fieldCourtSvg, footballCourt.js footballCourtSvg, pingPongTable.js pingPongCourtSvg, activityField.js activityCourtSvg /
 * activityFloorSvg, climbingTower.js towerPlanSvg, activityFamilies.js activityFamilyPlanSvg), so when a teammate changes how the Sport tab draws an
 * element, the board follows by itself. A placed piece is drawn with the settings its Push carried (its own court type, playing space, family values),
 * falling back to the panel's. Drawn in the piece's own frame (its length along x) and turned with it. "" = no Sport tab drawing for it.
 * (Basketball, volleyball and padel keep their own branches in drawCombineCanvas, which already use the Sport tab's renderers.)
 */
function sportTabPieceSvg(item, x, y, w, h, scale) {
  const dark = typeof isDarkMode === "function" && isDarkMode();
  const L = item.length_m * scale, W = item.width_m * scale;
  const src = item.sourceJson || {};
  let inner = "";
  try {
    if (item.kind === "field") {
      const sport = src.field?.sport;
      if (sport === "football" && typeof footballCourtSvg === "function") {
        inner = footballCourtSvg(0, 0, L, W, typeof footballStateForItem === "function" ? footballStateForItem(item) : footballState, "full", dark);
      } else if (sport && typeof fieldCourtSvg === "function") {
        // the court inside its run-off: the footprint less the court the Push recorded
        const d = src.field?.dimensions || {};
        const re = d.length_m ? Math.max(0, (item.length_m - d.length_m) / 2) * scale : 0;
        const rs = d.width_m ? Math.max(0, (item.width_m - d.width_m) / 2) * scale : 0;
        const c = fieldCourtSvg(sport, re, rs, L - 2 * re, W - 2 * rs, re, rs, dark, `boardFloor-${dark ? "d" : "l"}`);
        inner = c.defs + c.runoff + c.field + c.lines;
      }
    } else if (item.kind === "activity" && typeof ACTIVITIES !== "undefined") {
      const id = src.activity?.type_id, a = ACTIVITIES[id];
      const fam = src.familyInstance;
      if (!a) return "";
      if (id === "climbing_tower" && typeof towerPlanSvg === "function") {
        inner = towerPlanSvg(fam?.params || towerParams(), L / 2, W / 2, Math.min(L, W) / 2, dark);
      } else if (typeof isActivityFamily === "function" && isActivityFamily(id) && typeof activityFamilyPlanSvg === "function") {
        inner = activityFamilyPlanSvg(id, fam?.params || activityFamilyParams(id), 0, 0, L, W, scale, dark, false);
      } else if (id === "ping_pong" && typeof pingPongCourtSvg === "function") {
        inner = pingPongCourtSvg(0, 0, L, W, typeof pingPongStateForItem === "function" ? pingPongStateForItem(item) : pingPongState, "full", dark);
      } else if (a.play && item.length_m > a.play.l && item.width_m > a.play.w && typeof activityCourtSvg === "function") {
        inner = activityCourtSvg(Object.assign({}, a, { length: item.length_m, width: item.width_m }), 0, 0, L, W, dark).svg;
      } else if (typeof activityFloorSvg === "function") {
        inner = activityFloorSvg(a, 0, 0, L, W, dark);
      }
    }
  } catch (e) { inner = ""; }
  if (!inner) return "";
  // turned a quarter: the piece's length runs down the board, so its frame is rotated about the box's top-right corner
  const tf = (item.rotation % 180) !== 0 ? `translate(${x + w} ${y}) rotate(90)` : `translate(${x} ${y})`;
  return `<g transform="${tf}" pointer-events="none">${inner}</g>`;
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

  // The on-canvas call-to-action (index.html's #combine-entry-cta) mirrors
  // the same active state and swaps to the same "click the edge" wording,
  // since it's the copy this button's own toggle is reached through most
  // of the time — see the click wiring in combineController.js.
  const ctaBtn = document.getElementById("btn-add-entry-cta");
  const ctaText = document.getElementById("combine-entry-cta-text");
  if (ctaBtn) ctaBtn.classList.toggle("active", active);
  if (ctaText) {
    ctaText.textContent = active
      ? "Tool active — click near the site edge to drop one pin (click the button again to cancel)."
      : "Add an entry point so pathways have somewhere to start.";
  }
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
/**
 * The legend's top lines up with the top of the Manual / Algorithmic placement switch above the board (user, 2026-09-27), wherever the layout puts
 * that switch: measured, not a fixed offset. The legend stays inside the board box, so this is a (negative) top relative to it.
 */
function alignCombineLegend() {
  const box = document.getElementById("combine-legend"), wrap = box && box.parentElement;
  const bar = document.querySelector(".placement-switch-bar");
  if (!box || !wrap || !bar || !bar.offsetParent) { if (box) box.style.top = ""; return; }
  const top = Math.round(bar.getBoundingClientRect().top - wrap.getBoundingClientRect().top);
  box.style.top = top + "px";
}
window.addEventListener("resize", () => alignCombineLegend());

function renderCombineLegend(st) {
  const box = document.getElementById("combine-legend");
  if (!box) return;
  alignCombineLegend();
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
    const flag = st.overlappingIds.has(it.id) ? { icon: "⚠", tip: "Too close to a neighbour, an entry point or the indoor zone's wall" }
      : st.outOfBoundsIds.has(it.id) ? { icon: "⚠", tip: "Outside the roof boundary" }
      : st.setbackIds.has(it.id) ? { icon: "⚠", tip: "Inside the setback band, on an entrance's way in or on an opening" }
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
  if (typeof syncGardenPresetButtons === "function") syncGardenPresetButtons();   // the Garden Core presets show only on a Garden Core roof
  if (typeof dropDefaultBedsOnEntryEdges === "function") dropDefaultBedsOnEntryEdges();   // the default green roof never covers an edge with an entry point
  const roof = combineState.roof;
  const items = combineState.items;
  const entries = combineState.entryPoints;
  const { scale, roofPxW, roofPxH, roofOx, roofOy } = combineLayout();

  const entryCta = document.getElementById("combine-entry-cta");
  if (entryCta) entryCta.hidden = entries.length > 0;

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

  // The Algorithmic placement's rules, applied to the board (boardRuleCheck): run once per redraw (the pathway search is the expensive part) and handed to
  // the SVG, the status line, the legend and the rules checklist, so none of them can disagree.
  const check = boardRuleCheck(items);
  const overlappingIds = check.tooClose;
  const circulation = check.circulation;
  const outOfBoundsIds = check.outOfBounds;
  const anyOutOfBounds = outOfBoundsIds.size > 0;
  const setbackIds = check.setback;

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

    // The Garden tab's blocks draw what they are (planters.js gardenBlockBoardSvg): a planter's rim, soil, seat cap and tree as its own
    // options say, the Park Bench and Table as a table between two benches. Drawn in the board footprint, so no rotation is needed.
    if (item.kind === "gardenBlock" && typeof gardenBlockBoardSvg === "function") {
      el += `<g>${gardenBlockBoardSvg(x, y, w, h, item)}
          <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
                fill="transparent" stroke="${strokeColor}"
                stroke-width="${selected ? 2.5 : 1.2}"
                stroke-dasharray="${warn || cutOff ? "4,2" : "none"}"
                style="cursor:${isPlanner ? "grab" : "pointer"}"/>
        </g>`;
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

    // Every other court and activity: the Sport tab's own drawing of it (sportTabPieceSvg), under a clear outline that keeps the selection, the flags
    // and the dragging exactly as they were. A piece the Sport tab has no drawing for keeps the plain filled box.
    const drawn = !isCrown ? sportTabPieceSvg(item, x, y, w, h, scale) : "";
    if (drawn) {
      el += `${drawn}
      <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="transparent" stroke="${strokeColor}"
            stroke-width="${selected ? 2.5 : 1.5}"
            stroke-dasharray="${warn || cutOff ? '4,2' : 'none'}"
            style="cursor:${isPlanner ? 'grab' : 'pointer'}"/>`;
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
      statusEl.textContent = `⚠ ${overlappingIds.size} piece(s) too close to a neighbor or an entry point (${boardGapText(check.R)}).`;
    } else if (anyOutOfBounds) {
      statusEl.textContent = "⚠ One or more pieces extend outside the roof boundary.";
    } else if (setbackIds.size > 0) {
      statusEl.textContent = `⚠ ${setbackIds.size} piece(s) sit inside the ${check.R.setback.toFixed(1)} m setback band, on an entrance's way in or on an opening.`;
    } else if (entries.length === 0) {
      statusEl.textContent = `${items.length} piece(s) placed. Add an entry point to check circulation.`;
    } else if (circulation.unreachable.size > 0) {
      statusEl.textContent = `⚠ ${circulation.unreachable.size} piece(s) aren't reachable from an entrance by a ${check.R.W.toFixed(1)} m pathway.`;
    } else if (check.area && check.area.pct > check.area.limit) {
      statusEl.textContent = `⚠ The courts cover ${check.area.pct.toFixed(0)}% of the sports area (limit ${check.area.limit}%).`;
    } else if (typeof findZoneClashes === "function" && findZoneClashes().length > 0) {
      const n = findZoneClashes().length;
      statusEl.textContent = `⚠ ${n} ground zone clash(es) with a placed piece.`;
    } else if (typeof findZonesOutOfBounds === "function" && findZonesOutOfBounds().length > 0) {
      statusEl.textContent = "⚠ One or more ground zones extend outside the roof boundary.";
    } else {
      statusEl.textContent = `${items.length} piece(s) placed. Layout OK — all rules satisfied.`;
    }
  }

  renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, check, setbackIds);
  renderCombineSummary(circulation);
  if (typeof renderDesignPanel === "function") renderDesignPanel(circulation);
  // What is selected, and a record of the change — both read the state the
  // redraw just finished producing, so neither needs telling separately.
  if (typeof renderInspector === "function") renderInspector(circulation);
  if (typeof recordCombineHistory === "function") recordCombineHistory();
  renderSmartRuleAdvisory();
  const selectedItem = combineState.selectedKind === "item" ? items.find(it => it.id === combineState.selectedId) : null;
  renderSuggestions(selectedItem, combineState.suggestions);
  // The 3D view (preview.js) follows the board: it rebuilds its scene from this state, but only while it is showing.
  if (typeof combinePreviewRefresh === "function") combinePreviewRefresh();
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
/** The gaps the board holds pieces to, in words (the Algorithmic placement's, see boardRules). */
function boardGapText(R) {
  if (!R) return "";
  return R.zoning
    ? `${R.zgap.toFixed(1)} m same-zone / ${R.xgap.toFixed(1)} m cross-zone / ${R.lobby.toFixed(1)} m in front of a service module / ${R.egap.toFixed(1)} m from an entrance (${BOARD_PRESET_ENTRY_GAP_M.toFixed(2)} m for Garden Core preset pieces)`
    : `${R.gap.toFixed(1)} m between pieces and from an entrance`;
}

function renderRulesPanel(overlappingIds, anyOutOfBounds, circulation, check, setbackIds) {
  const panel = document.getElementById("rules-panel");
  if (!panel) return;
  const items = combineState.items;
  const entries = combineState.entryPoints;
  const R = check && check.R;

  const rows = [{
    passed: entries.length >= DESIGN_RULES.minEntryPoints,
    label: `Entry point${DESIGN_RULES.minEntryPoints > 1 ? "s" : ""} defined`,
    detail: entries.length === 0 ? "Add at least one entrance on the site edge." : `${entries.length} entrance${entries.length > 1 ? "s" : ""} placed.`,
  }];

  if (items.length === 0) {
    rows.push({ passed: true, label: "Layout", detail: "Push a sport or garden piece to Combine to start checking rules." });
  } else {
    const wallN = check && check.wallIds ? check.wallIds.size : 0;
    rows.push({
      passed: overlappingIds.size === 0,
      label: `Clearance (same rules as Algorithmic placement)`,
      detail: (overlappingIds.size === 0 ? "All pieces keep " : `${overlappingIds.size} piece(s) closer than `) + escapeHtml(boardGapText(R))
        + (R && R.zoning ? `; ${R.xgap.toFixed(1)} m from the indoor zone's wall` : "") + "."
        + (wallN ? ` ${wallN} of them too close to the indoor zone's wall.` : "")
        + " Two Ping Pong tables may stand long edge to long edge.",
    });
    rows.push({
      passed: !anyOutOfBounds,
      label: "Inside site boundary",
      detail: !anyOutOfBounds ? "Everything fits inside the roof outline." : "One or more pieces extend past the roof outline.",
    });
    rows.push({
      passed: !setbackIds || setbackIds.size === 0,
      label: `Setback respected (${(R ? R.setback : DESIGN_RULES.boundarySetback_m).toFixed(1)} m)`,
      detail: !setbackIds || setbackIds.size === 0
        ? "No piece sits in the garden band, on an entrance's way in or on an opening."
        : `${setbackIds.size} piece(s) in the garden band, on an entrance's way in or on an opening (only the locker and bathroom modules may stand in the band).`,
    });
    rows.push({
      passed: entries.length > 0 && circulation.unreachable.size === 0,
      label: `Pathway access (${R ? R.W.toFixed(1) : "2.0"} m paths)`,
      detail: entries.length === 0
        ? "Waiting on an entrance to check reachability."
        : circulation.unreachable.size === 0
          ? `Every piece touches a pathway from an entrance over at least ${R ? R.minAcc.toFixed(1) : "2.0"} m of its edge${R && R.zoning ? ", or faces a reached piece of its zone across an in-zone path" : ""}.`
          : `${circulation.unreachable.size} piece(s) can't be reached from any entrance.`,
    });
    if (check && check.area) {
      rows.push({
        passed: check.area.pct <= check.area.limit,
        label: `Sports area used (limit ${check.area.limit}%)`,
        detail: `The pieces cover ${check.area.total.toFixed(0)} of ${check.area.usable.toFixed(0)} m² (${check.area.pct.toFixed(0)}%).`,
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
  // identical pieces (same kind, label and size) are ONE thumbnail with "× n" at its bottom right (user, 2026-09-28): dragging it out or its ×
  // takes the last copy, so the count goes down one at a time
  const groups = new Map();
  tray.forEach(it => {
    const key = [it.kind, it.label, Number(it.length_m).toFixed(2), Number(it.width_m).toFixed(2)].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });
  wrap.innerHTML = [...groups.values()].map(copies => {
    const it = copies[copies.length - 1], n = copies.length;
    const colors = KIND_COLORS[it.kind] || KIND_COLORS.field;
    return `
      <div class="tray-thumb" data-tray-id="${escapeHtml(it.id)}" style="--thumb-fill:${colors.fill};--thumb-stroke:${colors.stroke}" title="${escapeHtml(it.label)} — ${it.length_m}m × ${it.width_m}m${n > 1 ? " — " + n + " copies" : ""}">
        <button class="tray-thumb-remove" data-tray-remove="${escapeHtml(it.id)}" title="Remove one"><i class="ti ti-x" aria-hidden="true"></i></button>
        <div class="tray-thumb-box">${trayThumbSvg(it, 64, 50)}</div>
        ${n > 1 ? `<span class="tray-thumb-count">× ${n}</span>` : ""}
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
    const rawX = (svgX - roofOx) / scale - fp.w / 2, rawY = (svgY - roofOy) / scale - fp.h / 2;
    let [x_m, y_m] = pingPongPairSnap(item, rawX, rawY, snapToGrid(rawX), snapToGrid(rawY));
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

    // the indoor zone's wall (from Apply): the whole wall is selected, so Remove selected / Delete can take it away
    const wallEl = e.target.closest("[data-wall-id]");
    if (wallEl) {
      combineState.selectedKind = "wall";
      combineState.selectedId = wallEl.dataset.wallId;
      if (typeof refreshSuggestions === "function") refreshSuggestions(); else drawCombineCanvas();
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

    const rawX = dragState.startXm + dxM, rawY = dragState.startYm + dyM;
    const [nextX, nextY] = pingPongPairSnap(item, rawX, rawY, snapToGrid(rawX), snapToGrid(rawY));

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