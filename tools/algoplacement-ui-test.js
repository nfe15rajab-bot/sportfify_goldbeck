// Tests for how algoPlacementUI.js meets the rest of Combine. Run: node tools/algoplacement-ui-test.js
//
// algoPlacementUI.js writes onto the Combine board and leans on modules other people own: zones.js (a zone is a POLYGON: `points` is the truth and the box is derived),
// basketballCourt.js and volleyballCourt.js (a SPECIFIED sport: what a court takes on the roof, and the payload it carries so that it does not follow the Sport panel
// afterwards) and assemblies.js (the build-up catalogue, fetched lazily from the API). Each of those changed under it once without a single git conflict (the merge of
// moamen/design-panel, 2026-09-20): Apply then made zones the canvas could not draw, and reserved a volleyball court a third of its real size. What it relies on is pinned here.
//
// The real scripts are loaded in the browser's order into a sandbox with a DOM that accepts everything and does nothing; the real packing core makes a plan; Apply is run.
// What this cannot see is a browser: drawing, dragging, the panels. Those were tried in one (see SESSION-NOTES / the merge commit).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── a DOM that accepts everything: any property is another such thing, calling it gives one, iterating it gives nothing ──
function nothing() {
  return new Proxy(function () {}, {
    get(_, p) { return p === Symbol.toPrimitive ? () => "" : p === Symbol.iterator || p === "then" ? undefined : p === "length" ? 0 : nothing(); },
    apply() { return nothing(); },
    construct() { return nothing(); },
    set() { return true; }
  });
}
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: { getElementById: () => nothing(), querySelector: () => nothing(), querySelectorAll: () => [], addEventListener() {}, createElement: () => nothing(), body: nothing(), documentElement: nothing(), readyState: "complete" },
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout, clearTimeout, performance: { now: () => Date.now() },
  fetch: async () => { throw new Error("no network in this test"); }
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(web, f), "utf8"), ctx, { filename: f });
const get = expr => vm.runInContext(expr, ctx);

// ── the scripts, in index.html's order (only the ones this depends on) ──
const order = [...fs.readFileSync(path.join(web, "index.html"), "utf8").matchAll(/<script src="([A-Za-z0-9_.]+\.js)/g)].map(m => m[1]);
const needed = ["escape.js", "data.js", "assemblies.js", "zones.js", "basketballCourt.js", "volleyballCourt.js", "algoPlacementCore.js", "algoPlacementUI.js"];
const missing = needed.filter(f => !order.some(o => o.toLowerCase() === f.toLowerCase()));
check("index.html loads every script this depends on", missing.length === 0, missing.join(", "));
const pos = f => order.findIndex(o => o.toLowerCase() === f.toLowerCase());
check("...in an order in which each finds what it needs (zones and the courts before the algorithmic UI)",
  pos("zones.js") < pos("algoPlacementUI.js") && pos("basketballCourt.js") < pos("algoPlacementUI.js") && pos("volleyballCourt.js") < pos("algoPlacementUI.js") && pos("assemblies.js") < pos("algoPlacementUI.js"));
for (const f of needed) load(f);

// ── what Combine gives it (combineController.js and combineField.js are DOM all the way down and are not loaded) ──
const toasts = [];
sandbox.showToast = (title, text) => toasts.push(title + " | " + text);
sandbox.refreshSuggestions = () => {}; sandbox.drawCombineCanvas = () => {}; sandbox.resetCombineView = () => {};
sandbox.snapToGrid = v => Math.round(v * 2) / 2;
sandbox.rectsOverlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);      // combineField.js
sandbox.getFootprint = item => item.rotation === 90 ? { w: item.width_m, h: item.length_m } : { w: item.length_m, h: item.width_m };     // combineField.js: the piece's size on the roof
sandbox.nearestBoundaryPoint = (roof, x, y) => ({ edge: "top", x, y: 0 });
function freshBoard() {
  sandbox.combineState = { roof: { length: 60, width: 40, boundary: null }, items: [], zones: [], entryPoints: [], tray: [], selectedId: null, selectedKind: null, zoneKind: null, zoneAssembly: null };
  get("assembliesLoaded = false; ASSEMBLIES = {}; volleyballOptionsLoaded = false; basketballOptionsLoaded = false;");
  fetched.length = 0;
  toasts.length = 0;
}
const A = get("AlgoPlacement");
const S = get("algoState");
const record = { key: "test_extensive", provider: "Test", providerCountry: "DE", systemName: "Extensive", category: "extensive", description: "", buildUpMm: 100, layers: [] };
const fetched = [];
const catalogueUp = () => { sandbox.fetch = async url => { fetched.push(String(url)); return { ok: true, json: async () => [record] }; }; };
const catalogueDown = () => { sandbox.fetch = async () => { throw new Error("connection refused"); }; };
const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const sport = n => A.SPORTS.find(s => s.name === n);

async function planFor(qty) {
  const site = A.makeSite({ foot: rect(60, 40), setback: 1, entries: [[28, 18, 31, 21]] });
  const requests = Object.entries(qty).flatMap(([n, k]) => Array.from({ length: k }, () => ({ name: n, w: sport(n).long, h: sport(n).short })));
  const plan = await A.planLayout(site, requests, { timeLimit: 1, seed: 1 });
  S.plan = plan; S.site = site; S.busy = false; S.blocks = [{ id: "blk_1", kind: "lift", x: 28, y: 18, w: 2.5, h: 2.5 }];
  return plan;
}

(async () => {
  // ── 1. the packer reserves what the specification says a court takes ──
  {
    const vFp = get("volleyballFootprint(Object.assign({}, volleyballState, { variant: 'mini' }))");
    const bFp = get("basketballFootprint(Object.assign({}, basketballState, { variant: 'mini' }))");
    get("algoAdoptSpecifiedSizes()");
    const v = sport("Volleyball"), b = sport("Basketball Court");
    check("Volleyball: the packer's table holds the specified footprint (long and short side)", near(v.long, Math.max(vFp.length_m, vFp.width_m)) && near(v.short, Math.min(vFp.length_m, vFp.width_m)), `${v.long} x ${v.short} for ${vFp.length_m} x ${vFp.width_m}`);
    check("Basketball Court: the same", near(b.long, Math.max(bFp.length_m, bFp.width_m)) && near(b.short, Math.min(bFp.length_m, bFp.width_m)), `${b.long} x ${b.short} for ${bFp.length_m} x ${bFp.width_m}`);
    check("a sport that is not specified keeps the packing tool's size (Multi Sport Court 20 x 12)", sport("Multi Sport Court").long === 20 && sport("Multi Sport Court").short === 12);
    check("adopting again changes nothing (so a plan is not thrown away for no reason)", get("algoAdoptSpecifiedSizes()") === false);
  }

  // ── 2. Apply, with the catalogue there: courts, zones, build-up ──
  {
    freshBoard(); catalogueUp();
    const plan = await planFor({ "Basketball Court": 1, "Volleyball": 1, "Multi Sport Court": 1 });
    check("the real packer places the three courts", plan.courts.length === 3, `${plan.courts.length} placed`);
    await get("algoApply()");
    const board = sandbox.combineState;
    check("Apply puts three courts on the board, every one marked algorithmic", board.items.length === 3 && board.items.every(i => i.algorithmic === true));

    // each court's footprint on the roof is the rectangle the packer laid it on, in the piece's own frame turned by its rotation
    let frameOk = true, why = "";
    for (const c of plan.courts) {
      const item = board.items.find(i => i.label === c.name), r = c.rect;
      const turned = item.rotation === 90;
      const w = turned ? item.width_m : item.length_m, h = turned ? item.length_m : item.width_m;
      if (!near(w, r[2] - r[0], 0.06) || !near(h, r[3] - r[1], 0.06)) { frameOk = false; why += ` ${c.name}: ${w} x ${h} on a ${(r[2] - r[0]).toFixed(2)} x ${(r[3] - r[1]).toFixed(2)} rectangle;`; }
    }
    check("each piece, turned as it is, fills exactly the rectangle the packer reserved for it", frameOk, why);

    const bball = board.items.find(i => i.label === "Basketball Court"), vball = board.items.find(i => i.label === "Volleyball"), multi = board.items.find(i => i.label === "Multi Sport Court");
    check("the basketball court is one the basketball module recognises, with its own payload (it does not follow the Sport panel)", get("isBasketballItem")(bball) && !!bball.sourceJson.basketball);
    check("the volleyball court is one the volleyball module recognises, with its own payload", get("isVolleyballItem")(vball) && !!vball.sourceJson.volleyball);
    check("the payload's footprint is the piece's own size (what Revit builds is what the packer reserved)",
      near(bball.sourceJson.basketball.length_m, bball.length_m) && near(bball.sourceJson.basketball.width_m, bball.width_m) && near(vball.sourceJson.volleyball.length_m, vball.length_m) && near(vball.sourceJson.volleyball.width_m, vball.width_m),
      `${vball.sourceJson.volleyball.length_m} x ${vball.sourceJson.volleyball.width_m} against ${vball.length_m} x ${vball.width_m}`);
    check("a sport nobody specifies gets no such payload", !multi.sourceJson.basketball && !multi.sourceJson.volleyball);

    const zones = board.zones;
    check("the garden becomes zones", zones.length > 0, `${zones.length} zones`);
    check("every zone is a polygon (points is the truth: without it the canvas throws)", zones.every(z => Array.isArray(z.points) && z.points.length >= 3));
    check("...whose box is derived from its points, and whose true area is the rectangle's",
      zones.every(z => { const xs = z.points.map(p => p.x_m), ys = z.points.map(p => p.y_m); return near(z.x_m, Math.min(...xs)) && near(z.y_m, Math.min(...ys)) && near(z.length_m, Math.max(...xs) - Math.min(...xs)) && near(z.width_m, Math.max(...ys) - Math.min(...ys)) && near(get("zoneAreaM2")(z), z.length_m * z.width_m); }));
    let svg = "", drew = true;
    try { svg = get("zonesSvg")(10, 0, 0); } catch (e) { drew = false; svg = String(e.message); }
    check("the zones layer draws them (one polygon each)", drew && (svg.match(/<polygon data-zone-id/g) || []).length === zones.length, drew ? "" : svg);
    const payloads = zones.map(z => get("buildZonePayload")(z));
    check("they export with their outline, and a saved session brings the same polygon back",
      payloads.every(p => p.points.length >= 3 && p.area_m2 > 0) && payloads.every((p, i) => { const back = get("zoneFromPayload")(JSON.parse(JSON.stringify(p)), i); return back.points.length === zones[i].points.length && near(back.length_m, zones[i].length_m); }));
    check("the court options were fetched before the courts were made (their weight comes from them: an Apply before the panels were ever opened exported courts that weigh 0 kg)",
      fetched.some(u => /SportOptions\?sport=volleyball/i.test(u)) && fetched.some(u => /SportOptions\?sport=basketball/i.test(u)) && get("volleyballOptionsLoaded") === true && get("basketballOptionsLoaded") === true, fetched.join(" "));
    check("the catalogue was fetched before the zones were made, so they carry a build-up", get("assembliesLoaded") === true && zones.every(z => z.assemblyKey === "test_extensive"), zones.map(z => z.assemblyKey).join(","));
    check("nothing is warned about", !toasts.some(t => /build-up/i.test(t)), toasts.join(" // "));
  }

  // ── 3. Apply with the API down: the zones are made anyway, and it says why ──
  {
    freshBoard(); catalogueDown();
    await planFor({ "Basketball Court": 1, "Volleyball": 1 });
    await get("algoApply()");
    const board = sandbox.combineState;
    check("without the catalogue the courts and zones are still placed", board.items.length === 2 && board.zones.length > 0);
    check("...the zones have no build-up, and the toast says so in words (Revit would skip them silently)", board.zones.every(z => !z.assemblyKey) && toasts.some(t => /build-up/i.test(t) && /API/i.test(t)), toasts.join(" // "));
  }

  // ── 4. a court whose specification changes in the Sport panel after the layout was checked is not applied on the old size ──
  {
    freshBoard(); catalogueUp();
    await planFor({ "Basketball Court": 1 });
    get("basketballState.hoops = 'one'");                                   // a half court: 11 m along its own length, 13 across
    await get("algoApply()");
    check("Apply refuses, throws the stale plan away and says why", sandbox.combineState.items.length === 0 && S.plan === null && toasts.some(t => /sizes changed/i.test(t)), toasts.join(" // "));
    const b = sport("Basketball Court");
    check("the packer now reserves the half court (13 x 11) and knows its own length runs the short way", near(b.long, 13) && near(b.short, 11) && b.swap === true, `${b.long} x ${b.short} swap=${b.swap}`);

    const plan = await planFor({ "Basketball Court": 1 });
    await get("algoApply()");
    const item = sandbox.combineState.items[0], c = plan.courts[0];
    const turned = item.rotation === 90, w = turned ? item.width_m : item.length_m, h = turned ? item.length_m : item.width_m;
    check("a half court is created in the specification's orientation (11 long, 13 wide) and turned onto the packer's rectangle",
      near(item.length_m, 11) && near(item.width_m, 13) && near(w, c.rect[2] - c.rect[0], 0.06) && near(h, c.rect[3] - c.rect[1], 0.06), `${item.length_m} x ${item.width_m} rotation ${item.rotation} on ${(c.rect[2] - c.rect[0]).toFixed(1)} x ${(c.rect[3] - c.rect[1]).toFixed(1)}`);
    get("basketballState.hoops = 'two'");
  }

  console.log(fails === 0 ? "\nALL ALGORITHMIC PLACEMENT UI CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.log("FAIL  the test itself threw: " + (e && e.stack || e)); process.exit(1); });
