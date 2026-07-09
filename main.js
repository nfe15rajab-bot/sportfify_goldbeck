/**
 * main.js — Sportify app controller
 * Manages UI state, wires up all events, and handles JSON/DXF export.
 */

/* ── App state ── */
const state = {
  sport: "polyvalent",
  variant: "mini",
  capacity: 0,
  quality: "medium",
};

function isDarkMode() {
  return (
    document.documentElement.dataset.mode === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/* ── UI update ── */
function updateUI() {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;

  document.getElementById("d-l").textContent   = d.l;
  document.getElementById("d-w").textContent   = d.w;
  document.getElementById("d-run").textContent = d.runoff;
  document.getElementById("d-h").textContent   = d.h;

  const sportSelect = document.getElementById("sport");
  const sportLabel  = sportSelect.options[sportSelect.selectedIndex].text
                        .replace(/\s*\(.*\)/, "");
  const variantLabel = state.variant.charAt(0).toUpperCase() + state.variant.slice(1);
  document.getElementById("field-label").textContent = `${sportLabel} — ${variantLabel}`;
  document.getElementById("norm-badge").textContent  = d.norm;

  drawField(state.sport, state.variant, state.capacity, isDarkMode());
}

/* ── Event listeners ── */
document.getElementById("sport").addEventListener("change", e => {
  state.sport = e.target.value;
  spawnBurst(state.sport);
  updateUI();
});

document.getElementById("variant").addEventListener("change", e => {
  state.variant = e.target.value;
  updateUI();
});

document.getElementById("capacity").addEventListener("input", e => {
  state.capacity = Number(e.target.value);
  document.getElementById("cap-val").textContent =
    state.capacity === 0 ? "No stands" : `${state.capacity} seats`;
  updateUI();
});

document.querySelectorAll("#sportConfigurator .q-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#sportConfigurator .q-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.quality = btn.dataset.q;
  });
});

/* ── Sport JSON payload (shared by Export JSON and Push to Combine) ── */
function buildSportPayload() {
  const d   = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const mat = MATERIALS[state.quality];

  return {
    version: "1.0",
    generator: "Sportify",
    quality_key: getQualityKey(state.sport, state.variant, state.quality),
    field: {
      sport:   state.sport,
      variant: state.variant,
      norm:    d.norm,
      dimensions: {
        length_m:     d.l,
        width_m:      d.w,
        runoff_m:     d.runoff,
        min_height_m: d.h,
      },
      capacity: {
        seats:       state.capacity,
        side_stands: state.capacity > 0,
      },
    },
    materials: {
      floor_surface: mat.floor,
      line_marking:  mat.marking,
      gradin_type:   mat.gradin,
      quality_level: state.quality,
    },
    // Layer names map 1:1 to DXF layers and Revit family parameters
    layers: [
      "field_boundary",
      "center_line",
      "center_circle",
      "goal_area",
      "penalty_area",
      "run_off_zone",
      "stands",
    ],
  };
}

/* ── JSON Export ── */
document.getElementById("btn-json").addEventListener("click", exportJSON);

function exportJSON() {
  const payload = buildSportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_${state.sport}_${state.variant}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── DXF Export ── */
document.getElementById("btn-dxf").addEventListener("click", exportDXF);

function exportDXF() {
  const d      = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const entities = buildDXFEntities(d, state.sport, state.capacity);
  const dxf      = serialiseDXF(entities);

  const blob = new Blob([dxf], { type: "application/dxf" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `sportify_${state.sport}_${state.variant}.dxf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * buildDXFEntities(d, sport, capacity)
 *
 * Returns an array of entity objects.  All coordinates are in METRES.
 * Origin (0, 0) = bottom-left corner of the run-off zone.
 * The field itself starts at (runoff, runoff).
 *
 * Entity shapes
 * ─────────────
 *   LINE   : { type:"LINE",   layer, x1, y1, x2, y2 }
 *   ARC    : { type:"ARC",    layer, cx, cy, r, a1, a2 }   angles in degrees, CCW
 *   CIRCLE : { type:"CIRCLE", layer, cx, cy, r }
 *
 * Layers produced (match JSON "layers" array + Revit family param names)
 * ────────────────────────────────────────────────────────────────────────
 *   run_off_zone      dashed safety clearance rectangle
 *   field_boundary    outer perimeter of the playing area
 *   center_line       longitudinal half-way line
 *   center_circle     centre circle / dot
 *   goal_area         goal mouth rectangle (football, handball)
 *   penalty_area      penalty / free-throw box (football, basketball)
 *   penalty_spot      penalty spot / free-throw arc (football, basketball)
 *   service_box       service courts (badminton, volleyball attack line)
 *   stands            spectator stand outlines (when capacity > 0)
 * ─────────────────────────────────────────────────────────────────────────── */
function buildDXFEntities(d, sport, capacity = 0) {
  const ro = d.runoff;          // run-off margin (m)
  const L  = d.l;               // field length (m)
  const W  = d.w;               // field width  (m)
  const ox = ro;                // field origin X (inside run-off)
  const oy = ro;                // field origin Y
  const cx = ox + L / 2;       // field centre X
  const cy = oy + W / 2;       // field centre Y
  const ents = [];

  /* ── helpers ── */

  // 4-line rectangle outline
  function rect(layer, x, y, w, h) {
    ents.push(
      { type: "LINE", layer, x1: x,     y1: y,     x2: x + w, y2: y     },
      { type: "LINE", layer, x1: x + w, y1: y,     x2: x + w, y2: y + h },
      { type: "LINE", layer, x1: x + w, y1: y + h, x2: x,     y2: y + h },
      { type: "LINE", layer, x1: x,     y1: y + h, x2: x,     y2: y     },
    );
  }

  function line(layer, x1, y1, x2, y2)      { ents.push({ type: "LINE",   layer, x1, y1, x2, y2 }); }
  function circle(layer, xcx, ycy, r)       { ents.push({ type: "CIRCLE", layer, cx: xcx, cy: ycy, r }); }
  function arc(layer, xcx, ycy, r, a1, a2)  { ents.push({ type: "ARC",    layer, cx: xcx, cy: ycy, r, a1, a2 }); }

  /* ════════════════════════════════════════════
   * SHARED ELEMENTS (all sports)
   * ════════════════════════════════════════════ */

  // Run-off zone (dashed in CAD by convention — layer name signals it)
  rect("run_off_zone", 0, 0, L + ro * 2, W + ro * 2);

  // Field boundary
  rect("field_boundary", ox, oy, L, W);

  // Centre line (longitudinal)
  line("center_line", cx, oy, cx, oy + W);

  /* ════════════════════════════════════════════
   * SPORT-SPECIFIC ELEMENTS
   * ════════════════════════════════════════════ */

  switch (sport) {

    /* ── POLYVALENT ────────────────────────────
     * Multi-sport hall: centre circle + dot only.
     * Lines for individual sports are taped on top
     * in reality; we export just the base geometry.
     * ────────────────────────────────────────── */
    case "polyvalent": {
      const r = Math.min(L, W) * 0.1;   // ~10 % of shorter dimension
      circle("center_circle", cx, cy, r);
      circle("center_circle", cx, cy, 0.15);  // centre dot (r = 15 cm)
      break;
    }

    /* ── BASKETBALL (FIBA / DIN 18032) ─────────
     * • Centre circle r = 1.80 m
     * • Paint (key) box: 5.80 m wide × 4.90 m deep from baseline
     * • Free-throw line 5.80 m wide at 4.60 m from baseline
     * • Restricted arc r = 1.25 m from basket centre
     * • Three-point arc r = 6.75 m (FIBA), flat sides 0.90 m from sideline
     * • Basket positions 1.575 m from baseline
     * ────────────────────────────────────────── */
    case "basketball": {
      circle("center_circle", cx, cy, 1.80);
      circle("center_circle", cx, cy, 0.15);

      const paintW = 5.80, paintD = 4.90;
      const ftLineD = 4.60;
      const restrictedR = 1.25;
      const threeR = 6.75;
      const basketOffset = 1.575;

      [ox, ox + L].forEach((baseX, side) => {
        const dir = side === 0 ? 1 : -1;

        // Paint (key) box
        rect("penalty_area",
          side === 0 ? baseX : baseX - paintD,
          cy - paintW / 2, paintD, paintW);

        // Free-throw line
        line("penalty_area",
          baseX + dir * ftLineD, cy - paintW / 2,
          baseX + dir * ftLineD, cy + paintW / 2);

        // Restricted arc under the basket
        arc("penalty_spot",
          baseX + dir * basketOffset, cy, restrictedR,
          side === 0 ? -90 : 90, side === 0 ? 90 : 270);

        // Three-point arc
        arc("service_box",
          baseX + dir * basketOffset, cy, threeR,
          side === 0 ? -70 : 110, side === 0 ? 70 : 250);

        // Basket spot
        circle("penalty_spot", baseX + dir * basketOffset, cy, 0.10);
      });
      break;
    }

    /* ── HANDBALL (IHF / DIN 18032) ────────────
     * • Goal area (6 m line): arc radius 6 m from each goal post
     * • Free-throw line (9 m line): arc radius 9 m, dashed
     * • Goal mouth 3 m wide × 2 m high
     * • Penalty spot (7 m mark)
     * ────────────────────────────────────────── */
    case "handball": {
      circle("center_circle", cx, cy, 0.15);

      const goalW = 3.00;
      const goalD = 0.20;
      const goalArcR = 6.00;
      const ftArcR = 9.00;

      [ox, ox + L].forEach((baseX, side) => {
        const dir = side === 0 ? 1 : -1;
        const postL = cy - goalW / 2;
        const postR = cy + goalW / 2;

        // Goal mouth
        rect("goal_area",
          side === 0 ? baseX : baseX - goalD,
          postL, goalD, goalW);

        // Goal area (6 m line)
        line("goal_area", baseX, postL, baseX + dir * goalArcR, postL);
        line("goal_area", baseX, postR, baseX + dir * goalArcR, postR);
        if (side === 0) arc("goal_area", baseX, cy, goalArcR, -90, 90);
        else            arc("goal_area", baseX, cy, goalArcR,  90, 270);

        // Free-throw dashed arc (same geometry, different layer)
        line("penalty_area", baseX, postL, baseX + dir * ftArcR, postL);
        line("penalty_area", baseX, postR, baseX + dir * ftArcR, postR);
        if (side === 0) arc("penalty_area", baseX, cy, ftArcR, -90, 90);
        else            arc("penalty_area", baseX, cy, ftArcR,  90, 270);

        // Penalty spot (7 m mark)
        circle("penalty_spot", baseX + dir * 7.00, cy, 0.10);
      });
      break;
    }

    /* ── VOLLEYBALL (FIVB / DIN 18032) ─────────
     * • Net line (centre line already drawn above)
     * • Attack lines 3.00 m from centre on each side
     * • Service zones: 3 m deep from each baseline, full width
     * • Libero substitution zone boxes (optional — on "service_box" layer)
     * ────────────────────────────────────────── */
    case "volleyball": {
      circle("center_circle", cx, cy, 0.15);  // centre mark

      const attackDist = 3.00;
      // Attack lines (parallel to net, 3 m each side)
      line("penalty_area", cx - attackDist, oy,     cx - attackDist, oy + W);
      line("penalty_area", cx + attackDist, oy,     cx + attackDist, oy + W);

      // Service zones (3 m deep from baselines)
      rect("service_box", ox,           oy, 3.00, W);
      rect("service_box", ox + L - 3.00, oy, 3.00, W);
      break;
    }

    /* ── BADMINTON (BWF / DIN 18032) ───────────
     * Standard doubles court layout:
     * • Net line (centre line already drawn)
     * • Long-service line for doubles: 0.76 m from baseline
     * • Short-service line: 1.98 m from net, both sides
     * • Side tramlines: 0.46 m inside the singles sideline
     * • Back tramlines: full width
     * ────────────────────────────────────────── */
    case "badminton": {
      circle("center_circle", cx, cy, 0.10);

      const longSvc  = 0.76;   // from baseline
      const shortSvc = 1.98;   // from net (centre line)
      const side     = 0.46;   // doubles side alley width

      // Short-service lines (both sides of net)
      line("service_box", ox, oy + W / 2 - shortSvc, ox + L, oy + W / 2 - shortSvc);  // net side left
      line("service_box", ox, oy + W / 2 + shortSvc, ox + L, oy + W / 2 + shortSvc);  // net side right

      // Long-service lines for doubles (inside baselines)
      line("service_box", ox + longSvc,     oy, ox + longSvc,     oy + W);
      line("service_box", ox + L - longSvc, oy, ox + L - longSvc, oy + W);

      // Singles sidelines (inside the full-width court)
      line("service_box", ox, oy + side,     ox + L, oy + side);
      line("service_box", ox, oy + W - side, ox + L, oy + W - side);
      break;
    }

    /* ── FOOTBALL / FUTSAL (DFB / DIN 18032) ───
     * • Goal mouth: FIFA Futsal — 3.00 m wide × 2.00 m high
     * • Penalty area: 6.00 m arc radius from inner post centres
     * • Penalty spot: 6.00 m from goal line centre
     * • Second-penalty spot: 10.00 m
     * • Centre circle r = 3.00 m
     * ────────────────────────────────────────── */
    case "football": {
      circle("center_circle", cx, cy, 3.00);
      circle("center_circle", cx, cy, 0.15);

      const goalW  = 3.00;
      const goalD  = 2.00;
      const penR   = 6.00;

      [ox, ox + L].forEach((baseX, side) => {
        const dir   = side === 0 ? 1 : -1;
        const postL = cy - goalW / 2;
        const postR = cy + goalW / 2;

        // Goal mouth (open towards field)
        rect("goal_area", baseX + (dir > 0 ? 0 : -goalD), postL, goalD * dir, goalW);

        // Penalty area arc (D)
        line("penalty_area", baseX, postL, baseX + dir * penR, postL);
        line("penalty_area", baseX, postR, baseX + dir * penR, postR);
        if (side === 0) arc("penalty_area", baseX, cy, penR, -90, 90);
        else            arc("penalty_area", baseX, cy, penR,  90, 270);

        // Penalty spot (6 m)
        circle("penalty_spot", baseX + dir * 6.00, cy, 0.15);
        // Second penalty spot (10 m)
        circle("penalty_spot", baseX + dir * 10.00, cy, 0.10);
      });
      break;
    }

    default:
      circle("center_circle", cx, cy, Math.min(L, W) * 0.1);
      break;
  }

  /* ════════════════════════════════════════════
   * STANDS (when capacity > 0)
   * Simple outline blocks either side of the field.
   * Width scales with capacity tier.
   * ════════════════════════════════════════════ */
  if (capacity > 0) {
    const sw = capacity >= 300 ? 5 : capacity >= 100 ? 3 : 1.5;  // stand depth in metres
    rect("stands", ox - ro - sw, oy, sw, W);   // left stand
    rect("stands", ox + L + ro,  oy, sw, W);   // right stand
  }

  return ents;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * serialiseDXF(entities)
 *
 * Converts the entity array into a valid R12 ASCII DXF string.
 * Supports LINE, ARC, and CIRCLE entity types.
 *
 * DXF R12 group-code reference used here:
 *   0  = entity type keyword
 *   8  = layer name
 *   10/20/30 = X/Y/Z of first point (or centre)
 *   11/21/31 = X/Y/Z of second point (LINE endpoint)
 *   40 = radius (ARC, CIRCLE)
 *   50 = start angle in degrees (ARC)
 *   51 = end angle in degrees (ARC)
 * ─────────────────────────────────────────────────────────────────────────── */
function serialiseDXF(entities) {
  const layerNames = [...new Set(entities.map(e => e.layer))];

  // ── HEADER section (minimal — just declares the file is R12) ──
  let dxf = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",
    "1", "AC1009",   // AutoCAD R12 format — widest compatibility
    "0", "ENDSEC",
  ].join("\n") + "\n";

  // ── TABLES section — layer definitions ──
  dxf += [
    "0", "SECTION",
    "2", "TABLES",
    "0", "TABLE",
    "2", "LAYER",
    "70", String(layerNames.length),
  ].join("\n") + "\n";

  // Layer colour codes (ACI palette):  7 = white/black, 1 = red, 3 = green, 4 = cyan, 5 = blue
  const LAYER_COLORS = {
    run_off_zone:  8,   // dark gray (dashed in host CAD app)
    field_boundary: 7,  // white / black
    center_line:   7,
    center_circle: 7,
    goal_area:     1,   // red
    penalty_area:  3,   // green
    penalty_spot:  4,   // cyan
    service_box:   5,   // blue
    stands:        6,   // magenta
  };

  layerNames.forEach(name => {
    const color = LAYER_COLORS[name] || 7;
    dxf += ["0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS"].join("\n") + "\n";
  });

  dxf += ["0", "ENDTAB", "0", "ENDSEC"].join("\n") + "\n";

  // ── ENTITIES section ──
  dxf += ["0", "SECTION", "2", "ENTITIES"].join("\n") + "\n";

  entities.forEach(e => {
    const f = n => n.toFixed(4);   // 4 decimal places = 0.1 mm precision

    if (e.type === "LINE") {
      dxf += [
        "0",  "LINE",
        "8",  e.layer,
        "10", f(e.x1), "20", f(e.y1), "30", "0.0000",
        "11", f(e.x2), "21", f(e.y2), "31", "0.0000",
      ].join("\n") + "\n";
    }

    else if (e.type === "CIRCLE") {
      dxf += [
        "0",  "CIRCLE",
        "8",  e.layer,
        "10", f(e.cx), "20", f(e.cy), "30", "0.0000",
        "40", f(e.r),
      ].join("\n") + "\n";
    }

    else if (e.type === "ARC") {
      dxf += [
        "0",  "ARC",
        "8",  e.layer,
        "10", f(e.cx), "20", f(e.cy), "30", "0.0000",
        "40", f(e.r),
        "50", f(e.a1),   // start angle (degrees, CCW from +X)
        "51", f(e.a2),   // end angle
      ].join("\n") + "\n";
    }
  });

  dxf += ["0", "ENDSEC", "0", "EOF"].join("\n") + "\n";
  return dxf;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GARDEN MODE
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Garden state ── */
const gardenState = {
  roofType: "extensive",
  parcelLength: 10,
  parcelWidth: 6,
  quality: "medium",
};

/* ── Garden JSON payload (shared by Export JSON and Push to Combine) ── */
function buildGardenPayload() {
  const roof = GARDEN_ROOF_TYPES[gardenState.roofType];
  const mat  = GARDEN_MATERIALS[gardenState.quality];

  return {
    version: "1.0",
    generator: "Sportify-Garden",
    quality_key: getGardenQualityKey(gardenState.roofType, gardenState.quality),
    garden: {
      roof_type: gardenState.roofType,
      norm: roof.norm,
      parcel: {
        length_m: gardenState.parcelLength,
        width_m: gardenState.parcelWidth,
      },
      layers: LAYER_ORDER.map(key => ({
        name: key,
        thickness_m: roof.layers[key].thickness_m,
        material: roof.layers[key].material,
      })),
      total_thickness_m: getGardenTotalThickness(gardenState.roofType),
    },
    materials: {
      waterproofing: mat.waterproofing,
      drainage: mat.drainage,
      quality_level: gardenState.quality,
    },
  };
}

/* ── Mode switching ── */
document.getElementById("modeSport").addEventListener("click", () => setMode("sport"));
document.getElementById("modeGarden").addEventListener("click", () => setMode("garden"));
document.getElementById("modeCombine").addEventListener("click", () => setMode("combine"));

function setMode(mode) {
  document.getElementById("sportConfigurator").style.display   = mode === "sport"   ? "block" : "none";
  document.getElementById("gardenConfigurator").style.display  = mode === "garden"  ? "block" : "none";
  document.getElementById("combineConfigurator").style.display = mode === "combine" ? "block" : "none";

  document.getElementById("field").style.display          = mode === "sport"   ? "block" : "none";
  document.getElementById("garden-field").style.display    = mode === "garden"  ? "block" : "none";
  document.getElementById("combine-canvas").style.display   = mode === "combine" ? "block" : "none";

  document.getElementById("modeSport").classList.toggle("active", mode === "sport");
  document.getElementById("modeGarden").classList.toggle("active", mode === "garden");
  document.getElementById("modeCombine").classList.toggle("active", mode === "combine");

  if (mode === "sport") updateUI();
  else if (mode === "garden") updateGardenUI();
  else updateCombineUI();
}

/* ── Garden UI update ── */
function updateGardenUI() {
  const roof = GARDEN_ROOF_TYPES[gardenState.roofType];

  document.getElementById("field-label").textContent =
    `${roof.label} green roof — ${gardenState.parcelLength}m × ${gardenState.parcelWidth}m`;
  document.getElementById("norm-badge").textContent = roof.norm;

  const dimsContainer = document.getElementById("garden-layer-dims");
  dimsContainer.innerHTML = LAYER_ORDER.map(key => {
    const l = roof.layers[key];
    return `
      <div class="dim-card">
        <div class="val">${(l.thickness_m * 100).toFixed(1)} cm</div>
        <div class="lbl">${l.material}</div>
      </div>
    `;
  }).join("");

  drawGardenField(gardenState.roofType, gardenState.parcelLength, gardenState.parcelWidth, isDarkMode());
}

document.getElementById("roofType").addEventListener("change", e => {
  gardenState.roofType = e.target.value;
  updateGardenUI();
});

document.getElementById("parcelLength").addEventListener("input", e => {
  gardenState.parcelLength = Number(e.target.value) || 1;
  updateGardenUI();
});

document.getElementById("parcelWidth").addEventListener("input", e => {
  gardenState.parcelWidth = Number(e.target.value) || 1;
  updateGardenUI();
});

document.querySelectorAll("#garden-quality-btns .q-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#garden-quality-btns .q-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    gardenState.quality = btn.dataset.q;
  });
});

/* ── Garden JSON export ── */
document.getElementById("btn-garden-json").addEventListener("click", exportGardenJSON);

function exportGardenJSON() {
  const payload = buildGardenPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_garden_${gardenState.roofType}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * COMBINE MODE
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Combine state ──
 * sport / garden hold: { label, length_m, width_m, rotation, x_m, y_m, sourceJson }
 * rotation is 0 or 90 (degrees). x_m/y_m are the TOP-LEFT corner of the
 * (unrotated) footprint's bounding box, in meters, relative to the roof's
 * top-left corner. getFootprint() in combineField.js swaps length/width
 * when rotation === 90 to get the on-canvas box size.
 * ── */
const combineState = {
  roof: { length: 15, width: 10 },
  sport: null,
  garden: null,
  selected: null,
};

/* ── Push to Combine ── */
document.getElementById("btn-push-sport").addEventListener("click", () => {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const existing = combineState.sport;
  combineState.sport = {
    label: `${state.sport} (${state.variant})`,
    // Footprint includes the run-off safety margin — that's the real
    // physical space the field needs on the roof, not just the pitch itself.
    length_m: d.l + d.runoff * 2,
    width_m:  d.w + d.runoff * 2,
    rotation: existing?.rotation ?? 0,
    x_m: existing?.x_m ?? 0.5,
    y_m: existing?.y_m ?? 0.5,
    sourceJson: buildSportPayload(),
  };
  setMode("combine");
});

document.getElementById("btn-push-garden").addEventListener("click", () => {
  const existing = combineState.garden;
  combineState.garden = {
    label: `${gardenState.roofType} garden`,
    length_m: gardenState.parcelLength,
    width_m:  gardenState.parcelWidth,
    rotation: existing?.rotation ?? 0,
    x_m: existing?.x_m ?? 0.5,
    y_m: existing?.y_m ?? 0.5,
    sourceJson: buildGardenPayload(),
  };
  setMode("combine");
});

/* ── Combine UI update ── */
function updateCombineUI() {
  document.getElementById("field-label").textContent = "Combine — roof layout";
  document.getElementById("norm-badge").textContent  = "Prototype";
  drawCombineCanvas();
}

document.getElementById("roofLength").addEventListener("input", e => {
  combineState.roof.length = Number(e.target.value) || 1;
  drawCombineCanvas();
});

document.getElementById("roofWidth").addEventListener("input", e => {
  combineState.roof.width = Number(e.target.value) || 1;
  drawCombineCanvas();
});

/* ── Rotate selected 90° ── */
document.getElementById("btn-rotate").addEventListener("click", () => {
  const sel = combineState.selected;
  if (!sel || !combineState[sel]) return;
  combineState[sel].rotation = (combineState[sel].rotation + 90) % 180;
  drawCombineCanvas();
});

/* ── Auto placement — positions garden relative to the sport field ── */
function autoPlace(direction) {
  if (!combineState.sport || !combineState.garden) return;
  const gap = 0.5; // meters between the two footprints

  const anchor = combineState.sport;
  const other  = combineState.garden;
  const aFp = getFootprint(anchor);
  const oFp = getFootprint(other);

  anchor.x_m = 0.5;
  anchor.y_m = 0.5;

  switch (direction) {
    case "right":
      other.x_m = anchor.x_m + aFp.w + gap;
      other.y_m = anchor.y_m;
      break;
    case "left":
      other.x_m = Math.max(0, anchor.x_m - oFp.w - gap);
      other.y_m = anchor.y_m;
      break;
    case "front": // "in front of" = further down in plan view (+Y)
      other.x_m = anchor.x_m;
      other.y_m = anchor.y_m + aFp.h + gap;
      break;
    case "behind":
      other.x_m = anchor.x_m;
      other.y_m = Math.max(0, anchor.y_m - oFp.h - gap);
      break;
  }
  drawCombineCanvas();
}

document.getElementById("btn-auto-left").addEventListener("click", () => autoPlace("left"));
document.getElementById("btn-auto-right").addEventListener("click", () => autoPlace("right"));
document.getElementById("btn-auto-front").addEventListener("click", () => autoPlace("front"));
document.getElementById("btn-auto-behind").addEventListener("click", () => autoPlace("behind"));

/* ── Combined JSON export ── */
document.getElementById("btn-combine-json").addEventListener("click", () => {
  if (!combineState.sport && !combineState.garden) return;

  const placements = [];
  if (combineState.sport) {
    placements.push({
      type: "sport",
      x_m: combineState.sport.x_m,
      y_m: combineState.sport.y_m,
      rotation_deg: combineState.sport.rotation,
      source: combineState.sport.sourceJson,
    });
  }
  if (combineState.garden) {
    placements.push({
      type: "garden",
      x_m: combineState.garden.x_m,
      y_m: combineState.garden.y_m,
      rotation_deg: combineState.garden.rotation,
      source: combineState.garden.sourceJson,
    });
  }

  const payload = {
    version: "1.0",
    generator: "Sportify-Combine",
    roof: {
      length_m: combineState.roof.length,
      width_m:  combineState.roof.width,
    },
    placements,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_combined.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ── Init ── */
spawnBurst("polyvalent");
updateUI();
initCombineInteractions();