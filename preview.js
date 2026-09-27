/**
 * preview.js — the 3D view of the Combine roof: the plan turned into a model you can walk round. What the model is (the meshes, the camera, the shadows, the picking) is in previewCore.js (pure, tested);
 * this is the page's part: the 2D / 3D switch, a WebGL canvas, the orbit controls, the small control bar (shadows, structure, the time of day) and the hover label.
 *
 * It only reads the board: nothing is written into the layout. The one thing a click does is what a click on the 2D board's piece does (selects it, so the inspector and the legend follow). The
 * scene is rebuilt whenever the board is redrawn (combineField.js drawCombineCanvas ends by calling combinePreviewRefresh), and only while the 3D view is showing; the camera is kept between rebuilds,
 * and put back to fit only when the roof's size changes. It draws on demand (one frame after a change), never in a loop.
 * The time of day is the view's own: moving it does not change the Site tab. Without WebGL the switch says so and stays on the plan.
 */

const combinePreview = {
  view: "2d",
  failed: false,
  gl: null, progs: null, buf: {},
  scene: null, cam: null, fitKey: "",
  shadows: true, structure: true, hour: null, hourTouched: false,
  hoverId: null, pointers: new Map(), drag: null, pending: false, stale: true, notesOpen: false,
};

const combinePreviewEl = id => document.getElementById(id);

const COMBINE_PREVIEW_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol;
uniform mat4 uVP; varying vec3 vNor; varying vec4 vCol;
void main() { vNor = aNor; vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const COMBINE_PREVIEW_FS = `
precision mediump float;
varying vec3 vNor; varying vec4 vCol; uniform vec3 uLight; uniform float uFlat;
void main() {
  float d = max(dot(normalize(vNor), uLight), 0.0);
  float l = mix(0.52 + 0.48 * d, 1.0, uFlat);
  gl_FragColor = vec4(vCol.rgb * l, vCol.a);
}`;
const COMBINE_PREVIEW_LINE_VS = `
attribute vec3 aPos; attribute vec4 aCol; uniform mat4 uVP; varying vec4 vCol;
void main() { vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const COMBINE_PREVIEW_LINE_FS = `
precision mediump float; varying vec4 vCol;
void main() { gl_FragColor = vCol; }`;

// ---------------------------------------------------------------------------------------------------------------- what the board says, as the core wants it
function combinePreviewSnapshot() {
  const roof = combineState.roof;
  const height = typeof effectiveRoofHeight === "function" ? effectiveRoofHeight() : null;
  const slab = combineState.roofFeatures && combineState.roofFeatures.slab ? combineState.roofFeatures.slab.thickness_m : null;
  return {
    roof: { length: roof.length, width: roof.width, boundary: roof.boundary, heightAboveGroundM: height ? height.height_m : 0, slabThicknessM: slab },
    items: combineState.items.map(it => {
      const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
      return { id: it.id, kind: it.kind, label: it.label, x_m: it.x_m, y_m: it.y_m, w: fp.w, h: fp.h, sourceJson: it.sourceJson };
    }),
    zones: (combineState.zones || []).map(z => ({ id: z.id, kind: z.kind, points: z.points })),
    walls: combineState.walls || [],
    structure: combineState.structure || null,
    entries: combineState.entryPoints || [],
    options: { structure: combinePreview.structure && !!combineState.structure, shadows: combinePreview.shadows, sun: combinePreviewSun(), northDeg: typeof siteState !== "undefined" ? siteState.northDeg || 0 : 0 },
  };
}

/**
 * The sun at the view's own time of day, on the Site tab's date and place: null without a place (or before SunCalc has loaded). The hour is local SOLAR time at the site (the clock minus the
 * longitude's offset from UTC, 15 degrees an hour), so that noon is when the sun stands highest whatever time zone this computer is in. (The Site tab's own sun compass reads its time as this
 * computer's clock time, so the two agree only where the computer is in the site's zone.)
 */
function combinePreviewSun() {
  if (typeof siteState === "undefined" || siteState.lat == null || siteState.lng == null || typeof SunCalc === "undefined") return null;
  const hour = combinePreview.hour == null ? combinePreviewSiteHour() : combinePreview.hour;
  const iso = siteState.date || (typeof todayIsoDate === "function" ? todayIsoDate() : new Date().toISOString().slice(0, 10));
  const [y, m, d] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1, d, 0, 0) + (hour - siteState.lng / 15) * 3600000);
  const pos = SunCalc.getPosition(when, siteState.lat, siteState.lng);
  return pos && Number.isFinite(pos.azimuth) && Number.isFinite(pos.altitude) ? { azimuthDeg: pos.azimuth, altitudeDeg: pos.altitude } : null;
}

function combinePreviewSiteHour() {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof siteState !== "undefined" && siteState.time ? siteState.time : "12:00");
  return m ? Math.min(23.75, Number(m[1]) + Number(m[2]) / 60) : 12;
}

function combinePreviewHourText(hour) {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// ---------------------------------------------------------------------------------------------------------------- the switch
function combinePreviewSetView(view) {
  const next = view === "3d" ? "3d" : "2d";
  if (next === "3d" && combinePreview.failed) return false;
  if (next === "3d" && !combinePreviewStartGL()) { combinePreview.failed = true; combinePreviewShowSwitch(); if (typeof showToast === "function") showToast("3D view not available", "This browser or graphics driver does not offer WebGL, so the roof stays a plan."); return false; }
  combinePreview.view = next;
  const wrap = document.querySelector(".combine-canvas-wrap");
  if (wrap) wrap.dataset.view = next;
  const stage = combinePreviewEl("combine-3d");
  if (stage) stage.hidden = next !== "3d";
  combinePreviewShowSwitch();
  if (next === "3d") {
    if (!combinePreview.hourTouched) combinePreview.hour = combinePreviewSiteHour();
    combinePreviewRebuild();
  }
  return true;
}

function combinePreviewShowSwitch() {
  document.querySelectorAll("[data-combine-view]").forEach(b => {
    const on = b.dataset.combineView === combinePreview.view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
    if (b.dataset.combineView === "3d") b.disabled = combinePreview.failed;
  });
  const hint = combinePreviewEl("combine-view-hint");
  if (hint) hint.textContent = combinePreview.failed ? "The 3D view needs WebGL, which is not available here." : combinePreview.view === "3d" ? "Drag to turn the roof, scroll to zoom, right-drag to move. Click a piece to select it." : "";
}

/** Called at the end of every redraw of the plan (combineField.js): cheap while the plan is showing. */
function combinePreviewRefresh() {
  combinePreview.stale = true;
  if (combinePreview.view === "3d") combinePreviewRebuild();
}

// ---------------------------------------------------------------------------------------------------------------- building and drawing
function combinePreviewRebuild() {
  if (combinePreview.view !== "3d") return;
  combinePreview.scene = previewBuildScene(combinePreviewSnapshot());
  combinePreview.stale = false;
  const b = combinePreview.scene.bounds;
  const key = [b.minX, b.maxX, b.minZ, b.maxZ].map(v => v.toFixed(1)).join(",");
  if (!combinePreview.cam || combinePreview.fitKey !== key) { combinePreview.cam = previewFitCamera(b, combinePreviewAspect(), "angle"); combinePreview.fitKey = key; }
  combinePreviewUpload();
  combinePreviewUpdateHud();
  combinePreviewRedraw();
}

function combinePreviewAspect() {
  const c = combinePreviewEl("combine-3d-canvas");
  return c && c.clientWidth > 0 && c.clientHeight > 0 ? c.clientWidth / c.clientHeight : 1.5;
}

function combinePreviewUpdateHud() {
  const s = combinePreview.scene;
  if (!s) return;
  const sun = combinePreviewSun();
  const noPlace = !sun;
  const shadows = combinePreviewEl("pv-shadows"), hour = combinePreviewEl("pv-hour"), label = combinePreviewEl("pv-hour-label"), structure = combinePreviewEl("pv-structure"), note = combinePreviewEl("pv-note");
  if (shadows) { shadows.checked = combinePreview.shadows && !noPlace; shadows.disabled = noPlace; }
  if (hour) { hour.value = String(combinePreview.hour == null ? 12 : combinePreview.hour); hour.disabled = noPlace; }
  if (label) label.textContent = combinePreviewHourText(combinePreview.hour == null ? 12 : combinePreview.hour);
  if (structure) { structure.checked = combinePreview.structure && !!combineState.structure; structure.disabled = !combineState.structure; }
  const parts = [];
  if (noPlace) parts.push("Set the location in the Site tab to see the sun's shadows.");
  else if (!s.sunUp) parts.push("The sun is below the horizon at this time.");
  if (!combineState.structure) parts.push("No structure from Revit yet: push it from Revit to see the grid and the columns.");
  parts.push(...s.notes);
  if (note) { note.textContent = parts.join(" "); note.hidden = !combinePreview.notesOpen || !parts.length; }
  const info = combinePreviewEl("pv-info");
  if (info) { info.hidden = !parts.length; info.textContent = "Notes (" + parts.length + ")"; info.setAttribute("aria-expanded", String(combinePreview.notesOpen && parts.length > 0)); }
  const stats = combinePreviewEl("pv-stats");
  if (stats) stats.textContent = s.stats.pieces + (s.stats.pieces === 1 ? " piece" : " pieces") + (s.stats.columns ? " · " + s.stats.columns + " columns" : "") + (s.stats.shadows ? " · " + s.stats.shadows + " shadows" : "");
  combinePreviewCompass();
}

/** The needle points to true north as the camera sees it (the top of the plan is north when the orientation is not set). */
function combinePreviewCompass() {
  const needle = combinePreviewEl("pv-compass-needle");
  if (!needle || !combinePreview.cam) return;
  const north = typeof siteState !== "undefined" ? siteState.northDeg || 0 : 0;
  const bearing = -north * Math.PI / 180;
  const nx = Math.sin(bearing), nz = -Math.cos(bearing);
  const yaw = combinePreview.cam.yawDeg * Math.PI / 180;
  const right = [Math.cos(yaw), -Math.sin(yaw)], ahead = [-Math.sin(yaw), -Math.cos(yaw)];
  const sx = nx * right[0] + nz * right[1], sy = nx * ahead[0] + nz * ahead[1];
  needle.style.transform = "rotate(" + (Math.atan2(sx, sy) * 180 / Math.PI).toFixed(1) + "deg)";
}

function combinePreviewRedraw() {
  if (combinePreview.pending || combinePreview.view !== "3d") return;
  combinePreview.pending = true;
  const run = () => { combinePreview.pending = false; combinePreviewDraw(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else run();
}

// ---------------------------------------------------------------------------------------------------------------- WebGL
function combinePreviewStartGL() {
  if (combinePreview.gl && !combinePreview.gl.isContextLost()) return true;
  const canvas = combinePreviewEl("combine-3d-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return false;
  let gl = null;
  try { gl = canvas.getContext("webgl", { antialias: true, stencil: true, alpha: true }) || canvas.getContext("experimental-webgl", { antialias: true, stencil: true, alpha: true }); }
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
    const mesh = link(COMBINE_PREVIEW_VS, COMBINE_PREVIEW_FS), line = link(COMBINE_PREVIEW_LINE_VS, COMBINE_PREVIEW_LINE_FS);
    combinePreview.progs = {
      mesh, line,
      m: { pos: gl.getAttribLocation(mesh, "aPos"), nor: gl.getAttribLocation(mesh, "aNor"), col: gl.getAttribLocation(mesh, "aCol"), vp: gl.getUniformLocation(mesh, "uVP"), light: gl.getUniformLocation(mesh, "uLight"), flat: gl.getUniformLocation(mesh, "uFlat") },
      l: { pos: gl.getAttribLocation(line, "aPos"), col: gl.getAttribLocation(line, "aCol"), vp: gl.getUniformLocation(line, "uVP") },
    };
  } catch (e) {
    if (typeof console !== "undefined") console.warn("3D view: the shaders could not be built (" + e.message + ")");
    return false;
  }
  combinePreview.gl = gl;
  combinePreview.buf = {};
  const canvasEl = canvas;
  canvasEl.addEventListener("webglcontextlost", ev => { ev.preventDefault(); combinePreview.gl = null; });
  canvasEl.addEventListener("webglcontextrestored", () => { if (combinePreview.view === "3d" && combinePreviewStartGL()) { combinePreviewUpload(); combinePreviewRedraw(); } });
  return true;
}

function combinePreviewBuffer(name, batch) {
  const gl = combinePreview.gl;
  if (!gl) return;
  const b = combinePreview.buf[name] || (combinePreview.buf[name] = { buffer: gl.createBuffer(), count: 0 });
  b.count = batch && batch.count ? batch.count : 0;
  if (b.count) { gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.data), gl.DYNAMIC_DRAW); }
}

function combinePreviewUpload() {
  const s = combinePreview.scene;
  if (!combinePreview.gl || !s) return;
  combinePreviewBuffer("opaque", s.opaque); combinePreviewBuffer("glass", s.glass); combinePreviewBuffer("shadows", s.shadows); combinePreviewBuffer("stencil", s.stencil); combinePreviewBuffer("lines", s.lines);
}

function combinePreviewDrawMesh(name, vp, light, flat) {
  const gl = combinePreview.gl, b = combinePreview.buf[name], P = combinePreview.progs;
  if (!b || !b.count) return;
  gl.useProgram(P.mesh);
  gl.uniformMatrix4fv(P.m.vp, false, vp);
  gl.uniform3f(P.m.light, light[0], light[1], light[2]);
  gl.uniform1f(P.m.flat, flat ? 1 : 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
  gl.enableVertexAttribArray(P.m.pos); gl.vertexAttribPointer(P.m.pos, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(P.m.nor); gl.vertexAttribPointer(P.m.nor, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(P.m.col); gl.vertexAttribPointer(P.m.col, 4, gl.FLOAT, false, 40, 24);
  gl.drawArrays(gl.TRIANGLES, 0, b.count);
}

function combinePreviewDrawLines(name, vp) {
  const gl = combinePreview.gl, b = combinePreview.buf[name], P = combinePreview.progs;
  if (!b || !b.count) return;
  gl.useProgram(P.line);
  gl.uniformMatrix4fv(P.l.vp, false, vp);
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
  gl.enableVertexAttribArray(P.l.pos); gl.vertexAttribPointer(P.l.pos, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(P.l.col); gl.vertexAttribPointer(P.l.col, 4, gl.FLOAT, false, 28, 12);
  gl.drawArrays(gl.LINES, 0, b.count);
}

function combinePreviewDraw() {
  const gl = combinePreview.gl, s = combinePreview.scene, canvas = combinePreviewEl("combine-3d-canvas");
  if (!gl || gl.isContextLost() || !s || !canvas || combinePreview.view !== "3d") return;
  const dpr = Math.min(typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const cam = combinePreview.cam;
  const near = Math.max(0.1, cam.distance * 0.02), far = cam.distance * 6 + 400;
  const eye = previewCameraEye(cam);
  const vp = previewMat4Mul(previewPerspective(cam.fovDeg, w / h, near, far), previewLookAt(eye, cam.target, [0, 1, 0]));

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
  gl.depthMask(true); gl.colorMask(true, true, true, true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);

  // 1. the deck's top marks the stencil: the shadows are drawn only where it is (they must not fall on the air beside the roof)
  if (combinePreview.buf.stencil && combinePreview.buf.stencil.count) {
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    combinePreviewDrawMesh("stencil", vp, s.light, true);
    gl.colorMask(true, true, true, true); gl.depthMask(true);
  }
  gl.disable(gl.STENCIL_TEST);

  // 2. the solid things and the lines
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
  combinePreviewDrawMesh("opaque", vp, s.light, false);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  combinePreviewDrawLines("lines", vp);

  // 3. the shadows: once each pixel (the stencil counts up as a shadow is drawn), on the deck only
  if (combinePreview.buf.shadows && combinePreview.buf.shadows.count) {
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1);
    combinePreviewDrawMesh("shadows", vp, s.light, true);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.STENCIL_TEST); gl.depthMask(true);
  }

  // 4. glass (a see-through deck, the padel cages)
  gl.depthMask(false);
  combinePreviewDrawMesh("glass", vp, s.light, false);
  gl.depthMask(true);

  // 5. what is selected, and what the pointer is on: seen through everything
  const sel = typeof combineState !== "undefined" && combineState.selectedKind === "item" ? combineState.selectedId : null;
  const marks = [[sel, [1, 0.85, 0.2, 1]], [combinePreview.hoverId && combinePreview.hoverId !== sel ? combinePreview.hoverId : null, [1, 1, 1, 0.95]]];
  gl.disable(gl.DEPTH_TEST);
  marks.forEach(([id, color], i) => {
    const hl = id ? previewHighlight(s, id, color) : null;
    if (!hl) return;
    combinePreviewBuffer("hlFill" + i, hl.fill); combinePreviewBuffer("hlLines" + i, hl.lines);
    combinePreviewDrawMesh("hlFill" + i, vp, s.light, true);
    combinePreviewDrawLines("hlLines" + i, vp);
  });
  gl.enable(gl.DEPTH_TEST);
  combinePreviewCompass();
}

// ---------------------------------------------------------------------------------------------------------------- the controls
function combinePreviewSetCamera(kind) {
  const s = combinePreview.scene;
  if (!s) return;
  const cam = previewFitCamera(s.bounds, combinePreviewAspect(), kind === "top" ? "top" : "angle");
  if (kind === "below") cam.pitchDeg = -24;
  combinePreview.cam = cam;
  combinePreviewRedraw();
}

function combinePreviewNdc(e) {
  const c = combinePreviewEl("combine-3d-canvas"), r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) / Math.max(1, r.width) * 2 - 1, y: 1 - (e.clientY - r.top) / Math.max(1, r.height) * 2 };
}

function combinePreviewPickAt(e) {
  if (!combinePreview.scene || !combinePreview.cam) return null;
  const n = combinePreviewNdc(e);
  return previewPick(combinePreview.scene, previewPickRay(combinePreview.cam, combinePreviewAspect(), n.x, n.y));
}

function combinePreviewShowTip(hit, e) {
  const tip = combinePreviewEl("combine-3d-tip"), c = combinePreviewEl("combine-3d-canvas");
  if (!tip || !c) return;
  if (!hit) { tip.hidden = true; return; }
  tip.textContent = hit.label || "Piece";
  const r = c.getBoundingClientRect();
  tip.style.left = Math.round(e.clientX - r.left + 12) + "px";
  tip.style.top = Math.round(e.clientY - r.top + 14) + "px";
  tip.hidden = false;
}

function combinePreviewSelect(id) {
  if (typeof combineState === "undefined" || !combineState.items.some(i => i.id === id)) return;
  combineState.selectedKind = "item";
  combineState.selectedId = id;
  if (typeof setWizardStep === "function") setWizardStep(2);
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
}

function combinePreviewPointerDown(e) {
  const c = combinePreviewEl("combine-3d-canvas");
  if (typeof c.setPointerCapture === "function") { try { c.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ } }
  combinePreview.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (combinePreview.pointers.size === 1) combinePreview.drag = { mode: e.button === 2 || e.shiftKey ? "pan" : "orbit", sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, button: e.button };
  else if (combinePreview.drag) combinePreview.drag.moved = true;
  if (typeof c.focus === "function") c.focus({ preventScroll: true });
}

function combinePreviewPointerMove(e) {
  const P = combinePreview, cam = P.cam;
  if (!cam) return;
  const known = P.pointers.get(e.pointerId);
  if (!known) {                          // no button down: the pointer is only over the roof
    const hit = combinePreviewPickAt(e);
    const id = hit ? hit.id : null;
    if (id !== P.hoverId) { P.hoverId = id; combinePreviewRedraw(); }
    combinePreviewShowTip(hit, e);
    return;
  }
  const dx = e.clientX - known.x, dy = e.clientY - known.y;
  if (P.pointers.size >= 2) {          // two fingers: pinch to zoom, drag to move
    const ids = [...P.pointers.keys()], other = P.pointers.get(ids.find(i => i !== e.pointerId));
    const before = Math.hypot(known.x - other.x, known.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    known.x = e.clientX; known.y = e.clientY;
    if (before > 8 && after > 8) P.cam = previewZoom(P.cam, before / after);
    P.cam = previewPan(P.cam, dx / 2, dy / 2, combinePreviewEl("combine-3d-canvas").clientHeight, combinePreviewLimit());
  } else if (P.drag) {
    known.x = e.clientX; known.y = e.clientY;
    if (!P.drag.moved && Math.hypot(e.clientX - P.drag.sx, e.clientY - P.drag.sy) > 4) P.drag.moved = true;
    if (P.drag.moved) {
      P.cam = P.drag.mode === "pan" ? previewPan(cam, dx, dy, combinePreviewEl("combine-3d-canvas").clientHeight, combinePreviewLimit()) : previewOrbit(cam, dx, dy);
      combinePreviewShowTip(null, e);
    }
  }
  combinePreviewRedraw();
}

function combinePreviewLimit() {
  const b = combinePreview.scene ? combinePreview.scene.bounds : { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  const padX = (b.maxX - b.minX) * 0.5 + 5, padZ = (b.maxZ - b.minZ) * 0.5 + 5;
  return { minX: b.minX - padX, maxX: b.maxX + padX, minZ: b.minZ - padZ, maxZ: b.maxZ + padZ };
}

function combinePreviewPointerUp(e) {
  const P = combinePreview;
  const d = P.drag;
  const had = P.pointers.delete(e.pointerId);
  if (d && had && !d.moved && d.button === 0 && P.pointers.size === 0 && e.type !== "pointercancel") {
    const hit = combinePreviewPickAt(e);
    if (hit) combinePreviewSelect(hit.id);
  }
  if (P.pointers.size === 0) P.drag = null;
}

function combinePreviewWheel(e) {
  if (!combinePreview.cam) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 33 : 1;
  combinePreview.cam = previewZoom(combinePreview.cam, Math.exp(e.deltaY * unit * 0.0012));
  combinePreviewRedraw();
}

function combinePreviewKey(e) {
  if (!combinePreview.cam) return;
  const step = 6;
  const k = e.key;
  if (k === "ArrowLeft") combinePreview.cam = previewOrbit(combinePreview.cam, -step / 0.4, 0);
  else if (k === "ArrowRight") combinePreview.cam = previewOrbit(combinePreview.cam, step / 0.4, 0);
  else if (k === "ArrowUp") combinePreview.cam = previewOrbit(combinePreview.cam, 0, -step / 0.4);
  else if (k === "ArrowDown") combinePreview.cam = previewOrbit(combinePreview.cam, 0, step / 0.4);
  else if (k === "+" || k === "=") combinePreview.cam = previewZoom(combinePreview.cam, 0.85);
  else if (k === "-" || k === "_") combinePreview.cam = previewZoom(combinePreview.cam, 1 / 0.85);
  else if (k === "Home") combinePreviewSetCamera("angle");
  else return;
  e.preventDefault();
  combinePreviewRedraw();
}

function combinePreviewInit() {
  const canvas = combinePreviewEl("combine-3d-canvas");
  if (!canvas) return;
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-combine-view]");
    if (b) combinePreviewSetView(b.dataset.combineView);
    const cam = e.target.closest && e.target.closest("[data-pv-camera]");
    if (cam) combinePreviewSetCamera(cam.dataset.pvCamera);
  });
  canvas.addEventListener("pointerdown", combinePreviewPointerDown);
  canvas.addEventListener("pointermove", combinePreviewPointerMove);
  canvas.addEventListener("pointerup", combinePreviewPointerUp);
  canvas.addEventListener("pointercancel", combinePreviewPointerUp);
  canvas.addEventListener("pointerleave", () => { if (combinePreview.hoverId) { combinePreview.hoverId = null; combinePreviewRedraw(); } combinePreviewShowTip(null); });
  canvas.addEventListener("wheel", combinePreviewWheel, { passive: false });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("keydown", combinePreviewKey);
  const on = (id, type, fn) => { const el = combinePreviewEl(id); if (el) el.addEventListener(type, fn); };
  on("pv-shadows", "change", e => { combinePreview.shadows = e.target.checked; combinePreviewRebuild(); });
  on("pv-structure", "change", e => { combinePreview.structure = e.target.checked; combinePreviewRebuild(); });
  on("pv-info", "click", () => { combinePreview.notesOpen = !combinePreview.notesOpen; combinePreviewUpdateHud(); });
  on("pv-hour", "input", e => { combinePreview.hour = Number(e.target.value); combinePreview.hourTouched = true; combinePreviewRebuild(); });
  if (typeof ResizeObserver === "function") new ResizeObserver(() => combinePreviewRedraw()).observe(canvas);
  else if (typeof window !== "undefined") window.addEventListener("resize", combinePreviewRedraw);
  combinePreviewShowSwitch();
}

combinePreviewInit();
