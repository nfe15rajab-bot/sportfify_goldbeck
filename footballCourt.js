/**
 * footballCourt.js — football, specified rather than sized
 *
 * The fourth sport to describe itself, after padel, basketball and volleyball,
 * and it follows the same rule: the geometry is in the code because a standard
 * fixes it, and every product choice is in the database because a supplier
 * fixes that.
 *
 * ── There is no size variant, on purpose ──
 * The other sports carry mini / standard / competition. Football does not: the
 * COURT TYPE is the size. A futsal court is 40 x 20 m because FIFA says so, not
 * because somebody chose "standard", and two controls that both claim to set
 * the size can disagree with each other. One control, one answer.
 *
 * ── Sources ──
 * FIFA Futsal Laws of the Game, Law 1 (The Pitch):
 *   pitch 25-42 x 16-25 m, international 38-42 x 20-25 m
 *   centre circle radius 3 m; penalty area a quarter circle of radius 6 m from
 *   the outside of each goalpost, joined by a line parallel to the goal line;
 *   penalty mark 6 m, second penalty mark 10 m; corner arc 25 cm;
 *   goals 3 m wide x 2 m high; lines 8 cm.
 *
 * ── What the penalty area actually is ──
 * Not a rectangle. Futsal's is two quarter circles struck from the goalposts
 * and joined across — which is why a futsal court is recognisable at a glance
 * and why drawing it as a box would be wrong rather than simplified.
 */

const FOOTBALL = {
  /** Line width, FIFA Futsal Law 1. */
  lineWidth_m: 0.08,

  centreCircleRadius_m: 3.00,

  /** Struck from the outside of each post, joined by a line parallel to the goal line. */
  penaltyArcRadius_m: 6.00,

  penaltyMarkFromGoalLine_m: 6.00,
  secondPenaltyMarkFromGoalLine_m: 10.00,

  cornerArcRadius_m: 0.25,

  /** The substitution zone, 5 m either side of the halfway line on the bench touchline. */
  substitutionZoneHalf_m: 2.50,
};

/**
 * The court types. Each one IS a size, which is why there is no size variant.
 * Goal sizes are the type's own: a mini pitch does not take a futsal goal.
 */
const FOOTBALL_TYPES = {
  futsal:      { length_m: 40, width_m: 20, runoff_m: 2.0, clearHeight_m: 7.0,
                 goal: { width_m: 3.0, height_m: 2.0 }, markings: "futsal",
                 norm: "FIFA Futsal Laws of the Game" },
  small_sided: { length_m: 30, width_m: 20, runoff_m: 2.0, clearHeight_m: 6.0,
                 goal: { width_m: 3.0, height_m: 2.0 }, markings: "futsal",
                 norm: "FIFA Futsal (non-international range)" },
  mini:        { length_m: 22, width_m: 14, runoff_m: 1.0, clearHeight_m: 5.0,
                 goal: { width_m: 2.0, height_m: 1.0 }, markings: "simple",
                 norm: "Mini pitch — no governing size" },
};

const FOOTBALL_OPTIONS_API = "http://localhost:5107/api/SportOptions?sport=football";

let FOOTBALL_OPTIONS = {};
let footballOptionsLoaded = false;

/** API option_group -> state key, in the order the panel shows them. */
const FOOTBALL_GROUPS = [
  ["court_type",   "courtType",   "Court type"],
  ["surface",      "surface",     "Surface"],
  ["court_colour", "courtColour", "Court colour"],
  ["boards",       "boards",      "Rebound boards"],
  // One row, like the basketball basket: it carries the weight and the price
  // but is not offered as a choice, because a choice of one is not a choice.
  ["goals",        "goals",       "Goals"],
];

async function loadFootballOptions() {
  const res = await fetch(FOOTBALL_OPTIONS_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sport options API returned ${res.status}`);
  const rows = await res.json();

  FOOTBALL_OPTIONS = {};
  FOOTBALL_GROUPS.forEach(([apiGroup, stateKey, label]) => {
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
    if (Object.keys(values).length) FOOTBALL_OPTIONS[stateKey] = { label, values };
  });

  footballOptionsLoaded = true;
  Object.entries(FOOTBALL_OPTIONS).forEach(([key, group]) => {
    if (!group.values[footballState[key]]) footballState[key] = Object.keys(group.values)[0];
  });
  return FOOTBALL_OPTIONS;
}

const footballState = {
  courtType: "futsal",
  surface: "artificial_turf",
  courtColour: "green",
  boards: "none",
  goals: "ballasted",
};

/* ── Dimensions ──────────────────────────────────────────────────────────── */

function footballType(state = footballState) {
  return FOOTBALL_TYPES[state.courtType] || FOOTBALL_TYPES.futsal;
}

/** The playing area — what the markings are drawn to. */
function footballPlayArea(state = footballState) {
  const t = footballType(state);
  return { length_m: t.length_m, width_m: t.width_m };
}

/**
 * What the court takes on the roof: the pitch plus its run-off. Boards sit on
 * the touchline, so they take no extra area — they replace the space a ball
 * would otherwise run into.
 */
function footballFootprint(state = footballState) {
  const t = footballType(state);
  return {
    length_m: Math.round((t.length_m + t.runoff_m * 2) * 100) / 100,
    width_m: Math.round((t.width_m + t.runoff_m * 2) * 100) / 100,
  };
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

/**
 * What the deck carries. Turf is the reason this matters: a 3G carpet is light
 * and its sand-and-rubber infill is not, and the catalogue states the two
 * together because that is what gets laid.
 */
function footballWeight(state = footballState) {
  const fp = footballFootprint(state);
  const area = fp.length_m * fp.width_m;
  const perM2 = FOOTBALL_OPTIONS.surface?.values?.[state.surface]?.kg_m2 ?? 0;
  const goalEach = FOOTBALL_OPTIONS.goals?.values?.[state.goals]?.kgEach ?? 0;

  const parts = [
    { what: "Playing surface", kg: area * perM2 },
    { what: "Goals (2)", kg: 2 * goalEach },
  ];

  // Boards run both touchlines; priced and weighed per metre of board.
  const boardKgEach = FOOTBALL_OPTIONS.boards?.values?.[state.boards]?.kgEach ?? 0;
  const boardLength_m = state.boards === "none" ? 0 : footballType(state).length_m * 2;
  if (boardLength_m) parts.push({ what: `Rebound boards (${boardLength_m} m)`, kg: boardLength_m * boardKgEach });

  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return { parts, total_kg, area_m2: area, perM2_kg: total_kg / area, goalEach, boardLength_m };
}

/* ── Appearance ──────────────────────────────────────────────────────────── */

function footballAppearance(state = footballState) {
  const picked = FOOTBALL_OPTIONS.courtColour?.values?.[state.courtColour]?.hex || "#3f7d3a";
  const mix = (hex, t) => (typeof mixToGrey === "function" ? mixToGrey(hex, t) : hex);
  const sh = (hex, t) => (typeof shade === "function" ? shade(hex, t) : hex);
  switch (FOOTBALL_OPTIONS.surface?.values?.[state.surface]?.texture || state.surface) {
    case "tiles":  return { base: mix(picked, 0.08), texture: "tiles", accent: sh(picked, -0.22) };
    case "sheen":  return { base: mix(picked, -0.08), texture: "sheen", accent: sh(picked, 0.10) };
    // Turf reads as turf: the mown stripes are the giveaway, so the drawing has them.
    case "pile":
    default:       return { base: picked, texture: "pile", accent: sh(picked, -0.12) };
  }
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * The court and its markings, at any scale.
 *
 * Long axis along X, origin at the top-left of the footprint, so the caller
 * places it exactly like the other three renderers.
 */
function footballCourtSvg(x, y, w, h, state = footballState, detail = "full", isDark = false) {
  const t = footballType(state);
  const a = footballAppearance(state);
  const fp = footballFootprint(state);

  // Metres to pixels. The footprint fills the box; the pitch sits inside it.
  const sx = w / fp.length_m, sy = h / fp.width_m;
  const M = m => m * sx;                    // along the long axis
  const N = m => m * sy;                    // across
  const px = m => x + M(t.runoff_m + m);
  const py = m => y + N(t.runoff_m + m);

  const line = isDark ? "#eef0ff" : "#ffffff";
  const lw = Math.max(0.6, Math.min(M(FOOTBALL.lineWidth_m), 2.4));
  const stroke = `stroke="${line}" stroke-width="${lw}" fill="none"`;

  const L = t.length_m, W = t.width_m;

  // The run-off, then the pitch on top of it.
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a.accent}" fill-opacity="0.35"/>`;
  out += `<rect x="${px(0)}" y="${py(0)}" width="${M(L)}" height="${N(W)}" fill="${a.base}"/>`;

  // Turf reads as turf because of the mowing, so the stripes are the texture.
  if (a.texture === "pile" && detail === "full") {
    const bands = 10;
    for (let i = 0; i < bands; i += 2) {
      out += `<rect x="${px(L * i / bands)}" y="${py(0)}" width="${M(L / bands)}" height="${N(W)}"
                    fill="${a.accent}" fill-opacity="0.16"/>`;
    }
  } else if (a.texture === "tiles" && detail === "full") {
    const step = Math.max(6, M(1));
    for (let gx = px(0); gx < px(L); gx += step)
      out += `<line x1="${gx}" y1="${py(0)}" x2="${gx}" y2="${py(W)}" stroke="${a.accent}" stroke-width="0.4" stroke-opacity="0.5"/>`;
    for (let gy = py(0); gy < py(W); gy += step)
      out += `<line x1="${px(0)}" y1="${gy}" x2="${px(L)}" y2="${gy}" stroke="${a.accent}" stroke-width="0.4" stroke-opacity="0.5"/>`;
  }

  // Touchlines, goal lines, halfway line, centre circle — every court has these.
  out += `<rect x="${px(0)}" y="${py(0)}" width="${M(L)}" height="${N(W)}" ${stroke}/>`;
  out += `<line x1="${px(L / 2)}" y1="${py(0)}" x2="${px(L / 2)}" y2="${py(W)}" ${stroke}/>`;
  out += `<ellipse cx="${px(L / 2)}" cy="${py(W / 2)}" rx="${M(FOOTBALL.centreCircleRadius_m)}" ry="${N(FOOTBALL.centreCircleRadius_m)}" ${stroke}/>`;
  out += `<circle cx="${px(L / 2)}" cy="${py(W / 2)}" r="${Math.max(0.8, lw)}" fill="${line}"/>`;

  if (t.markings === "futsal" && detail === "full") {
    const r = FOOTBALL.penaltyArcRadius_m;
    const halfGoal = t.goal.width_m / 2;
    const postA = W / 2 - halfGoal, postB = W / 2 + halfGoal;   // the posts, across the pitch

    // The futsal penalty area. Each quarter circle runs from the goal line,
    // 6 m to the side of a post, round to a point 6 m INTO the field level with
    // that post — so the curve bulges toward the centre, never past the goal
    // line. Starting it at the post itself drew it inside out.
    [[0, 1, 1], [L, -1, 0]].forEach(([atX, dir, sweep]) => {
      // From the goal line, beside the near post, round to level with it.
      out += `<path d="M ${px(atX)} ${py(postA - r)} A ${M(r)} ${N(r)} 0 0 ${sweep} ${px(atX + dir * r)} ${py(postA)}" ${stroke}/>`;
      // From level with the far post, round back to the goal line beside it.
      out += `<path d="M ${px(atX + dir * r)} ${py(postB)} A ${M(r)} ${N(r)} 0 0 ${sweep} ${px(atX)} ${py(postB + r)}" ${stroke}/>`;
      // The line that joins the two, parallel to the goal line.
      out += `<line x1="${px(atX + dir * r)}" y1="${py(postA)}" x2="${px(atX + dir * r)}" y2="${py(postB)}" ${stroke}/>`;

      out += `<circle cx="${px(atX + dir * FOOTBALL.penaltyMarkFromGoalLine_m)}" cy="${py(W / 2)}" r="${Math.max(0.8, lw)}" fill="${line}"/>`;
      out += `<circle cx="${px(atX + dir * FOOTBALL.secondPenaltyMarkFromGoalLine_m)}" cy="${py(W / 2)}" r="${Math.max(0.8, lw)}" fill="${line}"/>`;
    });

    // Corner arcs.
    const ca = FOOTBALL.cornerArcRadius_m;
    [[0, 0, 1], [L, 0, 0], [0, W, 0], [L, W, 1]].forEach(([cx, cy, sweep]) => {
      const dx = cx === 0 ? ca : -ca, dy = cy === 0 ? ca : -ca;
      out += `<path d="M ${px(cx + dx)} ${py(cy)} A ${M(ca)} ${N(ca)} 0 0 ${sweep} ${px(cx)} ${py(cy + dy)}" ${stroke}/>`;
    });
  }

  // The goals, at both ends — the two objects that exist in 3D.
  const gHalf = t.goal.width_m / 2;
  [[0, -1], [L, 1]].forEach(([atX, dir]) => {
    const depth = 1.0;
    out += `<rect x="${dir < 0 ? px(atX) - M(depth) : px(atX)}" y="${py(W / 2 - gHalf)}"
                  width="${M(depth)}" height="${N(t.goal.width_m)}"
                  fill="${line}" fill-opacity="0.22" stroke="${line}" stroke-width="${lw}"/>`;
  });

  // Rebound boards run both touchlines.
  if (state.boards !== "none") {
    [py(0), py(W)].forEach(ly => {
      out += `<line x1="${px(0)}" y1="${ly}" x2="${px(L)}" y2="${ly}"
                    stroke="${isDark ? "#c9a06a" : "#8a5a2b"}" stroke-width="${Math.max(1.4, lw * 2)}"/>`;
    });
  }

  return out;
}

/** The Sport tab's preview: the court, with the two dimensions that decide it. */
function drawFootballPreview(svg, isDark) {
  if (!svg) return;
  const fp = footballFootprint(), t = footballType();
  const PADDING = 46, vw = 420, vh = 260;
  const aspect = fp.length_m / fp.width_m;
  let fw = vw - PADDING * 2, fh = fw / aspect;
  if (fh > vh - PADDING * 2) { fh = vh - PADDING * 2; fw = fh * aspect; }
  const ox = (vw - fw) / 2, oy = (vh - fh) / 2;
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  svg.innerHTML = `
    ${footballCourtSvg(ox, oy, fw, fh, footballState, "full", isDark)}
    <text x="${ox + fw / 2}" y="${oy - 16}" text-anchor="middle" font-size="11" fill="${dim}" ${font}>${t.length_m} m</text>
    <text x="${ox - 16}" y="${oy + fh / 2}" text-anchor="middle" font-size="11" fill="${dim}" ${font}
          transform="rotate(-90, ${ox - 16}, ${oy + fh / 2})">${t.width_m} m</text>
    <text x="${vw / 2}" y="${vh - 10}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Playing area ${t.length_m} × ${t.width_m} m · footprint ${fp.length_m} × ${fp.width_m} m with run-off</text>`;
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function footballPanelHtml() {
  const t = footballType(), fp = footballFootprint(), w = footballWeight();
  const kg = n => Math.round(n).toLocaleString("en-US");

  const picker = ([, stateKey]) => {
    const group = FOOTBALL_OPTIONS[stateKey];
    if (!group) return "";
    const keys = Object.keys(group.values);
    // A group with one row carries its weight and price but is not a choice.
    if (keys.length < 2) return "";
    const chosen = group.values[footballState[stateKey]];
    return `
      <div class="section">
        <label>${escapeHtml(group.label)}</label>
        <select data-football="${escapeHtml(stateKey)}">
          ${keys.map(k => `<option value="${escapeHtml(k)}"${k === footballState[stateKey] ? " selected" : ""}>${escapeHtml(group.values[k].label)}</option>`).join("")}
        </select>
        ${chosen?.note ? `<p class="hint">${escapeHtml(chosen.note)}</p>` : ""}
      </div>`;
  };

  const surface = FOOTBALL_OPTIONS.surface?.values?.[footballState.surface];
  const cost = surface?.price != null
    ? `€ ${kg(surface.price * w.area_m2)} — ${surface.price} €/m² × ${kg(w.area_m2)} m²`
    : "no price in the catalogue";

  return `
    ${FOOTBALL_GROUPS.map(picker).join("")}

    <div class="section">
      <label>${escapeHtml(t.norm)}</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${t.length_m} × ${t.width_m} m</div><div class="lbl">Playing area</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">With ${t.runoff_m} m run-off</div></div>
        <div class="dim-card"><div class="val">${t.goal.width_m} × ${t.goal.height_m} m</div><div class="lbl">Goals</div></div>
        <div class="dim-card"><div class="val">${t.clearHeight_m} m</div><div class="lbl">Clear height needed</div></div>
      </div>
    </div>

    <div class="section">
      <label>On the deck</label>
      <table class="planter-table">
        <tbody>
          ${w.parts.map(p => `<tr><td>${escapeHtml(p.what)}</td><td>${kg(p.kg)} kg</td></tr>`).join("")}
          <tr class="planter-group"><td>Total</td><td>${kg(w.total_kg)} kg · ${Math.round(w.perM2_kg * 10) / 10} kg/m²</td></tr>
        </tbody>
      </table>
      <p class="hint">Estimated, from the parts — so every line can be argued with. The structural check reads the total.</p>
    </div>

    <div class="section">
      <label>Surface cost</label>
      <p class="hint">${escapeHtml(cost)}${surface?.cost_group ? ` · DIN 276 KG ${escapeHtml(surface.cost_group)}` : ""}</p>
      <p class="hint">${surface?.price_quoted ? "Quoted." : "Estimated, not quoted."}</p>
    </div>`;
}

function syncFootballPanel(sport) {
  const host = document.getElementById("sport-spec-panel");
  if (!host) return;
  const isFootball = sport === "football";

  if (isFootball && !footballOptionsLoaded) {
    host.innerHTML = `<div class="section"><p class="hint">Loading court options…</p></div>`;
    loadFootballOptions()
      .then(() => { syncFootballPanel(sport); if (typeof drawField === "function") drawField(sport, footballState.courtType, 0, isDarkMode()); })
      .catch(err => {
        host.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Court options live in the Sportify API, and it isn't answering (${escapeHtml(err.message)}).</p>
            <button class="btn-export accent" id="btn-football-retry">Retry</button>
          </div>`;
        document.getElementById("btn-football-retry")?.addEventListener("click", () => syncFootballPanel(sport));
      });
    return;
  }

  host.innerHTML = isFootball ? footballPanelHtml() : "";
  if (!isFootball) return;

  host.querySelectorAll("[data-football]").forEach(sel => {
    sel.addEventListener("change", e => {
      footballState[e.target.dataset.football] = e.target.value;
      syncFootballPanel(sport);
      if (typeof drawFootballPreview === "function") drawFootballPreview(document.getElementById("field"), isDarkMode());
    });
  });
}

/* ── What a placed court carries ─────────────────────────────────────────── */

/** A placed court's own settings (what its Push carried), over the panel's, so a setting added later still has a value. */
function footballStateForItem(item) {
  const f = item?.sourceJson?.football;
  if (!f) return footballState;
  return Object.assign({}, footballState, {
    courtType: f.court_type || footballState.courtType,
    surface: f.surface || footballState.surface,
    courtColour: f.court_colour || footballState.courtColour,
    boards: f.boards || footballState.boards,
    goals: f.goals || footballState.goals,
  });
}

function footballPlacementPayload(state = footballState) {
  const t = footballType(state), fp = footballFootprint(state);
  const w = footballWeight(state), a = footballAppearance(state);
  return {
    court_type: state.courtType,
    surface: state.surface,
    court_colour: state.courtColour,
    boards: state.boards,
    goals: state.goals,
    appearance_hex: a.base,
    texture: a.texture,

    length_m: fp.length_m,
    width_m: fp.width_m,
    play_length_m: t.length_m,
    play_width_m: t.width_m,
    runoff_m: t.runoff_m,
    clear_height_min_m: t.clearHeight_m,

    goal_width_m: t.goal.width_m,
    goal_height_m: t.goal.height_m,
    markings: t.markings,
    line_width_m: FOOTBALL.lineWidth_m,
    centre_circle_radius_m: FOOTBALL.centreCircleRadius_m,
    penalty_arc_radius_m: FOOTBALL.penaltyArcRadius_m,
    penalty_mark_m: FOOTBALL.penaltyMarkFromGoalLine_m,
    second_penalty_mark_m: FOOTBALL.secondPenaltyMarkFromGoalLine_m,
    corner_arc_radius_m: FOOTBALL.cornerArcRadius_m,

    board_length_m: w.boardLength_m,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    source: t.norm,
  };
}
