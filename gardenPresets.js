/**
 * gardenPresets.js — the Garden Core presets on the Manual placement board (Combine tab).
 *
 * A preset is a fixed design laid out from whatever roof footprint is loaded: it starts from a clean board (the person is asked first; the entry points,
 * the building's doors, stay), then places its pieces. Offered only when the roof type is Garden Core. The pieces are ordinary board pieces afterwards
 * (move, remove, Clear all), and carry the family values the preset decides, which is what Revit will get (e.g. Seat Cap off).
 *
 * Preset 1, QUIET GARDEN (user, 2026-09-27): 6 x Planter T in one row, centred on the roof's centre point, the row along the roof's longest side,
 * 2.5 m clear between them; a row of 6 x Planter S on EACH side of it, 3 m clear from the T row, each S lined up with the T opposite it (long side along
 * the row). Seat Cap off, except on every other Planter S, staggered: the 1st / 3rd / 5th in one S row, the 2nd / 4th / 6th in the other (a checkerboard
 * across the T row, user 2026-09-27). Calisthenics at one end of the planters and Yoga at the other, 3 m clear of them, long side along the row, against
 * the setback line of the roof's longest edge. Green roof beds in the setback band along every roof edge of 6 m or more that has no entry point, and a
 * 4 x 4 m green roof bed in each of the two corners at the ends of the longest edge, inside the setback lines.
 * More rules to come from the user.
 *
 * Preset 2, SOCIAL GARDEN (user, 2026-09-27): the Quiet Garden with Planter T no. 1, 3, 4 and 6 of the middle row (counted along the row) replaced by the
 * Garden tab's Park Bench and Table, each centred where its Planter T would stand; everything else the same.
 *
 * Preset 3, PLANTED GARDEN (user, 2026-09-27): the Social Garden with, in the middle row, no. 2-5 removed and one green roof bed over the whole strip
 * from the outer edge of no. 2 to that of no. 5 (the middle row's depth); Planter T in place of Planter S no. 7, 12, 13, 18 (centred on the S position);
 * and at no. 8, 11, 14, 17 a green roof bed as wide as a Planter S, running from the S row's inner edge out to meet the setback line (its green strip).
 * Numbering as on the board: middle row 1-6, one S row 7-12, the other 13-18, counted along the row.
 */

const GARDEN_BED_MIN_EDGE_M = 6;       // a roof edge shorter than this gets no green bed in the setback

const GARDEN_PRESET_CLEAR_M = 2.5;     // clear space between neighbours in a row

/**
 * A preset's rows, from the middle row out: `planter`, `count`, and `side` (0 = the middle row, on the centre point; -1 / +1 = one side or the other,
 * `clear` metres clear of the middle row). Every row shares the middle row's spacing, so the pieces line up across the rows. `seatCapFrom` (optional): every
 * other piece of the row, starting at that index (0 = the 1st), gets Seat Cap on; the rest keep the preset's `family` values.
 */
const GARDEN_PRESETS = {
  quiet_garden: {
    label: "Quiet Garden", family: { seatCap: false },
    rows: [
      { planter: "planter_t", count: 6, side: 0 },
      { planter: "planter_s", count: 6, side: -1, clear: 3.0, seatCapFrom: 0 },    // 1st, 3rd, 5th
      { planter: "planter_s", count: 6, side: 1, clear: 3.0, seatCapFrom: 1 }      // 2nd, 4th, 6th: staggered across the T row
    ],
    // at the ends of the planters: `end` -1 / +1 = before the first / after the last, `clear` metres beyond it, on the longest edge's setback line
    ends: [
      { activity: "calisthenics", engine: "Calisthenics", end: -1, clear: 3.0 },
      { activity: "yoga_deck", engine: "Yoga", end: 1, clear: 3.0 }
    ],
    beds: true,
    cornerBeds: 4.0                 // a square green roof bed (m) in each corner at the ends of the longest edge, inside the setback lines
  }
};

// Social Garden: the Quiet Garden with Park Bench and Table in place of Planter T no. 1, 3, 4, 6 (`swap`: the row's pieces, by index, that are a bench instead)
GARDEN_PRESETS.social_garden = Object.assign({}, GARDEN_PRESETS.quiet_garden, {
  label: "Social Garden",
  rows: GARDEN_PRESETS.quiet_garden.rows.map(r => r.side === 0 ? Object.assign({}, r, { swap: [0, 2, 3, 5] }) : r)
});

// Planted Garden: the Social Garden, then (by index along the row) `skip` = left empty, `tAt` = a Planter T centred on that spot, `bedAt` = a green
// bed as wide as the row's planter running outward to the setback line; `midBed` = one green bed over the middle row from piece `from` to piece `to`.
GARDEN_PRESETS.planted_garden = Object.assign({}, GARDEN_PRESETS.social_garden, {
  label: "Planted Garden",
  rows: GARDEN_PRESETS.social_garden.rows.map(r => r.side === 0 ? Object.assign({}, r, { skip: [1, 2, 3, 4] })
                                                               : Object.assign({}, r, { tAt: [0, 5], bedAt: [1, 4] })),
  midBed: { from: 1, to: 4 }
});

/** The roof outline in board metres (x right, y down), as the board draws it. */
function gardenPresetFootprint() {
  if (typeof algoFootprint === "function") return algoFootprint();
  const r = combineState.roof;
  return [[0, 0], [r.length, 0], [r.length, r.width], [0, r.width]];
}

/** The roof's centre point (the middle of its overall extent) and whether its longest side runs along x. */
function gardenPresetAxes() {
  const foot = gardenPresetFootprint();
  const xs = foot.map(p => p[0]), ys = foot.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let best = null;
  foot.forEach((a, i) => {
    const b = foot[(i + 1) % foot.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    if (!best || len > best.len) best = { len, alongX: horiz, line: horiz ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2,
      lo: horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi: horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]) };
  });
  const alongX = best ? best.alongX : true;
  // the longest edge's line across the row, and which way is into the roof from it (+1 / -1)
  const edgeLine = best ? best.line : Math.min(...ys), inward = (alongX ? cy : cx) >= edgeLine ? 1 : -1;
  // where the longest edge starts and ends, along the row
  const edgeLo = best ? best.lo : Math.min(...xs), edgeHi = best ? best.hi : Math.max(...xs);
  return { cx, cy, alongX, edgeLine, inward, edgeLo, edgeHi, spanX: Math.max(...xs) - Math.min(...xs), spanY: Math.max(...ys) - Math.min(...ys) };
}

/** How far from (px, py) in direction (dx, dy) (one of the axes) the roof outline is, in metres (Infinity if never). */
function gardenOutlineReach(px, py, dx, dy) {
  const foot = gardenPresetFootprint();
  let best = Infinity;
  foot.forEach((a, i) => {
    const b = foot[(i + 1) % foot.length];
    if (dy !== 0 && Math.abs(a[1] - b[1]) < 1e-9 && px >= Math.min(a[0], b[0]) - 1e-9 && px <= Math.max(a[0], b[0]) + 1e-9) {
      const d = (a[1] - py) * dy; if (d > 1e-9 && d < best) best = d;
    }
    if (dx !== 0 && Math.abs(a[0] - b[0]) < 1e-9 && py >= Math.min(a[1], b[1]) - 1e-9 && py <= Math.max(a[1], b[1]) + 1e-9) {
      const d = (a[0] - px) * dx; if (d > 1e-9 && d < best) best = d;
    }
  });
  return best;
}

/** Is anything on the board that a preset would clear (pieces, garden zones, indoor walls, the tray)? */
function gardenBoardHasContent() {
  return combineState.items.length > 0 || (combineState.zones || []).length > 0 || (combineState.walls || []).length > 0 || (combineState.tray || []).length > 0;
}

function gardenClearBoard() {
  combineState.items = []; combineState.zones = []; combineState.walls = []; combineState.tray = [];
  combineState.selectedId = null; combineState.selectedKind = null;
  if (typeof activeGoldbeckPresetId !== "undefined") { activeGoldbeckPresetId = null; if (typeof updateGoldbeckShuffleVisibility === "function") updateGoldbeckShuffleVisibility(); }
}

/** Lays preset `key` out on the board (after asking, when the board is not empty). */
function applyGardenPreset(key) {
  const preset = GARDEN_PRESETS[key];
  if (!preset || typeof planterParams !== "function") return;
  const ax = gardenPresetAxes(), name = preset.label, gap = GARDEN_PRESET_CLEAR_M;
  const sizeOf = id => { const p = Object.assign(planterParams(id), preset.family); return { p, len: p.length / 1000, wid: p.width / 1000 }; };
  const mid = preset.rows.find(r => r.side === 0), m = sizeOf(mid.planter);
  const pitch = m.len + gap;                                   // centre to centre along the row, shared by every row
  const row = (mid.count - 1) * pitch + m.len;
  if (row > (ax.alongX ? ax.spanX : ax.spanY)) {
    if (typeof showToast === "function") showToast(`${name} does not fit`, `Its row is ${row.toFixed(1)} m long; this roof's longest side is shorter.`);
    return;
  }
  if (gardenBoardHasContent() && !window.confirm(`Using the ${name} preset will clear everything on the board (pieces, garden zones, walls and the tray; the entry points stay). Continue?`)) return;
  gardenClearBoard();

  const stamp = Date.now();
  const sb = typeof DESIGN_RULES !== "undefined" ? DESIGN_RULES.boundarySetback_m : 1.5;
  const extraBeds = [];                                        // the preset's own green beds, as boxes [x0, y0, x1, y1]
  if (preset.midBed) {
    // one bed over the middle row from piece `from` to piece `to` (outer edge to outer edge), as deep as the middle row
    const a0 = (preset.midBed.from - (mid.count - 1) / 2) * pitch - m.len / 2, a1 = (preset.midBed.to - (mid.count - 1) / 2) * pitch + m.len / 2;
    const c = ax.alongX ? ax.cy : ax.cx;
    extraBeds.push(ax.alongX ? [ax.cx + a0, c - m.wid / 2, ax.cx + a1, c + m.wid / 2] : [c - m.wid / 2, ax.cy + a0, c + m.wid / 2, ax.cy + a1]);
  }
  let n = 0;
  preset.rows.forEach(r => {
    const sz = sizeOf(r.planter), label = PLANTER_VARIANTS[r.planter].label;
    // across the row: the middle row sits on the centre point; a side row is `clear` metres beyond the middle row's edge
    const across = r.side === 0 ? 0 : r.side * (m.wid / 2 + r.clear + sz.wid / 2);
    for (let i = 0; i < r.count; i++) {
      const along = (i - (r.count - 1) / 2) * pitch;           // the piece's centre, from the centre point along the longest side
      const cxm = ax.alongX ? ax.cx + along : ax.cx + across, cym = ax.alongX ? ax.cy + across : ax.cy + along;
      if (r.skip && r.skip.includes(i)) continue;
      if (r.bedAt && r.bedAt.includes(i)) {
        // a green bed as wide as the planter it replaces, from the row's inner edge out to the setback line on that side
        const inner = (ax.alongX ? ax.cy : ax.cx) + r.side * (m.wid / 2 + r.clear);
        const reach = gardenOutlineReach(ax.alongX ? cxm : inner, ax.alongX ? inner : cym, ax.alongX ? 0 : r.side, ax.alongX ? r.side : 0);
        const outer = inner + r.side * Math.max(sz.wid, reach - sb);
        const a0 = along - sz.len / 2, a1 = along + sz.len / 2, c0 = Math.min(inner, outer), c1 = Math.max(inner, outer);
        extraBeds.push(ax.alongX ? [ax.cx + a0, c0, ax.cx + a1, c1] : [c0, ax.cy + a0, c1, ax.cy + a1]);
        continue;
      }
      if (r.tAt && r.tAt.includes(i)) {
        // a Planter T centred where the Planter S would stand
        const t = sizeOf("planter_t"), tLabel = PLANTER_VARIANTS.planter_t.label;
        const tW = ax.alongX ? t.len : t.wid, tH = ax.alongX ? t.wid : t.len;
        combineState.items.push({
          id: `preset_${key}_${stamp}_${n++}`, kind: "gardenBlock", label: tLabel,
          length_m: t.len, width_m: t.wid, rotation: ax.alongX ? 0 : 90,
          x_m: Math.round((cxm - tW / 2) * 100) / 100, y_m: Math.round((cym - tH / 2) * 100) / 100,
          preset: key,
          sourceJson: { version: "1.0", generator: "Sportify-Garden-Preset", preset: key, gardenBlock: { type: "planter_t", label: tLabel, family: "Planter", params: t.p } }
        });
        continue;
      }
      if (r.swap && r.swap.includes(i) && typeof GARDEN_BENCH !== "undefined") {
        // a Park Bench and Table here instead, centred where the planter would stand (as Push to Combine gives it: its family is still to come)
        const bl = GARDEN_BENCH.length / 1000, bw = GARDEN_BENCH.width / 1000, bLabel = GARDEN_BENCH.label;
        const bW = ax.alongX ? bl : bw, bH = ax.alongX ? bw : bl;
        combineState.items.push({
          id: `preset_${key}_${stamp}_${n++}`, kind: "gardenBlock", label: bLabel,
          length_m: bl, width_m: bw, rotation: ax.alongX ? 0 : 90,
          x_m: Math.round((cxm - bW / 2) * 100) / 100, y_m: Math.round((cym - bH / 2) * 100) / 100,
          preset: key,
          sourceJson: { version: "1.0", generator: "Sportify-Garden-Preset", preset: key, gardenBlock: { type: GARDEN_BENCH.id, label: bLabel, family: null, length_mm: GARDEN_BENCH.length, width_mm: GARDEN_BENCH.width } }
        });
        continue;
      }
      const w = ax.alongX ? sz.len : sz.wid, h = ax.alongX ? sz.wid : sz.len;   // its footprint on the board
      const params = r.seatCapFrom != null && i % 2 === r.seatCapFrom ? Object.assign({}, sz.p, { seatCap: true }) : sz.p;
      combineState.items.push({
        id: `preset_${key}_${stamp}_${n++}`, kind: "gardenBlock", label,
        length_m: sz.len, width_m: sz.wid, rotation: ax.alongX ? 0 : 90,
        x_m: Math.round((cxm - w / 2) * 100) / 100, y_m: Math.round((cym - h / 2) * 100) / 100,
        preset: key,
        sourceJson: { version: "1.0", generator: "Sportify-Garden-Preset", preset: key, gardenBlock: { type: r.planter, label, family: "Planter", params } }
      });
    }
  });
  // the activities at the two ends of the planters, against the longest edge's setback line
  (preset.ends || []).forEach(e => {
    const a = typeof ACTIVITIES !== "undefined" && ACTIVITIES[e.activity];
    if (!a) return;
    const len = Math.max(a.length, a.width), wid = Math.min(a.length, a.width);
    const along = e.end * (row / 2 + e.clear + len / 2);
    const across = ax.edgeLine + ax.inward * (sb + wid / 2);                 // its long side on the setback line
    const cxm = ax.alongX ? ax.cx + along : across, cym = ax.alongX ? across : ax.cy + along;
    const w = ax.alongX ? len : wid, h = ax.alongX ? wid : len;
    const sp = typeof AlgoPlacement !== "undefined" ? AlgoPlacement.SPORTS.find(x => x.name === e.engine) : null;
    const src = sp && typeof algoCatalogueSource === "function" ? algoCatalogueSource(e.engine, Object.assign({}, sp, { long: len, short: wid })) : {};
    const label = a.label;
    combineState.items.push({
      id: `preset_${key}_${stamp}_${n++}`, kind: "activity", label,
      length_m: len, width_m: wid, rotation: ax.alongX ? 0 : 90,
      x_m: Math.round((cxm - w / 2) * 100) / 100, y_m: Math.round((cym - h / 2) * 100) / 100,
      preset: key, sourceJson: Object.assign({}, src, { generator: "Sportify-Garden-Preset", preset: key })
    });
  });

  let beds = preset.beds ? gardenSetbackBeds(key, stamp, sb) : 0;
  if (extraBeds.length && typeof ensureZoneState === "function" && typeof rectPoints === "function") {
    ensureZoneState();
    const assembly = combineState.zoneAssembly || (typeof defaultAssemblyFor === "function" ? defaultAssemblyFor("green_roof") : null);
    const R = v => Math.round(v * 100) / 100;
    extraBeds.forEach((b, i) => {
      combineState.zones.push(syncZoneBounds({ id: `zone_preset_${key}_${stamp}_bed${i}`, kind: "green_roof", assemblyKey: assembly, familyKey: typeof GREEN_ROOF_DEFAULT_FAMILY !== "undefined" ? GREEN_ROOF_DEFAULT_FAMILY : null, points: rectPoints(R(b[0]), R(b[1]), R(b[2] - b[0]), R(b[3] - b[1])), preset: key }));
      beds++;
    });
  }
  if (preset.cornerBeds && typeof ensureZoneState === "function" && typeof rectPoints === "function") {
    // a square bed in each corner at the ends of the longest edge: against that edge's setback line and the setback line at the end
    ensureZoneState();
    const assembly = combineState.zoneAssembly || (typeof defaultAssemblyFor === "function" ? defaultAssemblyFor("green_roof") : null);
    const d = preset.cornerBeds, R = v => Math.round(v * 100) / 100;
    const across0 = ax.inward > 0 ? ax.edgeLine + sb : ax.edgeLine - sb - d;
    [ax.edgeLo + sb, ax.edgeHi - sb - d].forEach((along0, i) => {
      const x = ax.alongX ? along0 : across0, y = ax.alongX ? across0 : along0;
      combineState.zones.push(syncZoneBounds({ id: `zone_preset_${key}_${stamp}_corner${i}`, kind: "green_roof", assemblyKey: assembly, familyKey: typeof GREEN_ROOF_DEFAULT_FAMILY !== "undefined" ? GREEN_ROOF_DEFAULT_FAMILY : null, points: rectPoints(R(x), R(y), d, d), preset: key }));
      beds++;
    });
  }
  if (typeof renderCombineTray === "function") renderCombineTray();
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  if (typeof showToast === "function") showToast(name, `${n} pieces placed along the roof's longest side, ${beds} green roof bed${beds === 1 ? "" : "s"} in the setback.`);
}

/**
 * Green roof beds in the setback band: one along every roof edge of GARDEN_BED_MIN_EDGE_M or more with no entry point on it, `sb` deep, on the roof side.
 * Where two beds meet at an outside corner, the longer edge's bed keeps the corner square, so they do not overlap. Returns how many were made.
 * `key` = the preset that makes them, or null for the Manual board's default beds (defaultSetbackBeds below), which are tagged `defaultBed` instead.
 * Each bed remembers the roof edge it runs along (`bedEdge`), so a default bed can be taken away when an entry point is later put on that edge.
 */
function gardenSetbackBeds(key, stamp, sb) {
  if (typeof ensureZoneState !== "function" || typeof syncZoneBounds !== "function") return 0;
  ensureZoneState();
  const assembly = combineState.zoneAssembly || (typeof defaultAssemblyFor === "function" ? defaultAssemblyFor("green_roof") : null);
  const foot = gardenPresetFootprint(), R = v => Math.round(v * 100) / 100;
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = foot.length - 1; i < foot.length; j = i++) {
      const [xi, yi] = foot[i], [xj, yj] = foot[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  };
  const onEdge = (p, a, b) => {           // an entry point lies on this edge (entries are snapped onto the outline)
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x_m - a[0]) * dx + (p.y_m - a[1]) * dy) / L2)) : 0;
    return Math.hypot(a[0] + t * dx - p.x_m, a[1] + t * dy - p.y_m) < 0.1;
  };
  const edges = foot.map((a, i) => { const b = foot[(i + 1) % foot.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; })
    .filter(e => e.len >= GARDEN_BED_MIN_EDGE_M && !combineState.entryPoints.some(p => onEdge(p, e.a, e.b)))
    .sort((p, q) => q.len - p.len);
  const made = [];                         // the straight beds made so far, as boxes [x0, y0, x1, y1]
  let count = 0;
  edges.forEach((e, i) => {
    const ux = (e.b[0] - e.a[0]) / e.len, uy = (e.b[1] - e.a[1]) / e.len;
    let nx = -uy, ny = ux;                 // the normal into the roof
    const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
    if (!inside(mx + nx * 0.05, my + ny * 0.05)) { nx = -nx; ny = -ny; }
    let pts;
    if (Math.abs(ux) < 1e-9 || Math.abs(uy) < 1e-9) {
      // a straight edge: a box, cut back where a longer edge's bed already holds the corner
      const box = [Math.min(e.a[0], e.b[0], e.a[0] + nx * sb), Math.min(e.a[1], e.b[1], e.a[1] + ny * sb),
                   Math.max(e.a[0], e.b[0], e.a[0] + nx * sb), Math.max(e.a[1], e.b[1], e.a[1] + ny * sb)];
      const horiz = Math.abs(uy) < 1e-9;
      made.forEach(m => {
        if (box[0] >= m[2] || m[0] >= box[2] || box[1] >= m[3] || m[1] >= box[3]) return;
        if (horiz) { if (m[0] <= box[0]) box[0] = Math.max(box[0], m[2]); else box[2] = Math.min(box[2], m[0]); }
        else { if (m[1] <= box[1]) box[1] = Math.max(box[1], m[3]); else box[3] = Math.min(box[3], m[1]); }
      });
      if (box[2] - box[0] < 0.3 || box[3] - box[1] < 0.3) return;
      made.push(box);
      pts = rectPoints(R(box[0]), R(box[1]), R(box[2] - box[0]), R(box[3] - box[1]));
    } else {
      pts = [e.a, e.b, [e.b[0] + nx * sb, e.b[1] + ny * sb], [e.a[0] + nx * sb, e.a[1] + ny * sb]].map(p => ({ x_m: R(p[0]), y_m: R(p[1]) }));
    }
    const tag = key ? { preset: key } : { defaultBed: true };
    combineState.zones.push(syncZoneBounds(Object.assign({ id: `zone_${key ? "preset_" + key : "default"}_${stamp}_${i}`, kind: "green_roof", assemblyKey: assembly, familyKey: typeof GREEN_ROOF_DEFAULT_FAMILY !== "undefined" ? GREEN_ROOF_DEFAULT_FAMILY : null, points: pts, bedEdge: [e.a.slice(), e.b.slice()] }, tag)));
    count++;
  });
  return count;
}

/**
 * The Manual board's default green roof (user, 2026-09-28): Green Roof Module beds in the setback band along every roof edge of 6 m or more with no entry
 * point on it, the same beds the presets lay. Made ONLY for a new session and a new roof footprint (sessionGate.js Start a New Session, revitBridge.js /
 * the Revit file import / the roof size inputs in combineController.js) - never for a loaded session. They are ordinary zones after that: a preset or an
 * Algorithmic Apply replaces them like every other zone, and a person can select and delete any of them. A new footprint replaces the previous default
 * beds (not zones anyone drew).
 */
function defaultSetbackBeds() {
  if (typeof ensureZoneState !== "function") return 0;
  ensureZoneState();
  combineState.zones = combineState.zones.filter(z => !z.defaultBed);
  const sb = typeof DESIGN_RULES !== "undefined" ? DESIGN_RULES.boundarySetback_m : 1.5;
  const n = gardenSetbackBeds(null, Date.now(), sb);
  if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  return n;
}

/** A default bed whose edge has since got an entry point is taken away (the default never covers an edge with an entry); called on every board redraw. */
function dropDefaultBedsOnEntryEdges() {
  const zones = combineState.zones || [], entries = combineState.entryPoints || [];
  if (!entries.length || !zones.some(z => z.defaultBed && z.bedEdge)) return;
  const onEdge = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x_m - a[0]) * dx + (p.y_m - a[1]) * dy) / L2)) : 0;
    return Math.hypot(a[0] + t * dx - p.x_m, a[1] + t * dy - p.y_m) < 0.1;
  };
  combineState.zones = zones.filter(z => !(z.defaultBed && z.bedEdge && entries.some(p => onEdge(p, z.bedEdge[0], z.bedEdge[1]))));
}

/** The preset buttons show only on a Garden Core roof (called on every board redraw). */
function syncGardenPresetButtons() {
  const box = document.getElementById("garden-presets");
  if (!box) return;
  const program = typeof getRoofProgram === "function" ? getRoofProgram() : null;
  const show = !!(program && program.key === "garden");
  box.style.display = show ? "flex" : "none";
  box.parentElement.classList.toggle("has-garden-presets", show);   // the legend then stops above the buttons (style.css)
  // how much room the legend leaves at the bottom: the buttons' own height, their offset from the bottom, and a gap
  if (show) box.parentElement.style.setProperty("--garden-presets-room", (box.offsetHeight + 22 + 14) + "px");
}

document.getElementById("btn-preset-quiet-garden")?.addEventListener("click", () => applyGardenPreset("quiet_garden"));
document.getElementById("btn-preset-social-garden")?.addEventListener("click", () => applyGardenPreset("social_garden"));
document.getElementById("btn-preset-planted-garden")?.addEventListener("click", () => applyGardenPreset("planted_garden"));
