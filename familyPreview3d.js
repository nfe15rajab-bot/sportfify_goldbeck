/**
 * familyPreview3d.js — a small standalone 3D preview for one family/type at a time, for the Revit Families tab
 * (revitFamiliesTab.js). Separate from the Combine roof preview (preview.js/previewCore.js) on purpose: this has no
 * roof, no shadows, no picking, just one item on a patch of ground, orbit and zoom — but it reuses previewCore.js's
 * math (matrices, the camera, the box/tube/cylinder mesh builders) and preview.js's WebGL shader source, so it draws
 * with the same look and does not reinvent either.
 *
 * The shape itself is a best-effort likeness, the same trade-off previewFamilyParts already documents for the design
 * team's own families: this app has never seen the fetched family's real Revit geometry, only its name and its
 * measured footprint. A family whose name matches a kind this app already knows how to draw (a CrossFit rig, a TRX
 * frame, a football court, one of the design team's own kit items) gets that kind's shape, built from that shape's
 * own sensible defaults and scaled to the real measured footprint. Anything else is a plain box of its own size,
 * coloured by its Revit category — a likeness beats nothing, and neither claims to be the family itself.
 */

const familyPreview = {
  gl: null, progs: null, buf: null,
  cam: null, scene: null,
  drag: null, pending: false,
};

function familyPreviewCanvas() { return document.getElementById("family-preview-canvas"); }

function familyPreviewStartGL() {
  const canvas = familyPreviewCanvas();
  if (!canvas || typeof canvas.getContext !== "function") return false;
  // renderFamiliesContent() rebuilds the tab's innerHTML on every fetch, edit or preview click, which makes a new
  // canvas element each time — a gl context still bound to yesterday's (now detached) canvas draws to nothing, with
  // no error to say so. Rebinding whenever the element itself has changed is what keeps this idempotent for real.
  if (familyPreview.gl && !familyPreview.gl.isContextLost() && familyPreview.gl.canvas === canvas) return true;
  familyPreview.gl = null;
  let gl = null;
  try { gl = canvas.getContext("webgl", { antialias: true, alpha: true }) || canvas.getContext("experimental-webgl", { antialias: true, alpha: true }); }
  catch (e) { gl = null; }
  if (!gl) return false;
  try {
    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const link = (vs, fs) => {
      const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program");
      return p;
    };
    const mesh = link(COMBINE_PREVIEW_VS, COMBINE_PREVIEW_FS);
    familyPreview.progs = {
      mesh,
      pos: gl.getAttribLocation(mesh, "aPos"), nor: gl.getAttribLocation(mesh, "aNor"), col: gl.getAttribLocation(mesh, "aCol"),
      vp: gl.getUniformLocation(mesh, "uVP"), light: gl.getUniformLocation(mesh, "uLight"), flat: gl.getUniformLocation(mesh, "uFlat"),
    };
  } catch (e) {
    if (typeof console !== "undefined") console.warn("family preview: the shader could not be built (" + e.message + ")");
    return false;
  }
  familyPreview.gl = gl;
  familyPreview.buf = { buffer: gl.createBuffer(), count: 0 };
  canvas.addEventListener("webglcontextlost", ev => { ev.preventDefault(); familyPreview.gl = null; });
  canvas.addEventListener("webglcontextrestored", () => { if (familyPreviewStartGL()) { familyPreviewUpload(); familyPreviewDraw(); } });
  return true;
}

function familyPreviewUpload() {
  const gl = familyPreview.gl, s = familyPreview.scene;
  if (!gl || !s) return;
  const b = familyPreview.buf;
  b.count = s.mesh.count;
  if (b.count) { gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s.mesh.v), gl.STATIC_DRAW); }
}

function familyPreviewDraw() {
  const gl = familyPreview.gl, s = familyPreview.scene, canvas = familyPreviewCanvas(), cam = familyPreview.cam;
  if (!gl || gl.isContextLost() || !s || !canvas || !cam) return;
  const dpr = Math.min(typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

  const near = Math.max(0.05, cam.distance * 0.02), far = cam.distance * 6 + 100;
  const eye = previewCameraEye(cam);
  const vp = previewMat4Mul(previewPerspective(cam.fovDeg, w / h, near, far), previewLookAt(eye, cam.target, [0, 1, 0]));

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const P = familyPreview.progs, b = familyPreview.buf;
  if (!b.count) return;
  gl.useProgram(P.mesh);
  gl.uniformMatrix4fv(P.vp, false, vp);
  gl.uniform3f(P.light, s.light[0], s.light[1], s.light[2]);
  gl.uniform1f(P.flat, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
  gl.enableVertexAttribArray(P.pos); gl.vertexAttribPointer(P.pos, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(P.nor); gl.vertexAttribPointer(P.nor, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(P.col); gl.vertexAttribPointer(P.col, 4, gl.FLOAT, false, 40, 24);
  gl.drawArrays(gl.TRIANGLES, 0, b.count);
}

function familyPreviewRedraw() {
  if (familyPreview.pending) return;
  familyPreview.pending = true;
  const go = () => { familyPreview.pending = false; familyPreviewDraw(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(go); else go();
}

/* ── Which shape a family's name gets ──────────────────────────────────────── */

function familyPreviewShapeKind(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("crossfit")) return "crossfit";
  if (n.includes("trx")) return "trx";
  if (n.includes("calisthenics")) return "calisthenics";
  if (n.includes("ping pong") || n.includes("table tennis") || n.includes("pingpong")) return "ping_pong";
  if (n.includes("planter")) return "planter";
  if (n.includes("climbing tower")) return "fi:climbing_tower";
  if (n.includes("yoga deck")) return "fi:yoga_deck";
  if (n.includes("locker")) return "fi:locker_module";
  if (n.includes("dressing")) return "fi:dressing_cabin";
  if (n.includes("trampoline")) return "fi:trampoline";
  if (n.includes("bocce")) return "fi:urban_bocce";
  if (n.includes("sprint lane")) return "fi:sprint_lane";
  if (n.includes("football") || n.includes("futsal")) return "football";
  if (n.includes("basketball")) return "basketball";
  if (n.includes("volleyball")) return "volleyball";
  if (n.includes("padel")) return "padel";
  return null;
}

/** The four court sports previewFamilyParts/previewRigParts don't cover as a standalone function (they are drawn
 *  inline in previewCore.js's own board scene) — the same shapes, at reasonable defaults rather than the board's
 *  own analysis-derived numbers (net height, rim height, goal size), since this preview has no analysis to read. */
function familyPreviewCourtParts(m, kind, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = (x1 - x0) >= (z1 - z0);
  const H = 0.03;
  previewAddBox(m, x0, 0, z0, x1, H, z1, [0.20, 0.45, 0.28, 1]);

  if (kind === "padel") {
    const E = 3, t = 0.05, glass = [0.62, 0.75, 0.80, 1];
    previewAddBox(m, x0, H, z0, x1, E, z0 + t, glass); previewAddBox(m, x0, H, z1 - t, x1, E, z1, glass);
    previewAddBox(m, x0, H, z0, x0 + t, E, z1, glass); previewAddBox(m, x1 - t, H, z0, x1, E, z1, glass);
    if (alongX) previewAddBox(m, cx - 0.02, H, z0, cx + 0.02, 0.88, z1, [0.9, 0.9, 0.9, 1]);
    else previewAddBox(m, x0, H, cz - 0.02, x1, 0.88, cz + 0.02, [0.9, 0.9, 0.9, 1]);
    return E;
  }
  if (kind === "volleyball") {
    const N = 2.43, post = [0.3, 0.3, 0.32, 1], net = [0.92, 0.92, 0.92, 1];
    if (alongX) { previewAddBox(m, cx - 0.015, N - 1, z0 + 0.5, cx + 0.015, N, z1 - 0.5, net); previewAddBox(m, cx - 0.05, H, z0 + 0.4, cx + 0.05, N + 0.05, z0 + 0.5, post); previewAddBox(m, cx - 0.05, H, z1 - 0.5, cx + 0.05, N + 0.05, z1 - 0.4, post); }
    else { previewAddBox(m, x0 + 0.5, N - 1, cz - 0.015, x1 - 0.5, N, cz + 0.015, net); previewAddBox(m, x0 + 0.4, H, cz - 0.05, x0 + 0.5, N + 0.05, cz + 0.05, post); previewAddBox(m, x1 - 0.5, H, cz - 0.05, x1 - 0.4, N + 0.05, cz + 0.05, post); }
    return N + 0.05;
  }
  if (kind === "basketball") {
    const R = 3.05, post = [0.25, 0.25, 0.28, 1], board = [0.95, 0.95, 0.95, 1];
    const ends = alongX ? [[x0 + 1.2, cz, 1], [x1 - 1.2, cz, -1]] : [[cx, z0 + 1.2, 1], [cx, z1 - 1.2, -1]];
    for (const [ex, ez, dir] of ends) {
      if (alongX) { previewAddBox(m, ex - 0.06, H, ez - 0.06, ex + 0.06, R + 0.3, ez + 0.06, post); previewAddBox(m, ex + dir * 0.06, R - 0.35, ez - 0.9, ex + dir * 0.11, R + 0.7, ez + 0.9, board); }
      else { previewAddBox(m, ex - 0.06, H, ez - 0.06, ex + 0.06, R + 0.3, ez + 0.06, post); previewAddBox(m, ex - 0.9, R - 0.35, ez + dir * 0.06, ex + 0.9, R + 0.7, ez + dir * 0.11, board); }
    }
    return R + 0.7;
  }
  if (kind === "football") {
    const gw = 3, gh = 2, post = 0.08, frame = [0.94, 0.94, 0.95, 1], net = [0.85, 0.87, 0.90, 1];
    const ends = alongX ? [[x0 + 0.1, cz, 1], [x1 - 0.1, cz, -1]] : [[cx, z0 + 0.1, 1], [cx, z1 - 0.1, -1]];
    for (const [ex, ez, dir] of ends) {
      if (alongX) {
        for (const gz of [ez - gw / 2, ez + gw / 2 - post]) previewAddBox(m, ex, H, gz, ex + post, H + gh, gz + post, frame);
        previewAddBox(m, ex, H + gh, ez - gw / 2, ex + post, H + gh + post, ez + gw / 2, frame);
        previewAddBox(m, ex, H, ez - gw / 2, ex + dir * 0.9, H + gh, ez + gw / 2, net);
      } else {
        for (const gx of [ex - gw / 2, ex + gw / 2 - post]) previewAddBox(m, gx, H, ez, gx + post, H + gh, ez + post, frame);
        previewAddBox(m, ex - gw / 2, H + gh, ez, ex + gw / 2, H + gh + post, ez + post, frame);
        previewAddBox(m, ex - gw / 2, H, ez, ex + gw / 2, H + gh, ez + dir * 0.9, net);
      }
    }
    return H + gh + post;
  }
  return H;
}

function familyPreviewGuessHeight(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("planting")) return 1.4;
  if (c.includes("furniture")) return 0.9;
  return 1.1;
}
function familyPreviewCategoryColor(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("planting")) return [0.30, 0.55, 0.32, 1];
  if (c.includes("furniture")) return [0.55, 0.45, 0.30, 1];
  return [0.47, 0.56, 0.64, 1];
}

/* ── Building and showing a scene ────────────────────────────────────────── */

function familyPreviewBuildScene(fam, type) {
  const fp = (typeof footprintForCombine === "function") ? footprintForCombine(fam, type) : null;
  const L = fp && fp.length_m > 0 ? fp.length_m : 3, W = fp && fp.width_m > 0 ? fp.width_m : 3;
  const x0 = -L / 2, x1 = L / 2, z0 = -W / 2, z1 = W / 2;
  const m = previewMesh();
  previewAddBox(m, x0 - 0.5, -0.05, z0 - 0.5, x1 + 0.5, 0, z1 + 0.5, [0.36, 0.40, 0.34, 1]);

  const kind = familyPreviewShapeKind(fam.family_name) || familyPreviewShapeKind(type.type_name);
  let topY;
  if (kind === "crossfit") topY = previewCrossfitParts(m, {}, x0, z0, x1, z1);
  else if (kind === "trx") topY = previewTrxParts(m, {}, x0, z0, x1, z1);
  else if (kind === "calisthenics") topY = previewCalisthenicsParts(m, {}, x0, z0, x1, z1);
  else if (kind === "ping_pong") topY = previewPingPongParts(m, {}, x0, z0, x1, z1);
  else if (kind === "planter") topY = previewPlanterParts(m, { params: { tree: /\btrees?\b/i.test(fam.family_name || "") || / t\b/i.test(fam.family_name || "") } }, x0, z0, x1, z1);
  else if (kind && kind.indexOf("fi:") === 0) topY = previewFamilyParts(m, { type: kind.slice(3), params: {}, units: "m" }, x0, z0, x1, z1);
  else if (kind === "football" || kind === "basketball" || kind === "volleyball" || kind === "padel") topY = familyPreviewCourtParts(m, kind, x0, z0, x1, z1);
  else {
    const h = familyPreviewGuessHeight(fam.category);
    previewAddBox(m, x0, 0, z0, x1, h, z1, familyPreviewCategoryColor(fam.category));
    topY = h;
  }

  const bounds = { minX: x0 - 1, maxX: x1 + 1, minY: 0, maxY: Math.max(1, topY || 1) + 0.4, minZ: z0 - 1, maxZ: z1 + 1 };
  return { mesh: m, bounds, light: previewNormalize([0.45, 0.85, 0.35]) };
}

function familyPreviewShow(fam, type) {
  if (!fam || !type) return false;
  if (!familyPreviewStartGL()) return false;
  const scene = familyPreviewBuildScene(fam, type);
  familyPreview.scene = scene;
  const canvas = familyPreviewCanvas();
  const aspect = canvas && canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1.6;
  familyPreview.cam = previewFitCamera(scene.bounds, aspect, "angle", 42);
  familyPreviewUpload();
  familyPreviewRedraw();
  return true;
}

/* ── Drag to orbit, scroll to zoom — no pan, no picking: this is a look, not a workspace ── */

function familyPreviewPointerDown(e) {
  const c = familyPreviewCanvas();
  if (c && typeof c.setPointerCapture === "function") { try { c.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ } }
  familyPreview.drag = { x: e.clientX, y: e.clientY };
}
function familyPreviewPointerMove(e) {
  if (!familyPreview.drag || !familyPreview.cam) return;
  const dx = e.clientX - familyPreview.drag.x, dy = e.clientY - familyPreview.drag.y;
  familyPreview.drag.x = e.clientX; familyPreview.drag.y = e.clientY;
  familyPreview.cam = previewOrbit(familyPreview.cam, dx, dy);
  familyPreviewRedraw();
}
function familyPreviewPointerUp(e) {
  const c = familyPreviewCanvas();
  if (c && typeof c.releasePointerCapture === "function") { try { c.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ } }
  familyPreview.drag = null;
}
function familyPreviewWheel(e) {
  if (!familyPreview.cam) return;
  e.preventDefault();
  familyPreview.cam = previewZoom(familyPreview.cam, Math.exp(e.deltaY * 0.0012));
  familyPreviewRedraw();
}
function familyPreviewInitInteraction() {
  const c = familyPreviewCanvas();
  if (!c || c.dataset.familyPreviewWired) return;
  c.dataset.familyPreviewWired = "1";
  c.addEventListener("pointerdown", familyPreviewPointerDown);
  c.addEventListener("pointermove", familyPreviewPointerMove);
  c.addEventListener("pointerup", familyPreviewPointerUp);
  c.addEventListener("pointercancel", familyPreviewPointerUp);
  c.addEventListener("wheel", familyPreviewWheel, { passive: false });
  window.addEventListener("resize", () => familyPreviewRedraw());
}
