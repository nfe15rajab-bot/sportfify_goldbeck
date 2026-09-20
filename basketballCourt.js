/**
 * basketballCourt.js — a basketball court, specified rather than sized
 *
 * Same standard as padel, different shape of problem. A padel court is an
 * enclosure and its value in 3D is the glass box. A basketball court is a flat
 * surface, and almost everything worth drawing is a line on it: the key, the
 * three-point arc with its straight corners, the centre circle, the no-charge
 * semicircle. In 2D the markings ARE the court. In 3D there are exactly two
 * objects — the hoops.
 *
 * ── Sources ──
 * FIBA court dimensions (playing area and markings):
 *   https://opensourcesports.io/rules/basketball-fiba/playing-area-the-court
 *   https://nz.basketball/wp-content/uploads/2020/02/FIBA-Basketball-Court-Dimensions.pdf
 * Corner three-point distance and key dimensions cross-checked against:
 *   https://en.wikipedia.org/wiki/Basketball_court
 *
 * ── The figures reconcile, which is how you know they are right ──
 * The free-throw line is quoted both as 5.80 m from the endline and as 4.60 m
 * from the point below the backboard. Both are true: the backboard face sits
 * 1.20 m inside the endline. The rim centre is 0.375 m further out again —
 * 1.575 m from the endline — and the corner straights at 0.90 m from the
 * sideline meet the 6.75 m arc at exactly 2.99 m from the endline, which is
 * the figure FIBA prints. Every number checks against every other one.
 */

const BASKETBALL = {
  /* The FIBA playing court. The app's own "mini" and "competition" variants
     are a reduced court and a court-plus-runoff respectively — see
     basketballVariantNote(). */
  court: { length_m: 28, width_m: 15 },

  lineWidth_m: 0.05,

  centreCircleRadius_m: 1.80,

  /* The key, rectangular since 2010. Measured from the inner edge of the
     endline to the outer edge of the free-throw line. */
  key: { width_m: 4.90, depth_m: 5.80 },
  freeThrowCircleRadius_m: 1.80,

  /* The basket. Everything at this end is measured from it. */
  basket: {
    centreFromEndline_m: 1.575,
    rimHeight_m: 3.05,
    rimInnerDiameter_m: 0.45,
    backboardFaceFromEndline_m: 1.20,
    backboardWidth_m: 1.80,
    backboardHeight_m: 1.05,
    backboardLowerEdge_m: 2.90,
  },

  threePoint: {
    arcRadius_m: 6.75,          // from the centre of the basket
    cornerFromSideline_m: 0.90, // the straight sections
  },

  noChargeRadius_m: 1.25,

  /* Clear height above the court — FIBA Level 1. On a roof this is the
     constraint that decides whether anything can stand near it. */
  clearHeight: { minimum_m: 7.0 },

  /* Free zone around the playing court. */
  runoff_m: 2.0,
};

/* ── The choices that are genuinely a choice ─────────────────────────────── */
const BASKETBALL_OPTIONS = {
  variant: {
    label: "Court size",
    values: {
      standard:    { label: "FIBA full court — 28 × 15 m", note: "The regulation playing court." },
      mini:        { label: "Reduced — 22 × 13 m", note: "Training and school courts. Markings scale with it." },
      competition: { label: "Competition area — 34 × 19 m", note: "The 28 × 15 court plus its 2 m free zone all round." },
    },
  },
  hoops: {
    label: "Baskets",
    values: {
      two: { label: "Two — full court", note: "A basket at each end." },
      one: { label: "One — half court", note: "The usual choice where space is short." },
    },
  },
  mounting: {
    label: "Basket mounting",
    values: {
      // You cannot dig a foundation on a roof, so this is a real decision
      // and the weight difference between the two is large.
      ballasted: { label: "Ballasted, freestanding", note: "No fixing to the deck. The ballast is the weight.", kgEach: 900 },
      bolted:    { label: "Bolted to the structure", note: "Lighter, but it has to land on something that can take it.", kgEach: 260 },
    },
  },
  surface: {
    label: "Surface",
    values: {
      acrylic:      { label: "Acrylic hard court", note: "Painted acrylic over a bound base. The outdoor default.", kg_m2: 6 },
      polyurethane: { label: "Poured polyurethane", note: "Seamless, more forgiving underfoot, more expensive.", kg_m2: 8 },
      tiles:        { label: "Modular tiles", note: "Clipped polypropylene. Drains, and lifts for access.", kg_m2: 5 },
    },
  },
  courtColour: {
    label: "Court colour",
    values: {
      blue:       { label: "Blue",       hex: "#2f6fb5" },
      green:      { label: "Green",      hex: "#3f8f52" },
      terracotta: { label: "Terracotta", hex: "#b5613a" },
      grey:       { label: "Grey",       hex: "#6d737c" },
    },
  },
  keyColour: {
    label: "Key colour",
    values: {
      // A contrasting key is the convention, and reading as one colour would
      // lose the thing that makes a basketball court recognisable at a glance.
      contrast:  { label: "Contrasting", note: "The usual: a different colour inside the key." },
      matching:  { label: "Same as court", note: "Markings only, no colour block." },
    },
  },
};

const basketballState = {
  variant: "standard",
  hoops: "two",
  mounting: "ballasted",
  surface: "acrylic",
  courtColour: "blue",
  keyColour: "contrast",
};

function basketballDims(state = basketballState) {
  const v = (typeof FIELDS !== "undefined" && FIELDS.basketball?.[state.variant]) || null;
  if (v) return { length_m: v.l, width_m: v.w, norm: v.norm, clearHeight_m: v.h, runoff_m: v.runoff };
  return { length_m: BASKETBALL.court.length_m, width_m: BASKETBALL.court.width_m,
           norm: "FIBA", clearHeight_m: BASKETBALL.clearHeight.minimum_m, runoff_m: BASKETBALL.runoff_m };
}

/**
 * What the chosen variant actually is.
 *
 * Only "standard" is the FIBA playing court. The other two are a reduced court
 * and the full competition area — and the markings mean different things in
 * each, so saying which is not pedantry.
 */
function basketballVariantNote(state = basketballState) {
  const d = basketballDims(state);
  if (state.variant === "standard") return "FIBA regulation playing court.";
  if (state.variant === "competition")
    return `${d.length_m} × ${d.width_m} m is the 28 × 15 m court plus its 2 m free zone — ` +
           `the markings below are the court inside it.`;
  return `${d.length_m} × ${d.width_m} m is a reduced court. Markings are scaled from the FIBA layout ` +
         `and are not regulation.`;
}

/** The playing court inside whatever area the variant describes. */
function basketballPlayArea(state = basketballState) {
  const d = basketballDims(state);
  if (state.variant === "competition") return { length_m: 28, width_m: 15, insetX_m: 3, insetY_m: 2 };
  return { length_m: d.length_m, width_m: d.width_m, insetX_m: 0, insetY_m: 0 };
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

function basketballWeight(state = basketballState) {
  const d = basketballDims(state);
  const area = d.length_m * d.width_m;
  const perM2 = BASKETBALL_OPTIONS.surface.values[state.surface]?.kg_m2 ?? 6;
  const hoopCount = state.hoops === "one" ? 1 : 2;
  const kgEach = BASKETBALL_OPTIONS.mounting.values[state.mounting]?.kgEach ?? 900;

  const parts = [
    { what: "Playing surface", kg: area * perM2 },
    { what: `Baskets (${hoopCount})`, kg: hoopCount * kgEach },
  ];
  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return { parts, total_kg, area_m2: area, perM2_kg: total_kg / area, hoopCount, kgEach };
}

/* ── Appearance ──────────────────────────────────────────────────────────── */

function basketballAppearance(state = basketballState) {
  const picked = BASKETBALL_OPTIONS.courtColour.values[state.courtColour]?.hex || "#2f6fb5";
  const mix = (hex, t) => (typeof mixToGrey === "function" ? mixToGrey(hex, t) : hex);
  const sh = (hex, t) => (typeof shade === "function" ? shade(hex, t) : hex);
  switch (state.surface) {
    case "tiles":
      // Modular tiles read as a grid, because they are one.
      return { base: mix(picked, 0.08), texture: "tiles", accent: sh(picked, -0.22) };
    case "polyurethane":
      return { base: mix(picked, -0.08), texture: "sheen", accent: sh(picked, 0.10) };
    case "acrylic":
    default:
      return { base: picked, texture: "flat", accent: sh(picked, -0.14) };
  }
}

function basketballKeyFill(state = basketballState) {
  const a = basketballAppearance(state);
  if (state.keyColour === "matching") return null;
  // A contrasting key, warmer and lighter than the court around it.
  return typeof shade === "function" ? shade(a.base, 0.34) : "#cccccc";
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * The court and every FIBA marking, at any scale.
 *
 * Laid out with the long axis along X, origin at the top-left of the area the
 * variant describes — so the caller places it exactly like the padel renderer.
 */
function basketballCourtSvg(x, y, w, h, state = basketballState, detail = "full", isDark = false) {
  const area = basketballDims(state);
  const play = basketballPlayArea(state);
  const s = w / area.length_m;                 // px per metre; the court is drawn to scale
  const a = basketballAppearance(state);
  const line = "#ffffff";
  const lw = Math.max(0.6, BASKETBALL.lineWidth_m * s);

  // Playing court origin inside the drawn area
  const px = x + play.insetX_m * s;
  const py = y + play.insetY_m * s;
  const pw = play.length_m * s;
  const ph = play.width_m * s;

  // Markings scale on a reduced court: a 22 m court with a regulation key
  // would be a different game, and the app should not pretend otherwise.
  const k = state.variant === "mini" ? play.length_m / BASKETBALL.court.length_m : 1;
  const M = m => m * k * s;

  const fillId = `bbSurf_${Math.random().toString(36).slice(2, 8)}`;
  let out = "";

  // ── Surface ──
  out += `<defs>${basketballSurfaceDefs(fillId, state, s)}</defs>`;
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${fillId})"/>`;
  if (play.insetX_m > 0) {
    // The free zone reads as part of the court but outside the lines.
    out += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}"
                  fill="${a.accent}" fill-opacity="0.18"/>`;
  }

  const midY = py + ph / 2;
  const keyFill = basketballKeyFill(state);

  // ── Per end: key, free-throw circle, three-point line, no-charge arc ──
  [0, 1].forEach(end => {
    const hoops = state.hoops === "one" ? [0] : [0, 1];
    if (!hoops.includes(end)) return;

    const dir = end === 0 ? 1 : -1;                  // into the court from this endline
    const endX = end === 0 ? px : px + pw;
    const basketX = endX + dir * M(BASKETBALL.basket.centreFromEndline_m);
    const ftX = endX + dir * M(BASKETBALL.key.depth_m);
    const keyHalf = M(BASKETBALL.key.width_m) / 2;

    // Key
    if (keyFill) {
      out += `<rect x="${Math.min(endX, ftX)}" y="${midY - keyHalf}"
                    width="${Math.abs(ftX - endX)}" height="${keyHalf * 2}"
                    fill="${keyFill}" fill-opacity="0.55"/>`;
    }
    out += `<rect x="${Math.min(endX, ftX)}" y="${midY - keyHalf}"
                  width="${Math.abs(ftX - endX)}" height="${keyHalf * 2}"
                  fill="none" stroke="${line}" stroke-width="${lw}"/>`;

    // Free-throw circle — solid on the court side, dashed inside the key.
    const ftR = M(BASKETBALL.freeThrowCircleRadius_m);
    out += arcPath(ftX, midY, ftR, dir, line, lw, false);
    if (detail === "full") out += arcPath(ftX, midY, ftR, -dir, line, lw, true);

    // Three-point line: straights at 0.90 m from each sideline, meeting the
    // 6.75 m arc. Where they meet is not chosen — it falls out of the geometry.
    const tpR = M(BASKETBALL.threePoint.arcRadius_m);
    const cornerY = M(play.width_m / 2 - BASKETBALL.threePoint.cornerFromSideline_m);
    const dx = Math.sqrt(Math.max(0, tpR * tpR - cornerY * cornerY));
    const junctionX = basketX + dir * dx;
    [-1, 1].forEach(sy => {
      out += `<line x1="${endX}" y1="${midY + sy * cornerY}" x2="${junctionX}" y2="${midY + sy * cornerY}"
                    stroke="${line}" stroke-width="${lw}"/>`;
    });
    const a0 = Math.atan2(-cornerY, dir * dx), a1 = Math.atan2(cornerY, dir * dx);
    out += `<path d="M ${junctionX} ${midY - cornerY}
                     A ${tpR} ${tpR} 0 0 ${dir > 0 ? 1 : 0} ${junctionX} ${midY + cornerY}"
                  fill="none" stroke="${line}" stroke-width="${lw}"/>`;

    // No-charge semicircle under the basket
    if (detail === "full") {
      out += arcPath(basketX, midY, M(BASKETBALL.noChargeRadius_m), dir, line, lw, false);
      // The ring itself, so the basket is visible in plan.
      out += `<circle cx="${basketX}" cy="${midY}" r="${M(BASKETBALL.basket.rimInnerDiameter_m / 2)}"
                      fill="none" stroke="${line}" stroke-width="${lw}"/>`;
      // Backboard, as the line it is in plan.
      const bbX = endX + dir * M(BASKETBALL.basket.backboardFaceFromEndline_m);
      const bbHalf = M(BASKETBALL.basket.backboardWidth_m) / 2;
      out += `<line x1="${bbX}" y1="${midY - bbHalf}" x2="${bbX}" y2="${midY + bbHalf}"
                    stroke="${line}" stroke-width="${lw * 2}"/>`;
    }
  });

  // ── Centre line and circle ──
  const cx = px + pw / 2;
  out += `<line x1="${cx}" y1="${py}" x2="${cx}" y2="${py + ph}" stroke="${line}" stroke-width="${lw}"/>`;
  out += `<circle cx="${cx}" cy="${midY}" r="${M(BASKETBALL.centreCircleRadius_m)}"
                  fill="none" stroke="${line}" stroke-width="${lw}"/>`;

  // ── Perimeter last, so it sits over everything ──
  out += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}"
                fill="none" stroke="${line}" stroke-width="${lw * 1.4}"/>`;

  return out;
}

/** A half-circle opening toward `dir` (+1 = +x). */
function arcPath(cx, cy, r, dir, stroke, lw, dashed) {
  const sweep = dir > 0 ? 1 : 0;
  return `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweep} ${cx} ${cy + r}"
                fill="none" stroke="${stroke}" stroke-width="${lw}"
                ${dashed ? `stroke-dasharray="${lw * 3},${lw * 2}"` : ""}/>`;
}

function basketballSurfaceDefs(id, state = basketballState, s = 10) {
  const a = basketballAppearance(state);
  if (a.texture === "tiles") {
    // Real tiles are ~300 mm, so the grid is drawn at that pitch.
    const step = Math.max(3, 0.3 * s);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${step}" height="${step}">
        <rect width="${step}" height="${step}" fill="${a.base}"/>
        <path d="M ${step} 0 L ${step} ${step} L 0 ${step}" fill="none"
              stroke="${a.accent}" stroke-width="0.4" stroke-opacity="0.65"/>
      </pattern>`;
  }
  if (a.texture === "sheen") {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="${a.accent}"/>
        <stop offset="0.6" stop-color="${a.base}"/>
        <stop offset="1" stop-color="${a.base}"/>
      </linearGradient>`;
  }
  return `<linearGradient id="${id}"><stop offset="0" stop-color="${a.base}"/></linearGradient>`;
}

/* ── Preview and panel ───────────────────────────────────────────────────── */

function drawBasketballPreview(svg, isDark) {
  const d = basketballDims();
  const PADDING = 46, vw = 420, vh = 260;
  const aspect = d.length_m / d.width_m;
  let fw = vw - PADDING * 2, fh = fw / aspect;
  if (fh > vh - PADDING * 2) { fh = vh - PADDING * 2; fw = fh * aspect; }
  const ox = (vw - fw) / 2, oy = (vh - fh) / 2;
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const w = basketballWeight();

  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  svg.innerHTML = `
    ${basketballCourtSvg(ox, oy, fw, fh, basketballState, "full", isDark)}
    <text x="${ox + fw / 2}" y="${oy - 16}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">${d.length_m} m</text>
    <text x="${ox - 16}" y="${oy + fh / 2}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif"
          transform="rotate(-90, ${ox - 16}, ${oy + fh / 2})">${d.width_m} m</text>
    <text x="${ox + fw / 2}" y="${oy + fh + 22}" text-anchor="middle" font-size="10" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">
      rim ${BASKETBALL.basket.rimHeight_m} m · three-point ${BASKETBALL.threePoint.arcRadius_m} m ·
      key ${BASKETBALL.key.width_m} × ${BASKETBALL.key.depth_m} m ·
      ${Math.round(w.total_kg).toLocaleString("en-US")} kg
    </text>`;
}

function basketballPanelHtml() {
  const w = basketballWeight();
  const pick = key => {
    const o = BASKETBALL_OPTIONS[key];
    const opts = Object.entries(o.values).map(([v, def]) =>
      `<option value="${v}"${basketballState[key] === v ? " selected" : ""}>${def.label}</option>`).join("");
    const note = o.values[basketballState[key]]?.note;
    return `<div class="section">
        <label>${o.label}</label>
        <select data-basketball="${key}">${opts}</select>
        ${note ? `<p class="hint">${note}</p>` : ""}
      </div>`;
  };

  return `
    <div class="section">
      <label>Specification — FIBA</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${BASKETBALL.court.length_m} × ${BASKETBALL.court.width_m} m</div><div class="lbl">Playing court</div></div>
        <div class="dim-card"><div class="val">${BASKETBALL.basket.rimHeight_m} m</div><div class="lbl">Rim height</div></div>
        <div class="dim-card"><div class="val">${BASKETBALL.threePoint.arcRadius_m} m</div><div class="lbl">Three-point arc</div></div>
        <div class="dim-card"><div class="val">${BASKETBALL.clearHeight.minimum_m} m</div><div class="lbl">Clear height needed</div></div>
      </div>
      <p class="hint">${basketballVariantNote()}</p>
    </div>
    ${pick("hoops")}
    ${pick("mounting")}
    ${pick("surface")}
    ${pick("courtColour")}
    ${pick("keyColour")}
    <div class="section">
      <label>Weight on the deck</label>
      <div class="dims">
        ${w.parts.map(p => `<div class="dim-card"><div class="val">${Math.round(p.kg).toLocaleString("en-US")}</div><div class="lbl">${p.what}, kg</div></div>`).join("")}
        <div class="dim-card"><div class="val">${Math.round(w.perM2_kg)} kg/m²</div><div class="lbl">${Math.round(w.total_kg).toLocaleString("en-US")} kg total</div></div>
      </div>
      <p class="hint">
        Estimated. Ballasted baskets carry their weight in the base — ${w.kgEach} kg each — because a roof
        has nothing to bolt into. That is the choice, not a detail.
      </p>
    </div>`;
}

function syncBasketballPanel(sport) {
  const host = document.getElementById("sport-spec-panel");
  if (!host) return;
  const isBasketball = sport === "basketball";
  host.innerHTML = isBasketball ? basketballPanelHtml() : "";
  if (!isBasketball) return;

  host.querySelectorAll("[data-basketball]").forEach(sel => {
    sel.addEventListener("change", e => {
      basketballState[e.target.dataset.basketball] = e.target.value;
      syncBasketballPanel(sport);
      if (typeof drawField === "function") drawField(sport, basketballState.variant, 0, isDarkMode());
    });
  });
}

/** What travels with a placed court. */
function basketballPlacementPayload(state = basketballState) {
  const d = basketballDims(state), w = basketballWeight(state), a = basketballAppearance(state);
  return {
    variant: state.variant,
    hoops: w.hoopCount,
    mounting: state.mounting,
    surface: state.surface,
    court_colour: state.courtColour,
    key_colour: state.keyColour,
    appearance_hex: a.base,
    key_fill_hex: basketballKeyFill(state),
    length_m: d.length_m,
    width_m: d.width_m,
    play_length_m: basketballPlayArea(state).length_m,
    play_width_m: basketballPlayArea(state).width_m,
    rim_height_m: BASKETBALL.basket.rimHeight_m,
    rim_inner_diameter_m: BASKETBALL.basket.rimInnerDiameter_m,
    basket_centre_from_endline_m: BASKETBALL.basket.centreFromEndline_m,
    backboard_face_from_endline_m: BASKETBALL.basket.backboardFaceFromEndline_m,
    backboard_width_m: BASKETBALL.basket.backboardWidth_m,
    backboard_height_m: BASKETBALL.basket.backboardHeight_m,
    backboard_lower_edge_m: BASKETBALL.basket.backboardLowerEdge_m,
    key_width_m: BASKETBALL.key.width_m,
    key_depth_m: BASKETBALL.key.depth_m,
    three_point_radius_m: BASKETBALL.threePoint.arcRadius_m,
    clear_height_min_m: BASKETBALL.clearHeight.minimum_m,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    weight_breakdown: w.parts.map(p => ({ part: p.what, kg: Math.round(p.kg) })),
    weight_basis: "estimated",
    source: "FIBA Official Basketball Rules — playing court",
  };
}

function basketballStateForItem(item) {
  const b = item?.sourceJson?.basketball;
  if (!b) return basketballState;
  return {
    variant: b.variant || "standard",
    hoops: b.hoops === 1 ? "one" : "two",
    mounting: b.mounting || "ballasted",
    surface: b.surface || "acrylic",
    courtColour: b.court_colour || "blue",
    keyColour: b.key_colour || "contrast",
  };
}

function isBasketballItem(item) {
  return item?.sourceJson?.field?.sport === "basketball" || !!item?.sourceJson?.basketball;
}
