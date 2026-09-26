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

  // zoning: a lift sitting fully inside the garden band still gets a landing and joins the primary network - the band keeps outdoor items and ordinary pathway
  // routing off it, but a lift/ramp/stair is allowed there (it always was, for the entry itself; only its landing/corridor were wrongly blocked by the same mask)
  const bandLift = [0, 0, 2.5, 2.5];   // 2.5 x 2.5 m in the very corner of a 1.5 m setback: entirely inside the band on both axes
  const bandSite = A.makeSite({ foot: rect(68, 21), setback: 1.5, entries: [bandLift], anchors: [bandLift], zoning: true });
  const bandPlan = await A.planLayout(bandSite, requests({ "Padel Tennis Court": 1, "Ping Pong": 2, "Badminton": 1 }), { timeLimit: 3, seed: 1, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } });
  check("zoning: a lift entirely inside the garden band still gets a landing (no 'no free landing' warning)", !bandPlan.warnings.some(w => /no free landing/.test(w)), bandPlan.warnings.join("; "));
  check("zoning: ...and at least some of what was asked for is placed (the corridor reaches it)", bandPlan.stats.placed > 0 && bandPlan.issues.length === 0, "placed " + bandPlan.stats.placed + " of " + bandPlan.stats.requested + "; " + bandPlan.issues.join("; "));

  // zoning: garden items (Yoga, Calisthenics) are not placed dead last every attempt - a big outdoor cluster on a roof with room to spare must not starve them of a spot
  const gRoof = A.makeSite({ foot: rect(67.6, 21), setback: 1.5, entries: [[1.5, 9, 4, 11.5]], anchors: [[1.5, 9, 4, 11.5]], zoning: true });
  const gQty = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2, "Bouldering Wall": 1, "Pickleball Court": 1, "Modular Tower Slide": 1, "Teqball Table": 1, "CrossFit Training Rig": 1, "Balance Logs": 1, "TRX Suspension Frame": 1, "HIIT Turf Grid": 1, "Sandpit": 1, "Yoga": 1, "Calisthenics": 1 };
  for (const seed of [1, 2, 3]) {
    const gPlan = await A.planLayout(gRoof, requests(gQty), { timeLimit: 8, seed, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } });
    check("zoning: seed " + seed + ": garden items are not starved by the outdoor cluster (everything placed)", gPlan.unplaced.length === 0 && gPlan.issues.length === 0, gPlan.unplaced.map(u => u.name + ": " + u.reason).join("; ") + " " + gPlan.issues.join("; "));
  }

  // zoning: the indoor zone's own arrangement adapts so its bounding box - and so the wall built whole around it - never crosses a lift or stair sitting near
  // it; the wall itself is never cut to dodge one (always the full ring, split only by its one door: 5 rectangles, never more)
  const wStair = [0, 9, 4, 13], wLift = [0, 13, 2.5, 15.5];
  const wSite = A.makeSite({ foot: rect(67.6, 21), setback: 1.5, entries: [wStair, wLift], anchors: [wStair, wLift], zoning: true });
  const wQty2 = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2 };
  for (const seed of [1, 2, 3]) {
    const wPlan2 = await A.planLayout(wSite, requests(wQty2), { timeLimit: 5, seed, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } });
    const overlapsAnchor = wPlan2.wall ? wPlan2.wall.rects.some(r => [wStair, wLift].some(e => inter(r, e))) : false;
    check("zoning: seed " + seed + ": the indoor zone's arrangement keeps its wall - a whole, uncut 5-rectangle ring - clear of a stair or lift near it", wPlan2.wall && wPlan2.wall.rects.length === 5 && !overlapsAnchor && wPlan2.issues.length === 0 && wPlan2.unplaced.length === 0, "rects=" + (wPlan2.wall && wPlan2.wall.rects.length) + " " + wPlan2.issues.join("; ") + " " + wPlan2.unplaced.map(u => u.name).join(","));
  }

  // the locker and bathroom modules need a 2 m lobby in front of them, not just the ordinary in-zone gap - a door does not open onto a corridor barely wider than it
  const lRoof = A.makeSite({ foot: rect(67.6, 21), setback: 1.5, entries: [[1.5, 9, 4, 11.5]], anchors: [[1.5, 9, 4, 11.5]], zoning: true });
  const lQty = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2, "Badminton": 1 };
  for (const seed of [1, 2, 3]) {
    const lPlan = await A.planLayout(lRoof, requests(lQty), { timeLimit: 5, seed, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } });
    const services = lPlan.courts.filter(c => /Locker|Bathroom/.test(c.name));
    const others = lPlan.courts.filter(c => !/Locker|Bathroom/.test(c.name));
    const gapM2 = (a, b) => Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0));
    const tooClose = services.flatMap(s => others.filter(o => gapM2(s.rect, o.rect) < 2.0 - EPS).map(o => s.name + "-" + o.name + ":" + gapM2(s.rect, o.rect).toFixed(2)));
    check("zoning: seed " + seed + ": every other item keeps at least 2.0 m from the locker/bathroom modules (a lobby to enter by)", lPlan.issues.length === 0 && tooClose.length === 0, tooClose.join("; ") + " " + lPlan.issues.join("; "));
  }

  // the lobby has to be real even when nothing else happens to be placed in front of the locker/bathroom - the WALL itself must stand 2 m off, not just
  // whatever neighbour happens to be there. A room with only these three items in it has nothing else to hold the wall back
  const lSite2 = A.makeSite({ foot: rect(67.6, 21), setback: 1.5, entries: [[1.5, 9, 4, 11.5]], anchors: [[1.5, 9, 4, 11.5]], zoning: true });
  for (const seed of [1, 2, 3]) {
    const lPlan2 = await A.planLayout(lSite2, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2 }), { timeLimit: 5, seed, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } });
    const svc2 = lPlan2.courts.filter(c => /Locker|Bathroom/.test(c.name));
    // one side is 0 (the wall it backs onto, flush by design) - every OTHER side must be at least 2 m from the wall
    const openSideShort = svc2.flatMap(c => { const r = c.rect, z = lPlan2.indoorZone; const gaps = [r[1] - z[1], z[3] - r[3], r[0] - z[0], z[2] - r[2]].filter(g => g > EPS); return gaps.filter(g => g < 2.0 - EPS); });
    check("zoning: seed " + seed + ": the indoor zone's wall stands at least 2 m off the locker/bathroom modules even with nothing else in front of them", lPlan2.issues.length === 0 && openSideShort.length === 0, "short gaps: " + openSideShort.map(g => g.toFixed(2)).join(", "));
  }

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

  // ── zoning: zones, in-zone / primary / entry paths, indoor items ignoring the setback and growing from the Locker corner, identical items lined up ──
  const zW = 80, zH = 30;
  const zRoof = { foot: rect(zW, zH), setback: 1.5 };
  const zLift = [1.5, 12, 4, 14.5], zStair = [74.5, 10, 76.5, 14];
  const zQty = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2, "Badminton": 1, "Bouldering Wall": 1, "Rest / Hydration Area": 1, "Padel Tennis Court": 1, "Pickleball Court": 2, "Teqball Table": 2, "Yoga": 1 };
  const zSettings = { timeLimit: 2, seed: 1, zoning: true, pathW: 2.5, minPathW: 2.0, strictGap: true, rules: { serviceCorners: true, gridLines: [] } };
  const zSite = A.makeSite({ foot: zRoof.foot, setback: zRoof.setback, entries: [zLift, zStair], anchors: [zLift, zStair], zoning: true });
  const zPlan = await A.planLayout(zSite, requests(zQty), zSettings);
  const zg = zPlan.zoning, zone = n => A.zoneOf(n);
  const gapBetweenM = (a, b) => Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0));
  const zBad = [];
  zPlan.courts.forEach((c, i) => {
    zPlan.courts.forEach((d, j) => {
      if (j <= i) return;
      if (inter(c.rect, d.rect)) { zBad.push(c.name + " overlaps " + d.name); return; }
      const need = /Locker|Bathroom/.test(c.name) && /Locker|Bathroom/.test(d.name) ? 0 : zone(c.name) === zone(d.name) ? zg.zoneGapM : zg.crossGapM;     // (the locker and bathroom modules share a wall)
      if (gapBetweenM(c.rect, d.rect) < need - EPS) zBad.push(c.name + " is " + gapBetweenM(c.rect, d.rect).toFixed(2) + " m from " + d.name + ", needs " + need);
    });
    [zLift, zStair].forEach(e => { if (gapBetweenM(c.rect, e) < zg.entryGapM - EPS) zBad.push(c.name + " is closer than " + zg.entryGapM + " m to a lift / stair"); });
    if (!/Locker|Bathroom/.test(c.name)) for (const [x, y] of [[c.rect[0], c.rect[1]], [c.rect[2], c.rect[3]]]) if (distToEdges(x, y, zRoof.foot) < zRoof.setback - EPS) zBad.push(c.name + " (" + zone(c.name) + ") is inside the setback");
  });
  check("zoning: every item placed, and no rule broken (paths between items, around lifts, setback for outdoor items)", zPlan.unplaced.length === 0 && zPlan.issues.length === 0 && zBad.length === 0, zBad.slice(0, 3).join("; ") + zPlan.unplaced.map(u => u.name).join(",") + zPlan.issues.join("; "));
  check("zoning: the paths are the sizes agreed: in-zone 1.5-1.8 m, primary 2.0-2.5 m, 2.5 m at lifts and stairs", (zg.zoneGapM === 1.8 || zg.zoneGapM === 1.5) && zg.crossGapM >= 2.0 && zg.crossGapM <= 2.5 && zPlan.stats.pathW === zg.crossGapM && zg.entryGapM === 2.5, JSON.stringify(zg));
  const zSvc = zPlan.courts.filter(c => /Locker|Bathroom/.test(c.name)), zCorners = [[0, 0], [zW, 0], [0, zH], [zW, zH]];
  const atPoint = (r, p) => Math.hypot(Math.max(r[0] - p[0], 0, p[0] - r[2]), Math.max(r[1] - p[1], 0, p[1] - r[3]));
  check("zoning: a service module stands in a real roof corner (the wall corner, inside the setback band), and the other beside it", zSvc.length === 2 && zSvc.some(c => zCorners.some(p => atPoint(c.rect, p) < 0.15)) && gapBetweenM(zSvc[0].rect, zSvc[1].rect) < 3.1, zSvc.map(c => c.rect.join(",")).join(" | "));
  const inBand = c => c.rect[0] < zRoof.setback - EPS || c.rect[1] < zRoof.setback - EPS || c.rect[2] > zW - zRoof.setback + EPS || c.rect[3] > zH - zRoof.setback + EPS;
  check("zoning: only the locker and bathroom modules ignore the setback (they have walls); every sport, indoor ones included, keeps it", zPlan.courts.filter(c => /Locker|Bathroom/.test(c.name)).some(inBand) && zPlan.courts.filter(c => !/Locker|Bathroom/.test(c.name)).every(c => !inBand(c)), zPlan.courts.filter(inBand).map(c => c.name).join(", "));
  const iz = zPlan.indoorZone;
  const izItems = zPlan.courts.filter(c => zone(c.name) === "indoor" && !/Rest/.test(c.name));
  check("zoning: the indoor zone is one rectangle round its items, and nothing outdoors is inside it", !!iz && izItems.every(c => c.rect[0] >= iz[0] - EPS && c.rect[1] >= iz[1] - EPS && c.rect[2] <= iz[2] + EPS && c.rect[3] <= iz[3] + EPS) && zPlan.courts.filter(c => zone(c.name) !== "indoor").every(c => gapBetweenM(c.rect, iz) >= 2.0 - EPS), iz ? iz.map(v => +v.toFixed(1)).join(",") : "none");
  // the dotted line is where the wall goes: every sport keeps at least 2 m from it (the case from your screenshot: Padel next to the indoor zone)
  const wRoof = A.makeSite({ foot: rect(100, 32), setback: 1.5, entries: [[1.5, 13, 4, 15.5]], anchors: [[1.5, 13, 4, 15.5]], zoning: true });
  const wQty = { "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2, "Badminton": 1, "Rest / Hydration Area": 1, "Bouldering Wall": 1, "Balance Logs": 2, "CrossFit Training Rig": 1, "Trampoline": 2, "Padel Tennis Court": 1, "Bocce Court": 1 };
  for (const seed of [1, 2, 3]) {
    const wPlan = await A.planLayout(wRoof, requests(wQty), Object.assign({}, zSettings, { seed }));
    // the locker and bathroom share a wall (flush, aligned, no path between them) and no other pair touches
    const ws = wPlan.courts.filter(c => /Locker|Bathroom/.test(c.name));
    const touching = wPlan.courts.flatMap((c, i) => wPlan.courts.slice(i + 1).filter(d => gapBetweenM(c.rect, d.rect) < 0.05).map(d => c.name + "+" + d.name));
    check("zoning: seed " + seed + ": the locker and bathroom modules share a wall (no path between them, flush) and no other pair touches", ws.length === 2 && gapBetweenM(ws[0].rect, ws[1].rect) < 0.05 && (Math.abs(ws[0].rect[1] - ws[1].rect[1]) < EPS || Math.abs(ws[0].rect[0] - ws[1].rect[0]) < EPS) && touching.length === 1 && /share a wall/.test(A.buildReport(wPlan, wRoof)), touching.join(", ") + " " + wPlan.issues.join("; "));
    // the bouldering wall has its long side on the indoor zone's wall line, inside it
    const bw = wPlan.courts.find(c => c.name === "Bouldering Wall"), zb = wPlan.indoorZone;
    const flush = bw && zb && bw.rect[0] >= zb[0] - EPS && bw.rect[1] >= zb[1] - EPS && bw.rect[2] <= zb[2] + EPS && bw.rect[3] <= zb[3] + EPS && ((bw.rect[2] - bw.rect[0]) >= (bw.rect[3] - bw.rect[1]) ? (Math.abs(bw.rect[1] - zb[1]) < EPS || Math.abs(bw.rect[3] - zb[3]) < EPS) : (Math.abs(bw.rect[0] - zb[0]) < EPS || Math.abs(bw.rect[2] - zb[2]) < EPS));
    check("zoning: seed " + seed + ": the bouldering wall stands with its back on the indoor zone's wall line, not loose in the middle", !!flush, bw ? bw.rect.map(v => +v.toFixed(1)).join(",") + " zone " + (zb || []).map(v => +v.toFixed(1)).join(",") : "not placed");
    const near = wPlan.courts.filter(c => zone(c.name) !== "indoor" && wPlan.indoorZone && gapBetweenM(c.rect, wPlan.indoorZone) < 2.0 - EPS);
    check("zoning: seed " + seed + ": every sport is at least 2 m from the indoor zone's dotted line (Padel included), and the layout is otherwise clean", !!wPlan.indoorZone && near.length === 0 && wPlan.issues.length === 0 && wPlan.unplaced.length === 0, near.map(c => c.name + " " + gapBetweenM(c.rect, wPlan.indoorZone).toFixed(2) + " m").join(", ") + " " + wPlan.issues.join("; ") + " " + wPlan.unplaced.map(u => u.name).join(","));
    // the indoor zone's own wall: 300 mm, centred on the dotted line, never hanging outside the roof, with a 1 m door on the side nearest the primary pathway network
    const w = wPlan.wall;
    const inRoof = r => r[0] >= -EPS && r[1] >= -EPS && r[2] <= 100 + EPS && r[3] <= 32 + EPS;
    check("zoning: seed " + seed + ": the indoor zone has a wall, 300 mm thick, entirely within the roof", !!w && Math.abs(w.thicknessM - 0.3) < EPS && w.rects.length > 0 && w.rects.every(inRoof), w ? w.rects.filter(r => !inRoof(r)).map(r => r.join(",")).join(" | ") : "no wall");
    const d = w && w.door;
    const doorW = d && (d.side === "N" || d.side === "S" ? d.x1 - d.x0 : d.y1 - d.y0);
    check("zoning: seed " + seed + ": the door is 1.0 m wide, on one of the zone's four sides, and the report mentions it", !!d && Math.abs(doorW - 1.0) < EPS && ["N", "S", "W", "E"].includes(d.side) && /Indoor zone: a 300 mm wall, door/.test(A.buildReport(wPlan, wRoof)), d ? JSON.stringify(d) : "no door");
    // the door sits on the side actually nearest the primary paths - the same measure independentProblems and the engine both use
    const wallSideRect = { N: [wPlan.indoorZone[0], wPlan.indoorZone[1], wPlan.indoorZone[2], wPlan.indoorZone[1]], S: [wPlan.indoorZone[0], wPlan.indoorZone[3], wPlan.indoorZone[2], wPlan.indoorZone[3]], W: [wPlan.indoorZone[0], wPlan.indoorZone[1], wPlan.indoorZone[0], wPlan.indoorZone[3]], E: [wPlan.indoorZone[2], wPlan.indoorZone[1], wPlan.indoorZone[2], wPlan.indoorZone[3]] };
    const sideGap = side => wPlan.primaryRects.reduce((m, p) => Math.min(m, Math.max(wallSideRect[side][0] - p[2], p[0] - wallSideRect[side][2], 0) + Math.max(wallSideRect[side][1] - p[3], p[1] - wallSideRect[side][3], 0)), Infinity);
    const bestSide = ["N", "S", "W", "E"].reduce((a, b) => sideGap(b) < sideGap(a) ? b : a);
    check("zoning: seed " + seed + ": the door is on the side nearest the primary paths (" + bestSide + ")", !d || d.side === bestSide, "door on " + (d && d.side) + ", nearest is " + bestSide + " (" + ["N", "S", "W", "E"].map(s => s + ":" + sideGap(s).toFixed(2)).join(" ") + ")");
  }
  check("zoning: alignment is a strong preference: on a crowded roof at most 2 items have a neighbour within 6 m but no shared edge line, and the report names them", Array.isArray(zPlan.notAligned) && zPlan.notAligned.length <= 2 && (zPlan.notAligned.length === 0 ? /every item that has a neighbour shares an edge/ : /no shared edge with a neighbour/).test(A.buildReport(zPlan, zSite)), (zPlan.notAligned || []).join(", "));
  const sameRow = name => { const l = zPlan.courts.filter(c => c.name === name); return l.length === 2 && (Math.abs(l[0].rect[1] - l[1].rect[1]) < EPS || Math.abs(l[0].rect[0] - l[1].rect[0]) < EPS) && Math.abs((l[0].rect[2] - l[0].rect[0]) - (l[1].rect[2] - l[1].rect[0])) < EPS && Math.abs(gapBetweenM(l[0].rect, l[1].rect) - zg.zoneGapM) < EPS; };
  check("zoning: identical items sit together, the same way round, edges aligned, one in-zone path apart (Ping Pong, Pickleball)", sameRow("Ping Pong") && sameRow("Pickleball Court"));
  const zCentroid = list => { const c = list.map(x => [(x.rect[0] + x.rect[2]) / 2, (x.rect[1] + x.rect[3]) / 2]); return c.reduce((s, p) => [s[0] + p[0] / c.length, s[1] + p[1] / c.length], [0, 0]); };
  const spread = list => { const m = zCentroid(list); return Math.max(...list.map(x => Math.hypot((x.rect[0] + x.rect[2]) / 2 - m[0], (x.rect[1] + x.rect[3]) / 2 - m[1]))); };
  const zOut = zPlan.courts.filter(c => zone(c.name) === "outdoor");
  check("zoning: the outdoor zone is a cluster, not spread over the roof (no item further than 25 m from the zone's centre)", spread(zOut) < 25, spread(zOut).toFixed(1) + " m");
  check("zoning: no garden inside the indoor zone's rectangle: the band drawn is the band less that stretch", zPlan.bandRects && zPlan.bandRects.every(r => !inter(r, iz)) && zPlan.bandRects.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0) < zSite.bandRects.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0) - 1);
  check("zoning: the report states the zoning gaps", /paths inside a zone.*between zones.*around lifts, stairs and ramps/.test(A.buildReport(zPlan, zSite)));
  // a ramp but no lift or stair: the indoor zone still grows from a roof corner (the one nearest the ramp), and the report says so
  const zNo = A.makeSite({ foot: rect(50, 25), setback: 1.5, entries: [[10, 8, 16, 9.5]], anchors: [], zoning: true });
  const zNoPlan = await A.planLayout(zNo, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2 }), zSettings);
  check("zoning: with a ramp but no lift or stair a service module takes the roof corner nearest the ramp, and the report says why", zNoPlan.courts.length === 4 && zNoPlan.issues.length === 0 && zNoPlan.courts.some(c => /Locker|Bathroom/.test(c.name) && atPoint(c.rect, [0, 0]) < 0.15) && /corner nearest a ramp/.test(A.buildReport(zNoPlan, zNo)), zNoPlan.courts.map(c => c.name.slice(0, 6) + c.rect.join(",")).join(" | ") + " " + zNoPlan.unplaced.map(u => u.reason).join(";"));
  // an L-shaped roof: the band is a mask on the same grid, so outdoor items keep the setback there too
  const zL = { foot: SCENARIOS.lshape.foot, setback: 1.5 };
  const zLSite = A.makeSite({ foot: zL.foot, setback: zL.setback, entries: [[4, 4, 6.5, 6.5]], anchors: [[4, 4, 6.5, 6.5]], zoning: true });
  const zLPlan = await A.planLayout(zLSite, requests({ "Locker & Dressing Room Module": 1, "Ping Pong": 2, "Padel Tennis Court": 1, "Yoga": 1 }), zSettings);
  const lBad = zLPlan.courts.filter(c => !/Locker|Bathroom/.test(c.name)).filter(c => [[c.rect[0], c.rect[1]], [c.rect[2], c.rect[3]], [c.rect[0], c.rect[3]], [c.rect[2], c.rect[1]]].some(([x, y]) => distToEdges(x, y, zL.foot) < zL.setback - EPS || !pointInPoly(x + (x === c.rect[0] ? 1e-6 : -1e-6), y + (y === c.rect[1] ? 1e-6 : -1e-6), zL.foot)));
  check("zoning: on an L-shaped roof every item is placed and outdoor / garden items keep the setback", zLPlan.unplaced.length === 0 && zLPlan.issues.length === 0 && lBad.length === 0, zLPlan.unplaced.map(u => u.name).join(",") + zLPlan.issues.join("; ") + lBad.map(c => c.name).join(","));
  check("zoning: the indoor zone's wall stays inside the L-shaped roof's own bounding box", !zLPlan.wall || zLPlan.wall.rects.every(r => r[0] >= -EPS && r[1] >= -EPS && r[2] <= 60 + EPS && r[3] <= 30 + EPS), zLPlan.wall ? zLPlan.wall.rects.join(" | ") : "no wall");
  // your picture: two Volleyball courts with a Badminton and a Climbing Tower must line up (Volleyball pair side by side, one shared edge line at least for all)
  const vRoof = A.makeSite({ foot: rect(80, 25), setback: 1.5, entries: [[3, 10, 5.5, 12.5]], anchors: [[3, 10, 5.5, 12.5]], zoning: true });
  const vPlan = await A.planLayout(vRoof, requests({ "Volleyball": 2, "Badminton": 1, "Climbing Tower": 1, "Modular Tower Slide": 2, "3x3 Streetbasketball": 1, "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1 }), zSettings);
  const vv = vPlan.courts.filter(c => c.name === "Volleyball");
  check("zoning: two Volleyball courts line up: same way round, an edge line in common, one in-zone path apart", vv.length === 2 && ((Math.abs(vv[0].rect[1] - vv[1].rect[1]) < EPS && Math.abs(vv[0].rect[3] - vv[1].rect[3]) < EPS) || (Math.abs(vv[0].rect[0] - vv[1].rect[0]) < EPS && Math.abs(vv[0].rect[2] - vv[1].rect[2]) < EPS)) && Math.abs(gapBetweenM(vv[0].rect, vv[1].rect) - vPlan.zoning.zoneGapM) < EPS, vv.map(c => c.rect.map(v => +v.toFixed(1)).join(",")).join(" | ") + " " + vPlan.unplaced.map(u => u.name).join(","));
  const gardenIn = pl => (pl.pockets.concat(pl.bandRects)).filter(r => pl.indoorZone && inter(r, pl.indoorZone));
  check("zoning: no garden at all inside an indoor zone: no band strip and no leftover pocket overlaps its rectangle (both roofs)", !!vPlan.indoorZone && gardenIn(vPlan).length === 0 && gardenIn(zPlan).length === 0 && gardenIn(zLPlan).length === 0, gardenIn(vPlan).concat(gardenIn(zPlan)).map(r => r.map(v => +v.toFixed(1)).join(",")).join(" | "));
  // alignment is a preference, not a hard rule - keeping the wall whole and clear of the lift near it (never cut to dodge it, the zone's own shape adapts
  // instead) can legitimately cost one otherwise-aligned spot, so up to one item out of line here is fine, same tolerance the crowded-roof case already gets
  check("zoning: on that roof every item is placed, nothing breaks a rule and at most one is out of line", vPlan.unplaced.length === 0 && vPlan.issues.length === 0 && vPlan.notAligned.length <= 1, vPlan.issues.join("; ") + " misaligned: " + vPlan.notAligned.join(", "));
  // zoning off: the plain result is untouched (no zoning fields at all)
  const zOff = await A.planLayout(A.makeSite({ foot: zRoof.foot, setback: zRoof.setback, entries: [zLift, zStair], anchors: [zLift, zStair] }), requests({ "Ping Pong": 2, "Yoga": 1 }), { timeLimit: 1, seed: 1, strictGap: true, courtGap: 2.0, minPathW: 2.0 });
  check("zoning off: nothing changes (no zoning in the plan, the band is the plain one)", zOff.zoning === null && zOff.bandRects === null);

  // big courts on the setback line (2026-09-25): a notched roof pushed from Revit (67.5 x 16.28 m, usable depth ~13.3 m), entered through doors on its edge that
  // used to be joined by one corridor straight across the middle - which left no strip deep enough for a Padel court. The big court now stands with a whole
  // long side on the setback line and paths on its other three sides, the network joins round it, and every earlier rule still holds
  const nFoot = [[64.8, 13.03], [67.5, 13.03], [67.5, 0], [0, 0], [0, 11.87], [5.4, 11.87], [5.4, 11.28], [13.5, 11.28], [13.5, 16.28], [56.7, 16.28], [56.7, 11.28], [64.8, 11.28]];
  const nDoors = [[2.95, 9.97, 5.45, 11.87], [5.1, 9.78, 7.6, 11.28], [62.25, 9.78, 64.75, 11.28]];
  const nSite = A.makeSite({ foot: nFoot, setback: 1.5, entries: nDoors, anchors: nDoors, zoning: true });
  const nPlan = await A.planLayout(nSite, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Padel Tennis Court": 1, "Pickleball Court": 1, "HIIT Turf Grid": 1, "TRX Suspension Frame": 1 }), zSettings);
  const nPadel = nPlan.courts.find(c => c.name === "Padel Tennis Court");
  const nSvc = nPlan.courts.filter(c => /Locker|Bathroom/.test(c.name)), nz = nPlan.indoorZone;
  const nLobbyShort = nz ? nSvc.flatMap(c => [c.rect[1] - nz[1], nz[3] - c.rect[3], c.rect[0] - nz[0], nz[2] - c.rect[2]].filter(g => g > EPS && g < 2.0 - EPS)) : ["no indoor zone"];
  const onSetback = r => [[r[1], 1.5], [r[3], 16.28 - 1.5]].some(([y, line]) => Math.abs(y - line) < EPS) && (r[2] - r[0]) >= (r[3] - r[1]);
  check("big courts on the setback line: on a notched Revit roof with doors at both ends a Padel court is placed, a whole long side on the setback line, and no rule breaks",
    nPlan.unplaced.length === 0 && nPlan.issues.length === 0 && !!nPadel && onSetback(nPadel.rect),
    (nPadel ? nPadel.rect.map(v => +v.toFixed(1)).join(",") : "no Padel") + " " + nPlan.unplaced.map(u => u.name).join(",") + nPlan.issues.join("; "));
  check("big courts on the setback line: the locker and bathroom still share a wall in a corner and keep their 2 m lobby", nSvc.length === 2 && gapBetweenM(nSvc[0].rect, nSvc[1].rect) < EPS && nLobbyShort.length === 0,
    nSvc.map(c => c.rect.join(",")).join(" | ") + " short: " + nLobbyShort.join(","));
  // ...and that corner is a REAL roof corner (flush on two of the roof's outer edges), not a spot floating beside the corner the doors' landings fill, with the
  // indoor zone reaching 2 m in front of the modules (the lobby inside the zone) and its door on that open side
  const nRealCorner = r => (Math.abs(r[0]) < EPS || Math.abs(r[2] - 67.5) < EPS) && (Math.abs(r[1]) < EPS || Math.abs(r[3] - 16.28) < EPS);
  const nFront = nz && nSvc.length ? Math.max(...nSvc.map(c => Math.max(c.rect[1] - nz[1], nz[3] - c.rect[3]))) : 0;
  check("services in a real roof corner: one module flush in a corner of the roof's outer edges, the other beside it, and a 2 m lobby in front inside the indoor zone",
    nSvc.some(c => nRealCorner(c.rect)) && nSvc.every(c => Math.abs(c.rect[1]) < EPS || Math.abs(c.rect[3] - 16.28) < EPS) && nFront >= 2.0 - EPS,
    nSvc.map(c => c.rect.map(v => +v.toFixed(1)).join(",")).join(" | ") + " zone " + (nz ? nz.map(v => +v.toFixed(1)).join(",") : "none") + " front " + nFront.toFixed(2));
  // garden never where people walk: in every shuffled variant the indoor zone's door opens onto path (no garden pocket in the 1.5 m in front of it), and
  // nothing breaks a rule
  const gRe = requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Teqball Table": 1, "TRX Suspension Frame": 1, "Pickleball Court": 1, "3x3 Streetbasketball": 1, "Trampoline": 1, "CrossFit Training Rig": 1, "Sandpit": 1 });
  const gBad = [];
  for (const [seed, variant] of [[1, 1], [1, 2], [2, 3], [3, 4]]) {
    const gp = await A.planLayout(nSite, gRe, Object.assign({}, zSettings, { seed, shuffle: true, variant }));
    const d = gp.wall && gp.wall.door;
    const probe = !d ? null : d.side === "S" ? [d.x0, d.y1, d.x1, d.y1 + 1.5] : d.side === "N" ? [d.x0, d.y0 - 1.5, d.x1, d.y0] : d.side === "W" ? [d.x0 - 1.5, d.y0, d.x0, d.y1] : [d.x1, d.y0, d.x1 + 1.5, d.y1];
    if (gp.issues.length) gBad.push("variant " + variant + ": " + gp.issues.join("; "));
    if (probe && gp.pockets.some(q => inter(q, probe))) gBad.push("variant " + variant + ": garden in front of the door (" + d.side + ")");
    // no garden island in the circulation: a pocket with walkable space on three or four sides
    const onWalk = s => gp.pathRects.some(q => inter(q, s));
    const e = 0.1;
    gp.pockets.forEach(q => {
      const n = [[q[0], q[1] - e, q[2], q[1]], [q[0], q[3], q[2], q[3] + e], [q[0] - e, q[1], q[0], q[3]], [q[2], q[1], q[2] + e, q[3]]].filter(onWalk).length;
      if (n >= 3) gBad.push("variant " + variant + ": garden island " + q.map(v => +v.toFixed(1)).join(","));
    });
  }
  check("garden never where people walk: shuffled layouts on the notched roof keep the indoor zone's door opening onto path, leave no garden island in the circulation, and break no rule", gBad.length === 0, gBad.join(" | "));
  // an indoor sport keeps an in-zone path on all four sides inside the indoor zone: the wall is never pushed against a Ping Pong table or a Badminton court
  // (the side facing the roof's own edge keeps the setback instead, which inside the zone is floor too)
  const iBad = [];
  for (const [seed, variant] of [[1, 0], [1, 1], [2, 2], [3, 3]]) {
    const ip = await A.planLayout(nSite, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 2, "Badminton": 1, "Teqball Table": 1 }), Object.assign({}, zSettings, { seed, shuffle: variant > 0, variant }));
    const z = ip.indoorZone, zg2 = ip.zoning.zoneGapM;
    ip.courts.filter(c => /Ping Pong|Badminton/.test(c.name)).forEach(c => {
      const r = c.rect;
      [["N", r[1] - z[1], z[1]], ["S", z[3] - r[3], 16.28 - z[3]], ["W", r[0] - z[0], z[0]], ["E", z[2] - r[2], 67.5 - z[2]]].forEach(([side, gap, toEdge]) => {
        const atRoofEdge = toEdge < EPS;
        if (gap < (atRoofEdge ? 1.5 : zg2) - EPS) iBad.push("variant " + variant + " " + c.name + " " + side + " " + gap.toFixed(2));
      });
    });
    if (ip.issues.length) iBad.push("variant " + variant + ": " + ip.issues.join("; "));
  }
  check("indoor sports keep an in-zone path on all four sides inside the indoor zone (no table or court against the zone's wall)", iBad.length === 0, iBad.join(" | "));
  // a Bouldering Wall never stands across from the locker / bathroom (their lobby and the walk along it), and the indoor zone's door never opens onto an item
  const bBad = [];
  for (const [seed, variant] of [[1, 0], [1, 1], [2, 2], [3, 3]]) {
    const bp = await A.planLayout(nSite, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 1, "Bouldering Wall": 1, "Teqball Table": 1, "Trampoline": 1, "Sandpit": 1 }), Object.assign({}, zSettings, { seed, shuffle: variant > 0, variant }));
    const bw = bp.courts.find(c => c.name === "Bouldering Wall"), d = bp.wall && bp.wall.door;
    bp.courts.filter(c => /Locker|Bathroom/.test(c.name)).forEach(s => {
      const r = s.rect, front = Math.abs(r[1]) < EPS ? [r[0], r[3], r[2], 99] : Math.abs(r[3] - 16.28) < EPS ? [r[0], -99, r[2], r[1]] : Math.abs(r[0]) < EPS ? [r[2], r[1], 99, r[3]] : [-99, r[1], r[0], r[3]];
      if (bw && inter(front, bw.rect)) bBad.push("variant " + variant + ": Bouldering Wall across from the " + s.name);
    });
    if (d) {
      const probe = d.side === "N" || d.side === "S" ? [d.x0 - 0.5, d.y0 - 0.6, d.x1 + 0.5, d.y1 + 0.6] : [d.x0 - 0.6, d.y0 - 0.5, d.x1 + 0.6, d.y1 + 0.5];
      bp.courts.filter(c => inter(c.rect, probe)).forEach(c => bBad.push("variant " + variant + ": the door opens onto the " + c.name));
    }
    if (bp.issues.length) bBad.push("variant " + variant + ": " + bp.issues.join("; "));
  }
  check("the Bouldering Wall never stands across from the locker / bathroom lobby, and the indoor zone's door never opens onto an item", bBad.length === 0, bBad.join(" | "));
  // the doors on the roof's edge: the indoor zone's wall never stands on the primary-width landing just inside a door, and on a roof that is not a rectangle
  // the band along the edges the doors stand on is paved walkway, not garden
  const dBad = [];
  for (const [seed, variant] of [[1, 0], [1, 1], [2, 2], [3, 3]]) {
    const dp = await A.planLayout(nSite, requests({ "Locker & Dressing Room Module": 1, "Bathroom & Shower Module": 1, "Ping Pong": 1, "Bouldering Wall": 1, "Teqball Table": 1, "Modular Tower Slide": 1, "Balance Logs": 1, "Trampoline": 1, "3x3 Streetbasketball": 1 }), Object.assign({}, zSettings, { seed, shuffle: variant > 0, variant }));
    const W2 = dp.stats.pathW;
    nDoors.forEach(dr => {
      const landing = [dr[0], dr[1] - W2 + 0.05, dr[2], dr[1] - 0.05];                    // the doors all open upwards into the roof here
      if (dp.wall && dp.wall.rects.some(w => inter(w, landing))) dBad.push("variant " + variant + ": the indoor zone's wall stands on the landing of the door at x " + dr[0]);
    });
    const doorEdges = [[0.05, 11.87 - 1.45, 5.35, 11.87 - 0.05], [5.45, 11.28 - 1.45, 13.45, 11.28 - 0.05], [56.75, 11.28 - 1.45, 64.75, 11.28 - 0.05], [64.85, 13.03 - 1.45, 67.45, 13.03 - 0.05]];
    (dp.bandRects || []).forEach(b => doorEdges.forEach(e => { if (inter(b, e)) dBad.push("variant " + variant + ": garden band along a door edge " + b.map(v => +v.toFixed(1)).join(",")); }));
    if (dp.issues.length) dBad.push("variant " + variant + ": " + dp.issues.join("; "));
  }
  check("doors on the roof's edge: the indoor zone's wall never covers a door's landing, and the band along the door edges is paved, not garden", dBad.length === 0, dBad.slice(0, 4).join(" | "));

  console.log(fails === 0 ? "\nALL ALGORITHMIC PLACEMENT CHECKS PASSED (" + Object.keys(SCENARIOS).length + " roofs, " + ((Date.now() - t0) / 1000).toFixed(1) + " s)" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
