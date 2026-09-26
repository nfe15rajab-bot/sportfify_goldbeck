/**
 * algoPlacementUI.js — "Algorithmic placement" mode: an alternative to placing pieces by hand in Combine.
 *
 * You say which courts you want and how many; the packing engine (algoPlacementCore.js, a port of the Rhino tool "Rooftop Sports Court Planner") places them on the
 * roof by rules: a garden band along the edge (the setback), courts against the setback line first and then the middle, a clear path around every court and along
 * the sides of lifts and ramps, one pathway network that reaches every lift and ramp, and whatever is left over as garden pockets. The layout is a live preview that
 * re-checks itself as you change anything; a court that cannot be placed is refused with the reason. "Apply to Combine" then puts the courts on the board as ordinary
 * pieces (and the garden as green roof zones), where they can still be moved by hand: the two modes hand over to each other, they do not compete.
 *
 * Reads from Combine (never changes it until Apply): the roof outline (a rectangle, or the polygon Revit pushed), the boundary setback rule, and, from the Revit
 * roof features, the stairs / lifts / ramps (offered as the lifts and ramps) and the openings and equipment (kept clear).
 * Writes on Apply: combineState.items (kind field / activity), combineState.zones (green roof), combineState.entryPoints. Everything it writes carries
 * `algorithmic: true` so a second Apply, or "Clear applied", takes away exactly what it put there.
 */

const ALGO_STORAGE_KEY = "sportify-algo-placement";

/** How each court of the packing tool maps onto the Sportify catalogue (so the export, and Revit, know what it is). */
const ALGO_CATALOGUE = {
  "Multi Sport Court": { kind: "field", sport: "polyvalent", variant: "mini" },
  "Basketball Court": { kind: "field", sport: "basketball", variant: "mini" },
  "Badminton": { kind: "field", sport: "badminton", variant: "mini" },
  "Handball": { kind: "field", sport: "handball", variant: "mini" },
  "Volleyball": { kind: "field", sport: "volleyball", variant: "mini" },
  "Yoga": { kind: "activity", id: "yoga_deck" },
  "Bocce Court": { kind: "activity", id: "urban_bocce" },
  "Calisthenics": { kind: "activity", id: "calisthenics" },
  "Ping Pong": { kind: "activity", id: "ping_pong" },
  "Mini Golf": { kind: "activity", id: "minigolf_lane" },
  "Sandpit": { kind: "activity", id: "sand_pit" },
  "3x3 Streetbasketball": { kind: "activity", id: "streetbasketball_3x3" },
  "Sprint Lane": { kind: "activity", id: "sprint_lane" },
  "Padel Tennis Court": { kind: "activity", id: "padel_court" },
  "Teqball Table": { kind: "activity", id: "teqball_table" },
  "Bouldering Wall": { kind: "activity", id: "bouldering_wall" },
  "Pickleball Court": { kind: "activity", id: "pickleball_court" },
  "CrossFit Training Rig": { kind: "activity", id: "crossfit_rig" },
  "TRX Suspension Frame": { kind: "activity", id: "trx_frame" },
  "HIIT Turf Grid": { kind: "activity", id: "hiit_turf_grid" },
  "Multipurpose Sport Area": { kind: "activity", id: "multipurpose_court" },
  "Trampoline": { kind: "activity", id: "trampoline" },
  "Modular Tower Slide": { kind: "activity", id: "modular_tower_slide" },
  "Climbing Tower": { kind: "activity", id: "climbing_tower" },
  "Balance Logs": { kind: "activity", id: "balance_logs" },
  "Locker & Dressing Room Module": { kind: "activity", id: "locker_module" },
  "Bathroom & Shower Module": { kind: "activity", id: "bathroom_module" },
  "Rest / Hydration Area": { kind: "activity", id: "rest_area" }
};

/**
 * Basketball and volleyball are specified by their own modules (basketballCourt.js, volleyballCourt.js), not sized: what a court takes on the roof is what its
 * specification says (a volleyball court is the regulation court plus its free zone whatever the size variant; a basketball court with one basket is half a court),
 * and a placed court carries its own choices (surface, mounting, colours) so it does not follow the Sport panel afterwards. A court the algorithm places is treated
 * as one pushed from the Sport panel: the packing engine reserves the specified footprint, and Apply gives the piece the module's own payload.
 * The tool's table in algoPlacementCore.js (and its test against the Rhino original) are not touched: the sizes are adopted here.
 */
const ALGO_SPECIFIED = {
  "Basketball Court": {
    field: "basketball",
    ready: () => typeof basketballState !== "undefined" && typeof basketballFootprint === "function" && typeof basketballPlacementPayload === "function",
    state: () => basketballState, footprint: s => basketballFootprint(s), payload: s => basketballPlacementPayload(s)
  },
  "Volleyball": {
    field: "volleyball",
    ready: () => typeof volleyballState !== "undefined" && typeof volleyballFootprint === "function" && typeof volleyballPlacementPayload === "function",
    state: () => volleyballState, footprint: s => volleyballFootprint(s), payload: s => volleyballPlacementPayload(s)
  }
};

/** What a person reads for a court: its label, while everything else (the solver, saved quantities) keeps the stable name. */
const algoLabel = name => AlgoPlacement.labelOf(name);

/** The rule: every court has a clear path of at least this many metres all around it (big courts included, so no two ever touch), and the main pathway never narrows below it. */
const ALGO_MIN_PATH_M = 2.0;
/** With zoning the primary paths (outside the zones, between them) are 2.0 to 2.5 m; inside a zone 1.5 to 1.8 m; around lifts, stairs and ramps 2.5 m. */
const ALGO_PRIMARY_MAX_M = 2.5;

/** What the list offers, under the headings a person reads. The 20 x 12 "Multi Sport Court" and Rest / Hydration Area are in no list (they stay in the engine, whose Rhino-parity and zoning tests use their names). */
const ALGO_LISTS = [
  { heading: "Outdoor sports", names: ["3x3 Streetbasketball", "Basketball Court", "Handball", "Volleyball", "Bocce Court", "Sprint Lane", "Padel Tennis Court", "Teqball Table", "Pickleball Court", "Multipurpose Sport Area", "TRX Suspension Frame", "CrossFit Training Rig", "HIIT Turf Grid", "Mini Golf", "Sandpit", "Trampoline", "Balance Logs", "Climbing Tower", "Modular Tower Slide"] },
  { heading: "Indoor sports", names: ["Ping Pong", "Bouldering Wall", "Badminton"] },
  { heading: "Indoor services", names: ["Locker & Dressing Room Module", "Bathroom & Shower Module"] },
  { heading: "Garden activities", names: ["Yoga", "Calisthenics"] }
];
/** Which headings each roof type shows. Garden Core keeps only the garden activities; Mixed and a roof with no type yet show everything. */
const ALGO_ROOF_HEADINGS = { sports: ["Outdoor sports", "Indoor sports", "Indoor services"], garden: ["Garden activities"] };

/** The lists the current roof type offers: [{ heading, names }]. */
function algoListsForRoof() {
  const program = typeof getRoofProgram === "function" ? getRoofProgram() : null;
  const shown = program && ALGO_ROOF_HEADINGS[program.key];
  return ALGO_LISTS.filter(l => !shown || shown.includes(l.heading));
}

/** The names the current roof type offers; anything else counts as zero. */
function algoVisibleNames() {
  return new Set(algoListsForRoof().flatMap(l => l.names));
}

// Lifts / ramps / stairs are no longer placed here (the plan starts from the board's entry points); the sizes stay only so older saved files still load.
const ALGO_BLOCK_SIZES ={ lift: [2.5, 2.5], ramp: [6.0, 1.5], stair: [4.0, 2.0] };

const algoState = {
  mode: "manual",                         // "manual" | "algo": what Combine shows; a per-viewer convenience, never saved in the layout
  qty: {},                                // court name -> how many
  good: {},                               // the last quantities the packing accepted (a court that does not fit goes back to these)
  blocks: [],                             // lifts / ramps / stairs: { id, kind, x, y, w, h } (top-left, metres)
  settings: { setback: null, pathW: 2.5, minPathW: 2.0, time: 8, seed: 1, edgeFirst: true, leftoverPath: false, ring: false, strictGap: true, keepClear: true, gardenZones: true, entryPoints: true },
  plan: null, site: null, planKey: "",
  fit: null, fitKey: "",
  msg: "", status: "", progress: 0, busy: false,
  token: 0, timer: null,
  seen: new Set(), seenKey: "", shuffleN: 0,
  built: false, blockCounter: 0
};

(function loadAlgoStorage() {
  let oldDefaultPath = false;
  try {
    const saved = JSON.parse(localStorage.getItem(ALGO_STORAGE_KEY) || "null");
    if (saved) {
      if (saved.qty) algoState.qty = saved.qty;
      if (saved.settings) Object.assign(algoState.settings, saved.settings);
      oldDefaultPath = !!saved.settings && saved.settings.pathW === 2 && saved.settings.minPathW === 2;
      // Lifts / ramps / stairs saved by older versions are ignored: the pathways now start from the entry points on the Manual board.
    }
  } catch (e) { /* storage blocked or corrupt: the defaults */ }
  algoState.settings.ring = false;                                            // "landing on all sides of lifts / ramps" went with the lifts and ramps
  // settings saved before the 2 m rule may hold a narrower pathway or the old "big courts touch" exception: the rule wins
  algoState.settings.strictGap = true;
  if (oldDefaultPath) algoState.settings.pathW = 2.5;                         // settings saved before zoning held the old 2.0 m default: the primary path may now be 2.5 m
  algoState.settings.pathW = Math.max(ALGO_MIN_PATH_M, Number(algoState.settings.pathW) || ALGO_MIN_PATH_M);
  algoState.settings.minPathW = Math.max(ALGO_MIN_PATH_M, Number(algoState.settings.minPathW) || ALGO_MIN_PATH_M);
  AlgoPlacement.SPORTS.forEach(s => { if (!Number.isFinite(algoState.qty[s.name])) algoState.qty[s.name] = 0; });
  algoState.good = Object.assign({}, algoState.qty);
})();

function algoSave() {
  try { localStorage.setItem(ALGO_STORAGE_KEY, JSON.stringify({ qty: algoState.qty, settings: algoState.settings })); } catch (e) { /* not kept */ }
}

const algoEsc = s => escapeHtml(s);
const algoRound = v => Math.round(v * 1000) / 1000;
const algoRgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

/** The specifying module's state as the Sport panel has it now, with the size variant the packing tool uses; null for a sport that is not specified (or its module is not loaded). */
function algoSpecifiedState(name) {
  const spec = ALGO_SPECIFIED[name];
  return spec && spec.ready() ? Object.assign({}, spec.state(), { variant: ALGO_CATALOGUE[name].variant }) : null;
}

/**
 * The packing engine's table gets the specified footprint of every specified sport (long side, short side). True when a size changed, so that a plan made with the old
 * one is thrown away. `swap` remembers that the specification's own length runs along the short side (a half court is 11 m long and 13 m wide): the piece is then
 * created in the specification's orientation and turned to whichever way the packer laid it.
 */
function algoAdoptSpecifiedSizes() {
  let changed = false;
  for (const name of Object.keys(ALGO_SPECIFIED)) {
    const st = algoSpecifiedState(name), sp = AlgoPlacement.SPORTS.find(s => s.name === name);
    if (!st || !sp) continue;
    const fp = ALGO_SPECIFIED[name].footprint(st);
    const long = algoRound(Math.max(fp.length_m, fp.width_m)), short = algoRound(Math.min(fp.length_m, fp.width_m));
    const swap = fp.length_m < fp.width_m;
    if (sp.long !== long || sp.short !== short || sp.swap !== swap) { sp.long = long; sp.short = short; sp.swap = swap; changed = true; }
  }
  return changed;
}

// ------------------------------------------------------------------------------------------------ what the roof gives

/** The roof outline in the plan's coordinates (x right, y down): the polygon Revit pushed (its y runs up, the plan's runs down), else the plain rectangle. */
function algoFootprint() {
  const roof = combineState.roof;
  if (roof.boundary && roof.boundary.length >= 3) return roof.boundary.map(p => [p.x_m, roof.width - p.y_m]);
  return [[0, 0], [roof.length, 0], [roof.length, roof.width], [0, roof.width]];
}

/** Openings and equipment from the Revit roof features, as boxes courts must stay off (asks for no landing and no path). */
function algoKeepClearBoxes() {
  const f = combineState.roofFeatures;
  if (!f || !algoState.settings.keepClear) return [];
  const boxes = [];
  (f.openings || []).forEach(o => {
    const xs = o.polygon_m.map(p => p.x_m), ys = o.polygon_m.map(p => p.y_m);
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  (f.equipment || []).forEach(q => boxes.push([q.x_m - q.width_m / 2, q.y_m - q.depth_m / 2, q.x_m + q.width_m / 2, q.y_m + q.depth_m / 2]));
  return boxes;
}

/**
 * The entry points placed on the Manual board, as the packing engine's `entries`: where the pathway network starts. Lifts, ramps and stairs no longer take part:
 * the whole imported footprint is usable, and the way onto it is the entrances drawn on its edge. Each entry becomes a short access strip one pathway wide,
 * running from the door straight in across the garden band (square to the edge it stands on), so the landing the engine builds beside it lies where the usable
 * area begins and the network grows from there.
 */
function algoEntryRects() {
  const W = Math.max(ALGO_MIN_PATH_M, Number(algoState.settings.pathW) || ALGO_MIN_PATH_M);
  const res = AlgoPlacement.RES || 0.1;
  const sb = algoSetback();
  const base = Math.max(0.5, Math.ceil(sb / res - 1e-6) * res);
  const foot = algoFootprint();
  const edges = foot.map((p, i) => [p, foot[(i + 1) % foot.length]]);
  const distToEdges = (x, y) => Math.min(...edges.map(([a, b]) => {
    // square round an edge's ends, as the engine's garden band (no rounded corners)
    if (a[1] === b[1]) return Math.max(Math.abs(y - a[1]), Math.max(0, Math.min(a[0], b[0]) - x, x - Math.max(a[0], b[0])));
    if (a[0] === b[0]) return Math.max(Math.abs(x - a[0]), Math.max(0, Math.min(a[1], b[1]) - y, y - Math.max(a[1], b[1])));
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
  }));
  const inside = (x, y) => typeof pointInPolygon === "function" ? pointInPolygon(foot.map(p => ({ x: p[0], y: p[1] })), x, y) : true;
  return (combineState.entryPoints || []).map(ep => {
    const [nx, ny] = typeof entryInwardNormal === "function" ? entryInwardNormal(ep) : [0, 1];
    const tx = -ny, ty = nx;
    // The door's strip stays on the edge it stands on: near the end of a short edge (a small notch) it slides along, so it never pokes past the corner.
    let cx = ep.x_m, cy = ep.y_m;
    let near = null;
    for (const [a, b] of edges) {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const t = Math.max(0, Math.min(len, ((cx - a[0]) * dx + (cy - a[1]) * dy) / len));
      const d = Math.hypot(cx - (a[0] + dx * t / len), cy - (a[1] + dy * t / len));
      if (!near || d < near.d) near = { d, a, dx, dy, len, t };
    }
    if (near && near.len >= W) {
      const t = Math.max(W / 2, Math.min(near.len - W / 2, near.t));
      cx = near.a[0] + near.dx * t / near.len; cy = near.a[1] + near.dy * t / near.len;
    }
    // A point `along` across the door and `inward` from the edge.
    const at = (along, inward) => [cx + tx * along + nx * inward, cy + ty * along + ny * inward];
    // The landing the engine builds just inside the way in must lie in the usable area. Next to a corner of the roof the garden band is wider than the setback
    // (it wraps round the corner), so the way in reaches deeper there, in steps of the grid, until the landing clears it.
    const landingClear = d => [-W / 2, 0, W / 2].every(a => [d + 0.05, d + W / 2, d + W - 0.05].every(i => { const [x, y] = at(a, i); return inside(x, y) && distToEdges(x, y) >= sb - 0.05; }));
    let depth = base;
    for (let d = base; d <= base + 4 + 1e-9; d += res) { if (landingClear(d)) { depth = d; break; } }
    const pts = [at(W / 2, 0), at(-W / 2, 0), at(W / 2, depth), at(-W / 2, depth)];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [algoRound(Math.min(...xs)), algoRound(Math.min(...ys)), algoRound(Math.max(...xs)), algoRound(Math.max(...ys))];
  });
}

function algoSetback() {
  const s = algoState.settings.setback;
  if (Number.isFinite(s)) return s;
  return typeof DESIGN_RULES !== "undefined" && Number.isFinite(DESIGN_RULES.boundarySetback_m) ? DESIGN_RULES.boundarySetback_m : AlgoPlacement.DEFAULT_SETBACK;
}

function algoRequests() {
  const visible = algoVisibleNames();
  return AlgoPlacement.SPORTS.filter(s => visible.has(s.name)).flatMap(s => Array.from({ length: algoState.qty[s.name] || 0 }, () => ({ name: s.name, w: s.long, h: s.short })));
}

/** The structural grid Revit pushed with the roof, as plain lines in the roof's plan (metres): the rule that heavy items sit along it reads these. Empty when no grid came. */
function algoGridLines() {
  const st = combineState.structure;
  return st && Array.isArray(st.gridLines) ? st.gridLines.map(g => ({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 })) : [];
}

/** Zoning (zones, in-zone and primary paths, indoor items ignoring the setback) applies once the roof has a type. Without one the plain 2 m rule stays, as it was. */
function algoZoningOn() {
  return typeof getRoofProgram === "function" && !!getRoofProgram();
}

function algoSiteKey() {
  const s = algoState.settings;
  return JSON.stringify([algoZoningOn(), algoFootprint(), algoSetback(), s.pathW, s.minPathW, s.strictGap, algoEntryRects(), algoKeepClearBoxes(), algoGridLines(), AlgoPlacement.SPORTS.map(sp => [sp.long, sp.short])]);
}

function algoInputKey() {
  const s = algoState.settings;
  return JSON.stringify([algoSiteKey(), algoState.qty, s.edgeFirst, s.leftoverPath, s.seed]);
}

/** The Site for the packing engine, or throws with what is wrong in words. */
function algoBuildSite() {
  return AlgoPlacement.makeSite({
    zoning: algoZoningOn(),
    foot: algoFootprint(), setback: algoSetback(),
    entries: algoEntryRects(),
    anchors: algoEntryRects(),      // the service modules go to the roof corner nearest an entrance
    keepClear: algoKeepClearBoxes()
  });
}

// ------------------------------------------------------------------------------------------------ the mode switch

function algoSwitchHtml() {
  const on = algoState.mode === "algo";
  return `<div class="placement-switch" role="tablist" aria-label="Placement mode">
    <button role="tab" class="${on ? "" : "active"}" data-placement="manual" aria-selected="${!on}"><i class="ti ti-hand-move" aria-hidden="true"></i>Manual placement</button>
    <button role="tab" class="${on ? "active" : ""}" data-placement="algo" aria-selected="${on}"><i class="ti ti-wand" aria-hidden="true"></i>Algorithmic placement</button>
  </div>`;
}

function algoRenderSwitches() {
  document.querySelectorAll("[data-placement-switch]").forEach(el => { el.innerHTML = algoSwitchHtml(); });
}

function algoSetMode(mode) {
  algoState.mode = mode === "algo" ? "algo" : "manual";
  const panel = document.getElementById("algo-placement");
  if (panel) panel.hidden = algoState.mode !== "algo";
  if (algoState.mode === "algo") {
    if (!algoState.built) algoBuildPanel();
    algoRefreshAll();
    algoSchedulePreview(0);
  } else if (typeof drawCombineCanvas === "function" && typeof activeMode !== "undefined" && activeMode === "combine") {
    if (typeof refreshSuggestions === "function") refreshSuggestions(); else drawCombineCanvas();
  }
  algoRenderSwitches();
}

// ------------------------------------------------------------------------------------------------ the panel

/** The reference-sheet figures under a court's name: footprint, area, active headcount and dead load Gk. The four courts that are not in the sheet say so instead of showing a made-up number. */
function algoSportMeta(sp) {
  const fmt = n => String(Math.round(n * 10) / 10);
  const parts = [`<span title="Footprint">${fmt(sp.long)} × ${fmt(sp.short)} m</span>`, `<span title="Area">${fmt(sp.long * sp.short)} m²</span>`];
  if (sp.headcount == null && !sp.headcountNote && sp.deadLoad == null) {
    parts.push(`<span class="algo-sport-none" title="Headcount and dead load come from the reference sheet, which does not list this court">headcount and dead load: not in the reference sheet</span>`);
  } else {
    const people = sp.headcount != null ? `${sp.headcount} ${sp.headcount === 1 ? "person" : "people"}` : `headcount ${sp.headcountNote}`;
    parts.push(`<span title="Active headcount: people using it at the same time">${algoEsc(people)}</span>`);
    parts.push(`<span title="Characteristic dead load Gk${sp.assumed ? " (assumed value, not from a standard)" : ""}">Gk ${sp.deadLoad.toFixed(2)} kN/m²${sp.assumed ? ' <i class="algo-assumed">assumed</i>' : ""}</span>`);
  }
  return parts.join("");
}

function algoSportRow(sp, i) {
  return `<div class="algo-sport" data-sport="${i}" data-find="${algoEsc((sp.label + " " + sp.name + " " + sp.group).toLowerCase())}">
      <span class="algo-swatch" style="background:${escapeHtml(algoRgb(sp.color))}"></span>
      <span class="algo-sport-name">${algoEsc(sp.label)}</span>
      <span class="algo-qty"><button data-act="qty-" data-i="${i}" aria-label="One fewer ${algoEsc(sp.label)}">−</button><input type="number" min="0" max="30" step="1" data-qty="${i}" value="${escapeHtml(algoState.qty[sp.name] || 0)}" aria-label="How many ${algoEsc(sp.label)}"><button data-act="qty+" data-i="${i}" aria-label="One more ${algoEsc(sp.label)}">+</button></span>
      <span class="algo-dot" data-dot="${i}" title="Checking…"></span>
      <span class="algo-sport-meta">${algoSportMeta(sp)}</span>
    </div>`;
}

/** Narrows the list to the courts whose name or group contains what was typed; a group with nothing left disappears. */
function algoFilterSports(text) {
  const q = String(text || "").trim().toLowerCase();
  document.querySelectorAll("#algo-sports .algo-sport").forEach(r => { r.hidden = !!q && !r.dataset.find.includes(q); });
  document.querySelectorAll("#algo-sports .algo-group").forEach(g => { g.hidden = !g.querySelector(".algo-sport:not([hidden])"); });
}

/** The path rule in words: the zoning rules once the roof has a type, the plain 2 m rule before. */
function algoRuleHintHtml() {
  if (!algoZoningOn()) return `<strong>The rule: every court has a clear path of at least ${ALGO_MIN_PATH_M.toFixed(1)} m all around it, big courts included, so no two courts ever touch.</strong> Each entry point opens a ${ALGO_MIN_PATH_M.toFixed(1)} m or wider way in across the garden band, and the main pathway never narrows below ${ALGO_MIN_PATH_M.toFixed(1)} m. A side that sits on the setback line borders the garden band instead of a path.`;
  return `<strong>Zones:</strong> items of one zone (outdoor, indoor, garden) are placed close together, identical ones side by side and lined up. <strong>Paths, the widest that fits:</strong> 1.8 then 1.5 m inside a zone; 2.5 then 2.0 m for the primary paths outside the zones and between them (the two fields above), starting from the entry points. <strong>Indoor items</strong> ignore the setback and may stand in the garden band; the indoor zone grows from the Locker corner. Outdoor and garden items keep to the setback line.`;
}

/** The list of items for the current roof type, grouped under the headings of ALGO_LISTS. */
function algoSportRowsHtml() {
  return algoListsForRoof().map(l => {
    const rows = l.names.map(n => { const i = AlgoPlacement.SPORTS.findIndex(sp => sp.name === n); return i < 0 ? "" : algoSportRow(AlgoPlacement.SPORTS[i], i); }).join("");
    return rows ? `<div class="algo-group"><h4>${algoEsc(l.heading)}</h4>${rows}</div>` : "";
  }).join("");
}

/** The roof type was set or changed: the list follows it, and what the new type does not offer goes back to zero. */
function algoApplyRoofType() {
  const visible = algoVisibleNames();
  let dropped = false;
  AlgoPlacement.SPORTS.forEach(s => { if (!visible.has(s.name) && algoState.qty[s.name]) { algoState.qty[s.name] = 0; dropped = true; } });
  if (dropped) { algoState.good = Object.assign({}, algoState.qty); algoSave(); }
  if (!algoState.built) return;
  const list = document.getElementById("algo-sports");
  if (list) list.innerHTML = algoSportRowsHtml();
  const find = document.getElementById("algo-find");
  if (find && find.value) algoFilterSports(find.value);
  const hint = document.getElementById("algo-rule-hint");
  if (hint) hint.innerHTML = algoRuleHintHtml();
  if (dropped) algoChanged(); else algoRefreshSummary();
}

function algoBuildPanel() {
  const panel = document.getElementById("algo-placement");
  if (!panel) return;
  algoAdoptSpecifiedSizes();
  const s = algoState.settings;
  const sportRows = algoSportRowsHtml();

  panel.innerHTML = `
    <header class="algo-head">
      <div><h2><i class="ti ti-wand" aria-hidden="true"></i> Algorithmic placement</h2>
        <p class="hint">Say which courts you want; the roof is packed by rules and re-checked live. Apply puts the result on the Combine board, where you can still move any piece by hand.</p></div>
      <div data-placement-switch></div>
    </header>
    <div class="algo-body">
      <div class="algo-left">
        <section class="algo-card"><h3>1 · Site <small id="algo-site-note"></small></h3>
          <p class="hint">The whole roof footprint is available. The pathway network starts at the <strong>entry points</strong> you placed on the roof edge in Manual placement: it crosses the garden band from each door and joins them into one.</p>
          <div id="algo-blocks" class="algo-blocks"></div>
          <div class="algo-row-buttons">
            <button class="btn-export" data-act="back"><i class="ti ti-door-enter" aria-hidden="true"></i>Edit entry points in Manual placement</button>
          </div>
        </section>
        <section class="algo-card"><h3>2 · Settings</h3>
          <div class="algo-grid">
            <label>Garden band / setback (m)<input type="number" id="algo-setback" min="0" max="20" step="0.25" value="${algoSetback()}"></label>
            <label>Primary path, widest (m)<input type="number" id="algo-pathw" min="${ALGO_MIN_PATH_M}" max="6" step="0.25" value="${s.pathW}"></label>
            <label>Primary path, narrowest if needed (m)<input type="number" id="algo-minpath" min="${ALGO_MIN_PATH_M}" max="6" step="0.25" value="${s.minPathW}"></label>
            <label>Search time (s)<input type="number" id="algo-time" min="2" max="60" step="1" value="${s.time}"></label>
            <label>Variation seed<input type="number" id="algo-seed" min="1" max="999" step="1" value="${s.seed}"></label>
          </div>
          <label class="algo-check"><input type="checkbox" id="algo-edge" ${s.edgeFirst ? "checked" : ""}> Courts hug the setback line first (then fill the middle)</label>
          <label class="algo-check"><input type="radio" name="algo-opt" value="1" ${s.leftoverPath ? "checked" : ""}> Option 1: garden only in the setback band; all leftover space is pathway</label>
          <label class="algo-check"><input type="radio" name="algo-opt" value="2" ${s.leftoverPath ? "" : "checked"}> Option 2: garden in the setback band and in the leftover pockets</label>
          <label class="algo-check" id="algo-keepclear-row"><input type="checkbox" id="algo-keepclear" ${s.keepClear ? "checked" : ""}> Keep clear of the openings and equipment from Revit <small id="algo-keepclear-n"></small></label>
          <p class="hint" id="algo-rule-hint">${algoRuleHintHtml()}</p>
          <p class="hint"><strong>Services:</strong> the locker and bathroom modules go, together, in the roof corner nearest an entry point. <strong>Heavy items:</strong> anything with a dead load above ${AlgoPlacement.HEAVY_DEAD_LOAD_KN_M2.toFixed(1)} kN/m² is placed along the structural grid Revit gave for the roof, where it can be; otherwise it is placed anyway and the report says so. A court is only accepted if the live check can place it.</p>
        </section>
        <section class="algo-card"><h3>3 · How many of each court? <small>only courts that fit are accepted</small></h3>
          <p class="algo-dot-legend"><span><i class="algo-dot sel"></i>selected</span><span><i class="algo-dot ok"></i>can be added</span><span><i class="algo-dot no"></i>cannot be added (space or a rule)</span><span><i class="algo-dot"></i>checking</span></p>
          <input type="search" id="algo-find" class="algo-find" placeholder="Find a court or activity ..." aria-label="Find a court or activity" autocomplete="off">
          <div class="algo-sports" id="algo-sports">${sportRows}</div>
        </section>
      </div>
      <div class="algo-right">
        <div class="algo-preview" id="algo-preview"></div>
        <p class="algo-warn" id="algo-warn"></p>
        <p class="algo-summary" id="algo-summary"></p>
        <div class="algo-bar"><div id="algo-bar-fill"></div></div>
        <div class="algo-info">
          <section class="algo-info-box" id="algo-layout-box" aria-label="Layout check"></section>
          <section class="algo-info-box" id="algo-load-box" aria-label="People and load"></section>
        </div>
        <details class="algo-report-full"><summary>Full report (text)</summary><pre class="algo-report" id="algo-report"></pre></details>
        <div class="algo-actions">
          <button class="btn-export primary" data-act="apply" id="algo-apply"><i class="ti ti-check" aria-hidden="true"></i>Apply to Combine</button>
          <button class="btn-export" data-act="shuffle" id="algo-shuffle"><i class="ti ti-arrows-shuffle" aria-hidden="true"></i>Shuffle preview</button>
          <button class="btn-export" data-act="clear-applied"><i class="ti ti-eraser" aria-hidden="true"></i>Clear applied</button>
          <button class="btn-export" data-act="back"><i class="ti ti-hand-move" aria-hidden="true"></i>Back to manual</button>
        </div>
        <label class="algo-check"><input type="checkbox" id="algo-garden" ${s.gardenZones ? "checked" : ""}> Draw the garden (band and pockets) as green roof zones</label>
      </div>
    </div>`;
  algoState.built = true;
  algoBindPanel(panel);
  algoRefreshBlocks();
}

function algoBindPanel(panel) {
  panel.addEventListener("click", e => {
    const sw = e.target.closest("[data-placement]");
    if (sw) { algoSetMode(sw.dataset.placement); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "qty+" || act === "qty-") {
      const sp = AlgoPlacement.SPORTS[Number(b.dataset.i)];
      algoState.qty[sp.name] = Math.max(0, Math.min(30, (algoState.qty[sp.name] || 0) + (act === "qty+" ? 1 : -1)));
      algoSyncQty(); algoChanged();
    } else if (act === "apply") algoApply();
    else if (act === "shuffle") algoShuffle();
    else if (act === "clear-applied") algoClearApplied(true);
    else if (act === "back") algoSetMode("manual");
  });
  panel.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "algo-find") { algoFilterSports(t.value); return; }
    if (t.dataset.qty != null) {
      const sp = AlgoPlacement.SPORTS[Number(t.dataset.qty)];
      algoState.qty[sp.name] = Math.max(0, Math.min(30, Math.round(Number(t.value) || 0)));
      algoChanged();
    }
  });
  panel.addEventListener("change", e => {
    const t = e.target;
    const num = (id, key, lo, hi) => { const v = Number(t.value); if (Number.isFinite(v) && v >= lo && v <= hi) algoState.settings[key] = v; else t.value = algoState.settings[key]; };
    if (t.id === "algo-setback") { const v = Number(t.value); if (Number.isFinite(v) && v >= 0 && v <= 20) algoState.settings.setback = v; else t.value = algoSetback(); }
    else if (t.id === "algo-pathw") num(t.id, "pathW", ALGO_MIN_PATH_M, 6);
    else if (t.id === "algo-minpath") num(t.id, "minPathW", ALGO_MIN_PATH_M, 6);
    else if (t.id === "algo-time") num(t.id, "time", 2, 60);
    else if (t.id === "algo-seed") num(t.id, "seed", 1, 999);
    else if (t.id === "algo-edge") algoState.settings.edgeFirst = t.checked;
    else if (t.name === "algo-opt") algoState.settings.leftoverPath = t.value === "1";
    else if (t.id === "algo-keepclear") algoState.settings.keepClear = t.checked;
    else if (t.id === "algo-garden") { algoState.settings.gardenZones = t.checked; algoSave(); return; }
    else return;
    algoChanged();
  });
}

function algoSyncQty() {
  document.querySelectorAll("#algo-sports [data-qty]").forEach(inp => { inp.value = algoState.qty[AlgoPlacement.SPORTS[Number(inp.dataset.qty)].name] || 0; });
}

/** Something the plan depends on changed: keep the numbers current at once and check the packing a moment later. */
function algoChanged() {
  algoSave();
  algoRefreshSummary();
  algoSchedulePreview(500);
}

function algoSchedulePreview(delay) {
  clearTimeout(algoState.timer);
  algoState.timer = setTimeout(() => { algoState.timer = null; algoPreview(); }, delay);
}

// ------------------------------------------------------------------------------------------------ the entry points (from the Manual board)

/** Kept for the old saved-session format (combineController.js still reads `algo_blocks` from older files); nothing here uses blocks any more. */
function algoNewBlockId() { return `blk_${Date.now()}_${algoState.blockCounter++}`; }

/** How many entry points the plan starts from, or how to add the first one. Named for what it replaced; combineController.js calls it after a load. */
function algoRefreshBlocks() {
  const box = document.getElementById("algo-blocks");
  if (!box) return;
  const n = (combineState.entryPoints || []).length;
  box.innerHTML = n
    ? `<p class="algo-entries"><i class="ti ti-door-enter" aria-hidden="true"></i> ${n} entry point${n === 1 ? "" : "s"} on the roof edge, taken from Manual placement.</p>`
    : `<p class="algo-empty">No entry point yet. Place at least one on the roof edge in Manual placement (Rules tab, ⚙, Add Entry Point): the pathways start from them.</p>`;
  const kc = document.getElementById("algo-keepclear-n");
  if (kc) { const n = combineState.roofFeatures ? (combineState.roofFeatures.openings || []).length + (combineState.roofFeatures.equipment || []).length : 0; kc.textContent = n ? `(${n} from Revit)` : "(none pushed)"; }
}

// ------------------------------------------------------------------------------------------------ the live check (the Rhino form's do_preview)

async function algoPreview(msg) {
  if (algoState.mode !== "algo") return;
  if (algoAdoptSpecifiedSizes() && algoState.built) { algoState.plan = null; algoState.planKey = ""; algoState.fit = null; algoState.fitKey = ""; algoBuildPanel(); }   // the Sport panel changed a court's specification
  const token = ++algoState.token;
  algoState.msg = msg || "";
  const ready = (combineState.entryPoints || []).length > 0;
  if (!ready) {
    algoState.plan = null; algoState.site = null; algoState.planKey = "";
    algoState.status = "Place an entry point on the roof edge in Manual placement to begin.";
    algoDrawPreview(); algoRefreshAll();
    return;
  }
  let site;
  try { site = algoBuildSite(); } catch (ex) {
    algoState.plan = null; algoState.site = null; algoState.planKey = "";
    algoState.msg = "Problem: " + ex.message; algoState.status = "";
    algoDrawPreview(); algoRefreshAll();
    return;
  }
  algoState.site = site;
  const fit = algoFit(site);
  const qty = algoState.qty, good = algoState.good;
  const added = AlgoPlacement.SPORTS.filter(s => (qty[s.name] || 0) > (good[s.name] || 0)).map(s => s.name);
  for (const n of added) {                                                    // 1) can never fit on this roof
    if (fit.sports[n]) return algoRevert("Not added - " + algoLabel(n) + ": " + fit.sports[n] + ".");
  }
  const total = AlgoPlacement.SPORTS.reduce((sum, s) => sum + (qty[s.name] || 0) * s.long * s.short, 0);
  if (added.length && total > AlgoPlacement.BUILT_LIMIT_PCT / 100 * site.usableArea) return algoRevert("Not added - the courts would cover more than " + AlgoPlacement.BUILT_LIMIT_PCT + "% of the sports area.");   // 2) too much area
  const key = algoInputKey();
  if (algoState.plan && algoState.planKey === key) { algoDrawPreview(); algoRefreshAll(); return; }   // nothing changed

  algoState.busy = true; algoState.progress = 0; algoState.status = "Checking the layout ...";     // 3) the real packing test
  algoRefreshAll();
  let plan;
  try {
    plan = await AlgoPlacement.planLayout(site, algoRequests(), Object.assign(algoPlanSettings(), { timeLimit: Math.max(1.5, algoState.settings.time * 0.3) }), {
      cancelled: () => token !== algoState.token,
      onProgress: p => { algoState.progress = p.attempts / p.limit; algoState.status = `Checking the layout ... attempt ${p.attempts}`; algoRefreshProgress(); },
      yieldFn: () => new Promise(res => setTimeout(res, 0))
    });
  } catch (ex) {
    if (ex && ex.cancelled) return;                                            // a newer check took over
    algoState.busy = false; algoState.msg = "Problem: " + (ex && ex.message ? ex.message : ex); algoRefreshAll();
    return;
  }
  if (token !== algoState.token) return;
  algoState.busy = false;
  if (plan.unplaced.length) {
    const counts = {};
    plan.courts.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
    if (added.length) {
      const un = plan.unplaced.filter(u => added.includes(u.name))[0] || plan.unplaced[0];
      // several courts added at once: keep the ones that did fit (never fewer than before), refuse the rest with the reason
      const keep = {};
      AlgoPlacement.SPORTS.forEach(s => { keep[s.name] = Math.max(good[s.name] || 0, Math.min(qty[s.name] || 0, counts[s.name] || 0)); });
      const grew = AlgoPlacement.SPORTS.some(s => keep[s.name] > (good[s.name] || 0));
      if (grew && added.length > 1) {
        algoState.good = keep; algoState.qty = Object.assign({}, keep);
        algoSyncQty(); algoSave();
        return algoPreview("Not added - " + algoLabel(un.name) + ": " + un.reason + ". The other courts you added were kept.");
      }
      return algoRevert("Not added - " + algoLabel(un.name) + ": " + un.reason + ". Previous selection restored.");
    }
    // the site changed (a block moved, a setting changed, ...) and not everything you chose fits any more. Say so and leave it at that - the choice stays exactly as
    // typed, so moving the block back (or loosening a setting) brings the same numbers straight back, instead of you having to re-enter them from scratch.
    const short = Object.keys(qty).filter(n => (qty[n] || 0) > (counts[n] || 0)).map(n => algoLabel(n) + " x" + ((qty[n] || 0) - (counts[n] || 0)));
    algoState.msg = "Does not fit with the site as it is now (nothing was removed from your selection): " + short.join(", ") + ". See \"NOT placed\" in the report below.";
    algoState.plan = plan; algoState.planKey = algoInputKey();
    algoState.status = "PREVIEW - not on the board yet. Press Apply to Combine when you are happy.";
    algoDrawPreview(); algoRefreshAll();
    return;
  }
  algoState.good = Object.assign({}, algoState.qty);
  algoState.plan = plan; algoState.planKey = algoInputKey();
  algoState.status = "PREVIEW - not on the board yet. Press Apply to Combine when you are happy.";
  algoSave();
  algoDrawPreview(); algoRefreshAll();
}

function algoRevert(msg) {
  algoState.qty = Object.assign({}, algoState.good);
  algoSyncQty(); algoSave();
  return algoPreview(msg);
}

function algoPlanSettings() {
  const s = algoState.settings;
  const zoning = algoZoningOn();
  const clamp = v => Math.min(ALGO_PRIMARY_MAX_M, Math.max(ALGO_MIN_PATH_M, v));        // zoning: the primary path is 2.0 to 2.5 m, the widest that fits
  return { pathW: zoning ? clamp(s.pathW) : Math.max(ALGO_MIN_PATH_M, s.pathW), minPathW: zoning ? clamp(s.minPathW) : Math.max(ALGO_MIN_PATH_M, s.minPathW), ring: s.ring, seed: s.seed, edgeFirst: s.edgeFirst, leftoverPath: s.leftoverPath, strictGap: true, courtGap: ALGO_MIN_PATH_M, zoning, rules: { serviceCorners: true, gridLines: algoGridLines() } };
}

function algoFit(site) {
  const key = algoSiteKey();
  if (algoState.fit && algoState.fitKey === key) return algoState.fit;
  const s = algoState.settings;
  algoState.fit = AlgoPlacement.fitCheck(site, Math.max(ALGO_MIN_PATH_M, Math.min(s.minPathW, s.pathW)), s.ring, true, ALGO_MIN_PATH_M, { zoning: algoZoningOn() });
  algoState.fitKey = key;
  return algoState.fit;
}

async function algoShuffle() {
  if (!algoState.site || !algoState.plan) return;
  const reqs = algoRequests();
  if (!reqs.length) { algoState.msg = "Select at least one court first."; algoRefreshAll(); return; }
  const key = algoInputKey();
  if (algoState.seenKey !== key) { algoState.seen = new Set([algoState.plan.signature]); algoState.seenKey = key; algoState.shuffleN = 0; }      // the layout on screen counts as seen: the first shuffle differs from it
  algoState.shuffleN++;
  const token = ++algoState.token;
  algoState.busy = true; algoState.status = "Shuffling ..."; algoState.progress = 0; algoRefreshAll();
  try {
    const plan = await AlgoPlacement.planLayout(algoState.site, reqs, Object.assign(algoPlanSettings(), { timeLimit: algoState.settings.time, shuffle: true, variant: algoState.shuffleN, seen: algoState.seen }), {
      cancelled: () => token !== algoState.token,
      onProgress: p => { algoState.progress = p.attempts / p.limit; algoState.status = `Shuffling ... ${p.attempts} of ${p.limit}`; algoRefreshProgress(); },
      yieldFn: () => new Promise(res => setTimeout(res, 0))
    });
    if (token !== algoState.token) return;
    algoState.busy = false;
    if (plan.unplaced.length) { algoState.msg = "Shuffle could not find another arrangement that places every court. Press it again."; algoRefreshAll(); return; }
    algoState.seen.add(plan.signature);
    algoState.plan = plan; algoState.planKey = key; algoState.msg = "";
    algoState.status = "PREVIEW - Shuffle #" + algoState.shuffleN + (plan.isNew ? "" : "  (same as one shown before - press Shuffle again)");
    algoDrawPreview(); algoRefreshAll();
  } catch (ex) {
    if (ex && ex.cancelled) return;
    algoState.busy = false; algoState.msg = "Shuffle failed: " + (ex && ex.message ? ex.message : ex); algoRefreshAll();
  }
}

// ------------------------------------------------------------------------------------------------ what is shown

function algoRefreshProgress() {
  const fill = document.getElementById("algo-bar-fill");
  const sum = document.getElementById("algo-summary");
  if (algoState.busy && fill) { fill.style.width = Math.round(algoState.progress * 100) + "%"; fill.classList.add("busy"); }
  if (algoState.busy && sum) sum.textContent = algoState.status;
}

function algoRefreshSummary() {
  const sum = document.getElementById("algo-summary"), fill = document.getElementById("algo-bar-fill");
  algoRenderLoadBox();
  if (!sum || !fill) return;
  const total = AlgoPlacement.SPORTS.reduce((s, sp) => s + (algoState.qty[sp.name] || 0) * sp.long * sp.short, 0);
  const count = AlgoPlacement.SPORTS.reduce((s, sp) => s + (algoState.qty[sp.name] || 0), 0);
  const u = algoState.site ? algoState.site.usableArea : null;
  fill.classList.remove("busy");
  if (u) {
    const pct = 100 * total / u;
    sum.textContent = `${count} courts = ${total.toFixed(0)} m² of ${u.toFixed(0)} m² sports area (${pct.toFixed(0)}%).`;
    sum.className = "algo-summary " + (pct <= AlgoPlacement.BUILT_LIMIT_PCT ? "ok" : "bad");
    fill.style.width = Math.min(100, pct) + "%";
    fill.className = pct <= AlgoPlacement.BUILT_LIMIT_PCT ? "" : "bad";
  } else {
    sum.textContent = `${count} courts = ${total.toFixed(0)} m²`;
    sum.className = "algo-summary";
    fill.style.width = "0%";
  }
}

/** The packing engine still speaks of lifts, stairs and ramps (its "entries"); on screen those are the entry points from the Manual board. */
function algoEntryWords(text) {
  return String(text || "")
    .replace(/Vertical circulation #(\d+) has no free landing \(it sits on\/inside the garden band\)\. Try a smaller setback\./g,
      "Entry point $1 has no way in: the area just inside the door is garden band (it is close to a corner of the roof). Move it along the edge, or use a smaller setback.")
    .replace(/around lifts, stairs and ramps/g, "from the entry points")
    .replace(/\ban? (lift|stair)\s*(\/|or)\s*(lift|stair)\b/gi, "an entry point")
    .replace(/lifts?\s*(\/|,)\s*(ramps?|stairs?)(\s*(\/|,|and)\s*(stairs?|ramps?))?/gi, "entry points");
}

/**
 * The dot beside every item: blue = already chosen; red = cannot be added (the fit check says it never fits this roof, or one more of it does not fit beside
 * what is chosen now); green = one of it can be added to the current selection; grey = still being checked. The green/red for items not yet chosen come
 * from algoProbeAvailability, which re-plans the current selection plus that one item, one item at a time, after every change.
 */
function algoRefreshDots() {
  const fit = algoState.fit, av = algoState.avail || {};
  AlgoPlacement.SPORTS.forEach((sp, i) => {
    const el = document.querySelector(`[data-dot="${i}"]`);
    if (!el) return;
    let cls = "", tip = "Checking whether it can be added…";
    if ((algoState.qty[sp.name] || 0) > 0) { cls = "sel"; tip = "Selected"; }
    else if (fit && fit.sports[sp.name]) { cls = "no"; tip = "Cannot be added: " + algoEntryWords(fit.sports[sp.name]); }
    else if (av[sp.name] && av[sp.name].key === algoState.probeKey) { cls = av[sp.name].ok ? "ok" : "no"; tip = av[sp.name].ok ? "Can be added to the current selection" : "Cannot be added: " + av[sp.name].why; }
    el.className = "algo-dot" + (cls ? " " + cls : "");
    el.title = tip;
  });
}

/** Tests, one item at a time and in the background, whether one of each unchosen item fits beside the current selection (for algoRefreshDots). */
async function algoProbeAvailability() {
  if (algoState.mode !== "algo" || !algoState.site || !algoState.plan || algoState.busy) return;
  const key = algoInputKey();
  if (algoState.probeKey === key && algoState.probing) return;
  algoState.probeKey = key; algoState.probing = true;
  algoState.avail = algoState.avail || {};
  const tok = (algoState.probeToken = (algoState.probeToken || 0) + 1);
  const site = algoState.site, base = algoRequests(), fit = algoState.fit;
  // the path may narrow down to the minimum, exactly as the preview would when the item is added
  const settings = Object.assign({}, algoPlanSettings(), { pathW: algoState.plan.stats.pathW, timeLimit: 0.4 });
  const visible = algoVisibleNames();
  const total = AlgoPlacement.SPORTS.reduce((sum, s) => sum + (algoState.qty[s.name] || 0) * s.long * s.short, 0);
  for (const sp of AlgoPlacement.SPORTS) {
    if (!visible.has(sp.name) || (algoState.qty[sp.name] || 0) > 0 || (fit && fit.sports[sp.name])) continue;
    const cached = algoState.avail[sp.name];
    if (cached && cached.key === key) continue;
    let ok = false, why = "";
    if (total + sp.long * sp.short > AlgoPlacement.BUILT_LIMIT_PCT / 100 * site.usableArea) why = "the courts would cover more than " + AlgoPlacement.BUILT_LIMIT_PCT + "% of the sports area";
    else {
      try {
        const plan = await AlgoPlacement.planLayout(site, base.concat([{ name: sp.name, w: sp.long, h: sp.short }]), settings);
        ok = !plan.unplaced.length && !plan.issues.length;
        if (!ok) why = plan.unplaced.length ? (base.length ? "no room left beside the items already chosen" : algoEntryWords(plan.unplaced[0].reason)) : algoEntryWords(plan.issues[0]);
      } catch (e) { why = "could not be checked"; }
    }
    if (tok !== algoState.probeToken || algoInputKey() !== key) { algoState.probing = false; return; }        // the selection changed meanwhile: a newer check takes over
    algoState.avail[sp.name] = { key, ok, why };
    algoRefreshDots();
    await new Promise(r => setTimeout(r, 0));                                                                 // let the page breathe between items
  }
  if (tok === algoState.probeToken) algoState.probing = false;
}

function algoRefreshFit() {
  const fit = algoState.fit;
  const lines = fit ? fit.notes.slice() : [];
  AlgoPlacement.SPORTS.forEach((sp, i) => {
    const reason = fit ? fit.sports[sp.name] : "";          // shown by the row's red dot (algoRefreshDots); only the warning box below still lists it for a chosen item
    if (reason && (algoState.qty[sp.name] || 0) > 0) lines.push(sp.label + ": " + reason);
  });
  const warn = document.getElementById("algo-warn");
  if (warn) {
    const block = lines.length ? "WARNING - these cannot be placed with the current settings:\n" + lines.join("\n") : "";
    warn.textContent = algoEntryWords([algoState.msg, block].filter(Boolean).join("\n"));
  }
  algoRefreshDots();
}

function algoRefreshAll() {
  algoRenderSwitches();
  algoRefreshSummary();
  algoRefreshFit();
  const rep = document.getElementById("algo-report");
  if (rep) {
    if (algoState.plan && algoState.site) rep.textContent = algoEntryWords(algoState.status + "\n" + AlgoPlacement.buildReport(algoState.plan, algoState.site));
    else rep.textContent = algoState.status || "Place an entry point on the roof edge in Manual placement to begin.";
  }
  algoRenderLayoutBox();
  algoRenderLoadBox();
  const apply = document.getElementById("algo-apply"), shuffle = document.getElementById("algo-shuffle");
  const can = !!(algoState.plan && algoState.plan.courts.length) && !algoState.busy;
  if (apply) apply.disabled = !can;
  if (shuffle) shuffle.disabled = !(algoState.plan && !algoState.busy);
  const sports = document.getElementById("algo-sports");
  if (sports) sports.classList.toggle("disabled", !(combineState.entryPoints || []).length);
  algoRefreshBlocks();
  algoRefreshSiteNote();
  const inp = document.getElementById("algo-setback");
  if (inp && document.activeElement !== inp) inp.value = algoSetback();
  algoRefreshProgress();
  if (!algoState.busy) { const fill = document.getElementById("algo-bar-fill"); if (fill) fill.classList.remove("busy"); }
  // once a layout for the current selection stands, find out (in the background) which items could still be added beside it: the list's green / red dots
  if (!algoState.busy && algoState.plan && algoState.planKey === algoInputKey()) setTimeout(algoProbeAvailability, 50);
}

/** Left box under the plan: the layout check at a glance (tiles, check chips, one short line per rule), from the same plan the text report describes. */
function algoRenderLayoutBox() {
  const box = document.getElementById("algo-layout-box");
  if (!box) return;
  const plan = algoState.plan, site = algoState.site;
  const head = `<h4><i class="ti ti-layout-grid" aria-hidden="true"></i>Layout check</h4>`;
  if (!plan || !site) { box.innerHTML = head + `<p class="algo-info-empty">${algoEsc(algoState.status || "Place an entry point on the roof edge in Manual placement to begin.")}</p>`; return; }
  const s = plan.stats, u = site.usableArea, lim = AlgoPlacement.BUILT_LIMIT_PCT;
  const pct = 100 * s.courtArea / u;
  const band = Math.max(0, site.footArea - u);
  const garden = band + (s.leftoverPath ? 0 : s.pocketArea);
  const tile = (label, value, sub, cls) => `<div class="algo-tile ${cls || ""}"><span class="algo-tile-label">${algoEsc(label)}</span><span class="algo-tile-value">${value}</span>${sub ? `<span class="algo-tile-sub">${sub}</span>` : ""}</div>`;
  const meter = `<span class="algo-meter" title="Limit ${lim}%"><span style="width:${Math.min(100, pct / lim * 100).toFixed(0)}%"></span></span>`;
  const tiles = [
    tile("Courts placed", `${s.placed}<small> / ${s.requested}</small>`, s.placed < s.requested ? "some did not fit" : "all placed", s.placed < s.requested ? "bad" : "ok"),
    tile("Sports area used", `${pct.toFixed(0)}<small>%</small>`, meter + `${s.courtArea.toFixed(0)} of ${u.toFixed(0)} m² · limit ${lim}%`, pct > lim ? "bad" : ""),
    tile("Main path", `${s.pathW.toFixed(1)}<small> m</small>`, plan.narrowed ? `narrowed from ${plan.pathWReq.toFixed(1)} m` : "widest setting", plan.narrowed ? "warn" : ""),
    tile("Paths", `${(s.pathArea + s.secArea).toFixed(0)}<small> m²</small>`, `primary ${s.pathArea.toFixed(0)} · in-zone ${s.secArea.toFixed(0)} m²`),
    tile("Garden", `${garden.toFixed(0)}<small> m²</small>`, s.leftoverPath ? "setback band only" : `band ${band.toFixed(0)} + pockets ${s.pocketArea.toFixed(0)} m²`)
  ].join("");
  const zn = plan.zoning;
  const chip = (ok, text) => `<span class="algo-chip ${ok ? "ok" : "bad"}"><i class="ti ti-${ok ? "check" : "x"}" aria-hidden="true"></i>${algoEsc(text)}</span>`;
  let chips;
  if (plan.issues.length) chips = plan.issues.map(i => chip(false, algoEntryWords(i))).join("");
  else if (zn) chips = [chip(true, `${zn.zoneGapM.toFixed(1)} m in-zone paths`), chip(true, `${zn.crossGapM.toFixed(1)} m between zones`), chip(true, `${zn.entryGapM.toFixed(1)} m from entry points`), chip(true, "setback kept"), chip(true, "paths connected"),
    `<span class="algo-chip ${plan.notAligned && plan.notAligned.length ? "warn" : "ok"}"><i class="ti ti-${plan.notAligned && plan.notAligned.length ? "alert-triangle" : "check"}" aria-hidden="true"></i>${plan.notAligned && plan.notAligned.length ? "not aligned: " + algoEsc(plan.notAligned.map(n => AlgoPlacement.labelOf(n)).join(", ")) : "items aligned"}</span>`].join("");
  else chips = chip(true, "paths and gaps checked");
  // the rule lines (services, heavy items, indoor zone) come from the text report, shortened
  const text = AlgoPlacement.buildReport(plan, site).split("\n");
  const pick = (prefix, icon) => text.filter(l => l.startsWith(prefix)).map(l => `<li><i class="ti ti-${icon}" aria-hidden="true"></i><span>${algoEsc(algoEntryWords(l))}</span></li>`).join("");
  const rows = pick("Services:", "door") + pick("Heavy items", "weight") + pick("Indoor zone:", "home");
  const bad = plan.unplaced.map(x => `<li class="bad"><i class="ti ti-circle-x" aria-hidden="true"></i><span>${algoEsc(AlgoPlacement.labelOf(x.name))}: ${algoEsc(algoEntryWords(x.reason))}</span></li>`).join("")
    + plan.warnings.map(w => `<li class="warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><span>${algoEsc(algoEntryWords(w))}</span></li>`).join("");
  const status = algoState.busy ? `<p class="algo-info-status">${algoEsc(algoState.status)}</p>` : "";
  box.innerHTML = head + status + `<div class="algo-tiles">${tiles}</div><div class="algo-chips">${chips}</div>` + (rows || bad ? `<ul class="algo-rule-rows">${bad}${rows}</ul>` : "");
}

/** Right box under the plan: who and what the current selection (the quantities chosen, live, placed or not) brings onto the roof. */
function algoRenderLoadBox() {
  const box = document.getElementById("algo-load-box");
  if (!box) return;
  const chosen = AlgoPlacement.SPORTS.filter(sp => (algoState.qty[sp.name] || 0) > 0);
  const head = `<h4><i class="ti ti-users" aria-hidden="true"></i>People &amp; load <small>live, from the selection</small></h4>`;
  if (!chosen.length) { box.innerHTML = head + `<p class="algo-info-empty">Choose courts on the left to see the headcount and dead load.</p>`; return; }
  let people = 0, kn = 0, area = 0;
  const noPeople = [], noLoad = [];
  const rows = chosen.map(sp => {
    const q = algoState.qty[sp.name], a = sp.long * sp.short * q;
    area += a;
    const p = sp.headcount != null ? sp.headcount * q : null;
    const k = sp.deadLoad != null ? sp.deadLoad * a : null;
    if (p != null) people += p; else if (!sp.service) noPeople.push(sp.label);
    if (k != null) kn += k; else noLoad.push(sp.label);
    return `<tr><td>${algoEsc(sp.label)}${q > 1 ? ` <small>× ${q}</small>` : ""}</td><td>${p != null ? p : `<span class="algo-na" title="${sp.service ? "services: no players of their own" : "not in the reference sheet"}">–</span>`}</td><td>${k != null ? k.toFixed(0) : `<span class="algo-na" title="not in the reference sheet">–</span>`}</td></tr>`;
  }).join("");
  const avg = area > 0 ? kn / area : 0;
  const notes = [];
  if (noPeople.length) notes.push(`Not counted (no headcount in the reference sheet): ${noPeople.join(", ")}.`);
  if (noLoad.length) notes.push(`No dead load in the reference sheet: ${noLoad.join(", ")}.`);
  box.innerHTML = head + `<div class="algo-tiles two">
      <div class="algo-tile"><span class="algo-tile-label">Total headcount</span><span class="algo-tile-value">${people}<small> people</small></span><span class="algo-tile-sub">active at the same time</span></div>
      <div class="algo-tile"><span class="algo-tile-label">Total dead load</span><span class="algo-tile-value">${kn.toFixed(0)}<small> kN</small></span><span class="algo-tile-sub">Σ Gk × footprint · avg ${avg.toFixed(2)} kN/m² over ${area.toFixed(0)} m²</span></div>
    </div>
    <table class="algo-load-table"><thead><tr><th>Item</th><th>People</th><th>Gk (kN)</th></tr></thead><tbody>${rows}</tbody></table>`
    + (notes.length ? `<p class="algo-info-note">${algoEsc(notes.join(" "))}</p>` : "");
}

/** The roof under "1 · Site": its size, and what it is (Sports Core / Garden Core / Mixed, chosen in the Site tab) or a way to say so. */
function algoRefreshSiteNote() {
  const note = document.getElementById("algo-site-note");
  if (!note) return;
  const roof = combineState.roof;
  const program = typeof getRoofProgram === "function" ? getRoofProgram() : null;
  const size = `roof ${roof.length} × ${roof.width} m${roof.boundary && roof.boundary.length >= 3 ? ", outline from Revit" : ""}`;
  note.innerHTML = `${algoEsc(size)} · ${program ? algoEsc(program.label) : '<button type="button" class="btn-link" data-roof-type-open>roof type not set</button>'}`;
}

/** The plan drawn as SVG in metres, in the roof's own orientation (the Rhino form's preview). */
function algoDrawPreview() {
  const host = document.getElementById("algo-preview");
  if (!host) return;
  const site = algoState.site, plan = algoState.plan;
  if (!site) {
    host.innerHTML = `<div class="algo-preview-empty">${algoEsc(algoState.status || "Place an entry point on the roof edge in Manual placement to see the live preview.")}</div>`;
    return;
  }
  const b = site.bbox, pad = Math.max(1.2, (b.x1 - b.x0) * 0.025);
  const vx = b.x0 - pad, vy = b.y0 - pad * 1.6, vw = b.x1 - b.x0 + 2 * pad, vh = b.y1 - b.y0 + pad * 3.2;
  const fs = Math.max(0.7, Math.min(2.2, Math.min(vw, vh) / 22));
  const R = algoRound;
  const rect = (r, fill, extra) => `<rect x="${R(r[0])}" y="${R(r[1])}" width="${R(r[2] - r[0])}" height="${R(r[3] - r[1])}" fill="${fill}" ${extra || ""}/>`;
  const C = AlgoPlacement;
  // plan palette: warm paving, a garden with a leaf-dot texture, a pale indoor floor, and the roof edge in dark slate
  const PAVE = "#dcd8cf", GARDEN = "#9fcd84", GARDEN_DOT = "#86b86b", FLOOR = "#eef2f8", EDGE = "#2f3542", WALL = "#2f3542", ZONE = "#1e3a8a";
  const shade = (rgb, f) => `rgb(${rgb.map(v => Math.round(v * f)).join(",")})`;
  // a path rect gets a hairline of its own colour, so neighbouring rects meet without a seam
  const pave = r => rect(r, PAVE, `stroke="${PAVE}" stroke-width="0.06" shape-rendering="crispEdges"`);
  const garden = r => rect(r, "url(#algo-garden)");
  let g = `<defs>
      <pattern id="algo-garden" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="${GARDEN}"/><circle cx="0.3" cy="0.3" r="0.13" fill="${GARDEN_DOT}"/><circle cx="0.9" cy="0.9" r="0.13" fill="${GARDEN_DOT}"/></pattern>    </defs>`;
  g += `<polygon points="${site.foot.map(p => p.join(",")).join(" ")}" fill="url(#algo-garden)"/>`;                    // the garden band
  site.usableRects.forEach(r => { g += rect(r, "#fbfaf7", 'stroke="#fbfaf7" stroke-width="0.06"'); });              // the usable zone
  const band = (plan && plan.bandRects) || site.bandRects;                                                           // with zoning, less the indoor items standing in it
  if (band.length && site.entries.length) band.forEach(r => { g += garden(r); });
  if (plan) {
    plan.pockets.forEach(r => { g += garden(r); });
    plan.pathRects.forEach(r => { g += pave(r); });
  }
  // The entrances: each way in across the garden band as pathway (the door's arrow is drawn on top, below)
  site.entries.forEach(r => { g += pave(r); });
  if (plan && plan.indoorZone) {                                                                                       // the indoor zone: walls round it, so no garden inside
    const z = plan.indoorZone;
    g += rect(z, FLOOR, `stroke="${FLOOR}" stroke-width="0.06"`);                                                      // its own floor, over the band and paths inside it
    if (plan.wall) {
      // a real wall (its thickness centred on the zone line), the door left open with its swing drawn as in a plan
      g += `<g pointer-events="none">` + plan.wall.rects.map(r => rect(r, WALL, 'shape-rendering="crispEdges"')).join("") + `</g>`;
      const d = plan.wall.door, horiz = Math.abs(d.x1 - d.x0) >= Math.abs(d.y1 - d.y0);
      const w = horiz ? Math.abs(d.x1 - d.x0) : Math.abs(d.y1 - d.y0);
      const mx = (d.x0 + d.x1) / 2, my = (d.y0 + d.y1) / 2, zc = [(z[0] + z[2]) / 2, (z[1] + z[3]) / 2];
      const out = horiz ? Math.sign(my - zc[1]) || 1 : Math.sign(mx - zc[0]) || 1;                                     // the door opens outward, onto the path
      const hx = horiz ? Math.min(d.x0, d.x1) : mx, hy = horiz ? my : Math.min(d.y0, d.y1);                        // hinge at one end of the opening
      const lx = horiz ? hx : hx + out * w, ly = horiz ? hy + out * w : hy;                                        // the open leaf's far end
      const ex = horiz ? hx + w : hx, ey = horiz ? hy : hy + w;                                                    // the closed position's far end
      const sweep = horiz ? (out > 0 ? 0 : 1) : (out > 0 ? 1 : 0);
      g += `<g pointer-events="none" fill="none" stroke="${WALL}" stroke-width="0.07"><line x1="${R(hx)}" y1="${R(hy)}" x2="${R(lx)}" y2="${R(ly)}"/><path d="M${R(lx)},${R(ly)} A${R(w)},${R(w)} 0 0 ${sweep} ${R(ex)},${R(ey)}" stroke-dasharray="0.18 0.14"/></g>`;
    } else {
      g += `<g pointer-events="none"><rect x="${R(z[0])}" y="${R(z[1])}" width="${R(z[2] - z[0])}" height="${R(z[3] - z[1])}" fill="none" stroke="${ZONE}" stroke-width="0.22" stroke-dasharray="0.9 0.6"/></g>`;
    }
    const lw = fs * 0.62 * 6.8, lh = fs * 0.95, ly0 = z[1] - lh - 0.35;                                           // the zone's name in a small tag above it
    g += `<g pointer-events="none"><rect x="${R(z[0])}" y="${R(ly0)}" width="${R(lw)}" height="${R(lh)}" rx="${R(lh / 2)}" fill="${ZONE}"/><text x="${R(z[0] + lw / 2)}" y="${R(ly0 + lh * 0.72)}" text-anchor="middle" font-size="${R(fs * 0.62)}" font-weight="700" fill="#fff">Indoor zone</text></g>`;
  }
  site.keepClear.forEach(r => { g += rect(r, "rgba(220,38,38,0.16)", 'stroke="#dc2626" stroke-width="0.12" stroke-dasharray="0.5 0.3"') + `<title>Kept clear (opening or equipment from Revit)</title>`; });
  if (plan) plan.courts.forEach(c => {
    const sp = C.SPORTS.find(s => s.name === c.name), r = c.rect;
    const w = r[2] - r[0], h = r[3] - r[1], cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, word = c.name.split(" ")[0];
    const small = w < fs * (word.length * 0.62 + 1) && h < fs * (word.length * 0.62 + 1);
    const tf = small ? fs * 0.7 : fs, halo = "";
    // text colour by the item's own brightness: white on dark items, near-black on light ones
    const lum = (0.299 * sp.color[0] + 0.587 * sp.color[1] + 0.114 * sp.color[2]) / 255;
    const ink = lum < 0.5 ? "#ffffff" : "#141414", inkSoft = lum < 0.5 ? "rgba(255,255,255,0.88)" : "#2b2b2b";
    const isCourt = sp.group === "Courts" && Math.min(w, h) > 4;
    // faint court lines: an inner boundary and the half-way line across the long side
    const inset = Math.min(w, h) * 0.08;
    const lines = isCourt ? `<rect x="${R(r[0] + inset)}" y="${R(r[1] + inset)}" width="${R(w - 2 * inset)}" height="${R(h - 2 * inset)}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="0.12"/>`
      + (w >= h ? `<line x1="${R(cx)}" y1="${R(r[1] + inset)}" x2="${R(cx)}" y2="${R(r[3] - inset)}" stroke="#fff" stroke-opacity="0.55" stroke-width="0.12"/>`
                : `<line x1="${R(r[0] + inset)}" y1="${R(cy)}" x2="${R(r[2] - inset)}" y2="${R(cy)}" stroke="#fff" stroke-opacity="0.55" stroke-width="0.12"/>`) : "";
    const dims = !small && h > tf * 3.4 && w > tf * 5.5 ? `<text x="${R(cx)}" y="${R(cy + tf * 1.35)}" text-anchor="middle" font-size="${R(tf * 0.8)}" font-weight="600" fill="${inkSoft}" ${halo}>${escapeHtml(c.long)} × ${escapeHtml(c.short)} m</text>` : "";
    const ty = dims ? cy - tf * 0.05 : cy + tf * 0.35;
    g += `<g pointer-events="none"><rect x="${R(r[0])}" y="${R(r[1])}" width="${R(w)}" height="${R(h)}" rx="0.25" fill="${escapeHtml(algoRgb(sp.color))}" stroke="${escapeHtml(shade(sp.color, 0.55))}" stroke-width="0.14"/>${lines}
      <text x="${R(cx)}" y="${R(ty)}" text-anchor="middle" font-size="${R(tf)}" font-weight="700" fill="${ink}" ${halo}>${algoEsc(word)}</text>${dims}
      <title>${algoEsc(sp.label)} ${c.long} × ${escapeHtml(c.short)} m${c.rotated ? ", turned 90°" : ""}${c.onEdge ? ", on the setback line" : ""}</title></g>`;
  });
  g += `<polygon points="${site.foot.map(p => p.join(",")).join(" ")}" fill="none" stroke="${EDGE}" stroke-width="0.3" stroke-linejoin="miter" pointer-events="none"/>`;
  // the doors: an arrow pointing in, on the roof edge (moved on the Manual board, not here)
  (combineState.entryPoints || []).forEach(ep => {
    const [nx, ny] = typeof entryInwardNormal === "function" ? entryInwardNormal(ep) : [0, 1];
    const tx = -ny, ty = nx, a = fs * 0.6;
    const p = (s, t) => `${R(ep.x_m + tx * s + nx * t)},${R(ep.y_m + ty * s + ny * t)}`;
    g += `<g pointer-events="none"><path d="M${p(-a, -a * 0.35)} L${p(0, a * 1.3)} L${p(a, -a * 0.35)} L${p(0, a * 0.35)} Z" fill="#f59e0b" stroke="#78350f" stroke-width="0.09" stroke-linejoin="round"/><title>Entry point</title></g>`;
  });
  // a 10 m scale bar under the roof's bottom-left corner
  const sbx = b.x0, sby = b.y1 + pad * 0.9, seg = 5;
  g += `<g pointer-events="none">${[0, 1].map(i => rect([sbx + i * seg, sby, sbx + (i + 1) * seg, sby + 0.35], i ? "#fff" : EDGE, `stroke="${EDGE}" stroke-width="0.07"`)).join("")}`
    + [0, 5, 10].map(m => `<text x="${R(sbx + m)}" y="${R(sby + 0.35 + fs * 0.7)}" text-anchor="middle" font-size="${R(fs * 0.55)}" fill="${EDGE}">${m}${m === 10 ? " m" : ""}</text>`).join("") + `</g>`;
  host.innerHTML = `<svg id="algo-svg" viewBox="${R(vx)} ${R(vy)} ${R(vw)} ${R(vh)}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${R(vw / vh)}" role="img" aria-label="Preview of the packed roof">${g}</svg>`;
}

// ------------------------------------------------------------------------------------------------ apply to Combine

/** The piece's own (unrotated) length and width: the packer's long and short side, in the specification's orientation for a specified sport (see algoAdoptSpecifiedSizes). */
function algoItemFrame(sp) {
  return sp.swap ? { length_m: sp.short, width_m: sp.long } : { length_m: sp.long, width_m: sp.short };
}

function algoCatalogueSource(name, sp) {
  const cat = ALGO_CATALOGUE[name];
  const quality = "medium";
  if (cat.kind === "field" && typeof FIELDS !== "undefined" && FIELDS[cat.sport]) {
    const d = FIELDS[cat.sport][cat.variant] || Object.values(FIELDS[cat.sport])[0];
    const mat = typeof MATERIALS !== "undefined" ? MATERIALS[quality] : { floor: "", marking: "", gradin: "" };
    const frame = algoItemFrame(sp);
    const src = {
      version: "1.0", generator: "Sportify-Algorithmic-Placement",
      quality_key: typeof getQualityKey === "function" ? getQualityKey(cat.sport, cat.variant, quality) : "",
      // the packing tool's sizes are FINAL envelopes (run-off included), so the run-off is not added again
      field: { sport: cat.sport, variant: cat.variant, norm: d.norm, dimensions: { length_m: frame.length_m, width_m: frame.width_m, runoff_m: 0, min_height_m: d.h }, capacity: { seats: 0, side_stands: false } },
      materials: { floor_surface: mat.floor, line_marking: mat.marking, gradin_type: mat.gradin, quality_level: quality, reference_material: null, reference_provider: null },
      layers: ["field_boundary", "center_line", "center_circle", "goal_area", "penalty_area", "run_off_zone", "stands"]
    };
    // A specified sport carries its own choices, as when it is pushed from the Sport panel: the court keeps the surface and mounting it was placed with
    // instead of following whatever the panel shows later, and Revit builds it from these numbers (basketballCourt.js, volleyballCourt.js).
    const spec = ALGO_SPECIFIED[name], st = spec ? algoSpecifiedState(name) : null;
    if (st) src[spec.field] = spec.payload(st);
    return src;
  }
  const a = typeof ACTIVITIES !== "undefined" ? ACTIVITIES[cat.id] : null;
  const mat = typeof ACTIVITY_MATERIALS !== "undefined" ? ACTIVITY_MATERIALS[quality] : { surface: "", structure: "" };
  return {
    version: "1.0", generator: "Sportify-Algorithmic-Placement",
    quality_key: typeof getActivityQualityKey === "function" ? getActivityQualityKey(cat.id) : "",
    activity: { type_id: cat.id, category: a ? a.category : "court", norm: a ? a.norm : "", dimensions: { length_m: sp.long, width_m: sp.short } },
    materials: { surface: mat.surface, structure: mat.structure, quality_level: quality, reference_material: null, reference_provider: null }
  };
}

/** Garden zones went on the board with no build-up: say why in words, instead of leaving zones that look finished and are skipped by Revit. */
function algoWarnNoBuildUp() {
  if (typeof showToast !== "function") return;
  const loaded = typeof assembliesLoaded !== "undefined" && assembliesLoaded;
  showToast(loaded ? "No build-up for the garden" : "Garden zones have no build-up yet",
    (loaded ? "The catalogue has no green roof build-up." : "The build-up catalogue could not be loaded (is the Sportify API running?).") +
    " The zones are on the board, but Revit will not build them until a build-up is chosen in the Zones panel.");
}

/** Takes away everything a previous Apply put on the board (courts, garden zones, entry points), and nothing else. */
function algoClearApplied(announce) {
  const before = combineState.items.length + (combineState.zones || []).length + combineState.entryPoints.length;
  combineState.items = combineState.items.filter(i => !i.algorithmic);
  combineState.zones = (combineState.zones || []).filter(z => !z.algorithmic);
  combineState.entryPoints = combineState.entryPoints.filter(p => !p.algorithmic);
  combineState.walls = (combineState.walls || []).filter(w => !w.algorithmic);
  combineState.selectedId = null; combineState.selectedKind = null;
  const removed = before - (combineState.items.length + combineState.zones.length + combineState.entryPoints.length);
  if (announce && typeof showToast === "function") showToast(removed ? "Cleared" : "Nothing to clear", removed ? `${removed} piece${removed === 1 ? "" : "s"} placed by the algorithm removed from the board.` : "The board has nothing the algorithm placed.");
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  return removed;
}

async function algoApply() {
  if (algoAdoptSpecifiedSizes()) {      // a court's specification was changed in the Sport panel since this layout was checked: check it again before it goes on the board
    algoState.plan = null; algoState.planKey = ""; algoState.fit = null; algoState.fitKey = "";
    if (algoState.built) algoBuildPanel();
    algoSchedulePreview(0);
    if (typeof showToast === "function") showToast("Court sizes changed", "A court's specification changed in the Sport panel, so the layout is being checked again. Apply once it is done.");
    return;
  }
  const plan = algoState.plan;
  if (!plan || !plan.courts.length || algoState.busy) return;
  const handPlaced = combineState.items.filter(i => !i.algorithmic).length + (combineState.zones || []).filter(z => !z.algorithmic).length;
  if (handPlaced > 0 && !window.confirm(`The Combine board has ${handPlaced} piece${handPlaced === 1 ? "" : "s"} you placed by hand. Applying replaces the board with this layout. Continue?`)) return;
  // The build-up catalogue comes from the API and is fetched lazily (assemblies.js). Fetch it first, so the garden zones are made with their build-up in one step (one
  // Undo takes the whole Apply back) instead of being given one afterwards: a zone without one is reported by Revit as a floor type that was never described.
  if (algoState.settings.gardenZones && typeof loadAssemblies === "function" && typeof assembliesLoaded !== "undefined" && !assembliesLoaded) {
    try { await loadAssemblies(); } catch (e) { /* algoWarnNoBuildUp says so once the zones are made */ }
    if (algoState.plan !== plan || algoState.busy) return;       // the layout changed while the catalogue was coming: nothing has been applied yet
  }
  // A specified court's weight (what the structural analysis puts on the deck) comes from the court options in the API, which the volleyball and basketball panels fetch
  // when they are first opened. Applied before they ever were, the courts were exported with weight_kg 0: a court that weighs nothing (found by the live Revit import).
  const wantsCourt = key => plan.courts.some(c => new RegExp(key, "i").test(c.name));
  const optionLoads = [];
  if (wantsCourt("volleyball") && typeof loadVolleyballOptions === "function" && typeof volleyballOptionsLoaded !== "undefined" && !volleyballOptionsLoaded) optionLoads.push(loadVolleyballOptions());
  if (wantsCourt("basketball") && typeof loadBasketballOptions === "function" && typeof basketballOptionsLoaded !== "undefined" && !basketballOptionsLoaded) optionLoads.push(loadBasketballOptions());
  if (optionLoads.length) {
    await Promise.all(optionLoads.map(p => p.catch(() => { /* the courts are placed; their weight is then unknown, as it always was offline */ })));
    if (algoState.plan !== plan || algoState.busy) return;
  }
  combineState.items = []; combineState.zones = []; combineState.entryPoints = combineState.entryPoints.filter(p => !p.algorithmic);
  combineState.walls = [];
  combineState.tray = combineState.tray || [];

  const stamp = Date.now();
  plan.courts.forEach((c, i) => {
    const sp = AlgoPlacement.SPORTS.find(s => s.name === c.name);
    const frame = algoItemFrame(sp);
    combineState.items.push({
      id: `algo_${stamp}_${i}`, kind: ALGO_CATALOGUE[c.name].kind, label: sp.label,
      length_m: frame.length_m, width_m: frame.width_m, rotation: c.rotated !== !!sp.swap ? 90 : 0,
      x_m: algoRound(c.rect[0]), y_m: algoRound(c.rect[1]),
      sourceJson: algoCatalogueSource(c.name, sp), algorithmic: true
    });
  });

  let zoneCount = 0, withoutBuildUp = false;
  if (algoState.settings.gardenZones && typeof ensureZoneState === "function" && typeof rectPoints === "function") {
    ensureZoneState();
    const assembly = combineState.zoneAssembly || (typeof defaultAssemblyFor === "function" ? defaultAssemblyFor("green_roof") : null);
    withoutBuildUp = !assembly;
    const rects = (plan.bandRects || algoState.site.bandRects).concat(plan.pockets).filter(r => r[2] - r[0] >= 0.3 && r[3] - r[1] >= 0.3);
    rects.forEach((r, i) => {
      // A zone is a polygon (zones.js): `points` is the truth and the box is derived from it, so the pocket is made as the rectangle it is.
      const zone = { id: `zone_algo_${stamp}_${i}`, kind: "green_roof", assemblyKey: assembly, points: rectPoints(algoRound(r[0]), algoRound(r[1]), algoRound(r[2] - r[0]), algoRound(r[3] - r[1])), algorithmic: true };
      combineState.zones.push(syncZoneBounds(zone));
      zoneCount++;
    });
  }

  // The entry points are the ones already on the board (the plan started from them), so Apply adds none of its own.

  // The indoor zone's wall + door (algoPlacementCore.js: buildIndoorWall), so the Combine board shows the same real wall the algorithmic preview always
  // has — only the preview had it until now. Purely visual on the board (see combineState.walls above), so it needs no id per rect, just one entry for
  // the whole ring; regenerated from the plan on every Apply, same as items/zones/entryPoints just above.
  if (plan.wall) {
    combineState.walls.push({ id: `wall_algo_${stamp}`, thicknessM: plan.wall.thicknessM, rects: plan.wall.rects, door: plan.wall.door, algorithmic: true });
  }

  combineState.selectedId = null; combineState.selectedKind = null;
  algoSetMode("manual");
  if (typeof resetCombineView === "function") resetCombineView();
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  // Same save-and-send-to-Revit the "Export Combined JSON" button does, fired automatically here too: Apply is already
  // the deliberate "this is what I want on the roof" moment, and a roof pushed fresh from Revit (Sportify's new
  // "Update" command) needs the very next Apply to reach Revit without a second, separate manual step.
  if (typeof downloadCombinedSession === "function") downloadCombinedSession();
  if (typeof showToast === "function") showToast("Placed on the board", `${plan.courts.length} court${plan.courts.length === 1 ? "" : "s"}${zoneCount ? `, ${zoneCount} garden zone${zoneCount === 1 ? "" : "s"}` : ""}. Move any piece by hand; the pathways are the space between them.`);
  if (zoneCount && withoutBuildUp) algoWarnNoBuildUp();            // last, so it is the toast that stays on screen
}

// ------------------------------------------------------------------------------------------------ start

document.addEventListener("click", e => {
  const sw = e.target.closest && e.target.closest("[data-placement]");
  if (sw && !sw.closest("#algo-placement")) algoSetMode(sw.dataset.placement);      // the switch over the manual board (the panel's own is handled by the panel)
});
algoRenderSwitches();
