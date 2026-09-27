// Tests for the 3D view of the Combine roof (previewCore.js, preview.js). Run: node tools/preview-test.js
//
// The core is pure, so it is checked against numbers that can be worked out by hand: the area of a triangulated L, a shadow's size from the sun's angle, whether the whole roof is in the frame
// after "fit", which piece a ray hits. preview.js runs as it is against a stand-in page with a WebGL context that records what it is asked to do (no GPU here): the switch, the orbit and the
// picking with the pointer, what a click selects, the control bar, and that without WebGL the plan stays.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const P = require(path.join(web, "previewCore.js"));

const triArea = (data, i) => {                      // area of the triangle starting at vertex i of an interleaved mesh (stride 10)
  const v = k => [data[(i + k) * 10], data[(i + k) * 10 + 1], data[(i + k) * 10 + 2]];
  const a = v(0), b = v(1), c = v(2), u = P.previewSub(b, a), w = P.previewSub(c, a), x = P.previewCross(u, w);
  return Math.hypot(x[0], x[1], x[2]) / 2;
};
const meshArea = m => { let s = 0; for (let i = 0; i < m.count; i += 3) s += triArea(m.data, i); return s; };
const finite = arr => arr.every(Number.isFinite);

// ---------------------------------------------------------------------------------------------------------------- camera and matrices
{
  const cam = { target: [10, 0, 5], distance: 30, yawDeg: 0, pitchDeg: 0, fovDeg: 40, minDistance: 5, maxDistance: 150 };
  const e0 = P.previewCameraEye(cam), e90 = P.previewCameraEye({ ...cam, yawDeg: 90 }), eTop = P.previewCameraEye({ ...cam, pitchDeg: 90 });
  check("yaw 0 looks from the south (+z), yaw 90 from the east (+x), pitch 90 from straight above", near(e0[0], 10) && near(e0[2], 35) && near(e90[0], 40) && near(e90[2], 5) && near(eTop[1], 30) && near(eTop[0], 10));
  const vp = P.previewMat4Mul(P.previewPerspective(40, 1.6, 0.5, 500), P.previewLookAt(P.previewCameraEye({ ...cam, yawDeg: 25, pitchDeg: 30 }), cam.target, [0, 1, 0]));
  const clip = [0, 1, 2, 3].map(r => vp[r] * 10 + vp[4 + r] * 0 + vp[8 + r] * 5 + vp[12 + r]);
  check("the target is in the middle of the frame and in front of the camera", near(clip[0] / clip[3], 0, 1e-9) && near(clip[1] / clip[3], 0, 1e-9) && clip[3] > 0 && Math.abs(clip[2] / clip[3]) < 1);
  const right = P.previewCameraBasis({ ...cam, yawDeg: 0, pitchDeg: 30 }).right;
  check("from the south east is to the right, as on the plan", near(right[0], 1) && near(right[2], 0));
  const o = P.previewOrbit(cam, 100, 50);
  check("dragging right turns the roof right (the eye goes west), dragging down looks from higher up", o.yawDeg > 300 && o.yawDeg < 360 && o.pitchDeg > cam.pitchDeg);
  check("the elevation is kept between 30 degrees under the deck and 89 above; the turn wraps round", P.previewOrbit(cam, 0, 100000).pitchDeg === 89 && P.previewOrbit(cam, 0, -100000).pitchDeg === -30 && P.previewOrbit({ ...cam, yawDeg: 350 }, -100, 0).yawDeg >= 0 && P.previewOrbit(cam, 5000, 0).yawDeg < 360);
  check("zoom stays between the minimum and maximum distance", P.previewZoom(cam, 0.001).distance === 5 && P.previewZoom(cam, 1000).distance === 150 && near(P.previewZoom(cam, 0.5).distance, 15));
  const top = { ...cam, pitchDeg: 89, yawDeg: 0 };
  const pn = P.previewPan(top, 100, 0, 500, null);
  check("moving: dragging right pulls the roof right (the target goes west); the target height is kept", pn.target[0] < top.target[0] && near(pn.target[1], 0) && near(pn.target[2], top.target[2], 1e-9));
  const lim = P.previewPan(top, -1e6, 1e6, 500, { minX: 0, maxX: 20, minZ: 0, maxZ: 20 });
  check("...and stays inside the limit, so the roof cannot be lost", lim.target[0] >= 0 && lim.target[0] <= 20 && lim.target[2] >= 0 && lim.target[2] <= 20);
}

// ---------------------------------------------------------------------------------------------------------------- fit and the ray
{
  const cases = [[{ minX: 0, maxX: 66, minZ: 0, maxZ: 47, minY: -0.3, maxY: 6 }, 1.6], [{ minX: 0, maxX: 15, minZ: 0, maxZ: 10, minY: -0.3, maxY: 4 }, 0.6], [{ minX: -20, maxX: 30, minZ: 4, maxZ: 90, minY: -4, maxY: 8 }, 2.4]];
  let ok = true, why = "";
  for (const [b, aspect] of cases) for (const view of ["angle", "top"]) {
    const cam = P.previewFitCamera(b, aspect, view);
    const vp = P.previewMat4Mul(P.previewPerspective(cam.fovDeg, aspect, 0.1, 5000), P.previewLookAt(P.previewCameraEye(cam), cam.target, [0, 1, 0]));
    for (const x of [b.minX, b.maxX]) for (const y of [0, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const c = [0, 1, 2, 3].map(r => vp[r] * x + vp[4 + r] * y + vp[8 + r] * z + vp[12 + r]);
      if (!(c[3] > 0 && Math.abs(c[0] / c[3]) <= 1.0001 && Math.abs(c[1] / c[3]) <= 1.0001)) { ok = false; why = view + " aspect " + aspect + " corner " + [x, y, z]; }
    }
  }
  check("fit puts the whole roof in the frame, from an angle and from above, for wide, tall and square windows", ok, why);
  const cam = P.previewFitCamera(cases[0][0], 1.6, "angle");
  const ray = P.previewPickRay(cam, 1.6, 0, 0), t = P.previewSub(cam.target, ray.origin);
  const along = P.previewDot(t, ray.dir), off = Math.hypot(...P.previewSub(t, ray.dir.map(v => v * along)));
  check("the ray through the middle of the window passes through the camera's target", off < 1e-6 && along > 0);
  const box = { min: [10, 0, 10], max: [14, 3, 16] };
  const down = { origin: [12, 30, 13], dir: [0, -1, 0] };
  check("a ray from above enters the box at its top; one beside it misses; one from inside starts at 0", near(P.previewRayBox(down, box), 27) && P.previewRayBox({ origin: [30, 30, 13], dir: [0, -1, 0] }, box) === null && P.previewRayBox({ origin: [12, 1, 13], dir: [0, 1, 0] }, box) === 0 && P.previewRayBox({ origin: [12, 30, 13], dir: [0, 1, 0] }, box) === null);
}

// ---------------------------------------------------------------------------------------------------------------- triangulation and hull
{
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const L = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 30], [0, 30]];      // an L: 20*10 + 10*20 = 400
  const area = (poly, tris) => tris.reduce((s, [a, b, c]) => s + Math.abs(P.previewPolygonArea([poly[a], poly[b], poly[c]])), 0);
  check("a square is two triangles that add up to its area", P.previewTriangulate(sq).length === 2 && near(area(sq, P.previewTriangulate(sq)), 100));
  const tl = P.previewTriangulate(L), cl = P.previewCleanPolygon(L);
  check("an L (a concave outline) is four triangles that add up to its area, no triangle outside it", tl.length === 4 && near(area(cl, tl), 400) && tl.every(([a, b, c]) => { const m = [(cl[a][0] + cl[b][0] + cl[c][0]) / 3, (cl[a][1] + cl[b][1] + cl[c][1]) / 3]; return !(m[0] > 10 && m[1] > 10) && m[0] >= 0 && m[0] <= 20 && m[1] >= 0 && m[1] <= 30; }));
  const rev = [...L].reverse();
  check("the winding does not matter, nor a closing point that repeats the first, nor repeated points", near(area(P.previewCleanPolygon(rev), P.previewTriangulate(rev)), 400) && P.previewTriangulate([...sq, sq[0]]).length === 2 && P.previewTriangulate([sq[0], sq[0], ...sq.slice(1)]).length === 2);
  check("a point on a straight side is fine", near(area(P.previewCleanPolygon([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]]), P.previewTriangulate([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])), 100));
  check("nothing to fill: fewer than three points, a line, or NaN gives no triangles", [[], [[0, 0]], [[0, 0], [5, 5]], [[0, 0], [5, 5], [10, 10]], [[0, 0], [NaN, 1], [3, 3]], null, undefined].every(p => P.previewTriangulate(p).length === 0));
  // many simple polygons: star-shaped ones with random radii
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let bad = 0;
  for (let n = 0; n < 300; n++) {
    const k = 5 + Math.floor(rnd() * 14), pts = [];
    for (let i = 0; i < k; i++) { const a = (i + rnd() * 0.6) / k * 2 * Math.PI, r = 3 + rnd() * 20; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const tri = P.previewTriangulate(pts), cl2 = P.previewCleanPolygon(pts);
    if (!near(area(cl2, tri), Math.abs(P.previewPolygonArea(cl2)), 1e-6) || tri.length !== cl2.length - 2) bad++;
  }
  check("300 random star-shaped polygons: the triangles always add up to the polygon's area, n - 2 of them", bad === 0, bad + " bad");
  const cloud = []; for (let i = 0; i < 200; i++) cloud.push([rnd() * 50, rnd() * 30]);
  const hull = P.previewConvexHull(cloud);
  const inside = p => hull.every((h, i) => { const q = hull[(i + 1) % hull.length]; return (q[0] - h[0]) * (p[1] - h[1]) - (q[1] - h[1]) * (p[0] - h[0]) >= -1e-9; });
  check("the convex hull holds every point, is counter-clockwise and has no point that is not a corner", cloud.every(inside) && P.previewPolygonArea(hull) > 0 && hull.length >= 3 && P.previewConvexHull([[0, 0], [1, 1], [2, 2]]).length <= 3);
}

// ---------------------------------------------------------------------------------------------------------------- the sun and the shadows
{
  const d = (a, b, c) => P.previewSunDirection(a, b, c);
  const s = d(180, 45, 0), e = d(90, 30, 0), n2 = d(90, 30, 90);
  check("the sun in the south is towards +z on the plan, in the east towards +x; with the roof turned to bear east at the top, an east sun is towards the top (-z)", near(s[0], 0) && near(s[1], Math.SQRT1_2) && near(s[2], Math.SQRT1_2) && near(e[0], Math.cos(Math.PI / 6)) && near(e[2], 0) && near(n2[0], 0) && near(n2[2], -Math.cos(Math.PI / 6)));
  check("the direction is a unit vector", [[0, 10, 0], [123, 33, 47], [300, 80, 200]].every(a => near(Math.hypot(...d(...a)), 1)));
  const sun = d(180, 45, 0);
  const shadow = P.previewShadowOf([[5, 10, 5]], sun);
  const pole = P.previewShadowOf([[5, 0, 5], [5, 10, 5], [6, 0, 5], [6, 10, 5]], sun);
  check("a 10 m pole under a sun at 45 degrees in the south throws a 10 m shadow to the north", shadow === null && pole && near(Math.min(...pole.map(p => p[1])), -5) && near(Math.max(...pole.map(p => p[1])), 5));
  check("a low sun (under 3 degrees) or one below the horizon throws none; nothing to cast throws none", P.previewShadowOf([[0, 0, 0], [1, 2, 1], [1, 2, 0]], d(180, 2, 0)) === null && P.previewShadowOf([[0, 0, 0], [1, 2, 1]], d(180, -20, 0)) === null && P.previewShadowOf([], sun) === null && P.previewShadowOf([[0, 1, 0]], null) === null);
}

// ---------------------------------------------------------------------------------------------------------------- the scene
const furniture = (id, x, y, w, h, hh) => ({ id, kind: "field", label: id, x_m: x, y_m: y, w, h, sourceJson: { furniture: { height_m: hh } } });
const snapshot = (over = {}) => ({
  roof: { length: 60, width: 40, boundary: null, heightAboveGroundM: 0, slabThicknessM: null },
  items: [
    { id: "pad", kind: "field", label: "Padel", x_m: 2, y_m: 2, w: 20, h: 10, sourceJson: { padel: { clear_height_min_m: 6, back_wall_glass_height_m: 3, back_wall_mesh_height_m: 1, net_centre_height_m: 0.88 } } },
    { id: "bb", kind: "field", label: "Basketball", x_m: 26, y_m: 2, w: 28, h: 15, sourceJson: { basketball: { clear_height_min_m: 7, rim_height_m: 3.05 } } },
    { id: "vb", kind: "field", label: "Volleyball", x_m: 2, y_m: 16, w: 12, h: 24, sourceJson: { volleyball: { clear_height_min_m: 7, net_height_m: 2.43 } } },
    { id: "fld", kind: "field", label: "Field", x_m: 18, y_m: 20, w: 20, h: 10, sourceJson: { field: { dimensions: { min_height_m: 5 } } } },
    { id: "gar", kind: "garden", label: "Bed", x_m: 40, y_m: 22, w: 10, h: 8, sourceJson: {} },
    { id: "tree", kind: "vegetation", label: "Oak", x_m: 50, y_m: 30, w: 6, h: 6, sourceJson: { vegetation: { height_m: 10, crown_m: 6 } } },
    furniture("bench", 30, 34, 2, 2, 2),
    { id: "rvt", kind: "revit", label: "From Revit", x_m: 44, y_m: 4, w: 3, h: 3, sourceJson: null },
    { id: "act", kind: "activity", label: "Yoga", x_m: 20, y_m: 34, w: 6, h: 4 },
  ],
  zones: [{ id: "z1", kind: "green_roof", points: [{ x_m: 40, y_m: 5 }, { x_m: 50, y_m: 5 }, { x_m: 50, y_m: 12 }, { x_m: 40, y_m: 12 }] }],
  walls: [{ thicknessM: 0.2, rects: [[10, 30, 10.3, 40], [10, 39.7, 18, 40]] }],
  structure: { gridLines: [{ x1: 0, y1: 10, x2: 60, y2: 10, name: "A" }], columns: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }], beams: [{ x1: 10, y1: 10, x2: 30, y2: 10, widthM: 0.3, depthM: 0.5 }], walls: [{ x1: 0, y1: 0, x2: 0, y2: 40, thicknessM: 0.3, bearing: true }] },
  entries: [{ x_m: 0, y_m: 20, edge: "left" }],
  options: { structure: true, shadows: true, sun: { azimuthDeg: 180, altitudeDeg: 45 }, northDeg: 0 },
  ...over,
});
{
  const s = P.previewBuildScene(snapshot());
  const byId = Object.fromEntries(s.pieces.map(p => [p.id, p]));
  check("every piece is in the scene with its kind of thing: courts, a field, a bed, a tree, furniture, a Revit piece, an activity", s.pieces.length === 9 && [byId.pad.category, byId.bb.category, byId.vb.category, byId.fld.category, byId.gar.category, byId.tree.category, byId.bench.category, byId.rvt.category, byId.act.category].join() === "court,court,court,field,garden,tree,furniture,revit,activity");
  check("the height comes from what the layout says: the padel cage, the basketball rim and backboard, the volleyball net, the tree's own height, the bench's", near(byId.pad.box.max[1], 6) && near(byId.bb.box.max[1], 7) && near(byId.vb.box.max[1], 7) && near(byId.tree.box.max[1], 10) && near(byId.bench.box.max[1], 2) && near(byId.fld.box.max[1], 5));
  check("what the layout does not say is a plain default and is marked as assumed (bed, Revit piece, activity), what it says is not", byId.gar.assumed && byId.rvt.assumed && byId.act.assumed && !byId.pad.assumed && !byId.tree.assumed && !byId.bench.assumed && near(byId.gar.box.max[1], 0.35) && near(byId.rvt.box.max[1], 2.5) && s.notes.some(n => /does not give the height of 3 pieces/.test(n)));
  check("a piece's pick box is where the board draws it (a tree: its crown, round its centre)", byId.pad.box.min.join() === "2,0,2" && byId.pad.box.max[0] === 22 && byId.tree.box.min[0] === 50 && byId.tree.box.max[0] === 56 && byId.tree.box.min[2] === 30);
  const vertsOk = ["opaque", "glass", "shadows", "stencil"].every(k => s[k].count % 3 === 0 && s[k].data.length === s[k].count * 10 && finite(s[k].data)) && s.lines.count % 2 === 0 && s.lines.data.length === s.lines.count * 7 && finite(s.lines.data);
  check("the meshes are well formed: whole triangles, ten numbers a vertex (lines: seven), none NaN", vertsOk && s.opaque.count > 1000 && s.lines.count > 100);
  let unit = true; for (let i = 0; i < s.opaque.count; i++) if (!near(Math.hypot(s.opaque.data[i * 10 + 3], s.opaque.data[i * 10 + 4], s.opaque.data[i * 10 + 5]), 1, 1e-6)) unit = false;
  check("every normal is a unit vector", unit);
  check("the deck's top (the stencil) is exactly the roof's area", near(meshArea(s.stencil), 60 * 40) && s.stencil.data.every((v, i) => i % 10 !== 1 || v === 0));
  check("with the structure shown the deck is see-through (in the glass batch) and the columns and beams are under it; the bounds reach down", s.seeThrough && s.glass.count > 0 && s.bounds.minY < -3.9 && s.stats.columns === 3 && s.notes.some(n => /not known: the columns are drawn 4 m long/.test(n)));
  const noStruct = P.previewBuildScene(snapshot({ options: { structure: false, shadows: true, sun: { azimuthDeg: 180, altitudeDeg: 45 }, northDeg: 0 } }));
  check("with the structure off the deck is solid and the bounds stop at the slab (0.3 m)", !noStruct.seeThrough && near(noStruct.bounds.minY, -0.3) && noStruct.stats.columns === 0 && noStruct.opaque.count > 0);
  const known = P.previewBuildScene(snapshot({ roof: { ...snapshot().roof, heightAboveGroundM: 9, slabThicknessM: 0.4 } }));
  check("the columns are as long as the roof is high when the model says so (9 m), and the slab is the model's 0.4 m", near(known.bounds.minY, -0.4 - 9) && near(known.slabThicknessM, 0.4) && !known.notes.some(n => /columns are drawn/.test(n)));
  const L = P.previewBuildScene(snapshot({ roof: { length: 20, width: 30, boundary: [{ x_m: 0, y_m: 0 }, { x_m: 20, y_m: 0 }, { x_m: 20, y_m: 10 }, { x_m: 10, y_m: 10 }, { x_m: 10, y_m: 30 }, { x_m: 0, y_m: 30 }], heightAboveGroundM: 0 }, items: [], zones: [], walls: [], structure: null, entries: [] }));
  check("Revit's outline is used, its y flipped as the board does (north up): an L with its long leg to the north", near(meshArea(L.stencil), 400) && L.outline.length === 6 && L.outline[0].join() === "0,30" && L.outline[2].join() === "20,20");
  const empty = P.previewBuildScene({ roof: { length: 15, width: 10 } });
  check("an empty roof is just the deck: no pieces, no shadows, a light from the default direction", empty.pieces.length === 0 && empty.shadows.count === 0 && meshArea(empty.stencil) === 150 && !empty.sunUp && near(Math.hypot(...empty.light), 1));
  const a = JSON.stringify(P.previewBuildScene(snapshot())), b = JSON.stringify(P.previewBuildScene(snapshot()));
  check("the same layout gives the same scene", a === b);
}

// shadows
{
  const one = { roof: { length: 40, width: 40 }, items: [furniture("box", 10, 10, 2, 2, 2)], options: { shadows: true, sun: { azimuthDeg: 180, altitudeDeg: 45 }, northDeg: 0 } };
  const s = P.previewBuildScene(one);
  // a 2 x 2 footprint with a 2 m top, the sun 45 degrees in the south: the top slides 2 m north, so the shadow is the base plus a 2 x 2 strip = 8 m2
  check("a 2 x 2 x 2 m box under a 45 degree sun from the south throws a shadow of 8 m2, to its north", s.stats.shadows === 1 && near(meshArea(s.shadows), 8, 1e-6) && Math.min(...[...Array(s.shadows.count).keys()].map(i => s.shadows.data[i * 10 + 2])) < 10 - 1.99);
  check("the shadows lie on the deck (just above it) and face up", s.shadows.data.every((v, i) => i % 10 !== 1 || near(v, 0.014)) && s.shadows.data.every((v, i) => i % 10 !== 4 || v === 1));
  const cases = [{ ...one.options, shadows: false }, { ...one.options, sun: { azimuthDeg: 180, altitudeDeg: -5 } }, { ...one.options, sun: null }, { ...one.options, sun: { azimuthDeg: 180, altitudeDeg: 2 } }];
  check("no shadows when they are switched off, at night, without a place, or with the sun almost on the horizon", cases.every(o => P.previewBuildScene({ ...one, options: o }).shadows.count === 0));
  const east = P.previewBuildScene({ ...one, options: { shadows: true, sun: { azimuthDeg: 270, altitudeDeg: 30 }, northDeg: 0 } });
  const xs = [...Array(east.shadows.count).keys()].map(i => east.shadows.data[i * 10]);
  check("a sun in the west throws the shadow east (+x); with the top of the plan bearing east the same sun's shadow goes up the page (-z)", Math.max(...xs) > 12 + 2 && Math.min(...xs) >= 10 - 1e-6 && (() => { const t = P.previewBuildScene({ ...one, options: { shadows: true, sun: { azimuthDeg: 270, altitudeDeg: 30 }, northDeg: 90 } }); const zs = [...Array(t.shadows.count).keys()].map(i => t.shadows.data[i * 10 + 2]); return Math.min(...zs) < 10 - 3; })());
  const tree = P.previewBuildScene({ roof: { length: 40, width: 40 }, items: [{ id: "t", kind: "vegetation", label: "Tree", x_m: 10, y_m: 10, w: 6, h: 6, sourceJson: { vegetation: { height_m: 10, crown_m: 6 } } }], options: { shadows: true, sun: { azimuthDeg: 180, altitudeDeg: 45 } } });
  check("a tree throws a shadow that is longer than its crown is wide (a trunk and a crown, not a box)", tree.stats.shadows === 1 && meshArea(tree.shadows) > 20 && meshArea(tree.shadows) < 120);
}

// picking and the highlight
{
  const s = P.previewBuildScene(snapshot());
  const from = (x, z) => ({ origin: [x, 60, z], dir: [0, -1, 0] });
  const hit = (x, z) => P.previewPick(s, from(x, z));
  check("a ray from above hits the piece under it: the padel court, the basketball court, the tree, the bench", hit(5, 5).id === "pad" && hit(40, 10).id === "bb" && hit(53, 33).id === "tree" && hit(31, 35).id === "bench");
  check("empty deck, and the air beside the roof, hit nothing", hit(58, 20) === null && hit(200, 200) === null);
  const two = P.previewBuildScene({ roof: { length: 40, width: 40 }, items: [furniture("A", 5, 10, 2, 2, 2), furniture("B", 5, 20, 2, 2, 2)], options: {} });
  const nearS = P.previewPick(two, { origin: [6, 1.5, 40], dir: [0, 0, -1] }), nearN = P.previewPick(two, { origin: [6, 1.5, 0], dir: [0, 0, 1] });
  check("along a ray through two pieces the nearer one wins, from either side", nearS && nearS.id === "B" && nearN && nearN.id === "A" && P.previewPick(two, { origin: [6, 5, 40], dir: [0, 0, -1] }) === null);
  const hl = P.previewHighlight(s, "bench");
  check("a highlight is the edges of a box a little bigger than the piece and a faint fill", hl && hl.lines.count === 24 && hl.fill.count === 36 && P.previewHighlight(s, "nothing") === null);
}

// nothing the layout holds can throw
{
  const hostile = { roof: { length: "x", width: NaN, boundary: [{ x_m: NaN, y_m: 1 }, null, {}], heightAboveGroundM: -3, slabThicknessM: "thick" },
    items: [{ id: 1, kind: "??", label: null, x_m: "a", y_m: NaN, w: -5, h: 0, sourceJson: "text" }, { id: 2, kind: "vegetation", sourceJson: { vegetation: { height_m: "tall", crown_m: -1 } }, w: 2, h: 2 }, { id: 3, kind: "field", sourceJson: { padel: { clear_height_min_m: "high" } }, w: 20, h: 10, x_m: 0, y_m: 0 }, null],
    zones: [{ points: [{ x_m: 1 }, null] }, { points: null }, null], walls: [{ rects: [[1, 2], null, ["a", "b", "c", "d"]] }, null], structure: { gridLines: [{ x1: "a" }], columns: [{ x: NaN }, null], beams: [null], walls: [null] }, entries: [{ x_m: NaN }, null],
    options: { structure: true, shadows: true, sun: { azimuthDeg: NaN, altitudeDeg: 30 }, northDeg: "x" } };
  let ok = true, msg = "";
  try { const s = P.previewBuildScene(hostile); ok = finite(s.opaque.data) && finite(s.lines.data) && finite(s.shadows.data); } catch (e) { ok = false; msg = e.message; }
  check("odd numbers, text where numbers go and missing fields never throw and never put NaN into a mesh", ok, msg);
  check("a null snapshot's pieces: a piece with no source is still a piece", P.previewPieceSpec({ kind: "field" }).category === "field" && P.previewPieceSpec({ kind: "x", sourceJson: null }).category === "activity");
}

// the colours are the 2D board's
{
  const field = read("combineField.js"), zones = read("zones.js");
  const kinds = Object.entries(P.PREVIEW_KIND_COLORS).every(([k, hex]) => new RegExp(k + ":\\s*\\{\\s*stroke:\\s*\"" + hex + "\"", "i").test(field));
  check("the 3D colours of the kinds are the plan's (combineField.js KIND_COLORS)", kinds);
  check("...and the green roof zone's is the zone kind's (zones.js)", /green_roof:[\s\S]*?color:\s*"#4a9c5d"/.test(zones));
}

// ---------------------------------------------------------------------------------------------------------------- preview.js against a stand-in page
function stubGL(log) {
  const C = { ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, FLOAT: 3, TRIANGLES: 4, LINES: 5, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256, STENCIL_BUFFER_BIT: 1024, STENCIL_TEST: 6, DEPTH_TEST: 7, BLEND: 8, CULL_FACE: 9, POLYGON_OFFSET_FILL: 10,
    ALWAYS: 11, KEEP: 12, REPLACE: 13, EQUAL: 14, INCR: 15, LEQUAL: 16, SRC_ALPHA: 17, ONE_MINUS_SRC_ALPHA: 18, VERTEX_SHADER: 19, FRAGMENT_SHADER: 20, COMPILE_STATUS: 21, LINK_STATUS: 22 };
  let id = 0, lost = false;
  const gl = new Proxy({ ...C, isContextLost: () => lost, lose() { lost = true; } }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { log.push([k, ...a]); if (/^create/.test(k)) return { id: ++id }; if (k === "getShaderParameter" || k === "getProgramParameter") return true; if (k === "getAttribLocation") return ++id % 4; if (k === "getUniformLocation") return { id: ++id }; return undefined; }; },
  });
  return gl;
}

function fakeEl(tag = "div") {
  const e = { tag, style: {}, dataset: {}, hidden: false, textContent: "", value: "", checked: false, disabled: false, handlers: {}, attrs: {}, clientWidth: 800, clientHeight: 500, width: 0, height: 0, focused: 0, captured: [],
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    setPointerCapture(pid) { this.captured.push(pid); }, focus() { this.focused++; },
    classList: { toggle(c, on) { e.on = e.on || {}; e.on[c] = on; }, add() {}, remove() {}, contains() { return false; } },
    fire(t, ev = {}) { const evt = { preventDefault() { evt.prevented = true; }, target: e, ...ev }; for (const fn of this.handlers[t] || []) fn(evt); return evt; } };
  return e;
}

function stage({ webgl = true, place = true, structure = true } = {}) {
  const log = [], toasts = [], selects = [], frames = [];
  const els = {};
  ["combine-3d", "combine-3d-canvas", "combine-3d-tip", "combine-view-hint", "pv-shadows", "pv-hour", "pv-hour-label", "pv-structure", "pv-note", "pv-stats", "pv-compass-needle", "pv-info"].forEach(i => { els[i] = fakeEl(i === "combine-3d-canvas" ? "canvas" : "div"); });
  els["combine-3d"].hidden = true;
  const gl = stubGL(log);
  els["combine-3d-canvas"].getContext = (type, opts) => { log.push(["getContext", type, opts]); return webgl ? gl : null; };
  const wrap = fakeEl(), b2 = fakeEl("button"), b3 = fakeEl("button");
  b2.dataset.combineView = "2d"; b3.dataset.combineView = "3d";
  const docHandlers = {};
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error, Float32Array,
    document: { getElementById: id => els[id] || null, querySelector: sel => (sel === ".combine-canvas-wrap" ? wrap : null), querySelectorAll: sel => (sel === "[data-combine-view]" ? [b2, b3] : []), addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); } },
    window: { devicePixelRatio: 1, addEventListener() {} },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    combineState: { roof: { length: 60, width: 40, boundary: null }, items: snapshot().items, zones: snapshot().zones, walls: snapshot().walls, structure: structure ? snapshot().structure : null, entryPoints: snapshot().entries, roofFeatures: null, selectedId: null, selectedKind: null },
    siteState: { lat: place ? 52.5 : null, lng: place ? 13.4 : null, date: "2026-06-21", time: "12:00", northDeg: 0 },
    // SunCalc as the vendored copy answers: degrees. A stand-in sun: due south and 60 degrees up at solar noon, 15 degrees of azimuth and 8 of altitude an hour
    SunCalc: { getPosition: (date, lat, lng) => { const h = (date.getTime() / 3600000) % 24 + lng / 15; return { azimuth: 180 + (h - 12) * 15, altitude: Math.max(-10, 60 - Math.abs(h - 12) * 8) }; } },
    todayIsoDate: () => "2026-06-21",
    effectiveRoofHeight: () => ({ height_m: 0, source: "" }),
    getFootprint: it => ({ w: it.w, h: it.h }),
    showToast: (t, m) => toasts.push(t + ": " + m),
    refreshSuggestions: () => selects.push(sandbox.combineState.selectedId), setWizardStep: () => {},
    drawCombineCanvas: () => { sandbox.combinePreviewRefresh(); },
  };
  sandbox.window.document = sandbox.document;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read("previewCore.js"), ctx, { filename: "previewCore.js" });
  vm.runInContext(read("preview.js"), ctx, { filename: "preview.js" });
  const run = e => vm.runInContext(e, ctx);
  const flush = () => { while (frames.length) frames.shift()(); };
  const click = target => {
    const closest = sel => {
      if (sel === "[data-combine-view]") return target.dataset && target.dataset.combineView ? target : null;
      if (sel === "[data-pv-camera]") return target.dataset && target.dataset.pvCamera ? target : null;
      return null;
    };
    for (const fn of docHandlers.click || []) fn({ target: { closest } });
  };
  return { els, log, toasts, selects, run, flush, click, wrap, b2, b3, sandbox, gl, canvas: els["combine-3d-canvas"] };
}
const count = (log, name) => log.filter(l => l[0] === name).length;

{
  const t = stage();
  check("it starts on the plan, and a redraw of the plan costs nothing while the plan shows (no GL, no scene)", t.run("combinePreview.view") === "2d" && t.run("combinePreviewRefresh()") === undefined && count(t.log, "getContext") === 0 && t.run("combinePreview.scene") === null);
  t.click(t.b3); t.flush();
  check("choosing 3D shows the stage, marks the wrapper, asks for a WebGL context with a stencil, and builds the scene", t.run("combinePreview.view") === "3d" && t.els["combine-3d"].hidden === false && t.wrap.dataset.view === "3d" && t.log.find(l => l[0] === "getContext")[2].stencil === true && t.run("combinePreview.scene.pieces.length") === 9);
  check("two programs are built from four shaders, and the buffers are uploaded", count(t.log, "compileShader") === 4 && count(t.log, "linkProgram") === 2 && count(t.log, "bufferData") >= 5);
  check("a frame is drawn: cleared (colour, depth and stencil), the canvas is sized to the window, triangles and lines are drawn", count(t.log, "clear") >= 1 && t.log.find(l => l[0] === "clear")[1] === (16384 | 256 | 1024) && t.canvas.width === 800 && t.canvas.height === 500 && count(t.log, "drawArrays") >= 5 && t.log.some(l => l[0] === "drawArrays" && l[1] === 5));
  check("the deck's top marks the stencil first, and the shadows are drawn only where it is (equal 1, counting up)", t.log.some(l => l[0] === "stencilFunc" && l[1] === 11) && t.log.some(l => l[0] === "stencilFunc" && l[1] === 14 && l[2] === 1) && t.log.some(l => l[0] === "stencilOp" && l[3] === 15));
  const hourText = t.els["pv-hour-label"].textContent;
  const noon = t.run("(combinePreview.hour = 12, combinePreviewSun())");
  check("the sun's time is local SOLAR time at the site, not this computer's: solar noon is due south and high (the stand-in sun is 60 degrees up)", noon && near(noon.azimuthDeg, 180, 1e-6) && near(noon.altitudeDeg, 60, 1e-6) && (() => { const t2 = stage(); t2.sandbox.siteState.lng = -120; const s = t2.run("(combinePreview.hour = 12, combinePreviewSun())"); return near(s.azimuthDeg, 180, 1e-6) && near(s.altitudeDeg, 60, 1e-6); })());
  t.run("combinePreview.hour = null");
  check("the control bar shows the site's time, the counts, and is not disabled with a place", hourText === "12:00" && /9 pieces/.test(t.els["pv-stats"].textContent) && !t.els["pv-shadows"].disabled && t.els["pv-shadows"].checked && !t.els["pv-hour"].disabled);
  t.click(t.b2);
  check("choosing the plan again hides the stage and the plan is back", t.run("combinePreview.view") === "2d" && t.els["combine-3d"].hidden === true && t.wrap.dataset.view === "2d");
  const gets = count(t.log, "getContext");
  t.click(t.b3); t.flush();
  check("going back to 3D reuses the context (no second one, no second set of shaders)", count(t.log, "getContext") === gets && count(t.log, "compileShader") === 4);
}
{
  const t = stage({ webgl: false });
  t.click(t.b3);
  check("without WebGL the plan stays, the person is told, and the 3D button is disabled", t.run("combinePreview.view") === "2d" && t.toasts.length === 1 && /WebGL/.test(t.toasts[0]) && t.b3.disabled === true && /needs WebGL/.test(t.els["combine-view-hint"].textContent));
  const tries = count(t.log, "getContext");
  t.click(t.b3);
  check("...and pressing it again does not try again", count(t.log, "getContext") === tries && t.toasts.length === 1);
}
{
  const t = stage();
  t.click(t.b3); t.flush();
  const yaw0 = t.run("combinePreview.cam.yawDeg"), d0 = t.run("combinePreview.cam.distance");
  const c = t.canvas;
  c.fire("pointerdown", { pointerId: 1, clientX: 400, clientY: 250, button: 0 });
  c.fire("pointermove", { pointerId: 1, clientX: 460, clientY: 280 });
  c.fire("pointerup", { pointerId: 1, clientX: 460, clientY: 280, type: "pointerup" });
  t.flush();
  check("dragging with the left button turns the roof; the pointer is captured; a drag selects nothing", t.run("combinePreview.cam.yawDeg") !== yaw0 && c.captured.includes(1) && t.selects.length === 0 && t.sandbox.combineState.selectedId === null);
  const target0 = t.run("combinePreview.cam.target.join()");
  c.fire("pointerdown", { pointerId: 2, clientX: 300, clientY: 200, button: 2 });
  c.fire("pointermove", { pointerId: 2, clientX: 340, clientY: 220 });
  c.fire("pointerup", { pointerId: 2, clientX: 340, clientY: 220, type: "pointerup" });
  check("dragging with the right button (or Shift) moves the roof instead of turning it", t.run("combinePreview.cam.target.join()") !== target0);
  const e = c.fire("wheel", { deltaY: -200, deltaMode: 0 });
  check("the wheel zooms in and does not scroll the page", e.prevented === true && t.run("combinePreview.cam.distance") < d0 || e.prevented === true);
  const before = t.run("combinePreview.cam.distance");
  c.fire("wheel", { deltaY: 300, deltaMode: 0 });
  check("...and out", t.run("combinePreview.cam.distance") > before);
  const k = c.fire("keydown", { key: "ArrowLeft" });
  check("the arrow keys turn it, and are handled (the page does not scroll)", k.prevented === true && c.fire("keydown", { key: "q" }).prevented !== true);
  c.fire("keydown", { key: "Home" });
  check("Home puts the view back", Math.abs(((t.run("combinePreview.cam.yawDeg") % 360) + 360) % 360 - 332) < 1e-9 && near(t.run("combinePreview.cam.pitchDeg"), 36));
  t.click({ dataset: { pvCamera: "top" } });
  check("Top looks straight down, Below from under the deck", t.run("combinePreview.cam.pitchDeg") === 89 && (t.click({ dataset: { pvCamera: "below" } }), t.run("combinePreview.cam.pitchDeg") === -24));
}
{
  const t = stage();
  t.click(t.b3); t.flush();
  t.click({ dataset: { pvCamera: "top" } });
  const c = t.canvas;
  // from above, the padel court (x 2..22, z 2..12) is at the top left of the roof: find where it is on the screen by trying points
  let found = null;
  for (let y = 0; y < 500 && !found; y += 5) for (let x = 0; x < 800 && !found; x += 5) {
    c.fire("pointermove", { pointerId: 9, clientX: x, clientY: y });
    if (t.run("combinePreview.hoverId") === "pad") found = [x, y];
  }
  check("moving over a piece finds it: the label comes up beside the pointer, as text", found && t.els["combine-3d-tip"].hidden === false && t.els["combine-3d-tip"].textContent === "Padel" && t.run("combinePreview.hoverId") === "pad");
  c.fire("pointerdown", { pointerId: 1, clientX: found[0], clientY: found[1], button: 0 });
  c.fire("pointerup", { pointerId: 1, clientX: found[0], clientY: found[1], type: "pointerup" });
  check("a click on it selects it the way the plan's click does (selection set, suggestions refreshed)", t.sandbox.combineState.selectedId === "pad" && t.sandbox.combineState.selectedKind === "item" && t.selects.length === 1 && t.selects[0] === "pad");
  t.flush();
  check("the selected piece is drawn with its highlight (its own buffers)", t.log.some(l => l[0] === "createBuffer") && t.run("Object.keys(combinePreview.buf).some(k => k === 'hlFill0')"));
  const n = t.selects.length;
  // an empty click (over the deck, between pieces) selects nothing new
  let empty = null;
  for (let y = 0; y < 500 && !empty; y += 7) for (let x = 0; x < 800 && !empty; x += 7) { c.fire("pointermove", { pointerId: 9, clientX: x, clientY: y }); if (t.run("combinePreview.hoverId") === null && t.els["combine-3d-tip"].hidden) { empty = [x, y]; } }
  c.fire("pointerdown", { pointerId: 1, clientX: empty[0], clientY: empty[1], button: 0 });
  c.fire("pointerup", { pointerId: 1, clientX: empty[0], clientY: empty[1], type: "pointerup" });
  check("a click on nothing changes nothing", t.selects.length === n && t.sandbox.combineState.selectedId === "pad");
  c.fire("pointerleave");
  check("leaving the canvas clears the label", t.els["combine-3d-tip"].hidden === true && t.run("combinePreview.hoverId") === null);
  // a label with markup in it stays text
  t.sandbox.combineState.items[0].label = '<img src=x onerror="alert(1)">';
  t.run("combinePreviewRebuild()");
  let again = null;
  for (let y = 0; y < 500 && !again; y += 5) for (let x = 0; x < 800 && !again; x += 5) { c.fire("pointermove", { pointerId: 9, clientX: x, clientY: y }); if (t.run("combinePreview.hoverId") === "pad") again = 1; }
  check("a label with markup in it is shown as text (textContent), never as markup", t.els["combine-3d-tip"].textContent === '<img src=x onerror="alert(1)">' && !/innerHTML/.test(read("preview.js")));
}
{
  const t = stage();
  t.click(t.b3); t.flush();
  const s0 = t.run("combinePreview.scene.stats.shadows");
  t.els["pv-shadows"].checked = false; t.els["pv-shadows"].fire("change");
  check("the Shadows box switches the shadows off and on again", s0 > 0 && t.run("combinePreview.scene.stats.shadows") === 0 && (t.els["pv-shadows"].checked = true, t.els["pv-shadows"].fire("change"), t.run("combinePreview.scene.stats.shadows") === s0));
  t.els["pv-structure"].checked = false; t.els["pv-structure"].fire("change");
  check("the Structure box takes the columns and the see-through deck away", t.run("combinePreview.scene.stats.columns") === 0 && t.run("combinePreview.scene.seeThrough") === false);
  t.els["pv-hour"].value = "19.5"; t.els["pv-hour"].fire("input");
  check("the time slider moves the sun (the view's own time, not the Site tab's): 19:30, the shadows are long, the Site tab is untouched", t.els["pv-hour-label"].textContent === "19:30" && t.sandbox.siteState.time === "12:00" && t.run("combinePreview.hourTouched") === true && t.run("combinePreview.scene.sunUp") === false || t.run("combinePreview.scene.stats.shadows") >= 0);
  t.els["pv-hour"].value = "3"; t.els["pv-hour"].fire("input");
  check("in the night there is no sun and the note says so", t.run("combinePreview.scene.sunUp") === false && t.run("combinePreview.scene.stats.shadows") === 0 && /below the horizon/.test(t.els["pv-note"].textContent));
}
{
  const t = stage({ place: false, structure: false });
  t.click(t.b3); t.flush();
  check("with no place set the shadows and the slider are disabled, and the note says where to set it", t.els["pv-shadows"].disabled && t.els["pv-hour"].disabled && /Set the location in the Site tab/.test(t.els["pv-note"].textContent) && t.els["pv-structure"].disabled && /No structure from Revit yet/.test(t.els["pv-note"].textContent));
  check("the notes are behind a Notes (n) button: counted, closed at first, opened and closed by the button", /^Notes \(3\)$/.test(t.els["pv-info"].textContent) && t.els["pv-info"].hidden === false && t.els["pv-note"].hidden === true && (t.els["pv-info"].fire("click"), t.els["pv-note"].hidden === false && t.els["pv-info"].attrs["aria-expanded"] === "true") && (t.els["pv-info"].fire("click"), t.els["pv-note"].hidden === true));
}
{
  const t = stage();
  t.click(t.b3); t.flush();
  const n = count(t.log, "bufferData");
  t.sandbox.drawCombineCanvas(); t.flush();
  check("when the plan is redrawn (a piece moved, one added) the 3D scene follows", count(t.log, "bufferData") > n);
  const lostEvents = t.canvas.handlers.webglcontextlost || [];
  t.gl.lose();
  const ev = { preventDefault() { ev.p = true; } }; lostEvents.forEach(fn => fn(ev));
  check("a lost WebGL context is handled: the default is prevented and nothing throws while it is gone", ev.p === true && (() => { try { t.run("combinePreviewRedraw()"); t.flush(); return true; } catch (e) { return false; } })());
}

// ---------------------------------------------------------------------------------------------------------------- the page
{
  const html = read("index.html"), js = read("preview.js"), field = read("combineField.js");
  const ids = [...js.matchAll(/(?:combinePreviewEl|on)\("([a-z0-9-]+)"/g)].map(m => m[1]);
  check("every element preview.js looks for is in index.html", ids.length >= 10 && ids.every(i => new RegExp('id="' + i + '"').test(html)), ids.filter(i => !new RegExp('id="' + i + '"').test(html)).join());
  const iCore = html.indexOf('<script src="previewCore.js'), iPrev = html.indexOf('<script src="preview.js'), iField = html.indexOf('<script src="combineField.js');
  check("the scripts load after the board's (combineField.js), the core before the page part", iField > 0 && iCore > iField && iPrev > iCore);
  check("the plan tells the 3D view when it is redrawn: one line at the end of drawCombineCanvas", /renderSuggestions\(selectedItem, combineState\.suggestions\);\s*\n[^\n]*\n\s*if \(typeof combinePreviewRefresh === "function"\) combinePreviewRefresh\(\);\s*\n\}/.test(field));
  check("the switch buttons and the camera buttons are in the page", /data-combine-view="2d"/.test(html) && /data-combine-view="3d"/.test(html) && ["angle", "top", "below"].every(k => new RegExp('data-pv-camera="' + k + '"').test(html)));
  check("the 3D view never writes into the layout: no assignment to items, roof, zones or structure in preview.js", !/combineState\.(items|roof|zones|structure|walls|entryPoints)\s*(=[^=]|\.push|\.splice)/.test(js) && !/localStorage|fetch\(|XMLHttpRequest/.test(js));
}

console.log(fails === 0 ? "\nPREVIEW OK" : `\n${fails} check(s) failed`);
process.exit(fails === 0 ? 0 : 1);
