/**
 * planters.js — the Garden tab: parametric planters (garden blocks), mirroring the Revit family "Planter" parameter for parameter.
 *
 * Two variants, set by the user (2026-09-26): PLANTER S 2400 x 1000 mm, 450 mm high (Rim Height), and PLANTER T 2400 x 2400 mm, 900 mm high. Every other
 * value is the family's default. The values a person sets are editable; the ones the family works out by formula are worked out here with the SAME formulas
 * (and shown with them), so a planter drawn here and one built in Revit say the same thing. All sizes in millimetres, as in Revit.
 * The three Yes/No parameters (Centre Row, Seat Cap, Tree) are offered as toggles; what they mean is to be given by the user later.
 */

/** The family's parameters: [key, label, group]. Order and names as in Revit's Family Types dialog. */
const PLANTER_INPUTS = [
  ["defaultElevation", "Default Elevation", "Constraints"],
  ["length", "Length", "Dimensions"],
  ["width", "Width", "Dimensions"],
  ["rimHeight", "Rim Height", "Dimensions"],
  ["pedestalHeight", "Pedestal Height", "Dimensions"],
  ["protectionMat", "Protection Mat", "Dimensions"],
  ["drainageDepth", "Drainage Depth", "Dimensions"],
  ["filterFleece", "Filter Fleece", "Dimensions"],
  ["substrateDepth", "Substrate Depth", "Dimensions"],
  ["outletHeight", "Outlet Height", "Dimensions"],
  ["outletBottomOffset", "Outlet Bottom Offset", "Dimensions"],
  ["outletTopOffset", "Outlet Top Offset", "Dimensions"]
];

/** The formula parameters, worked out in this order (each may use the ones before it). [key, label, formula as Revit shows it, function]. */
const PLANTER_FORMULAS = [
  ["rimLevel", "Rim Level", "Pedestal Height + Rim Height", p => p.pedestalHeight + p.rimHeight],
  ["trayFloorTop", "Tray Floor Top", "Pedestal Height + 20 mm", p => p.pedestalHeight + 20],
  ["matTop", "Mat Top", "Tray Floor Top + Protection Mat", p => p.trayFloorTop + p.protectionMat],
  ["drainageTop", "Drainage Top", "Mat Top + Drainage Depth", p => p.matTop + p.drainageDepth],
  ["fleeceTop", "Fleece Top", "Drainage Top + Filter Fleece", p => p.drainageTop + p.filterFleece],
  ["substrateTop", "Substrate Top", "Fleece Top + Substrate Depth", p => p.fleeceTop + p.substrateDepth],
  ["freeboard", "Freeboard", "Rim Level - Substrate Top", p => p.rimLevel - p.substrateTop],
  ["capTop", "Cap Top", "Rim Level + 70 mm", p => p.rimLevel + 70],
  ["outletTop", "Outlet Top", "Mat Top + Outlet Height", p => p.matTop + p.outletHeight]
];

const PLANTER_TOGGLES = [["centreRow", "Centre Row"], ["seatCap", "Seat Cap"], ["tree", "Tree"]];

/** The family's defaults (the Revit dialog, 2026-09-26). */
const PLANTER_FAMILY_DEFAULTS = {
  defaultElevation: 0, length: 2400, width: 1000, rimHeight: 450, pedestalHeight: 100, protectionMat: 5, drainageDepth: 40, filterFleece: 5,
  substrateDepth: 300, outletHeight: 30, outletBottomOffset: 25, outletTopOffset: 55, centreRow: true, seatCap: true, tree: true
};

/** The two planters: length x width x height (Rim Height), the rest from the family. */
const PLANTER_VARIANTS = {
  planter_s: { label: "Planter S", short: "Planter S", size: { length: 2400, width: 1000, rimHeight: 450 } },
  planter_t: { label: "Planter T", short: "Planter T", size: { length: 2400, width: 2400, rimHeight: 900 } }
};

const PLANTER_STORAGE_KEY = "sportify-planters";

const planterState = (() => {
  const fresh = () => Object.fromEntries(Object.entries(PLANTER_VARIANTS).map(([id, v]) => [id, Object.assign({}, PLANTER_FAMILY_DEFAULTS, v.size)]));
  const st = { active: "planter_s", values: fresh() };
  try {
    const saved = JSON.parse(localStorage.getItem(PLANTER_STORAGE_KEY) || "null");
    if (saved && saved.values) Object.keys(st.values).forEach(id => { if (saved.values[id]) Object.assign(st.values[id], saved.values[id]); });
    if (saved && PLANTER_VARIANTS[saved.active]) st.active = saved.active;
  } catch (e) { /* the defaults */ }
  return st;
})();

function planterSave() {
  try { localStorage.setItem(PLANTER_STORAGE_KEY, JSON.stringify({ active: planterState.active, values: planterState.values })); } catch (e) { /* not kept */ }
}

/** Every parameter of a planter, the formula ones worked out. */
function planterParams(id) {
  const p = Object.assign({}, planterState.values[id || planterState.active]);
  PLANTER_FORMULAS.forEach(([key, , , fn]) => { p[key] = fn(p); });
  return p;
}

// ------------------------------------------------------------------------------------------------ the item bar and the panel

function buildPlanterBar() {
  const bar = document.getElementById("activity-bar");
  bar.innerHTML = `<div class="rail-cat-header">GARDEN</div>` + Object.entries(PLANTER_VARIANTS).map(([id, v]) =>
    `<button class="activity-icon${id === planterState.active ? " active" : ""}" data-planter="${id}" title="${escapeHtml(v.label)}"><i class="ti ti-plant-2"></i><span class="activity-icon-label">${escapeHtml(v.short)}</span></button>`).join("");
  bar.querySelectorAll("[data-planter]").forEach(btn => btn.addEventListener("click", () => {
    planterState.active = btn.dataset.planter; planterSave();
    buildPlanterBar(); updatePlanterUI();
  }));
}

function updatePlanterUI() {
  const id = planterState.active, v = PLANTER_VARIANTS[id], p = planterParams(id);
  document.getElementById("field-label").textContent = `${v.label} — ${p.length} × ${p.width} × ${p.rimHeight} mm`;
  document.getElementById("norm-badge").textContent = "Revit family: Planter";
  const host = document.getElementById("planter-panel");
  if (host) host.innerHTML = planterPanelHtml(id, p);
  drawPlanter(p);
}

function planterPanelHtml(id, p) {
  const v = PLANTER_VARIANTS[id];
  const input = ([key, label]) => `<tr><td>${escapeHtml(label)}</td><td><input type="number" step="1" min="0" data-planter-param="${key}" value="${escapeHtml(p[key])}"> <small>mm</small></td><td></td></tr>`;
  const formula = ([key, label, text]) => `<tr class="planter-formula"><td>${escapeHtml(label)}</td><td>${escapeHtml(p[key])} <small>mm</small></td><td><small>= ${escapeHtml(text)}</small></td></tr>`;
  const group = g => PLANTER_INPUTS.filter(i => i[2] === g).map(input).join("");
  const warn = p.freeboard < 0 ? `<p class="planter-warn">The substrate rises ${-p.freeboard} mm above the rim: lower the Substrate Depth or raise the Rim Height.</p>` : "";
  return `
    <div class="section">
      <label>Planter</label>
      <div class="planter-switch">${Object.entries(PLANTER_VARIANTS).map(([vid, pv]) => `<button type="button" data-planter-pick="${vid}" class="${vid === id ? "on" : ""}">${escapeHtml(pv.label)}</button>`).join("")}</div>
    </div>
    <div class="section">
      <label>Size (L × W × H)</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${escapeHtml(p.length)}</div><div class="lbl">Length (mm)</div></div>
        <div class="dim-card"><div class="val">${escapeHtml(p.width)}</div><div class="lbl">Width (mm)</div></div>
        <div class="dim-card"><div class="val">${escapeHtml(p.rimHeight)}</div><div class="lbl">Height — Rim Height (mm)</div></div>
        <div class="dim-card"><div class="val">${escapeHtml(p.capTop)}</div><div class="lbl">Top of cap above the deck (mm)</div></div>
      </div>
    </div>
    <div class="section">
      <label>Options</label>
      ${PLANTER_TOGGLES.map(([key, label]) => `<label class="planter-toggle"><span>${escapeHtml(label)}</span>
        <span class="planter-yn"><button type="button" data-planter-toggle="${key}" data-val="1" class="${p[key] ? "on" : ""}">Yes</button><button type="button" data-planter-toggle="${key}" data-val="0" class="${p[key] ? "" : "on"}">No</button></span></label>`).join("")}
    </div>
    <div class="section">
      <label>Parameters (as in the Revit family)</label>
      ${warn}
      <table class="planter-table">
        <thead><tr><th>Parameter</th><th>Value</th><th>Formula</th></tr></thead>
        <tbody>
          <tr class="planter-group"><td colspan="3">Constraints</td></tr>${group("Constraints")}
          <tr class="planter-group"><td colspan="3">Dimensions</td></tr>${group("Dimensions")}
          <tr class="planter-group"><td colspan="3">Worked out by the family</td></tr>${PLANTER_FORMULAS.map(formula).join("")}
        </tbody>
      </table>
      <button type="button" class="btn-link" data-planter-reset>Reset ${escapeHtml(v.label)} to its defaults</button>
    </div>`;
}

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.planterParam == null) return;
  const n = Math.round(Number(t.value));
  if (Number.isFinite(n) && n >= 0) planterState.values[planterState.active][t.dataset.planterParam] = n;
  planterSave(); updatePlanterUI();
});
document.addEventListener("click", e => {
  const pick = e.target.closest && e.target.closest("[data-planter-pick]");
  if (pick) { planterState.active = pick.dataset.planterPick; planterSave(); buildPlanterBar(); updatePlanterUI(); return; }
  const tg = e.target.closest && e.target.closest("[data-planter-toggle]");
  if (tg) { planterState.values[planterState.active][tg.dataset.planterToggle] = tg.dataset.val === "1"; planterSave(); updatePlanterUI(); return; }
  if (e.target.closest && e.target.closest("[data-planter-reset]")) {
    const id = planterState.active;
    planterState.values[id] = Object.assign({}, PLANTER_FAMILY_DEFAULTS, PLANTER_VARIANTS[id].size);
    planterSave(); updatePlanterUI();
  }
});

// ------------------------------------------------------------------------------------------------ the drawing: plan and section

/** The planter in plan (left) and in section across its width (right), to scale within each view, with architect's dimensions (archDimSvg, field.js). */
function drawPlanter(p) {
  const svg = document.getElementById("planter-field");
  if (!svg) return;
  const dark = typeof isDarkMode === "function" && isDarkMode();
  const ink = dark ? "#c9cbe0" : "#3a3f4b", dim = dark ? "#aaa" : "#666", font = `font-family="'Titillium Web', Arial, sans-serif"`;
  const VWp = 600, VHp = 400;
  const dimSvg = (side, a, b, at, off, label, fs) => typeof archDimSvg === "function" ? archDimSvg(side, a, b, at, off, label, dim, fs || 10.5) : "";

  // plan: the outer box, the wall (60 mm shown as the rim), the substrate, the optional tree and centre row
  const planBox = { x: 40, y: 70, w: 250, h: 250 };
  const ps = Math.min(planBox.w / p.length, planBox.h / p.width);
  const pw = p.length * ps, ph = p.width * ps, px = planBox.x + (planBox.w - pw) / 2, py = planBox.y + (planBox.h - ph) / 2;
  const wall = Math.max(3, 60 * ps);
  let plan = `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="2" fill="${dark ? "#5b4a3a" : "#b99d7e"}" stroke="${ink}" stroke-width="1.2"/>
    <rect x="${px + wall}" y="${py + wall}" width="${pw - 2 * wall}" height="${ph - 2 * wall}" fill="${dark ? "#3f5a2f" : "#8cbf6a"}"/>`;
  if (p.centreRow) plan += `<line x1="${px + wall}" y1="${py + ph / 2}" x2="${px + pw - wall}" y2="${py + ph / 2}" stroke="${dark ? "#8fcf6f" : "#4f8a35"}" stroke-width="2" stroke-dasharray="5 4"/>`;
  // the seat cap: a board over the rim all round, overhanging it a little (as in the section)
  if (p.seatCap) {
    const ov = wall * 0.6, ox0 = px - ov, oy0 = py - ov, ow = pw + 2 * ov, oh = ph + 2 * ov, ix = px + wall, iy = py + wall, iw = pw - 2 * wall, ih = ph - 2 * wall;
    plan += `<path fill-rule="evenodd" d="M${ox0},${oy0}h${ow}v${oh}h${-ow}Z M${ix},${iy}v${ih}h${iw}v${-ih}Z" fill="${dark ? "#9c8a6a" : "#d8c3a0"}" stroke="${ink}" stroke-width="0.8"/>`;
  }
  if (p.tree) { const r = Math.min(pw, ph) * 0.18; plan += `<circle cx="${px + pw / 2}" cy="${py + ph / 2}" r="${r}" fill="${dark ? "#2f6b2a" : "#5d9e3f"}" fill-opacity="0.85" stroke="${dark ? "#8fcf6f" : "#2f5d22"}" stroke-width="1"/>`; }
  plan += dimSvg("top", px, px + pw, py, 12, `${p.length}`) + dimSvg("left", py, py + ph, px, 12, `${p.width}`);

  // section across the width: pedestal, tray floor, protection mat, drainage, filter fleece, substrate, freeboard, rim wall, cap
  // its ground line level with the plan's bottom edge (the two views on one line), scaled to fit above it with the tree
  const secBox = { x: 335, w: 170 };
  const ground = py + ph, treeRoom = p.tree ? 80 : 0;
  const ss = Math.min(secBox.w / (p.width + 300), Math.max(20, ground - 60 - treeRoom) / p.capTop);
  const t = Math.max(3, 60 * ss);
  const sw = p.width * ss, sx = secBox.x + (secBox.w - sw) / 2;
  const Y = mm => ground - mm * ss;
  const band = (y0, y1, fill, label) => {
    const top = Y(y1), h = Math.max(0.6, (y1 - y0) * ss);
    return `<rect x="${sx}" y="${top}" width="${sw}" height="${h}" fill="${fill}"/>` + (label ? `<text x="${sx + sw + t + 8}" y="${top + h / 2 + 3}" font-size="9" fill="${dim}" ${font}>${label}</text>` : "");
  };
  let sec = `<line x1="${secBox.x - 20}" y1="${ground}" x2="${secBox.x + secBox.w + 20}" y2="${ground}" stroke="${ink}" stroke-width="1.2"/>
    <rect x="${sx + sw * 0.15}" y="${Y(p.pedestalHeight)}" width="${sw * 0.1}" height="${p.pedestalHeight * ss}" fill="${dark ? "#666" : "#9a9a9a"}"/>
    <rect x="${sx + sw * 0.75}" y="${Y(p.pedestalHeight)}" width="${sw * 0.1}" height="${p.pedestalHeight * ss}" fill="${dark ? "#666" : "#9a9a9a"}"/>
    ${band(p.pedestalHeight, p.trayFloorTop, dark ? "#777" : "#8d8d8d", "")}
    ${band(p.trayFloorTop, p.matTop, "#333", "")}
    ${band(p.matTop, p.drainageTop, dark ? "#4a6d8c" : "#9cc3e6", "drainage")}
    ${band(p.drainageTop, p.fleeceTop, "#f2f2f2", "")}
    ${band(p.fleeceTop, p.substrateTop, dark ? "#5b4a3a" : "#8a6a4a", "substrate")}
    <rect x="${sx - t}" y="${Y(p.rimLevel)}" width="${t}" height="${(p.rimLevel - p.trayFloorTop) * ss}" fill="${dark ? "#8a7560" : "#b99d7e"}" stroke="${ink}" stroke-width="0.8"/>
    <rect x="${sx + sw}" y="${Y(p.rimLevel)}" width="${t}" height="${(p.rimLevel - p.trayFloorTop) * ss}" fill="${dark ? "#8a7560" : "#b99d7e"}" stroke="${ink}" stroke-width="0.8"/>`;
  if (p.seatCap) sec += `<rect x="${sx - t * 1.6}" y="${Y(p.capTop)}" width="${sw + t * 3.2}" height="${Math.max(2, 70 * ss)}" rx="1.5" fill="${dark ? "#9c8a6a" : "#d8c3a0"}" stroke="${ink}" stroke-width="0.8"/>`;
  if (p.tree) sec += `<line x1="${sx + sw / 2}" y1="${Y(p.substrateTop)}" x2="${sx + sw / 2}" y2="${Y(p.substrateTop) - 40}" stroke="${dark ? "#8a7560" : "#6d4c2f"}" stroke-width="3"/><circle cx="${sx + sw / 2}" cy="${Y(p.substrateTop) - 55}" r="22" fill="${dark ? "#2f6b2a" : "#5d9e3f"}" fill-opacity="0.85"/>`;
  sec += dimSvg("left", Y(p.rimLevel), Y(p.pedestalHeight), sx - t * 1.6, 14, `${p.rimHeight}`)
    + dimSvg("bottom", sx, sx + sw, ground, 14, `${p.width}`)
    + (p.freeboard > 0 ? `<text x="${sx + sw + t + 8}" y="${Y(p.rimLevel) + (p.freeboard * ss) / 2 + 3}" font-size="9" fill="${dim}" ${font}>freeboard ${p.freeboard}</text>` : "");

  // the two titles on one line above both views (clear of the plan's dimension line and the section's tree)
  const secTop = Math.min(Y(p.capTop), p.tree ? Y(p.substrateTop) - 77 : Infinity);
  const titleY = Math.min(py - 34, secTop - 14);
  const titles = `<text x="${planBox.x + planBox.w / 2}" y="${titleY}" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Plan</text>`
    + `<text x="${secBox.x + secBox.w / 2}" y="${titleY}" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Section</text>`;
  svg.setAttribute("viewBox", `0 0 ${VWp} ${VHp}`);
  svg.innerHTML = titles + plan + sec + `<text x="${VWp / 2}" y="${VHp - 8}" text-anchor="middle" font-size="10" fill="${dim}" ${font}>All sizes in mm · plan and section each to their own scale</text>`;
}
