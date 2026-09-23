/**
 * algoPlacementCore.js — the packing engine of the Algorithmic placement mode. No DOM, no Combine state: plain functions on plain data, so it can be tested in Node
 * (tools/algoplacement-test.js) and used by algoPlacementUI.js.
 *
 * It is a port of the Rhino tool "Rooftop Sports Court Planner" (SPACE PACKING 2.py, its pure-Python core: the Grid, Layout, court placement and pathway network),
 * with the Rhino layer (curves, layers, the Eto form) replaced by the browser UI. What it does, in the tool's own words:
 *
 *   R1  courts inside the usable zone (the footprint less the setback band, which is garden), never on lifts / ramps
 *   R2  courts keep a clear gap (COURT_GAP_M) from each other and from lifts / ramps; that gap becomes secondary pathway
 *   R3  primary pathways are W wide and never on courts
 *   R4  every court touches a pathway (at least MIN_ACCESS_M of shared edge)
 *   R5  the primary pathways form ONE network touching every lift / ramp
 *   R6  each court is tried at 0 and 90 degrees
 *   R7  courts go on the setback line FIRST (corners best), then the middle is filled; leftover pockets become garden (or pathway)
 *   the pathway may narrow (2.0 -> 1.5 -> 1.0 m) if a court needs the room; big courts (multi sport, basketball, handball, volleyball) need a path on ONE side only
 *
 * Everything runs on a 0.1 m occupancy grid; a rectangle is [x0, y0, x1, y1] in grid cells. Inputs and outputs are in metres, in the roof's plan coordinates
 * (x right, y DOWN from the top edge, the same as the Combine canvas).
 *
 * Differences from the Rhino tool, on purpose:
 *   - a footprint that is not a plain rectangle is inset by the setback on the grid itself (Euclidean distance to its edges) instead of with Rhino's OffsetCurve;
 *   - `keepClear` boxes (openings, equipment from Revit) block the grid like a lift does but ask for no landing and no path;
 *   - `strictGap` treats big courts like normal ones (a clear gap on every side), so Combine's clearance rule is never broken;
 *   - sets are iterated in sorted order and the random numbers come from a seeded generator of its own, so the same seed gives the same layout in every browser.
 */

const AlgoPlacement = (function () {
  "use strict";

  // ── parameters (the Rhino tool's) ───────────────────────────────────────────────
  const RES = 0.1;                  // grid step (m). 0.1 keeps every preset size exact
  const DEFAULT_SETBACK = 1.0;      // m, garden band width along the roof edge
  const DEFAULT_PATH_W = 2.0;       // m, clear pathway width (primary network)
  const MIN_PATH_W_M = 1.0;         // m, the pathway may NARROW to this (2.0 -> 1.5 -> 1.0) if a court needs the room
  const MIN_ACCESS_M = 2.0;         // m, min shared edge between court and pathway
  const COURT_GAP_M = 1.5;          // m, secondary path around every court AND around lift/ramp sides
  const BUILT_LIMIT_PCT = 75.0;     // court area as % of sports area
  const EDGE_MIN_M = 2.0;           // m, a court "touches the setback line" if it shares this much edge
  const EDGE_WEIGHT = 3.0;          // how strongly placement prefers the setback line (0 = ignore)
  const PERIM_LANE_MAX_M2 = 80.0;   // m2, longest access lane accepted just to reach the setback line
  const DEFAULT_TIME = 8;           // s, search budget
  const MIN_POCKET_DIM = 1.0;       // m, leftover pockets thinner than this are not garden
  const MIN_POCKET_AREA = 2.0;      // m2, smaller pockets are not garden
  const LANE_CANDIDATES = 16;
  const MAX_ATTEMPTS = 60;
  const SHUFFLE_ATTEMPTS = 30;      // random layouts generated per Shuffle press
  const HEAVY_DEAD_LOAD_KN_M2 = 1.4;      // an item with a dead load above this goes along the structural grid (when Revit has given one)
  const CORNER_RANK_PENALTY_M = 4.0;      // a service module leaves the corner nearest a lift / stair only when another corner is this much closer to a free spot, per rank
  const SERVICE_MAX_FROM_CORNER_M = 30.0; // farther than this from every roof corner, a spot no longer counts as "in a corner"

  // Larger courts only need a pathway on ONE side (no 1.5 m ring on all four sides), so they may sit tight against the setback line and against each other.
  const BIG_COURTS = ["Multi Sport Court", "Basketball Court", "Handball", "Volleyball", "3x3 Streetbasketball", "Padel Tennis Court", "Multipurpose Sport Area"];

  const GROUPS = ["Courts", "Fitness & wellness", "Playground & leisure", "Services"];

  // name (the stable key the solver, the tests and saved quantities use), label (what a person sees), group, long side (m), short side (m), colour -> FINAL envelopes (run-off included).
  // headcount = active people at once (null + headcountNote when the sheet gives no number), deadLoad = Gk in kN/m², assumed = the reference sheet marks that dead load "(Assumed)".
  // The four courts without a headcount / dead load are not in the reference sheet. Appended entries keep the original ones first, so the solver's request order is unchanged.
  const SPORTS = [
    { name: "Multi Sport Court", label: "Multi Sport Court", group: "Courts", long: 20.0, short: 12.0, color: [31, 119, 180], headcount: null, deadLoad: null },
    { name: "Basketball Court", label: "Basketball Court", group: "Courts", long: 22.0, short: 13.0, color: [255, 127, 14], headcount: null, deadLoad: null },
    { name: "Badminton", label: "Badminton Court", group: "Courts", long: 13.4, short: 6.1, color: [44, 160, 44], headcount: 4, deadLoad: 0.15 },
    { name: "Yoga", label: "Yoga / Stretching Deck", group: "Fitness & wellness", long: 10.0, short: 5.0, color: [148, 103, 189], headcount: 15, deadLoad: 0.40 },
    { name: "Bocce Court", label: "Urban Bocce Court", group: "Courts", long: 18.0, short: 3.0, color: [140, 86, 75], headcount: 4, deadLoad: 2.50 },
    { name: "Handball", label: "Handball", group: "Courts", long: 30.0, short: 16.0, color: [227, 119, 194], headcount: null, deadLoad: null },
    { name: "Volleyball", label: "Volleyball", group: "Courts", long: 16.0, short: 8.0, color: [23, 190, 207], headcount: null, deadLoad: null },
    { name: "Calisthenics", label: "Calisthenics Gym", group: "Fitness & wellness", long: 8.0, short: 6.0, color: [120, 120, 40], headcount: 12, deadLoad: 0.50 },
    { name: "Ping Pong", label: "Ping Pong Station", group: "Courts", long: 5.7, short: 3.5, color: [255, 214, 0], headcount: 4, deadLoad: 0.30 },
    { name: "Mini Golf", label: "Mini-Golf Lane", group: "Playground & leisure", long: 12.0, short: 1.5, color: [102, 194, 165], headcount: 4, deadLoad: 1.20 },
    { name: "Sandpit", label: "Sand Pit", group: "Playground & leisure", long: 4.0, short: 4.0, color: [222, 184, 135], headcount: null, headcountNote: "variable", deadLoad: 1.50, assumed: true },
    { name: "3x3 Streetbasketball", label: "3x3 Streetbasketball", group: "Courts", long: 15.0, short: 11.0, color: [255, 165, 100], headcount: 6, deadLoad: 0.15 },
    { name: "Sprint Lane", label: "Sprint Lane (per lane)", group: "Fitness & wellness", long: 63.77, short: 1.22, color: [176, 176, 60], headcount: 1, deadLoad: 0.20 },
    { name: "Padel Tennis Court", label: "Padel Tennis Court", group: "Courts", long: 20.0, short: 10.0, color: [90, 80, 160], headcount: 4, deadLoad: 0.80 },
    { name: "Teqball Table", label: "Teqball Table", group: "Courts", long: 6.0, short: 4.0, color: [0, 150, 136], headcount: 4, deadLoad: 0.25 },
    { name: "Bouldering Wall", label: "Bouldering Wall", group: "Fitness & wellness", long: 6.0, short: 1.5, color: [200, 140, 80], headcount: 3, deadLoad: 0.70 },
    { name: "Pickleball Court", label: "Pickleball Court", group: "Courts", long: 13.4, short: 6.1, color: [160, 210, 110], headcount: 4, deadLoad: 0.15 },
    { name: "CrossFit Training Rig", label: "CrossFit Training Rig", group: "Fitness & wellness", long: 6.0, short: 5.0, color: [110, 110, 110], headcount: 8, deadLoad: 0.60 },
    { name: "TRX Suspension Frame", label: "TRX Suspension Frame", group: "Fitness & wellness", long: 6.0, short: 3.0, color: [255, 170, 190], headcount: 6, deadLoad: 0.40 },
    { name: "HIIT Turf Grid", label: "HIIT Turf Grid", group: "Fitness & wellness", long: 8.0, short: 5.0, color: [120, 190, 60], headcount: 10, deadLoad: 0.30 },
    { name: "Multipurpose Sport Area", label: "Multipurpose Sport Area", group: "Courts", long: 22.0, short: 12.0, color: [70, 130, 200], headcount: 12, deadLoad: 0.35 },
    { name: "Trampoline", label: "Trampoline", group: "Playground & leisure", long: 4.0, short: 4.0, color: [255, 200, 60], headcount: 2, deadLoad: 0.30, assumed: true },
    { name: "Modular Tower Slide", label: "Modular Tower Slide", group: "Playground & leisure", long: 7.0, short: 5.0, color: [240, 100, 120], headcount: 4, deadLoad: 0.60, assumed: true },
    { name: "Climbing Tower", label: "Climbing Tower", group: "Playground & leisure", long: 6.0, short: 6.0, color: [150, 110, 90], headcount: 4, deadLoad: 0.80, assumed: true },
    { name: "Balance Logs", label: "Balance Logs", group: "Playground & leisure", long: 6.0, short: 3.0, color: [170, 140, 100], headcount: 3, deadLoad: 0.40, assumed: true },
    { name: "Locker & Dressing Room Module", label: "Locker & Dressing Room Module", group: "Services", service: true, long: 10.0, short: 5.0, color: [60, 90, 120], headcount: null, headcountNote: "variable (algorithmic)", deadLoad: 1.50, assumed: true },
    { name: "Bathroom & Shower Module", label: "Bathroom & Shower Module", group: "Services", service: true, long: 10.0, short: 5.0, color: [90, 160, 190], headcount: null, headcountNote: "variable (algorithmic)", deadLoad: 2.00, assumed: true },
    { name: "Rest / Hydration Area", label: "Rest / Hydration Area", group: "Services", long: 6.0, short: 4.0, color: [200, 220, 160], headcount: 8, deadLoad: 0.50, assumed: true }
  ];
  const labelOf = name => { const s = SPORTS.find(x => x.name === name); return s ? s.label : name; };

  // ── zones (used only when a plan is made with `zoning`) ──
  // indoor (walls around, ignores the setback, grows from the Locker corner), garden (Yoga, Calisthenics: respects the setback like outdoor) and outdoor (everything else)
  const INDOOR_NAMES = new Set(["Ping Pong", "Bouldering Wall", "Badminton", "Locker & Dressing Room Module", "Bathroom & Shower Module", "Rest / Hydration Area"]);
  const GARDEN_NAMES = new Set(["Yoga", "Calisthenics"]);
  const NO_CLUSTER = new Set(["Rest / Hydration Area"]);         // indoor, but not part of the cluster that grows from the Locker corner
  const zoneOf = name => INDOOR_NAMES.has(name) ? "indoor" : GARDEN_NAMES.has(name) ? "garden" : "outdoor";
  // only the service modules have walls around them, so only they ignore the setback: every sport (indoor ones included) respects it
  const noSetback = name => { const s = SPORTS.find(x => x.name === name); return !!(s && s.service); };
  const clusterZone = name => NO_CLUSTER.has(name) ? "rest" : zoneOf(name);
  const ZONE_GAP_OPTIONS_M = [1.8, 1.5];      // the clear path between two items of the same zone, widest first
  const PRIMARY_OPTIONS_M = [2.5, 2.0];       // primary circulation: between zones and along the main network, widest first
  const ENTRY_GAP_M = 2.5;                    // around lifts, stairs and ramps
  const EDGE_SCALE_CLUSTERED = 0.1;           // how much the setback line / wall counts for an item joining a zone that already has members
  const CLUSTER_PULL = 0.5;                  // placement score lost per metre between an item and the centre of its zone
  const ALIGN_TIGHT = 20.0, ALIGN_ANY = 10.0;   // score for sitting beside an identical item (same way round, edges aligned, one in-zone path apart) / for sharing an edge line with a nearby item
  const SIBLING_ROOM = 12.0;                    // score for a spot with room beside it for the next identical item
  const NEAR_M = 6.0;                           // "nearby" for alignment: no more than this many metres between two items
  const COLOR_VC = [200, 30, 30];           // lifts + ramps: same colour
  const COLOR_PATH = [190, 190, 190];       // ALL pathways (primary + secondary): same colour
  const COLOR_GARDEN = [150, 200, 120];     // setback band AND leftover pockets

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const toCells = m => Math.round(m / RES);

  /** Thrown when the caller's cancelled() says so. */
  class Cancelled extends Error { constructor() { super("cancelled"); this.cancelled = true; } }

  // ── small helpers ───────────────────────────────────────────────────────────────
  /** Python-style comparison of numbers and (nested) arrays, for the tuple sorts the tool relies on. */
  function cmp(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) { const c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** Distinct numbers in ascending order (the tool iterates Python sets; a fixed order makes a layout reproducible). */
  function uniq(list) {
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }

  /** mulberry32: a small seeded generator with the three calls the tool needs. */
  function makeRng(seed) {
    let a = (seed >>> 0) + 0x9e3779b9;
    const random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    random(); random();
    return { random, uniform: (lo, hi) => lo + (hi - lo) * random(), choice: list => list[Math.floor(random() * list.length)] };
  }

  // ── rectangles (cells) ──────────────────────────────────────────────────────────
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  function contactLen(a, b) {
    if (a[2] === b[0] || b[2] === a[0]) { const d = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return d > 0 ? d : 0; }
    if (a[3] === b[1] || b[3] === a[1]) { const d = Math.min(a[2], b[2]) - Math.max(a[0], b[0]); return d > 0 ? d : 0; }
    return 0;
  }
  function interArea(a, b) {
    const dx = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const dy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  }
  const area = r => (r[2] - r[0]) * (r[3] - r[1]);
  const inflate = (r, g) => [r[0] - g, r[1] - g, r[2] + g, r[3] + g];
  function pathJoined(a, b, W) {
    const dx = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const dy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return dx >= 0 && dy >= 0 && Math.max(dx, dy) >= W;
  }
  function adjacentAny(r, paths, W) {
    for (const p of paths) if (pathJoined(r, p, W)) return true;
    return false;
  }
  /** Groups of rectangles joined to each other by a pathway of width W. */
  function components(rects, W) {
    const n = rects.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (pathJoined(rects[i], rects[j], W)) parent[find(i)] = find(j);
    const groups = new Map();
    for (let i = 0; i < n; i++) { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(rects[i]); }
    return Array.from(groups.values());
  }
  /** Area (cells) of the union of rectangles, by coordinate compression. */
  function rectUnionArea(rects) {
    if (!rects.length) return 0;
    const xs = uniq(rects.flatMap(r => [r[0], r[2]]));
    const ys = uniq(rects.flatMap(r => [r[1], r[3]]));
    const xi = new Map(xs.map((x, i) => [x, i]));
    const yi = new Map(ys.map((y, i) => [y, i]));
    const nx = xs.length - 1, ny = ys.length - 1;
    const filled = Array.from({ length: ny }, () => new Uint8Array(nx));
    for (const r of rects) for (let j = yi.get(r[1]); j < yi.get(r[3]); j++) filled[j].fill(1, xi.get(r[0]), xi.get(r[2]));
    let total = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (filled[j][i]) total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    return total;
  }

  // ── grid rows: runs of free (0) cells, and turning rows back into rectangles ────
  /** Runs [start, end) of zero bytes in row[from, to). */
  function zeroRuns(row, from, to) {
    const out = [];
    const a = from == null ? 0 : from, b = to == null ? row.length : to;
    let s = -1;
    for (let i = a; i < b; i++) {
      if (row[i] === 0) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i]); s = -1; }
    }
    if (s >= 0) out.push([s, b]);
    return out;
  }
  /** Rectangles (cells) that exactly tile the free cells of `rows`, merging equal runs of consecutive rows. */
  function rowsToRects(rows, x0, x1, y0, y1) {
    const out = [], open = new Map();
    for (let j = y0; j <= y1; j++) {
      const cur = new Map();
      if (j < y1) for (const [s, e] of zeroRuns(rows[j], x0, x1)) cur.set(s + "," + e, [s, e]);
      for (const key of Array.from(open.keys())) {
        if (!cur.has(key)) { const [s, e] = key.split(",").map(Number); out.push([s, open.get(key), e, j]); open.delete(key); }
      }
      for (const key of cur.keys()) if (!open.has(key)) open.set(key, j);
    }
    return out;
  }
  function makeSat(rows, nx) {
    const sat = [new Int32Array(nx + 1)];
    for (const row of rows) {
      const prev = sat[sat.length - 1], cur = new Int32Array(nx + 1);
      let run = 0;
      for (let i = 0; i < nx; i++) { run += row[i]; cur[i + 1] = prev[i + 1] + run; }
      sat.push(cur);
    }
    return sat;
  }

  // ── polygons -> grid rows ───────────────────────────────────────────────────────
  function polyEdges(polys) {
    const edges = [];
    for (const poly of polys) {
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const [xa, ya] = poly[i], [xb, yb] = poly[(i + 1) % n];
        if (ya !== yb) edges.push(ya < yb ? [xa, ya, xb, yb] : [xb, yb, xa, ya]);
      }
    }
    return edges;
  }
  /** Intervals of cells (relative to ox) that lie inside the polygon edges at height y. */
  function edgeIntervals(edges, y, ox, nx) {
    const xs = [];
    for (const [xa, ya, xb, yb] of edges) if (ya <= y && y < yb) xs.push(xa + (y - ya) * (xb - xa) / (yb - ya));
    xs.sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const s = Math.max(Math.ceil((xs[k] - ox) / RES - 1e-3), 0);
      const e = Math.min(Math.floor((xs[k + 1] - ox) / RES + 1e-3), nx);
      if (e > s) out.push([s, e]);
    }
    return out;
  }
  function intervalsIntersect(a, b) {
    const out = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
      if (e > s) out.push([s, e]);
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return out;
  }
  /** Rows (1 = INSIDE) of the cells lying completely inside the polygons. */
  function polyRows(polys, ox, oy, nx, ny) {
    const edges = polyEdges(polys);
    const eps = 1e-3 * RES;
    const rows = [];
    for (let j = 0; j < ny; j++) {
      const y = oy + j * RES;
      const iv = intervalsIntersect(edgeIntervals(edges, y + eps, ox, nx), edgeIntervals(edges, y + RES - eps, ox, nx));
      const row = new Uint8Array(nx);
      for (const [s, e] of iv) row.fill(1, s, e);
      rows.push(row);
    }
    return rows;
  }
  function bounds(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polys) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  function polyArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      a += x0 * y1 - x1 * y0;
    }
    return Math.abs(a) / 2;
  }
  /** The bounding box when the polygon is a plain axis-aligned rectangle, else null. */
  function axisRect(poly) {
    const pts = poly.slice();
    if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
    if (pts.length !== 4) return null;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      if (Math.abs(a[0] - b[0]) > 1e-9 && Math.abs(a[1] - b[1]) > 1e-9) return null;
    }
    const b = bounds([pts]);
    return polyArea(pts) > (b.x1 - b.x0) * (b.y1 - b.y0) - 1e-6 ? b : null;
  }

  // ── the occupancy grid ──────────────────────────────────────────────────────────
  /**
   * 0.1 m occupancy grid of the usable zone (1 = blocked). Summed-area tables answer "is this rectangle completely free?" instantly.
   *   sat      blocked = outside the usable zone OR a lift / ramp OR a keep-clear box
   *   satOut   blocked = outside the usable zone only (that edge IS the setback line)
   * `rows` (Uint8Array per row, 1 = blocked) is taken over and changed.
   */
  class Grid {
    constructor(ox, oy, nx, ny, rows, entryBoxes, blockBoxes) {
      this.ox = ox; this.oy = oy; this.nx = nx; this.ny = ny;
      if (nx < 2 || ny < 2) throw new Error("Usable area is empty. Reduce the setback.");
      this.satOut = makeSat(rows, nx);                        // the setback line only
      this.footRows = rows.map(r => Uint8Array.from(r));      // the footprint alone (no lift, no mask): applyMask needs it
      // the roof's own corners (convex corners of the usable zone, found before any lift or keep-clear box is painted in): where a service module can be tucked
      this.corners = [];
      const open = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && rows[y][x] === 0;
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        if (rows[y][x] !== 0) continue;
        const l = !open(x - 1, y), r = !open(x + 1, y), u = !open(x, y - 1), d = !open(x, y + 1);
        if (l && u) this.corners.push({ x, y });
        if (r && u) this.corners.push({ x: x + 1, y });
        if (l && d) this.corners.push({ x, y: y + 1 });
        if (r && d) this.corners.push({ x: x + 1, y: y + 1 });
      }
      this.anchorCells = [];                                  // the lifts and stairs (not the ramps) the service corner is measured from, set by makeSite
      const cellsOf = b => [Math.floor((b[0] - ox) / RES + 1e-6), Math.floor((b[1] - oy) / RES + 1e-6), Math.ceil((b[2] - ox) / RES - 1e-6), Math.ceil((b[3] - oy) / RES - 1e-6)];
      const block = r => {
        for (let j = Math.max(0, r[1]); j < Math.min(ny, r[3]); j++) {
          const s = Math.max(0, r[0]), e = Math.min(nx, r[2]);
          if (e > s) rows[j].fill(1, s, e);
        }
      };
      this.entryCells = (entryBoxes || []).map(cellsOf);
      this.entryCells.forEach(block);
      (blockBoxes || []).map(cellsOf).forEach(block);
      this.rows = rows;
      this.sat = makeSat(rows, nx);
      let tot = 0, sx = 0, sy = 0, sigPrev = null, change = [];
      rows.forEach((row, j) => {
        const runs = zeroRuns(row);
        for (const [s, e] of runs) { tot += e - s; sx += (e - s) * (s + e) / 2; sy += (e - s) * (j + 0.5); }
        const sig = runs.map(r => r[0] + "-" + r[1]).join(",");
        if (sig !== sigPrev) { change.push([j, runs]); sigPrev = sig; }
      });
      if (change.length > 60) { const step = Math.ceil(change.length / 60); change = change.filter((_, i) => i % step === 0); }
      const axs = new Set(), ays = new Set();
      for (const [j, runs] of change) { ays.add(j); for (const [s, e] of runs) { axs.add(s); axs.add(e); } }
      this.anchorXs = Array.from(axs); this.anchorYs = Array.from(ays);
      this.freeCells = tot;
      if (tot <= 0) throw new Error("Usable area is empty (setback too large or lifts/ramps cover it).");
      this.cx = sx / tot; this.cy = sy / tot;
    }

    /** Grid of a usable zone given as polygons (origin = the zone's own corner, so a rectangle is cell-exact whatever the setback). */
    static fromPolygons(polys, entryBoxes, blockBoxes) {
      const b = bounds(polys);
      const nx = Math.ceil((b.x1 - b.x0) / RES - 1e-6), ny = Math.ceil((b.y1 - b.y0) / RES - 1e-6);
      if (nx < 2 || ny < 2) throw new Error("Usable area is empty. Reduce the setback.");
      const rows = polyRows(polys, b.x0, b.y0, nx, ny).map(r => r.map(v => 1 - v));
      return new Grid(b.x0, b.y0, nx, ny, rows, entryBoxes, blockBoxes);
    }

    blockedRaw(x0, y0, x1, y1) { const S = this.sat; return S[y1][x1] - S[y0][x1] - S[y1][x0] + S[y0][x0]; }
    /** Is the rectangle free for a pathway (and, on a plain grid, for a court)? With a mask, pathways stay out of the garden band. */
    isFree(r) {
      if (r[0] < 0 || r[1] < 0 || r[2] > this.nx || r[3] > this.ny) return false;
      const S = this.pathSat || this.sat;
      return S[r[3]][r[2]] - S[r[1]][r[2]] - S[r[3]][r[0]] + S[r[1]][r[0]] === 0;
    }
    /** Is the rectangle free for a court: on the footprint, off lifts / ramps / keep-clear boxes (the garden band is the mask's business, see outdoorOk). */
    itemFree(r) {
      if (r[0] < 0 || r[1] < 0 || r[2] > this.nx || r[3] > this.ny) return false;
      return this.blockedRaw(r[0], r[1], r[2], r[3]) === 0;
    }
    /**
     * Zoning: `maskRows` (1 = the garden band, within the setback of the roof edge). Outdoor and garden items and every pathway stay out of it; indoor items ignore it and may
     * use the whole footprint. The setback line becomes the edge of the mask; the roof's own walls are still there as satWall.
     */
    applyMask(maskRows) {
      const nx = this.nx, ny = this.ny;
      const orRows = base => base.map((r, j) => { const o = Uint8Array.from(r), m = maskRows[j]; for (let i = 0; i < nx; i++) if (m[i]) o[i] = 1; return o; });
      this.satWall = this.satOut;
      this.maskSat = makeSat(maskRows, nx);
      this.satOut = makeSat(orRows(this.footRows), nx);
      const pathRows = orRows(this.rows);
      this.pathSat = makeSat(pathRows, nx);
      this.rows = pathRows;
      const axs = new Set(this.anchorXs), ays = new Set(this.anchorYs);
      let sig = null;
      pathRows.forEach((row, j) => {
        const runs = zeroRuns(row), s = runs.map(q => q[0] + "-" + q[1]).join(",");
        if (s !== sig) { sig = s; ays.add(j); for (const [a, b] of runs) { axs.add(a); axs.add(b); } }
      });
      this.anchorXs = Array.from(axs); this.anchorYs = Array.from(ays);
      this.masked = true;
    }
    /** Is the rectangle clear of the garden band (always true on a grid without a mask)? */
    outdoorOk(r) {
      if (!this.maskSat) return true;
      const S = this.maskSat;
      return S[r[3]][r[2]] - S[r[1]][r[2]] - S[r[3]][r[0]] + S[r[1]][r[0]] === 0;
    }
    /** Length (cells) of the outline that lies on the roof's own walls (an indoor item's edge). */
    wallContact(r) {
      const [x0, y0, x1, y1] = r, S = this.satWall || this.satOut;
      return this._strip(S, x0 - 1, y0, x0, y1) + this._strip(S, x1, y0, x1 + 1, y1) + this._strip(S, x0, y0 - 1, x1, y0) + this._strip(S, x0, y1, x1, y1 + 1);
    }
    /** Blocked cells in a thin strip; anything outside the grid counts as blocked. */
    _strip(S, a, b, c, d) {
      const full = (c - a) * (d - b);
      const ia = Math.max(a, 0), ib = Math.max(b, 0), ic = Math.min(c, this.nx), id = Math.min(d, this.ny);
      if (ic <= ia || id <= ib) return full;
      return (full - (ic - ia) * (id - ib)) + S[id][ic] - S[ib][ic] - S[id][ia] + S[ib][ia];
    }
    stripBlocked(a, b, c, d) { return this._strip(this.sat, a, b, c, d); }
    /** Length (cells) of the rectangle's outline that lies ON the setback line. */
    edgeContact(r) {
      const [x0, y0, x1, y1] = r, S = this.satOut;
      return this._strip(S, x0 - 1, y0, x0, y1) + this._strip(S, x1, y0, x1 + 1, y1) + this._strip(S, x0, y0 - 1, x1, y0) + this._strip(S, x0, y1, x1, y1 + 1);
    }
    toM(r) { return [this.ox + r[0] * RES, this.oy + r[1] * RES, this.ox + r[2] * RES, this.oy + r[3] * RES]; }
  }

  // ── the site: footprint, setback, lifts / ramps, keep-clear boxes ───────────────
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  /** Rectangle a with rectangle c cut out: up to four rectangles (metres). */
  function subtractRect(a, c) {
    if (!(a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3])) return [a];
    const out = [];
    if (c[1] > a[1]) out.push([a[0], a[1], a[2], c[1]]);
    if (c[3] < a[3]) out.push([a[0], c[3], a[2], a[3]]);
    const y0 = Math.max(a[1], c[1]), y1 = Math.min(a[3], c[3]);
    if (c[0] > a[0]) out.push([a[0], y0, c[0], y1]);
    if (c[2] < a[2]) out.push([c[2], y0, a[2], y1]);
    return out.filter(r => r[2] - r[0] > 1e-9 && r[3] - r[1] > 1e-9);
  }

  /**
   * Everything the packing needs to know about the roof.
   *   foot      footprint polygon [[x, y], ...] in metres
   *   setback   width of the garden band along the footprint's edge (m)
   *   entries   lifts / ramps: [[x0, y0, x1, y1], ...] in metres (landings and pathways grow from them)
   *   keepClear boxes courts must stay off but that ask for nothing (openings, equipment)
   *   anchors   the lifts and stairs (a subset of `entries`, ramps left out): the corner service modules go to is the one nearest to these
   * Returns { grid, foot, footArea, usableArea, usableRects, bandRects, bbox, entries }.
   */
  /** Rows over a grid of nx x ny cells whose corner is (x0, y0): 1 where a cell lies within `sb` of the footprint's edge (the garden band), 0 elsewhere. */
  function setbackMask(foot, sb, x0, y0, nx, ny) {
    const edges = [];
    for (let i = 0; i < foot.length; i++) edges.push([foot[i][0], foot[i][1], foot[(i + 1) % foot.length][0], foot[(i + 1) % foot.length][1]]);
    const lattice = new Float32Array((nx + 1) * (ny + 1)).fill(-1);
    const dist = (i, j) => {
      const k = j * (nx + 1) + i;
      if (lattice[k] < 0) {
        let d = Infinity;
        for (const [ax, ay, bx, by] of edges) d = Math.min(d, distToSegment(x0 + i * RES, y0 + j * RES, ax, ay, bx, by));
        lattice[k] = d;
      }
      return lattice[k];
    };
    const rows = [];
    for (let j = 0; j < ny; j++) {
      const row = new Uint8Array(nx);
      for (let i = 0; i < nx; i++) if (Math.min(dist(i, j), dist(i + 1, j), dist(i, j + 1), dist(i + 1, j + 1)) < sb - 1e-9) row[i] = 1;
      rows.push(row);
    }
    return rows;
  }

  /**
   * The site. With `zoning`, the site also carries `full`: a grid of the WHOLE footprint (lifts and keep-clear boxes cut out) whose garden band is a mask, so indoor items
   * can stand in the band while outdoor items and pathways cannot. Everything else about the site (usable zone, band, area) is the same as without zoning.
   */
  function makeSite(spec) {
    const site = makeSiteBase(spec);
    if (spec.zoning && site.setback > 0) {
      const fs = makeSiteBase(Object.assign({}, spec, { setback: 0 }));
      fs.grid.applyMask(setbackMask(spec.foot, site.setback, fs.grid.ox, fs.grid.oy, fs.grid.nx, fs.grid.ny));
      site.full = fs.grid;
    }
    return site;
  }

  function makeSiteBase({ foot, setback, entries, keepClear, anchors }) {
    if (!foot || foot.length < 3) throw new Error("No footprint.");
    const sb = Math.max(0, setback || 0);
    const footArea = polyArea(foot);
    const bb = bounds([foot]);
    const rect = axisRect(foot);
    const ent = (entries || []).map(e => [Math.min(e[0], e[2]), Math.min(e[1], e[3]), Math.max(e[0], e[2]), Math.max(e[1], e[3])]);
    const clear = keepClear || [];
    let grid, usableRects, bandRects, usableArea;

    if (rect) {
      const inset = [rect.x0 + sb, rect.y0 + sb, rect.x1 - sb, rect.y1 - sb];
      if (inset[2] - inset[0] < 2 * RES || inset[3] - inset[1] < 2 * RES) throw new Error("Setback of " + sb.toFixed(2) + " m leaves no usable area.");
      grid = Grid.fromPolygons([[[inset[0], inset[1]], [inset[2], inset[1]], [inset[2], inset[3]], [inset[0], inset[3]]]], ent, clear);
      usableRects = [inset];
      usableArea = (inset[2] - inset[0]) * (inset[3] - inset[1]);
      // the garden band: four strips, with every lift / ramp block that sits in it cut out
      const strips = sb > 0 ? [[rect.x0, rect.y0, rect.x1, inset[1]], [rect.x0, inset[3], rect.x1, rect.y1], [rect.x0, inset[1], inset[0], inset[3]], [inset[2], inset[1], rect.x1, inset[3]]] : [];
      bandRects = strips;
      for (const e of ent) bandRects = bandRects.flatMap(s => subtractRect(s, e));
    } else {
      // any other footprint: the usable zone is every cell at least `sb` from the footprint's edge, found on the grid itself
      const nx = Math.ceil((bb.x1 - bb.x0) / RES - 1e-6), ny = Math.ceil((bb.y1 - bb.y0) / RES - 1e-6);
      const inside = polyRows([foot], bb.x0, bb.y0, nx, ny);
      const usable = inside.map(r => Uint8Array.from(r));
      if (sb > 0) {
        const edges = [];
        for (let i = 0; i < foot.length; i++) edges.push([foot[i][0], foot[i][1], foot[(i + 1) % foot.length][0], foot[(i + 1) % foot.length][1]]);
        const lattice = new Float32Array((nx + 1) * (ny + 1)).fill(-1);
        const dist = (i, j) => {
          const k = j * (nx + 1) + i;
          if (lattice[k] < 0) {
            const px = bb.x0 + i * RES, py = bb.y0 + j * RES;
            let d = Infinity;
            for (const [ax, ay, bx, by] of edges) d = Math.min(d, distToSegment(px, py, ax, ay, bx, by));
            lattice[k] = d;
          }
          return lattice[k];
        };
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          if (!usable[j][i]) continue;
          if (Math.min(dist(i, j), dist(i + 1, j), dist(i, j + 1), dist(i + 1, j + 1)) < sb - 1e-9) usable[j][i] = 0;
        }
      }
      const blockedRows = usable.map(r => r.map(v => 1 - v));
      const usableRowsFree = blockedRows.map(r => Uint8Array.from(r));            // before lifts, for the band and the drawing
      let count = 0;
      for (const r of usableRowsFree) count += r.length - r.reduce((s, v) => s + v, 0);
      usableArea = count * RES * RES;
      if (count < 4) throw new Error("Setback of " + sb.toFixed(2) + " m leaves no usable area.");
      usableRects = rowsToRects(usableRowsFree, 0, nx, 0, ny).map(r => [bb.x0 + r[0] * RES, bb.y0 + r[1] * RES, bb.x0 + r[2] * RES, bb.y0 + r[3] * RES]);
      grid = new Grid(bb.x0, bb.y0, nx, ny, blockedRows, ent, clear);
      // the band: footprint cells that are not usable and not under a lift, as rectangles
      const bandRows = inside.map((row, j) => row.map((v, i) => (v && usableRowsFree[j][i] ? 0 : 1)));       // free (0) = inside the footprint and NOT usable
      for (const e of ent) {
        const r = [Math.floor((e[0] - bb.x0) / RES + 1e-6), Math.floor((e[1] - bb.y0) / RES + 1e-6), Math.ceil((e[2] - bb.x0) / RES - 1e-6), Math.ceil((e[3] - bb.y0) / RES - 1e-6)];
        for (let j = Math.max(0, r[1]); j < Math.min(ny, r[3]); j++) bandRows[j].fill(1, Math.max(0, r[0]), Math.min(nx, r[2]));
      }
      bandRects = sb > 0 ? rowsToRects(bandRows, 0, nx, 0, ny).map(r => [bb.x0 + r[0] * RES, bb.y0 + r[1] * RES, bb.x0 + r[2] * RES, bb.y0 + r[3] * RES]) : [];
    }
    grid.anchorCells = (anchors || []).map(a => [Math.floor((Math.min(a[0], a[2]) - grid.ox) / RES + 1e-6), Math.floor((Math.min(a[1], a[3]) - grid.oy) / RES + 1e-6), Math.ceil((Math.max(a[0], a[2]) - grid.ox) / RES - 1e-6), Math.ceil((Math.max(a[1], a[3]) - grid.oy) / RES - 1e-6)]);
    return { grid, foot, footArea, usableArea, usableRects, bandRects, bbox: bb, entries: ent, keepClear: clear, setback: sb };
  }

  // ── a layout under construction ─────────────────────────────────────────────────
  class Layout {
    constructor(grid, W, bigSet, gapM, zoning) {
      this.grid = grid; this.W = W;
      this.big = bigSet || new Set(BIG_COURTS);
      this.minAcc = Math.min(toCells(MIN_ACCESS_M), W);
      this.gapM = gapM == null ? COURT_GAP_M : gapM;      // the clear path around every court and lift / ramp side; the caller may ask for more than the Rhino tool's 1.5 m
      this.gap = toCells(this.gapM);
      // zoning: { zgap, xgap, egap } in cells = between items of one zone / between zones / around lifts, stairs and ramps; null = the plain, uniform gap
      this.zoning = zoning || null;
      if (this.zoning) this.gap = this.zoning.zgap;
      this.pickK = 1;
      this.edgeFirst = true;
      this.edgeW = EDGE_WEIGHT;
      this.rules = null;         // the placement rules prepared for this grid (prepareRules), or null: the Rhino tool's plain behaviour
      this.notes = [];           // what a rule could not do for this layout, in words
      this.serviceCorner = null; // index of the corner the first service module took: the next one goes beside it
      this.serviceFirst = null;  // ...and the rectangle it took
      this.courts = [];          // [name, rect]
      this.courtRects = [];
      this.paths = [];
      this.basePaths = [];       // lift landings + the corridor linking them (before any court)
      // courts must stay clear of lifts / ramps: that band becomes their secondary path
      this.entryZone = grid.entryCells.map(e => inflate(e, this.zoning ? this.zoning.egap : this.gap));
    }
  }

  /**
   * The clear gap (cells) two named items must keep, under zoning Z = { zgap, xgap, egap }: the in-zone gap inside one zone, the primary-path gap between
   * zones - except the locker and bathroom modules, which share a wall with each other (no path between them, and only them), and which need more than the
   * ordinary in-zone gap from anything else: a lobby to actually enter by, not a corridor barely wider than their own door.
   */
  function requiredGapCells(a, b, Z) {
    if (noSetback(a) && noSetback(b)) return 0;
    const base = zoneOf(a) === zoneOf(b) ? Z.zgap : Z.xgap;
    return (noSetback(a) || noSetback(b)) ? Math.max(base, Z.lobbyGap) : base;
  }

  /** The clear gap (cells) between two named items: the plain gap, or with zoning requiredGapCells above. */
  function gapBetween(L, a, b) {
    if (!L.zoning || !a || !b) return L.gap;
    return requiredGapCells(a, b, L.zoning);
  }
  /** May item `name` stand on rectangle r as far as the garden band goes (indoor items may stand in it)? */
  function zoneAllows(L, name, r) {
    return !L.zoning || !name || noSetback(name) || L.grid.outdoorOk(r);
  }
  /** Contact with the setback line for every sport, with the roof's walls for the service modules (which stand against them). */
  function edgeOf(L, name, r) {
    return L.zoning && name && noSetback(name) ? L.grid.wallContact(r) : L.grid.edgeContact(r);
  }
  /** The indoor zone: the box round the indoor items that gather round the Locker corner (Rest / Hydration is not one of them), in cells, or null while there are none. */
  function indoorBoxOf(courts) {
    let box = null;
    for (const [n, r] of courts) {
      if (zoneOf(n) !== "indoor" || NO_CLUSTER.has(n)) continue;
      box = box ? [Math.min(box[0], r[0]), Math.min(box[1], r[1]), Math.max(box[2], r[2]), Math.max(box[3], r[3])] : r.slice();
    }
    return box;
  }
  /**
   * Widens the indoor zone's box so the wall gives a locker/bathroom module its SERVICE_LOBBY_M in front - the side away from the roof's own wall it backs
   * onto - even when nothing else happens to reach that far. requiredGapCells already keeps every OTHER item that far from one; this is the case that rule
   * cannot reach: nothing else is there at all, so without this the wall itself (just the ordinary 0.15 m half-thickness past the module) sits right against it.
   */
  function padForServiceLobby(box, courts, grid, lobbyCells) {
    if (!box) return box;
    let [x0, y0, x1, y1] = box;
    for (const [n, r] of courts) {
      if (!noSetback(n)) continue;
      if (r[1] === 0) y1 = Math.max(y1, r[3] + lobbyCells);           // backs onto the top edge - the front is below it
      if (r[3] === grid.ny) y0 = Math.min(y0, r[1] - lobbyCells);     // backs onto the bottom edge - the front is above it
      if (r[0] === 0) x1 = Math.max(x1, r[2] + lobbyCells);           // backs onto the left edge - the front is to its right
      if (r[2] === grid.nx) x0 = Math.min(x0, r[0] - lobbyCells);     // backs onto the right edge - the front is to its left
    }
    return [Math.max(0, x0), Math.max(0, y0), Math.min(grid.nx, x1), Math.min(grid.ny, y1)];
  }
  /** The indoor zone's box as everything during placement must see it: items' own extent, padded for a locker/bathroom module's lobby (so a sport keeps clear
   * of the wall the lobby actually needs, not just the bare item footprint - and an indoor item flush-targeting the wall line lands on the same line the wall
   * really gets built on). */
  const indoorBox = L => padForServiceLobby(indoorBoxOf(L.courts), L.courts, L.grid, L.zoning ? L.zoning.lobbyGap : 0);

  const WALL_THICKNESS_M = 0.3;    // a real wall round the indoor zone, centred on its dotted line (already the 2 m clearance every sport keeps from it)
  const DOOR_WIDTH_M = 1.0;
  const SERVICE_LOBBY_M = 2.0;     // the locker and bathroom modules need this much clear in front of them, not just the ordinary in-zone gap - a lobby to enter by

  /**
   * The indoor zone's wall (metres): a WALL_THICKNESS_M ring centred on `zoneM` (so it needs no space beyond what the wall-clearance rule already reserves), with a
   * DOOR_WIDTH_M door cut into whichever of its four sides sits nearest the primary pathway network. `primaryRectsM` = the primary paths, in metres.
   * Returns { thicknessM, rects: [[x0,y0,x1,y1], ...] (the wall, door opening already cut out), door: { x0,y0,x1,y1, side } } or null with no indoor zone.
   */
  function buildIndoorWall(zoneM, primaryRectsM, siteBbox) {
    if (!zoneM) return null;
    const t = WALL_THICKNESS_M / 2;
    // the indoor zone may start flush at the roof's own edge (the Locker corner rule: indoor items may sit at the wall the roof itself has); a new wall centred on that
    // edge would then hang half its thickness past the roof, so it is clamped to the site's own extent - the roof's real exterior wall is already there, off-model
    const clamp = r => siteBbox ? [Math.max(r[0], siteBbox.x0), Math.max(r[1], siteBbox.y0), Math.min(r[2], siteBbox.x1), Math.min(r[3], siteBbox.y1)] : r;
    const outer = clamp([zoneM[0] - t, zoneM[1] - t, zoneM[2] + t, zoneM[3] + t]);
    const inner = [zoneM[0] + t, zoneM[1] + t, zoneM[2] - t, zoneM[3] - t];
    // subtractRect(outer, inner) on a rectangle this much bigger than its inset always gives exactly these four, in this order: top (N), bottom (S), left (W), right (E) -
    // top/bottom span the full outer width (they own the corners); left/right are just the middle strip between them.
    const [wallN, wallS, wallW, wallE] = subtractRect(outer, inner);
    const sides = [{ name: "N", rect: wallN, horizontal: true }, { name: "S", rect: wallS, horizontal: true }, { name: "W", rect: wallW, horizontal: false }, { name: "E", rect: wallE, horizontal: false }];
    const gapToPaths = r => primaryRectsM.reduce((m, p) => Math.min(m, Math.max(r[0] - p[2], p[0] - r[2], 0) + Math.max(r[1] - p[3], p[1] - r[3], 0)), Infinity);
    let best = sides[0], bestGap = Infinity;
    for (const s of sides) { const g = primaryRectsM.length ? gapToPaths(s.rect) : 0; if (g < bestGap) { bestGap = g; best = s; } }
    const walls = sides.map(s => s.rect);
    const idx = walls.indexOf(best.rect);
    let door;
    if (best.horizontal) {
      const clearX0 = zoneM[0] + t, clearX1 = zoneM[2] - t, cx = (clearX0 + clearX1) / 2;       // between the inner faces of the side posts - the door never opens onto a corner
      const w = Math.min(DOOR_WIDTH_M, Math.max(0, clearX1 - clearX0)), dx0 = cx - w / 2, dx1 = cx + w / 2;
      door = { x0: dx0, y0: best.rect[1], x1: dx1, y1: best.rect[3], side: best.name };
      walls.splice(idx, 1, [best.rect[0], best.rect[1], dx0, best.rect[3]], [dx1, best.rect[1], best.rect[2], best.rect[3]]);
    } else {
      const clearY0 = zoneM[1] + t, clearY1 = zoneM[3] - t, cy = (clearY0 + clearY1) / 2;
      const h = Math.min(DOOR_WIDTH_M, Math.max(0, clearY1 - clearY0)), dy0 = cy - h / 2, dy1 = cy + h / 2;
      door = { x0: best.rect[0], y0: dy0, x1: best.rect[2], y1: dy1, side: best.name };
      walls.splice(idx, 1, [best.rect[0], best.rect[1], best.rect[2], dy0], [best.rect[0], dy1, best.rect[2], best.rect[3]]);
    }
    // the wall is whole - never cut to dodge a lift or stair. A lift/stair crossing it is prevented earlier, at the point an indoor item is placed (see
    // wallStaysClearOfAnchors): the zone's own shape adapts so its bounding box, and so this wall, never has to reach one in the first place.
    return { thicknessM: WALL_THICKNESS_M, rects: walls.filter(w => w[2] - w[0] > 1e-6 && w[3] - w[1] > 1e-6), door };
  }
  /** Where the placed items of the same cluster zone are centred (cells), or null when there are none: the pull that keeps a zone together and grows the indoor zone from its corner. */
  function zoneCentre(L, name) {
    if (!L.zoning) return null;
    const z = clusterZone(name);
    let sx = 0, sy = 0, n = 0;
    for (const [n2, r] of L.courts) if (clusterZone(n2) === z) { sx += (r[0] + r[2]) / 2; sy += (r[1] + r[3]) / 2; n++; }
    return n ? { x: sx / n, y: sy / n, n } : null;
  }
  /** Score (higher = better) for standing beside an identical item, the same way round, with edges lined up: two Ping Pong tables side by side. */
  function alignScore(L, name, r) {
    if (!L.zoning) return 0;
    const w = r[2] - r[0], h = r[3] - r[1], near = toCells(NEAR_M);
    let best = 0;
    for (const [n2, q] of L.courts) {
      const gx = Math.max(r[0] - q[2], q[0] - r[2], 0), gy = Math.max(r[1] - q[3], q[1] - r[3], 0);
      if (Math.hypot(gx, gy) > near) continue;
      const shares = q[0] === r[0] || q[2] === r[2] || q[1] === r[1] || q[3] === r[3];        // a left, right, top or bottom edge on the same line
      if (n2 === name && q[2] - q[0] === w && q[3] - q[1] === h) {
        const g = L.zoning.zgap;
        const beside = q[1] === r[1] && (Math.abs(r[0] - q[2] - g) <= 1 || Math.abs(q[0] - r[2] - g) <= 1);
        const above = q[0] === r[0] && (Math.abs(r[1] - q[3] - g) <= 1 || Math.abs(q[1] - r[3] - g) <= 1);
        if (beside || above) { best = Math.max(best, ALIGN_TIGHT); continue; }
      }
      if (shares) best = Math.max(best, ALIGN_ANY);
    }
    return best;
  }
  /** After placement: the items that have a neighbour within NEAR_M but share no edge line with any of them. */
  function notAligned(L) {
    const near = toCells(NEAR_M), out = [];
    L.courts.forEach(([n, r], i) => {
      let hasNear = false, shares = false;
      L.courts.forEach(([, q], j) => {
        if (i === j) return;
        if (Math.hypot(Math.max(r[0] - q[2], q[0] - r[2], 0), Math.max(r[1] - q[3], q[1] - r[3], 0)) > near) return;
        hasNear = true;
        if (q[0] === r[0] || q[2] === r[2] || q[1] === r[1] || q[3] === r[3]) shares = true;
      });
      if (hasNear && !shares) out.push(n);
    });
    return out;
  }
  /** Can item `name` at r be reached: it touches a primary path, or (zoning) it sits across an in-zone path from an item that can be reached? */
  function hasAccess(L, name, r) {
    if (L.paths.some(p => contactLen(r, p) >= L.minAcc)) return true;
    if (!L.zoning) return false;
    for (const [n2, q] of L.courts) {
      const g = gapBetween(L, name, n2);
      if (zoneOf(n2) !== zoneOf(name) || g === 0) continue;         // (across a shared wall there is no path to walk on)
      if (facingLen(r, q, g) >= L.minAcc) return true;
    }
    return false;
  }
  /** Length (cells) over which two rectangles face each other across a gap of at most `g` cells (+1 cell of slack), 0 when they do not face. */
  function facingLen(a, b, g) {
    const dx = Math.max(a[0] - b[2], b[0] - a[2]), dy = Math.max(a[1] - b[3], b[1] - a[3]);
    if (dx >= 0 && dx <= g + 1 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0) return Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (dy >= 0 && dy <= g + 1 && Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0) return Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    return 0;
  }

  // ── placement rules: service modules in a corner, heavy items along the structural grid ──
  /**
   * What the rules need on this grid. `rules` = { serviceCorners: bool, gridLines: [{ x1, y1, x2, y2 }] (metres, in the roof's plan) } or null.
   *   corners    the roof's corners, nearest to a lift / stair first (the service modules go to the first free one)
   *   gridXs/Ys  the structural grid's vertical / horizontal lines, in grid cells (a line off the axes is not a grid line of this plan and is left out)
   *   heavy      the courts whose dead load is above HEAVY_DEAD_LOAD_KN_M2, which are asked to sit along that grid
   */
  function prepareRules(grid, rules) {
    if (!rules) return null;
    const out = { serviceNames: new Set(), corners: [], gridXs: [], gridYs: [], heavy: new Set(), hasGrid: false, cornerFallback: "" };
    if (rules.serviceCorners) {
      let anchors = grid.anchorCells || [];
      const dist = (c, a) => Math.hypot(Math.max(a[0] - c.x, 0, c.x - a[2]), Math.max(a[1] - c.y, 0, c.y - a[3]));
      if (anchors.length && grid.corners.length) {
        out.corners = grid.corners.map(c => ({ x: c.x, y: c.y, d: Math.min(...anchors.map(a => dist(c, a))) })).sort((a, b) => a.d - b.d).slice(0, 12);
        SPORTS.filter(s => s.service).forEach(s => out.serviceNames.add(s.name));
      } else if (rules.cornerFallback && grid.corners.length) {
        // zoning: the indoor zone still needs a corner to grow from. No lift or stair on the roof: the corner nearest a ramp, else the top-left corner
        anchors = grid.entryCells || [];
        out.corners = (anchors.length
          ? grid.corners.map(c => ({ x: c.x, y: c.y, d: Math.min(...anchors.map(a => dist(c, a))) }))
          : grid.corners.map(c => ({ x: c.x, y: c.y, d: c.y * 10000 + c.x }))).sort((a, b) => a.d - b.d).slice(0, 12);
        out.cornerFallback = anchors.length ? "ramp" : "top-left";
        SPORTS.filter(s => s.service).forEach(s => out.serviceNames.add(s.name));
      }
    }
    const xs = new Set(), ys = new Set();
    for (const gl of rules.gridLines || []) {
      const dx = Math.abs(gl.x2 - gl.x1), dy = Math.abs(gl.y2 - gl.y1);
      if (Math.max(dx, dy) < 0.5) continue;
      if (dx <= 0.02 * dy) xs.add(Math.round(((gl.x1 + gl.x2) / 2 - grid.ox) / RES));
      else if (dy <= 0.02 * dx) ys.add(Math.round(((gl.y1 + gl.y2) / 2 - grid.oy) / RES));
    }
    out.gridXs = Array.from(xs).sort((a, b) => a - b);
    out.gridYs = Array.from(ys).sort((a, b) => a - b);
    out.hasGrid = out.gridXs.length + out.gridYs.length > 0;
    if (out.hasGrid) SPORTS.filter(s => s.deadLoad != null && s.deadLoad > HEAVY_DEAD_LOAD_KN_M2).forEach(s => out.heavy.add(s.name));
    return out;
  }

  /** Is court rectangle r along the structural grid: a grid line parallel to its long side runs along its centre line or one of its long edges (within 0.1 m)? */
  function gridAlong(R, r) {
    if (!R || !R.hasGrid) return false;
    const w = r[2] - r[0], h = r[3] - r[1], tol = 1;
    const near = (lines, a, b) => lines.some(g => Math.abs(g - (a + b) / 2) <= tol || Math.abs(g - a) <= tol || Math.abs(g - b) <= tol);
    return (w >= h && near(R.gridYs, r[1], r[3])) || (h >= w && near(R.gridXs, r[0], r[2]));
  }

  const distToCorner = (r, c) => Math.hypot(Math.max(r[0] - c.x, 0, c.x - r[2]), Math.max(r[1] - c.y, 0, c.y - r[3])) * RES;
  const rectGapM = (a, b) => Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0)) * RES;

  /** How a finished layout keeps the rules: the service modules (in a corner? which one?), the heavy items (along the grid?), and a score to prefer layouts that keep more. */
  function ruleCompliance(L, rules) {
    const R = rules || L.rules, out = { services: [], heavy: [], score: 0 };
    if (!R) return out;
    for (const [name, r] of L.courts) {
      if (R.serviceNames.has(name)) {
        let best = Infinity, rank = -1;
        R.corners.forEach((c, k) => { const d = distToCorner(r, c); if (d < best) { best = d; rank = k; } });
        const inCorner = best <= 0.35;
        const beside = !inCorner && L.serviceCorner != null && distToCorner(r, R.corners[L.serviceCorner]) <= SERVICE_MAX_FROM_CORNER_M;
        out.services.push({ name, state: inCorner ? "corner" : beside ? "beside" : "away", rank: inCorner ? rank : beside ? L.serviceCorner : -1 });
        out.score += inCorner ? (rank === 0 ? 2 : 1) : beside ? (L.serviceCorner === 0 ? 1 : 0) : 0;
      }
      if (R.hasGrid && R.heavy.has(name)) {
        const along = gridAlong(R, r);
        out.heavy.push({ name, along });
        if (along) out.score += 1;
      }
    }
    return out;
  }

  function buildSeeds(L, ring, rng, noise, warnings) {
    const g = L.grid, W = L.W;
    g.entryCells.forEach((E, idx) => {
      const [ex0, ey0, ex1, ey1] = E;
      const options = [];
      for (const side of "NSEW") {
        for (const ext of [W, 0]) {
          let r;
          if (side === "N") r = [ex0 - ext, ey1, ex1 + ext, ey1 + W];
          else if (side === "S") r = [ex0 - ext, ey0 - W, ex1 + ext, ey0];
          else if (side === "E") r = [ex1, ey0 - ext, ex1 + W, ey1 + ext];
          else r = [ex0 - W, ey0 - ext, ex0, ey1 + ext];
          // a landing is the entry's own doorstep: a lift/ramp/stair may sit in the garden band (the band only ever kept outdoor items and ordinary pathway routing
          // off it), so its landing must be free to as well, on itemFree (footprint + lifts/keep-clear only) rather than isFree (which also blocks the whole band).
          if (g.itemFree(r)) { options.push([side, r]); break; }
        }
      }
      if (!options.length) {
        warnings.push("Vertical circulation #" + (idx + 1) + " has no free landing (it sits on/inside the garden band). Try a smaller setback.");
        return;
      }
      if (ring) { options.forEach(o => L.paths.push(o[1])); return; }
      const vx = g.cx - (ex0 + ex1) / 2, vy = g.cy - (ey0 + ey1) / 2;
      const nrm = Math.hypot(vx, vy) || 1;
      const dirs = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
      let best = null, bestKey = -Infinity;
      for (const o of options) {
        const key = (dirs[o[0]][0] * vx + dirs[o[0]][1] * vy) / nrm + noise * 0.4 * rng.random();
        if (key > bestKey) { bestKey = key; best = o; }
      }
      L.paths.push(best[1]);
    });
  }

  /** Straight, L-shaped and edge-trunk bands (width W) that could link rectangle a with b. */
  function bridgeCandidates(a, b, W, xs, ys, free) {
    const cands = [];
    const ox0 = Math.max(a[0], b[0]), ox1 = Math.min(a[2], b[2]);
    if (ox1 - ox0 >= W) {
      let y0 = null, y1 = null;
      if (a[3] <= b[1]) { y0 = a[3]; y1 = b[1]; } else if (b[3] <= a[1]) { y0 = b[3]; y1 = a[1]; }
      if (y0 !== null && y1 > y0) for (const x of uniq([ox0, ox1 - W, Math.floor((ox0 + ox1 - W) / 2)])) cands.push([[x, y0, x + W, y1]]);
    }
    const oy0 = Math.max(a[1], b[1]), oy1 = Math.min(a[3], b[3]);
    if (oy1 - oy0 >= W) {
      let x0 = null, x1 = null;
      if (a[2] <= b[0]) { x0 = a[2]; x1 = b[0]; } else if (b[2] <= a[0]) { x0 = b[2]; x1 = a[0]; }
      if (x0 !== null && x1 > x0) for (const y of uniq([oy0, oy1 - W, Math.floor((oy0 + oy1 - W) / 2)])) cands.push([[x0, y, x1, y + W]]);
    }
    for (const [p, q] of [[a, b], [b, a]]) {
      if (p[3] - p[1] < W || q[2] - q[0] < W) continue;
      for (const yh of uniq([p[1], p[3] - W])) {
        for (const xv of uniq([q[0], q[2] - W])) {
          let hx0, hx1;
          if (xv >= p[2]) { hx0 = p[2]; hx1 = xv + W; } else if (xv + W <= p[0]) { hx0 = xv; hx1 = p[0]; } else continue;
          const H = [hx0, yh, hx1, yh + W];
          let V;
          if (q[1] >= yh + W) V = [xv, yh + W, xv + W, q[1]]; else if (q[3] <= yh) V = [xv, q[3], xv + W, yh]; else continue;
          cands.push(V[3] <= V[1] ? [H] : [H, V]);
        }
      }
    }
    // EDGE TRUNK: one long corridor along the roof edge (or any wall line) plus a short stub from each landing. The middle of the roof stays in one piece.
    const stubOptions = (p, T, horizontal) => {
      if (horizontal) {
        if (p[1] < T[3] && T[1] < p[3]) return [null];             // already overlaps the trunk band
        if (p[2] - p[0] < W) return [];
        return uniq([p[0], p[2] - W]).map(xv => {
          const st = p[3] <= T[1] ? [xv, p[3], xv + W, T[1]] : [xv, T[3], xv + W, p[1]];
          return st[3] > st[1] ? st : null;
        });
      }
      if (p[0] < T[2] && T[0] < p[2]) return [null];
      if (p[3] - p[1] < W) return [];
      return uniq([p[1], p[3] - W]).map(yv => {
        const st = p[2] <= T[0] ? [p[2], yv, T[0], yv + W] : [T[2], yv, p[0], yv + W];
        return st[2] > st[0] ? st : null;
      });
    };
    for (const yt of ys) {
      const T = [Math.min(a[0], b[0]), yt, Math.max(a[2], b[2]), yt + W];
      if (free && !free(T)) continue;
      for (const sa of stubOptions(a, T, true)) for (const sb of stubOptions(b, T, true)) cands.push([T].concat([sa, sb].filter(Boolean)));
    }
    for (const xt of xs) {
      const T = [xt, Math.min(a[1], b[1]), xt + W, Math.max(a[3], b[3])];
      if (free && !free(T)) continue;
      for (const sa of stubOptions(a, T, false)) for (const sb of stubOptions(b, T, false)) cands.push([T].concat([sa, sb].filter(Boolean)));
    }
    return cands;
  }

  /** Join the lift / ramp landings into ONE network. Corridors that run along the setback line are preferred. */
  function connectEntries(L, rng, noise, warnings) {
    const W = L.W, g = L.grid;
    let ys = [0, g.ny - W], xs = [0, g.nx - W];
    for (const y of g.anchorYs) ys.push(y, y - W);
    for (const x of g.anchorXs) xs.push(x, x - W);
    ys = uniq(ys).filter(y => y >= 0 && y <= g.ny - W);
    xs = uniq(xs).filter(x => x >= 0 && x <= g.nx - W);
    // the corridor reaching an entry may cross the garden band right at that entry's own doorstep, same reasoning as buildSeeds' landing above (itemFree, not isFree):
    // this only widens where the network is ALLOWED to run, it does not make the band cheaper to use - edgeContact below still pulls it toward the boundary line.
    const free = r => g.itemFree(r);
    for (let round = 0; round < 20; round++) {
      const comps = components(L.paths, W);
      if (comps.length <= 1) return;
      let best = null;
      for (let ci = 0; ci < comps.length; ci++) for (let cj = ci + 1; cj < comps.length; cj++) {
        for (const a of comps[ci]) for (const b of comps[cj]) {
          for (const cand of bridgeCandidates(a, b, W, xs, ys, free)) {
            if (!cand.every(free)) continue;
            if (components([a, b].concat(cand), W).length !== 1) continue;
            let cost = cand.reduce((s, r) => s + area(r), 0) * (1.0 + noise * 0.15 * rng.random());
            cost -= 4 * cand.reduce((s, r) => s + g.edgeContact(r), 0);
            if (best === null || cost < best[0]) best = [cost, cand];
          }
        }
      }
      if (best === null) { warnings.push("Could not connect all lifts / ramps with a pathway."); return; }
      best[1].forEach(r => L.paths.push(r));
    }
  }

  /**
   * Collision-free spots for a w x h court. Existing courts and lifts / ramps are inflated by the gap, so a new court is never closer than COURT_GAP_M to either -
   * EXCEPT two big courts, which only need a path on one side and may sit right next to each other.
   */
  function genSpots(L, w, h, big, onGrid, name) {
    const g = L.grid, G = L.gap;
    const zoned = !!(L.zoning && name);
    const xs = [0, g.nx - w], ys = [0, g.ny - h];
    if (zoned) {
      // beside every placed item, at exactly the gap this item owes it (in-zone or between zones)
      for (const [n2, c] of L.courts) { const q = gapBetween(L, name, n2); xs.push(c[2] + q, c[0] - q - w); ys.push(c[3] + q, c[1] - q - h); }
      const wall = zoneOf(name) !== "indoor" ? indoorBox(L) : null;       // ...and right at the clear distance from the indoor zone's wall line
      if (wall) { const q = L.zoning.xgap; xs.push(wall[2] + q, wall[0] - q - w); ys.push(wall[3] + q, wall[1] - q - h); }
      const inner = zoneOf(name) === "indoor" ? indoorBox(L) : null;      // an indoor item is also tried flush with each face of the indoor zone's wall line
      if (inner) { xs.push(inner[0], inner[2] - w); ys.push(inner[1], inner[3] - h); }
    }
    for (const x of g.anchorXs) xs.push(x, x - w);
    for (const y of g.anchorYs) ys.push(y, y - h);
    // a heavy item is also tried centred on, and with either long edge on, every line of the structural grid
    if (onGrid) {
      for (const gx of onGrid.gridXs) xs.push(gx - Math.round(w / 2), gx, gx - w);
      for (const gy of onGrid.gridYs) ys.push(gy - Math.round(h / 2), gy, gy - h);
    }
    for (const r of L.paths) { xs.push(r[0] - w, r[0], r[2] - w, r[2]); ys.push(r[1] - h, r[1], r[3] - h, r[3]); }
    for (const r of L.courtRects) { xs.push(r[0], r[2] - w, r[0] - G - w, r[2] + G, r[2], r[0] - w); ys.push(r[1], r[3] - h, r[1] - G - h, r[3] + G, r[3], r[1] - h); }
    for (const r of L.entryZone) { xs.push(r[0] - w, r[2]); ys.push(r[1] - h, r[3]); }
    const XS = uniq(xs).filter(x => x >= 0 && x <= g.nx - w);
    const YS = uniq(ys).filter(y => y >= 0 && y <= g.ny - h);
    const obstacles = [];
    for (const [n, c] of L.courts) obstacles.push(big && L.big.has(n) ? c : inflate(c, zoned ? gapBetween(L, name, n) : G));
    for (const r of L.entryZone) obstacles.push(r);
    for (const r of L.paths) obstacles.push(r);
    const S = g.sat, out = [];
    const bandBlocks = zoned && !noSetback(name) && !!g.maskSat;
    if (zoned && zoneOf(name) !== "indoor") {                            // the dotted rectangle is where the indoor zone's wall will go: every sport keeps the primary-path width clear of it (2.0 m at least)
      const box = indoorBox(L);
      if (box) obstacles.push(inflate(box, L.zoning.xgap));
    }
    // zoning: an indoor item's own spot must never grow the indoor zone's bounding box - and so the wall built around it - across a lift or stair. The wall stays
    // whole (never cut to dodge one); the zone's own shape adapts instead, by simply never being offered a spot that would reach that far in the first place.
    let indoorAnchorClear = null;
    if (zoned && zoneOf(name) === "indoor" && g.anchorCells && g.anchorCells.length) {
      const wallHalf = toCells(WALL_THICKNESS_M / 2);
      indoorAnchorClear = r => {
        const hypo = L.courts.concat([[name, r]]);
        const box = padForServiceLobby(indoorBoxOf(hypo), hypo, g, L.zoning.lobbyGap);   // the wall the anchor must stay clear of is this padded shape, not the bare item footprint
        const infl = inflate(box, wallHalf);
        return !g.anchorCells.some(a => infl[0] < a[2] && a[0] < infl[2] && infl[1] < a[3] && a[1] < infl[3]);
      };
    }
    for (const y of YS) {
      const Sa = S[y], Sb = S[y + h];
      for (const x of XS) {
        if (Sb[x + w] - Sa[x + w] - Sb[x] + Sa[x] !== 0) continue;
        const r = [x, y, x + w, y + h];
        if (bandBlocks && !g.outdoorOk(r)) continue;
        if (indoorAnchorClear && !indoorAnchorClear(r)) continue;
        let hit = false;
        for (const q of obstacles) if (q[0] < r[2] && r[0] < q[2] && q[1] < r[3] && r[1] < q[3]) { hit = true; break; }
        if (!hit) out.push(r);
      }
    }
    return out;
  }

  /** How tightly a court sits against walls / boundary / other courts (tight = good). */
  function contactCells(L, r, big, name) {
    const g = L.grid;
    const [x0, y0, x1, y1] = r;
    let c = g.stripBlocked(x0 - 1, y0, x0, y1) + g.stripBlocked(x1, y0, x1 + 1, y1) + g.stripBlocked(x0, y0 - 1, x1, y0) + g.stripBlocked(x0, y1, x1, y1 + 1);
    for (const [n, q] of L.courts) c += big && L.big.has(n) ? contactLen(r, q) : contactLen(r, inflate(q, L.zoning && name ? gapBetween(L, name, n) : L.gap));
    return c;
  }

  function distToPaths(r, paths) {
    let best = 1e9;
    for (const p of paths) best = Math.min(best, Math.max(p[0] - r[2], r[0] - p[2], 0) + Math.max(p[1] - r[3], r[1] - p[3], 0));
    return best;
  }

  function extendBand(L, base, axis, sign, free) {
    const W = L.W, g = L.grid;
    const f = sign > 0 ? base[axis + 2] : base[axis];
    const ts = new Set();
    for (const Q of L.paths) {
      let a, b;
      if (sign > 0) { a = Q[axis] - f; b = Q[axis] + W - f; } else { a = f - Q[axis + 2]; b = f - (Q[axis + 2] - W); }
      if (a > 0) ts.add(a);
      if (b > 0) ts.add(b);
    }
    if (!ts.size) return null;
    const grow = t => { const r = base.slice(); if (sign > 0) r[axis + 2] += t; else r[axis] -= t; return r; };
    let lo = 0, hi = (axis === 0 ? g.nx : g.ny) + 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (free(grow(mid))) lo = mid; else hi = mid;
    }
    for (const t of Array.from(ts).sort((a, b) => a - b)) {
      if (t > lo) break;
      const r = grow(t);
      if (adjacentAny(r, L.paths, W)) return r;
    }
    return null;
  }

  /** The ways to give court c a pathway: [cost, [rects]] each. */
  function laneOptions(L, c) {
    const W = L.W, g = L.grid;
    const obstacles = L.courtRects.concat([c]);
    const free = r => {
      if (!g.isFree(r)) return false;
      for (const o of obstacles) if (overlap(r, o)) return false;
      return true;
    };
    const [x0, y0, x1, y1] = c;
    const w = x1 - x0, h = y1 - y0;
    const out = [];
    const add = rects => {
      let cost = 0;
      for (const r of rects) cost += area(r) - L.paths.reduce((s, p) => s + interArea(r, p), 0);
      out.push([Math.max(cost, 0), rects]);
    };
    const sides = [[[x1, y0, x1 + W, y1], 1, h], [[x0 - W, y0, x0, y1], 1, h], [[x0, y1, x1, y1 + W], 0, w], [[x0, y0 - W, x1, y0], 0, w]];
    for (const [base, axis, sideLen] of sides) {
      if (sideLen < L.minAcc || !free(base)) continue;
      if (adjacentAny(base, L.paths, W)) { add([base]); continue; }
      for (const sign of [1, -1]) { const ext = extendBand(L, base, axis, sign, free); if (ext) add([ext]); }
    }
    const stubs = [];
    if (h >= W) for (const ys of uniq([y0, y1 - W, y0 + Math.floor((h - W) / 2)])) {
      stubs.push([[x1, ys, x1 + W, ys + W], 0, 1]);
      stubs.push([[x0 - W, ys, x0, ys + W], 0, -1]);
    }
    if (w >= W) for (const xs of uniq([x0, x1 - W, x0 + Math.floor((w - W) / 2)])) {
      stubs.push([[xs, y1, xs + W, y1 + W], 1, 1]);
      stubs.push([[xs, y0 - W, xs + W, y0], 1, -1]);
    }
    for (const [base, axis, sign] of stubs) {
      if (!free(base)) continue;
      if (adjacentAny(base, L.paths, W)) { add([base]); continue; }
      const ext = extendBand(L, base, axis, sign, free);
      if (ext) add([ext]);
    }
    return out;
  }

  /** After adding court r, is there still a free 2 m x 6 m run for the network to grow into? */
  function keepsNetworkOpen(L, r) {
    const g = L.grid, W = L.W, E = toCells(6.0);
    const courts = L.courtRects.concat([r]);
    const free = b => {
      if (!g.isFree(b)) return false;
      for (const c of courts) if (overlap(b, c)) return false;
      return true;
    };
    for (const p of L.paths) {
      const [x0, y0, x1, y1] = p;
      const cands = [];
      if (y1 - y0 >= W) for (const ys of uniq([y0, y1 - W])) { cands.push([x1, ys, x1 + E, ys + W]); cands.push([x0 - E, ys, x0, ys + W]); }
      if (x1 - x0 >= W) for (const xs of uniq([x0, x1 - W])) { cands.push([xs, y1, xs + W, y1 + E]); cands.push([xs, y0 - E, xs + W, y0]); }
      for (const b of cands) if (free(b)) return true;
    }
    return false;
  }

  /** With zoning, a function r -> score (higher = better): closeness to the rest of the item's zone, plus sitting tidily beside identical items. Without zoning it is always 0. */
  function zoningBonus(L, name) {
    if (!L.zoning || !name) return () => 0;
    const c = zoneCentre(L, name);
    return r => alignScore(L, name, r) - (c ? CLUSTER_PULL * RES * Math.hypot((r[0] + r[2]) / 2 - c.x, (r[1] + r[3]) / 2 - c.y) : 0) + (L.sameLeft > 0 && siblingRoom(L, name, r) ? SIBLING_ROOM : 0);
  }

  /** Is there a free spot right beside r (same size, same way round, edges aligned, one in-zone path apart) for the next identical item? */
  function siblingRoom(L, name, r) {
    const g = L.grid, w = r[2] - r[0], h = r[3] - r[1], q = gapBetween(L, name, name);
    const spots = [[r[2] + q, r[1]], [r[0] - q - w, r[1]], [r[0], r[3] + q], [r[0], r[1] - q - h]];
    const box = zoneOf(name) !== "indoor" ? indoorBox(L) : null;
    return spots.some(([x, y]) => {
      const s = [x, y, x + w, y + h];
      if (!g.itemFree(s) || !zoneAllows(L, name, s)) return false;
      if (L.paths.some(p => overlap(s, p)) || L.entryZone.some(e => overlap(s, e)) || (box && overlap(s, inflate(box, L.zoning.xgap)))) return false;
      return !L.courts.some(([n2, c]) => overlap(inflate(c, gapBetween(L, name, n2)), s)) && !overlap(inflate(r, q), s);
    });
  }

  /** Best spot among those already touching a pathway. recs = [[edge, contact, rect]]. Setback-line contact is weighted (edgeW) so edge / corner spots win. */
  function chooseDirect(L, recs, rng, noise, remaining, name) {
    const zb = zoningBonus(L, name);
    const keyed = recs.map(([ec, cc, r]) => [(L.edgeW * ec + cc) / 10 + noise * rng.random() + zb(r), -r[1], -r[0], r]);
    keyed.sort((a, b) => cmp(b, a));
    const pk = Math.max(1, L.pickK);
    const chosen = [];
    for (const k of keyed.slice(0, 60)) {
      if (remaining <= 0 || keepsNetworkOpen(L, k[3])) { chosen.push(k[3]); if (chosen.length >= pk) break; }
    }
    if (!chosen.length) keyed.slice(0, pk).forEach(k => chosen.push(k[3]));
    return pk > 1 ? rng.choice(chosen) : chosen[0];
  }

  /** Best spot that needs an access lane: [court rect, lane rects] or null. */
  function lanePick(L, recs, rng, noise, maxM2, name) {
    const zb = zoningBonus(L, name);
    const scored = recs.map(([ec, cc, r]) => [-((L.edgeW * ec + cc) / 10) + 0.003 * distToPaths(r, L.paths) - noise * rng.random() - zb(r), ec, cc, r]);
    scored.sort(cmp);
    let bestTotal = null, bestPick = null;
    for (const [, ec, cc, r] of scored.slice(0, LANE_CANDIDATES)) {
      const opts = laneOptions(L, r);
      if (!opts.length) continue;
      let pick = opts[0];
      for (const o of opts) if (o[0] < pick[0]) pick = o;
      if (maxM2 != null && pick[0] * RES * RES > maxM2) continue;
      const total = pick[0] * RES * RES - 0.4 * (L.edgeW * ec + cc) * RES;
      if (bestTotal === null || total < bestTotal) { bestTotal = total; bestPick = [r, pick[1]]; }
    }
    return bestPick;
  }

  function commit(L, name, r, lane) {
    L.courts.push([name, r]);
    L.courtRects.push(r);
    if (lane) lane.forEach(p => L.paths.push(p));
  }

  /**
   * Rule: a service module (locker rooms, bathrooms) goes in the roof corner nearest a lift or stair, and the next one beside it in the same corner.
   * The first takes the free spot with the least (distance to a corner + a small penalty per rank of that corner), so a blocked nearest corner passes it to the next one.
   * Returns [true, ""] when placed, or null when no spot is near a corner: the normal search then takes the module (and says so).
   */
  function placeAtCorner(L, name, w0, h0) {
    const R = L.rules;
    const orients = w0 === h0 ? [[w0, h0]] : [[w0, h0], [h0, w0]];
    const heavy = !!(R.hasGrid && R.heavy.has(name));       // a locker room or bathroom is heavy too: near the corner, a spot along the grid is preferred
    const emin = toCells(EDGE_MIN_M);
    const attempt = sameCorner => {
      let cands = [];
      for (const [w, h] of orients) {
        for (const r of genSpots(L, w, h, false, heavy ? R : null, name)) {
          if (sameCorner) {
            // together in the same corner: tucked in against the first service module (its clear gap), on the roof's edge like it
            const d = distToCorner(r, R.corners[L.serviceCorner]);
            cands.push([rectGapM(L.serviceFirst, r) + (edgeOf(L, name, r) >= emin ? 0 : 6) + 0.05 * d, L.serviceCorner, r, d]);
            continue;
          }
          let best = null;
          R.corners.forEach((c, k) => { const d = distToCorner(r, c); if (!best || d + CORNER_RANK_PENALTY_M * k < best[0]) best = [d + CORNER_RANK_PENALTY_M * k, k, r, d]; });
          cands.push(best);
        }
      }
      cands.sort((a, b) => a[0] - b[0]);
      if (heavy && cands.length) {
        const limit = cands[0][0] + (sameCorner ? 1.0 : 3.0);   // within 3 m of the best corner spot (1 m for one beside the first), one along the structural grid wins
        const bestEdge = edgeOf(L, name, cands[0][2]);          // ...but never one that leaves a sliver against the roof edge that the best spot lay flush against
        const aligned = cands.filter(c => c[0] <= limit && gridAlong(R, c[2]) && edgeOf(L, name, c[2]) >= bestEdge);
        if (aligned.length) cands = aligned.concat(cands.filter(c => !aligned.includes(c)));
      }
      for (const [, k, r, d] of cands.slice(0, 80)) {
        if (d > SERVICE_MAX_FROM_CORNER_M) continue;
        let lane = null;
        if (!hasAccess(L, name, r)) {
          const opts = laneOptions(L, r);
          if (!opts.length) continue;
          lane = opts.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
        }
        commit(L, name, r, lane);
        if (L.serviceCorner == null) { L.serviceCorner = k; L.serviceFirst = r; }
        return [true, ""];
      }
      return null;
    };
    return (L.serviceCorner != null && attempt(true)) || attempt(false);
  }

  /**
   * Zoning: a Bouldering Wall is a wall you climb, so it goes with its back on the indoor zone's wall line (its long side flush with a face of the dotted rectangle, inside it),
   * not out in the middle of the zone. Placed after the rest of the zone, whose outline it then is. Returns [true, ""], or null when no such spot is free.
   */
  function placeOnWall(L, name, w0, h0, rng, noise, remaining) {
    const box = indoorBox(L);
    if (!box) return null;
    // two ways to have its back on the wall line: inside the zone with its long side on a face of the rectangle, or just outside a face (one path away from the items there, along
    // the face and no wider than it), where its own outer long side then becomes the wall line. The first is tried first: it does not grow the zone.
    const inside = { directs: [], others: [] }, outside = { directs: [], others: [] };
    for (const [w, h] of (w0 === h0 ? [[w0, h0]] : [[w0, h0], [h0, w0]])) {
      for (const r of genSpots(L, w, h, false, null, name)) {
        const isIn = r[0] >= box[0] && r[1] >= box[1] && r[2] <= box[2] && r[3] <= box[3];
        let bucket = null;
        if (isIn) { if (w >= h ? (r[1] === box[1] || r[3] === box[3]) : (r[0] === box[0] || r[2] === box[2])) bucket = inside; }
        else if (w >= h) { if (r[0] >= box[0] && r[2] <= box[2] && (r[1] >= box[3] || r[3] <= box[1])) bucket = outside; }          // wide: on the top or bottom face
        else if (r[1] >= box[1] && r[3] <= box[3] && (r[0] >= box[2] || r[2] <= box[0])) bucket = outside;                              // tall: on the left or right face
        if (bucket) (hasAccess(L, name, r) ? bucket.directs : bucket.others).push([0, contactCells(L, r, false, name), r]);
      }
    }
    for (const b of [inside, outside]) {
      if (b.directs.length) { commit(L, name, chooseDirect(L, b.directs, rng, noise, remaining, name)); return [true, ""]; }
      const pick = lanePick(L, b.others, rng, noise, null, name);
      if (pick) { commit(L, name, pick[0], pick[1]); return [true, ""]; }
    }
    return null;
  }

  /** Priority 1: a spot on the setback line. Priority 2: anywhere in the middle. Returns [ok, reason]. */
  function placeCourt(L, name, w0, h0, rng, noise, remaining) {
    const g = L.grid;
    const big = L.big.has(name);
    const R = L.rules;
    if (R && R.serviceNames.has(name)) {
      const atCorner = placeAtCorner(L, name, w0, h0);
      if (atCorner) return atCorner;
      L.notes.push(labelOf(name) + ": no free corner near a lift or stair, so it was placed elsewhere.");
    }
    if (L.zoning && name === "Bouldering Wall") {
      const onWall = placeOnWall(L, name, w0, h0, rng, noise, remaining);
      if (onWall) return onWall;
      L.notes.push(labelOf(name) + ": no free spot with its back on the indoor zone's wall line, so it was placed elsewhere.");
    }
    const heavyOnGrid = !!(R && R.hasGrid && R.heavy.has(name));
    const orients = w0 === h0 ? [[w0, h0]] : [[w0, h0], [h0, w0]];
    const emin = toCells(EDGE_MIN_M);
    let directs = [], others = [];
    let anySpot = false;
    const clustered = !!(L.zoning && zoneCentre(L, name));         // zoning: an item joining its zone cares far less about the wall than about the zone
    const edgeScale = clustered ? EDGE_SCALE_CLUSTERED : 1;
    for (const [w, h] of orients) {
      const spots = genSpots(L, w, h, big, heavyOnGrid ? R : null, name);
      if (spots.length) anySpot = true;
      for (const r of spots) {
        const rec = [L.edgeFirst ? edgeOf(L, name, r) * edgeScale : 0, contactCells(L, r, big, name), r];
        (hasAccess(L, name, r) ? directs : others).push(rec);
      }
    }
    if (!anySpot) return [false, "no space"];
    if (heavyOnGrid) {
      // rule: a heavy item sits along the structural grid where it can; where it cannot it is placed anyway and the layout says so
      const d2 = directs.filter(rec => gridAlong(R, rec[2])), o2 = others.filter(rec => gridAlong(R, rec[2]));
      if (d2.length || o2.length) { directs = d2; others = o2; }
      else L.notes.push(labelOf(name) + ": no free spot along the structural grid (dead load above " + HEAVY_DEAD_LOAD_KN_M2.toFixed(1) + " kN/m²), so it was placed elsewhere.");
    }
    // zoning: once a zone has its first item, staying together beats hugging the setback line (which is then only a tie-break inside the score)
    if (L.edgeFirst && !(L.zoning && zoneCentre(L, name))) {
      const edgeD = directs.filter(x => x[0] >= emin);            // on the setback line, path already there
      if (edgeD.length) { commit(L, name, chooseDirect(L, edgeD, rng, noise, remaining, name)); return [true, ""]; }
      const edgeO = others.filter(x => x[0] >= emin);             // on the setback line, needs a lane
      if (edgeO.length) {
        const pick = lanePick(L, edgeO, rng, noise, PERIM_LANE_MAX_M2, name);
        if (pick) { commit(L, name, pick[0], pick[1]); return [true, ""]; }
      }
    }
    if (directs.length) { commit(L, name, chooseDirect(L, directs, rng, noise, remaining, name)); return [true, ""]; }   // the middle
    const pick = lanePick(L, others, rng, noise, null, name);
    if (!pick) return [false, "no access route"];
    commit(L, name, pick[0], pick[1]);
    return [true, ""];
  }

  function runAttempt(grid, W, items, ring, rng, noise, deadline, pickK, edgeFirst, bigSet, gapM, prepared, Z) {
    const L = new Layout(grid, W, bigSet, gapM, Z);
    L.rules = prepared || null;
    L.pickK = pickK;
    L.edgeFirst = edgeFirst;
    L.edgeW = edgeFirst ? EDGE_WEIGHT : 0.0;
    const warnings = [];
    buildSeeds(L, ring, rng, noise, warnings);
    if (grid.entryCells.length && !L.paths.length) return [L, [], items.map(([n, w, h]) => [n, w, h, "lifts / ramps unreachable"]), warnings];
    connectEntries(L, rng, noise, warnings);
    L.basePaths = L.paths.slice();
    const placed = [], unplaced = [];
    items.forEach(([n, w, h], k) => {
      if (now() > deadline) { unplaced.push([n, w, h, "time limit"]); return; }
      L.sameLeft = items.slice(k + 1).filter(it => it[0] === n).length;                 // identical items still to come (zoning keeps room beside the one being placed)
      const [ok, why] = placeCourt(L, n, w, h, rng, noise, items.length - k - 1);
      if (ok) placed.push([n, w, h]); else unplaced.push([n, w, h, why]);
    });
    L.notes.forEach(n => warnings.push(n));
    return [L, placed, unplaced, warnings];
  }

  // ── secondary paths: around every court AND along the inside sides of lifts / ramps ──
  /** Usable, non-blocked cells inside rectangle r, as rectangles. */
  function freeRectsIn(grid, r) {
    const x0 = Math.max(r[0], 0), y0 = Math.max(r[1], 0), x1 = Math.min(r[2], grid.nx), y1 = Math.min(r[3], grid.ny);
    if (x1 <= x0 || y1 <= y0) return [];
    return rowsToRects(grid.rows, x0, x1, y0, y1);
  }
  /** A G-wide ring around each rectangle, clipped to the usable zone: sides on the setback line fall outside it and get no path. */
  function secondaryPaths(grid, rects, G) {
    const out = [];
    for (const c of rects) {
      const [x0, y0, x1, y1] = c;
      for (const s of [[x0 - G, y1, x1 + G, y1 + G], [x0 - G, y0 - G, x1 + G, y0], [x0 - G, y0, x0, y1], [x1, y0, x1 + G, y1]]) out.push(...freeRectsIn(grid, s));
    }
    return out;
  }
  /** Rings around the NORMAL courts (big courts need one path side only) plus the lift / ramp rings (inside sides only). */
  function allSecondary(grid, courts, G, bigSet) {
    const rings = courts.filter(([n]) => !bigSet.has(n)).map(([, r]) => r);
    return secondaryPaths(grid, rings, G).concat(secondaryPaths(grid, grid.entryCells, G));
  }

  /**
   * Zoning: the paths around the items. A ring of the in-zone width around every item, the wider ring around lifts / stairs / ramps, and, where two items face each
   * other across the gap they owe each other (in-zone, or the wider one between zones), all the space between them.
   */
  function zoningSecondary(grid, courts, Z) {
    const out = [];
    for (const [, c] of courts) out.push(...secondaryPaths(grid, [c], Z.zgap));
    out.push(...secondaryPaths(grid, grid.entryCells, Z.egap));
    for (let i = 0; i < courts.length; i++) for (let j = i + 1; j < courts.length; j++) {
      const [na, a] = courts[i], [nb, b] = courts[j];
      const g = zoneOf(na) === zoneOf(nb) ? Z.zgap : Z.xgap;
      const dx = Math.max(a[0] - b[2], b[0] - a[2]), dy = Math.max(a[1] - b[3], b[1] - a[3]);
      const oy0 = Math.max(a[1], b[1]), oy1 = Math.min(a[3], b[3]), ox0 = Math.max(a[0], b[0]), ox1 = Math.min(a[2], b[2]);
      if (dx >= 0 && dx <= g + 1 && oy1 > oy0) out.push(...freeRectsIn(grid, a[2] <= b[0] ? [a[2], oy0, b[0], oy1] : [b[2], oy0, a[0], oy1]));
      else if (dy >= 0 && dy <= g + 1 && ox1 > ox0) out.push(...freeRectsIn(grid, a[3] <= b[1] ? [ox0, a[3], ox1, b[1]] : [ox0, b[3], ox1, a[1]]));
    }
    // a ring is never laid over an item next to it (the locker and bathroom modules touch: no path between them)
    return out.flatMap(r => courts.reduce((acc, [, c]) => acc.flatMap(x => subtractRect(x, c)), [r]));
  }

  // ── leftover pockets (become garden) ────────────────────────────────────────────
  function paintRows(grid, rects) {
    const rows = grid.rows.map(r => Uint8Array.from(r));
    for (const r of rects) {
      const a = Math.max(r[0], 0), b = Math.min(r[2], grid.nx);
      if (b <= a) continue;
      for (let j = Math.max(r[1], 0); j < Math.min(r[3], grid.ny); j++) rows[j].fill(1, a, b);
    }
    return rows;
  }
  const countFree = rows => rows.reduce((s, row) => s + row.reduce((t, v) => t + (v === 0 ? 1 : 0), 0), 0);
  function unusedCells(grid, courts, paths, gap, bigSet, Z) {
    const sec = Z ? zoningSecondary(grid, courts, Z) : allSecondary(grid, courts, gap, bigSet);
    return countFree(paintRows(grid, courts.map(c => c[1]).concat(paths, sec)));
  }
  /** Every free cell that is not court / pathway, as rectangles: [garden-worthy pockets, small remainders, total unused cells]. */
  function leftoverSplit(grid, rects) {
    const rows = paintRows(grid, rects);
    const unused = countFree(rows);
    const allp = rowsToRects(rows, 0, grid.nx, 0, grid.ny);
    const md = toCells(MIN_POCKET_DIM), ma = MIN_POCKET_AREA / (RES * RES);
    const big = [], small = [];
    for (const p of allp) ((p[2] - p[0]) >= md && (p[3] - p[1]) >= md && area(p) >= ma ? big : small).push(p);
    return [big, small, unused];
  }

  /** Independent re-check of a finished layout. Returns a list of problems (empty = fine). */
  function validate(grid, W, minAcc, courts, paths, sec, bigSet, gapM, Z) {
    const issues = [];
    const gapMetres = gapM == null ? COURT_GAP_M : gapM;
    const gap = toCells(gapMetres);
    const cr = courts.map(c => c[1]);
    courts.forEach(([n, r]) => {
      const ok = Z ? grid.itemFree(r) && (noSetback(n) || grid.outdoorOk(r)) : grid.isFree(r);
      if (!ok) issues.push(n + (Z && grid.itemFree(r) ? " is inside the setback (only the locker and bathroom modules may stand there)" : " is outside the usable zone or on a lift/ramp"));
    });
    if (Z) {                                                            // nothing but indoor items inside the indoor zone's rectangle
      const box = indoorBoxOf(courts);
      if (box) courts.forEach(([n, r]) => { if (zoneOf(n) !== "indoor" && overlap(inflate(box, Z.xgap), r)) issues.push(n + " is closer than " + (Z.xgap * RES).toFixed(1) + " m to the indoor zone's wall line"); });
    }
    // zoning: an item is reached from a primary path, or across an in-zone path from an item that is
    const reached = courts.map((c, i) => paths.some(p => contactLen(cr[i], p) >= minAcc));
    if (Z) for (let moved = true; moved;) {
      moved = false;
      for (let i = 0; i < courts.length; i++) if (!reached[i] && courts.some((d, j) => reached[j] && zoneOf(d[0]) === zoneOf(courts[i][0]) && !(noSetback(d[0]) && noSetback(courts[i][0])) && facingLen(cr[i], cr[j], requiredGapCells(courts[i][0], d[0], Z)) >= minAcc)) { reached[i] = true; moved = true; }
    }
    for (let i = 0; i < courts.length; i++) {
      for (let j = i + 1; j < courts.length; j++) {
        if (Z) {
          const g = requiredGapCells(courts[i][0], courts[j][0], Z);
          if (overlap(inflate(cr[i], g), cr[j])) issues.push(courts[i][0] + " is closer than " + (g * RES).toFixed(1) + " m to " + courts[j][0]);
        } else if (bigSet.has(courts[i][0]) && bigSet.has(courts[j][0])) {
          if (overlap(cr[i], cr[j])) issues.push(courts[i][0] + " overlaps " + courts[j][0]);
        } else if (overlap(inflate(cr[i], gap), cr[j])) issues.push(courts[i][0] + " is closer than " + gapMetres.toFixed(1) + " m to " + courts[j][0]);
      }
      if (paths.some(p => overlap(cr[i], p))) issues.push(courts[i][0] + " overlaps a pathway");
      if (!reached[i]) issues.push(courts[i][0] + " has no pathway access");
      if (Z && grid.entryCells.some(e => overlap(inflate(e, Z.egap), cr[i]))) issues.push(courts[i][0] + " is closer than " + (Z.egap * RES).toFixed(1) + " m to a lift / stair / ramp");
    }
    if (paths.length && components(paths, W).length > 1) issues.push("pathway network is not fully connected");
    if (sec.some(s => cr.some(r => overlap(s, r)))) issues.push("a secondary path overlaps a court");
    return issues;
  }

  const bboxText = grid => "usable zone " + (grid.nx * RES).toFixed(1) + " x " + (grid.ny * RES).toFixed(1) + " m";

  /** Turn a bare "no space" into a reason the user can act on. */
  function explainUnplaced(grid, L, unplaced) {
    const cache = new Map(), out = [];
    for (const [n, w, h, why0] of unplaced) {
      let why = why0;
      if (why0 === "no space") {
        const big = L.big.has(n);
        const key = w + "x" + h + "x" + big;
        if (!cache.has(key)) {
          const L0 = new Layout(grid, L.W, L.big);                  // nothing placed at all
          const L1 = new Layout(grid, L.W, L.big);                  // only the lift landings + main corridor
          L1.paths = L.basePaths.slice();
          const fitsEmpty = genSpots(L0, w, h, big).length > 0 || genSpots(L0, h, w, big).length > 0;
          const fitsMain = genSpots(L1, w, h, big).length > 0 || genSpots(L1, h, w, big).length > 0;
          if (!fitsEmpty) cache.set(key, "too big for the usable area (" + bboxText(grid) + ")");
          else if (!fitsMain) cache.set(key, "does not fit beside the main pathway even at " + (L.W * RES).toFixed(1) + " m wide - try a smaller setback");
          else cache.set(key, "no room left after the other courts");
        }
        why = cache.get(key);
      } else if (why0 === "no access route") why = "no pathway can be laid to a free spot for it";
      else if (why0 === "time limit") why = "the search ran out of time (raise the search time)";
      out.push({ name: n, reason: why });
    }
    return out;
  }

  /** Pathway widths to try, widest first: e.g. 2.0 -> 1.5 -> 1.0. */
  function widthOptions(pathWm, minWm) {
    const hi = Math.max(pathWm, minWm);
    const lo = Math.min(minWm, hi);
    const opts = [hi];
    for (const w of [1.5, 1.0]) if (lo - 1e-9 <= w && w < opts[opts.length - 1] - 1e-9) opts.push(w);
    if (lo < opts[opts.length - 1] - 1e-9) opts.push(lo);
    return opts;
  }

  const tick = () => new Promise(res => setTimeout(res, 0));

  /**
   * One full search at ONE pathway width. `opts`: { yieldFn, cancelled, onProgress }.
   * Everything in and out is in METRES; `requests` = [{ name, w, h }].
   */
  async function planOnce(site, requests, pathWm, ring, timeLimit, seed, shuffle, variant, seen, edgeFirst, leftoverPath, bigSet, opts, gapM, rules, zx) {
    const o = opts || {};
    const t0 = now();
    const grid = zx && site.full ? site.full : site.grid;          // zoning: the whole footprint, with the garden band as a mask (indoor items may stand in it)
    const Z = zx ? { zgap: toCells(zx.zgap), xgap: toCells(zx.xgap), egap: toCells(zx.egap), lobbyGap: toCells(SERVICE_LOBBY_M) } : null;
    const prepared = prepareRules(grid, zx ? Object.assign({ cornerFallback: true }, rules || { serviceCorners: true, gridLines: [] }) : rules);
    const W = toCells(pathWm);
    const emin = toCells(EDGE_MIN_M);
    const items = requests.map(r => [r.name, toCells(r.w), toCells(r.h)]);
    const hard = t0 + Math.max(timeLimit * 2.5, 15.0);
    seen = seen || new Set();
    const base = seed * 7919 + variant * 104729;
    const limit = shuffle ? SHUFFLE_ATTEMPTS : MAX_ATTEMPTS;
    const boost = {};                        // courts that failed before get placed EARLIER next time
    const results = [];
    let attempts = 0;
    for (;;) {
      if (o.cancelled && o.cancelled()) throw new Cancelled();
      const rng = makeRng(base + attempts);
      const [loJ, hiJ] = shuffle ? [0.3, 1.7] : [0.55, 1.45];
      const first = (attempts === 0 || (attempts === 1 && prepared && prepared.hasGrid)) && !shuffle;     // the two plain attempts (every heavy item on the grid, none) are both the deterministic, noise-free one
      // The structural grid is a PREFERENCE for heavy items: the first attempt holds every one of them to it, the second holds none, later ones a random subset. The best layout wins
      // by court area first, so a heavy item is taken off the grid only when holding it there would leave a court out - and then only the ones that need it.
      let layoutRules = prepared;
      if (prepared && prepared.hasGrid && attempts > 0) {
        const hold = new Set();
        if (attempts % 4 !== 1) for (const n of prepared.heavy) if (rng.random() >= 0.35) hold.add(n);
        layoutRules = Object.assign({}, prepared, { heavy: hold });
      }
      // the service modules first (they need a corner), then the heavy items held to the grid (they need it), then big courts (hardest to fit), then by area; past failures jump the queue
      const rank = n => (layoutRules && layoutRules.serviceNames.has(n) ? -2 : layoutRules && layoutRules.heavy.has(n) ? -1 : bigSet.has(n) ? 0 : 1);
      let keyed;
      if (Z) {
        // zoning: the corner services first, then the rest of the indoor zone, then outdoor and garden together (garden is not lower priority than outdoor - placed dead
        // last every single attempt, it only ever got the outdoor cluster's leftover scraps, even on a roof with plenty of room to spare); inside a zone the heavy items
        // (held to the grid) and the big ones first, and identical items one after the other (one jitter per name), so they can sit together
        const zr = n => (layoutRules && layoutRules.serviceNames.has(n) ? 0 : n === "Bouldering Wall" ? 1.5 : zoneOf(n) === "indoor" ? 1 : 2);
        const jitOf = {};
        keyed = items.map(it => {
          const n = it[0];
          if (!(n in jitOf)) jitOf[n] = first ? 1.0 : rng.uniform(loJ, hiJ);
          return [[zr(n), layoutRules && layoutRules.heavy.has(n) ? 0 : 1, -it[1] * it[2] * jitOf[n] * (1.0 + 0.5 * (boost[n] || 0)), n], it];
        });
      } else keyed = items.map(it => {
        const jit = first ? 1.0 : rng.uniform(loJ, hiJ);
        return [[rank(it[0]), -it[1] * it[2] * jit * (1.0 + 0.5 * (boost[it[0]] || 0))], it];
      });
      keyed.sort((a, b) => cmp(a[0], b[0]));
      const order = keyed.map(k => k[1]);
      const [noise, pickK] = shuffle ? [6.0, 5] : first ? [0.0, 1] : [1.5, 1];
      const [L, placed, unplaced, warns] = runAttempt(grid, W, order, ring, rng, noise, hard, pickK, edgeFirst, bigSet, gapM, layoutRules, Z);
      for (const u of unplaced) boost[u[0]] = (boost[u[0]] || 0) + 1;
      const onEdge = L.courts.filter(([, r]) => grid.edgeContact(r) >= emin).length;
      // best = most court area, then the layout that keeps the placement rules best (0 for all when no rule is on), then most courts on the setback line, then least path
      const score = [placed.reduce((s, p) => s + p[1] * p[2], 0), ruleCompliance(L, prepared).score, onEdge, -rectUnionArea(L.paths), placed.length];
      results.push({ score, sig: JSON.stringify(L.courts.map(c => [c[0]].concat(c[1])).sort(cmp)), L, placed, unplaced, warns, attempt: attempts + 1 });
      attempts++;
      if (o.onProgress) o.onProgress({ attempts, limit, elapsed: now() - t0 });
      if (attempts >= limit || now() - t0 >= timeLimit || !items.length) break;
      if (!shuffle && attempts >= (prepared && prepared.hasGrid ? 14 : 6)) {          // with the grid rule on, a few more tries at keeping more heavy items on it
        let bestR = results[0];
        for (const r of results) if (cmp(r.score, bestR.score) > 0) bestR = r;
        if (!bestR.unplaced.length) break;           // everything placed: enough polishing
      }
      if (o.yieldFn) await o.yieldFn(); else await tick();
    }

    let chosen;
    if (shuffle) {
      // near-best court area, near-best edge count, then the LEAST unused space
      const topArea = Math.max(...results.map(r => r.score[0]));
      let pool = results.filter(r => r.score[0] >= topArea);          // never trade away a selected court
      const topRule = Math.max(...pool.map(r => r.score[1]));         // never trade away a placement rule either (all equal when no rule is on)
      pool = pool.filter(r => r.score[1] >= topRule);
      const topEdge = Math.max(...pool.map(r => r.score[2]));
      pool = pool.filter(r => r.score[2] >= topEdge - 1);
      pool.sort((a, b) => -a.score[3] - -b.score[3]);
      const scored = pool.slice(0, 15).map(r => [unusedCells(grid, r.L.courts, r.L.paths, r.L.gap, bigSet, Z), r]);
      const minU = Math.min(...scored.map(s => s[0]));
      const keep = scored.filter(([uc]) => uc <= minU * 1.08 + 300).map(s => s[1]);
      let fresh = keep.filter(r => !seen.has(r.sig));
      if (!fresh.length) fresh = scored.map(s => s[1]).filter(r => !seen.has(r.sig));
      chosen = makeRng(base).choice(fresh.length ? fresh : keep);
    } else {
      chosen = results[0];
      for (const r of results) if (cmp(r.score, chosen.score) > 0) chosen = r;
    }

    const { L, placed, unplaced, warns, sig } = chosen;
    const unplacedOut = explainUnplaced(grid, L, unplaced);
    const sec = Z ? zoningSecondary(grid, L.courts, Z) : allSecondary(grid, L.courts, L.gap, bigSet);
    const allPaths = L.paths.concat(sec);
    const totalCells = rectUnionArea(allPaths);
    const primCells = rectUnionArea(L.paths);
    const [bigP, smallP, unusedC] = leftoverSplit(grid, L.courts.map(c => c[1]).concat(allPaths));
    let pockets = leftoverPath ? [] : bigP;                       // Option 1: ALL leftover space becomes pathway; Option 2: real pockets = garden
    const filler = leftoverPath ? bigP.concat(smallP) : smallP.slice();
    // zoning: no garden inside the indoor zone (walls round it): what a pocket has inside its rectangle stays plain floor, drawn like the other leftover space
    const zoneBox = Z ? indoorBoxOf(L.courts) : null;
    if (zoneBox) {
      pockets = pockets.flatMap(p => {
        const ix = [Math.max(p[0], zoneBox[0]), Math.max(p[1], zoneBox[1]), Math.min(p[2], zoneBox[2]), Math.min(p[3], zoneBox[3])];
        if (ix[2] <= ix[0] || ix[3] <= ix[1]) return [p];
        filler.push(ix);
        return subtractRect(p, zoneBox);
      });
    }
    const drawPaths = allPaths.concat(filler);                    // nothing is left empty
    const gardenCells = pockets.reduce((s, q) => s + area(q), 0);
    const fillerCells = filler.reduce((s, q) => s + area(q), 0);
    const issues = validate(grid, W, L.minAcc, L.courts, L.paths, sec, bigSet, L.gapM, Z);
    const kept = ruleCompliance(L, prepared);
    const rulesReport = prepared ? {
      services: kept.services.map(s => ({ name: s.name, state: s.state, rank: s.rank })),
      heavy: kept.heavy.map(h => ({ name: h.name, along: h.along })),
      heavyPlaced: L.courts.map(c => c[0]).filter(n => SPORTS.some(s => s.name === n && s.deadLoad != null && s.deadLoad > HEAVY_DEAD_LOAD_KN_M2)),
      hasGrid: prepared.hasGrid, gridLines: prepared.gridXs.length + prepared.gridYs.length,
      cornersKnown: prepared.corners.length > 0, cornerFallback: prepared.cornerFallback
    } : null;
    const presets = new Map(SPORTS.map(s => [s.name, s]));
    const courtsOut = L.courts.map(([name, r]) => {
      const p = presets.get(name);
      // compared in grid cells: a size that is not a multiple of the 0.1 m step (the 63.77 x 1.22 m sprint lane) is rounded to the grid, so an exact metre comparison would never match
      return { name, rect: grid.toM(r), long: p.long, short: p.short, rotated: toCells(p.long) !== toCells(p.short) && (r[2] - r[0]) === toCells(p.short), onEdge: grid.edgeContact(r) >= emin, big: bigSet.has(name), zone: Z ? zoneOf(name) : null };
    });
    // zoning: the indoor zone's rectangle (drawn dotted), and the garden band less the stretch of it inside that rectangle (no garden where the walls are)
    let bandOut = null, indoorZone = null;
    if (Z) {
      const cellBox = indoorBox(L);
      indoorZone = cellBox ? grid.toM(cellBox) : null;
      bandOut = indoorZone ? site.bandRects.flatMap(s => subtractRect(s, indoorZone)) : site.bandRects;
    }
    const misaligned = Z ? notAligned(L) : null;
    const wall = Z ? buildIndoorWall(indoorZone, L.paths.map(r => grid.toM(r)), site.bbox) : null;
    return {
      bandRects: bandOut, indoorZone, notAligned: misaligned, wall,
      zoning: Z ? { zoneGapM: Z.zgap * RES, crossGapM: Z.xgap * RES, entryGapM: Z.egap * RES } : null,
      courts: courtsOut,
      pockets: pockets.map(p => grid.toM(p)),
      pathRects: drawPaths.map(r => grid.toM(r)),
      primaryRects: L.paths.map(r => grid.toM(r)),
      unplaced: unplacedOut,
      warnings: warns, issues, rulesReport,
      signature: sig, isNew: !seen.has(sig),
      stats: {
        courtArea: L.courts.reduce((s, [, r]) => s + area(r), 0) * RES * RES,
        pathArea: primCells * RES * RES,
        secArea: (totalCells - primCells) * RES * RES,
        pocketArea: (leftoverPath ? unusedC : gardenCells) * RES * RES,
        fillerArea: (leftoverPath ? 0 : fillerCells) * RES * RES,
        onEdge: L.courts.filter(([, r]) => grid.edgeContact(r) >= emin).length,
        bigN: L.courts.filter(([n]) => bigSet.has(n)).length,
        placed: placed.length, requested: items.length,
        pathW: W * RES, leftoverPath: !!leftoverPath,
        attempts, elapsed: now() - t0
      }
    };
  }

  /**
   * Places EXACTLY the requested courts (nothing extra). If a court does not fit, the pathway is narrowed step by step (e.g. 2.0 -> 1.5 -> 1.0 m) and the search
   * repeated; the widest pathway that fits the most courts is kept.
   *   settings: { pathW, minPathW, ring, timeLimit, seed, shuffle, variant, seen, edgeFirst, leftoverPath, strictGap, courtGap, rules }
   *   courtGap = the clear path (m) around every court and lift / ramp side; the default is the Rhino tool's COURT_GAP_M
   *   rules    = { serviceCorners: bool, gridLines: [{ x1, y1, x2, y2 }] } (see prepareRules); none by default, which is the Rhino tool's plain behaviour
   */
  async function planLayout(site, requests, settings, opts) {
    const s = Object.assign({ pathW: DEFAULT_PATH_W, minPathW: MIN_PATH_W_M, ring: false, timeLimit: DEFAULT_TIME, seed: 1, shuffle: false, variant: 0, seen: null, edgeFirst: true, leftoverPath: false, strictGap: false, courtGap: COURT_GAP_M, rules: null, zoning: false }, settings || {});
    // zoning: no item is "big" (every one keeps its gap on all sides), and the widths tried are the in-zone / primary pairs, widest first
    const bigSet = s.strictGap || s.zoning ? new Set() : new Set(BIG_COURTS);
    let best = null;
    const tries = [];
    if (s.zoning) {
      const primaries = PRIMARY_OPTIONS_M.filter(w => w <= s.pathW + 1e-9 && w >= s.minPathW - 1e-9);
      for (const w of primaries.length ? primaries : [Math.max(s.minPathW, Math.min(s.pathW, PRIMARY_OPTIONS_M[0]))]) for (const zg of ZONE_GAP_OPTIONS_M) if (zg <= w + 1e-9) tries.push([w, { zgap: zg, xgap: w, egap: ENTRY_GAP_M }]);
    } else for (const w of widthOptions(s.pathW, s.minPathW)) tries.push([w, null]);
    for (let k = 0; k < tries.length; k++) {
      const [w, zx] = tries[k];
      const tl = k === 0 ? s.timeLimit : Math.max(1.0, s.timeLimit * 0.6);
      const plan = await planOnce(site, requests, w, s.ring, tl, s.seed, s.shuffle, s.variant, s.seen, s.edgeFirst, s.leftoverPath, bigSet, opts, s.courtGap, s.rules, zx);
      const key = [-plan.unplaced.length, plan.stats.courtArea, w, zx ? zx.zgap : 0];
      if (best === null || cmp(key, best[0]) > 0) best = [key, plan];
      if (!plan.unplaced.length) break;
    }
    const plan = best[1];
    plan.pathWReq = s.pathW;
    plan.courtGap = s.courtGap;
    plan.narrowed = plan.stats.pathW < s.pathW - 1e-9;
    plan.bigSet = Array.from(bigSet);
    return plan;
  }

  /** Can each preset court physically fit on this roof? Independent of quantities. Returns { sports: { name: reason or "" }, notes: [...] }. */
  function fitCheck(site, pathWm, ring, strictGap, gapM) {
    const grid = site.grid;
    const bigSet = strictGap ? new Set() : new Set(BIG_COURTS);
    const W = toCells(pathWm);
    const L0 = new Layout(grid, W, bigSet, gapM);                 // empty roof
    const L1 = new Layout(grid, W, bigSet, gapM);                 // lift landings + main corridor only
    const notes = [];
    const rng = makeRng(1);
    buildSeeds(L1, ring, rng, 0.0, notes);
    connectEntries(L1, rng, 0.0, notes);
    const sports = {};
    for (const s of SPORTS) {
      const cw = toCells(s.long), ch = toCells(s.short);
      const big = bigSet.has(s.name);
      if (!(genSpots(L0, cw, ch, big).length || genSpots(L0, ch, cw, big).length)) sports[s.name] = "too big for the usable area (" + bboxText(grid) + ")";
      else if (!(genSpots(L1, cw, ch, big).length || genSpots(L1, ch, cw, big).length)) sports[s.name] = "does not fit beside the main pathway even at the narrowest setting (" + bboxText(grid) + ") - try a smaller setback";
      else sports[s.name] = "";
    }
    return { sports, notes };
  }

  /** The placement rules in words: where the service modules went, and whether the heavy items sit along the structural grid. Empty when no rule was on. */
  function ruleLines(plan) {
    const r = plan.rulesReport, out = [];
    if (!r) return out;
    const isService = n => SPORTS.some(s => s.name === n && s.service);
    const servicesPlaced = plan.courts.filter(c => isService(c.name));
    if (servicesPlaced.length) {
      if (r.cornerFallback) out.push("Services: no lift or stair on the roof, so the indoor zone grows from " + (r.cornerFallback === "ramp" ? "the roof corner nearest a ramp" : "the top-left roof corner") + ".");
      else if (!r.cornersKnown) out.push("Services: no lift or stair on the site, so there is no corner to send " + servicesPlaced.map(c => labelOf(c.name)).join(" and ") + " to.");
      else out.push("Services: " + r.services.map(s => labelOf(s.name) + (s.state === "corner" ? (s.rank === 0 ? " in the corner nearest a lift/stair" : " in a roof corner near a lift/stair (#" + (s.rank + 1) + ", the nearer ones had no room)") : s.state === "beside" ? " beside the first one, in the same corner" : " NOT in a corner (no room)")).join("; "));
    }
    if (r.heavyPlaced.length) {
      if (!r.hasGrid) out.push("Heavy items (dead load above " + HEAVY_DEAD_LOAD_KN_M2.toFixed(1) + " kN/m²): " + r.heavyPlaced.map(labelOf).join(", ") + ". No structural grid from Revit, so they are placed without a grid preference.");
      else out.push("Heavy items along the structural grid (" + r.gridLines + " lines from Revit): " + r.heavy.map(h => labelOf(h.name) + (h.along ? " yes" : isService(h.name) ? " NO (its corner spot is off the grid)" : " NO (no room for it along the grid without leaving a court out)")).join("; "));
    }
    return out;
  }

  /** Zoning: whether the locker and bathroom modules ended up sharing a wall (no path between them), in words. */
  function sharedWallLines(plan) {
    const s = plan.courts.filter(c => noSetback(c.name));
    if (s.length < 2) return [];
    const a = s[0].rect, b = s[1].rect, gap = Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0));
    return [gap < 0.05 ? "Services: the locker and bathroom modules share a wall (no path between them)." : "Services: the locker and bathroom modules could not be placed wall to wall, so they have a path between them."];
  }

  /** The text of the report under the preview (the Rhino tool's build_report). */
  function buildReport(plan, site) {
    const s = plan.stats, u = site.usableArea;
    const gapTxt = (plan.courtGap == null ? COURT_GAP_M : plan.courtGap).toFixed(1);
    const band = Math.max(0, site.footArea - u);
    const built = 100 * s.courtArea / u;
    const bw = (site.grid.nx * RES).toFixed(1), bh = (site.grid.ny * RES).toFixed(1);
    const narrowed = plan.narrowed ? "  - narrowed from " + plan.pathWReq.toFixed(1) + " m to fit the courts" : "";
    const garden = s.leftoverPath
      ? "Option 1 - garden only in the setback band (" + band.toFixed(0) + " m²). Leftover space turned into pathways: " + s.pocketArea.toFixed(0) + " m² (" + (100 * s.pocketArea / u).toFixed(0) + "% of sports area)"
      : "Option 2 - garden = setback band " + band.toFixed(0) + " m² + leftover pockets " + s.pocketArea.toFixed(0) + " m² (" + (100 * s.pocketArea / u).toFixed(0) + "% of sports area). Small remaining gaps turned into pathway: " + s.fillerArea.toFixed(0) + " m²";
    const lines = [
      "Courts placed: " + s.placed + " of " + s.requested + " requested   (" + s.courtArea.toFixed(0) + " m² = " + built.toFixed(0) + "% of sports area, limit " + BUILT_LIMIT_PCT.toFixed(0) + "%)",
      "Courts touching the setback line: " + s.onEdge + " of " + s.placed + (plan.bigSet && !plan.bigSet.length ? "" : "   |   Big courts (one path side only): " + s.bigN),
      "Main pathway " + s.pathW.toFixed(1) + " m wide" + narrowed,
      "Primary paths: " + s.pathArea.toFixed(0) + " m² (" + (100 * s.pathArea / u).toFixed(0) + "%)   Secondary " + (plan.zoning ? plan.zoning.zoneGapM.toFixed(1) : gapTxt) + " m paths: " + s.secArea.toFixed(0) + " m² (" + (100 * s.secArea / u).toFixed(0) + "%)",
      garden,
      ...ruleLines(plan),
      ...(plan.zoning ? sharedWallLines(plan) : []),
      ...(plan.zoning ? [plan.notAligned && plan.notAligned.length ? "Alignment: no shared edge with a neighbour for " + plan.notAligned.map(labelOf).join(", ") + " (no aligned spot was free)." : "Alignment: every item that has a neighbour shares an edge line with one."] : []),
      ...(plan.wall ? ["Indoor zone: a " + (plan.wall.thicknessM * 1000).toFixed(0) + " mm wall, door (" + plan.wall.door.side + " side, " + ((plan.wall.door.side === "N" || plan.wall.door.side === "S" ? plan.wall.door.x1 - plan.wall.door.x0 : plan.wall.door.y1 - plan.wall.door.y0)).toFixed(1) + " m wide) nearest the primary pathway."] : []),
      "Sports area: " + u.toFixed(0) + " m² (bounding box " + bw + " x " + bh + " m)   |   " + s.attempts + " attempts in " + s.elapsed.toFixed(1) + " s"
    ];
    if (plan.unplaced.length) lines.push("NOT placed: " + plan.unplaced.map(x => labelOf(x.name) + " (" + x.reason + ")").join("; "));
    plan.warnings.forEach(w => lines.push("Warning: " + w));
    const zn = plan.zoning;
    lines.push(plan.issues.length ? "CHECK FAILED: " + plan.issues.join("; ")
      : zn ? "Checks passed: " + zn.zoneGapM.toFixed(1) + " m paths inside a zone, " + zn.crossGapM.toFixed(1) + " m between zones, " + zn.entryGapM.toFixed(1) + " m around lifts, stairs and ramps; every sport keeps the setback (only the locker and bathroom modules stand in it); pathways connected."
      : plan.bigSet && !plan.bigSet.length
        ? "Checks passed: " + gapTxt + " m path around every court and lift/ramp side, no two courts touch, pathways connected."
        : "Checks passed: " + gapTxt + " m path around normal courts and lift/ramp sides, big courts touch a path on one side, pathways connected.");
    return lines.join("\n");
  }

  return {
    RES, SPORTS, GROUPS, labelOf, BIG_COURTS, HEAVY_DEAD_LOAD_KN_M2, COLOR_VC, COLOR_PATH, COLOR_GARDEN,
    DEFAULT_SETBACK, DEFAULT_PATH_W, MIN_PATH_W_M, DEFAULT_TIME, BUILT_LIMIT_PCT, COURT_GAP_M, MIN_ACCESS_M,
    makeSite, planLayout, fitCheck, buildReport, Cancelled,
    zoneOf, ZONE_GAP_OPTIONS_M, PRIMARY_OPTIONS_M, ENTRY_GAP_M, WALL_THICKNESS_M, DOOR_WIDTH_M,
    // for the tests
    _internals: { Grid, Layout, makeRng, components, overlap, inflate, contactLen, toCells, validate, allSecondary, rectUnionArea, axisRect, polyArea }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AlgoPlacement;
