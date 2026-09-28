/**
 * landingPreview3d.js — a live 3D glance at the connected Revit roof on the landing page's preview step, in place of
 * the screenshot slideshow (sessionGate.js's LANDING_SLIDES). Reuses previewCore.js's pure scene builder
 * (previewBuildScene) and the exact WebGL shaders preview.js already links for Combine's own 3D view, on a small
 * canvas of its own (#landingPreviewCanvas) — no picking, no shadows, no orbit controls, just a slow auto-rotate.
 *
 * Shown only when BOTH are true: the add-in is connected (workspaceState.connected) AND it has actually pushed a
 * roof this session (revitBridge.js's revitRoofPushed) — connected alone would otherwise show whatever demo/autosave
 * roof combineState already held, mislabelled as "live from Revit". landingPreview3dCheck() is the single entry point:
 * called from workspaceBridge.js's workspaceChanged() (connect/disconnect), revitBridge.js's pollRevitBoundary
 * (a new/changed roof) and sessionGate.js's showPreviewStep() (entering the step) — never on its own timer.
 */
const landingPreview3d = { gl: null, progs: null, buf: {}, scene: null, cam: null, yaw: -28, raf: null, active: false, showing: false };

function landingPreview3dCanvas() { return document.getElementById("landingPreviewCanvas"); }

function landingPreview3dAvailable() {
  return typeof workspaceState !== "undefined" && workspaceState.connected === true
      && typeof revitRoofPushed !== "undefined" && revitRoofPushed
      && typeof combineState !== "undefined" && combineState.roof && combineState.roof.length > 0 && combineState.roof.width > 0;
}

function landingPreview3dStartGL() {
  if (landingPreview3d.gl && !landingPreview3d.gl.isContextLost()) return true;
  const canvas = landingPreview3dCanvas();
  if (!canvas || typeof canvas.getContext !== "function") return false;
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
    // The same shader sources Combine's own 3D view links (preview.js) — declared there as page-global consts.
    const mesh = link(COMBINE_PREVIEW_VS, COMBINE_PREVIEW_FS), line = link(COMBINE_PREVIEW_LINE_VS, COMBINE_PREVIEW_LINE_FS);
    landingPreview3d.progs = {
      mesh, line,
      m: { pos: gl.getAttribLocation(mesh, "aPos"), nor: gl.getAttribLocation(mesh, "aNor"), col: gl.getAttribLocation(mesh, "aCol"), vp: gl.getUniformLocation(mesh, "uVP"), light: gl.getUniformLocation(mesh, "uLight"), flat: gl.getUniformLocation(mesh, "uFlat") },
      l: { pos: gl.getAttribLocation(line, "aPos"), col: gl.getAttribLocation(line, "aCol"), vp: gl.getUniformLocation(line, "uVP") },
    };
  } catch (e) {
    if (typeof console !== "undefined") console.warn("Landing 3D preview: the shaders could not be built (" + e.message + ")");
    return false;
  }
  landingPreview3d.gl = gl;
  landingPreview3d.buf = {};
  canvas.addEventListener("webglcontextlost", ev => { ev.preventDefault(); landingPreview3d.gl = null; });
  return true;
}

function landingPreview3dBuffer(name, batch) {
  const gl = landingPreview3d.gl;
  if (!gl) return;
  const b = landingPreview3d.buf[name] || (landingPreview3d.buf[name] = { buffer: gl.createBuffer(), count: 0 });
  b.count = batch && batch.count ? batch.count : 0;
  if (b.count) { gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.data), gl.DYNAMIC_DRAW); }
}

function landingPreview3dDrawMesh(name, vp, light) {
  const gl = landingPreview3d.gl, b = landingPreview3d.buf[name], P = landingPreview3d.progs;
  if (!gl || !b || !b.count) return;
  gl.useProgram(P.mesh);
  gl.uniformMatrix4fv(P.m.vp, false, vp);
  gl.uniform3f(P.m.light, light[0], light[1], light[2]);
  gl.uniform1f(P.m.flat, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
  gl.enableVertexAttribArray(P.m.pos); gl.vertexAttribPointer(P.m.pos, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(P.m.nor); gl.vertexAttribPointer(P.m.nor, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(P.m.col); gl.vertexAttribPointer(P.m.col, 4, gl.FLOAT, false, 40, 24);
  gl.drawArrays(gl.TRIANGLES, 0, b.count);
}
function landingPreview3dDrawLines(name, vp) {
  const gl = landingPreview3d.gl, b = landingPreview3d.buf[name], P = landingPreview3d.progs;
  if (!gl || !b || !b.count) return;
  gl.useProgram(P.line);
  gl.uniformMatrix4fv(P.l.vp, false, vp);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
  gl.enableVertexAttribArray(P.l.pos); gl.vertexAttribPointer(P.l.pos, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(P.l.col); gl.vertexAttribPointer(P.l.col, 4, gl.FLOAT, false, 28, 12);
  gl.drawArrays(gl.LINES, 0, b.count);
}

/** The board's own snapshot shape (preview.js's combinePreviewSnapshot), read straight from combineState — whatever Revit has pushed and the designer has placed so far. */
function landingPreview3dSnapshot() {
  const roof = combineState.roof;
  const slab = combineState.roofFeatures && combineState.roofFeatures.slab ? combineState.roofFeatures.slab.thickness_m : null;
  return {
    roof: { length: roof.length, width: roof.width, boundary: roof.boundary, heightAboveGroundM: roof.heightAboveGroundM || 0, slabThicknessM: slab },
    items: (combineState.items || []).map(it => {
      const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
      return { id: it.id, kind: it.kind, label: it.label, x_m: it.x_m, y_m: it.y_m, w: fp.w, h: fp.h, sourceJson: it.sourceJson };
    }),
    zones: (combineState.zones || []).map(z => ({ id: z.id, kind: z.kind, points: z.points })),
    walls: combineState.walls || [],
    structure: combineState.structure || null,
    entries: combineState.entryPoints || [],
    // No shadows here (kept simple; the landing page's roof turns instead), no sun — this is a glance, not the full Combine view.
    options: { structure: !!combineState.structure, shadows: false, sun: null, northDeg: typeof siteState !== "undefined" ? siteState.northDeg || 0 : 0 },
  };
}

function landingPreview3dBuildAndUpload() {
  const canvas = landingPreview3dCanvas();
  if (!canvas) return;
  landingPreview3d.scene = previewBuildScene(landingPreview3dSnapshot());
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  landingPreview3d.cam = previewFitCamera(landingPreview3d.scene.bounds, aspect);
  landingPreview3dBuffer("opaque", landingPreview3d.scene.opaque);
  landingPreview3dBuffer("glass", landingPreview3d.scene.glass);
  landingPreview3dBuffer("lines", landingPreview3d.scene.lines);
}

function landingPreview3dDraw() {
  const gl = landingPreview3d.gl, s = landingPreview3d.scene, canvas = landingPreview3dCanvas();
  if (!gl || gl.isContextLost() || !s || !canvas) return;
  const dpr = Math.min(typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

  landingPreview3d.yaw = (landingPreview3d.yaw + 0.06) % 360;
  const cam = { ...landingPreview3d.cam, yawDeg: landingPreview3d.yaw };
  const near = Math.max(0.1, cam.distance * 0.02), far = cam.distance * 6 + 400;
  const eye = previewCameraEye(cam);
  const vp = previewMat4Mul(previewPerspective(cam.fovDeg, w / h, near, far), previewLookAt(eye, cam.target, [0, 1, 0]));

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
  landingPreview3dDrawMesh("opaque", vp, s.light);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  landingPreview3dDrawLines("lines", vp);
  gl.depthMask(false);
  landingPreview3dDrawMesh("glass", vp, s.light);
  gl.depthMask(true);
}

function landingPreview3dLoop() {
  if (!landingPreview3d.active) return;
  landingPreview3dDraw();
  landingPreview3d.raf = requestAnimationFrame(landingPreview3dLoop);
}

function landingPreview3dStart() {
  if (landingPreview3d.active) return true;
  if (!landingPreview3dStartGL()) return false;
  landingPreview3dBuildAndUpload();
  landingPreview3d.active = true;
  landingPreview3dLoop();
  return true;
}
function landingPreview3dStop() {
  landingPreview3d.active = false;
  if (landingPreview3d.raf) cancelAnimationFrame(landingPreview3d.raf);
  landingPreview3d.raf = null;
}

/** Swaps the DOM between the slideshow and the 3D canvas, and updates the caption. */
function landingPreview3dApplyVisibility(showing3d) {
  const wrap = document.getElementById("landingCarouselWrap");
  const canvas = landingPreview3dCanvas();
  if (wrap) wrap.hidden = showing3d;
  if (canvas) canvas.hidden = !showing3d;
  if (typeof landingCarouselToggleBtn !== "undefined" && landingCarouselToggleBtn) landingCarouselToggleBtn.hidden = showing3d;
  if (typeof landingCarouselCaptionEl !== "undefined" && landingCarouselCaptionEl) {
    landingCarouselCaptionEl.textContent = showing3d
      ? "Live from your connected Revit file — turning slowly, updated as you push changes."
      : (typeof LANDING_SLIDES !== "undefined" && typeof landingSlideIndex !== "undefined" && LANDING_SLIDES[landingSlideIndex] ? LANDING_SLIDES[landingSlideIndex].caption : "");
  }
}

/**
 * The single entry point: called whenever something that could change the answer happens (never on its own timer —
 * see the file header for the three call sites). Rebuilds the scene on every call while already showing, too, so a
 * layout change Revit pushes mid-preview is reflected (each call site already gates on something real changing).
 */
function landingPreview3dCheck() {
  const stepShowing = typeof landingPreviewStepEl !== "undefined" && landingPreviewStepEl && !landingPreviewStepEl.hidden;
  const canvas = landingPreview3dCanvas();
  if (!canvas) return;
  const want = stepShowing && landingPreview3dAvailable();

  if (want && landingPreview3d.showing) { landingPreview3dBuildAndUpload(); return; }
  if (!want && !landingPreview3d.showing) return;

  landingPreview3d.showing = want;
  landingPreview3dApplyVisibility(want);
  if (want) {
    if (!landingPreview3dStart()) { landingPreview3d.showing = false; landingPreview3dApplyVisibility(false); return; }
    if (typeof landingCarouselStop === "function") landingCarouselStop();
  } else {
    landingPreview3dStop();
    if (stepShowing && typeof gatePrefersReducedMotion !== "undefined" && !gatePrefersReducedMotion && typeof landingCarouselStart === "function") landingCarouselStart();
  }
}
