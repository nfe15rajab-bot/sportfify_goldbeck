/**
 * previewCore.js — the 3D view of the Combine roof, without a page and without WebGL: the model of what is shown. Pure (no DOM, no network, no GL), so tools/preview-test.js runs it
 * as it is; preview.js draws it.
 *
 * What is in it: a camera that orbits a point (turn, zoom, move) and the ray a click makes; ear-clipping triangulation for the roof outline (which may be an L or any other shape) and for
 * the ground zones; the meshes of the scene (the roof slab, the pieces as volumes, the trees, the structure under the deck, the indoor zone's walls, the entrances); the sun and the
 * shadows it throws on the deck (a convex hull of each volume's corners projected along the sun's rays); and which piece a ray hits.
 *
 * Coordinates: the plan's own. X is the plan's x (east when north is up), Z is the plan's y (it grows DOWN the page, so south), Y is up, in metres, with the deck's top at Y = 0. Looking
 * from the south (yaw 0) at the plan, north is up and east is right, exactly as on the 2D board. An item is an axis-aligned rectangle at (x_m, y_m) of its on-board size (w, h), as the board draws it.
 * Names start with "preview" so that they cannot meet another script's in the shared global scope.
 */

const PREVIEW_DEG = Math.PI / 180;

// The sizes the layout does not say (a court's slab, a bed's height, a column's size): shown, not analysed. The 2D board's colours (combineField.js KIND_COLORS) are kept in step by tools/preview-test.js.
const PREVIEW_DEFAULTS = {
  slabM: 0.3,            // the roof slab's thickness when the Revit model did not say
  courtM: 0.12,          // a court's surface above the deck
  bedM: 0.35,            // a garden bed's build-up
  activityM: 0.2,
  revitPieceM: 2.5,      // a piece from the Revit families tab: only its footprint is known
  treeM: 4.5,            // a tree's height when the plant says none
  wallM: 3.0,            // the indoor zone's wall
  columnM: 0.35,         // a column's side
  storeyM: 4.0,          // how far the columns go down when the roof's height above ground is not known
  furnitureM: 0.6,
};
const PREVIEW_KIND_COLORS = { field: "#3d6fff", activity: "#9c4fe0", garden: "#0ea355", vegetation: "#2f7a43", revit: "#d97706" };
const PREVIEW_ZONE_COLORS = { green_roof: "#4a9c5d" };
const PREVIEW_MIN_SUN_DEG = 3;        // below this the shadows would be miles long: none are drawn

function previewHex(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return [0.6, 0.6, 0.6, alpha];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255, alpha];
}
const previewNum = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const previewPos = (v, fallback) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

// ---------------------------------------------------------------------------------------------------------------- vectors and matrices (column-major, as GL wants them)
const previewSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const previewDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const previewCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function previewNormalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
}

function previewMat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function previewPerspective(fovYDeg, aspect, near, far) {
  const f = 1 / Math.tan(fovYDeg * PREVIEW_DEG / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function previewLookAt(eye, target, up) {
  const f = previewNormalize(previewSub(target, eye));
  const s = previewNormalize(previewCross(f, up));
  const u = previewCross(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -previewDot(s, eye), -previewDot(u, eye), previewDot(f, eye), 1];
}

// ---------------------------------------------------------------------------------------------------------------- the orbiting camera
/** { target, distance, yawDeg, pitchDeg, fovDeg, minDistance, maxDistance }. Yaw 0 looks at the target from the south; pitch is the elevation (90 = straight down; below 0 looks up at the deck from underneath). */
function previewCameraEye(cam) {
  const y = cam.yawDeg * PREVIEW_DEG, p = cam.pitchDeg * PREVIEW_DEG;
  return [cam.target[0] + cam.distance * Math.sin(y) * Math.cos(p), cam.target[1] + cam.distance * Math.sin(p), cam.target[2] + cam.distance * Math.cos(y) * Math.cos(p)];
}

function previewCameraBasis(cam) {
  const eye = previewCameraEye(cam);
  const forward = previewNormalize(previewSub(cam.target, eye));
  const right = previewNormalize(previewCross(forward, [0, 1, 0]));
  const up = previewCross(right, forward);
  return { eye, forward, right, up };
}

const previewClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PREVIEW_PITCH_MIN = -30, PREVIEW_PITCH_MAX = 89;

/** Drag by (dx, dy) pixels: right turns the roof to the right, down looks from higher up. */
function previewOrbit(cam, dx, dy, degPerPx = 0.4) {
  return { ...cam, yawDeg: ((cam.yawDeg - dx * degPerPx) % 360 + 360) % 360, pitchDeg: previewClamp(cam.pitchDeg + dy * degPerPx, PREVIEW_PITCH_MIN, PREVIEW_PITCH_MAX) };
}

function previewZoom(cam, factor) {
  return { ...cam, distance: previewClamp(cam.distance * factor, cam.minDistance, cam.maxDistance) };
}

/** Moves the target along the ground under the drag ("grab the roof"): viewHeightPx is the canvas' height in pixels. The target stays within `limit` (bounds) so the roof cannot be lost. */
function previewPan(cam, dx, dy, viewHeightPx, limit) {
  const perPx = 2 * cam.distance * Math.tan(cam.fovDeg * PREVIEW_DEG / 2) / Math.max(1, viewHeightPx);
  const yaw = cam.yawDeg * PREVIEW_DEG;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)], ahead = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  const lift = Math.max(0.2, Math.sin(Math.max(0, cam.pitchDeg) * PREVIEW_DEG));      // a tilted view stretches the ground vertically
  const tx = cam.target[0] - right[0] * dx * perPx + ahead[0] * dy * perPx / lift;
  const tz = cam.target[2] - right[2] * dx * perPx + ahead[2] * dy * perPx / lift;
  const box = limit || { minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 };
  return { ...cam, target: [previewClamp(tx, box.minX, box.maxX), cam.target[1], previewClamp(tz, box.minZ, box.maxZ)] };
}

/**
 * The whole roof in view: from the south-west at a slanting angle, or straight down. The distance is the exact one for the roof's box (every corner inside the frame, with a margin), so a long
 * thin roof fills a wide window instead of being lost in a sphere round it.
 */
function previewFitCamera(bounds, aspect, view = "angle", fovDeg = 40) {
  const sx = bounds.maxX - bounds.minX, sz = bounds.maxZ - bounds.minZ, sy = Math.max(0, bounds.maxY - bounds.minY);
  const radius = Math.max(1, 0.5 * Math.hypot(sx, sz, sy));
  const tanV = Math.tan(fovDeg * PREVIEW_DEG / 2), tanH = tanV * Math.max(0.2, aspect);
  const cam = {
    target: [(bounds.minX + bounds.maxX) / 2, Math.max(0, (bounds.minY + bounds.maxY) / 2), (bounds.minZ + bounds.maxZ) / 2],
    distance: 1, yawDeg: view === "top" ? 0 : -28, pitchDeg: view === "top" ? 89 : 36, fovDeg, minDistance: Math.max(2, radius * 0.25), maxDistance: 100,
  };
  const basis = previewCameraBasis(cam);      // the orientation does not depend on the distance
  let need = 1;
  for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
    const rel = [x - cam.target[0], y - cam.target[1], z - cam.target[2]];
    const px = previewDot(rel, basis.right), py = previewDot(rel, basis.up), pf = previewDot(rel, basis.forward);      // pf: how much farther than the target this corner is
    need = Math.max(need, Math.abs(px) / tanH - pf, Math.abs(py) / tanV - pf);
  }
  cam.distance = need * 1.08;
  cam.maxDistance = cam.distance * 5;
  return cam;
}

/** The ray a point of the canvas makes: ndcX, ndcY in -1..1 (right, up). */
function previewPickRay(cam, aspect, ndcX, ndcY) {
  const b = previewCameraBasis(cam);
  const tanV = Math.tan(cam.fovDeg * PREVIEW_DEG / 2), tanH = tanV * aspect;
  const d = previewNormalize([b.forward[0] + b.right[0] * ndcX * tanH + b.up[0] * ndcY * tanV, b.forward[1] + b.right[1] * ndcX * tanH + b.up[1] * ndcY * tanV, b.forward[2] + b.right[2] * ndcX * tanH + b.up[2] * ndcY * tanV]);
  return { origin: b.eye, dir: d };
}

/** Where the ray enters an axis-aligned box ({ min, max }): the distance along the ray, or null. */
function previewRayBox(ray, box) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = ray.origin[i], d = ray.dir[i];
    if (Math.abs(d) < 1e-12) { if (o < box.min[i] || o > box.max[i]) return null; continue; }
    let a = (box.min[i] - o) / d, b = (box.max[i] - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

// ---------------------------------------------------------------------------------------------------------------- polygons
/** Signed area of [[x, y], ...]: positive when counter-clockwise in a y-up frame. */
function previewPolygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** The polygon without its closing point (when it repeats the first) and without points that repeat the one before. */
function previewCleanPolygon(poly) {
  const out = [];
  for (const p of poly || []) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
    out.push([p[0], p[1]]);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out.at(-1)[0]) < 1e-9 && Math.abs(out[0][1] - out.at(-1)[1]) < 1e-9) out.pop();
  return out;
}

/** Ear clipping. Returns triangles as index triples into the CLEANED polygon (see previewCleanPolygon), whatever the polygon's winding; [] for a polygon with no area. Concave outlines (an L, a notch) work. */
function previewTriangulate(polyIn) {
  const poly = previewCleanPolygon(polyIn);
  const n = poly.length;
  if (n < 3 || Math.abs(previewPolygonArea(poly)) < 1e-9) return [];
  const idx = poly.map((_, i) => i);
  if (previewPolygonArea(poly) < 0) idx.reverse();      // counter-clockwise from here on
  const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9;
  };
  const tris = [];
  let guard = idx.length * idx.length + 10;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 1e-12) continue;      // a reflex or straight corner is not an ear
      let ear = true;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        const pj = poly[j];
        if ((pj[0] === poly[a][0] && pj[1] === poly[a][1]) || (pj[0] === poly[b][0] && pj[1] === poly[b][1]) || (pj[0] === poly[c][0] && pj[1] === poly[c][1])) continue;
        if (inside(j, a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // no ear: a straight (collinear) corner is what is in the way; drop one so the rest can go on
      const k = idx.findIndex((_, i) => Math.abs(cross(idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length])) <= 1e-9);
      if (k < 0) break;
      idx.splice(k, 1);
    }
  }
  if (idx.length === 3 && cross(idx[0], idx[1], idx[2]) > 1e-12) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** Convex hull of [[x, y], ...] (Andrew's monotone chain), counter-clockwise, without repeating the first point. */
function previewConvexHull(points) {
  const pts = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (uniq.length < 3) return uniq;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) { const p = uniq[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ---------------------------------------------------------------------------------------------------------------- the sun and the shadows
/** The unit vector from the ground TOWARDS the sun, in the plan's frame. Azimuth is the compass bearing (clockwise from true north, as sunPosition.js gives it); northDeg is the bearing of the top of the plan. */
function previewSunDirection(azimuthDeg, altitudeDeg, northDeg = 0) {
  const b = (azimuthDeg - northDeg) * PREVIEW_DEG, a = altitudeDeg * PREVIEW_DEG;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), -Math.cos(a) * Math.cos(b)];
}

/** Where the corners of a solid fall on the deck (Y = 0) along the sun's rays, as the convex hull of their shadows; null when the sun is too low or there is nothing to cast. */
function previewShadowOf(points, sun) {
  if (!sun || sun[1] < Math.sin(PREVIEW_MIN_SUN_DEG * PREVIEW_DEG) || !points || !points.length) return null;
  const flat = points.map(p => { const t = Math.max(0, p[1]) / sun[1]; return [p[0] - sun[0] * t, p[2] - sun[2] * t]; });
  const hull = previewConvexHull(flat);
  return hull.length >= 3 && Math.abs(previewPolygonArea(hull)) > 1e-6 ? hull : null;
}

// ---------------------------------------------------------------------------------------------------------------- meshes
/** Triangles with a normal and a colour per vertex, interleaved: x y z  nx ny nz  r g b a. */
function previewMesh() { return { v: [], count: 0 }; }
function previewPushVertex(m, p, n, c) { m.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3]); m.count++; }
function previewPushTriangle(m, a, b, c, color, normal) {
  const n = normal || previewNormalize(previewCross(previewSub(b, a), previewSub(c, a)));
  previewPushVertex(m, a, n, color); previewPushVertex(m, b, n, color); previewPushVertex(m, c, n, color);
}

/** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1). */
function previewAddBox(m, x0, y0, z0, x1, y1, z1, color) {
  const P = (x, y, z) => [x, y, z];
  const face = (a, b, c, d, n) => { previewPushTriangle(m, a, b, c, color, n); previewPushTriangle(m, a, c, d, color, n); };
  face(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0]);      // top
  face(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0]);     // bottom
  face(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1]);      // south (+z)
  face(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [0, 0, -1]);     // north
  face(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [1, 0, 0]);      // east
  face(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [-1, 0, 0]);     // west
}

/** A flat polygon at height y (the plan's [x, z] points), facing up (or down). */
function previewAddPolygonFlat(m, poly, y, color, facing = 1) {
  const p = previewCleanPolygon(poly);
  for (const [a, b, c] of previewTriangulate(p)) {
    const A = [p[a][0], y, p[a][1]], B = [p[b][0], y, p[b][1]], C = [p[c][0], y, p[c][1]];
    // triangulate() winds counter-clockwise in (x, z); seen from above (y up) with z downwards that is clockwise, so flip for an upward normal
    if (facing >= 0) previewPushTriangle(m, A, C, B, color, [0, 1, 0]); else previewPushTriangle(m, A, B, C, color, [0, -1, 0]);
  }
}

/** A polygon (the plan's [x, z] points) extruded from y0 up to y1: the top, the bottom and the sides. */
function previewAddPrism(m, polyIn, y0, y1, color, sideColor) {
  const poly = previewCleanPolygon(polyIn);
  if (poly.length < 3) return;
  previewAddPolygonFlat(m, poly, y1, color, 1);
  previewAddPolygonFlat(m, poly, y0, sideColor || color, -1);
  const ccw = previewPolygonArea(poly) > 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const [a, b] = ccw ? [p, q] : [q, p];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    // an outward normal: for a polygon that is counter-clockwise in (x, z), the outside is on the right of a -> b
    const n = [dz / len, 0, -dx / len];
    const A0 = [a[0], y0, a[1]], B0 = [b[0], y0, b[1]], B1 = [b[0], y1, b[1]], A1 = [a[0], y1, a[1]];
    previewPushTriangle(m, A0, B0, B1, sideColor || color, n); previewPushTriangle(m, A0, B1, A1, sideColor || color, n);
  }
}

function previewAddCylinder(m, cx, cz, r, y0, y1, color, segs = 10) {
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * 2 * Math.PI, a1 = (i + 1) / segs * 2 * Math.PI;
    const x0 = cx + r * Math.cos(a0), z0 = cz + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), z1 = cz + r * Math.sin(a1);
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    previewPushVertex(m, [x0, y0, z0], n0, color); previewPushVertex(m, [x1, y0, z1], n1, color); previewPushVertex(m, [x1, y1, z1], n1, color);
    previewPushVertex(m, [x0, y0, z0], n0, color); previewPushVertex(m, [x1, y1, z1], n1, color); previewPushVertex(m, [x0, y1, z0], n0, color);
    previewPushTriangle(m, [cx, y1, cz], [x1, y1, z1], [x0, y1, z0], color, [0, 1, 0]);
  }
}

function previewAddEllipsoid(m, cx, cy, cz, rx, ry, rz, color, lat = 6, lon = 12) {
  const at = (i, j) => {
    const th = i / lat * Math.PI, ph = j / lon * 2 * Math.PI;
    const p = [cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.cos(th), cz + rz * Math.sin(th) * Math.sin(ph)];
    const n = previewNormalize([(p[0] - cx) / (rx * rx), (p[1] - cy) / (ry * ry), (p[2] - cz) / (rz * rz)]);
    return { p, n };
  };
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if (i > 0) { previewPushVertex(m, a.p, a.n, color); previewPushVertex(m, d.p, d.n, color); previewPushVertex(m, c.p, c.n, color); }
    if (i < lat - 1) { previewPushVertex(m, a.p, a.n, color); previewPushVertex(m, c.p, c.n, color); previewPushVertex(m, b.p, b.n, color); }
  }
}

/** Line segments with a colour per vertex, interleaved: x y z  r g b a. */
function previewLines() { return { v: [], count: 0 }; }
function previewAddSegment(l, a, b, color) { l.v.push(a[0], a[1], a[2], color[0], color[1], color[2], color[3], b[0], b[1], b[2], color[0], color[1], color[2], color[3]); l.count += 2; }
function previewAddBoxEdges(l, x0, y0, z0, x1, y1, z1, color) {
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => previewAddSegment(l, c[i], c[j], color));
}
function previewAddLoop(l, poly, y, color) {
  const p = previewCleanPolygon(poly);
  for (let i = 0; i < p.length; i++) previewAddSegment(l, [p[i][0], y, p[i][1]], [p[(i + 1) % p.length][0], y, p[(i + 1) % p.length][1]], color);
}

// ---------------------------------------------------------------------------------------------------------------- what the pieces are, and how tall
/**
 * The height of a piece and what it is made of, from what the layout says about it (the same places the inspector reads): a court's clear height, a plant's height and crown, a furniture item's
 * height. What is not said is a plain default (PREVIEW_DEFAULTS), and `assumed` says so. category: court | field | garden | tree | furniture | revit | activity.
 */
function previewPieceSpec(it) {
  const sj = it && it.sourceJson && typeof it.sourceJson === "object" ? it.sourceJson : {};
  const D = PREVIEW_DEFAULTS;
  if (sj.furniture) { const f = sj.furniture; return { category: "furniture", heightM: previewPos(f.height_m, D.furnitureM), assumed: !(f.height_m > 0) }; }
  if (sj.vegetation || it.kind === "vegetation") {
    const v = sj.vegetation || {};
    const h = previewPos(v.height_m, previewPos(v.mature_height_m, 0));
    return { category: "tree", heightM: h || D.treeM, crownM: previewPos(v.crown_m, 0), assumed: !h };
  }
  if (sj.padel) { const p = sj.padel; return { category: "court", sport: "padel", heightM: D.courtM, clearM: previewPos(p.clear_height_min_m, 0), enclosureM: previewPos(previewNum(p.back_wall_glass_height_m, 0) + previewNum(p.back_wall_mesh_height_m, 0), 3), netM: previewPos(p.net_centre_height_m, 0.88), assumed: false }; }
  if (sj.basketball) { const b = sj.basketball; return { category: "court", sport: "basketball", heightM: D.courtM, clearM: previewPos(b.clear_height_min_m, 0), rimM: previewPos(b.rim_height_m, 3.05), assumed: false }; }
  if (sj.volleyball) { const v = sj.volleyball; return { category: "court", sport: "volleyball", heightM: D.courtM, clearM: previewPos(v.clear_height_min_m, 0), netM: previewPos(v.net_height_m, 2.43), assumed: false }; }
  if (it.kind === "garden") return { category: "garden", heightM: D.bedM, assumed: true };
  if (it.kind === "revit") return { category: "revit", heightM: D.revitPieceM, assumed: true };
  const dims = sj.field && sj.field.dimensions ? sj.field.dimensions : {};
  if (it.kind === "field") return { category: "field", heightM: D.courtM, clearM: previewPos(dims.min_height_m, 0), assumed: false };
  return { category: "activity", heightM: D.activityM, clearM: previewPos(dims.min_height_m, 0), assumed: true };
}

// ---------------------------------------------------------------------------------------------------------------- the scene
/**
 * The scene of a snapshot of the board:
 * {
 *   roof: { length, width, boundary: [{ x_m, y_m }] | null (y as Revit gives it, north up), heightAboveGroundM, slabThicknessM },
 *   items: [{ id, kind, label, x_m, y_m, w, h, sourceJson }], zones: [{ id, kind, points: [{ x_m, y_m }] }], walls: [{ rects: [[x0, y0, x1, y1]] }],
 *   structure: { gridLines: [{ x1, y1, x2, y2 }], columns: [{ x, y }], beams: [...], walls: [...] } | null, entries: [{ x_m, y_m }],
 *   options: { structure: bool, shadows: bool, sun: { azimuthDeg, altitudeDeg } | null, northDeg }
 * }
 * Returns { bounds, outline, opaque, glass, lines, shadows, stencil, pieces, light, sunUp, seeThrough, notes, stats }: meshes for preview.js to upload, the roof's outline (for the stencil that keeps the shadows on the
 * deck), and the pick boxes of the pieces. Deterministic: the same snapshot gives the same scene.
 */
function previewBuildScene(snapIn) {
  const D = PREVIEW_DEFAULTS;
  // whatever the layout holds: lists without their holes (a null, a text where an object goes)
  const list = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === "object");
  const st0 = snapIn.structure && typeof snapIn.structure === "object" ? snapIn.structure : null;
  const snap = {
    ...snapIn, items: list(snapIn.items), zones: list(snapIn.zones).map(z => ({ ...z, points: list(z.points) })), walls: list(snapIn.walls).map(w => ({ ...w, rects: Array.isArray(w.rects) ? w.rects : [] })), entries: list(snapIn.entries),
    structure: st0 ? { ...st0, gridLines: list(st0.gridLines), columns: list(st0.columns), beams: list(st0.beams), walls: list(st0.walls) } : null,
  };
  const roof = snap.roof && typeof snap.roof === "object" ? { ...snap.roof, boundary: list(snap.roof.boundary) } : { length: 10, width: 10, boundary: [] };
  roof.length = previewPos(roof.length, 10); roof.width = previewPos(roof.width, 10);
  const options = snap.options || {};
  const opaque = previewMesh(), glass = previewMesh(), lines = previewLines(), shadowMesh = previewMesh(), stencilMesh = previewMesh();
  const notes = [];
  const pieces = [];
  const casters = [];        // { id, points } the shadows come from

  // the roof's outline: Revit's polygon when there is one (its y grows northwards: the board flips it, so it is flipped here), else the bounding rectangle
  let outline = roof.boundary && roof.boundary.length >= 3
    ? previewCleanPolygon(roof.boundary.map(p => [previewNum(p.x_m, 0), previewNum(roof.width, 0) - previewNum(p.y_m, 0)]))
    : [];
  if (outline.length < 3 || Math.abs(previewPolygonArea(outline)) < 1e-6) outline = [[0, 0], [roof.length, 0], [roof.length, roof.width], [0, roof.width]];
  const slab = previewPos(roof.slabThicknessM, D.slabM);
  const seeThrough = !!(options.structure && snap.structure);

  // the deck: a slab whose top is Y = 0; see-through (so that the structure under it shows) only while the structure is shown
  const deckColor = seeThrough ? [0.62, 0.66, 0.72, 0.42] : [0.66, 0.69, 0.74, 1], slabSide = seeThrough ? [0.5, 0.54, 0.6, 0.5] : [0.5, 0.53, 0.58, 1];
  previewAddPrism(seeThrough ? glass : opaque, outline, -slab, 0, deckColor, slabSide);
  previewAddPolygonFlat(stencilMesh, outline, 0, [1, 1, 1, 1], 1);
  previewAddLoop(lines, outline, 0.01, [0.15, 0.17, 0.22, 0.95]);

  // a light 5 m grid on the deck, for scale
  {
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs), c = [0.35, 0.4, 0.5, 0.16];
    for (let x = Math.ceil(minX / 5) * 5; x <= maxX; x += 5) previewAddSegment(lines, [x, 0.004, minZ], [x, 0.004, maxZ], c);
    for (let z = Math.ceil(minZ / 5) * 5; z <= maxZ; z += 5) previewAddSegment(lines, [minX, 0.004, z], [maxX, 0.004, z], c);
  }

  // ground zones: flat, coloured like their kind
  for (const z of snap.zones || []) {
    const poly = (z.points || []).map(p => [previewNum(p.x_m, 0), previewNum(p.y_m, 0)]);
    if (previewCleanPolygon(poly).length < 3) continue;
    previewAddPolygonFlat(opaque, poly, 0.008, previewHex(PREVIEW_ZONE_COLORS[z.kind] || "#4a9c5d"), 1);
  }

  // the pieces
  let topY = 0;
  for (const it of snap.items || []) {
    const w = previewPos(it.w, 1), h = previewPos(it.h, 1), x0 = previewNum(it.x_m, 0), z0 = previewNum(it.y_m, 0), x1 = x0 + w, z1 = z0 + h, cx = x0 + w / 2, cz = z0 + h / 2;
    const spec = previewPieceSpec(it);
    const base = previewHex(PREVIEW_KIND_COLORS[it.kind] || PREVIEW_KIND_COLORS.field);
    const pick = { min: [x0, 0, z0], max: [x1, spec.heightM, z1] };
    const alongX = w >= h;

    if (spec.category === "tree") {
      const H = spec.heightM, crown = spec.crownM || Math.min(w, h), trunkH = H * 0.4, crownH = H - trunkH;
      previewAddCylinder(opaque, cx, cz, Math.max(0.1, Math.min(0.3, crown * 0.05)), 0, trunkH, previewHex("#6b4f2f"), 8);
      previewAddEllipsoid(opaque, cx, trunkH + crownH / 2, cz, crown / 2, crownH / 2, crown / 2, previewHex(PREVIEW_KIND_COLORS.vegetation));
      pick.min = [cx - crown / 2, 0, cz - crown / 2]; pick.max = [cx + crown / 2, H, cz + crown / 2];
      const pts = [[cx, 0, cz], [cx, trunkH, cz]];
      for (const yy of [trunkH + crownH * 0.15, trunkH + crownH * 0.5, trunkH + crownH * 0.85]) {
        const k = Math.sqrt(Math.max(0, 1 - Math.pow((yy - trunkH - crownH / 2) / (crownH / 2), 2)));
        for (let i = 0; i < 12; i++) pts.push([cx + Math.cos(i / 12 * 2 * Math.PI) * crown / 2 * k, yy, cz + Math.sin(i / 12 * 2 * Math.PI) * crown / 2 * k]);
      }
      pts.push([cx, H, cz]);
      casters.push({ id: it.id, points: pts });
      topY = Math.max(topY, H);
    } else {
      const H = spec.heightM;
      const top = spec.category === "garden" ? previewHex("#3fbf7f") : previewHex(PREVIEW_KIND_COLORS[it.kind] || PREVIEW_KIND_COLORS.field);
      previewAddBox(opaque, x0, 0, z0, x1, H, z1, spec.category === "furniture" || spec.category === "revit" ? base : top);
      previewAddLoop(lines, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], H + 0.004, [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55, 0.95]);
      const pts = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1]];
      let topOfPiece = H;

      if (spec.category === "court" || spec.category === "field" || spec.category === "activity") {
        // the room the court needs, as faint edges (its clear height), and the things that stand on it
        if (spec.clearM) { previewAddBoxEdges(lines, x0, H, z0, x1, spec.clearM, z1, [base[0], base[1], base[2], 0.4]); topOfPiece = Math.max(topOfPiece, spec.clearM); }
        const glassC = [0.68, 0.84, 0.95, 0.24];
        if (spec.sport === "padel") {
          const E = spec.enclosureM, t = 0.05;
          previewAddBox(glass, x0, H, z0, x1, E, z0 + t, glassC); previewAddBox(glass, x0, H, z1 - t, x1, E, z1, glassC);
          previewAddBox(glass, x0, H, z0, x0 + t, E, z1, glassC); previewAddBox(glass, x1 - t, H, z0, x1, E, z1, glassC);
          if (alongX) previewAddBox(opaque, cx - 0.02, H, z0, cx + 0.02, spec.netM, z1, [0.9, 0.9, 0.9, 1]);
          else previewAddBox(opaque, x0, H, cz - 0.02, x1, spec.netM, cz + 0.02, [0.9, 0.9, 0.9, 1]);
          topOfPiece = Math.max(topOfPiece, E);      // the cage is glass and mesh: it casts no shadow of its own here
        } else if (spec.sport === "volleyball") {
          const N = spec.netM;
          if (alongX) { previewAddBox(opaque, cx - 0.015, N - 1, z0 + 0.5, cx + 0.015, N, z1 - 0.5, [0.92, 0.92, 0.92, 1]); previewAddBox(opaque, cx - 0.05, H, z0 + 0.4, cx + 0.05, N + 0.05, z0 + 0.5, [0.3, 0.3, 0.32, 1]); previewAddBox(opaque, cx - 0.05, H, z1 - 0.5, cx + 0.05, N + 0.05, z1 - 0.4, [0.3, 0.3, 0.32, 1]); }
          else { previewAddBox(opaque, x0 + 0.5, N - 1, cz - 0.015, x1 - 0.5, N, cz + 0.015, [0.92, 0.92, 0.92, 1]); previewAddBox(opaque, x0 + 0.4, H, cz - 0.05, x0 + 0.5, N + 0.05, cz + 0.05, [0.3, 0.3, 0.32, 1]); previewAddBox(opaque, x1 - 0.5, H, cz - 0.05, x1 - 0.4, N + 0.05, cz + 0.05, [0.3, 0.3, 0.32, 1]); }
          topOfPiece = Math.max(topOfPiece, N + 0.05);
        } else if (spec.sport === "basketball") {
          const R = spec.rimM, post = [0.25, 0.25, 0.28, 1], board = [0.95, 0.95, 0.95, 1];
          const ends = alongX ? [[x0 + 1.2, cz, 1], [x1 - 1.2, cz, -1]] : [[cx, z0 + 1.2, 1], [cx, z1 - 1.2, -1]];
          for (const [ex, ez, dir] of ends) {
            if (alongX) { previewAddBox(opaque, ex - 0.06, H, ez - 0.06, ex + 0.06, R + 0.3, ez + 0.06, post); previewAddBox(opaque, ex + dir * 0.06, R - 0.35, ez - 0.9, ex + dir * 0.11, R + 0.7, ez + 0.9, board); }
            else { previewAddBox(opaque, ex - 0.06, H, ez - 0.06, ex + 0.06, R + 0.3, ez + 0.06, post); previewAddBox(opaque, ex - 0.9, R - 0.35, ez + dir * 0.06, ex + 0.9, R + 0.7, ez + dir * 0.11, board); }
          }
          topOfPiece = Math.max(topOfPiece, R + 0.7);
        }
        pick.max = [x1, topOfPiece, z1];
      }
      casters.push({ id: it.id, points: pts });
      topY = Math.max(topY, topOfPiece);
    }
    pieces.push({ id: it.id, label: String(it.label == null ? "" : it.label), kind: it.kind, category: spec.category, assumed: !!spec.assumed, box: pick });
  }

  // the indoor zone's wall
  for (const wall of snap.walls || []) for (const r of wall.rects || []) {
    if (!r || r.length < 4) continue;
    const [a, b, c, d] = r.map(Number);
    if (![a, b, c, d].every(Number.isFinite)) continue;
    previewAddBox(opaque, Math.min(a, c), 0, Math.min(b, d), Math.max(a, c), D.wallM, Math.max(b, d), [0.82, 0.83, 0.86, 1]);
    casters.push({ id: null, points: [[a, 0, b], [c, 0, b], [c, 0, d], [a, 0, d], [a, D.wallM, b], [c, D.wallM, b], [c, D.wallM, d], [a, D.wallM, d]] });
    topY = Math.max(topY, D.wallM);
  }

  // the entrances
  for (const e of snap.entries || []) {
    if (!Number.isFinite(e.x_m) || !Number.isFinite(e.y_m)) continue;
    previewAddBox(opaque, e.x_m - 0.15, 0, e.y_m - 0.15, e.x_m + 0.15, 1.8, e.y_m + 0.15, [0.96, 0.62, 0.04, 1]);
    topY = Math.max(topY, 1.8);
  }

  // the structure: the grid on the deck, and the columns, beams and bearing walls under it (which show through the see-through deck)
  let columnDepth = 0;
  if (options.structure && snap.structure) {
    const st = snap.structure;
    const known = previewPos(roof.heightAboveGroundM, 0);
    columnDepth = known ? Math.min(known, 12) : D.storeyM;
    if (!known) notes.push("The roof's height above ground is not known: the columns are drawn " + D.storeyM + " m long.");
    for (const g of st.gridLines || []) if ([g.x1, g.y1, g.x2, g.y2].every(Number.isFinite)) previewAddSegment(lines, [g.x1, 0.02, g.y1], [g.x2, 0.02, g.y2], [0.36, 0.55, 0.94, 0.9]);
    for (const c of st.columns || []) if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      const s = D.columnM / 2;
      previewAddBox(opaque, c.x - s, -slab - columnDepth, c.y - s, c.x + s, -slab, c.y + s, [0.2, 0.25, 0.33, 1]);
    }
    for (const b of st.beams || []) if ([b.x1, b.y1, b.x2, b.y2].every(Number.isFinite)) {
      const wd = previewPos(b.widthM, 0.25) / 2, dp = previewPos(b.depthM, 0.4);
      previewAddBox(opaque, Math.min(b.x1, b.x2) - wd, -slab - dp, Math.min(b.y1, b.y2) - wd, Math.max(b.x1, b.x2) + wd, -slab, Math.max(b.y1, b.y2) + wd, [0.55, 0.35, 0.13, 1]);
    }
    for (const w of st.walls || []) if ([w.x1, w.y1, w.x2, w.y2].every(Number.isFinite)) {
      const t = previewPos(w.thicknessM, 0.2) / 2;
      previewAddBox(opaque, Math.min(w.x1, w.x2) - t, -slab - columnDepth, Math.min(w.y1, w.y2) - t, Math.max(w.x1, w.x2) + t, -slab, Math.max(w.y1, w.y2) + t, w.bearing ? [0.12, 0.16, 0.23, 1] : [0.58, 0.64, 0.72, 1]);
    }
  }

  // the sun, and the shadows it throws on the deck
  const sunOk = options.sun && Number.isFinite(options.sun.azimuthDeg) && Number.isFinite(options.sun.altitudeDeg);
  const sunDir = sunOk ? previewSunDirection(options.sun.azimuthDeg, options.sun.altitudeDeg, previewNum(options.northDeg, 0)) : null;
  const sunUp = !!(sunDir && sunDir[1] >= Math.sin(PREVIEW_MIN_SUN_DEG * PREVIEW_DEG));
  let shadowCount = 0;
  if (options.shadows && sunUp) {
    for (const c of casters) {
      const hull = previewShadowOf(c.points, sunDir);
      if (!hull) continue;
      previewAddPolygonFlat(shadowMesh, hull, 0.014, [0.02, 0.03, 0.07, 0.4], 1);
      shadowCount++;
    }
  }
  const light = sunUp ? sunDir : previewNormalize([0.4, 0.85, 0.35]);
  const assumed = pieces.filter(p => p.assumed).length;
  if (assumed) notes.push("The layout does not give the height of " + assumed + " piece" + (assumed === 1 ? "" : "s") + " (beds, plants without a height, pieces from Revit, generic activities): a typical height is drawn.");

  const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), minY: options.structure && snap.structure ? -slab - columnDepth : -slab, maxY: Math.max(topY, 2) };
  const finish = m => ({ data: m.v, count: m.count });
  return {
    bounds, outline, slabThicknessM: slab, seeThrough, opaque: finish(opaque), glass: finish(glass), lines: { data: lines.v, count: lines.count }, shadows: finish(shadowMesh), stencil: finish(stencilMesh),
    pieces, light, sunUp, sunDir, notes,
    stats: { pieces: pieces.length, zones: (snap.zones || []).length, columns: options.structure && snap.structure ? (snap.structure.columns || []).length : 0, shadows: shadowCount, assumed },
  };
}

/** The piece a ray hits first, { id, label, category, t } or null. */
function previewPick(scene, ray) {
  let best = null;
  for (const p of scene.pieces) {
    const t = previewRayBox(ray, p.box);
    if (t != null && (!best || t < best.t)) best = { id: p.id, label: p.label, category: p.category, t };
  }
  return best;
}

/** What marks a selected (or hovered) piece: the edges of a box a little bigger than it, and a faint fill. Meshes in the same formats, drawn over the scene. */
function previewHighlight(scene, id, color = [1, 0.85, 0.2, 1]) {
  const p = scene.pieces.find(q => q.id === id);
  if (!p) return null;
  const g = 0.06, b = p.box;
  const lines = previewLines(), fill = previewMesh();
  previewAddBoxEdges(lines, b.min[0] - g, b.min[1] - 0.0, b.min[2] - g, b.max[0] + g, b.max[1] + g, b.max[2] + g, color);
  previewAddBox(fill, b.min[0] - g, b.min[1], b.min[2] - g, b.max[0] + g, b.max[1] + g, b.max[2] + g, [color[0], color[1], color[2], 0.16]);
  return { lines: { data: lines.v, count: lines.count }, fill: { data: fill.v, count: fill.count } };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PREVIEW_DEFAULTS, PREVIEW_KIND_COLORS, PREVIEW_PITCH_MIN, PREVIEW_PITCH_MAX, previewHex, previewMat4Mul, previewPerspective, previewLookAt,
    previewCameraEye, previewCameraBasis, previewOrbit, previewZoom, previewPan, previewFitCamera, previewPickRay, previewRayBox,
    previewPolygonArea, previewCleanPolygon, previewTriangulate, previewConvexHull, previewSunDirection, previewShadowOf,
    previewPieceSpec, previewBuildScene, previewPick, previewHighlight, previewNormalize, previewCross, previewDot, previewSub,
  };
}
