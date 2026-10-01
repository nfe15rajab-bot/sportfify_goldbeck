/**
 * trxFrame.js — the suspension training frame
 *
 * ── What makes this a different problem ──
 * The rigs are structures you load in compression: you hang off a bar and the
 * posts push down. A suspension frame is loaded at an angle. The whole point of
 * suspension training is that you lean AWAY from the anchor, so every strap
 * pulls the beam sideways as well as down, and a frame that only resisted
 * downward load would walk across the roof.
 *
 * That is why this has a leg spread and the rigs do not. The legs splay to make
 * a base wide enough to resist the overturning, and the spread is the parameter
 * that matters most — it is also what makes the footprint bigger than the beam.
 *
 * ── Anchors, not bays ──
 * A rig is divided into bays because a bay is a place to stand. A suspension
 * frame is divided by ANCHOR POINTS, because a strap hangs from a point, and
 * two people training beside each other need their straps far enough apart not
 * to tangle. So the count here comes from the beam length and the anchor
 * spacing, and the number of people who can use it at once is the number of
 * anchors — a much more direct answer than a rig can give.
 *
 * ── The working area is a cone, not a rectangle ──
 * Someone on straps sweeps a long way back from the anchor and not very far
 * sideways. The space reserved is therefore deep and narrow per anchor, which
 * is the opposite of the CrossFit rig's shape, and it is why a frame that looks
 * small on the plan still needs a good piece of roof.
 */

const TRX = {
  norm: "DIN EN 16630",
  normTitle: "Permanently installed outdoor fitness equipment",
  // How far back a user travels from the anchor. A strap at full extension puts
  // you well behind where you started. Practical figure.
  reachDepthM: 2.4,
  // Sideways room per user, so two people on adjacent straps do not clash.
  sideMarginM: 0.75,
  source: "practical",
};

const TRX_INPUTS = [
  ["beamLength",    "Beam length",     "mm", 100, "The span the straps hang from"],
  ["frameHeight",   "Anchor height",   "mm", 50,  "Underside of the beam — straps need the drop"],
  ["legSpread",     "Leg spread",      "mm", 50,  "Base width at the ground, each end"],
  ["anchorSpacing", "Anchor spacing",  "mm", 50,  "Between strap points"],
  ["beamDiameter",  "Beam diameter",   "mm", 1,   ""],
  ["legDiameter",   "Leg diameter",    "mm", 1,   ""],
];

const TRX_TOGGLES = [
  ["aFrame",      "Splayed legs",    true,  "Angled legs resist the sideways pull; vertical posts must be bolted down"],
  ["midRail",     "Mid rail",        false, "A low bar between the legs — rows, stretches, a place to sit"],
  ["groundAnchor","Bolted to deck",  false, "Fixed down instead of free-standing — needs a structural fixing"],
];

const TRX_DEFAULTS = {
  beamLength: 3000,
  frameHeight: 2450,
  legSpread: 1200,
  anchorSpacing: 600,
  beamDiameter: 89,
  legDiameter: 76,
  aFrame: true,
  midRail: false,
  groundAnchor: false,
};

const TRX_STORAGE_KEY = "sportify-trx";

const trxState = (() => {
  const st = Object.assign({}, TRX_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(TRX_STORAGE_KEY) || "null");
    if (saved) Object.keys(st).forEach(k => { if (typeof saved[k] === typeof st[k]) st[k] = saved[k]; });
  } catch (e) { /* the defaults */ }
  return st;
})();

function trxSave() {
  try { localStorage.setItem(TRX_STORAGE_KEY, JSON.stringify(trxState)); } catch (e) { /* not kept */ }
}

/* ── What follows ────────────────────────────────────────────────────────── */

/** How many straps can hang, and therefore how many people can train at once. */
function trxAnchorCount(s = trxState) {
  const usable = Math.max(0, s.beamLength - 300);        // not right at the legs
  return Math.max(1, Math.floor(usable / Math.max(50, s.anchorSpacing)) + 1);
}

function trxFrameSize(s = trxState) {
  const beam_m = s.beamLength / 1000;
  const spread_m = s.aFrame ? s.legSpread / 1000 : s.legDiameter / 1000;
  return {
    length_m: r2(beam_m),
    width_m: r2(spread_m),
    height_m: r2(s.frameHeight / 1000),
  };
}

/**
 * The roof it takes.
 *
 * Deep, because the user travels backwards from the anchor, and it applies to
 * BOTH sides: a frame can be worked from either face, and reserving only one
 * would put the second user in somebody else's space.
 */
function trxFootprint(s = trxState) {
  const f = trxFrameSize(s);
  return {
    length_m: r2(f.length_m + TRX.sideMarginM * 2),
    width_m: r2(f.width_m + TRX.reachDepthM * 2),
  };
}

function trxWeight(s = trxState) {
  const STEEL = 7850, WALL = 0.003;
  const tube = (dia_m, len_m) => {
    const ro = dia_m / 2, ri = Math.max(0, ro - WALL);
    return Math.PI * (ro * ro - ri * ri) * len_m * STEEL;
  };

  const beam_m = s.beamLength / 1000, leg_m = s.legDiameter / 1000;
  const h_m = s.frameHeight / 1000, spread_m = s.legSpread / 1000;
  // A splayed leg is longer than the height it reaches.
  const legLen = s.aFrame ? Math.hypot(h_m, spread_m / 2) : h_m;

  const parts = [];
  parts.push({ what: "Beam", kg: tube(s.beamDiameter / 1000, beam_m) });
  parts.push({ what: `Legs (4 × ${legLen.toFixed(2)} m)`, kg: tube(leg_m, 4 * legLen) });
  if (s.midRail) parts.push({ what: "Mid rail", kg: tube(leg_m, beam_m) });
  parts.push({ what: `Anchor points (${trxAnchorCount(s)})`, kg: trxAnchorCount(s) * 0.6 });

  const steel = parts.reduce((t, p) => t + p.kg, 0);
  parts.push({ what: s.groundAnchor ? "Base plates and anchors" : "Base plates and ballast feet",
               kg: s.groundAnchor ? steel * 0.12 : steel * 0.35 });

  const total = parts.reduce((t, p) => t + p.kg, 0);
  const fp = trxFootprint(s);
  const area = Math.max(1, fp.length_m * fp.width_m);
  return { parts, total_kg: total, area_m2: fp.length_m * fp.width_m, perM2_kg: total / area };
}

function r2(v) { return Math.round(v * 100) / 100; }

/* ── Drawing ─────────────────────────────────────────────────────────────── */

function drawTrxPreview(svg, isDark) {
  if (!svg) return;
  const s = trxState, f = trxFrameSize(s), fp = trxFootprint(s);

  const VW = 420, VH = 300;
  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const steel = isDark ? "#5a6470" : "#6d7885";
  const strap = isDark ? "#d8b25a" : "#c8922e";
  const zone = isDark ? "#2f3350" : "#e6e9f2";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  // End elevation shows the splay, which is the thing to see; the long
  // elevation shows the anchors. Both, side by side, at one scale.
  const sc = Math.min((VW - 120) / (f.length_m + f.width_m + 1.2), 100 / Math.max(f.height_m, 0.1));
  const base = 132;

  let art = "";

  /* Long elevation, left */
  const lx = 40, lw = f.length_m * sc, lh = f.height_m * sc;
  const leg_px = Math.max(2, (s.legDiameter / 1000) * sc);
  const beam_px = Math.max(2.5, (s.beamDiameter / 1000) * sc);
  art += `<line x1="${lx - 10}" y1="${base}" x2="${lx + lw + 10}" y2="${base}" stroke="${ink}" stroke-width="1"/>`;
  art += `<rect x="${lx}" y="${base - lh}" width="${lw}" height="${beam_px}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
  [lx, lx + lw - leg_px].forEach(px => {
    art += `<rect x="${px}" y="${base - lh}" width="${leg_px}" height="${lh}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
  });
  // The straps, which is what the frame is for.
  const n = trxAnchorCount(s);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const px = lx + 0.15 * sc + t * Math.max(0, lw - 0.3 * sc);
    art += `<circle cx="${px}" cy="${base - lh + beam_px + 1}" r="${Math.max(1, beam_px * 0.3)}" fill="${strap}"/>`;
    art += `<path d="M ${px} ${base - lh + beam_px + 1} L ${px - 4} ${base - lh * 0.42}" stroke="${strap}" stroke-width="1" fill="none"/>`;
    art += `<path d="M ${px} ${base - lh + beam_px + 1} L ${px + 4} ${base - lh * 0.42}" stroke="${strap}" stroke-width="1" fill="none"/>`;
  }

  /* End elevation, right — the splay */
  const ex = lx + lw + 46, ew = f.width_m * sc;
  art += `<line x1="${ex - 10}" y1="${base}" x2="${ex + ew + 10}" y2="${base}" stroke="${ink}" stroke-width="1"/>`;
  const apexL = ex + ew / 2 - beam_px / 2;
  if (s.aFrame) {
    art += `<line x1="${ex}" y1="${base}" x2="${apexL + beam_px / 2}" y2="${base - lh}" stroke="${steel}" stroke-width="${leg_px}" stroke-linecap="round"/>`;
    art += `<line x1="${ex + ew}" y1="${base}" x2="${apexL + beam_px / 2}" y2="${base - lh}" stroke="${steel}" stroke-width="${leg_px}" stroke-linecap="round"/>`;
  } else {
    art += `<rect x="${apexL}" y="${base - lh}" width="${beam_px}" height="${lh}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;
  }
  art += `<circle cx="${apexL + beam_px / 2}" cy="${base - lh + beam_px / 2}" r="${beam_px * 0.7}" fill="${steel}" stroke="${ink}" stroke-width="0.5"/>`;

  /* Plan — the reach, which is the real cost */
  const pTop = 186;
  const psc = Math.min((VW - 70) / fp.length_m, 80 / fp.width_m);
  const px0 = (VW - fp.length_m * psc) / 2;
  art += `<rect x="${px0}" y="${pTop}" width="${fp.length_m * psc}" height="${fp.width_m * psc}"
                fill="${zone}" fill-opacity="0.5" stroke="${dim}" stroke-width="0.6" stroke-dasharray="5 4"/>`;
  const fy = pTop + TRX.reachDepthM * psc;
  art += `<rect x="${px0 + TRX.sideMarginM * psc}" y="${fy}" width="${f.length_m * psc}" height="${Math.max(1.5, f.width_m * psc)}"
                fill="${steel}" stroke="${ink}" stroke-width="0.6"/>`;
  // A user working each way off each anchor: deep and narrow, both faces.
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const ax = px0 + TRX.sideMarginM * psc + 0.15 * psc + t * Math.max(0, f.length_m * psc - 0.3 * psc);
    art += `<line x1="${ax}" y1="${fy}" x2="${ax}" y2="${pTop + 4}" stroke="${strap}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
    art += `<line x1="${ax}" y1="${fy}" x2="${ax}" y2="${pTop + fp.width_m * psc - 4}" stroke="${strap}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
  }

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    <text x="${lx + lw / 2}" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}" ${font}>Elevation</text>
    <text x="${ex + ew / 2}" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}" ${font}>End</text>
    <text x="${VW / 2}" y="${pTop - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}" ${font}>Plan</text>
    ${art}
    <text x="${VW / 2}" y="${VH - 22}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Frame ${f.length_m} × ${f.width_m} m · ${f.height_m} m anchor height · ${n} straps</text>
    <text x="${VW / 2}" y="${VH - 8}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Dashed: ${TRX.reachDepthM} m reach each side — ${fp.length_m} × ${fp.width_m} m in all</text>`;
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function trxPanelHtml() {
  const s = trxState, f = trxFrameSize(), fp = trxFootprint(), w = trxWeight();
  const kg = n => Math.round(n).toLocaleString("en-US");

  const input = ([key, label, unit, step, hint]) => `
    <tr>
      <td>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</td>
      <td><input type="number" step="${step}" min="0" data-trx="${escapeHtml(key)}" value="${escapeHtml(s[key])}">
          <small>${escapeHtml(unit)}</small></td>
    </tr>`;

  const toggle = ([key, label, , hint]) => `
    <label class="planter-toggle"><span>${escapeHtml(label)}${hint ? `<br><small>${escapeHtml(hint)}</small>` : ""}</span>
      <span class="planter-yn">
        <button type="button" data-trx-toggle="${escapeHtml(key)}" data-val="1" class="${s[key] ? "on" : ""}">Yes</button>
        <button type="button" data-trx-toggle="${escapeHtml(key)}" data-val="0" class="${s[key] ? "" : "on"}">No</button>
      </span>
    </label>`;

  return `
    <div class="section">
      <label>The frame</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${f.length_m} × ${f.width_m} m</div><div class="lbl">Frame itself</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">With reach</div></div>
        <div class="dim-card"><div class="val">${trxAnchorCount()}</div><div class="lbl">Straps at once</div></div>
        <div class="dim-card"><div class="val">${f.height_m} m</div><div class="lbl">Anchor height</div></div>
      </div>
      <p class="hint">${trxAnchorCount()} anchors at ${s.anchorSpacing} mm — the strap count is the number of people who can train at once.</p>
    </div>

    <div class="section">
      <label>How it stands</label>
      ${TRX_TOGGLES.map(toggle).join("")}
      <p class="hint">${s.aFrame
        ? `Splayed legs give a ${f.width_m} m base. Suspension load pulls sideways, not just down — the spread is what resists it.`
        : `<strong>Vertical posts do not resist the sideways pull on their own.</strong> Bolt this down, or splay the legs.`}</p>
      ${!s.aFrame && !s.groundAnchor
        ? `<p class="planter-warn">Vertical posts and not bolted down: this frame would tip. Turn on splayed legs or a deck fixing.</p>` : ""}
    </div>

    <div class="section">
      <label>Dimensions</label>
      <table class="planter-table"><tbody>${TRX_INPUTS.map(input).join("")}</tbody></table>
      <button type="button" class="btn-link" data-trx-reset>Reset to the defaults</button>
    </div>

    <div class="section">
      <label>On the deck</label>
      <table class="planter-table">
        <tbody>
          ${w.parts.map(p => `<tr><td>${escapeHtml(p.what)}</td><td>${kg(p.kg)} kg</td></tr>`).join("")}
          <tr class="planter-group"><td>Total</td><td>${kg(w.total_kg)} kg</td></tr>
        </tbody>
      </table>
      <p class="hint">${s.groundAnchor
        ? "Bolted down, so the feet are plates rather than ballast."
        : "Free-standing, so the feet carry ballast — that is most of the difference in this total."}</p>
    </div>

    <div class="section">
      <label>Room to work</label>
      <p class="hint">${TRX.reachDepthM} m behind the frame on <strong>each</strong> side, ${TRX.sideMarginM} m past each end.
         A strap user travels backwards away from the anchor, so the space is deep and narrow — the opposite shape to a rig's.
         Reserving one side only would put the second user in someone else's space.</p>
      <p class="hint">Practical figures, not a published clearance. ${escapeHtml(TRX.norm)} covers the equipment itself.</p>
    </div>`;
}

function syncTrxPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host || activityId !== "trx_frame") return false;
  host.innerHTML = trxPanelHtml();
  return true;
}

function trxApplyFootprint() {
  if (typeof state === "undefined" || state.activityId !== "trx_frame") return;
  const fp = trxFootprint();
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

function trxRefresh() {
  trxApplyFootprint();
  syncTrxPanel("trx_frame");
  drawTrxPreview(document.getElementById("field"),
                 typeof isDarkMode === "function" && isDarkMode());
}

/* ── Payload ─────────────────────────────────────────────────────────────── */

function trxPayload(s = trxState) {
  const f = trxFrameSize(s), fp = trxFootprint(s), w = trxWeight(s);
  return {
    beam_length_m: s.beamLength / 1000,
    frame_height_m: s.frameHeight / 1000,
    leg_spread_m: s.legSpread / 1000,
    anchor_spacing_m: s.anchorSpacing / 1000,
    beam_diameter_m: s.beamDiameter / 1000,
    leg_diameter_m: s.legDiameter / 1000,

    a_frame: !!s.aFrame,
    mid_rail: !!s.midRail,
    ground_anchor: !!s.groundAnchor,
    anchor_count: trxAnchorCount(s),

    frame_length_m: f.length_m,
    frame_width_m: f.width_m,
    length_m: fp.length_m,
    width_m: fp.width_m,
    reach_depth_m: TRX.reachDepthM,
    side_margin_m: TRX.sideMarginM,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    source: `${TRX.norm} — ${TRX.normTitle}; reach is a practical figure`,
  };
}

/* ── Listeners ───────────────────────────────────────────────────────────── */

document.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset || t.dataset.trx == null) return;
  const n = Number(t.value);
  if (!Number.isFinite(n) || n < 0) return;
  trxState[t.dataset.trx] = n;
  trxSave();
  trxRefresh();
});

document.addEventListener("click", e => {
  if (typeof state === "undefined" || state.activityId !== "trx_frame") return;

  const tg = e.target.closest && e.target.closest("[data-trx-toggle]");
  if (tg) {
    trxState[tg.dataset.trxToggle] = tg.dataset.val === "1";
    trxSave();
    trxRefresh();
    return;
  }
  if (e.target.closest && e.target.closest("[data-trx-reset]")) {
    Object.assign(trxState, TRX_DEFAULTS);
    trxSave();
    trxRefresh();
  }
});
