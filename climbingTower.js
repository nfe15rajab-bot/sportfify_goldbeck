/**
 * climbingTower.js — the design team's Climbing Tower family, configured here
 *
 * The second family authored in Revit rather than modelled by us (the planters
 * were the first), and it follows the same rule: we do not build the geometry,
 * we set the parameters the family exposes and let Revit's own family do the
 * rest. Export, import, and the tower stands in the model as it was configured
 * in the browser.
 *
 * ── Read from Revit, not retyped ──
 * The parameter names, their current values and which of them Revit will accept
 * came out of the add-in's own "Load Families" command, so they are the
 * family's, not a transcription. Lengths are METRES here, as Revit reports them
 * (the planter family states itself in millimetres; each family is mirrored in
 * the unit it was authored in).
 *
 * ── The shape it describes ──
 * A triangular tower that flares as it rises: 3.0 m radius at the base, 4.0 m
 * at the top, 12 m tall, under a canopy. The triangle is why the derived values
 * below are what they are.
 */

/**
 * Side length and apothem are NOT formulas in this family — Revit reports them
 * as writable, which means the family does not work them out for itself. So we
 * do, and send them: change a radius without them and the tower's sides no
 * longer match the circle they are inscribed in.
 *
 * For an equilateral triangle in a circle of radius R: side = R x sqrt(3),
 * apothem = R / 2. Both hold exactly against the values the family shipped with
 * (3.0 -> 5.19615, 1.5; 4.0 -> 6.9282, 2.0).
 */
const TOWER_SIDE_PER_RADIUS = Math.sqrt(3);
const TOWER_APOTHEM_PER_RADIUS = 0.5;

/** What a person sets. [key, label, hint] — the key is the family's own parameter name. */
const TOWER_INPUTS = [
  ["Tower_Height",     "Tower height",        "Top of the structure above the deck"],
  ["Tower_Base_Radio", "Tower radius — base", "Half the tower across, at the bottom"],
  ["Tower_Top_Radio",  "Tower radius — top",  "Wider than the base: the tower flares"],
  ["Base_Radius",      "Base platform radius", "The platform the tower stands on"],
  ["Canopy_Radio",     "Canopy radius",       ""],
  ["Canopy_Overhang",  "Canopy overhang",     ""],
  ["Canopy_Thickness", "Canopy thickness",    ""],
  ["Apothema_Canopy",  "Canopy apothem",      "Centre to the middle of a canopy edge"],
  ["Default Elevation", "Elevation",          "Above the deck; 0 sits on it"],
];

/** Worked out from the inputs, shown so the numbers sent to Revit are visible. [key, label, how, fn] */
const TOWER_DERIVED = [
  ["Side_Base",     "Side length — base", "Tower radius (base) x sqrt(3)", p => p.Tower_Base_Radio * TOWER_SIDE_PER_RADIUS],
  ["Side_Top",      "Side length — top",  "Tower radius (top) x sqrt(3)",  p => p.Tower_Top_Radio * TOWER_SIDE_PER_RADIUS],
  ["Apothema_Base", "Apothem — base",     "Tower radius (base) / 2",       p => p.Tower_Base_Radio * TOWER_APOTHEM_PER_RADIUS],
  ["Apothema_Top",  "Apothem — top",      "Tower radius (top) / 2",        p => p.Tower_Top_Radio * TOWER_APOTHEM_PER_RADIUS],
];

/** The values the family shipped with, read from Revit. Metres. */
const TOWER_FAMILY_DEFAULTS = {
  "Tower_Height": 12.0,
  "Tower_Base_Radio": 3.0,
  "Tower_Top_Radio": 4.0,
  "Base_Radius": 4.5,
  "Canopy_Radio": 2.1,
  "Canopy_Overhang": 1.0,
  "Canopy_Thickness": 0.1,
  "Apothema_Canopy": 2.0,
  "Default Elevation": 0,
};

/** The family as Revit knows it — what the add-in looks for when the import runs. */
const TOWER_FAMILY_NAME = "Climbing Tower";
const TOWER_TYPE_KEY = "climbing_tower";

const TOWER_STORAGE_KEY = "sportify-climbing-tower";

const towerState = (() => {
  const st = { values: Object.assign({}, TOWER_FAMILY_DEFAULTS) };
  try {
    const saved = JSON.parse(localStorage.getItem(TOWER_STORAGE_KEY) || "null");
    if (saved && saved.values) Object.keys(st.values).forEach(k => {
      if (typeof saved.values[k] === "number") st.values[k] = saved.values[k];
    });
  } catch (e) { /* the family's own defaults */ }
  return st;
})();

function towerSave() {
  try { localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ values: towerState.values })); } catch (e) { /* not kept */ }
}

/** Every parameter Revit will be sent: what was set, plus what follows from it. */
function towerParams() {
  const p = Object.assign({}, towerState.values);
  TOWER_DERIVED.forEach(([key, , , fn]) => { p[key] = Math.round(fn(p) * 100000) / 100000; });
  return p;
}

/**
 * The footprint the tower takes on the roof. The base platform is the widest
 * part, and a triangle in a circle of radius R is 2R across at its widest — so
 * the square it needs is 2R, not R.
 */
function towerFootprintM() {
  const p = towerState.values;
  const widest = Math.max(p.Base_Radius, p.Tower_Top_Radio, p.Canopy_Radio + p.Canopy_Overhang);
  const across = Math.round(widest * 2 * 100) / 100;
  return { length_m: across, width_m: across };
}

/* ── The panel ────────────────────────────────────────────────────────────── */

/** Shown only while the Climbing Tower is the selected activity. */
function syncClimbingTowerPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host) return false;
  if (activityId !== TOWER_TYPE_KEY) return false;

  const p = towerParams();
  const num = v => (Math.round(v * 1000) / 1000).toLocaleString("en-US");

  const input = ([key, label, hint]) => `
    <tr>
      <td>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</td>
      <td><input type="number" step="0.1" min="0" data-tower-param="${escapeHtml(key)}" value="${escapeHtml(p[key])}"> <small>m</small></td>
    </tr>`;

  const derived = ([key, label, how]) => `
    <tr class="planter-formula">
      <td>${escapeHtml(label)}</td>
      <td>${num(p[key])} <small>m</small><br><small>= ${escapeHtml(how)}</small></td>
    </tr>`;

  const fp = towerFootprintM();

  host.innerHTML = `
    <div class="section">
      <label>${escapeHtml(TOWER_FAMILY_NAME)}</label>
      <p class="hint">Revit family: ${escapeHtml(TOWER_FAMILY_NAME)} · the parameters it exposes</p>
      <div class="dims">
        <div class="dim-card"><div class="val">${num(p.Tower_Height)} m</div><div class="lbl">Height</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">Footprint on the roof</div></div>
      </div>
    </div>

    <div class="section">
      <label>Parameters</label>
      <table class="planter-table">
        <tbody>
          ${TOWER_INPUTS.map(input).join("")}
          <tr class="planter-group"><td colspan="2">Worked out from the above</td></tr>
          ${TOWER_DERIVED.map(derived).join("")}
        </tbody>
      </table>
      <p class="hint">The tower is a triangle in plan, so the side and the apothem follow from the radius. The family does not compute them itself, so they are sent with the rest.</p>
      <button type="button" class="btn-link" data-tower-reset>Reset to the family's defaults</button>
    </div>`;

  return true;
}

/** What a placed tower carries to Revit. Same shape as the planters'. */
function climbingTowerPayload() {
  return {
    type: TOWER_TYPE_KEY,
    label: TOWER_FAMILY_NAME,
    family: TOWER_FAMILY_NAME,
    /** Metres, as this family states itself. */
    units: "m",
    params: towerParams(),
  };
}

/* ── Listeners ────────────────────────────────────────────────────────────── */

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.towerParam == null) return;
  const n = Number(t.value);
  if (Number.isFinite(n) && n >= 0) towerState.values[t.dataset.towerParam] = n;
  towerSave();
  towerRefresh();
});

document.addEventListener("click", e => {
  if (!e.target.closest || !e.target.closest("[data-tower-reset]")) return;
  towerState.values = Object.assign({}, TOWER_FAMILY_DEFAULTS);
  towerSave();
  towerRefresh();
});

/** A parameter changed: the footprint, the panel and the drawing all follow it. */
function towerRefresh() {
  towerApplyFootprint();
  syncClimbingTowerPanel(TOWER_TYPE_KEY);
  if (typeof drawClimbingTowerPreview === "function") {
    drawClimbingTowerPreview(document.getElementById("field"),
                             typeof isDarkMode === "function" && isDarkMode());
  }
}

/**
 * The generic size boxes and the tower's own parameters describe the same
 * thing, so the tower's win: resizing it is done by its radius, not by typing a
 * length that its geometry would ignore.
 */
function towerApplyFootprint() {
  if (typeof state === "undefined" || state.activityId !== TOWER_TYPE_KEY) return;
  const fp = towerFootprintM();
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

/* ── The preview ──────────────────────────────────────────────────────────── */

/**
 * The tower in plan and in elevation.
 *
 * A plan alone cannot show this family: what makes it a climbing tower is that
 * it is 12 m tall and FLARES — 3 m radius at the bottom, 4 m at the top — and
 * in plan that reads as two triangles and nothing else. So both views, side by
 * side, the way the planter shows a plan and a section.
 *
 * Triangles, because that is what the family is: side = radius x sqrt(3) and
 * apothem = radius / 2 both hold exactly against the values it shipped with.
 */
function drawClimbingTowerPreview(svg, isDark) {
  if (!svg) return;
  const p = towerParams();
  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  const steel   = isDark ? "#6f7d8c" : "#9fb0bf";
  const deck    = isDark ? "#5b4a3a" : "#c8b49a";
  const canopy  = isDark ? "#9c8a6a" : "#d8c3a0";

  const VW = 460, VH = 300;
  const planBox = { cx: 118, cy: 160, r: 88 };
  const elevBox = { x: 250, w: 170, bottom: 250, top: 52 };

  /* ── plan: concentric triangles, largest first so each reads ── */
  const widestPlan = Math.max(p.Base_Radius, p.Tower_Top_Radio, p.Canopy_Radio + p.Canopy_Overhang);
  const ps = planBox.r / Math.max(0.001, widestPlan);

  // A triangle of circumradius R, point up, about the plan's centre.
  const tri = (R, fill, op, stroke, dash) => {
    const pts = [0, 120, 240].map(a => {
      const rad = (a - 90) * Math.PI / 180;
      return `${(planBox.cx + Math.cos(rad) * R * ps).toFixed(1)},${(planBox.cy + Math.sin(rad) * R * ps).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="1.2"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  };

  let plan = tri(p.Base_Radius, deck, 0.5, ink);                       // the platform it stands on
  plan += tri(p.Canopy_Radio + p.Canopy_Overhang, canopy, 0.35, ink, "5 4");  // canopy, above
  plan += tri(p.Tower_Top_Radio, steel, 0.30, ink, "5 4");             // the top, wider
  plan += tri(p.Tower_Base_Radio, steel, 0.80, ink);                   // where it meets the deck

  /* ── elevation: the flare is the whole point ── */
  const totalH = p.Tower_Height + p.Canopy_Thickness;
  const es = Math.min(elevBox.w / Math.max(0.001, p.Tower_Top_Radio * 2 + p.Canopy_Overhang * 2),
                      (elevBox.bottom - elevBox.top) / Math.max(0.001, totalH));
  const ecx = elevBox.x + elevBox.w / 2;
  const Y = m => elevBox.bottom - m * es;
  const halfAt = r => r * es;

  let elev = `<line x1="${elevBox.x - 26}" y1="${elevBox.bottom}" x2="${elevBox.x + elevBox.w + 26}" y2="${elevBox.bottom}" stroke="${ink}" stroke-width="1.3"/>`;
  // the base platform, a slab under it
  elev += `<rect x="${ecx - halfAt(p.Base_Radius)}" y="${Y(0.25)}" width="${halfAt(p.Base_Radius) * 2}" height="${0.25 * es}" fill="${deck}" stroke="${ink}" stroke-width="1"/>`;
  // the tower: a trapezoid, narrow at the bottom and wide at the top
  elev += `<polygon points="
      ${(ecx - halfAt(p.Tower_Base_Radio)).toFixed(1)},${Y(0).toFixed(1)}
      ${(ecx + halfAt(p.Tower_Base_Radio)).toFixed(1)},${Y(0).toFixed(1)}
      ${(ecx + halfAt(p.Tower_Top_Radio)).toFixed(1)},${Y(p.Tower_Height).toFixed(1)}
      ${(ecx - halfAt(p.Tower_Top_Radio)).toFixed(1)},${Y(p.Tower_Height).toFixed(1)}"
      fill="${steel}" fill-opacity="0.75" stroke="${ink}" stroke-width="1.2"/>`;
  // climbing faces, drawn as the bracing a climbing wall reads as
  const rungs = 6;
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs, y = Y(p.Tower_Height * t);
    const half = halfAt(p.Tower_Base_Radio + (p.Tower_Top_Radio - p.Tower_Base_Radio) * t);
    elev += `<line x1="${(ecx - half).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(ecx + half).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ink}" stroke-opacity="0.35" stroke-width="0.8"/>`;
  }
  // the canopy over the top
  const canopyHalf = halfAt(p.Canopy_Radio + p.Canopy_Overhang);
  elev += `<rect x="${ecx - canopyHalf}" y="${Y(totalH)}" width="${canopyHalf * 2}" height="${Math.max(2, p.Canopy_Thickness * es)}" rx="1.5" fill="${canopy}" stroke="${ink}" stroke-width="1"/>`;

  /* ── the two dimensions worth stating ── */
  const d = (side, a, b, at, off, label) =>
    typeof archDimSvg === "function" ? archDimSvg(side, a, b, at, off, label, dim, 10) : "";
  const across = Math.round(p.Base_Radius * 2 * 100) / 100;
  elev += d("left", Y(totalH), elevBox.bottom, ecx - canopyHalf, 16, `${p.Tower_Height}`);
  plan += d("bottom", planBox.cx - p.Base_Radius * ps, planBox.cx + p.Base_Radius * ps, planBox.cy + planBox.r * 0.95, 14, `${across}`);

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    <text x="${planBox.cx}" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Plan</text>
    <text x="${elevBox.x + elevBox.w / 2}" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Elevation</text>
    ${plan}${elev}
    <text x="${VW / 2}" y="${VH - 8}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Triangular in plan, flaring from ${p.Tower_Base_Radio} m to ${p.Tower_Top_Radio} m radius · each view to its own scale</text>`;
}
