// Tests for algoPlacementCore.js. Run: node tools/algoplacement-test.js
//
// The core is a port of the Rhino tool "Rooftop Sports Court Planner" (SPACE PACKING 2.py). The EXPECTED outcomes below were produced by running that tool's own
// pure-Python core (its plan_layout, exactly as the Rhino form calls it) on the same roofs, lifts and court lists, not by the code under test: how many courts it
// places, how much court area, and which court it could not fit. On top of that, every layout is re-checked here by a SEPARATE implementation of the rules (in metres,
// straight from the plan's rectangles), so a slip in the port's own validate() cannot hide a real overlap.
//
// Scenario 1 ("wide") gives the identical court rectangles in Python and in this port; the others agree on the placed count, the court area and the unplaced courts
// (later attempts use a different random generator, so their layouts may differ).
const path = require("path");
const A = require(path.join(__dirname, "..", "algoPlacementCore.js"));

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const sport = n => A.SPORTS.find(s => s.name === n);
const requests = qty => Object.entries(qty).flatMap(([n, k]) => Array.from({ length: k }, () => ({ name: n, w: sport(n).long, h: sport(n).short })));

// name, footprint, setback, lifts, courts wanted, and what the Rhino tool's core placed
const SCENARIOS = {
  wide:   { foot: rect(67.6, 21), setback: 1.5, entries: [[3, 8, 5.5, 10.5], [60, 4, 62.5, 6.5]], qty: { "Basketball Court": 1, "Multi Sport Court": 1, "Badminton": 2, "Yoga": 1, "Ping Pong": 2 },
            rhino: { placed: 6, area: 697.6, unplaced: ["Badminton"], firstCourts: [["Basketball Court", 36.5, 6.5, 58.5, 19.5], ["Multi Sport Court", 16.5, 7.5, 36.5, 19.5], ["Badminton", 1.5, 13.4, 14.9, 19.5], ["Yoga", 61.1, 8.0, 66.1, 18.0], ["Ping Pong", 29.3, 2.5, 35.0, 6.0], ["Ping Pong", 22.1, 2.5, 27.8, 6.0]] } },
  small:  { foot: rect(30, 20), setback: 1, entries: [[1.5, 9, 4, 11.5]], qty: { "Basketball Court": 1, "Badminton": 1, "Yoga": 1 }, rhino: { placed: 1, area: 286, unplaced: ["Badminton", "Yoga"] } },
  many:   { foot: rect(60, 40), setback: 1, entries: [[28, 18, 31, 21], [10, 5, 12, 7]], qty: { "Handball": 1, "Volleyball": 2, "Multi Sport Court": 2, "Calisthenics": 2, "Bocce Court": 1, "Mini Golf": 1, "Sandpit": 2 }, rhino: { placed: 11, area: 1416, unplaced: [] } },
  toobig: { foot: rect(22, 14), setback: 1, entries: [[1.5, 5, 3.5, 7]], qty: { "Handball": 1, "Yoga": 1 }, rhino: { placed: 1, area: 50, unplaced: ["Handball"] } },
  ring:   { foot: rect(40, 25), setback: 1.5, entries: [[18, 10, 21, 13]], ring: true, qty: { "Multi Sport Court": 1, "Badminton": 2, "Ping Pong": 3 }, rhino: { placed: 6, area: 463.3, unplaced: [] } },
  opt1:   { foot: rect(50, 30), setback: 1, entries: [[24, 13, 26.5, 16]], leftoverPath: true, qty: { "Basketball Court": 1, "Volleyball": 1, "Yoga": 2 }, rhino: { placed: 4, area: 514, unplaced: [] } },
  lshape: { foot: [[0, 0], [35, 0], [35, 15], [60, 15], [60, 30], [0, 30]], setback: 1.5, entries: [[4, 4, 6.5, 6.5]], qty: { "Multi Sport Court": 1, "Badminton": 2, "Yoga": 1, "Ping Pong": 2 }, rhino: { placed: 6, area: 493.4, unplaced: [] } },
};

// ── the independent checker: rules straight from the plan's rectangles, in metres ──
const EPS = 0.051;                                          // the grid is 0.1 m
const inter = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > EPS / 5 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > EPS / 5;
const grown = (r, g) => [r[0] - g, r[1] - g, r[2] + g, r[3] + g];
function shared(a, b) {                                     // length of edge two rectangles share
  const dx = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), dy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (Math.abs(a[2] - b[0]) < EPS || Math.abs(b[2] - a[0]) < EPS) return Math.max(0, dy);
  if (Math.abs(a[3] - b[1]) < EPS || Math.abs(b[3] - a[1]) < EPS) return Math.max(0, dx);
  return 0;
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    if ((y0 > y) !== (y1 > y) && x < (x1 - x0) * (y - y0) / (y1 - y0) + x0) inside = !inside;
  }
  return inside;
}
function distToEdges(x, y, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
function independentProblems(s, plan, opts) {
  const o = opts || {};
  const bad = [];
  const big = new Set(o.strictGap ? [] : A.BIG_COURTS);
  const gap = o.gap == null ? A.COURT_GAP_M : o.gap;          // the clear path asked for around every court (the Rhino tool's 1.5 m unless a test asks for more)
  const courts = plan.courts;
  courts.forEach(c => {
    // inside the footprint, and at least the setback from its edge (all four corners and the middle of every side)
    const r = c.rect;
    const pts = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]], [(r[0] + r[2]) / 2, r[1]], [(r[0] + r[2]) / 2, r[3]], [r[0], (r[1] + r[3]) / 2], [r[2], (r[1] + r[3]) / 2]];
    for (const [x, y] of pts) {
      const cx = x + (x === r[0] ? 1e-6 : x === r[2] ? -1e-6 : 0), cy = y + (y === r[1] ? 1e-6 : y === r[3] ? -1e-6 : 0);
      if (!pointInPoly(cx, cy, s.foot)) bad.push(c.name + " leaves the footprint");
      else if (distToEdges(x, y, s.foot) < s.setback - EPS) bad.push(c.name + " is closer than the setback to the roof edge");
    }
    (s.entries || []).forEach(e => { if (inter(grown(r, 0), e)) bad.push(c.name + " sits on a lift / ramp"); });
    (o.keepClear || []).forEach(k => { if (inter(r, k)) bad.push(c.name + " sits on a keep-clear box"); });
    if (Math.abs((r[2] - r[0]) - (c.rotated ? c.short : c.long)) > 1e-6 || Math.abs((r[3] - r[1]) - (c.rotated ? c.long : c.short)) > 1e-6) bad.push(c.name + " has the wrong size for its orientation");
    // a court needs 2 m of edge on a pathway, or the pathway's own width when it has been narrowed below that
    const need = Math.min(A.MIN_ACCESS_M, plan.stats.pathW);
    if (!plan.primaryRects.some(p => shared(r, p) >= need - EPS)) bad.push(c.name + " touches no primary pathway for " + need + " m");
    if (plan.primaryRects.some(p => inter(r, p))) bad.push(c.name + " overlaps a primary pathway");
  });
  for (let i = 0; i < courts.length; i++) for (let j = i + 1; j < courts.length; j++) {
    const a = courts[i], b = courts[j];
    if (inter(a.rect, b.rect)) bad.push(a.name + " overlaps " + b.name);
    else if (!(big.has(a.name) && big.has(b.name)) && inter(grown(a.rect, gap - EPS), b.rect)) bad.push(a.name + " is closer than " + gap + " m to " + b.name);
  }
  // the primary pathways are ONE network, and reach every lift / ramp
  const pr = plan.primaryRects;
  if (pr.length) {
    const seen = new Set([0]), queue = [0];
    while (queue.length) {
      const i = queue.pop();
      pr.forEach((q, j) => { if (!seen.has(j) && (inter(pr[i], q) || shared(pr[i], q) > 0 || (Math.min(pr[i][2], q[2]) - Math.max(pr[i][0], q[0]) >= -EPS && Math.min(pr[i][3], q[3]) - Math.max(pr[i][1], q[1]) >= -EPS))) { seen.add(j); queue.push(j); } });
    }
    if (seen.size !== pr.length) bad.push("the primary pathways are not one network");
  }
  (s.entries || []).forEach((e, k) => {
    if (!pr.some(p => Math.min(p[2], e[2]) - Math.max(p[0], e[0]) >= -EPS && Math.min(p[3], e[3]) - Math.max(p[1], e[1]) >= -EPS)) bad.push("lift / ramp #" + (k + 1) + " has no pathway on it");
  });
  return bad;
}

const run = async (s, settings, siteExtra) => {
  const site = A.makeSite(Object.assign({ foot: s.foot, setback: s.setback, entries: s.entries }, siteExtra || {}));
  const plan = await A.planLayout(site, requests(s.qty), Object.assign({ timeLimit: 1, seed: 1, ring: !!s.ring, leftoverPath: !!s.leftoverPath }, settings || {}));
  return { site, plan };
};

(async () => {
  const t0 = Date.now();
  for (const [name, s] of Object.entries(SCENARIOS)) {
    const { plan } = await run(s);
    const st = plan.stats, r = s.rhino;
    check(name + ": as many courts as the Rhino tool's core (" + r.placed + " of " + st.requested + ")", st.placed >= r.placed, "-> " + st.placed);
    check(name + ": at least its court area (" + r.area + " m²)", st.courtArea >= r.area - 0.5, "-> " + st.courtArea.toFixed(1));
    if (name !== "many" && name !== "ring" && name !== "opt1") check(name + ": the same courts left out (" + (r.unplaced.join(", ") || "none") + ")", JSON.stringify(plan.unplaced.map(u => u.name).sort()) === JSON.stringify(r.unplaced.slice().sort()), "-> " + plan.unplaced.map(u => u.name + ": " + u.reason).join("; "));
    check(name + ": the port's own validate() has nothing to say", plan.issues.length === 0, plan.issues.join("; "));
    const problems = independentProblems(s, plan);
    check(name + ": an independent check of the rules finds nothing", problems.length === 0, problems.slice(0, 4).join("; "));
    if (r.firstCourts) {
      const got = plan.courts.map(c => [c.name].concat(c.rect.map(v => +v.toFixed(1))));
      check(name + ": the very same court rectangles as the Rhino tool", JSON.stringify(got) === JSON.stringify(r.firstCourts));
    }
  }

  // unplaced courts come with a reason a person can act on
  const tb = await run(SCENARIOS.toobig);
  check("a court bigger than the roof says so, with the usable size", /too big for the usable area \(usable zone \d+\.\d x \d+\.\d m\)/.test(tb.plan.unplaced[0].reason), tb.plan.unplaced[0].reason);
  const fc = A.fitCheck(tb.site, 1.0, false, false);
  check("fitCheck flags what can never fit and clears what can", fc.sports["Handball"] !== "" && fc.sports["Yoga"] === "" && fc.sports["Sandpit"] === "");

  // the same seed gives the same layout; another seed is allowed to differ; Shuffle never repeats a shown layout
  const a1 = await run(SCENARIOS.many), a2 = await run(SCENARIOS.many);
  check("the same seed gives the same layout", a1.plan.signature === a2.plan.signature);
  const seen = new Set(), sigs = [];
  for (let k = 1; k <= 3; k++) {
    const sh = await run(SCENARIOS.many, { shuffle: true, variant: k, seen, timeLimit: 2 });
    check("shuffle #" + k + " places every court and passes the checks", sh.plan.unplaced.length === 0 && sh.plan.issues.length === 0 && independentProblems(SCENARIOS.many, sh.plan).length === 0, sh.plan.unplaced.map(u => u.name).join(", "));
    seen.add(sh.plan.signature); sigs.push(sh.plan.signature);
  }
  check("shuffle offers different arrangements", new Set(sigs).size >= 2, new Set(sigs).size + " different of 3");

  // the pathway narrows when a court needs the room, and says so
  const narrow = await run(SCENARIOS.wide);
  check("the pathway narrows (2.0 -> 1.0 m) when a court needs the room", narrow.plan.narrowed && narrow.plan.stats.pathW < 2.0, "-> " + narrow.plan.stats.pathW + " m");
  const fixedW = await run(SCENARIOS.wide, { minPathW: 2.0 });
  check("and does not when the narrowest allowed is 2.0 m", !fixedW.plan.narrowed && fixedW.plan.stats.pathW === 2.0 && fixedW.plan.stats.placed <= narrow.plan.stats.placed);

  // strict gap: big courts get the clear gap too, so Combine's clearance rule holds between every pair
  const strict = await run(SCENARIOS.many, { strictGap: true });
  check("strict gap: courts are >= 1.5 m apart everywhere, big or not", independentProblems(SCENARIOS.many, strict.plan, { strictGap: true }).length === 0 && strict.plan.stats.bigN === 0);

  // keep-clear boxes (an opening, a piece of equipment) are left alone and asked for nothing
  const clearBox = [30, 6, 36, 12];
  const kc = await run(SCENARIOS.wide, {}, { keepClear: [clearBox] });
  check("a keep-clear box is left free", independentProblems(SCENARIOS.wide, kc.plan, { keepClear: [clearBox] }).length === 0 && kc.plan.pathRects.every(p => !inter(p, clearBox)));

  // the garden band and the pockets: exact strips on a rectangle, cut around lifts that stand in it
  const site = A.makeSite({ foot: rect(40, 25), setback: 1.5, entries: [[0, 10, 3, 13]] });
  const bandArea = site.bandRects.reduce((sum, r) => sum + (r[2] - r[0]) * (r[3] - r[1]), 0);
  check("the garden band is the footprint less the usable zone less the lift standing in it", Math.abs(bandArea - (40 * 25 - 37 * 22 - 1.5 * 3)) < 1e-6, bandArea.toFixed(2) + " m²");
  const lsite = A.makeSite({ foot: SCENARIOS.lshape.foot, setback: 1.5, entries: [[0.5, 4, 3, 6.5]] });     // a lift standing partly in the band: 1.0 x 2.5 m of it
  check("an L-shaped roof: usable zone + garden band + the lift's cut = the footprint (within a cell ring)", Math.abs(lsite.usableArea + lsite.bandRects.reduce((sum, r) => sum + (r[2] - r[0]) * (r[3] - r[1]), 0) + 2.5 - lsite.footArea) < 0.6, lsite.usableArea.toFixed(1) + " + band, footprint " + lsite.footArea);
  let refused = "";
  try { A.makeSite({ foot: rect(10, 10), setback: 6 }); } catch (e) { refused = e.message; }
  check("a setback that leaves nothing is refused in words", /no usable area/.test(refused), refused);

  // cancelling stops the search
  let cancelled = false;
  try { await A.planLayout(site, requests({ "Yoga": 2 }), { timeLimit: 5 }, { cancelled: () => true }); } catch (e) { cancelled = !!e.cancelled; }
  check("a cancelled search throws Cancelled", cancelled);

  // the court library: the 24 reference-sheet items plus the four courts that are not in the sheet, each with the figures a person picks by
  const lib = A.SPORTS;
  check("the library has 28 entries with unique names", lib.length === 28 && new Set(lib.map(s => s.name)).size === 28, lib.length + " entries");
  check("every entry has a label, a known group and a colour", lib.every(s => s.label && A.GROUPS.includes(s.group) && Array.isArray(s.color) && s.color.length === 3));
  check("only the four courts outside the reference sheet have no dead load", lib.filter(s => s.deadLoad == null).map(s => s.name).sort().join("|") === "Basketball Court|Handball|Multi Sport Court|Volleyball");
  const sheet = { "Sprint Lane": [63.77, 1.22, 77.8, 1, 0.20], "Padel Tennis Court": [20, 10, 200, 4, 0.80], "Bocce Court": [18, 3, 54, 4, 2.50], "Multipurpose Sport Area": [22, 12, 264, 12, 0.35], "Sandpit": [4, 4, 16, null, 1.50] };
  for (const [n, [l, s, area, people, gk]] of Object.entries(sheet)) {
    const e = sport(n);
    check("library: " + n + " matches the reference sheet", e.long === l && e.short === s && Math.abs(e.long * e.short - area) < 0.1 && (e.headcount ?? null) === people && e.deadLoad === gk, e.long + " x " + e.short + ", " + e.headcount + " people, Gk " + e.deadLoad);
  }
  check("dead loads the sheet marks (Assumed) are flagged, the others are not", ["Sandpit", "Trampoline", "Rest / Hydration Area"].every(n => sport(n).assumed) && ["Yoga", "Padel Tennis Court", "Sprint Lane"].every(n => !sport(n).assumed));
  check("the new big courts get the one-sided path", ["3x3 Streetbasketball", "Padel Tennis Court", "Multipurpose Sport Area"].every(n => A.BIG_COURTS.includes(n)));

  // a size that is not a multiple of the 0.1 m grid (the 63.77 x 1.22 m sprint lane) is rounded to the grid, and must still be reported as turned when it lies across
  const tall = A.makeSite({ foot: rect(22, 70), setback: 1.5, entries: [[2, 2, 4.5, 4.5]] });
  const lane = await A.planLayout(tall, requests({ "Sprint Lane": 1 }), { timeLimit: 2, seed: 1 });
  const lc = lane.courts[0];
  // the 2 m rule the screen applies: a clear path of at least 2.0 m around EVERY court (big ones included, so none touch) and a main pathway that never narrows below it
  const rule = { strictGap: true, courtGap: 2.0, minPathW: 2.0 };
  const twoM = { foot: rect(67.6, 21), setback: 1.5, entries: [[3, 8, 5.5, 10.5], [60, 8, 62.5, 10.5]], qty: { "Badminton": 1, "Bouldering Wall": 1, "Volleyball": 1, "Padel Tennis Court": 1, "Ping Pong": 2, "Trampoline": 1, "Teqball Table": 1, "Yoga": 1, "CrossFit Training Rig": 1, "Bocce Court": 1 } };
  const strict2 = await run(twoM, rule);
  const closest = plan => { let m = Infinity; const c = plan.courts; for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { const a = c[i].rect, b = c[j].rect; m = Math.min(m, Math.max(Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2])), Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3])))); } return m; };
  check("2 m rule: every court is at least 2.0 m from every other, big courts included", strict2.plan.issues.length === 0 && independentProblems(twoM, strict2.plan, { strictGap: true, gap: 2.0 }).length === 0 && closest(strict2.plan) >= 2.0 - EPS && strict2.plan.courts.length >= 8, "closest " + closest(strict2.plan).toFixed(2) + " m, " + strict2.plan.courts.length + " placed");
  check("2 m rule: the main pathway never narrows below 2.0 m", strict2.plan.stats.pathW >= 2.0 && !strict2.plan.narrowed);
  check("2 m rule: the report states the rule", /2\.0 m path around every court and lift\/ramp side, no two courts touch/.test(A.buildReport(strict2.plan, strict2.site)));

  // placement rules: the service modules go in the roof corner nearest a lift / stair (together), items heavier than 1.4 kN/m² go along the structural grid where they can
  const rl = { foot: rect(67.6, 21), setback: 1.5 };
  const liftA = [1.5, 10, 4, 12.5], stairA = [62.5, 8.5, 64.5, 12.5];
  const gridLines = [];
  for (let i = 0; i <= 8; i++) gridLines.push({ x1: 8.4 * i, y1: 0, x2: 8.4 * i, y2: 21 });
  [0, 8.4, 16.8].forEach(y => gridLines.push({ x1: 0, y1: y, x2: 67.6, y2: y }));
  const rSite = A.makeSite({ foot: rl.foot, setback: rl.setback, entries: [liftA, stairA], anchors: [liftA, stairA] });
  const rQty = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Bocce Court": 1, "Sandpit": 1, "Yoga": 1, "Padel Tennis Court": 1 };
  const rPlan = await A.planLayout(rSite, requests(rQty), { timeLimit: 1, seed: 1, strictGap: true, courtGap: 2.0, minPathW: 2.0, rules: { serviceCorners: true, gridLines } });
  const usableBox = [rl.setback, rl.setback, 67.6 - rl.setback, 21 - rl.setback], anchorsM = [liftA, stairA];
  const corners = [[usableBox[0], usableBox[1]], [usableBox[2], usableBox[1]], [usableBox[0], usableBox[3]], [usableBox[2], usableBox[3]]];
  const toPoint = (r, p) => Math.hypot(Math.max(r[0] - p[0], 0, p[0] - r[2]), Math.max(r[1] - p[1], 0, p[1] - r[3]));
  const rectGap = (a, b) => Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0));
  const nearestCornerToAnchors = corners.map(p => [Math.min(...anchorsM.map(a => toPoint(a, p))), p]).sort((a, b) => a[0] - b[0])[0][1];
  const svc = rPlan.courts.filter(c => /Locker|Bathroom/.test(c.name));
  const alongGrid = r => { const w = r[2] - r[0], h = r[3] - r[1]; const near = (v, a, b) => Math.abs(v - (a + b) / 2) <= 0.15 || Math.abs(v - a) <= 0.15 || Math.abs(v - b) <= 0.15; return (w >= h && [0, 8.4, 16.8].some(v => near(v, r[1], r[3]))) || (h >= w && Array.from({ length: 9 }, (_, i) => 8.4 * i).some(v => near(v, r[0], r[2]))); };
  check("rules: every court is placed and the layout passes the checks", rPlan.courts.length === 6 && rPlan.issues.length === 0 && independentProblems({ foot: rl.foot, setback: rl.setback, entries: [liftA, stairA] }, rPlan, { strictGap: true, gap: 2.0 }).length === 0, rPlan.courts.length + " placed");
  check("rules: one service module sits in the roof corner nearest a lift / stair", svc.length === 2 && svc.some(c => toPoint(c.rect, nearestCornerToAnchors) < 0.15), svc.map(c => c.name.split(" ")[0] + " " + toPoint(c.rect, nearestCornerToAnchors).toFixed(2) + " m").join(", "));
  check("rules: the other is beside it, in the same corner, 2 m clear", svc.length === 2 && rectGap(svc[0].rect, svc[1].rect) >= 2.0 - EPS && rectGap(svc[0].rect, svc[1].rect) < 3.1, svc.length === 2 ? rectGap(svc[0].rect, svc[1].rect).toFixed(2) + " m" : "");
  check("rules: the heavy items that can be are along the structural grid (Bocce and Sand Pit)", ["Bocce Court", "Sandpit"].every(n => alongGrid(rPlan.courts.find(c => c.name === n).rect)));
  check("rules: the report says where the services went and what the grid did", /Services: .*corner nearest a lift\/stair/.test(A.buildReport(rPlan, rSite)) && /Heavy items along the structural grid \(12 lines from Revit\)/.test(A.buildReport(rPlan, rSite)));
  const rampSite = A.makeSite({ foot: rect(50, 25), setback: 1.5, entries: [[10, 8, 16, 9.5]], anchors: [] });
  const rampPlan = await A.planLayout(rampSite, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1 }), { timeLimit: 1, seed: 1, strictGap: true, courtGap: 2.0, minPathW: 2.0, rules: { serviceCorners: true, gridLines: [] } });
  check("rules: a ramp is not a lift or stair: with no anchor the services are placed normally and the report says why", rampPlan.courts.length === 2 && /no lift or stair on the site/.test(A.buildReport(rampPlan, rampSite)));
  const noRules = await A.planLayout(rSite, requests(rQty), { timeLimit: 1, seed: 1, strictGap: true, courtGap: 2.0, minPathW: 2.0 });
  check("rules: switched off, nothing changes (no rules report)", noRules.rulesReport === null);

  check("a sprint lane on a tall roof is placed and reported as turned 90 degrees", lane.courts.length === 1 && lc.rotated === true && lane.issues.length === 0, lc ? (lc.rect[2] - lc.rect[0]).toFixed(1) + " x " + (lc.rect[3] - lc.rect[1]).toFixed(1) + " m" : "not placed");

  console.log(fails === 0 ? "\nALL ALGORITHMIC PLACEMENT CHECKS PASSED (" + Object.keys(SCENARIOS).length + " roofs, " + ((Date.now() - t0) / 1000).toFixed(1) + " s)" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
