/**
 * activityFamilies.js — the design team's families placed as activities
 *
 * Two more families the design team authored, handled the way the planters and
 * the climbing tower are: we do not model them, we set the parameters they
 * expose and Revit places their family configured.
 *
 * Both are described by one table here because they behave identically — a list
 * of parameters, a footprint worked out from some of them, and a payload. The
 * only thing that differs between the two is which parameters they have and how
 * the footprint falls out of them.
 *
 * ── Read from Revit, not retyped ──
 * Names, current values and which of them Revit will accept came from the
 * add-in's own Load Families command. Lengths are METRES, as these two families
 * state themselves.
 *
 * ── The locker bank is not a fixed block ──
 * It has Column_Count. So the panel sizes a bank rather than placing a box:
 * eight columns of 800 mm is a 6.4 m run, and the roof plan shows a 6.4 m run.
 * That is the difference between a family being placed and a family being used.
 */

/**
 * One entry per family. `inputs` are [parameter, label, hint]; `footprint`
 * turns the values into the size the roof plan reserves.
 */
const ACTIVITY_FAMILIES = {
  locker_module: {
    family: "Locker Bank",
    label: "Locker Bank",
    inputs: [
      ["Column_Count",  "Columns",        "How many lockers wide the bank is", { integer: true, min: 1 }],
      ["Module_Width",  "Module width",   "One locker"],
      ["Module_Depth",  "Module depth",   ""],
      ["Module_Height", "Module height",  ""],
      ["Leg_Height",    "Leg height",     "Lifts the bank clear of the floor"],
      ["Default Elevation", "Elevation",  "Above the deck; 0 sits on it"],
    ],
    defaults: {
      "Column_Count": 1, "Module_Width": 0.80, "Module_Depth": 0.70,
      "Module_Height": 2.00, "Leg_Height": 0.15, "Default Elevation": 0,
    },
    derived: [
      ["Overall height", p => p.Module_Height + p.Leg_Height, "Module height + leg height"],
      ["Overall width",  p => p.Column_Count * p.Module_Width, "Columns × module width"],
    ],
    // A bank runs along its width; the depth is one module however long it gets.
    footprint: p => ({ length_m: p.Column_Count * p.Module_Width, width_m: p.Module_Depth }),
  },

  yoga_deck: {
    family: "Yoga Deck",
    label: "Yoga / Stretching Deck",
    inputs: [
      ["Deck_Length",     "Deck length",     ""],
      ["Deck_Width",      "Deck width",      ""],
      ["Roof_Height",     "Roof height",     "Underside of the roof above the deck"],
      ["Roof_Thickness",  "Roof thickness",  ""],
      ["Planter_Spacing", "Planter spacing", "How far apart the planters sit along the edge"],
      ["Default Elevation", "Elevation",     "Above the deck; 0 sits on it"],
    ],
    defaults: {
      "Deck_Length": 10.0, "Deck_Width": 5.0, "Roof_Height": 4.0,
      "Roof_Thickness": 0.15, "Planter_Spacing": 1.5, "Default Elevation": 0,
    },
    toggles: [["Show_Roof", "Roof over the deck", true]],
    derived: [
      ["Deck area", p => p.Deck_Length * p.Deck_Width, "Deck length × deck width"],
      // The spacing decides how many planters there are, which is the number
      // anyone ordering them actually needs.
      ["Planters around the edge",
       p => Math.max(0, Math.round((2 * (p.Deck_Length + p.Deck_Width)) / Math.max(0.1, p.Planter_Spacing))),
       "Perimeter ÷ planter spacing"],
      ["Clear height under the roof", p => p.Roof_Height, "Roof height"],
    ],
    // The roof sits over the deck, so it takes no more room than the deck does.
    footprint: p => ({ length_m: p.Deck_Length, width_m: p.Deck_Width }),
  },

  dressing_cabin: {
    family: "Dressing_Cabin",
    label: "Dressing Cabin",
    inputs: [
      ["Cabin_Width",     "Cabin width",     ""],
      ["Cabin_Depth",     "Cabin depth",     ""],
      ["Cabin_Height",    "Cabin height",    "Inside, to the ceiling"],
      ["Total_Height",    "Total height",    "Including whatever sits above the cabin"],
      ["Wall_Thickness",  "Wall thickness",  ""],
      ["Leg_Height",      "Leg height",      ""],
      ["Clearance_Depth", "Clearance depth", "The space to stand in front of the door"],
      ["Default Elevation", "Elevation",     "Above the deck; 0 sits on it"],
    ],
    defaults: {
      "Cabin_Width": 2.10, "Cabin_Depth": 1.80, "Cabin_Height": 2.10,
      "Total_Height": 2.50, "Wall_Thickness": 0.15, "Leg_Height": 0.15,
      "Clearance_Depth": 1.20, "Default Elevation": 0,
    },
    toggles: [["Show_Clearance", "Show the clearance zone", false]],
    derived: [
      ["Inside width", p => p.Cabin_Width - 2 * p.Wall_Thickness, "Cabin width − 2 × wall thickness"],
      ["Inside depth", p => p.Cabin_Depth - 2 * p.Wall_Thickness, "Cabin depth − 2 × wall thickness"],
    ],
    /**
     * A door needs somewhere to stand. When the clearance is shown, the roof
     * plan reserves it too — a cabin you cannot get into is not a cabin, and
     * the space in front of it is as real as the cabin itself.
     */
    footprint: p => ({
      length_m: p.Cabin_Width,
      width_m: p.Cabin_Depth + (p.Show_Clearance ? p.Clearance_Depth : 0),
    }),
  },
};

const ACTIVITY_FAMILY_STORAGE_KEY = "sportify-activity-families";

const activityFamilyState = (() => {
  const st = {};
  Object.entries(ACTIVITY_FAMILIES).forEach(([id, f]) => {
    st[id] = Object.assign({}, f.defaults);
    (f.toggles || []).forEach(([key, , dflt]) => { st[id][key] = dflt; });
  });
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVITY_FAMILY_STORAGE_KEY) || "null");
    if (saved) Object.keys(st).forEach(id => {
      if (saved[id]) Object.keys(st[id]).forEach(k => {
        if (typeof saved[id][k] === typeof st[id][k]) st[id][k] = saved[id][k];
      });
    });
  } catch (e) { /* the families' own defaults */ }
  return st;
})();

function activityFamilySave() {
  try { localStorage.setItem(ACTIVITY_FAMILY_STORAGE_KEY, JSON.stringify(activityFamilyState)); } catch (e) { /* not kept */ }
}

function isActivityFamily(activityId) {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_FAMILIES, activityId);
}

/** Everything Revit will be sent for this family: what was set, plus what follows. */
function activityFamilyParams(id) {
  const f = ACTIVITY_FAMILIES[id];
  const p = Object.assign({}, activityFamilyState[id]);
  return p;
}

function activityFamilyFootprintM(id) {
  const f = ACTIVITY_FAMILIES[id];
  const fp = f.footprint(activityFamilyParams(id));
  const r = v => Math.round(v * 100) / 100;
  return { length_m: r(fp.length_m), width_m: r(fp.width_m) };
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function syncActivityFamilyPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host) return false;
  if (!isActivityFamily(activityId)) return false;

  const f = ACTIVITY_FAMILIES[activityId];
  const p = activityFamilyParams(activityId);
  const fp = activityFamilyFootprintM(activityId);
  const num = v => (Math.round(v * 1000) / 1000).toLocaleString("en-US");

  const input = ([key, label, hint, opts]) => {
    const o = opts || {};
    return `
      <tr>
        <td>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</td>
        <td><input type="number" step="${o.integer ? 1 : 0.05}" min="${o.min ?? 0}"
                   data-family-param="${escapeHtml(key)}" value="${escapeHtml(p[key])}">
            <small>${o.integer ? "" : "m"}</small></td>
      </tr>`;
  };

  const derived = ([label, fn, how]) => `
    <tr class="planter-formula">
      <td>${escapeHtml(label)}</td>
      <td>${num(fn(p))} <small>m</small><br><small>= ${escapeHtml(how)}</small></td>
    </tr>`;

  const toggles = (f.toggles || []).map(([key, label]) => `
    <label class="planter-toggle"><span>${escapeHtml(label)}</span>
      <span class="planter-yn">
        <button type="button" data-family-toggle="${escapeHtml(key)}" data-val="1" class="${p[key] ? "on" : ""}">Yes</button>
        <button type="button" data-family-toggle="${escapeHtml(key)}" data-val="0" class="${p[key] ? "" : "on"}">No</button>
      </span>
    </label>`).join("");

  host.innerHTML = `
    <div class="section">
      <label>${escapeHtml(f.label)}</label>
      <p class="hint">Revit family: ${escapeHtml(f.family)} · the parameters it exposes</p>
      <div class="dims">
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">Footprint on the roof</div></div>
        ${activityId === "locker_module"
          ? `<div class="dim-card"><div class="val">${p.Column_Count}</div><div class="lbl">Lockers in the bank</div></div>`
          : `<div class="dim-card"><div class="val">${num(p.Total_Height)} m</div><div class="lbl">Total height</div></div>`}
      </div>
    </div>

    ${toggles ? `<div class="section"><label>Options</label>${toggles}</div>` : ""}

    <div class="section">
      <label>Parameters</label>
      <table class="planter-table">
        <tbody>
          ${f.inputs.map(input).join("")}
          ${f.derived?.length ? `<tr class="planter-group"><td colspan="2">Worked out from the above</td></tr>${f.derived.map(derived).join("")}` : ""}
        </tbody>
      </table>
      <button type="button" class="btn-link" data-family-reset>Reset to the family's defaults</button>
    </div>`;

  return true;
}

/** What a placed family carries to Revit. Same shape as the planters' and the tower's. */
function activityFamilyPayload(activityId) {
  const f = ACTIVITY_FAMILIES[activityId];
  if (!f) return undefined;
  return {
    type: activityId,
    label: f.label,
    family: f.family,
    units: "m",
    params: activityFamilyParams(activityId),
  };
}

/* ── The preview ─────────────────────────────────────────────────────────── */

/** In plan, to scale — a bank of lockers reads as its columns, a cabin as a room. */
function drawActivityFamilyPreview(svg, activityId, isDark) {
  if (!svg || !isActivityFamily(activityId)) return;
  const f = ACTIVITY_FAMILIES[activityId];
  const p = activityFamilyParams(activityId), fp = activityFamilyFootprintM(activityId);

  const VW = 420, VH = 260, PAD = 50;
  const aspect = fp.length_m / fp.width_m;
  let w = VW - PAD * 2, h = w / aspect;
  if (h > VH - PAD * 2) { h = VH - PAD * 2; w = h * aspect; }
  const x = (VW - w) / 2, y = (VH - h) / 2;
  const s = w / fp.length_m;

  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const body = isDark ? "#6f7d8c" : "#9fb0bf";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  let art = "";
  if (activityId === "yoga_deck") {
    // The deck, the planters that edge it, and the roof over the top — which is
    // drawn dashed because in plan it is above you, the way a canopy is drawn.
    art += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${body}" fill-opacity="0.45" stroke="${ink}" stroke-width="1.2"/>`;
    // Boards, so it reads as a deck rather than a slab.
    const boards = Math.max(4, Math.round(p.Deck_Width / 0.25));
    for (let i = 1; i < boards; i++) {
      const gy = y + (i / boards) * h;
      art += `<line x1="${x}" y1="${gy}" x2="${x + w}" y2="${gy}" stroke="${ink}" stroke-width="0.4" stroke-opacity="0.35"/>`;
    }
    if (p.Show_Roof) {
      const over = Math.min(10, s * 0.3);
      art += `<rect x="${x - over}" y="${y - over}" width="${w + over * 2}" height="${h + over * 2}"
                    fill="none" stroke="${ink}" stroke-width="1" stroke-dasharray="6 4"/>`;
      art += `<text x="${x + w - 4}" y="${y - over - 5}" text-anchor="end" font-size="9" fill="${dim}" ${font}>roof over, ${p.Roof_Height} m clear</text>`;
    }
    // A planter at each spacing round the perimeter.
    const r = Math.max(2, Math.min(6, p.Planter_Spacing * s * 0.22));
    const step = Math.max(0.1, p.Planter_Spacing);
    for (let d = step / 2; d < p.Deck_Length; d += step) {
      const px0 = x + d * s;
      art += `<circle cx="${px0}" cy="${y}" r="${r}" fill="${isDark ? "#3f5a2f" : "#8cbf6a"}" stroke="${ink}" stroke-width="0.6"/>`;
      art += `<circle cx="${px0}" cy="${y + h}" r="${r}" fill="${isDark ? "#3f5a2f" : "#8cbf6a"}" stroke="${ink}" stroke-width="0.6"/>`;
    }
    for (let d = step / 2; d < p.Deck_Width; d += step) {
      const py0 = y + d * s;
      art += `<circle cx="${x}" cy="${py0}" r="${r}" fill="${isDark ? "#3f5a2f" : "#8cbf6a"}" stroke="${ink}" stroke-width="0.6"/>`;
      art += `<circle cx="${x + w}" cy="${py0}" r="${r}" fill="${isDark ? "#3f5a2f" : "#8cbf6a"}" stroke="${ink}" stroke-width="0.6"/>`;
    }
  } else if (activityId === "locker_module") {
    art += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${body}" fill-opacity="0.75" stroke="${ink}" stroke-width="1.2"/>`;
    // One division per locker: the count is the point of this family.
    for (let i = 1; i < p.Column_Count; i++) {
      const gx = x + i * p.Module_Width * s;
      art += `<line x1="${gx}" y1="${y}" x2="${gx}" y2="${y + h}" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.7"/>`;
    }
    // A door handle per locker, so it reads as lockers and not as a wall.
    for (let i = 0; i < p.Column_Count; i++) {
      const cx = x + (i + 0.82) * p.Module_Width * s;
      art += `<circle cx="${cx}" cy="${y + h / 2}" r="${Math.max(1, s * 0.03)}" fill="${ink}" fill-opacity="0.8"/>`;
    }
  } else {
    const cabinH = p.Cabin_Depth * s;
    const wall = Math.max(1.5, p.Wall_Thickness * s);
    if (p.Show_Clearance) {
      art += `<rect x="${x}" y="${y + cabinH}" width="${w}" height="${h - cabinH}"
                    fill="${body}" fill-opacity="0.18" stroke="${ink}" stroke-width="0.8" stroke-dasharray="5 4"/>`;
      art += `<text x="${x + w / 2}" y="${y + cabinH + (h - cabinH) / 2 + 4}" text-anchor="middle"
                    font-size="9" fill="${dim}" ${font}>clearance ${p.Clearance_Depth} m</text>`;
    }
    art += `<rect x="${x}" y="${y}" width="${w}" height="${cabinH}" fill="${body}" fill-opacity="0.75" stroke="${ink}" stroke-width="1.2"/>`;
    art += `<rect x="${x + wall}" y="${y + wall}" width="${w - wall * 2}" height="${cabinH - wall * 2}"
                  fill="${isDark ? "#2a2d44" : "#ffffff"}" stroke="${ink}" stroke-width="0.8"/>`;
    // The door, on the clearance side.
    art += `<line x1="${x + w * 0.25}" y1="${y + cabinH}" x2="${x + w * 0.75}" y2="${y + cabinH}"
                  stroke="${isDark ? "#2a2d44" : "#ffffff"}" stroke-width="${wall + 1}"/>`;
    art += `<path d="M ${x + w * 0.25} ${y + cabinH} A ${w * 0.5} ${w * 0.5} 0 0 0 ${x + w * 0.25} ${y + cabinH - w * 0.5}"
                  fill="none" stroke="${ink}" stroke-width="0.7" stroke-dasharray="3 3"/>`;
  }

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    <text x="${VW / 2}" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Plan</text>
    ${art}
    ${typeof archDimSvg === "function" ? archDimSvg("top", x, x + w, y, 14, `${fp.length_m}`, dim, 10) : ""}
    ${typeof archDimSvg === "function" ? archDimSvg("left", y, y + h, x, 14, `${fp.width_m}`, dim, 10) : ""}
    <text x="${VW / 2}" y="${VH - 10}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>${escapeHtml(f.family)} · sizes from the family's own parameters</text>`;
}

/* ── Listeners ───────────────────────────────────────────────────────────── */

/** The family's size wins over the generic boxes: it is set by its parameters. */
function activityFamilyApplyFootprint() {
  if (typeof state === "undefined" || !isActivityFamily(state.activityId)) return;
  const fp = activityFamilyFootprintM(state.activityId);
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

function activityFamilyRefresh() {
  activityFamilyApplyFootprint();
  syncActivityFamilyPanel(state.activityId);
  drawActivityFamilyPreview(document.getElementById("field"), state.activityId,
                            typeof isDarkMode === "function" && isDarkMode());
}

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.familyParam == null) return;
  if (typeof state === "undefined" || !isActivityFamily(state.activityId)) return;
  const key = t.dataset.familyParam;
  const spec = ACTIVITY_FAMILIES[state.activityId].inputs.find(i => i[0] === key);
  const integer = spec?.[3]?.integer;
  let n = Number(t.value);
  if (!Number.isFinite(n)) return;
  if (integer) n = Math.max(spec?.[3]?.min ?? 1, Math.round(n));
  if (n < 0) return;
  activityFamilyState[state.activityId][key] = n;
  activityFamilySave();
  activityFamilyRefresh();
});

document.addEventListener("click", e => {
  if (typeof state === "undefined" || !isActivityFamily(state.activityId)) return;

  const tg = e.target.closest && e.target.closest("[data-family-toggle]");
  if (tg) {
    activityFamilyState[state.activityId][tg.dataset.familyToggle] = tg.dataset.val === "1";
    activityFamilySave();
    activityFamilyRefresh();
    return;
  }

  if (e.target.closest && e.target.closest("[data-family-reset]")) {
    const f = ACTIVITY_FAMILIES[state.activityId];
    activityFamilyState[state.activityId] = Object.assign({}, f.defaults);
    (f.toggles || []).forEach(([key, , dflt]) => { activityFamilyState[state.activityId][key] = dflt; });
    activityFamilySave();
    activityFamilyRefresh();
  }
});
