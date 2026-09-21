/**
 * volleyballCourt.js — a volleyball court, specified rather than sized
 *
 * Third sport, third shape of problem.
 *
 * Padel's story was the enclosure. Basketball's was the markings. Volleyball's
 * is the FREE ZONE and the SAND — two things that are invisible in a plan of
 * the court and decide whether it can be on the roof at all.
 *
 * ── The free zone is not a margin, it is part of the facility ──
 * An 18 × 9 m court needs at least 3 m of clear floor all round, which makes
 * the real footprint 24 × 15 m. Play happens out there: a dig carries a player
 * into it, and it has to be the same surface. Drawing only the 162 m² of court
 * would understate the thing being built by more than half.
 *
 * ── Beach is not a variant, it is a different court on a different ground ──
 * 16 × 8 m, no attack lines, and laid on 400 mm of sand. Sand runs about
 * 1,600 kg/m³, so a beach court with its run-off is something like 200 tonnes
 * on the deck. That is not a surface choice. On a car park roof it is the
 * whole question, and it is the reason this file computes the sand separately
 * and says so loudly.
 *
 * ── Sources ──
 * FIVB court, net, antennae and free zone:
 *   https://www.judgemate.com/en/guides/volleyball-court-dimensions
 *   https://www.dimensions.com/element/volleyball-courts
 * Cross-checked against the app's own FIELDS data, which already carried the
 * 3 m / 5 m free zones and the 7 m / 12.5 m clear heights correctly.
 */

const VOLLEYBALL = {
  indoor: { length_m: 18, width_m: 9 },
  beach:  { length_m: 16, width_m: 8 },

  lineWidth_m: 0.05,

  /* The attack line, 3 m from the centre line on each side. Indoor only —
     beach has no attack line, which is one of the things that makes it a
     different game rather than the same game on sand. */
  attackLineFromCentre_m: 3.0,

  net: {
    depth_m: 1.0,
    lengthMin_m: 9.5,
    /* Posts stand 0.5–1.0 m outside the sideline, and are 2.55 m tall so the
       net can be tensioned at its highest setting. */
    postOutsideSideline_m: 1.0,
    postHeight_m: 2.55,
    /* Antennae project 80 cm above the net band and mark the crossing space —
       they are what a player actually aims inside. */
    antennaLength_m: 1.8,
    antennaAboveNet_m: 0.80,
  },

  /* Minimum free zone. The app's own variants carry the chosen one; these are
     what the rules require. */
  freeZone: {
    club: { sides_m: 3.0, ends_m: 3.0 },
    fivb: { sides_m: 5.0, ends_m: 6.5 },
  },

  /* Clear height above the playing space — 7 m, or 12.5 m for top FIVB
     events. On a roof this is the constraint that rules out a canopy. */
  clearHeight: { minimum_m: 7.0, fivb_m: 12.5 },

  /* Sand. The FIVB minimum depth, and what it weighs. */
  sand: { depth_m: 0.40, density_kg_m3: 1600 },
};

/* ── Options come from the database ─────────────────────────────────────────
   Same table as padel and basketball. Play type, net height, surface and
   colour are products or rules-with-choices; the geometry above is neither. */

const VOLLEYBALL_OPTIONS_API = "http://localhost:5107/api/SportOptions?sport=volleyball";

let VOLLEYBALL_OPTIONS = {};
let volleyballOptionsLoaded = false;

const VOLLEYBALL_GROUPS = [
  ["play_type",    "playType",    "Play type"],
  ["net_height",   "netHeight",   "Net height"],
  ["surface",      "surface",     "Surface"],
  ["court_colour", "courtColour", "Court colour"],
  ["net_system",   "netSystem",   "Net and posts"],
];

async function loadVolleyballOptions() {
  const res = await fetch(VOLLEYBALL_OPTIONS_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sport options API returned ${res.status}`);
  const rows = await res.json();

  VOLLEYBALL_OPTIONS = {};
  VOLLEYBALL_GROUPS.forEach(([apiGroup, stateKey, label]) => {
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
            // Net height is stored in mm on the shared column, because the
            // table has no metres field and inventing one for a single sport
            // would be worse than the conversion here.
            height_m: r.thicknessMm != null ? r.thicknessMm / 1000 : null,
            price: r.priceValue ?? null,
            price_unit: r.priceUnit || null,
            price_quoted: !!r.priceIsQuoted,
            cost_group: r.costGroupDin276 || null,
          };
        });
    if (Object.keys(values).length) VOLLEYBALL_OPTIONS[stateKey] = { label, values };
  });

  volleyballOptionsLoaded = true;
  Object.entries(VOLLEYBALL_OPTIONS).forEach(([key, group]) => {
    if (!group.values[volleyballState[key]]) volleyballState[key] = Object.keys(group.values)[0];
  });
  // Beach is played on sand and nothing else; picking beach with an acrylic
  // surface would describe a court that does not exist.
  syncVolleyballSurface();
  return VOLLEYBALL_OPTIONS;
}

const volleyballState = {
  variant: "standard",       // from the sports database — decides the free zone
  playType: "indoor",
  netHeight: "men",
  surface: "polyurethane",
  courtColour: "blue",
  netSystem: "ballasted",
};

/**
 * Beach is sand; indoor is not. Rather than let the two disagree, the surface
 * follows the play type — and the picker hides for beach, because there is
 * only one answer.
 */
function syncVolleyballSurface() {
  const beach = volleyballState.playType === "beach";
  const values = VOLLEYBALL_OPTIONS.surface?.values || {};
  if (beach && values.sand) volleyballState.surface = "sand";
  if (!beach && volleyballState.surface === "sand") {
    volleyballState.surface = Object.keys(values).find(k => k !== "sand") || volleyballState.surface;
  }
  if (beach && VOLLEYBALL_OPTIONS.courtColour?.values?.sand) volleyballState.courtColour = "sand";
}

/* ── Dimensions ──────────────────────────────────────────────────────────── */

/** The court itself — the lines, not the space around them. */
function volleyballCourt(state = volleyballState) {
  return state.playType === "beach" ? VOLLEYBALL.beach : VOLLEYBALL.indoor;
}

/**
 * The free zone the chosen variant asks for.
 *
 * The app's own FIELDS data already carries this as `runoff`, and it is right:
 * 3 m for standard, 5 m for competition. The FIVB end-zone figure of 6.5 m
 * applies to world events and is offered through the competition variant.
 */
function volleyballFreeZone(state = volleyballState) {
  const v = (typeof FIELDS !== "undefined" && FIELDS.volleyball?.[state.variant]) || null;
  const sides = v?.runoff ?? VOLLEYBALL.freeZone.club.sides_m;
  const ends = state.variant === "competition" ? VOLLEYBALL.freeZone.fivb.ends_m : sides;
  return { sides_m: sides, ends_m: ends };
}

/** What the facility actually occupies on the roof — court plus free zone. */
function volleyballFootprint(state = volleyballState) {
  const c = volleyballCourt(state), z = volleyballFreeZone(state);
  return {
    length_m: c.length_m + z.ends_m * 2,
    width_m: c.width_m + z.sides_m * 2,
  };
}

function volleyballClearHeight(state = volleyballState) {
  const v = (typeof FIELDS !== "undefined" && FIELDS.volleyball?.[state.variant]) || null;
  return v?.h ?? VOLLEYBALL.clearHeight.minimum_m;
}

function volleyballNetHeightM(state = volleyballState) {
  return VOLLEYBALL_OPTIONS.netHeight?.values?.[state.netHeight]?.height_m ?? 2.43;
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

/**
 * The surface covers the whole footprint, not just the court — you land in the
 * free zone, so it is the same build-up out there.
 *
 * For beach that is the entire point: sand over 22 × 14 m at 400 mm is not a
 * finish, it is a structure.
 */
function volleyballWeight(state = volleyballState) {
  const fp = volleyballFootprint(state);
  const area = fp.length_m * fp.width_m;
  const surf = VOLLEYBALL_OPTIONS.surface?.values?.[state.surface];
  const perM2 = surf?.kg_m2 ?? 0;
  const netKg = VOLLEYBALL_OPTIONS.netSystem?.values?.[state.netSystem]?.kgEach ?? 0;

  const parts = [
    {
      what: state.playType === "beach"
        ? `Sand, ${Math.round(VOLLEYBALL.sand.depth_m * 1000)} mm`
        : "Playing surface",
      kg: area * perM2,
    },
    { what: "Net and posts", kg: netKg },
  ];
  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return {
    parts, total_kg, area_m2: area, perM2_kg: total_kg / area,
    isBeach: state.playType === "beach",
    sandVolume_m3: state.playType === "beach" ? area * VOLLEYBALL.sand.depth_m : 0,
  };
}

/* ── Appearance ──────────────────────────────────────────────────────────── */

function volleyballAppearance(state = volleyballState) {
  const picked = VOLLEYBALL_OPTIONS.courtColour?.values?.[state.courtColour]?.hex || "#2f6fb5";
  const mix = (h, t) => (typeof mixToGrey === "function" ? mixToGrey(h, t) : h);
  const sh = (h, t) => (typeof shade === "function" ? shade(h, t) : h);
  const texture = VOLLEYBALL_OPTIONS.surface?.values?.[state.surface]?.texture || "flat";
  switch (texture) {
    case "speckle": return { base: mix(picked, 0.10), texture: "speckle", accent: sh(picked, -0.20) };
    case "tiles":   return { base: mix(picked, 0.08), texture: "tiles",   accent: sh(picked, -0.22) };
    case "sheen":   return { base: mix(picked, -0.08), texture: "sheen",  accent: sh(picked, 0.10) };
    default:        return { base: picked, texture: "flat", accent: sh(picked, -0.14) };
  }
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * The free zone is drawn, not implied. It is the difference between a court
 * that fits on this roof and one that does not, and a plan showing only the
 * lines hides more than half the facility.
 */
function volleyballCourtSvg(x, y, w, h, state = volleyballState, detail = "full", isDark = false) {
  const fp = volleyballFootprint(state);
  const court = volleyballCourt(state);
  const z = volleyballFreeZone(state);
  const s = w / fp.length_m;
  const a = volleyballAppearance(state);
  const line = "#ffffff";
  const lw = Math.max(0.6, VOLLEYBALL.lineWidth_m * s);
  const beach = state.playType === "beach";

  // The court sits inside the free zone
  const cx0 = x + z.ends_m * s;
  const cy0 = y + z.sides_m * s;
  const cw = court.length_m * s;
  const ch = court.width_m * s;
  const midX = cx0 + cw / 2;

  const fillId = `vbSurf_${Math.random().toString(36).slice(2, 8)}`;
  let out = "";

  out += `<defs>${volleyballSurfaceDefs(fillId, state, s)}</defs>`;
  // Whole footprint: the free zone is the same surface as the court.
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${fillId})"/>`;
  // and reads slightly back, so the court still reads as the court
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" fill-opacity="${isDark ? 0.18 : 0.10}"/>`;
  out += `<rect x="${cx0}" y="${cy0}" width="${cw}" height="${ch}" fill="url(#${fillId})"/>`;

  // ── Markings ──
  out += `<rect x="${cx0}" y="${cy0}" width="${cw}" height="${ch}"
                fill="none" stroke="${line}" stroke-width="${lw * 1.4}"/>`;
  // Centre line, under the net
  out += `<line x1="${midX}" y1="${cy0}" x2="${midX}" y2="${cy0 + ch}" stroke="${line}" stroke-width="${lw}"/>`;

  // Attack lines — indoor only. Beach has none, and drawing them would make
  // the two courts look like the same game.
  if (!beach) {
    [-1, 1].forEach(sgn => {
      const ax = midX + sgn * VOLLEYBALL.attackLineFromCentre_m * s;
      out += `<line x1="${ax}" y1="${cy0}" x2="${ax}" y2="${cy0 + ch}" stroke="${line}" stroke-width="${lw}"/>`;
    });
  }

  // ── The net, its posts and its antennae, in plan ──
  const postOffset = VOLLEYBALL.net.postOutsideSideline_m * s;
  out += `<line x1="${midX}" y1="${cy0 - postOffset}" x2="${midX}" y2="${cy0 + ch + postOffset}"
                stroke="${isDark ? "#d6d9e8" : "#3a3f57"}" stroke-width="${Math.max(1, lw * 1.6)}"
                stroke-dasharray="${lw * 2},${lw * 1.5}"/>`;
  [cy0 - postOffset, cy0 + ch + postOffset].forEach(py => {
    out += `<circle cx="${midX}" cy="${py}" r="${Math.max(1.2, lw * 1.6)}"
                    fill="${isDark ? "#d6d9e8" : "#3a3f57"}"/>`;
  });
  if (detail === "full") {
    // Antennae sit on the sidelines — the crossing space a player aims inside.
    [cy0, cy0 + ch].forEach(py => {
      out += `<circle cx="${midX}" cy="${py}" r="${Math.max(1, lw * 1.1)}"
                      fill="none" stroke="#e8433f" stroke-width="${lw}"/>`;
    });
  }

  // ── The free zone, said out loud ──
  if (detail === "full" && z.sides_m > 0) {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none"
                  stroke="${line}" stroke-opacity="0.35" stroke-width="${lw}" stroke-dasharray="${lw * 4},${lw * 3}"/>`;
  }

  return out;
}

function volleyballSurfaceDefs(id, state = volleyballState, s = 10) {
  const a = volleyballAppearance(state);
  const step = Math.max(2.5, s * 0.28);
  if (a.texture === "speckle") {
    // Sand: fine, irregular, no direction.
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${step * 1.5}" height="${step * 1.5}">
        <rect width="${step * 1.5}" height="${step * 1.5}" fill="${a.base}"/>
        <circle cx="${step * 0.35}" cy="${step * 0.5}" r="0.5" fill="${a.accent}" fill-opacity="0.7"/>
        <circle cx="${step * 1.1}" cy="${step * 1.0}" r="0.45" fill="${a.accent}" fill-opacity="0.6"/>
        <circle cx="${step * 0.8}" cy="${step * 0.2}" r="0.35" fill="${a.accent}" fill-opacity="0.5"/>
      </pattern>`;
  }
  if (a.texture === "tiles") {
    const t = Math.max(3, 0.3 * s);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${t}" height="${t}">
        <rect width="${t}" height="${t}" fill="${a.base}"/>
        <path d="M ${t} 0 L ${t} ${t} L 0 ${t}" fill="none" stroke="${a.accent}" stroke-width="0.4" stroke-opacity="0.65"/>
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

function drawVolleyballPreview(svg, isDark) {
  const fp = volleyballFootprint();
  const PADDING = 46, vw = 420, vh = 260;
  const aspect = fp.length_m / fp.width_m;
  let fw = vw - PADDING * 2, fh = fw / aspect;
  if (fh > vh - PADDING * 2) { fh = vh - PADDING * 2; fw = fh * aspect; }
  const ox = (vw - fw) / 2, oy = (vh - fh) / 2;
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const w = volleyballWeight();

  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  svg.innerHTML = `
    ${volleyballCourtSvg(ox, oy, fw, fh, volleyballState, "full", isDark)}
    <text x="${ox + fw / 2}" y="${oy - 16}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">${fp.length_m} m including the free zone</text>
    <text x="${ox - 16}" y="${oy + fh / 2}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif"
          transform="rotate(-90, ${ox - 16}, ${oy + fh / 2})">${fp.width_m} m</text>
    <text x="${ox + fw / 2}" y="${Math.min(vh - 6, oy + fh + 22)}" text-anchor="middle" font-size="10" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">
      net ${volleyballNetHeightM().toFixed(2)} m · ${Math.round(w.total_kg).toLocaleString("en-US")} kg on the deck
    </text>`;
}

function volleyballPanelHtml() {
  const w = volleyballWeight();
  const court = volleyballCourt();
  const fp = volleyballFootprint();
  const z = volleyballFreeZone();
  const beach = volleyballState.playType === "beach";

  const pick = key => {
    const o = VOLLEYBALL_OPTIONS[key];
    if (!o) return "";
    // Beach is played on sand and nothing else. A picker offering a choice
    // already decided is a place to build a court that cannot exist.
    if (key === "surface" && beach) {
      const only = o.values[volleyballState.surface];
      return only ? `<p class="hint"><strong>Surface:</strong> ${escapeHtml(only.label)} — ${escapeHtml(only.note)}</p>` : "";
    }
    const keys = Object.keys(o.values).filter(k => key !== "surface" || beach || k !== "sand");
    if (keys.length <= 1) {
      const only = o.values[keys[0]];
      return only ? `<p class="hint"><strong>${escapeHtml(o.label)}:</strong> ${escapeHtml(only.label)}${only.note ? ` — ${escapeHtml(only.note)}` : ""}</p>` : "";
    }
    const opts = keys.map(v =>
      `<option value="${v}"${volleyballState[key] === v ? " selected" : ""}>${escapeHtml(o.values[v].label)}</option>`).join("");
    const note = o.values[volleyballState[key]]?.note;
    return `<div class="section">
        <label>${escapeHtml(o.label)}</label>
        <select data-volleyball="${key}">${opts}</select>
        ${note ? `<p class="hint">${note}</p>` : ""}
      </div>`;
  };

  // On a roof the sand is the headline, so it is said before anything else.
  const sandWarning = beach ? `
    <div class="section">
      <label>What the sand weighs</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${w.sandVolume_m3.toFixed(0)} m³</div><div class="lbl">Sand at ${Math.round(VOLLEYBALL.sand.depth_m * 1000)} mm</div></div>
        <div class="dim-card"><div class="val" style="color:#f59e0b">${(w.parts[0].kg / 1000).toFixed(1)} t</div><div class="lbl">≈ ${Math.round(VOLLEYBALL.sand.density_kg_m3 * VOLLEYBALL.sand.depth_m)} kg/m²</div></div>
      </div>
      <p class="hint">
        The sand covers the free zone too — you land out there. At ${VOLLEYBALL.sand.density_kg_m3} kg/m³ dry this is
        a structural question before it is a surface choice, and wet sand is heavier again.
        <strong>Check it against the deck capacity before going further.</strong>
      </p>
    </div>` : "";

  return `
    <div class="section">
      <label>This court</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${court.length_m} × ${court.width_m} m</div><div class="lbl">Court</div></div>
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">With free zone</div></div>
        <div class="dim-card"><div class="val">${volleyballNetHeightM().toFixed(2)} m</div><div class="lbl">Net</div></div>
        <div class="dim-card"><div class="val">${Math.round(w.total_kg).toLocaleString("en-US")} kg</div><div class="lbl">${Math.round(w.perM2_kg)} kg/m² on the deck</div></div>
      </div>
      <p class="hint">
        The free zone is ${z.sides_m} m at the sides and ${z.ends_m} m at the ends — and it is part of the court,
        not a margin. Play carries into it, so it is the same surface and it takes the same space.
        Needs <strong>${volleyballClearHeight()} m</strong> of clear height.
      </p>
    </div>

    ${sandWarning}
    ${VOLLEYBALL_GROUPS.map(([, stateKey]) => pick(stateKey)).join("")}

    <div class="section">
      <p class="hint" style="opacity:.8">
        <strong>FIVB reference</strong> — indoor ${VOLLEYBALL.indoor.length_m} × ${VOLLEYBALL.indoor.width_m} m ·
        beach ${VOLLEYBALL.beach.length_m} × ${VOLLEYBALL.beach.width_m} m ·
        attack line ${VOLLEYBALL.attackLineFromCentre_m} m from the centre ·
        net 2.43 m men / 2.24 m women ·
        free zone ${VOLLEYBALL.freeZone.club.sides_m} m minimum, ${VOLLEYBALL.freeZone.fivb.sides_m} m sides
        and ${VOLLEYBALL.freeZone.fivb.ends_m} m ends for world events ·
        ${VOLLEYBALL.clearHeight.minimum_m} m clear height, ${VOLLEYBALL.clearHeight.fivb_m} m for top events.
      </p>
    </div>`;
}

function syncVolleyballPanel(sport) {
  const host = document.getElementById("sport-spec-panel");
  if (!host) return;
  if (sport !== "volleyball") return;

  if (!volleyballOptionsLoaded) {
    host.innerHTML = `<div class="section"><p class="hint">Loading court options…</p></div>`;
    loadVolleyballOptions()
      .then(() => { syncVolleyballPanel(sport); if (typeof drawField === "function") drawField(sport, volleyballState.variant, 0, isDarkMode()); })
      .catch(err => {
        host.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Court options live in the Sportify API, and it isn't answering (${escapeHtml(err.message)}).</p>
            <p class="hint">Start it with <code>dotnet run --launch-profile http</code> in <code>Sportify.Api</code>.</p>
            <button class="btn-export accent" id="btn-vball-retry">Retry</button>
          </div>`;
        document.getElementById("btn-vball-retry")?.addEventListener("click", () => syncVolleyballPanel(sport));
      });
    return;
  }

  host.innerHTML = volleyballPanelHtml();
  host.querySelectorAll("[data-volleyball]").forEach(sel => {
    sel.addEventListener("change", e => {
      volleyballState[e.target.dataset.volleyball] = e.target.value;
      syncVolleyballSurface();
      syncVolleyballPanel(sport);
      if (typeof drawField === "function") drawField(sport, volleyballState.variant, 0, isDarkMode());
    });
  });
}

/* ── What travels with a placed court ────────────────────────────────────── */

function volleyballPlacementPayload(state = volleyballState) {
  const court = volleyballCourt(state), fp = volleyballFootprint(state);
  const z = volleyballFreeZone(state), w = volleyballWeight(state);
  const a = volleyballAppearance(state);
  return {
    variant: state.variant,
    play_type: state.playType,
    net_height_key: state.netHeight,
    net_height_m: volleyballNetHeightM(state),
    surface: state.surface,
    court_colour: state.courtColour,
    appearance_hex: a.base,

    court_length_m: court.length_m,
    court_width_m: court.width_m,
    length_m: fp.length_m,
    width_m: fp.width_m,
    free_zone_sides_m: z.sides_m,
    free_zone_ends_m: z.ends_m,

    attack_line_from_centre_m: state.playType === "beach" ? 0 : VOLLEYBALL.attackLineFromCentre_m,
    net_depth_m: VOLLEYBALL.net.depth_m,
    post_outside_sideline_m: VOLLEYBALL.net.postOutsideSideline_m,
    post_height_m: VOLLEYBALL.net.postHeight_m,
    antenna_length_m: VOLLEYBALL.net.antennaLength_m,
    antenna_above_net_m: VOLLEYBALL.net.antennaAboveNet_m,

    clear_height_min_m: volleyballClearHeight(state),
    sand_depth_m: state.playType === "beach" ? VOLLEYBALL.sand.depth_m : 0,
    sand_volume_m3: Math.round(w.sandVolume_m3 * 10) / 10,

    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    weight_breakdown: w.parts.map(p => ({ part: p.what, kg: Math.round(p.kg) })),
    weight_basis: "estimated",
    source: "FIVB Official Volleyball Rules — the playing area",
  };
}

function volleyballStateForItem(item) {
  const v = item?.sourceJson?.volleyball;
  if (!v) return volleyballState;
  return {
    variant: v.variant || "standard",
    playType: v.play_type || "indoor",
    netHeight: v.net_height_key || "men",
    surface: v.surface || "polyurethane",
    courtColour: v.court_colour || "blue",
    netSystem: "ballasted",
  };
}

function isVolleyballItem(item) {
  return item?.sourceJson?.field?.sport === "volleyball" || !!item?.sourceJson?.volleyball;
}
