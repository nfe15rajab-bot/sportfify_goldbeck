// Tests for the loop from the analyses back into the design (user + professor, 2026-09-29). Run: node tools/closed-loop-test.js
//
// With the REAL scripts in a vm: the quick water estimate counts every green surface (green roof zones by their build-up, planters by their substrate, garden
// parcels by their theme), the quick analyses read the layout they are given (Compare runs them on each iteration), the structural analysis's moves are applied
// to the right piece and refused when they were worked out for another layout, the ball analysis's fences are taken into the design (merged per edge, saved,
// drawn), and every layout's Revit results are kept apart so each iteration keeps its own.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function nothing() {
  return new Proxy(function () {}, {
    get(_, p) { return p === Symbol.toPrimitive ? () => "" : p === Symbol.iterator || p === "then" ? undefined : p === "length" ? 0 : nothing(); },
    apply() { return nothing(); }, construct() { return nothing(); }, set() { return true; }
  });
}
const stored = {};
const toasts = [];
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} }, Math, Set, Map, Int16Array, Int32Array, JSON, Date, Number, String, Array, Object, Promise,
  document: { getElementById: () => nothing(), querySelector: () => nothing(), querySelectorAll: () => [], addEventListener() {}, createElement: () => nothing(), body: nothing(), readyState: "complete" },
  localStorage: { getItem: k => stored[k] || null, setItem: (k, v) => { stored[k] = v; } },
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  fetch: async () => { throw new Error("no network in this test"); },
  showToast: (title, text) => toasts.push(title + ": " + text)
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(read(f), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);

// what the page's other scripts provide, as small stand-ins: the board's state, a piece's footprint, the build-up catalogue, a zone's true area
run(`
var combineState = { roof: { length: 30, width: 12, boundary: null }, items: [], zones: [], entryPoints: [], ballFences: [], selectedId: null, selectedKind: null };
var workspaceState = { layoutIdNow: null };
function getFootprint(o) { const r = (o.rotation % 180) !== 0; return { w: r ? o.width_m : o.length_m, h: r ? o.length_m : o.width_m }; }
function getAssembly(key) { return key === "sedum" ? { layers: [{ mm: 60 }, { mm: 40 }] } : null; }
function assemblyLayerTotalMm(a) { return a.layers.reduce((s, l) => s + l.mm, 0); }
function zoneAreaM2(z) { let t = 0; for (let i = 0; i < z.points.length; i++) { const a = z.points[i], b = z.points[(i + 1) % z.points.length]; t += a.x_m * b.y_m - b.x_m * a.y_m; } return Math.abs(t) / 2; }
function isDarkMode() { return false; }
`);
for (const f of ["escape.js", "data.js", "rules.js", "carbon.js", "gardenData.js", "resultsStoreCore.js", "analysisController.js", "analysisResults.js", "ballFences.js"]) load(f);

const rect = (x, y, w, h) => [{ x_m: x, y_m: y }, { x_m: x + w, y_m: y }, { x_m: x + w, y_m: y + h }, { x_m: x, y_m: y + h }];

// ---------------------------------------------------------------------------------------------------------------- the water estimate: every green surface
ctx.layout = {
  roof: { length: 30, width: 12 }, entryPoints: [],
  items: [
    { id: "p", kind: "gardenBlock", length_m: 2.4, width_m: 2.4, rotation: 0, x_m: 5, y_m: 5, sourceJson: { gardenBlock: { type: "planter_t", params: { substrateDepth: 300 } } } },
    { id: "b", kind: "gardenBlock", length_m: 2, width_m: 2, rotation: 0, x_m: 9, y_m: 5, sourceJson: { gardenBlock: { type: "park_bench_table", family: null } } },
  ],
  zones: [{ id: "z1", kind: "green_roof", assemblyKey: "sedum", points: rect(0, 0, 10, 4) }, { id: "z2", kind: "green_roof", assemblyKey: null, points: rect(20, 0, 5, 4) }],
};
const water = run("analyzeWaterManagement(layout)");
const expectDepth = (40 * 10 + 2.4 * 2.4 * 30) / (40 + 2.4 * 2.4);
check("a green roof zone (its build-up) and a planter (its substrate) are green surfaces; a bench is not", water.status === "ok" && water.zones === 1 && water.planters === 1 && Math.abs(water.totalAreaM2 - (40 + 5.76)) < 1e-9, JSON.stringify(water));
check("the depth is area-weighted over them (10 cm zone, 30 cm planter)", Math.abs(water.avgDepthCm - expectDepth) < 1e-9, water.avgDepthCm.toFixed(3) + " cm");
check("a zone with no build-up is not counted as holding water (nothing is guessed)", water.zones === 1);
check("a layout of courts only has no green surface", run("analyzeWaterManagement({ items: [{ id: 'c', kind: 'activity', length_m: 20, width_m: 10, rotation: 0, x_m: 0, y_m: 0 }], zones: [] })").status === "empty");

// ---------------------------------------------------------------------------------------------------------------- the quick analyses read the layout they are given
run("combineState.items = []; combineState.zones = [];");
check("given a layout, the quick analyses look at it, not at the board (Compare runs them on every iteration)",
  run("analyzeWindExposure(layout)").totalCount === 2 && run("analyzeWindExposure()").status === "empty" && run("analyzeWaterManagement()").status === "empty");

// ---------------------------------------------------------------------------------------------------------------- the structural moves
run(`
combineState.items = [{ id: "yoga", kind: "activity", length_m: 6, width_m: 4, rotation: 0, x_m: 10, y_m: 6 }];
workspaceState.layoutIdNow = "L1";
resultsState.payload = { sections: { structural_loads: { layout_id: "L1", computed_at: "2026-09-29T10:00:00Z" } },
  structural_loads: { actions: [
    { kind: "move", item_id: "yoga", target: "Yoga deck", text: "Move the Yoga deck 2.5 m toward the top.", axis: "y", move_m: -2.5, peak_utilisation_after_percent: 40, offset_after_percent: 3 },
    { kind: "lighten", item_id: "yoga", target: "Yoga deck", text: "Or a lighter build-up.", new_dead_kn_m2: 1.2 },
    { kind: "move", item_id: "", target: "?", text: "no piece", axis: "x", move_m: 1 } ] } };
`);
const html = run("structuralActionsHtml(resultsState.payload.structural_loads)");
check("a move is offered as Apply, a lighter build-up as 'show the piece', and one naming no piece is left out",
  /data-struct-action="0"(?![^>]*disabled)/.test(html) && html.includes('data-struct-show="yoga"') && !html.includes('data-struct-action="2"') && (html.match(/res-apply-row/g) || []).length === 2);
run("applyStructuralAction(0)");
check("Apply moves that piece by the analysis's distance, along its axis, and says what to expect", run("combineState.items[0].y_m") === 3.5 && run("combineState.items[0].x_m") === 10 && toasts.some(t => /40%/.test(t)), JSON.stringify(run("combineState.items[0]")));
run(`workspaceState.layoutIdNow = "L9"; structuralApplied = { resultLayoutId: null, layoutIdAfter: null, done: [] };`);
const staleHtml = run("structuralActionsHtml(resultsState.payload.structural_loads)");
check("worked out for another layout: the move is not offered (it may no longer fit), and the card says to run it again",
  /data-struct-action="0"[^>]*disabled/.test(staleHtml) && staleHtml.includes("earlier layout"));
run("applyStructuralAction(0)");
check("and Apply refuses it", run("combineState.items[0].y_m") === 3.5);

// ---------------------------------------------------------------------------------------------------------------- the ball fences
run("combineState.ballFences = [];");
check("no fences: nothing in the export (a layout without them keeps the identity it always had)", run("ballFencesPayload()") === null);
const n = run(`addBallFences([{ edge: "top", from_m: 0, to_m: 10, height_m: 5 }, { edge: "left", from_m: 2, to_m: 8, height_m: 4 }, { edge: "up", from_m: 0, to_m: 3, height_m: 2 }, { edge: "top", from_m: 4, to_m: 4, height_m: 2 }])`);
check("the proposal's fences go into the design; a fence on no edge, or of no length, does not", n === 2);
run(`addBallFences([{ edge: "top", from_m: 8, to_m: 20, height_m: 7 }, { edge: "bottom", from_m: 0, to_m: 5, height_m: 3 }])`);
const fences = run("JSON.stringify(combineState.ballFences)");
check("a second proposal overlapping a fence on the same edge becomes one fence: the stretches joined, the taller height",
  fences === JSON.stringify([{ edge: "top", from_m: 0, to_m: 20, height_m: 7 }, { edge: "left", from_m: 2, to_m: 8, height_m: 4 }, { edge: "bottom", from_m: 0, to_m: 5, height_m: 3 }]), fences);
const round = run("JSON.stringify(ballFencesFromPayload(JSON.parse(JSON.stringify(ballFencesPayload()))))");
check("they are saved with the layout and read back the same", round === fences);
const svg = run("ballFencesSvg(10, 50, 50)");
check("they are drawn on the board, one line each, along their edge (top: y 0, from 0 to 20 m)", (svg.match(/<line /g) || []).length === 3 && svg.includes('x1="50" y1="50" x2="250" y2="50"'));
run("removeBallFences()");
check("and removed", run("ballFencesPayload()") === null);

// ---------------------------------------------------------------------------------------------------------------- every layout's Revit results, kept apart
run(`archiveResultsByLayout({ sections: { structural_loads: { layout_id: "A", computed_at: "2026-09-29T10:00:00Z" } }, structural_loads: { peak_utilisation_percent: 90 } });
     archiveResultsByLayout({ sections: { structural_loads: { layout_id: "B", computed_at: "2026-09-29T11:00:00Z" } }, structural_loads: { peak_utilisation_percent: 50 } });`);
check("a later run on another layout does not replace the first layout's result: each iteration keeps its own",
  run("resultsForLayouts(['A']).structural_loads.peak_utilisation_percent") === 90 && run("resultsForLayouts(['B']).structural_loads.peak_utilisation_percent") === 50);
check("an iteration that had two ids gets the latest result of the two, and one never analysed gets none",
  run("resultsForLayouts(['A', 'B']).structural_loads.peak_utilisation_percent") === 50 && Object.keys(run("resultsForLayouts(['C'])")).length === 0);
check("they are kept in this browser", !!stored["sportify-analysis-results-by-layout"]);

console.log(fails ? `\n${fails} CLOSED-LOOP CHECK(S) FAILED` : "\nALL CLOSED-LOOP CHECKS PASSED");
process.exit(fails ? 1 : 0);
