// Tests for the one store of analysis results (resultsStoreCore.js, resultsStore.js). Run: node tools/results-store-test.js
//
// One list of analyses and one function for each thing a reader is told about one (tone, chip, headline), read by every screen: the Results tab's overview (a tile per analysis), the cards under
// each group of that tab, and Combine's inspector (the analyses that apply to the selected piece, live). This pins the rule (Revit's full analysis when it has run, else this app's quick estimate,
// else not run), the words, that the catalogue is the same list the Revit add-in publishes under, and, with the REAL scripts in a vm on a small layout, that a tile and its card say the same
// thing, that a result about an earlier layout is flagged and not left saying "holds", and that a piece's rows follow the layout as it changes.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const core = require(path.join(web, "resultsStoreCore.js"));
const { RESULTS_CATALOGUE: CAT, RESULTS_GROUPS: GROUPS } = core;

// ---------------------------------------------------------------------------------------------------------------- the catalogue
const icons = read("vendor/tabler-icons/tabler-icons.css");
check("every analysis has a unique key, a title, a short name and an icon that exists in the icon font", new Set(CAT.map(e => e.key)).size === CAT.length && CAT.every(e => e.title && e.short && icons.includes("." + e.icon + ":")));
check("every group has an icon that exists, and every analysis is in a group that exists", GROUPS.every(g => g.label && icons.includes("." + g.icon + ":")) && CAT.every(e => GROUPS.some(g => g.id === e.group)));
check("the quick estimates are five: fire, access, water, wind, lca, each for exactly one analysis", CAT.filter(e => e.estimate).map(e => e.estimate).sort().join() === "access,fire,lca,water,wind");
check("only fire, accessibility, wind and LCA are said of every piece, and rain of garden pieces only", CAT.filter(e => e.piece === "all").map(e => e.key).sort().join() === "accessibility,fire_safety,lca,wind_erosion" && CAT.filter(e => e.piece === "garden").map(e => e.key).join() === "soil_percolation");
check("a piece is only spoken of by an analysis that has a quick estimate (Revit's zones carry a label, not a piece id: nothing of Revit's is guessed onto a piece)", CAT.filter(e => e.piece).every(e => e.estimate));

// against the real analysisResults.js: the same keys, titles, groups, order
function nothing() {
  return new Proxy(function () {}, {
    get(_, p) { return p === Symbol.toPrimitive ? () => "" : p === Symbol.iterator || p === "then" ? undefined : p === "length" ? 0 : nothing(); },
    apply() { return nothing(); }, construct() { return nothing(); }, set() { return true; }
  });
}
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} }, Math, Set, Map, Int16Array, Int32Array, JSON, Date,
  document: { getElementById: () => nothing(), querySelector: () => nothing(), querySelectorAll: () => [], addEventListener() {}, createElement: () => nothing(), body: nothing(), readyState: "complete" },
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  fetch: async () => { throw new Error("no network in this test"); }
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(read(f), ctx, { filename: f });
const get = expr => vm.runInContext(expr, ctx);
vm.runInContext("function getFootprint(obj) { const rotated = (obj.rotation % 180) !== 0; return { w: rotated ? obj.width_m : obj.length_m, h: rotated ? obj.length_m : obj.width_m }; }", ctx);
for (const f of ["escape.js", "data.js", "rules.js", "carbon.js", "gardenData.js", "resultsStoreCore.js", "analysisController.js", "analysisResults.js", "resultsStore.js", "inspector.js"]) load(f);

const SECTIONS = get("RESULT_SECTIONS"), RAIL = get("ANALYSIS_SUBTABS");
check("the catalogue is the list of sections the add-in publishes (RESULT_SECTIONS) without kinetics, which lives in the Improve tab", Object.keys(SECTIONS).filter(k => k !== "kinetics").sort().join() === CAT.map(e => e.key).sort().join());
check("its titles are the sections' titles", CAT.every(e => SECTIONS[e.key].title === e.title));
check("the groups are the tab's rail (same ids, labels, icons, in the same order) without the overview and the site conditions, and each group holds the sections the rail says it holds",
  RAIL.filter(t => t.id !== "overview" && t.id !== "conditions").map(t => t.id + ":" + t.label + ":" + t.icon).join() === GROUPS.map(g => g.id + ":" + g.label + ":" + g.icon).join()
  && GROUPS.every(g => RAIL.find(t => t.id === g.id).sections.join() === core.resultsInGroup(g.id).map(e => e.key).join()));
check("the overview of the tab is the first button of the rail, and says it is the whole layout at a glance", RAIL[0].id === "overview" && /whole layout at a glance/.test(RAIL[0].title));

// ---------------------------------------------------------------------------------------------------------------- the words of the quick estimates
const E = core.estimateSummary;
check("nothing placed: tone none, and it says what to do", E("fire", { status: "empty" }).tone === "none" && /Push a sport/.test(E("fire", { status: "empty" }).note));
check("no entry point: tone none, and it asks for one", E("fire", { status: "no-entries" }).chip === "needs an entry" && /entry point/.test(E("access", { status: "no-entries" }).note));
check("fire safety: unreachable pieces are bad, over the limit is a warning, within is ok, with the longest route and the limit said", E("fire", { status: "fail", unreachableCount: 2 }).tone === "bad" && E("fire", { status: "ok", withinLimit: false, maxDist: 41.26, maxTravelDistance: 35 }).tone === "warn"
  && E("fire", { status: "ok", withinLimit: true, maxDist: 18.4, maxTravelDistance: 35 }).headline === "18.4 m longest route (limit 35 m)");
check("accessibility: ok only when the width and the reach are both ok", E("access", { status: "ok", widthOk: true, reachOk: true, currentWidth: 1.8 }).tone === "ok" && E("access", { status: "ok", widthOk: true, reachOk: false, currentWidth: 1.8 }).tone === "warn" && E("access", { status: "ok", widthOk: false, reachOk: true, currentWidth: 1.2 }).chip === "check needed");
check("water is a neutral estimate, wind counts what is near the edge, LCA says how many pieces lack data", E("water", { status: "ok", retentionPercent: 54 }).tone === "neutral" && E("wind", { status: "ok", exposedCount: 2, totalCount: 5 }).chip === "2 exposed" && E("wind", { status: "ok", exposedCount: 0, totalCount: 5 }).tone === "ok"
  && E("lca", { status: "ok", coveredCount: 0, totalCount: 3 }).chip === "no data" && E("lca", { status: "ok", coveredCount: 2, missingCount: 1, totalKg: 12345.6 }).headline === "~12,346 kg CO₂e" && E("lca", { status: "ok", coveredCount: 3, missingCount: 0, totalKg: 10 }).chip === "complete");

// ---------------------------------------------------------------------------------------------------------------- the words of Revit's analyses
const R = core.revitSummary;
check("soil percolation: saturating build-ups warn, under target warns, otherwise within target", R("soil_percolation", { zones_saturated_in_cloudburst: 1, steady_retained_percent: 61 }).chip === "1 fill up" && R("soil_percolation", { zones_below_target: 2 }).chip === "2 under target" && R("soil_percolation", { steady_retained_percent: 61 }).tone === "ok" && R("soil_percolation", { steady_retained_percent: 61 }).headline === "61% of steady rain kept");
check("wind and erosion: a failing tree or a build-up that lifts is bad, marginal trees warn", R("wind_erosion", { trees_failing: 1, trees_checked: 4 }).tone === "bad" && R("wind_erosion", { zones_uplift_flagged: 1 }).chip === "action needed" && R("wind_erosion", { trees_marginal: 1 }).tone === "warn" && R("wind_erosion", { peak_pressure_pa: 812 }).headline === "812 Pa peak pressure");
check("structural loads: PRELIMINARY wins over every verdict (it rests on inputs nobody confirmed), then over capacity, unbalanced, within", R("structural_loads", { preliminary: true, bays_over_capacity: 3 }).tone === "prelim" && R("structural_loads", { preliminary: true }).preliminary === true && R("structural_loads", { bays_over_capacity: 3 }).chip === "3 bays over"
  && R("structural_loads", { balance_status: "heavy on one side" }).chip === "unbalanced" && R("structural_loads", { balance_status: "balanced" }).chip === "within capacity");
check("dynamic analysis: PRELIMINARY first, then bays that vibrate or a case over 100%, else within limits", R("dynamic_analysis", { preliminary: true }).chip === "PRELIMINARY" && R("dynamic_analysis", { bays_exceeding_comfort: 2, bays_checked: 9 }).headline === "2 of 9 bays vibrate" && R("dynamic_analysis", { worst_case_utilisation_percent: 120 }).tone === "bad" && R("dynamic_analysis", { lowest_frequency_hz: 4.2, highest_frequency_hz: 6.8 }).headline === "deck 4.2 to 6.8 Hz");
check("sun and shade: a result from before the analysis existed is 'old result', not a verdict; with equipment the chip says how many are still too sunny", R("sun_and_shading", {}).chip === "old result" && R("sun_and_shading", { days: [], people_zones_too_sunny: 3, people_zones: 5, pieces: 2, people_zones_too_sunny_after: 1 }).chip === "3 too sunny, 1 after" && R("sun_and_shading", { days: [] }).chip === "balanced" && R("sun_and_shading", { days: [], preliminary: true }).tone === "prelim");
check("ball trajectories: leaving the roof beats crossings, else contained", R("ball_trajectory", { percent_leaving_roof: 12.4, crossing_count: 3 }).chip === "12% leave the roof" && R("ball_trajectory", { crossing_count: 3 }).chip === "3 crossings" && R("ball_trajectory", {}).chip === "contained");
check("fire safety, accessibility, LCA and carbon in Revit: the words of the cards", R("fire_safety", { within_limit: true, unreachable_count: 0, max_dist_m: 20, max_travel_distance_m: 35 }).chip === "within the limit" && R("fire_safety", { within_limit: true, unreachable_count: 1 }).chip === "1 unreachable" && R("fire_safety", { within_limit: false }).chip === "too far"
  && R("accessibility", { width_ok: false, reach_ok: true }).chip === "too narrow" && R("accessibility", { width_ok: true, reach_ok: false }).chip === "not reachable" && R("lca", { missing_count: 2, total_kg: 1000 }).chip === "2 pieces missing data" && R("carbon_impact", { estimated_daily_wh: 84 }).headline === "~84 Wh/day");
check("what it does not know says nothing (tone none), never throws", ["nonsense", "lca"].every(k => R(k, null).tone === "none" && R(k, 42).tone === "none") && R("nonsense", {}).tone === "none");

// ---------------------------------------------------------------------------------------------------------------- which result an analysis shows
const est = E("fire", { status: "ok", withinLimit: true, maxDist: 18.4, maxTravelDistance: 35 });
const rev = R("fire_safety", { within_limit: false, unreachable_count: 0, max_dist_m: 41, max_travel_distance_m: 35 });
let p = core.pickResult(est, rev, { state: "current" });
check("Revit's full analysis wins over the quick estimate when it has run on this layout", p.source === "revit" && p.chip === "too far" && p.freshness === "current" && /Full analysis · Revit · this layout/.test(core.resultSourceText(p)));
p = core.pickResult(est, rev, { state: "stale", computedAt: "2026-09-26T10:00:00Z" });
check("...but if it is about an earlier layout it is flagged out of date and warns, never left saying 'too far' or 'holds' as if it were current", p.source === "revit" && p.chip === "out of date" && p.tone === "warn" && p.freshness === "stale" && /out of date/.test(core.resultSourceText(p)));
check("no stamp: it says the layout is not known, and 'nothing on screen to compare with' is not called 'this layout'", /layout not stamped/.test(core.resultSourceText(core.pickResult(est, rev, { state: "unknown" }))) && !/this layout/.test(core.resultSourceText(core.pickResult(est, rev, { state: "unchecked" }))));
p = core.pickResult(est, null, null);
check("no Revit result: the quick estimate, said to be this app's, live", p.source === "estimate" && p.chip === "within limit" && core.resultSourceText(p) === "Quick estimate · this app · live");
p = core.pickResult(null, null, null);
check("neither: not run, with what to do, and it is never presented as ok", p.source === "none" && p.tone === "none" && p.headline === "Run it in Revit" && core.resultSourceText(p) === "Not run yet");
check("a PRELIMINARY Revit result keeps its mark on the tile", core.pickResult(null, R("structural_loads", { preliminary: true }), { state: "current" }).preliminary === true);

// the overview from raw inputs
const sections = { wind_erosion: { trees_failing: 1, trees_checked: 3, peak_pressure_pa: 900 }, structural_loads: { preliminary: true, peak_utilisation_percent: 96 }, sections: {} };
const tiles = core.buildResultsOverview({
  estimates: { fire: { status: "ok", withinLimit: true, maxDist: 18.4, maxTravelDistance: 35 }, access: { status: "empty" }, water: { status: "empty" }, wind: { status: "ok", exposedCount: 1, totalCount: 4 }, lca: { status: "ok", coveredCount: 2, missingCount: 0, totalKg: 500 } },
  sections, freshness: k => k === "wind_erosion" ? { state: "stale", computedAt: "2026-09-26T10:00:00Z" } : { state: "current" }
});
const tile = k => tiles.find(t => t.key === k);
check("the overview has one tile per analysis in the catalogue's order", tiles.map(t => t.key).join() === CAT.map(e => e.key).join());
check("wind: Revit's result is stale, so the tile says out of date (and not the estimate's 'exposed')", tile("wind_erosion").source === "revit" && tile("wind_erosion").chip === "out of date" && tile("wind_erosion").hasEstimate && tile("wind_erosion").hasRevit);
check("structure: PRELIMINARY from Revit; dynamics: not run and has no estimate; fire: the estimate; LCA: the estimate", tile("structural_loads").preliminary && tile("structural_loads").chip === "PRELIMINARY" && tile("dynamic_analysis").source === "none" && !tile("dynamic_analysis").hasEstimate && tile("fire_safety").source === "estimate" && tile("lca").headline === "~500 kg CO₂e");
check("an analysis with an estimate but nothing placed says there is nothing to check (tone none), and is still the estimate's tile", tile("accessibility").source === "estimate" && tile("accessibility").tone === "none" && tile("accessibility").chip === "nothing placed");
const counts = core.resultsOverviewCounts(tiles);
check("the counts above the tiles add up, and say what is stale", counts.revit + counts.estimate + counts.none === CAT.length && counts.stale === 1 && counts.prelim === 1 && /2 full from Revit \(1 out of date\)/.test(core.resultsOverviewLine(counts)));
check("with nothing sent and nothing computed, no tile claims a result", core.buildResultsOverview({}).every(t => t.source === "none" && t.tone === "none" && !t.hasRevit));

// ---------------------------------------------------------------------------------------------------------------- one piece
check("a garden piece gets the rain analysis; a court does not; all get fire, accessibility, wind, LCA, in the catalogue's order", core.pieceAnalysisKeys({ kind: "garden" }).join() === "soil_percolation,wind_erosion,fire_safety,accessibility,lca" && core.pieceAnalysisKeys({ kind: "field" }).join() === "wind_erosion,fire_safety,accessibility,lca");
const PS = core.pieceSummary;
check("fire, one piece: no entry, unreachable, and a route judged against the limit", PS("fire_safety", { state: "no-entries" }).tone === "none" && PS("fire_safety", { state: "unreachable" }).tone === "bad" && PS("fire_safety", { state: "ok", lengthM: 12.34, limitM: 35 }).chip === "12.3 m" && PS("fire_safety", { state: "ok", lengthM: 40, limitM: 35 }).tone === "warn");
check("accessibility, one piece: reachable and wide enough is ok; the wording says circulation width is a layout-wide setting", PS("accessibility", { reachable: true, widthOk: true, currentWidth: 1.8, minWidth: 1.5 }).tone === "ok" && PS("accessibility", { reachable: false, widthOk: true, currentWidth: 1.8, minWidth: 1.5 }).chip === "not reachable" && /layout-wide/.test(PS("accessibility", { reachable: true, widthOk: true, currentWidth: 1.8, minWidth: 1.5 }).text));
check("wind, one piece: outside the roof is bad, inside the exposure zone warns, else clear", PS("wind_erosion", { distM: -0.5, zoneM: 2 }).tone === "bad" && PS("wind_erosion", { distM: 1.2, zoneM: 2 }).chip === "near the edge" && PS("wind_erosion", { distM: 3, zoneM: 2 }).tone === "ok");
check("LCA, one piece: no material, not in the catalogue, no figure, a figure", PS("lca", { material: null }).chip === "no material" && PS("lca", { material: "X", why: "not in the catalogue", kg: null }).chip === "not in the catalogue" && PS("lca", { material: "X", kg: null }).tone === "warn" && PS("lca", { material: "X", kg: 340.2, areaM2: 10, kgPerM2: 34, unit: "kg CO2e/m2" }).chip === "~340 kg");
check("the worst tone is the one the eye should go to first", core.worstTone(["ok", "warn", "none"]) === "warn" && core.worstTone(["ok", "bad", "warn"]) === "bad" && core.worstTone(["none", "neutral"]) === "neutral" && core.worstTone([]) === "none");

// ---------------------------------------------------------------------------------------------------------------- the real scripts on a small layout
const item = (id, kind, x, y, l, w, extra) => Object.assign({ id, kind, x_m: x, y_m: y, rotation: 0, length_m: l, width_m: w, label: id, sourceJson: {} }, extra || {});
sandbox.combineState = {
  roof: { length: 40, width: 20 },
  items: [item("court", "field", 12, 6, 10, 6, { sourceJson: { materials: { quality_level: "standard" } } }), item("bed", "garden", 26, 6, 6, 4, { sourceJson: { garden: { theme: "custom", materials: {} } } }), item("edge", "activity", 0.5, 15, 3, 2)],
  entryPoints: [{ x_m: 0, y_m: 10, edge: "left" }], selectedKind: "item", selectedId: "court", zones: [], suggestions: []
};
vm.runInContext("analysisMaterialsCache = [{ name: 'Rubber granulate', embodiedCarbonValue: 12.5 }]; analysisParametersCache = [];", ctx);
const state = get("resultsState");
state.payload = null; state.connected = false; state.raw = null;
const bridge = { stamp: 1, layoutIdNow: "aaaa" };
sandbox.workspaceState = bridge;

const overview = get("resultsStoreOverview")();
check("with the real estimates, the five with a quick estimate are the estimate's tiles and the five without are not run", overview.filter(t => t.source === "estimate").map(t => t.key).sort().join() === "accessibility,fire_safety,lca,soil_percolation,wind_erosion" && overview.filter(t => t.source === "none").length === 5);
check("the fire tile says what the layout-wide estimate says (the same function, analyzeFireSafety)", (() => { const a = get("analyzeFireSafety")(); return overview.find(t => t.key === "fire_safety").headline.startsWith(a.maxDist.toFixed(1) + " m longest route"); })());
check("two pieces are inside the wind exposure zone... the tile counts them from the same place the card does", overview.find(t => t.key === "wind_erosion").headline === get("resultsStoreEstimates")().wind.exposedCount + " of 3 pieces near the roof edge");

// a tile and its card say the same thing, for the estimate and for Revit's full analysis
const chipOf = html => { const m = /<span class="res-chip tone-([a-z]+)">([^<]*)<\/span>/.exec(html); return m ? { tone: m[1], chip: m[2] } : null; };
function agree(t, html, what) {
  const c = chipOf(html);
  return c && c.chip === t.chip && c.tone === (t.tone === "none" ? "neutral" : t.tone);
}
check("every analysis: the tile and the card it opens say the same chip and tone (quick estimate or not run)", overview.every(t => agree(t, get("resultsCardHtml")(t.key))));
check("...each card has its anchor (a tile scrolls to it) and its icon", overview.every(t => get("resultsCardHtml")(t.key).includes(`id="res-${t.key}"`)) && overview.filter(t => t.source === "estimate").every(t => get("resultsCardHtml")(t.key).includes(t.icon)));
check("...an estimate's card says it is this app's quick estimate; a not-run card does not claim a source", get("resultsCardHtml")("fire_safety").includes("Quick estimate · this app · live") && !get("resultsCardHtml")("dynamic_analysis").includes("res-source"));

const full = {
  soil_percolation: { zones_checked: 3, zones_below_target: 1, steady_retained_percent: 62, zones: [] },
  wind_erosion: { trees_checked: 4, trees_failing: 0, trees_marginal: 1, peak_pressure_pa: 780, roof_height_m: 14 },
  structural_loads: { preliminary: true, preliminary_note: "PRELIMINARY: deck capacity not confirmed", bays_over_capacity: 1, peak_utilisation_percent: 104, worst_bay: "B2", bays: [], inputs: [] },
  dynamic_analysis: { preliminary: false, bays_exceeding_comfort: 0, bays_checked: 6, lowest_frequency_hz: 4.5, highest_frequency_hz: 7.1, cases: [], inputs: [] },
  sun_and_shading: { days: [{ name: "21 June" }], zones: [], equipment: [], people_zones: 2, people_zones_too_sunny: 1, garden_zones: 1, garden_zones_too_shaded: 0, pieces: 0, preliminary: false },
  ball_trajectory: { shots_simulated: 40, crossing_count: 2, swept_shots: 0, percent_leaving_roof: 0 },
  fire_safety: { within_limit: false, unreachable_count: 0, max_dist_m: 41, max_travel_distance_m: 35 },
  accessibility: { width_ok: true, reach_ok: false, current_width_m: 1.8, min_width_m: 1.5 },
  lca: { missing_count: 1, total_kg: 900, covered_count: 2, total_count: 3 },
  carbon_impact: { estimated_daily_wh: 84, active_surface_area_m2: 300 },
  sections: Object.fromEntries(Object.keys(SECTIONS).filter(k => k !== "kinetics").map(k => [k, { layout_id: "aaaa", computed_at: "2026-09-26T10:00:00Z" }]))
};
state.payload = JSON.parse(JSON.stringify(full));
let ov = get("resultsStoreOverview")();
check("with Revit's ten sections received for this layout, every tile is Revit's full analysis, current", ov.every(t => t.source === "revit" && t.freshness === "current"));
check("...and every tile says what its card says (the ten cards of Revit's results)", ov.every(t => agree(t, get("resultsCardHtml")(t.key))), ov.filter(t => !agree(t, get("resultsCardHtml")(t.key))).map(t => t.key + " tile=" + t.chip + " card=" + JSON.stringify(chipOf(get("resultsCardHtml")(t.key)))).join(" | "));
check("...a card of Revit's says so, and for this layout", get("resultsCardHtml")("fire_safety").includes("Full analysis · Revit · this layout"));
check("the structural tile is marked PRELIMINARY and the count line says so", ov.find(t => t.key === "structural_loads").preliminary && core.resultsOverviewCounts(ov).prelim === 1);

bridge.layoutIdNow = "bbbb";
ov = get("resultsStoreOverview")();
check("the layout on screen changed: every tile is out of date, and so is every card (one rule)", ov.every(t => t.chip === "out of date" && t.freshness === "stale") && ov.every(t => get("resultsCardHtml")(t.key).includes(">out of date<")));
bridge.layoutIdNow = "aaaa";
delete state.payload.wind_erosion; delete state.payload.sections.wind_erosion;
ov = get("resultsStoreOverview")();
check("one section missing: that analysis falls back to the quick estimate, the others stay Revit's", ov.find(t => t.key === "wind_erosion").source === "estimate" && ov.filter(t => t.source === "revit").length === 9);

// the tab's overview
const html = get("resultsOverviewHtml")();
check("the overview draws a tile per analysis (one button each) under a heading per group, with the rule and the counts", (html.match(/class="result-tile /g) || []).length === CAT.length && GROUPS.every(g => html.includes(`data-group="${g.id}"`)) && html.includes(core.RESULTS_RULE.slice(0, 22)) && /full from Revit/.test(html));
check("...each tile names what it opens, and says where its number comes from", CAT.every(e => html.includes(`data-result="${e.key}"`)) && /Full analysis · Revit · this layout/.test(html) && /Quick estimate · this app · live/.test(html));
check("...and points to Combine for one piece", /Select it in Combine/.test(html) && html.includes("btn-results-open-combine"));
check("the overview is not redrawn when nothing it shows changed", (() => { get("resultsOverviewHtml")(); let redrawn = false; sandbox.renderAnalysisContent = () => { redrawn = true; }; get("renderAnalysisOverviewIfChanged")(); const same = !redrawn; bridge.stamp++; get("renderAnalysisOverviewIfChanged")(); return same && redrawn; })());

// one piece, live
const inspectorHtml = () => { const host = { hidden: true, innerHTML: "", querySelectorAll: () => [], querySelector: () => null }; sandbox.__host = host; return host; };
const c = get("computeCirculation")(sandbox.combineState, get("DESIGN_RULES"));
const rows = id => get("resultsPieceRows")(sandbox.combineState.items.find(i => i.id === id), c);
check("a court has four rows, a garden bed five (with the rain one), in the catalogue's order", rows("court").map(r => r.key).join() === "wind_erosion,fire_safety,accessibility,lca" && rows("bed").map(r => r.key).join() === "soil_percolation,wind_erosion,fire_safety,accessibility,lca");
const wind = id => rows(id).find(r => r.key === "wind_erosion").sum;
check("the piece 0.5 m from the roof edge is near the edge, the court in the middle is clear (the same distance rule as the layout-wide card)", wind("edge").tone === "warn" && wind("court").tone === "ok" && /near the edge/.test(wind("edge").chip));
check("the fire row is the piece's own route to the nearest entry", /m$/.test(rows("court").find(r => r.key === "fire_safety").sum.chip) && rows("court").find(r => r.key === "fire_safety").sum.tone === "ok");
sandbox.combineState.items.find(i => i.id === "court").x_m = 30; sandbox.combineState.items.find(i => i.id === "court").y_m = 14;
check("moving the piece changes its rows at once (they are worked out from the layout on screen, not remembered)", wind("court").tone === "warn" && /Live|m from the nearest roof edge/.test(wind("court").text));
sandbox.combineState.items.find(i => i.id === "court").x_m = 12; sandbox.combineState.items.find(i => i.id === "court").y_m = 6;

const strip = get("resultsPieceHtml")(sandbox.combineState.items.find(i => i.id === "bed"), c);
check("the strip: an icon button per analysis with its tone and a title that says the figure, and the open analysis's own words", (strip.match(/class="piece-res-icon /g) || []).length === 5 && /title="Rain and soil percolation: ~\d+% of the rain kept"/.test(strip) && /piece-results-detail/.test(strip) && /live, quick estimates/.test(strip));
check("...the open row is the one that needs the most attention when the reader has not picked one", (() => { const s = get("resultsPieceHtml")(sandbox.combineState.items.find(i => i.id === "edge"), c); return /is-open" data-result="wind_erosion"/.test(s); })());
check("...it says these are quick estimates and what Revit has for the whole layout (Revit's figures are about the roof, not the piece)", /Quick estimate · this app · live/.test(strip) && /Full analysis in Revit: run on this layout/.test(strip));
state.payload = null;
check("...without a Revit result it says the full analysis is not run", /Full analysis in Revit: not run/.test(get("resultsPieceHtml")(sandbox.combineState.items.find(i => i.id === "bed"), c)));
check("the inspector adds the strip for a placed piece only, and is given the routing the canvas just computed", /resultsPieceHtml\(sel\.obj, circulation\)/.test(read("inspector.js")) && /sel\.kind === "item"/.test(read("inspector.js")) && /renderInspector\(circulation\)/.test(read("combineField.js")));

// ---------------------------------------------------------------------------------------------------------------- what is left of the old explorer, and the page
const page = read("index.html");
check("the old per-component explorer is gone from the Results tab (its analyses are in Combine's inspector now)", !/renderComponentExplorer|analysis-component-list|componentSections/.test(read("analysisController.js")) && !/analysis-component/.test(read("style.css")));
check("the scripts are loaded in order: the core before the analyses that use it, the drawing after analysisResults.js", (() => { const at = f => page.indexOf(`<script src="${f}?v=`); return at("resultsStoreCore.js") > 0 && at("resultsStoreCore.js") < at("analysisController.js") && at("analysisResults.js") < at("resultsStore.js") && at("resultsStore.js") < at("main.js"); })());
check("the overview is polled like the other groups (it shows what Revit sent): setAnalysisSub no longer stops polling, and main.js polls the whole tab and once on Combine", !/stopResultsPolling\(\); else startResultsPolling/.test(read("analysisResults.js")) && /isPostAnalysis \|\| isAnalysis/.test(read("main.js")) && /isCombine && typeof pollAnalysisResults/.test(read("main.js")));
check("the words are plain: no 'bridge' anywhere in the store", !/bridge/i.test(read("resultsStoreCore.js")) && !/bridge/i.test(read("resultsStore.js")));

// polling: often while Revit answers, rarely while it is closed, and never two chains
(async () => {
  const timers = [];
  sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  sandbox.clearTimeout = () => {};
  sandbox.localFetch = async () => { throw new Error("Revit is closed"); };
  state.connected = null; state.payload = null; state.raw = null;
  get("stopResultsPolling")();
  get("startResultsPolling")();
  await Promise.resolve();
  check("polling asks at once and then every 3 s while it does not yet know", timers.length === 1 && timers[0].ms === 3000);
  await timers[0].fn();
  check("once Revit is known to be closed it asks only every 10 s (each question to a closed add-in is a refused connection in the browser's log)", state.connected === false && timers.length === 2 && timers[1].ms === 10000);
  get("stopResultsPolling")(); get("startResultsPolling")();
  const n = timers.length;
  await timers[1].fn();
  check("a stop then a start while a question is still out leaves one chain asking, not two", timers.length === n);
  get("stopResultsPolling")();
  const m = timers.length;
  await timers[timers.length - 1].fn();
  check("after a stop nothing asks again", timers.length === m);

  console.log(fails === 0 ? "\nALL RESULTS STORE CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})();
