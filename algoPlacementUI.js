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
  "Sandpit": { kind: "activity", id: "sand_pit" }
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

const ALGO_BLOCK_SIZES = { lift: [2.5, 2.5], ramp: [6.0, 1.5], stair: [4.0, 2.0] };
const ALGO_BLOCK_LABELS = { lift: "Lift", ramp: "Ramp", stair: "Stair" };

const algoState = {
  mode: "manual",                         // "manual" | "algo": what Combine shows; a per-viewer convenience, never saved in the layout
  qty: {},                                // court name -> how many
  good: {},                               // the last quantities the packing accepted (a court that does not fit goes back to these)
  blocks: [],                             // lifts / ramps / stairs: { id, kind, x, y, w, h } (top-left, metres)
  settings: { setback: null, pathW: 2.0, minPathW: 1.0, time: 8, seed: 1, edgeFirst: true, leftoverPath: false, ring: false, strictGap: false, keepClear: true, gardenZones: true, entryPoints: true },
  plan: null, site: null, planKey: "",
  fit: null, fitKey: "",
  msg: "", status: "", progress: 0, busy: false,
  token: 0, timer: null,
  seen: new Set(), seenKey: "", shuffleN: 0,
  built: false, blockCounter: 0
};

(function loadAlgoStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(ALGO_STORAGE_KEY) || "null");
    if (saved) {
      if (saved.qty) algoState.qty = saved.qty;
      if (saved.settings) Object.assign(algoState.settings, saved.settings);
    }
  } catch (e) { /* storage blocked or corrupt: the defaults */ }
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

/** The stairs, lifts and ramps of the Revit model as blocks (their position is the model's; the size is a stand-in, edit it). */
function algoRevitBlocks() {
  const f = combineState.roofFeatures;
  if (!f) return [];
  const kindOf = { core: "lift", stair: "stair", ramp: "ramp" };
  return (f.entries || []).filter(e => kindOf[e.kind]).map(e => {
    const kind = kindOf[e.kind], [w, h] = ALGO_BLOCK_SIZES[kind];
    return { kind, x: algoRound(e.x_m - w / 2), y: algoRound(e.y_m - h / 2), w, h };
  });
}

function algoSetback() {
  const s = algoState.settings.setback;
  if (Number.isFinite(s)) return s;
  return typeof DESIGN_RULES !== "undefined" && Number.isFinite(DESIGN_RULES.boundarySetback_m) ? DESIGN_RULES.boundarySetback_m : AlgoPlacement.DEFAULT_SETBACK;
}

function algoRequests() {
  return AlgoPlacement.SPORTS.flatMap(s => Array.from({ length: algoState.qty[s.name] || 0 }, () => ({ name: s.name, w: s.long, h: s.short })));
}

function algoSiteKey() {
  const s = algoState.settings;
  return JSON.stringify([algoFootprint(), algoSetback(), s.pathW, s.minPathW, s.ring, s.strictGap, algoState.blocks.map(b => [b.x, b.y, b.w, b.h]), algoKeepClearBoxes(), AlgoPlacement.SPORTS.map(sp => [sp.long, sp.short])]);
}

function algoInputKey() {
  const s = algoState.settings;
  return JSON.stringify([algoSiteKey(), algoState.qty, s.edgeFirst, s.leftoverPath, s.seed]);
}

/** The Site for the packing engine, or throws with what is wrong in words. */
function algoBuildSite() {
  return AlgoPlacement.makeSite({
    foot: algoFootprint(), setback: algoSetback(),
    entries: algoState.blocks.map(b => [b.x, b.y, b.x + b.w, b.y + b.h]),
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

function algoBuildPanel() {
  const panel = document.getElementById("algo-placement");
  if (!panel) return;
  algoAdoptSpecifiedSizes();
  const s = algoState.settings;
  const sportRows = AlgoPlacement.SPORTS.map((sp, i) => `<div class="algo-sport" data-sport="${i}">
      <span class="algo-swatch" style="background:${escapeHtml(algoRgb(sp.color))}"></span>
      <span class="algo-sport-name">${algoEsc(sp.name)}${AlgoPlacement.BIG_COURTS.includes(sp.name) ? ' <i class="ti ti-arrows-maximize" title="A big court: needs a path on one side only" aria-hidden="true"></i>' : ""}</span>
      <span class="algo-sport-size">${sp.long} × ${escapeHtml(sp.short)} m</span>
      <span class="algo-sport-area">${Math.round(sp.long * sp.short)} m²</span>
      <span class="algo-qty"><button data-act="qty-" data-i="${i}" aria-label="One fewer ${algoEsc(sp.name)}">−</button><input type="number" min="0" max="30" step="1" data-qty="${i}" value="${escapeHtml(algoState.qty[sp.name] || 0)}" aria-label="How many ${algoEsc(sp.name)}"><button data-act="qty+" data-i="${i}" aria-label="One more ${algoEsc(sp.name)}">+</button></span>
      <span class="algo-fit" data-fit="${i}"></span>
    </div>`).join("");

  panel.innerHTML = `
    <header class="algo-head">
      <div><h2><i class="ti ti-wand" aria-hidden="true"></i> Algorithmic placement</h2>
        <p class="hint">Say which courts you want; the roof is packed by rules and re-checked live. Apply puts the result on the Combine board, where you can still move any piece by hand.</p></div>
      <div data-placement-switch></div>
    </header>
    <div class="algo-body">
      <div class="algo-left">
        <section class="algo-card"><h3>1 · Site <small id="algo-site-note"></small></h3>
          <p class="hint">Lifts, ramps and stairs are where the pathway network starts: it grows from each of them and joins them into one. Drag them on the preview, or type their position.</p>
          <div id="algo-blocks" class="algo-blocks"></div>
          <div class="algo-row-buttons">
            <button class="btn-export" data-act="add-block" data-kind="lift"><i class="ti ti-plus" aria-hidden="true"></i>Lift</button>
            <button class="btn-export" data-act="add-block" data-kind="ramp"><i class="ti ti-plus" aria-hidden="true"></i>Ramp</button>
            <button class="btn-export" data-act="add-block" data-kind="stair"><i class="ti ti-plus" aria-hidden="true"></i>Stair</button>
            <button class="btn-export" data-act="blocks-from-revit" id="algo-from-revit"><i class="ti ti-building" aria-hidden="true"></i>From Revit</button>
          </div>
        </section>
        <section class="algo-card"><h3>2 · Settings</h3>
          <div class="algo-grid">
            <label>Garden band / setback (m)<input type="number" id="algo-setback" min="0" max="20" step="0.25" value="${algoSetback()}"></label>
            <label>Main pathway width (m)<input type="number" id="algo-pathw" min="1" max="6" step="0.25" value="${s.pathW}"></label>
            <label>Narrowest pathway if needed (m)<input type="number" id="algo-minpath" min="0.8" max="3" step="0.25" value="${s.minPathW}"></label>
            <label>Search time (s)<input type="number" id="algo-time" min="2" max="60" step="1" value="${s.time}"></label>
            <label>Variation seed<input type="number" id="algo-seed" min="1" max="999" step="1" value="${s.seed}"></label>
          </div>
          <label class="algo-check"><input type="checkbox" id="algo-edge" ${s.edgeFirst ? "checked" : ""}> Courts hug the setback line first (then fill the middle)</label>
          <label class="algo-check"><input type="radio" name="algo-opt" value="1" ${s.leftoverPath ? "checked" : ""}> Option 1: garden only in the setback band; all leftover space is pathway</label>
          <label class="algo-check"><input type="radio" name="algo-opt" value="2" ${s.leftoverPath ? "" : "checked"}> Option 2: garden in the setback band and in the leftover pockets</label>
          <label class="algo-check"><input type="checkbox" id="algo-ring" ${s.ring ? "checked" : ""}> Landing on ALL sides of lifts / ramps</label>
          <label class="algo-check"><input type="checkbox" id="algo-strict" ${s.strictGap ? "checked" : ""}> Big courts keep the clear gap too (Combine's clearance rule then holds between every pair)</label>
          <label class="algo-check" id="algo-keepclear-row"><input type="checkbox" id="algo-keepclear" ${s.keepClear ? "checked" : ""}> Keep clear of the openings and equipment from Revit <small id="algo-keepclear-n"></small></label>
          <p class="hint">Normal courts get a ${AlgoPlacement.COURT_GAP_M.toFixed(1)} m path all around; big courts (multi sport, basketball, handball, volleyball) need a path on one side only, so two of them may touch. Lifts get ${AlgoPlacement.COURT_GAP_M.toFixed(1)} m paths on their inside sides. A court is only accepted if the live check can place it; the pathway narrows if needed.</p>
        </section>
        <section class="algo-card"><h3>3 · How many of each court? <small>only courts that fit are accepted</small></h3>
          <div class="algo-sports" id="algo-sports">${sportRows}</div>
        </section>
      </div>
      <div class="algo-right">
        <div class="algo-preview" id="algo-preview"></div>
        <p class="algo-warn" id="algo-warn"></p>
        <p class="algo-summary" id="algo-summary"></p>
        <div class="algo-bar"><div id="algo-bar-fill"></div></div>
        <pre class="algo-report" id="algo-report"></pre>
        <div class="algo-actions">
          <button class="btn-export primary" data-act="apply" id="algo-apply"><i class="ti ti-check" aria-hidden="true"></i>Apply to Combine</button>
          <button class="btn-export" data-act="shuffle" id="algo-shuffle"><i class="ti ti-arrows-shuffle" aria-hidden="true"></i>Shuffle preview</button>
          <button class="btn-export" data-act="clear-applied"><i class="ti ti-eraser" aria-hidden="true"></i>Clear applied</button>
          <button class="btn-export" data-act="back"><i class="ti ti-hand-move" aria-hidden="true"></i>Back to manual</button>
        </div>
        <label class="algo-check"><input type="checkbox" id="algo-garden" ${s.gardenZones ? "checked" : ""}> Draw the garden (band and pockets) as green roof zones</label>
        <label class="algo-check"><input type="checkbox" id="algo-entrypoints" ${s.entryPoints ? "checked" : ""}> Add an entry point at each lift / ramp / stair (snapped to the roof edge)</label>
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
    } else if (act === "add-block") algoAddBlock(b.dataset.kind);
    else if (act === "del-block") { algoState.blocks = algoState.blocks.filter(x => x.id !== b.dataset.id); algoRefreshBlocks(); algoChanged(); }
    else if (act === "blocks-from-revit") algoTakeRevitBlocks();
    else if (act === "apply") algoApply();
    else if (act === "shuffle") algoShuffle();
    else if (act === "clear-applied") algoClearApplied(true);
    else if (act === "back") algoSetMode("manual");
  });
  panel.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.qty != null) {
      const sp = AlgoPlacement.SPORTS[Number(t.dataset.qty)];
      algoState.qty[sp.name] = Math.max(0, Math.min(30, Math.round(Number(t.value) || 0)));
      algoChanged();
    } else if (t.dataset.block) {
      const blk = algoState.blocks.find(x => x.id === t.dataset.block);
      if (!blk) return;
      const v = Number(t.value);
      if (t.dataset.f === "kind") blk.kind = t.value;
      else if (Number.isFinite(v) && (t.dataset.f === "x" || t.dataset.f === "y" || v > 0.3)) blk[t.dataset.f] = v;
      algoChanged();
    }
  });
  panel.addEventListener("change", e => {
    const t = e.target;
    const num = (id, key, lo, hi) => { const v = Number(t.value); if (Number.isFinite(v) && v >= lo && v <= hi) algoState.settings[key] = v; else t.value = algoState.settings[key]; };
    if (t.id === "algo-setback") { const v = Number(t.value); if (Number.isFinite(v) && v >= 0 && v <= 20) algoState.settings.setback = v; else t.value = algoSetback(); }
    else if (t.id === "algo-pathw") num(t.id, "pathW", 1, 6);
    else if (t.id === "algo-minpath") num(t.id, "minPathW", 0.8, 3);
    else if (t.id === "algo-time") num(t.id, "time", 2, 60);
    else if (t.id === "algo-seed") num(t.id, "seed", 1, 999);
    else if (t.id === "algo-edge") algoState.settings.edgeFirst = t.checked;
    else if (t.name === "algo-opt") algoState.settings.leftoverPath = t.value === "1";
    else if (t.id === "algo-ring") algoState.settings.ring = t.checked;
    else if (t.id === "algo-strict") algoState.settings.strictGap = t.checked;
    else if (t.id === "algo-keepclear") algoState.settings.keepClear = t.checked;
    else if (t.id === "algo-garden") { algoState.settings.gardenZones = t.checked; algoSave(); return; }
    else if (t.id === "algo-entrypoints") { algoState.settings.entryPoints = t.checked; algoSave(); return; }
    else return;
    algoChanged();
  });
  algoBindDrag(document.getElementById("algo-preview"));
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

// ------------------------------------------------------------------------------------------------ lifts, ramps, stairs

function algoNewBlockId() { return `blk_${Date.now()}_${algoState.blockCounter++}`; }

function algoAddBlock(kind) {
  const [w, h] = ALGO_BLOCK_SIZES[kind];
  const b = algoBounds();
  let x = algoRound(Math.round((b.x0 + Math.min(4, (b.x1 - b.x0) / 6)) * 2) / 2), y = algoRound(Math.round(((b.y0 + b.y1) / 2 - h / 2) * 2) / 2);
  while (algoState.blocks.some(o => Math.abs(o.x - x) < w + 0.5 && Math.abs(o.y - y) < h + 0.5) && x < b.x1 - w - 2) x += w + 1.5;
  algoState.blocks.push({ id: algoNewBlockId(), kind, x, y, w, h });
  algoRefreshBlocks();
  algoChanged();
}

function algoTakeRevitBlocks() {
  const found = algoRevitBlocks();
  if (!found.length) { if (typeof showToast === "function") showToast("Nothing from Revit", "The Revit model has pushed no stairs, lifts or ramps for this roof yet (Push to Sportify, entries)."); return; }
  algoState.blocks = found.map(b => Object.assign({ id: algoNewBlockId() }, b));
  algoRefreshBlocks();
  algoChanged();
  if (typeof showToast === "function") showToast("Taken from Revit", `${found.length} stair / lift / ramp position${found.length === 1 ? "" : "s"}. Their size is a stand-in: edit it to match the model.`);
}

function algoBounds() {
  const foot = algoFootprint();
  const xs = foot.map(p => p[0]), ys = foot.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function algoRefreshBlocks() {
  const box = document.getElementById("algo-blocks");
  if (!box) return;
  box.innerHTML = algoState.blocks.length ? algoState.blocks.map(b => `<div class="algo-block" data-row="${escapeHtml(b.id)}">
      <select data-block="${escapeHtml(b.id)}" data-f="kind" aria-label="Kind">${Object.keys(ALGO_BLOCK_LABELS).map(k => `<option value="${k}" ${k === b.kind ? "selected" : ""}>${ALGO_BLOCK_LABELS[k]}</option>`).join("")}</select>
      <label>x<input type="number" step="0.5" data-block="${escapeHtml(b.id)}" data-f="x" value="${b.x}"></label>
      <label>y<input type="number" step="0.5" data-block="${escapeHtml(b.id)}" data-f="y" value="${b.y}"></label>
      <label>w<input type="number" step="0.5" min="0.5" data-block="${escapeHtml(b.id)}" data-f="w" value="${b.w}"></label>
      <label>h<input type="number" step="0.5" min="0.5" data-block="${escapeHtml(b.id)}" data-f="h" value="${b.h}"></label>
      <button data-act="del-block" data-id="${escapeHtml(b.id)}" aria-label="Remove" title="Remove">×</button></div>`).join("")
    : `<p class="algo-empty">No lift, ramp or stair yet. Add at least one: the pathways start from them.</p>`;
  const fromRevit = document.getElementById("algo-from-revit");
  if (fromRevit) { const n = algoRevitBlocks().length; fromRevit.disabled = n === 0; fromRevit.title = n ? `${n} from the Revit model` : "Nothing pushed from Revit yet"; }
  const kc = document.getElementById("algo-keepclear-n");
  if (kc) { const n = combineState.roofFeatures ? (combineState.roofFeatures.openings || []).length + (combineState.roofFeatures.equipment || []).length : 0; kc.textContent = n ? `(${n} from Revit)` : "(none pushed)"; }
}

// ------------------------------------------------------------------------------------------------ the live check (the Rhino form's do_preview)

async function algoPreview(msg) {
  if (algoState.mode !== "algo") return;
  if (algoAdoptSpecifiedSizes() && algoState.built) { algoState.plan = null; algoState.planKey = ""; algoState.fit = null; algoState.fitKey = ""; algoBuildPanel(); }   // the Sport panel changed a court's specification
  const token = ++algoState.token;
  algoState.msg = msg || "";
  const ready = algoState.blocks.length > 0;
  if (!ready) {
    algoState.plan = null; algoState.site = null; algoState.planKey = "";
    algoState.status = "Add a lift, ramp or stair to begin.";
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
    if (fit.sports[n]) return algoRevert("Not added - " + n + ": " + fit.sports[n] + ".");
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
        return algoPreview("Not added - " + un.name + ": " + un.reason + ". The other courts you added were kept.");
      }
      return algoRevert("Not added - " + un.name + ": " + un.reason + ". Previous selection restored.");
    }                                                                         // the site changed: keep what fits
    const removed = Object.keys(qty).filter(n => qty[n] > (counts[n] || 0)).map(n => n + " x" + (qty[n] - (counts[n] || 0)));
    AlgoPlacement.SPORTS.forEach(s => { algoState.qty[s.name] = counts[s.name] || 0; });
    algoSyncQty();
    plan.unplaced = [];
    plan.stats.requested = plan.stats.placed;
    algoState.msg = "Removed (no room with the current settings): " + removed.join(", ");
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
  return { pathW: s.pathW, minPathW: s.minPathW, ring: s.ring, seed: s.seed, edgeFirst: s.edgeFirst, leftoverPath: s.leftoverPath, strictGap: s.strictGap };
}

function algoFit(site) {
  const key = algoSiteKey();
  if (algoState.fit && algoState.fitKey === key) return algoState.fit;
  const s = algoState.settings;
  algoState.fit = AlgoPlacement.fitCheck(site, Math.min(s.minPathW, s.pathW), s.ring, s.strictGap);
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
  if (!sum || !fill) return;
  const total = AlgoPlacement.SPORTS.reduce((s, sp) => s + (algoState.qty[sp.name] || 0) * sp.long * sp.short, 0);
  const count = AlgoPlacement.SPORTS.reduce((s, sp) => s + (algoState.qty[sp.name] || 0), 0);
  const u = algoState.site ? algoState.site.usableArea : null;
  fill.classList.remove("busy");
  if (u) {
    const pct = 100 * total / u;
    sum.textContent = `${count} courts = ${total.toFixed(0)} m² of ${u.toFixed(0)} m² sports area (${pct.toFixed(0)}%). Limit ${AlgoPlacement.BUILT_LIMIT_PCT}%.`;
    sum.className = "algo-summary " + (pct <= AlgoPlacement.BUILT_LIMIT_PCT ? "ok" : "bad");
    fill.style.width = Math.min(100, pct) + "%";
    fill.className = pct <= AlgoPlacement.BUILT_LIMIT_PCT ? "" : "bad";
  } else {
    sum.textContent = `${count} courts = ${total.toFixed(0)} m²`;
    sum.className = "algo-summary";
    fill.style.width = "0%";
  }
}

function algoRefreshFit() {
  const fit = algoState.fit;
  const lines = fit ? fit.notes.slice() : [];
  AlgoPlacement.SPORTS.forEach((sp, i) => {
    const reason = fit ? fit.sports[sp.name] : "";
    const el = document.querySelector(`[data-fit="${i}"]`);
    if (el) el.textContent = reason ? "! won't fit" : "";
    if (reason && (algoState.qty[sp.name] || 0) > 0) lines.push(sp.name + ": " + reason);
  });
  const warn = document.getElementById("algo-warn");
  if (warn) {
    const block = lines.length ? "WARNING - these cannot be placed with the current settings:\n" + lines.join("\n") : "";
    warn.textContent = [algoState.msg, block].filter(Boolean).join("\n");
  }
}

function algoRefreshAll() {
  algoRenderSwitches();
  algoRefreshSummary();
  algoRefreshFit();
  const rep = document.getElementById("algo-report");
  if (rep) {
    if (algoState.plan && algoState.site) rep.textContent = algoState.status + "\n" + AlgoPlacement.buildReport(algoState.plan, algoState.site);
    else rep.textContent = algoState.status || "Pick the footprint and lifts/ramps to begin.";
  }
  const apply = document.getElementById("algo-apply"), shuffle = document.getElementById("algo-shuffle");
  const can = !!(algoState.plan && algoState.plan.courts.length) && !algoState.busy;
  if (apply) apply.disabled = !can;
  if (shuffle) shuffle.disabled = !(algoState.plan && !algoState.busy);
  const sports = document.getElementById("algo-sports");
  if (sports) sports.classList.toggle("disabled", !algoState.blocks.length);
  const note = document.getElementById("algo-site-note");
  if (note) {
    const roof = combineState.roof;
    note.textContent = `roof ${roof.length} × ${roof.width} m${roof.boundary && roof.boundary.length >= 3 ? ", outline from Revit" : ""}`;
  }
  const inp = document.getElementById("algo-setback");
  if (inp && document.activeElement !== inp) inp.value = algoSetback();
  algoRefreshProgress();
  if (!algoState.busy) { const fill = document.getElementById("algo-bar-fill"); if (fill) fill.classList.remove("busy"); }
}

/** The plan drawn as SVG in metres, in the roof's own orientation (the Rhino form's preview). */
function algoDrawPreview() {
  const host = document.getElementById("algo-preview");
  if (!host) return;
  const site = algoState.site, plan = algoState.plan;
  if (!site) {
    host.innerHTML = `<div class="algo-preview-empty">${algoEsc(algoState.status || "Add a lift, ramp or stair to see the live preview.")}</div>`;
    return;
  }
  const b = site.bbox, pad = Math.max(1, (b.x1 - b.x0) * 0.02);
  const vx = b.x0 - pad, vy = b.y0 - pad, vw = b.x1 - b.x0 + 2 * pad, vh = b.y1 - b.y0 + 2 * pad;
  const fs = Math.max(0.7, Math.min(2.2, Math.min(vw, vh) / 22));
  const rect = (r, fill, extra) => `<rect x="${algoRound(r[0])}" y="${algoRound(r[1])}" width="${algoRound(r[2] - r[0])}" height="${algoRound(r[3] - r[1])}" fill="${fill}" ${extra || ""}/>`;
  const C = AlgoPlacement;
  let g = "";
  g += `<polygon points="${site.foot.map(p => p.join(",")).join(" ")}" fill="${algoRgb(C.COLOR_GARDEN)}"/>`;        // the garden band
  site.usableRects.forEach(r => { g += rect(r, "#fcfcfc"); });                                                        // the usable zone
  if (site.bandRects.length && site.entries.length) site.bandRects.forEach(r => { g += rect(r, algoRgb(C.COLOR_GARDEN)); });
  if (plan) {
    plan.pockets.forEach(r => { g += rect(r, algoRgb(C.COLOR_GARDEN)); });
    plan.pathRects.forEach(r => { g += rect(r, algoRgb(C.COLOR_PATH), 'shape-rendering="crispEdges"'); });
  }
  site.keepClear.forEach(r => { g += rect(r, "rgba(220,38,38,0.16)", 'stroke="#dc2626" stroke-width="0.12" stroke-dasharray="0.5 0.3"') + `<title>Kept clear (opening or equipment from Revit)</title>`; });
  algoState.blocks.forEach(blk => {
    g += `<g class="algo-block-svg" data-drag="${escapeHtml(blk.id)}" style="cursor:grab"><rect x="${algoRound(blk.x)}" y="${algoRound(blk.y)}" width="${blk.w}" height="${blk.h}" fill="${algoRgb(C.COLOR_VC)}" stroke="#7f1d1d" stroke-width="0.12"/>
      <text x="${algoRound(blk.x + blk.w / 2)}" y="${algoRound(blk.y + blk.h / 2 + fs * 0.35)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#fff" pointer-events="none">${escapeHtml(ALGO_BLOCK_LABELS[blk.kind][0])}</text><title>${escapeHtml(ALGO_BLOCK_LABELS[blk.kind])}: drag to move</title></g>`;
  });
  if (plan) plan.courts.forEach(c => {
    const sp = C.SPORTS.find(s => s.name === c.name), r = c.rect;
    const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, word = c.name.split(" ")[0];
    const small = r[2] - r[0] < fs * (word.length * 0.62 + 1) && r[3] - r[1] < fs * (word.length * 0.62 + 1);
    g += `<g pointer-events="none"><rect x="${algoRound(r[0])}" y="${algoRound(r[1])}" width="${algoRound(r[2] - r[0])}" height="${algoRound(r[3] - r[1])}" fill="${escapeHtml(algoRgb(sp.color))}" stroke="#282828" stroke-width="0.14"/>
      <text x="${algoRound(cx)}" y="${algoRound(cy + fs * 0.35)}" text-anchor="middle" font-size="${small ? fs * 0.7 : fs}" font-weight="600" fill="#141414">${algoEsc(word)}</text>
      <title>${algoEsc(c.name)} ${c.long} × ${escapeHtml(c.short)} m${c.rotated ? ", turned 90°" : ""}${c.onEdge ? ", on the setback line" : ""}</title></g>`;
  });
  g += `<polygon points="${site.foot.map(p => p.join(",")).join(" ")}" fill="none" stroke="#3c3c3c" stroke-width="0.18" pointer-events="none"/>`;
  host.innerHTML = `<svg id="algo-svg" viewBox="${algoRound(vx)} ${algoRound(vy)} ${algoRound(vw)} ${algoRound(vh)}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${algoRound(vw / vh)}" role="img" aria-label="Preview of the packed roof">${g}</svg>`;
}

// ------------------------------------------------------------------------------------------------ dragging a lift on the preview

function algoBindDrag(host) {
  if (!host) return;
  let drag = null;
  const toMetres = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  host.addEventListener("pointerdown", e => {
    const el = e.target.closest("[data-drag]");
    const svg = host.querySelector("svg");
    if (!el || !svg) return;
    const blk = algoState.blocks.find(b => b.id === el.dataset.drag);
    if (!blk) return;
    const p = toMetres(svg, e);
    drag = { blk, svg, el, dx: p.x - blk.x, dy: p.y - blk.y };
    host.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
    e.preventDefault();
  });
  host.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = toMetres(drag.svg, e), b = algoBounds();
    drag.blk.x = algoRound(Math.max(b.x0, Math.min(b.x1 - drag.blk.w, Math.round((p.x - drag.dx) * 2) / 2)));
    drag.blk.y = algoRound(Math.max(b.y0, Math.min(b.y1 - drag.blk.h, Math.round((p.y - drag.dy) * 2) / 2)));
    const rect = drag.el.querySelector("rect"), text = drag.el.querySelector("text");
    rect.setAttribute("x", drag.blk.x); rect.setAttribute("y", drag.blk.y);
    text.setAttribute("x", algoRound(drag.blk.x + drag.blk.w / 2)); text.setAttribute("y", algoRound(drag.blk.y + drag.blk.h / 2 + parseFloat(text.getAttribute("font-size")) * 0.35));
    const row = document.querySelector(`[data-row="${escapeHtml(drag.blk.id)}"]`);
    if (row) { row.querySelector('[data-f="x"]').value = drag.blk.x; row.querySelector('[data-f="y"]').value = drag.blk.y; }
  });
  const end = () => { if (!drag) return; drag.el.style.cursor = "grab"; drag = null; algoChanged(); };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
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
  combineState.items = []; combineState.zones = []; combineState.entryPoints = combineState.entryPoints.filter(p => !p.algorithmic);
  combineState.tray = combineState.tray || [];

  const stamp = Date.now();
  plan.courts.forEach((c, i) => {
    const sp = AlgoPlacement.SPORTS.find(s => s.name === c.name);
    const frame = algoItemFrame(sp);
    combineState.items.push({
      id: `algo_${stamp}_${i}`, kind: ALGO_CATALOGUE[c.name].kind, label: c.name,
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
    const rects = algoState.site.bandRects.concat(plan.pockets).filter(r => r[2] - r[0] >= 0.3 && r[3] - r[1] >= 0.3);
    rects.forEach((r, i) => {
      // A zone is a polygon (zones.js): `points` is the truth and the box is derived from it, so the pocket is made as the rectangle it is.
      const zone = { id: `zone_algo_${stamp}_${i}`, kind: "green_roof", assemblyKey: assembly, points: rectPoints(algoRound(r[0]), algoRound(r[1]), algoRound(r[2] - r[0]), algoRound(r[3] - r[1])), algorithmic: true };
      combineState.zones.push(syncZoneBounds(zone));
      zoneCount++;
    });
  }

  let entryCount = 0;
  if (algoState.settings.entryPoints && typeof nearestBoundaryPoint === "function") {
    algoState.blocks.forEach((b, i) => {
      const snap = nearestBoundaryPoint(combineState.roof, b.x + b.w / 2, b.y + b.h / 2);
      if (combineState.entryPoints.some(p => Math.hypot(p.x_m - snap.x, p.y_m - snap.y) < 1.5)) return;
      combineState.entryPoints.push({ id: `entry_algo_${stamp}_${i}`, edge: snap.edge, x_m: snap.x, y_m: snap.y, algorithmic: true });
      entryCount++;
    });
  }

  combineState.selectedId = null; combineState.selectedKind = null;
  algoSetMode("manual");
  if (typeof resetCombineView === "function") resetCombineView();
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  if (typeof showToast === "function") showToast("Placed on the board", `${plan.courts.length} court${plan.courts.length === 1 ? "" : "s"}${zoneCount ? `, ${zoneCount} garden zone${zoneCount === 1 ? "" : "s"}` : ""}${entryCount ? `, ${entryCount} entry point${entryCount === 1 ? "" : "s"}` : ""}. Move any piece by hand; the pathways are the space between them.`);
  if (zoneCount && withoutBuildUp) algoWarnNoBuildUp();            // last, so it is the toast that stays on screen
}

// ------------------------------------------------------------------------------------------------ start

document.addEventListener("click", e => {
  const sw = e.target.closest && e.target.closest("[data-placement]");
  if (sw && !sw.closest("#algo-placement")) algoSetMode(sw.dataset.placement);      // the switch over the manual board (the panel's own is handled by the panel)
});
algoRenderSwitches();
