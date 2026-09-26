/**
 * padelCourt.js — a padel court, specified rather than sized
 *
 * A padel court is not a rectangle you type dimensions into. It is 20 × 10 m
 * because the International Padel Federation says so, the net is 0.88 m at the
 * centre because the rules say so, and a court built to other numbers is not a
 * padel court. So none of that is a parameter here: the geometry is the sport's
 * definition, and it lives in code for the same reason the "a membrane layer
 * must be zero thickness" rule does — it is a standard, not a catalog anyone
 * should be editing from the Catalogue tab.
 *
 * What IS a choice — the wall system, the surface, the court type — is exposed,
 * and those are products with prices and weights, which belong in the database.
 *
 * ── Sources ──
 * FIP Rules of Padel (2026 revision):
 *   https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf
 * Court dimensions and enclosure detail:
 *   https://padel-rules.com/court-dimensions/court-dimensions/
 * Side-wall stepped profile and glass/mesh construction:
 *   https://www.ccgrass.com/padel-court-construction-guide/
 *
 * ── One thing worth knowing on a roof ──
 * A padel court needs 6 m of clear air above it (8 m recommended for
 * competition). That is a constraint against anything built near it, and it is
 * carried in the export so the clearance can be checked rather than assumed.
 */

const PADEL = {
  /* Plan — all metres. Tolerance is ±0.5%, which is a construction tolerance,
     not licence to draw a different court. */
  double: { length_m: 20, width_m: 10 },
  single: { length_m: 20, width_m: 6 },

  lineWidth_m: 0.05,

  /* The net splits the court in half across its width. */
  net: { centreHeight_m: 0.88, postHeight_m: 0.92 },

  /* Service line, measured from the NET — which leaves 3.05 m of back court
     behind it on a double court. The centre service line runs from the net to
     the service line and overruns it by 20 cm. */
  serviceLineFromNet_m: 6.95,
  centreLineOverrun_m: 0.20,

  /* Enclosure. The back is a flat 3 m of glass with 1 m of mesh on top. The
     sides step down from the corner — this stepped profile is what gives padel
     its corner rebound, and it is the part a plain rectangle cannot show. */
  backWall: { glassHeight_m: 3.0, meshHeight_m: 1.0 },
  sideWall: {
    cornerGlass: { length_m: 2.0, height_m: 3.0 },
    stepGlass:   { length_m: 2.0, height_m: 2.0 },
    centreMeshHeight_m: 3.0,
    cornerMeshHeight_m: 4.0,
  },

  /* Clear height above the playing surface. */
  clearHeight: { minimum_m: 6.0, recommended_m: 8.0 },

  /* Access. One central opening, or two smaller ones on each side. */
  access: {
    single: { minWidth_m: 1.05, maxWidth_m: 2.20, height_m: 2.00 },
    double: { minWidth_m: 0.72, maxWidth_m: 1.10, height_m: 2.00 },
  },
};

/* ── The four things that are actually a choice ─────────────────────────────
   Everything above is fixed by the rules. These are products, and products
   live in the database — adding a fourth surface is a row in the Catalogue tab, not
   a change to this file. They started life as constants here, which meant a
   landscape architect needed a developer to add a colour.

   No fallback, deliberately, the same as the build-up and species catalogs: a
   built-in copy that quietly stands in when the API is down means two catalogs
   that drift, and a court specified from the stale one without anyone knowing. */

const PADEL_OPTIONS_API = "http://localhost:5107/api/SportOptions?sport=padel";

/** { courtType: {label, values:{key:{label,note,...}}}, ... } once loaded. */
let PADEL_OPTIONS = {};
let padelOptionsLoaded = false;

/** The API's option_group names, in the order the panel shows them. */
const PADEL_GROUPS = [
  ["court_type",     "courtType",     "Court type"],
  ["wall_system",    "wallSystem",    "Wall system"],
  ["surface",        "surface",       "Surface"],
  ["surface_colour", "surfaceColour", "Surface colour"],
];

async function loadPadelOptions() {
  const res = await fetch(PADEL_OPTIONS_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sport options API returned ${res.status}`);
  const rows = await res.json();

  PADEL_OPTIONS = {};
  PADEL_GROUPS.forEach(([apiGroup, stateKey, label]) => {
    const values = {};
    rows.filter(r => r.optionGroup === apiGroup)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .forEach(r => {
          values[r.key] = {
            label: r.label,
            note: r.note || "",
            hex: r.colourHex || null,
            texture: r.textureHint || null,
            glassThickness_mm: r.thicknessMm ?? null,
            weight_kg_m2: r.weightKgM2 ?? null,
            price: r.priceValue ?? null,
            price_unit: r.priceUnit || null,
            price_quoted: !!r.priceIsQuoted,
            cost_group: r.costGroupDin276 || null,
          };
        });
    if (Object.keys(values).length) PADEL_OPTIONS[stateKey] = { label, values };
  });

  padelOptionsLoaded = true;
  // A default that named an option the catalog no longer has would silently
  // configure a court nobody chose.
  Object.entries(PADEL_OPTIONS).forEach(([key, group]) => {
    if (!group.values[padelState[key]]) padelState[key] = Object.keys(group.values)[0];
  });
  return PADEL_OPTIONS;
}

const padelState = {
  courtType: "double",
  wallSystem: "panoramic",
  surface: "artificial_grass",
  surfaceColour: "blue",
};

function padelDims(state = padelState) {
  return PADEL[state.courtType] || PADEL.double;
}

/* ── Weight ─────────────────────────────────────────────────────────────────
   Built up from the parts rather than quoted as one figure, so every line can
   be argued with. A court is the first real point load a sport puts on the
   deck, and the structural check currently sees none of it.

   Estimated, like every other price and weight in this app — flagged as such
   wherever it is shown. */
const PADEL_WEIGHTS = {
  temperedGlass_kg_m2: 30,       // ~12 mm toughened
  mesh_kg_m2: 3.5,               // panel plus its frame
  steelFrame_kg_m2_court: 9,     // posts and rails, spread over the court
  net_kg: 80,                    // net, cable and posts
  // The surface's own weight comes from the catalog row, so changing a product
  // changes the deck load without touching this file.
};

function padelWeight(state = padelState) {
  const d = padelDims(state);
  const halfLen = d.length_m / 2;

  // Back walls: full width, glass below, mesh above.
  const backGlass_m2 = 2 * d.width_m * PADEL.backWall.glassHeight_m;
  const backMesh_m2 = 2 * d.width_m * PADEL.backWall.meshHeight_m;

  // Sides: two glass steps at each of the four corners, mesh along the rest.
  const cornerGlass = PADEL.sideWall.cornerGlass, stepGlass = PADEL.sideWall.stepGlass;
  const sideGlassPerCorner_m2 = cornerGlass.length_m * cornerGlass.height_m
                              + stepGlass.length_m * stepGlass.height_m;
  const sideGlass_m2 = 4 * sideGlassPerCorner_m2;
  const centreMeshLength_m = d.length_m - 2 * (cornerGlass.length_m + stepGlass.length_m);
  const sideMesh_m2 = 2 * centreMeshLength_m * PADEL.sideWall.centreMeshHeight_m
                    + 4 * (cornerGlass.length_m + stepGlass.length_m)
                        * (PADEL.sideWall.cornerMeshHeight_m - stepGlass.height_m);

  const area_m2 = d.length_m * d.width_m;
  const parts = [
    { what: "Tempered glass", kg: (backGlass_m2 + sideGlass_m2) * PADEL_WEIGHTS.temperedGlass_kg_m2 },
    { what: "Mesh panels",    kg: (backMesh_m2 + sideMesh_m2) * PADEL_WEIGHTS.mesh_kg_m2 },
    { what: "Steel frame",    kg: area_m2 * PADEL_WEIGHTS.steelFrame_kg_m2_court },
    { what: "Net and posts",  kg: PADEL_WEIGHTS.net_kg },
    { what: "Playing surface", kg: area_m2 * (PADEL_OPTIONS.surface?.values?.[state.surface]?.weight_kg_m2 ?? 0) },
  ];
  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return { parts, total_kg, area_m2, perM2_kg: total_kg / area_m2, halfLen };
}


/* ── How a surface actually looks ───────────────────────────────────────────
   The three surfaces are not the same material in three colours. Turf is dyed
   fibre — the colour is slightly muted and the pile catches light in lines.
   Acrylic is paint on a bound base — flat, saturated, faintly sheened.
   Pigmented concrete is grey first and tinted second, whatever pigment went
   in. Drawing all three as one flat fill would say they are interchangeable,
   and the difference is exactly what a client is choosing between. */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
/** Moves a colour toward grey (t=1) or away from it (t<0 saturates). */
function mixToGrey(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex([r + (grey - r) * t, g + (grey - g) * t, b + (grey - b) * t]);
}
function shade(hex, t) {          // t>0 lighter, t<0 darker
  const [r, g, b] = hexToRgb(hex);
  const to = t > 0 ? 255 : 0, a = Math.abs(t);
  return rgbToHex([r + (to - r) * a, g + (to - g) * a, b + (to - b) * a]);
}

/**
 * The drawn appearance of a surface — base colour plus the texture that makes
 * it read as that material. Also what the Revit material is built from, so the
 * court looks the same in the model as it did in the panel.
 */
function padelSurfaceAppearance(state = padelState) {
  const picked = PADEL_OPTIONS.surfaceColour?.values?.[state.surfaceColour]?.hex || "#2f6fb5";
  // The texture is a property of the product, so it comes from the catalog —
  // a new surface added in the Catalogue tab says for itself how it should read.
  switch (PADEL_OPTIONS.surface?.values?.[state.surface]?.texture || state.surface) {
    case "speckle":
    case "concrete":
      // Grey first, pigment second. A "blue" concrete court is a grey court
      // with a blue cast, and showing it as vivid blue would be a promise the
      // material cannot keep.
      return { base: mixToGrey(picked, 0.66), texture: "speckle",
               accent: shade(mixToGrey(picked, 0.66), -0.18), gloss: 0 };
    case "sheen":
    case "acrylic":
      // Paint: the most saturated of the three, and the only one with a sheen.
      return { base: mixToGrey(picked, -0.12), texture: "sheen",
               accent: shade(picked, 0.12), gloss: 0.18 };
    case "pile":
    case "artificial_grass":
    default:
      // Dyed fibre: slightly muted, and the pile reads as fine lines.
      return { base: mixToGrey(picked, 0.14), texture: "pile",
               accent: shade(mixToGrey(picked, 0.14), -0.14), gloss: 0 };
  }
}

/** The <defs> pattern for a surface, unique per court so two can differ. */
function padelSurfaceDefs(id, state = padelState, sy = 10) {
  const a = padelSurfaceAppearance(state);
  const step = Math.max(2.5, sy * 0.28);
  if (a.texture === "pile") {
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${step}" height="${step}">
        <rect width="${step}" height="${step}" fill="${a.base}"/>
        <line x1="0" y1="0" x2="0" y2="${step}" stroke="${a.accent}" stroke-width="0.6" stroke-opacity="0.55"/>
      </pattern>`;
  }
  if (a.texture === "speckle") {
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${step * 1.6}" height="${step * 1.6}">
        <rect width="${step * 1.6}" height="${step * 1.6}" fill="${a.base}"/>
        <circle cx="${step * 0.4}" cy="${step * 0.5}" r="0.55" fill="${a.accent}" fill-opacity="0.7"/>
        <circle cx="${step * 1.2}" cy="${step * 1.1}" r="0.45" fill="${a.accent}" fill-opacity="0.55"/>
        <circle cx="${step * 0.9}" cy="${step * 0.2}" r="0.35" fill="${a.accent}" fill-opacity="0.45"/>
      </pattern>`;
  }
  // Acrylic: no grain at all — a smooth wash with a soft highlight.
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${a.accent}"/>
      <stop offset="0.55" stop-color="${a.base}"/>
      <stop offset="1" stop-color="${shade(a.base, -0.1)}"/>
    </linearGradient>`;
}

/* ── Drawing ────────────────────────────────────────────────────────────────
   One renderer, any scale. The configurator preview and the Combine canvas
   both call it — a padel court that reads as a padel court in the panel and as
   an orange rectangle on the roof would be two different claims about the same
   thing. `detail` drops the finer markings when the piece is small on screen. */

/**
 * @param x,y,w,h   the court's footprint in the target SVG's own units
 * @param state     the chosen options
 * @param detail    "full" | "simple" — simple omits text and the mesh hatch
 * @param isDark    theme, for line contrast
 */
function padelCourtSvg(x, y, w, h, state = padelState, detail = "full", isDark = false) {
  const d = padelDims(state);
  const sx = w / d.length_m;          // px per metre along the court
  const sy = h / d.width_m;

  const fillId = `padelSurf_${Math.random().toString(36).slice(2, 8)}`;
  const line = "#ffffff";
  const glass = isDark ? "#9fd8ff" : "#6fb7e8";
  const frame = isDark ? "#d6d9e8" : "#3a3f57";
  const lw = Math.max(0.6, PADEL.lineWidth_m * sx);

  const netX = x + w / 2;
  const svcOffset = PADEL.serviceLineFromNet_m * sx;
  const overrun = PADEL.centreLineOverrun_m * sx;

  let s = "";

  // Playing surface — the material's own texture, not a flat colour.
  s += `<defs>${padelSurfaceDefs(fillId, state, sy)}</defs>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${fillId})"/>`;

  // ── Markings ──
  // Service lines, one each side of the net, and the centre line between each
  // of them and the net. Padel's centre line does NOT run the full half —
  // it stops at the service line and overruns it by 20 cm.
  [-1, 1].forEach(sign => {
    const sxPos = netX + sign * svcOffset;
    s += `<line x1="${sxPos}" y1="${y}" x2="${sxPos}" y2="${y + h}" stroke="${line}" stroke-width="${lw}"/>`;
    s += `<line x1="${netX}" y1="${y + h / 2}" x2="${sxPos + sign * overrun}" y2="${y + h / 2}"
                stroke="${line}" stroke-width="${lw}"/>`;
  });
  // Perimeter
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;

  // ── The net ──
  s += `<line x1="${netX}" y1="${y}" x2="${netX}" y2="${y + h}"
              stroke="${frame}" stroke-width="${Math.max(1, lw * 1.6)}" stroke-dasharray="${lw * 2},${lw * 1.5}"/>`;

  // ── Enclosure ──
  // Glass reads solid, mesh reads hatched — the stepped side profile is the
  // whole point of padel's geometry and a plain outline cannot show it.
  const cg = PADEL.sideWall.cornerGlass.length_m * sx;
  const sg = PADEL.sideWall.stepGlass.length_m * sx;
  const t = Math.max(1.2, 0.12 * sy);     // drawn wall thickness

  // Back walls, full width, solid glass
  s += `<rect x="${x - t}" y="${y}" width="${t}" height="${h}" fill="${glass}" fill-opacity="0.85"/>`;
  s += `<rect x="${x + w}" y="${y}" width="${t}" height="${h}" fill="${glass}" fill-opacity="0.85"/>`;

  // Side walls: glass for the first two steps from each corner, mesh between
  [y - t, y + h].forEach(edgeY => {
    // corner + step glass at both ends
    s += `<rect x="${x}" y="${edgeY}" width="${cg + sg}" height="${t}" fill="${glass}" fill-opacity="0.85"/>`;
    s += `<rect x="${x + w - cg - sg}" y="${edgeY}" width="${cg + sg}" height="${t}" fill="${glass}" fill-opacity="0.85"/>`;
    // mesh along the centre
    s += `<rect x="${x + cg + sg}" y="${edgeY}" width="${w - 2 * (cg + sg)}" height="${t}"
                fill="${frame}" fill-opacity="${detail === "full" ? 0.35 : 0.5}"/>`;
    if (detail === "full") {
      // A few strokes to read as mesh rather than another solid panel.
      const x0 = x + cg + sg, x1 = x + w - cg - sg;
      for (let mx = x0; mx < x1; mx += Math.max(3, t * 1.6)) {
        s += `<line x1="${mx}" y1="${edgeY}" x2="${mx + t}" y2="${edgeY + t}"
                    stroke="${frame}" stroke-width="0.5" stroke-opacity="0.8"/>`;
      }
    }
  });

  // Posts at the corners and at each glass step — where the frame really is.
  const postR = Math.max(0.8, t * 0.6);
  [x, x + cg + sg, x + w - cg - sg, x + w].forEach(px => {
    [y, y + h].forEach(py => {
      s += `<circle cx="${px}" cy="${py}" r="${postR}" fill="${frame}"/>`;
    });
  });

  return s;
}

/* ── The configurator preview ────────────────────────────────────────────── */

function drawPadelPreview(svg, isDark) {
  const d = padelDims();
  const PADDING = 44;                       // room for the dimension labels
  const vw = 420, vh = 260;                 // matches the sport preview's box
  const aspect = d.length_m / d.width_m;
  let fw = vw - PADDING * 2, fh = fw / aspect;
  if (fh > vh - PADDING * 2) { fh = vh - PADDING * 2; fw = fh * aspect; }
  const ox = (vw - fw) / 2, oy = (vh - fh) / 2;

  const dim = isDark ? "#a0a3c9" : "#62658a";
  const w = padelWeight();

  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  svg.innerHTML = `
    ${padelCourtSvg(ox, oy, fw, fh, padelState, "full", isDark)}
    <text x="${ox + fw / 2}" y="${oy - 16}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">${d.length_m} m</text>
    <text x="${ox - 16}" y="${oy + fh / 2}" text-anchor="middle" font-size="11" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif"
          transform="rotate(-90, ${ox - 16}, ${oy + fh / 2})">${d.width_m} m</text>
    <text x="${ox + fw / 2}" y="${oy + fh + 22}" text-anchor="middle" font-size="10" fill="${dim}"
          font-family="'Titillium Web', Arial, sans-serif">
      net ${PADEL.net.centreHeight_m} m · service line ${PADEL.serviceLineFromNet_m} m from net ·
      back wall ${PADEL.backWall.glassHeight_m + PADEL.backWall.meshHeight_m} m ·
      ${Math.round(w.total_kg).toLocaleString("en-US")} kg
    </text>`;
}

/* ── The panel ──────────────────────────────────────────────────────────────
   Four choices, and the rest stated as specification. The size boxes hide
   while padel is selected: 20 x 10 m is what makes it a padel court, and a
   number input invites something that is not one. */

function padelPanelHtml() {
  const d = padelDims(), w = padelWeight();
  const pick = (key) => {
    const o = PADEL_OPTIONS[key];
    if (!o) return "";
    const opts = Object.entries(o.values).map(([v, def]) =>
      `<option value="${v}"${padelState[key] === v ? " selected" : ""}>${escapeHtml(def.label)}</option>`).join("");
    const note = o.values[padelState[key]]?.note;
    return `<div class="section">
        <label>${escapeHtml(o.label)}</label>
        <select data-padel="${key}">${opts}</select>
        ${note ? `<p class="hint">${note}</p>` : ""}
      </div>`;
  };

  return `
    <div class="section">
      <label>Specification — FIP</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${d.length_m} × ${d.width_m} m</div><div class="lbl">Court</div></div>
        <div class="dim-card"><div class="val">${PADEL.net.centreHeight_m} m</div><div class="lbl">Net at centre</div></div>
        <div class="dim-card"><div class="val">${PADEL.backWall.glassHeight_m + PADEL.backWall.meshHeight_m} m</div><div class="lbl">Back wall</div></div>
        <div class="dim-card"><div class="val">${PADEL.clearHeight.minimum_m} m</div><div class="lbl">Clear height needed</div></div>
      </div>
      <p class="hint">
        Fixed by the <a href="https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf"
        target="_blank" rel="noopener">FIP rules</a>, so not editable — a court built to other numbers is not a padel court.
      </p>
    </div>
    ${PADEL_GROUPS.map(([, stateKey]) => pick(stateKey)).join("")}
    <div class="section">
      <label>Weight on the deck</label>
      <div class="dims">
        ${w.parts.map(p => `<div class="dim-card"><div class="val">${Math.round(p.kg).toLocaleString("en-US")}</div><div class="lbl">${p.what}, kg</div></div>`).join("")}
        <div class="dim-card"><div class="val">${Math.round(w.perM2_kg)} kg/m²</div><div class="lbl">${Math.round(w.total_kg).toLocaleString("en-US")} kg total</div></div>
      </div>
      <p class="hint">Estimated, from the parts — so every line can be argued with. The structural check reads the total.</p>
    </div>`;
}

/** Shown only while padel is the selected activity; hides the generic size boxes. */
function syncPadelPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host) return;
  const isPadel = activityId === "padel_court";

  // The catalog lives in the database, so there is nothing to configure until
  // it has been fetched. Said plainly rather than shown as empty dropdowns,
  // which would read as "this court has no options".
  if (isPadel && !padelOptionsLoaded) {
    host.innerHTML = `<div class="section"><p class="hint">Loading court options…</p></div>`;
    loadPadelOptions()
      .then(() => syncPadelPanel(activityId))
      .catch(err => {
        host.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Court options live in the Sportify API, and it isn't answering (${escapeHtml(err.message)}).</p>
            <p class="hint">Start it with <code>dotnet run --launch-profile http</code> in <code>Sportify.Api</code>.</p>
            <button class="btn-export accent" id="btn-padel-retry">Retry</button>
          </div>`;
        document.getElementById("btn-padel-retry")?.addEventListener("click", () => syncPadelPanel(activityId));
      });
    return;
  }

  document.querySelectorAll("#activity-params .section").forEach(sec => {
    const label = sec.querySelector("label")?.textContent?.trim();
    if (label === "Length (m)" || label === "Width (m)" || label === "Material quality") {
      sec.hidden = isPadel;
    }
  });

  host.innerHTML = isPadel ? padelPanelHtml() : "";
  if (!isPadel) return;

  host.querySelectorAll("[data-padel]").forEach(sel => {
    sel.addEventListener("change", e => {
      padelState[e.target.dataset.padel] = e.target.value;
      syncPadelPanel(activityId);
      if (typeof drawActivity === "function") drawActivity(activityId, null, isDarkMode());
    });
  });
}

/* ── What travels with a placed court ───────────────────────────────────────
   The chosen options, the weight they produce, and the clear height the court
   needs above it. Carried on the placement so a saved layout keeps the court
   it was configured with, and so the structural and clearance checks have
   something real to read. */

function padelPlacementPayload(state = padelState) {
  const d = padelDims(state), w = padelWeight(state), a = padelSurfaceAppearance(state);
  return {
    court_type: state.courtType,
    wall_system: state.wallSystem,
    surface: state.surface,
    surface_colour: state.surfaceColour,
    // The drawn appearance, so the Revit material matches what was on screen.
    appearance_hex: a.base,
    length_m: d.length_m,
    width_m: d.width_m,
    // Geometry Revit builds from, all FIP figures.
    net_centre_height_m: PADEL.net.centreHeight_m,
    net_post_height_m: PADEL.net.postHeight_m,
    service_line_from_net_m: PADEL.serviceLineFromNet_m,
    back_wall_glass_height_m: PADEL.backWall.glassHeight_m,
    back_wall_mesh_height_m: PADEL.backWall.meshHeight_m,
    side_corner_glass: PADEL.sideWall.cornerGlass,
    side_step_glass: PADEL.sideWall.stepGlass,
    side_centre_mesh_height_m: PADEL.sideWall.centreMeshHeight_m,
    glass_thickness_mm: PADEL_OPTIONS.wallSystem?.values?.[state.wallSystem]?.glassThickness_mm ?? 10,
    // A court needs 6 m of clear air above it. Carried so the clearance can be
    // checked rather than assumed.
    clear_height_min_m: PADEL.clearHeight.minimum_m,
    clear_height_recommended_m: PADEL.clearHeight.recommended_m,
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    weight_breakdown: w.parts.map(p => ({ part: p.what, kg: Math.round(p.kg) })),
    weight_basis: "estimated",
    source: "FIP Rules of Padel (2026 revision)",
  };
}

/** The options a placed court was configured with, or today's defaults. */
function padelStateForItem(item) {
  const p = item?.sourceJson?.padel;
  if (!p) return padelState;
  return {
    courtType: p.court_type || "double",
    wallSystem: p.wall_system || "panoramic",
    surface: p.surface || "artificial_grass",
    surfaceColour: p.surface_colour || "blue",
  };
}

/** True when this placed piece is a padel court. */
function isPadelItem(item) {
  return item?.sourceJson?.activity?.type_id === "padel_court" || !!item?.sourceJson?.padel;
}
