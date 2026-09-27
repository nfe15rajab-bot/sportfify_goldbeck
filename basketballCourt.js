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

/* ── The choices that are genuinely a choice ─────────────────────────────────
   Products, so they live in the database — same as padel's, in the same table.
   Adding a surface or a different basket mounting is a row in the Catalogue tab.

   No fallback: a built-in copy that stands in when the API is down means two
   catalogs that drift, and a court specified from the stale one. */

const BASKETBALL_OPTIONS_API = "http://localhost:5107/api/SportOptions?sport=basketball";

let BASKETBALL_OPTIONS = {};
let basketballOptionsLoaded = false;

/** API option_group -> state key, in the order the panel shows them. */
const BASKETBALL_GROUPS = [
  ["hoops",        "hoops",       "Court"],
  ["surface",      "surface",     "Surface"],
  ["court_colour", "courtColour", "Court colour"],
  // "basket" is a group with one row — the ballasted freestanding basket. It
  // carries the weight and the price but is not offered as a choice, because a
  // choice of one is not a choice. If a second is ever added, the picker
  // appears on its own.
  ["basket",       "basket",      "Basket"],
];

async function loadBasketballOptions() {
  const res = await fetch(BASKETBALL_OPTIONS_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sport options API returned ${res.status}`);
  const rows = await res.json();

  BASKETBALL_OPTIONS = {};
  BASKETBALL_GROUPS.forEach(([apiGroup, stateKey, label]) => {
    const values = {};
    rows.filter(r => r.optionGroup === apiGroup)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .forEach(r => {
          values[r.key] = {
            label: r.label,
            note: r.note || "",
            hex: r.colourHex || null,
            texture: r.textureHint || null,
            kg_m2: r.weightKgM2 ?? null,
            kgEach: r.weightKgEach ?? null,
            price: r.priceValue ?? null,
            price_unit: r.priceUnit || null,
            price_quoted: !!r.priceIsQuoted,
            cost_group: r.costGroupDin276 || null,
          };
        });
    if (Object.keys(values).length) BASKETBALL_OPTIONS[stateKey] = { label, values };
  });

  basketballOptionsLoaded = true;
  Object.entries(BASKETBALL_OPTIONS).forEach(([key, group]) => {
    if (!group.values[basketballState[key]]) basketballState[key] = Object.keys(group.values)[0];
  });
  return BASKETBALL_OPTIONS;
}

/* The size variant stays here: it is not a product, it is which court this is,
   and it already comes from the sports database through FIELDS. */
const BASKETBALL_VARIANT_NOTE = {
  standard:    "FIBA regulation playing court.",
  mini:        "reduced",
  competition: "with free zone",
};

const basketballState = {
  variant: "standard",
  hoops: "two",
  surface: "acrylic",
  courtColour: "blue",
  basket: "ballasted",
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
  const half = state.hoops === "one" ? "Half of a" : "";
  if (state.variant === "standard")
    return half ? "Half a FIBA regulation court — 14 × 15 m with one basket."
                : "FIBA regulation playing court.";
  if (state.variant === "competition")
    return `${d.length_m} × ${d.width_m} m is the 28 × 15 m court plus its 2 m free zone — ` +
           `the markings below are the court inside it.`;
  return `${d.length_m} × ${d.width_m} m is a reduced court. Markings are scaled from the FIBA layout ` +
         `and are not regulation.`;
}

/**
 * The playing court inside whatever area the variant describes.
 *
 * A half court is genuinely half a court — 14 m deep with one basket — not a
 * full court with a basket left off. Removing the markings at one end would
 * have described a court twice the size of the thing being built, and the roof
 * would have lost 14 m of space that was never needed.
 */
function basketballPlayArea(state = basketballState) {
  const d = basketballDims(state);
  const half = state.hoops === "one";
  if (state.variant === "competition") {
    return half
      ? { length_m: 14, width_m: 15, insetX_m: 3, insetY_m: 2, half: true }
      : { length_m: 28, width_m: 15, insetX_m: 3, insetY_m: 2, half: false };
  }
  return half
    ? { length_m: d.length_m / 2, width_m: d.width_m, insetX_m: 0, insetY_m: 0, half: true }
    : { length_m: d.length_m, width_m: d.width_m, insetX_m: 0, insetY_m: 0, half: false };
}

/** The footprint a half court actually takes on the roof. */
function basketballFootprint(state = basketballState) {
  const d = basketballDims(state);
  const play = basketballPlayArea(state);
  return {
    length_m: play.length_m + play.insetX_m * 2,
    width_m: d.width_m,
  };
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

function basketballWeight(state = basketballState) {
  const fp = basketballFootprint(state);
  const area = fp.length_m * fp.width_m;
  const perM2 = BASKETBALL_OPTIONS.surface?.values?.[state.surface]?.kg_m2 ?? 0;
  const hoopCount = state.hoops === "one" ? 1 : 2;
  const kgEach = BASKETBALL_OPTIONS.basket?.values?.[state.basket]?.kgEach ?? 0;

  const parts = [
    { what: "Playing surface", kg: area * perM2 },
    { what: `Baskets (${hoopCount})`, kg: hoopCount * kgEach },
  ];
  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return { parts, total_kg, area_m2: area, perM2_kg: total_kg / area, hoopCount, kgEach };
}

/* ── Appearance ──────────────────────────────────────────────────────────── */

function basketballAppearance(state = basketballState) {
  const picked = BASKETBALL_OPTIONS.courtColour?.values?.[state.courtColour]?.hex || "#2f6fb5";
  const mix = (hex, t) => (typeof mixToGrey === "function" ? mixToGrey(hex, t) : hex);
  const sh = (hex, t) => (typeof shade === "function" ? shade(hex, t) : hex);
  // The texture is a property of the product, from the catalog.
  switch (BASKETBALL_OPTIONS.surface?.values?.[state.surface]?.texture || state.surface) {
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
  const area = basketballFootprint(state);
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
  // Markings scale on a reduced court but NOT on a half court: half a
  // regulation court still has a regulation key.
  const fullLength = play.half ? play.length_m * 2 : play.length_m;
  const k = state.variant === "mini" ? fullLength / BASKETBALL.court.length_m : 1;
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
    // A half court has one end, and it is the one with the basket.
    if (play.half && end === 1) return;

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
  // On a half court the centre line IS the open edge, and the centre circle is
  // the half of it that falls inside — which is how a half court is painted.
  if (play.half) {
    const edge = px + pw;
    out += `<path d="M ${edge} ${midY - M(BASKETBALL.centreCircleRadius_m)}
                     A ${M(BASKETBALL.centreCircleRadius_m)} ${M(BASKETBALL.centreCircleRadius_m)} 0 0 0
                       ${edge} ${midY + M(BASKETBALL.centreCircleRadius_m)}"
                  fill="none" stroke="${line}" stroke-width="${lw}"/>`;
  } else {
    const cx = px + pw / 2;
    out += `<line x1="${cx}" y1="${py}" x2="${cx}" y2="${py + ph}" stroke="${line}" stroke-width="${lw}"/>`;
    out += `<circle cx="${cx}" cy="${midY}" r="${M(BASKETBALL.centreCircleRadius_m)}"
                    fill="none" stroke="${line}" stroke-width="${lw}"/>`;
  }

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
  // The footprint, not the full court — a half court is half the size, and
  // sizing the preview from the full one drew it at twice the scale.
  const d = basketballFootprint();
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
    ${typeof archDimSvg === "function" ? archDimSvg("top", ox, ox + fw, oy, 12, `${d.length_m} m`, dim) + archDimSvg("left", oy, oy + fh, ox, 12, `${d.width_m} m`, dim) : ""}
    <text x="${ox + fw / 2}" y="${Math.min(vh - 6, oy + fh + 22)}" text-anchor="middle" font-size="10" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">
      ${Math.round(w.total_kg).toLocaleString("en-US")} kg on the deck · ${w.hoopCount} basket${w.hoopCount > 1 ? "s" : ""}
    </text>`;
}

function basketballPanelHtml() {
  const w = basketballWeight();
  const fp = basketballFootprint();
  const play = basketballPlayArea();

  // A picker with one option is not a choice. The basket group has one row, so
  // it shows as a stated fact instead — and if a second is ever added to the
  // catalog, the picker appears on its own with nothing changed here.
  const pick = key => {
    const o = BASKETBALL_OPTIONS[key];
    if (!o) return "";
    const keys = Object.keys(o.values);
    if (keys.length <= 1) {
      const only = o.values[keys[0]];
      return only ? `<p class="hint"><strong>${escapeHtml(o.label)}:</strong> ${escapeHtml(only.label)}${only.note ? ` — ${escapeHtml(only.note)}` : ""}</p>` : "";
    }
    const opts = keys.map(v =>
      `<option value="${v}"${basketballState[key] === v ? " selected" : ""}>${escapeHtml(o.values[v].label)}</option>`).join("");
    const note = o.values[basketballState[key]]?.note;
    return `<div class="section">
        <label>${escapeHtml(o.label)}</label>
        <select data-basketball="${key}">${opts}</select>
        ${note ? `<p class="hint">${note}</p>` : ""}
      </div>`;
  };

  return `
    <!-- This court first, because it is the thing being configured. The FIBA
         figures come after it and read as a reference, not as a description of
         what is on screen — showing 28 x 15 above a 22 x 13 court made the
         standard look like the current selection. -->
    <div class="section">
      <label>This court</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${play.length_m} × ${play.width_m} m</div><div class="lbl">Playing area</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">Footprint on the roof</div></div>
        <div class="dim-card"><div class="val">${w.hoopCount}</div><div class="lbl">Basket${w.hoopCount > 1 ? "s" : ""}</div></div>
        <div class="dim-card"><div class="val">${Math.round(w.total_kg).toLocaleString("en-US")} kg</div><div class="lbl">${Math.round(w.perM2_kg)} kg/m² on the deck</div></div>
      </div>
      <p class="hint">${basketballVariantNote()}</p>
    </div>

    ${BASKETBALL_GROUPS.map(([, stateKey]) => pick(stateKey)).join("")}

    <div class="section">
      <p class="hint" style="opacity:.8">
        <strong>FIBA reference</strong> — regulation court ${BASKETBALL.court.length_m} × ${BASKETBALL.court.width_m} m ·
        rim ${BASKETBALL.basket.rimHeight_m} m · three-point ${BASKETBALL.threePoint.arcRadius_m} m ·
        key ${escapeHtml(BASKETBALL.key.width_m)} × ${escapeHtml(BASKETBALL.key.depth_m)} m ·
        ${BASKETBALL.clearHeight.minimum_m} m clear height needed.
        The markings above are drawn to these; only the full court matches them exactly.
      </p>
    </div>`;
}

function syncBasketballPanel(sport) {
  const host = document.getElementById("sport-spec-panel");
  if (!host) return;
  const isBasketball = sport === "basketball";

  if (isBasketball && !basketballOptionsLoaded) {
    host.innerHTML = `<div class="section"><p class="hint">Loading court options…</p></div>`;
    loadBasketballOptions()
      .then(() => { syncBasketballPanel(sport); if (typeof drawField === "function") drawField(sport, basketballState.variant, 0, isDarkMode()); })
      .catch(err => {
        host.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Court options live in the Sportify API, and it isn't answering (${escapeHtml(err.message)}).</p>
            <p class="hint">Start it with <code>dotnet run --launch-profile http</code> in <code>Sportify.Api</code>.</p>
            <button class="btn-export accent" id="btn-bball-retry">Retry</button>
          </div>`;
        document.getElementById("btn-bball-retry")?.addEventListener("click", () => syncBasketballPanel(sport));
      });
    return;
  }
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
  // The footprint, not the variant's full dimensions — a half court occupies
  // half the roof, and sending the full size would reserve space nobody needs.
  const d = basketballFootprint(state), w = basketballWeight(state), a = basketballAppearance(state);
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
    three_point_corner_from_sideline_m: BASKETBALL.threePoint.cornerFromSideline_m,
    centre_circle_radius_m: BASKETBALL.centreCircleRadius_m,
    free_throw_circle_radius_m: BASKETBALL.freeThrowCircleRadius_m,
    no_charge_radius_m: BASKETBALL.noChargeRadius_m,
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
