/**
 * calisthenics.js — the calisthenics rig, which we model ourselves
 *
 * ── Why this one is built and not loaded ──
 * Everything in activityFamilies.js is the design team's: they authored a
 * Revit family, we set its parameters. There is no calisthenics family, so
 * this is ours to model, the way the padel court and the football pitch are.
 *
 * A calisthenics rig is a good thing to build rather than wait for, because it
 * is honestly just pipes. It is a portal frame of posts and rails with bars
 * hung off it, and every one of those is a tube between two points. There is no
 * moulded shape to get wrong and no product to misrepresent — which is exactly
 * why this is the placeholder worth replacing first.
 *
 * ── What is parametric, and what is not ──
 * The rig is sized by its bays, not by dragging a rectangle. A bay is one
 * structural opening between posts, and it is the unit the thing is actually
 * built and priced in: three bays of 1.8 m is a 5.4 m rig, and it is 5.4 m
 * because it is three bays, not the other way round. So Length is DERIVED.
 *
 * The bars are toggles rather than counts. Whether there are monkey bars is a
 * decision; how many rungs they have follows from the span and the spacing, and
 * making someone type that number would only let them type a wrong one.
 *
 * ── Dimensions ──
 * The defaults are ordinary outdoor-fitness sizes, not a manufacturer's
 * product. Grip diameter is the one that matters to a user and is the most
 * standardised: 40 mm is within the usual 32-42 mm range for a bar you hang
 * from. Posts are 114.3 mm because that is a real steel tube size (DN100),
 * not a round number someone picked.
 *
 * The safety area comes from DIN EN 16630, the standard for permanently
 * installed outdoor fitness equipment, which asks for a clear area around
 * equipment you can fall from. It is carried separately from the rig's own
 * footprint because it is the number that decides whether the rig fits on the
 * roof at all — the same reason the ping pong panel leads with playing space
 * rather than table size.
 */

const CALISTHENICS = {
  norm: "DIN EN 16630",
  normTitle: "Permanently installed outdoor fitness equipment",
  // The clear area around equipment. Marked as a reference figure rather than
  // quoted: it is the standard's usual minimum, and a real installation is
  // signed off against the standard itself, not against this panel.
  safetyMarginM: 1.5,
  safetySource: "reference",
};

/** [key, label, unit, step, hint] — millimetres, because that is how a fabricator draws it. */
const CALISTHENICS_INPUTS = [
  ["bays",          "Bays",            "",   1,   "Structural openings between posts"],
  ["bayWidth",      "Bay width",       "mm", 50,  "One opening, post centre to post centre"],
  ["rigDepth",      "Rig depth",       "mm", 50,  "Across the rig, post centre to post centre"],
  ["frameHeight",   "Frame height",    "mm", 50,  "To the top rail"],
  ["pullUpHeight",  "Pull-up height",  "mm", 50,  "High bar — clear hang for a tall adult"],
  ["postDiameter",  "Post diameter",   "mm", 1,   "Structural tube (114.3 mm is DN100)"],
  ["barDiameter",   "Bar diameter",    "mm", 1,   "What you grip — 32 to 42 mm is normal"],
  ["rungSpacing",   "Rung spacing",    "mm", 10,  "Monkey bars, rung centre to rung centre"],
  ["dipHeight",     "Dip bar height",  "mm", 50,  ""],
  ["dipSpacing",    "Dip bar spacing", "mm", 10,  "Between the two parallel bars"],
  ["lowBarHeight",  "Low bar height",  "mm", 50,  "For rows and step-ups"],
];

const CALISTHENICS_TOGGLES = [
  ["monkeyBars", "Monkey bars",  true,  "Rungs across the top, over the middle bays"],
  ["pullUpBars", "Pull-up bars", true,  "High bar at each end bay"],
  ["dipBars",    "Dip bars",     true,  "A pair of parallel bars in one bay"],
  ["lowBar",     "Low bar",      false, "A waist-height bar in one bay"],
];

const CALISTHENICS_DEFAULTS = {
  bays: 3,
  bayWidth: 1800,
  rigDepth: 1200,
  frameHeight: 2500,
  pullUpHeight: 2400,
  postDiameter: 114.3,
  barDiameter: 40,
  rungSpacing: 380,
  dipHeight: 1300,
  dipSpacing: 600,
  lowBarHeight: 900,
  monkeyBars: true,
  pullUpBars: true,
  dipBars: true,
  lowBar: false,
};

const CALISTHENICS_STORAGE_KEY = "sportify-calisthenics";

const calisthenicsState = (() => {
  const st = Object.assign({}, CALISTHENICS_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(CALISTHENICS_STORAGE_KEY) || "null");
    if (saved) Object.keys(st).forEach(k => { if (typeof saved[k] === typeof st[k]) st[k] = saved[k]; });
  } catch (e) { /* the defaults */ }
  return st;
})();

function calisthenicsSave() {
  try { localStorage.setItem(CALISTHENICS_STORAGE_KEY, JSON.stringify(calisthenicsState)); } catch (e) { /* not kept */ }
}

/* ── What follows from the settings ──────────────────────────────────────── */

/**
 * The rig itself, in metres.
 *
 * Length is bays × bay width plus one post: the bay width is measured centre to
 * centre, so the steel sticks out half a post at each end and the thing you
 * would actually tape-measure is that much longer.
 */
function calisthenicsRig(s = calisthenicsState) {
  const post_m = s.postDiameter / 1000;
  return {
    length_m: round2(s.bays * s.bayWidth / 1000 + post_m),
    width_m: round2(s.rigDepth / 1000 + post_m),
    height_m: round2(s.frameHeight / 1000),
    bay_m: round2(s.bayWidth / 1000),
  };
}

/** The rig plus the clear area around it — what the roof has to give up. */
function calisthenicsFootprint(s = calisthenicsState) {
  const rig = calisthenicsRig(s);
  const m = CALISTHENICS.safetyMarginM * 2;
  return { length_m: round2(rig.length_m + m), width_m: round2(rig.width_m + m) };
}

/** How many monkey-bar rungs the span and the spacing come to. Nobody should type this. */
function calisthenicsRungCount(s = calisthenicsState) {
  if (!s.monkeyBars) return 0;
  const span_mm = calisthenicsMonkeyBays(s) * s.bayWidth;
  return Math.max(0, Math.floor(span_mm / Math.max(10, s.rungSpacing)) + 1);
}

/**
 * Which bays carry the monkey bars: the middle ones, because the end bays are
 * where the pull-up bars and the dip bars go. With fewer than three bays there
 * is no middle, so they run the whole rig.
 */
function calisthenicsMonkeyBays(s = calisthenicsState) {
  return s.bays >= 3 ? s.bays - 2 : s.bays;
}

/**
 * What it weighs, from the steel.
 *
 * Tube, not solid bar: a 114 mm post with a 4 mm wall, a 40 mm bar with a 3 mm
 * wall. Solid would be several times heavier and wrong in the same direction
 * every time, which is the worst kind of wrong for a structural check.
 */
function calisthenicsWeight(s = calisthenicsState) {
  const STEEL = 7850;                 // kg/m3
  const POST_WALL = 0.004, BAR_WALL = 0.003;
  const tube = (dia_m, wall, len_m) => {
    const ro = dia_m / 2, ri = Math.max(0, ro - wall);
    return Math.PI * (ro * ro - ri * ri) * len_m * STEEL;
  };

  const post_m = s.postDiameter / 1000, bar_m = s.barDiameter / 1000;
  const depth_m = s.rigDepth / 1000, bay_m = s.bayWidth / 1000;
  const h_m = s.frameHeight / 1000;

  const parts = [];
  const postCount = (s.bays + 1) * 2;
  parts.push({ what: `Posts (${postCount} × ${h_m.toFixed(2)} m)`, kg: tube(post_m, POST_WALL, postCount * h_m) });

  const railLen = 2 * (s.bays * bay_m);
  parts.push({ what: "Top rails", kg: tube(post_m, POST_WALL, railLen) });

  if (s.pullUpBars) {
    const n = s.bays >= 2 ? 2 : 1;
    parts.push({ what: `Pull-up bars (${n})`, kg: tube(bar_m, BAR_WALL, n * depth_m) });
  }
  if (s.monkeyBars) {
    const n = calisthenicsRungCount(s);
    parts.push({ what: `Monkey bar rungs (${n})`, kg: tube(bar_m, BAR_WALL, n * depth_m) });
  }
  if (s.dipBars) parts.push({ what: "Dip bars (2)", kg: tube(bar_m, BAR_WALL, 2 * bay_m) });
  if (s.lowBar) parts.push({ what: "Low bar", kg: tube(bar_m, BAR_WALL, depth_m) });

  // Base plates, bolts, the welds — real and not worth modelling one by one.
  const steel = parts.reduce((t, p) => t + p.kg, 0);
  parts.push({ what: "Plates and fixings", kg: steel * 0.12 });

  const total = parts.reduce((t, p) => t + p.kg, 0);
  const fp = calisthenicsFootprint(s);
  return {
    parts,
    total_kg: total,
    area_m2: fp.length_m * fp.width_m,
    perM2_kg: total / Math.max(1, fp.length_m * fp.width_m),
  };
}

function round2(v) { return Math.round(v * 100) / 100; }

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * Plan and elevation together, because neither alone says what this is: in plan
 * a rig is two rows of dots, and in elevation you cannot see how deep it is.
 */
function drawCalisthenicsPreview(svg, isDark) {
  if (!svg) return;
  const s = calisthenicsState, rig = calisthenicsRig(s), fp = calisthenicsFootprint(s);

  const VW = 420, VH = 300;
  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const steel = isDark ? "#7f8794" : "#8f98a4";
  const grip = isDark ? "#d8b25a" : "#c8922e";
  const zone = isDark ? "#2f3350" : "#e6e9f2";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  // One scale for both views, so the two read as the same object.
  const usableW = VW - 80;
  const sc = Math.min(usableW / fp.length_m, 108 / Math.max(rig.height_m, 0.1));
  const rigW = rig.length_m * sc, rigH = rig.height_m * sc;
  const x0 = (VW - rigW) / 2;

  const post_px = Math.max(2, (s.postDiameter / 1000) * sc);
  const bar_px = Math.max(1.2, (s.barDiameter / 1000) * sc);

  /* Elevation, on top */
  const eBase = 150;
  let art = "";
  // The safety area, drawn behind everything as the ground it needs.
  art += `<rect x="${x0 - CALISTHENICS.safetyMarginM * sc}" y="${eBase - rigH - 10}"
                width="${fp.length_m * sc}" height="${rigH + 20}"
                fill="${zone}" fill-opacity="0.45" stroke="${dim}" stroke-width="0.6" stroke-dasharray="5 4"/>`;
  art += `<line x1="${x0 - CALISTHENICS.safetyMarginM * sc}" y1="${eBase}" x2="${x0 + rigW + CALISTHENICS.safetyMarginM * sc}" y2="${eBase}" stroke="${ink}" stroke-width="1"/>`;

  // Posts
  for (let i = 0; i <= s.bays; i++) {
    const px = x0 + (i * s.bayWidth / 1000) * sc;
    art += `<rect x="${px}" y="${eBase - rigH}" width="${post_px}" height="${rigH}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
  }
  // Top rail
  art += `<rect x="${x0}" y="${eBase - rigH}" width="${rigW}" height="${post_px}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;

  // Monkey bar rungs, over the middle bays
  if (s.monkeyBars) {
    const startBay = s.bays >= 3 ? 1 : 0;
    const from = x0 + (startBay * s.bayWidth / 1000) * sc;
    const span = (calisthenicsMonkeyBays(s) * s.bayWidth / 1000) * sc;
    const n = calisthenicsRungCount(s);
    for (let i = 0; i < n; i++) {
      const px = from + (n > 1 ? (i / (n - 1)) * span : span / 2);
      art += `<circle cx="${px}" cy="${eBase - rigH + post_px + bar_px}" r="${bar_px / 2}" fill="${grip}"/>`;
    }
  }
  // Pull-up bars at the end bays, seen end-on in elevation
  if (s.pullUpBars) {
    const y = eBase - (s.pullUpHeight / 1000) * sc;
    const ends = s.bays >= 2 ? [0, s.bays - 1] : [0];
    ends.forEach(b => {
      const px = x0 + ((b + 0.5) * s.bayWidth / 1000) * sc;
      art += `<circle cx="${px}" cy="${y}" r="${bar_px}" fill="${grip}" stroke="${ink}" stroke-width="0.4"/>`;
    });
  }
  if (s.dipBars) {
    const y = eBase - (s.dipHeight / 1000) * sc;
    const b = s.bays >= 3 ? 1 : 0;
    art += `<rect x="${x0 + (b * s.bayWidth / 1000) * sc}" y="${y}" width="${(s.bayWidth / 1000) * sc}" height="${bar_px}" fill="${grip}"/>`;
  }
  if (s.lowBar) {
    const y = eBase - (s.lowBarHeight / 1000) * sc;
    const px = x0 + ((s.bays - 0.5) * s.bayWidth / 1000) * sc;
    art += `<circle cx="${px}" cy="${y}" r="${bar_px}" fill="${grip}" stroke="${ink}" stroke-width="0.4"/>`;
  }

  /* Plan, below */
  const pTop = 200;
  const depth_px = rig.width_m * sc;
  art += `<rect x="${x0 - CALISTHENICS.safetyMarginM * sc}" y="${pTop - CALISTHENICS.safetyMarginM * sc}"
                width="${fp.length_m * sc}" height="${fp.width_m * sc}"
                fill="${zone}" fill-opacity="0.45" stroke="${dim}" stroke-width="0.6" stroke-dasharray="5 4"/>`;
  art += `<rect x="${x0}" y="${pTop}" width="${rigW}" height="${depth_px}" fill="none" stroke="${ink}" stroke-width="0.7" stroke-dasharray="3 3"/>`;
  for (let i = 0; i <= s.bays; i++) {
    const px = x0 + (i * s.bayWidth / 1000) * sc;
    [pTop, pTop + depth_px].forEach(py => {
      art += `<circle cx="${px + post_px / 2}" cy="${py}" r="${Math.max(1.5, post_px / 2)}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
    });
  }
  if (s.monkeyBars) {
    const startBay = s.bays >= 3 ? 1 : 0;
    const from = x0 + (startBay * s.bayWidth / 1000) * sc;
    const span = (calisthenicsMonkeyBays(s) * s.bayWidth / 1000) * sc;
    const n = calisthenicsRungCount(s);
    for (let i = 0; i < n; i++) {
      const px = from + (n > 1 ? (i / (n - 1)) * span : span / 2) + post_px / 2;
      art += `<line x1="${px}" y1="${pTop}" x2="${px}" y2="${pTop + depth_px}" stroke="${grip}" stroke-width="${bar_px}"/>`;
    }
  }

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    <text x="${VW / 2}" y="20" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Elevation</text>
    <text x="${VW / 2}" y="${pTop - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" ${font}>Plan</text>
    ${art}
    <text x="${VW / 2}" y="${VH - 22}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Rig ${rig.length_m} × ${rig.width_m} m · ${rig.height_m} m high · ${s.bays} bays</text>
    <text x="${VW / 2}" y="${VH - 8}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Dashed: ${CALISTHENICS.safetyMarginM} m safety area (${CALISTHENICS.norm}) — ${fp.length_m} × ${fp.width_m} m in all</text>`;
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function calisthenicsPanelHtml() {
  const s = calisthenicsState, rig = calisthenicsRig(), fp = calisthenicsFootprint(), w = calisthenicsWeight();
  const kg = n => Math.round(n).toLocaleString("en-US");

  const input = ([key, label, unit, step, hint]) => `
    <tr>
      <td>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</td>
      <td><input type="number" step="${step}" min="${key === "bays" ? 1 : 0}"
                 data-calisthenics="${escapeHtml(key)}" value="${escapeHtml(s[key])}">
          <small>${escapeHtml(unit)}</small></td>
    </tr>`;

  const toggle = ([key, label, , hint]) => `
    <label class="planter-toggle"><span>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</span>
      <span class="planter-yn">
        <button type="button" data-calisthenics-toggle="${escapeHtml(key)}" data-val="1" class="${s[key] ? "on" : ""}">Yes</button>
        <button type="button" data-calisthenics-toggle="${escapeHtml(key)}" data-val="0" class="${s[key] ? "" : "on"}">No</button>
      </span>
    </label>`;

  return `
    <div class="section">
      <label>The rig</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${rig.length_m} × ${rig.width_m} m</div><div class="lbl">Rig itself</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">With safety area</div></div>
        <div class="dim-card"><div class="val">${rig.height_m} m</div><div class="lbl">Frame height</div></div>
        <div class="dim-card"><div class="val">${s.bays}</div><div class="lbl">Bays</div></div>
      </div>
      <p class="hint">Length follows from the bays — ${s.bays} × ${rig.bay_m} m. A bay is what the rig is built and priced in.</p>
    </div>

    <div class="section">
      <label>What is on it</label>
      ${CALISTHENICS_TOGGLES.map(toggle).join("")}
      ${s.monkeyBars ? `<p class="hint">${calisthenicsRungCount()} rungs over ${calisthenicsMonkeyBays()} bay(s), at ${s.rungSpacing} mm.</p>` : ""}
    </div>

    <div class="section">
      <label>Dimensions</label>
      <table class="planter-table"><tbody>${CALISTHENICS_INPUTS.map(input).join("")}</tbody></table>
      <button type="button" class="btn-link" data-calisthenics-reset>Reset to the defaults</button>
    </div>

    <div class="section">
      <label>On the deck</label>
      <table class="planter-table">
        <tbody>
          ${w.parts.map(p => `<tr><td>${escapeHtml(p.what)}</td><td>${kg(p.kg)} kg</td></tr>`).join("")}
          <tr class="planter-group"><td>Total</td><td>${kg(w.total_kg)} kg</td></tr>
        </tbody>
      </table>
      <p class="hint">Steel tube, not solid bar — ${kg(w.perM2_kg)} kg/m² over the safety area. Estimated, from the parts.</p>
    </div>

    <div class="section">
      <label>${escapeHtml(CALISTHENICS.norm)}</label>
      <p class="hint">${escapeHtml(CALISTHENICS.normTitle)}. The ${CALISTHENICS.safetyMarginM} m clear area around the rig is carried
         separately from the rig itself, because it is what decides whether this fits. Reference figure — a real
         installation is signed off against the standard, not against this panel.</p>
    </div>`;
}

function syncCalisthenicsPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host || activityId !== "calisthenics") return false;
  host.innerHTML = calisthenicsPanelHtml();
  return true;
}

/** The safety area is the footprint: a rig you cannot fall off safely is not placed. */
function calisthenicsApplyFootprint() {
  if (typeof state === "undefined" || state.activityId !== "calisthenics") return;
  const fp = calisthenicsFootprint();
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

function calisthenicsRefresh() {
  calisthenicsApplyFootprint();
  syncCalisthenicsPanel("calisthenics");
  drawCalisthenicsPreview(document.getElementById("field"),
                          typeof isDarkMode === "function" && isDarkMode());
}

/* ── What a placed rig carries ───────────────────────────────────────────── */

function calisthenicsPayload(s = calisthenicsState) {
  const rig = calisthenicsRig(s), fp = calisthenicsFootprint(s), w = calisthenicsWeight(s);
  return {
    bays: s.bays,
    bay_width_m: s.bayWidth / 1000,
    rig_depth_m: s.rigDepth / 1000,
    frame_height_m: s.frameHeight / 1000,
    pull_up_height_m: s.pullUpHeight / 1000,
    post_diameter_m: s.postDiameter / 1000,
    bar_diameter_m: s.barDiameter / 1000,
    rung_spacing_m: s.rungSpacing / 1000,
    dip_height_m: s.dipHeight / 1000,
    dip_spacing_m: s.dipSpacing / 1000,
    low_bar_height_m: s.lowBarHeight / 1000,

    monkey_bars: !!s.monkeyBars,
    pull_up_bars: !!s.pullUpBars,
    dip_bars: !!s.dipBars,
    low_bar: !!s.lowBar,
    monkey_bays: calisthenicsMonkeyBays(s),
    rung_count: calisthenicsRungCount(s),

    rig_length_m: rig.length_m,
    rig_width_m: rig.width_m,
    length_m: fp.length_m,
    width_m: fp.width_m,
    safety_margin_m: CALISTHENICS.safetyMarginM,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    source: `${CALISTHENICS.norm} — ${CALISTHENICS.normTitle}`,
  };
}

/* ── Listeners ───────────────────────────────────────────────────────────── */

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.calisthenics == null) return;
  const key = t.dataset.calisthenics;
  let n = Number(t.value);
  if (!Number.isFinite(n) || n < 0) return;
  if (key === "bays") n = Math.max(1, Math.round(n));
  calisthenicsState[key] = n;
  calisthenicsSave();
  calisthenicsRefresh();
});

document.addEventListener("click", e => {
  if (typeof state === "undefined" || state.activityId !== "calisthenics") return;

  const tg = e.target.closest && e.target.closest("[data-calisthenics-toggle]");
  if (tg) {
    calisthenicsState[tg.dataset.calisthenicsToggle] = tg.dataset.val === "1";
    calisthenicsSave();
    calisthenicsRefresh();
    return;
  }
  if (e.target.closest && e.target.closest("[data-calisthenics-reset]")) {
    Object.assign(calisthenicsState, CALISTHENICS_DEFAULTS);
    calisthenicsSave();
    calisthenicsRefresh();
  }
});
