/**
 * crossfitRig.js — the CrossFit training rig
 *
 * ── How this differs from the calisthenics rig ──
 * They look like cousins and they are not the same thing, so this is written to
 * make the difference visible rather than to reuse a shape.
 *
 * A calisthenics rig is round tube you hang from. A CrossFit rig is SQUARE
 * section you bolt things to — and that is the whole point of it. The uprights
 * are square so a J-cup can clamp round them at any height, which is what turns
 * a frame into a squat rack. Everything that makes a rig a rig rather than a
 * pull-up frame follows from that: J-cups, plate storage, band pegs.
 *
 * The other real difference is that a rig is normally DOUBLE sided. Two rows of
 * uprights facing each other, so a barbell can be racked between them and two
 * athletes can work back to back. A single-sided rig is a wall unit; a
 * double-sided one is free-standing and needs room on both faces. That changes
 * the footprint, not just the look, which is why it is a toggle here and not a
 * detail.
 *
 * ── What the numbers are ──
 * A rig cell is normally about 1.2 m, which is why rigs come in 2, 3, 4 bays
 * rather than arbitrary lengths — it is the spacing a person needs to work in.
 * Uprights are 75 mm square (3 inch is the common imported size, 75 mm the
 * metric one). Pull-up bars are 32 mm, thinner than a calisthenics bar, because
 * a rig bar is gripped rather than hung from for long periods.
 *
 * Working space is not a published standard the way DIN EN 16630 is for
 * outdoor fitness equipment, so it is stated as what it is: room to drop a
 * loaded barbell and swing, per face, which is a practical figure and marked
 * as one.
 */

const CROSSFIT = {
  norm: "DIN EN 16630",
  normTitle: "Permanently installed outdoor fitness equipment",
  // Room to work in FRONT of each face — a lift needs somewhere to put the bar
  // down and somewhere to step back to. Practical, not quoted.
  workingDepthM: 2.0,
  // Along the ends, where nobody is lifting: enough to walk past.
  endMarginM: 1.0,
  source: "practical",
};

/** [key, label, unit, step, hint] */
const CROSSFIT_INPUTS = [
  ["bays",           "Bays",             "",   1,   "Working cells along the rig"],
  ["bayWidth",       "Bay width",        "mm", 50,  "One cell — 1200 mm is the usual rig spacing"],
  ["rigDepth",       "Rig depth",        "mm", 50,  "Between the two rows, when double sided"],
  ["uprightSize",    "Upright section",  "mm", 5,   "Square tube — J-cups clamp to this"],
  ["uprightHeight",  "Upright height",   "mm", 50,  ""],
  ["pullUpHeight",   "Pull-up height",   "mm", 50,  "Top bar"],
  ["barDiameter",    "Bar diameter",     "mm", 1,   "32 mm is the usual rig bar"],
  ["jCupHeight",     "J-cup height",     "mm", 25,  "Where the barbell racks"],
  ["dipHeight",      "Dip bar height",   "mm", 50,  ""],
  ["pegHeight",      "Plate peg height", "mm", 50,  "Storage pegs on the outer face"],
];

const CROSSFIT_TOGGLES = [
  ["doubleSided",  "Double sided",   true,  "Two rows facing each other — a barbell racks between them"],
  ["squatStations","Squat stations", true,  "J-cups on every upright"],
  ["pullUpBars",   "Pull-up bars",   true,  "One per bay along each row"],
  ["dipBars",      "Dip station",    true,  "A pair of bars in one bay"],
  ["plateStorage", "Plate storage",  false, "Pegs on the outer face — adds depth"],
];

const CROSSFIT_DEFAULTS = {
  bays: 3,
  bayWidth: 1200,
  rigDepth: 1100,
  uprightSize: 75,
  uprightHeight: 2750,
  pullUpHeight: 2400,
  barDiameter: 32,
  jCupHeight: 1200,
  dipHeight: 1350,
  pegHeight: 1500,
  doubleSided: true,
  squatStations: true,
  pullUpBars: true,
  dipBars: true,
  plateStorage: false,
};

const CROSSFIT_STORAGE_KEY = "sportify-crossfit";

const crossfitState = (() => {
  const st = Object.assign({}, CROSSFIT_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(CROSSFIT_STORAGE_KEY) || "null");
    if (saved) Object.keys(st).forEach(k => { if (typeof saved[k] === typeof st[k]) st[k] = saved[k]; });
  } catch (e) { /* the defaults */ }
  return st;
})();

function crossfitSave() {
  try { localStorage.setItem(CROSSFIT_STORAGE_KEY, JSON.stringify(crossfitState)); } catch (e) { /* not kept */ }
}

/* ── What follows ────────────────────────────────────────────────────────── */

/** How far the plate pegs stick out of the outer face. */
const CROSSFIT_PEG_PROJECTION_M = 0.4;

function crossfitRig(s = crossfitState) {
  const up_m = s.uprightSize / 1000;
  const rows = s.doubleSided ? 2 : 1;
  const depth_m = s.doubleSided ? s.rigDepth / 1000 + up_m : up_m;
  return {
    length_m: c2(s.bays * s.bayWidth / 1000 + up_m),
    width_m: c2(depth_m + (s.plateStorage ? CROSSFIT_PEG_PROJECTION_M * rows : 0)),
    height_m: c2(s.uprightHeight / 1000),
    bay_m: c2(s.bayWidth / 1000),
    rows,
  };
}

/**
 * The roof a rig takes.
 *
 * Working room goes in FRONT of each face, and a double-sided rig has two
 * faces — which is the honest cost of the thing people actually want. It is
 * also the number that most often kills a rig on a roof: the frame is 3.7 m
 * long, the space it needs is 7.7 m wide.
 */
function crossfitFootprint(s = crossfitState) {
  const rig = crossfitRig(s);
  return {
    length_m: c2(rig.length_m + CROSSFIT.endMarginM * 2),
    width_m: c2(rig.width_m + CROSSFIT.workingDepthM * rig.rows),
  };
}

/** One person per bay per face — what the rig is worth in a programme. */
function crossfitStations(s = crossfitState) {
  return s.bays * (s.doubleSided ? 2 : 1);
}

function crossfitWeight(s = crossfitState) {
  const STEEL = 7850;
  const UPRIGHT_WALL = 0.003, BAR_WALL = 0.003;

  const square = (side_m, wall, len_m) => {
    const si = Math.max(0, side_m - 2 * wall);
    return (side_m * side_m - si * si) * len_m * STEEL;
  };
  const round = (dia_m, wall, len_m) => {
    const ro = dia_m / 2, ri = Math.max(0, ro - wall);
    return Math.PI * (ro * ro - ri * ri) * len_m * STEEL;
  };

  const up_m = s.uprightSize / 1000, bar_m = s.barDiameter / 1000;
  const h_m = s.uprightHeight / 1000, bay_m = s.bayWidth / 1000, depth_m = s.rigDepth / 1000;
  const rows = s.doubleSided ? 2 : 1;
  const uprights = (s.bays + 1) * rows;

  const parts = [];
  parts.push({ what: `Uprights (${uprights} × ${h_m.toFixed(2)} m, ${s.uprightSize} mm sq.)`,
               kg: square(up_m, UPRIGHT_WALL, uprights * h_m) });

  if (s.pullUpBars) {
    const n = s.bays * rows;
    parts.push({ what: `Pull-up bars (${n})`, kg: round(bar_m, BAR_WALL, n * bay_m) });
  }
  // A double rig is tied across the top, or it racks a barbell and folds.
  if (s.doubleSided) {
    const n = s.bays + 1;
    parts.push({ what: `Cross ties (${n})`, kg: square(up_m, UPRIGHT_WALL, n * depth_m) });
  }
  if (s.squatStations) {
    // A pair per upright, and they are solid lumps rather than section.
    const n = uprights * 2;
    parts.push({ what: `J-cups (${n})`, kg: n * 1.4 });
  }
  if (s.dipBars) parts.push({ what: "Dip bars (2)", kg: round(bar_m, BAR_WALL, 2 * bay_m) });
  if (s.plateStorage) {
    const n = uprights;
    parts.push({ what: `Plate pegs (${n})`, kg: round(0.05, 0.05, n * CROSSFIT_PEG_PROJECTION_M) });
  }

  const steel = parts.reduce((t, p) => t + p.kg, 0);
  parts.push({ what: "Base plates and fixings", kg: steel * 0.14 });

  const total = parts.reduce((t, p) => t + p.kg, 0);
  const fp = crossfitFootprint(s);
  const area = Math.max(1, fp.length_m * fp.width_m);
  return { parts, total_kg: total, area_m2: fp.length_m * fp.width_m, perM2_kg: total / area };
}

function c2(v) { return Math.round(v * 100) / 100; }

/* ── Drawing ─────────────────────────────────────────────────────────────── */

function drawCrossfitPreview(svg, isDark) {
  if (!svg) return;
  const s = crossfitState, rig = crossfitRig(s), fp = crossfitFootprint(s);

  const VW = 420, VH = 300;
  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const steel = isDark ? "#5a6470" : "#6d7885";
  const grip = isDark ? "#d8b25a" : "#c8922e";
  const jcup = isDark ? "#c05a4a" : "#b8432f";
  const zone = isDark ? "#2f3350" : "#e6e9f2";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  const sc = Math.min((VW - 70) / fp.length_m, 104 / Math.max(rig.height_m, 0.1));
  const rigW = rig.length_m * sc, rigH = rig.height_m * sc;
  const x0 = (VW - rigW) / 2;
  const up_px = Math.max(2.5, (s.uprightSize / 1000) * sc);
  const bar_px = Math.max(1.2, (s.barDiameter / 1000) * sc);

  /* Elevation */
  const eBase = 148;
  let art = "";
  art += `<line x1="${x0 - CROSSFIT.endMarginM * sc}" y1="${eBase}" x2="${x0 + rigW + CROSSFIT.endMarginM * sc}" y2="${eBase}" stroke="${ink}" stroke-width="1"/>`;

  for (let i = 0; i <= s.bays; i++) {
    const px = x0 + (i * s.bayWidth / 1000) * sc;
    art += `<rect x="${px}" y="${eBase - rigH}" width="${up_px}" height="${rigH}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
    // The numbered holes are what a rig upright looks like and what a J-cup uses.
    for (let z = 0.4; z < rig.height_m - 0.2; z += 0.1) {
      art += `<circle cx="${px + up_px / 2}" cy="${eBase - z * sc}" r="${Math.max(0.35, up_px * 0.09)}" fill="${ink}" fill-opacity="0.45"/>`;
    }
  }

  if (s.pullUpBars) {
    const y = eBase - (s.pullUpHeight / 1000) * sc;
    for (let b = 0; b < s.bays; b++) {
      const a = x0 + (b * s.bayWidth / 1000) * sc + up_px;
      art += `<rect x="${a}" y="${y}" width="${(s.bayWidth / 1000) * sc - up_px}" height="${bar_px}" fill="${grip}"/>`;
    }
  }
  if (s.squatStations) {
    const y = eBase - (s.jCupHeight / 1000) * sc;
    for (let i = 0; i <= s.bays; i++) {
      const px = x0 + (i * s.bayWidth / 1000) * sc;
      art += `<rect x="${px - up_px * 0.5}" y="${y - up_px * 0.5}" width="${up_px * 2}" height="${up_px}" fill="${jcup}" stroke="${ink}" stroke-width="0.4"/>`;
    }
  }
  if (s.dipBars) {
    const y = eBase - (s.dipHeight / 1000) * sc;
    const b = s.bays >= 2 ? 1 : 0;
    art += `<rect x="${x0 + (b * s.bayWidth / 1000) * sc}" y="${y}" width="${(s.bayWidth / 1000) * sc}" height="${bar_px}" fill="${grip}"/>`;
  }

  /* Plan — where the double-sidedness becomes the story.
     Its own scale, and the whole footprint boxed from its own top-left, so the
     working room cannot reach back up into the elevation above it. */
  const pTop = 186;
  const psc = Math.min((VW - 70) / fp.length_m, 84 / fp.width_m);
  const pX = (VW - fp.length_m * psc) / 2;
  const up_p = Math.max(2, (s.uprightSize / 1000) * psc);
  const bar_p = Math.max(1, (s.barDiameter / 1000) * psc);

  art += `<rect x="${pX}" y="${pTop}" width="${fp.length_m * psc}" height="${fp.width_m * psc}"
                fill="${zone}" fill-opacity="0.5" stroke="${dim}" stroke-width="0.6" stroke-dasharray="5 4"/>`;

  // The rig sits inside it: past the end margin, and past the working room in
  // front of the first face.
  const rX = pX + CROSSFIT.endMarginM * psc;
  const rY = pTop + CROSSFIT.workingDepthM * psc;
  const rowYs = s.doubleSided ? [rY, rY + (s.rigDepth / 1000) * psc] : [rY];

  rowYs.forEach(py => {
    for (let i = 0; i <= s.bays; i++) {
      const px = rX + (i * s.bayWidth / 1000) * psc;
      art += `<rect x="${px}" y="${py - up_p / 2}" width="${up_p}" height="${up_p}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
    }
    if (s.pullUpBars) {
      art += `<line x1="${rX + up_p / 2}" y1="${py}" x2="${rX + rig.length_m * psc - up_p / 2}" y2="${py}" stroke="${grip}" stroke-width="${bar_p}"/>`;
    }
  });
  if (s.doubleSided) {
    for (let i = 0; i <= s.bays; i++) {
      const px = rX + (i * s.bayWidth / 1000) * psc + up_p / 2;
      art += `<line x1="${px}" y1="${rowYs[0]}" x2="${px}" y2="${rowYs[1]}" stroke="${steel}" stroke-width="${up_p * 0.6}"/>`;
    }
  }

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    <text x="${VW / 2}" y="18" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Elevation</text>
    <text x="${VW / 2}" y="${pTop - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Plan</text>
    ${art}
    <text x="${VW / 2}" y="${VH - 22}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Rig ${rig.length_m} × ${rig.width_m} m · ${s.bays} bays · ${s.doubleSided ? "double sided" : "single sided"} · ${crossfitStations()} stations</text>
    <text x="${VW / 2}" y="${VH - 8}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Dashed: ${CROSSFIT.workingDepthM} m working room per face — ${fp.length_m} × ${fp.width_m} m in all</text>`;
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function crossfitPanelHtml() {
  const s = crossfitState, rig = crossfitRig(), fp = crossfitFootprint(), w = crossfitWeight();
  const kg = n => Math.round(n).toLocaleString("en-US");

  const input = ([key, label, unit, step, hint]) => `
    <tr>
      <td>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</td>
      <td><input type="number" step="${step}" min="${key === "bays" ? 1 : 0}"
                 data-crossfit="${escapeHtml(key)}" value="${escapeHtml(s[key])}">
          <small>${escapeHtml(unit)}</small></td>
    </tr>`;

  const toggle = ([key, label, , hint]) => `
    <label class="planter-toggle"><span>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</span>
      <span class="planter-yn">
        <button type="button" data-crossfit-toggle="${escapeHtml(key)}" data-val="1" class="${s[key] ? "on" : ""}">Yes</button>
        <button type="button" data-crossfit-toggle="${escapeHtml(key)}" data-val="0" class="${s[key] ? "" : "on"}">No</button>
      </span>
    </label>`;

  return `
    <div class="section">
      <label>The rig</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${rig.length_m} × ${rig.width_m} m</div><div class="lbl">Rig itself</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">With working room</div></div>
        <div class="dim-card"><div class="val">${crossfitStations()}</div><div class="lbl">Stations</div></div>
        <div class="dim-card"><div class="val">${rig.height_m} m</div><div class="lbl">Upright height</div></div>
      </div>
      <p class="hint">${s.bays} bays of ${rig.bay_m} m${s.doubleSided
        ? `, two rows — a barbell racks between them, and both faces need room to work.`
        : `, one row — a wall unit, so only one face needs room.`}</p>
    </div>

    <div class="section">
      <label>What is on it</label>
      ${CROSSFIT_TOGGLES.map(toggle).join("")}
      ${s.squatStations ? `<p class="hint">J-cups clamp to the square uprights — that is what the square section is for.</p>` : ""}
    </div>

    <div class="section">
      <label>Dimensions</label>
      <table class="planter-table"><tbody>${CROSSFIT_INPUTS.map(input).join("")}</tbody></table>
      <button type="button" class="btn-link" data-crossfit-reset>Reset to the defaults</button>
    </div>

    <div class="section">
      <label>On the deck</label>
      <table class="planter-table">
        <tbody>
          ${w.parts.map(p => `<tr><td>${escapeHtml(p.what)}</td><td>${kg(p.kg)} kg</td></tr>`).join("")}
          <tr class="planter-group"><td>Total</td><td>${kg(w.total_kg)} kg</td></tr>
        </tbody>
      </table>
      <p class="hint">Steel section, not solid — ${kg(w.perM2_kg)} kg/m² over the working area.
         Barbells and plates are not counted: they are loose kit, not the rig.</p>
    </div>

    <div class="section">
      <label>Room to work</label>
      <p class="hint">${CROSSFIT.workingDepthM} m in front of each face, ${CROSSFIT.endMarginM} m past the ends. A lift needs
         somewhere to put the bar down and somewhere to step back to. Practical figures, not a published clearance —
         ${escapeHtml(CROSSFIT.norm)} covers the equipment itself.</p>
      <p class="hint">This is usually what decides a rig on a roof: the frame is ${rig.length_m} m long, the space it needs is ${fp.width_m} m deep.</p>
    </div>`;
}

function syncCrossfitPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host || activityId !== "crossfit_rig") return false;
  host.innerHTML = crossfitPanelHtml();
  return true;
}

function crossfitApplyFootprint() {
  if (typeof state === "undefined" || state.activityId !== "crossfit_rig") return;
  const fp = crossfitFootprint();
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

function crossfitRefresh() {
  crossfitApplyFootprint();
  syncCrossfitPanel("crossfit_rig");
  drawCrossfitPreview(document.getElementById("field"),
                      typeof isDarkMode === "function" && isDarkMode());
}

/* ── Payload ─────────────────────────────────────────────────────────────── */

function crossfitPayload(s = crossfitState) {
  const rig = crossfitRig(s), fp = crossfitFootprint(s), w = crossfitWeight(s);
  return {
    bays: s.bays,
    bay_width_m: s.bayWidth / 1000,
    rig_depth_m: s.rigDepth / 1000,
    upright_size_m: s.uprightSize / 1000,
    upright_height_m: s.uprightHeight / 1000,
    pull_up_height_m: s.pullUpHeight / 1000,
    bar_diameter_m: s.barDiameter / 1000,
    j_cup_height_m: s.jCupHeight / 1000,
    dip_height_m: s.dipHeight / 1000,
    peg_height_m: s.pegHeight / 1000,
    peg_projection_m: CROSSFIT_PEG_PROJECTION_M,

    double_sided: !!s.doubleSided,
    squat_stations: !!s.squatStations,
    pull_up_bars: !!s.pullUpBars,
    dip_bars: !!s.dipBars,
    plate_storage: !!s.plateStorage,
    rows: rig.rows,
    stations: crossfitStations(s),

    rig_length_m: rig.length_m,
    rig_width_m: rig.width_m,
    length_m: fp.length_m,
    width_m: fp.width_m,
    working_depth_m: CROSSFIT.workingDepthM,
    end_margin_m: CROSSFIT.endMarginM,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    source: `${CROSSFIT.norm} — ${CROSSFIT.normTitle}; working room is a practical figure`,
  };
}

/* ── Listeners ───────────────────────────────────────────────────────────── */

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.crossfit == null) return;
  const key = t.dataset.crossfit;
  let n = Number(t.value);
  if (!Number.isFinite(n) || n < 0) return;
  if (key === "bays") n = Math.max(1, Math.round(n));
  crossfitState[key] = n;
  crossfitSave();
  crossfitRefresh();
});

document.addEventListener("click", e => {
  if (typeof state === "undefined" || state.activityId !== "crossfit_rig") return;

  const tg = e.target.closest && e.target.closest("[data-crossfit-toggle]");
  if (tg) {
    crossfitState[tg.dataset.crossfitToggle] = tg.dataset.val === "1";
    crossfitSave();
    crossfitRefresh();
    return;
  }
  if (e.target.closest && e.target.closest("[data-crossfit-reset]")) {
    Object.assign(crossfitState, CROSSFIT_DEFAULTS);
    crossfitSave();
    crossfitRefresh();
  }
});
