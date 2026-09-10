/**
 * rules.js — Sportify rule-assisted design engine
 * Owns the tunable design rules plus the pure geometry/grid logic used to:
 *   1) auto-arrange sport vs garden pieces into separate zones with a
 *      clearance gap and a boundary setback (ruleBasedArrange), and
 *   2) figure out whether every placed piece has a walkable connection
 *      back to a user-defined entry point (computeCirculation), via a
 *      simple grid + multi-source BFS.
 *
 * No DOM code lives here — combineField.js renders whatever this file
 * computes, same split as data.js (data) vs field.js (renderer).
 */

/** Planner-tunable thresholds. Mutated in place from the Design rules panel. */
const DESIGN_RULES = {
  clearance_m: 1.0,        // min gap kept between any two placed pieces
  boundarySetback_m: 1.5,  // min gap kept between a piece and the site edge
  circulationWidth_m: 1.2, // min walkway width circulation paths must keep clear
  minEntryPoints: 1,       // how many entrances a valid layout needs
  quietBufferM: 3.0,       // min gap kept between a noise-sensitive zone and a loud one
};

/* ── Garden↔sport interaction: noise-sensitive zones need distance from loud ones ──
 * The clearance rule only guarantees pieces don't overlap — it says nothing about
 * whether a yoga deck ends up backed onto a basketball court. This is a separate,
 * larger buffer (quietBufferM), checked independently of clearance.
 */

/** All garden pieces are inherently quiet; activities are only quiet if tagged "wellness" in Activitiesdata.js. Sport fields are never quiet — courts are loud by nature. */
function isQuietZone(item) {
  if (item.kind === "garden") return true;
  if (item.kind === "activity") return item.sourceJson?.activity?.category === "wellness";
  return false;
}

/** Every sport field is loud; activities are loud unless they're the wellness kind above. Gardens are never loud. */
function isLoudZone(item) {
  if (item.kind === "field") return true;
  if (item.kind === "activity") return item.sourceJson?.activity?.category !== "wellness";
  return false;
}

/**
 * True edge-to-edge gap between two axis-aligned footprints (0 if they
 * touch or overlap) — NOT center-to-center, which badly underrates
 * proximity for a size-asymmetric pair: a 28x15m court's own center sits
 * ~14m from its edge, so a small deck placed right against that edge
 * would read as "far away" under a center-distance metric even though
 * it's touching. Same per-axis gap formula rectsOverlap's zero-gap case
 * implies, generalized to the positive-gap case.
 */
function zoneGapM(a, b) {
  const fpA = getFootprint(a), fpB = getFootprint(b);
  const dx = Math.max(0, Math.max(b.x_m - (a.x_m + fpA.w), a.x_m - (b.x_m + fpB.w)));
  const dy = Math.max(0, Math.max(b.y_m - (a.y_m + fpA.h), a.y_m - (b.y_m + fpB.h)));
  return Math.hypot(dx, dy);
}

/**
 * Returns { conflictIds: Set<itemId>, pairs: [{quietId, quietLabel, loudId, loudLabel, distanceM}] }
 * for every quiet/loud pair closer than rules.quietBufferM. O(n²) over placed
 * items, same cost class as findOverlappingIds — fine at Combine's scale.
 */
function findZoneConflicts(items, rules) {
  const conflictIds = new Set();
  const pairs = [];
  const quiet = items.filter(isQuietZone);
  const loud = items.filter(isLoudZone);

  quiet.forEach(q => {
    loud.forEach(l => {
      if (q.id === l.id) return;
      const d = zoneGapM(q, l);
      if (d < rules.quietBufferM) {
        conflictIds.add(q.id);
        conflictIds.add(l.id);
        pairs.push({ quietId: q.id, quietLabel: q.label, loudId: l.id, loudLabel: l.label, distanceM: d });
      }
    });
  });

  return { conflictIds, pairs };
}

/**
 * Wind-sensitivity for garden pieces feeding suggestPositionsForItem's
 * ranking below — taller/deeper-rooted vegetation catches more wind and
 * benefits from sitting further from the roof edge (the same edge zone
 * Wind Exposure's analyzeWindExposure() already flags). Garden items not
 * in this list default to insensitive, since a low groundcover parcel has
 * no real wind-exposure preference either way.
 */
const WIND_SENSITIVE_GARDEN_ITEMS = new Set(["roof_trees"]);

function isWindSensitive(item) {
  return item.kind === "garden" && WIND_SENSITIVE_GARDEN_ITEMS.has(item.sourceJson?.garden?.type_id);
}

/**
 * Same metric analyzeWindExposure() (analysisController.js) uses —
 * distance from a footprint's nearest edge to the roof boundary.
 * Deliberately NOT named edgeDistanceM: analysisController.js already
 * declares a global function with that exact name and a different
 * signature (item, roof) — this file and that one both load as plain
 * <script> tags into one shared global scope with no modules, so a
 * same-named function here would silently shadow (or be shadowed by,
 * depending on script order) the other, breaking whichever signature
 * lost.
 */
function footprintEdgeDistanceM(footprintX, footprintY, fpW, fpH, roof) {
  return Math.min(footprintX, roof.length - (footprintX + fpW), footprintY, roof.width - (footprintY + fpH));
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── Boundary snapping (entry points always sit on the site edge) ── */
const ENTRY_NORMALS = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] };

/**
 * Projects an arbitrary click point (in roof-rectangle meters) onto the
 * nearest edge of the roof's bounding rectangle. Mirrors the convention
 * already used for item placement: even when a real Revit polygon is
 * drawn for reference, packing/placement works against the plain
 * (0,0)-(length,width) rectangle, so entry points snap to that same
 * rectangle rather than the visual polygon.
 */
function nearestBoundaryPoint(roof, xm, ym) {
  const L = roof.length, W = roof.width;
  const candidates = [
    { edge: "top", x: clamp(xm, 0, L), y: 0 },
    { edge: "bottom", x: clamp(xm, 0, L), y: W },
    { edge: "left", x: 0, y: clamp(ym, 0, W) },
    { edge: "right", x: L, y: clamp(ym, 0, W) },
  ];
  candidates.forEach(c => { c.d = Math.hypot(c.x - xm, c.y - ym); });
  candidates.sort((a, b) => a.d - b.d);
  return candidates[0];
}

/* ── Rule-based auto-arrange: sport cluster + garden cluster + seam ── */

/**
 * Packs sport pieces (field/activity) and garden pieces into two zones
 * split across the longer axis of the site, proportioned by footprint
 * area. A seam at least as wide as the circulation rule separates the
 * zones (it doubles as the main walkway); a boundary setback keeps a
 * perimeter margin free on all sides; a clearance gap separates pieces
 * within the same zone. Returns new positions to apply — doesn't mutate
 * combineState so the caller can animate the transition first.
 */
function ruleBasedArrange(combineState, rules) {
  const roof = combineState.roof;
  const setback = clamp(rules.boundarySetback_m, 0, Math.min(roof.length, roof.width) / 2 - 0.1);
  const usable = { x0: setback, y0: setback, x1: roof.length - setback, y1: roof.width - setback };
  const gap = rules.clearance_m;
  const seam = Math.max(rules.clearance_m, rules.circulationWidth_m);

  const groups = { sport: [], garden: [] };
  combineState.items.forEach(it => (it.kind === "garden" ? groups.garden : groups.sport).push(it));

  const areaOf = it => { const fp = getFootprint(it); return fp.w * fp.h; };
  const sportArea = groups.sport.reduce((s, i) => s + areaOf(i), 0);
  const gardenArea = groups.garden.reduce((s, i) => s + areaOf(i), 0);
  const totalArea = sportArea + gardenArea;

  const usableW = usable.x1 - usable.x0;
  const usableH = usable.y1 - usable.y0;
  const splitVertical = usableW >= usableH;
  const span = splitVertical ? usableW : usableH;

  // A plain area-ratio split can hand a zone less width than its single
  // largest piece needs (a court's area might be modest but its shape long
  // and narrow), which would fail that piece even though the site clearly
  // has room overall. Measuring each group's widest piece along the split
  // axis and flooring its zone to that first, then letting the area ratio
  // fill in the rest, keeps the ratio's intent without ever starving a
  // piece of the width it structurally needs.
  const alongSplitAxis = it => (splitVertical ? getFootprint(it).w : getFootprint(it).h);
  const minSportSpan = groups.sport.length ? Math.max(...groups.sport.map(alongSplitAxis)) : 0;
  const minGardenSpan = groups.garden.length ? Math.max(...groups.garden.map(alongSplitAxis)) : 0;

  let zoneSport = null, zoneGarden = null;
  if (groups.sport.length && !groups.garden.length) {
    zoneSport = { ...usable };
  } else if (!groups.sport.length && groups.garden.length) {
    zoneGarden = { ...usable };
  } else if (groups.sport.length && groups.garden.length) {
    const areaFrac = clamp(sportArea / Math.max(totalArea, 0.0001), 0.15, 0.85);
    const sportSpan = clamp(span * areaFrac, minSportSpan + gap, Math.max(minSportSpan + gap, span - seam - minGardenSpan - gap));
    const splitAt = (splitVertical ? usable.x0 : usable.y0) + sportSpan;
    if (splitVertical) {
      zoneSport  = { x0: usable.x0, y0: usable.y0, x1: splitAt - seam / 2, y1: usable.y1 };
      zoneGarden = { x0: splitAt + seam / 2, y0: usable.y0, x1: usable.x1, y1: usable.y1 };
    } else {
      zoneSport  = { x0: usable.x0, y0: usable.y0, x1: usable.x1, y1: splitAt - seam / 2 };
      zoneGarden = { x0: usable.x0, y0: splitAt + seam / 2, x1: usable.x1, y1: usable.y1 };
    }
  }

  const placements = new Map();
  const unplaced = [];

  function packZone(list, zone) {
    if (!zone || !list.length) { list.forEach(it => unplaced.push(it)); return; }
    const sorted = [...list].sort((a, b) => areaOf(b) - areaOf(a));
    let cx = zone.x0, cy = zone.y0, rowH = 0;
    sorted.forEach(it => {
      const fp = getFootprint(it);
      if (cx > zone.x0 && cx + fp.w > zone.x1 + 1e-6) {
        cx = zone.x0; cy += rowH + gap; rowH = 0;
      }
      if (fp.w > zone.x1 - zone.x0 + 1e-6 || cy + fp.h > zone.y1 + 1e-6) {
        unplaced.push(it);
        return;
      }
      placements.set(it.id, { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 });
      cx += fp.w + gap;
      rowH = Math.max(rowH, fp.h);
    });
  }

  packZone(groups.sport, zoneSport);
  packZone(groups.garden, zoneGarden);

  return { placements, unplaced };
}

/* ── Circulation: occupancy grid + multi-source BFS from entry points ── */

/** Keeps the BFS grid small even for large sites (perf safety net). */
function circulationCellSize(roof) {
  let cell = clamp(Math.min(roof.length, roof.width) / 24, 0.3, 1.0);
  const maxCells = 4000;
  while ((roof.length / cell) * (roof.width / cell) > maxCells) cell *= 1.25;
  return cell;
}

/**
 * owner[cell] === -1 means walkable; otherwise it's the index of the item
 * whose buffered footprint occupies that cell. Callers pass bufferM — the
 * circulation-check caller uses the circulation width (not the clearance
 * rule), which is what makes a too-narrow gap between pieces register as
 * "not a real walkway" even though the pieces themselves aren't overlapping.
 */
function buildOccupancyGrid(roof, items, bufferM) {
  const cell = circulationCellSize(roof);
  const cols = Math.max(3, Math.ceil(roof.length / cell));
  const rows = Math.max(3, Math.ceil(roof.width / cell));
  const owner = new Int16Array(cols * rows).fill(-1);
  const half = bufferM / 2;

  items.forEach((it, idx) => {
    const fp = getFootprint(it);
    const c0 = clamp(Math.floor((it.x_m - half) / cell), 0, cols - 1);
    const c1 = clamp(Math.ceil((it.x_m + fp.w + half) / cell) - 1, 0, cols - 1);
    const r0 = clamp(Math.floor((it.y_m - half) / cell), 0, rows - 1);
    const r1 = clamp(Math.ceil((it.y_m + fp.h + half) / cell) - 1, 0, rows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c;
        if (owner[k] === -1) owner[k] = idx;
      }
    }
  });

  return { cell, cols, rows, owner };
}

/** Walks inward from a boundary entry point until it finds free grid space. */
function entryStartCell(ep, roof, grid) {
  const [nx, ny] = ENTRY_NORMALS[ep.edge];
  const maxStep = Math.max(roof.length, roof.width);
  for (let step = grid.cell * 0.5; step < maxStep; step += grid.cell) {
    const tx = clamp(ep.x_m + nx * step, 0.0001, roof.length - 0.0001);
    const ty = clamp(ep.y_m + ny * step, 0.0001, roof.width - 0.0001);
    const c = clamp(Math.floor(tx / grid.cell), 0, grid.cols - 1);
    const r = clamp(Math.floor(ty / grid.cell), 0, grid.rows - 1);
    const k = r * grid.cols + c;
    if (grid.owner[k] === -1) return k;
  }
  return -1;
}

function bfs(grid, startCells) {
  const dist = new Int32Array(grid.cols * grid.rows).fill(-1);
  const parent = new Int32Array(grid.cols * grid.rows).fill(-1);
  const queue = startCells.slice();
  startCells.forEach(k => { dist[k] = 0; });
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const cr = Math.floor(cur / grid.cols), cc = cur % grid.cols;
    const neighbors = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols) continue;
      const nk = nr * grid.cols + nc;
      if (grid.owner[nk] !== -1 || dist[nk] !== -1) continue;
      dist[nk] = dist[cur] + 1;
      parent[nk] = cur;
      queue.push(nk);
    }
  }
  return { dist, parent };
}

/** Best (closest) walkable cell touching any cell owned by this item. */
function nearestAccessCell(grid, itemIdx, dist) {
  let best = -1, bestDist = Infinity;
  for (let k = 0; k < grid.owner.length; k++) {
    if (grid.owner[k] !== itemIdx) continue;
    const r = Math.floor(k / grid.cols), c = k % grid.cols;
    const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols) continue;
      const nk = nr * grid.cols + nc;
      if (grid.owner[nk] !== -1 || dist[nk] === -1) continue;
      if (dist[nk] < bestDist) { bestDist = dist[nk]; best = nk; }
    }
  }
  return best;
}

function reconstructPath(grid, parent, endCell) {
  const pts = [];
  let cur = endCell;
  while (cur !== -1) {
    const r = Math.floor(cur / grid.cols), c = cur % grid.cols;
    pts.push({ x: (c + 0.5) * grid.cell, y: (r + 0.5) * grid.cell });
    cur = parent[cur];
  }
  return pts.reverse();
}

/** Collapses collinear runs so paths render as clean orthogonal segments. */
function simplifyPath(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1], b = points[i], c = points[i + 1];
    const collinear = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-6;
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Returns { paths: [{itemId, points}], unreachable: Set<itemId> }.
 * paths are drawn as-is (overlapping segments from different items are
 * harmless — they just read as converging desire lines toward a shared
 * doorway, which looks intentional rather than deduped-away).
 */
function computeCirculation(combineState, rules) {
  const roof = combineState.roof;
  const items = combineState.items;
  const entries = combineState.entryPoints;
  const unreachable = new Set();

  if (items.length === 0) return { paths: [], unreachable };
  if (entries.length === 0) { items.forEach(it => unreachable.add(it.id)); return { paths: [], unreachable }; }

  const grid = buildOccupancyGrid(roof, items, rules.circulationWidth_m);
  const starts = [];
  entries.forEach(ep => { const k = entryStartCell(ep, roof, grid); if (k >= 0) starts.push(k); });
  if (starts.length === 0) { items.forEach(it => unreachable.add(it.id)); return { paths: [], unreachable }; }

  const { dist, parent } = bfs(grid, starts);
  const paths = [];
  items.forEach((it, idx) => {
    const best = nearestAccessCell(grid, idx, dist);
    if (best === -1) { unreachable.add(it.id); return; }
    paths.push({ itemId: it.id, points: simplifyPath(reconstructPath(grid, parent, best)) });
  });

  return { paths, unreachable };
}

/* ── Decision support: per-item candidate suggestions ──
 * combineField.js calls this on discrete state-change events (never per-
 * pointermove — see the recompute call sites in main.js / combineField.js).
 * Searches candidate spots for one item and ranks them by circulation
 * access, reusing buildOccupancyGrid + bfs exactly as computeCirculation
 * does rather than inventing a parallel grid.
 */

/** Mirrors the out-of-bounds test drawCombineCanvas computes inline, so the canvas and the rules checklist never disagree. */
function findOutOfBoundsIds(items, roof) {
  const ids = new Set();
  items.forEach(it => {
    const fp = getFootprint(it);
    if (it.x_m < 0 || it.y_m < 0 || it.x_m + fp.w > roof.length || it.y_m + fp.h > roof.width) ids.add(it.id);
  });
  return ids;
}

/** Grows the candidate stride until the per-rotation search stays bounded — same "grow until under budget" idiom as circulationCellSize. */
function candidateStride(roof, fpW, fpH) {
  let stride = clamp(Math.min(fpW, fpH) / 2, 0.3, 1.5);
  const maxPerRotation = 1500;
  while ((roof.length / stride) * (roof.width / stride) > maxPerRotation) stride *= 1.25;
  return stride;
}

/** Best (closest) BFS distance among free, entry-reachable cells touching this candidate box — the candidate-search analog of nearestAccessCell. */
function boxAccessDistance(grid, dist, xm, ym, wM, hM) {
  const c0 = clamp(Math.floor(xm / grid.cell), 0, grid.cols - 1);
  const c1 = clamp(Math.ceil((xm + wM) / grid.cell) - 1, 0, grid.cols - 1);
  const r0 = clamp(Math.floor(ym / grid.cell), 0, grid.rows - 1);
  const r1 = clamp(Math.ceil((ym + hM) / grid.cell) - 1, 0, grid.rows - 1);
  let best = Infinity;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
      if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols) return;
      const nk = nr * grid.cols + nc;
      if (grid.owner[nk] === -1 && dist[nk] !== -1 && dist[nk] < best) best = dist[nk];
    });
  }
  return best;
}

/**
 * Searches a coarse grid of candidate (x, y, rotation) spots for one item —
 * clear of every other piece (with the clearance-rule gap), inside the
 * boundary setback — and ranks the valid ones by circulation access (closer
 * to an entrance first); wind-sensitive garden items (isWindSensitive) then
 * prefer the more sheltered spot ahead of the usual closeness-to-center
 * tiebreaker, and everyone else falls straight through to it; last,
 * matching the item's current rotation. Returns the top few with a score
 * and a short plain-language reason. Expensive (a search, not a lookup) —
 * only called from discrete-event triggers, never per-pointermove.
 */
function suggestPositionsForItem(item, combineState, rules, topN = 3) {
  const roof = combineState.roof;
  const others = combineState.items.filter(it => it.id !== item.id);
  const grid = buildOccupancyGrid(roof, others, rules.circulationWidth_m);
  const starts = combineState.entryPoints.map(ep => entryStartCell(ep, roof, grid)).filter(k => k >= 0);
  const dist = starts.length ? bfs(grid, starts).dist : null;
  const windSensitive = isWindSensitive(item);

  const setback = rules.boundarySetback_m, half = rules.clearance_m / 2;
  const cx = roof.length / 2, cy = roof.width / 2;
  const candidates = [];

  [0, 90].forEach(rotation => {
    const fp = getFootprint({ ...item, rotation });
    const stride = candidateStride(roof, fp.w, fp.h);
    for (let y = setback; y + fp.h <= roof.width - setback + 1e-6; y += stride) {
      for (let x = setback; x + fp.w <= roof.length - setback + 1e-6; x += stride) {
        // Grow BOTH boxes by half the clearance gap each — the same
        // symmetric growth findOverlappingIds uses — so a candidate this
        // search calls "clear" can never be one the real overlap check
        // immediately flags red once applied.
        const blocked = others.some(o => {
          const oFp = getFootprint(o);
          const aBox = { x: x - half, y: y - half, w: fp.w + rules.clearance_m, h: fp.h + rules.clearance_m };
          const bBox = { x: o.x_m - half, y: o.y_m - half, w: oFp.w + rules.clearance_m, h: oFp.h + rules.clearance_m };
          return rectsOverlap(aBox, bBox);
        });
        if (blocked) continue;
        const accessDist = dist ? boxAccessDistance(grid, dist, x, y, fp.w, fp.h) : Infinity;
        const centerDist = Math.hypot(x + fp.w / 2 - cx, y + fp.h / 2 - cy);
        const edgeDist = footprintEdgeDistanceM(x, y, fp.w, fp.h, roof);
        candidates.push({ x_m: Math.round(x * 10) / 10, y_m: Math.round(y * 10) / 10, rotation, w_m: fp.w, h_m: fp.h, accessDist, centerDist, edgeDist });
      }
    }
  });

  candidates.sort((a, b) => {
    const aR = Number.isFinite(a.accessDist), bR = Number.isFinite(b.accessDist);
    if (aR !== bR) return aR ? -1 : 1;
    if (aR && a.accessDist !== b.accessDist) return a.accessDist - b.accessDist;
    if (windSensitive && Math.abs(a.edgeDist - b.edgeDist) > 0.05) return b.edgeDist - a.edgeDist;
    if (Math.abs(a.centerDist - b.centerDist) > 0.05) return a.centerDist - b.centerDist;
    return (a.rotation === item.rotation ? 0 : 1) - (b.rotation === item.rotation ? 0 : 1);
  });

  const top = candidates.slice(0, topN);
  const worst = Math.max(1, ...top.filter(c => Number.isFinite(c.accessDist)).map(c => c.accessDist));
  return top.map((c, i) => ({
    x_m: c.x_m, y_m: c.y_m, rotation: c.rotation, w_m: c.w_m, h_m: c.h_m,
    score: Math.round(100 * (Number.isFinite(c.accessDist) ? 1 - c.accessDist / (worst + grid.cell) : 0.5)),
    reason: !starts.length
      ? "Clear of every piece and inside the boundary — add an entrance to also check circulation."
      : Number.isFinite(c.accessDist)
        ? (i === 0 ? (windSensitive ? "Closest reachable, wind-sheltered spot with no clearance conflicts." : "Closest reachable spot with no clearance conflicts.") : "Reachable, a bit further from the nearest entrance.")
        : "Clear of conflicts, but not yet connected to an entrance.",
  }));
}

/* ── Smarter rules: area-aware recommendations ──
 * The four DESIGN_RULES thresholds are otherwise one-size-fits-all —
 * these loosely mirror how a real building code scales egress (exit
 * count, corridor width) with occupant load: more programmed floor area
 * means more people moving through the same roof, so it takes more
 * entrances and wider walkways to avoid a bottleneck. Advisory only —
 * combineField.js/main.js surface this as a suggestion with an Apply
 * button in Combine's Rules step; it never changes DESIGN_RULES itself.
 */
function recommendedRules(combineState) {
  const totalAreaM2 = combineState.items.reduce((sum, it) => {
    const fp = getFootprint(it);
    return sum + fp.w * fp.h;
  }, 0);
  return {
    totalAreaM2: Math.round(totalAreaM2),
    minEntryPoints: Math.max(1, Math.ceil(totalAreaM2 / 250)),
    circulationWidth_m: Math.round(clamp(1.0 + totalAreaM2 / 1000, 1.0, 2.4) * 10) / 10,
  };
}
