/**
 * prebuiltSessions.js — Goldbeck IFC roof prebuilt sessions
 * Three layout patterns on the actual Goldbeck roof footprint (67.6 m x
 * 21.0 m — 67.62 m overall length read directly off the dimensioned
 * IFC/CAD plan; width estimated at ~21 m from the plan's summed vertical
 * dimension chains, since no single chain spans edge-to-edge) with 4 entry
 * points at the midpoint of each edge (matching the plan's own Nord/Süd/
 * West/Ost arrows -> top/bottom/left/right).
 *
 * GOLDBECK_PREBUILT_SESSIONS holds a generate() FUNCTION per pattern, not a
 * static payload — "Shuffle" (sessionGate.js's preset cards, and Combine's
 * own Shuffle Boundary button) calls generate() again for a fresh variant.
 * gardenBoundary/sportsBoundary vary their garden-vs-sport boundary band
 * depth within a range hand-verified to always leave enough room for a
 * badminton court plus real circulation margin (see BAND_DEPTH_RANGE
 * below); hybridChess keeps its grid geometry fixed (the checkerboard cells
 * are already at the minimum size a real court fits) and instead reshuffles
 * which theme/quality appears in each cell. Every generate() call is
 * validated against the app's OWN real getFootprint/findOverlappingIds/
 * findOutOfBoundsIds/computeCirculation (not a reimplementation) before
 * being handed back — on the rare chance a randomly chosen depth fails
 * (shouldn't happen inside the hand-verified range, but this is a real
 * safety net, not decoration), it retries a few times and finally falls
 * back to the pattern's own known-good default depth.
 *
 * A generated payload is the same shape as buildCombinedPayload()
 * (combineController.js) and loads straight into applySessionSnapshot() —
 * indistinguishable from a planner's own saved session: fully editable
 * afterward, "Save Session" writes a normal local copy.
 */

/* ---- real reference-data item factories (mirrors sportController.js/gardenController.js payload shapes) ---- */
const GOLDBECK_FIELDS = {
  badminton: { l: 13.4, w: 6.1, runoff: 2, h: 9, norm: "BWF / DIN 18032" },
};
const GOLDBECK_MATERIALS = {
  low: { floor: "PVC sheet", marking: "Painted", gradin: "Steel basic" },
  medium: { floor: "Sports vinyl (2-layer)", marking: "Adhesive tape", gradin: "Steel coated" },
  high: { floor: "Hardwood parquet", marking: "Inlay wood", gradin: "Aluminum seating" },
};
const GOLDBECK_GARDEN_ITEMS = {
  parcel: { label: "Standard Green Parcel", category: "functional" },
  roof_trees: { label: "Roof Trees & Deep-Root Shrubbery", category: "vegetation" },
  urban_farming: { label: "Farm Crops & Urban Agriculture", category: "vegetation" },
  decorative_exotic: { label: "Decorative & Exotic Flora", category: "vegetation" },
};
const GOLDBECK_GARDEN_THEMES = {
  custom: { label: "Custom Configuration", layers: { substrate: { thickness_m: 0.12, material: "Standard Growth Mix" }, drainage: { thickness_m: 0.04, material: "HDPE Drainage Core" } } },
  japanese: { label: "Japanese Zen Garden", layers: { decorative_sand: { thickness_m: 0.05, material: "Fine Shirakawa Gravel Matrix" }, substrate: { thickness_m: 0.20, material: "Acidic Organo-Mineral Soil" }, drainage: { thickness_m: 0.06, material: "High-Capacity Reservoir Board" } } },
  english: { label: "English Cottage Landscape", layers: { turf_topsoil: { thickness_m: 0.35, material: "Premium Loam-Rich Substrate" }, drainage: { thickness_m: 0.05, material: "Expanded Clay Aggregate Layer" } } },
  classic: { label: "Classic Formal Garden", layers: { parterre_mix: { thickness_m: 0.25, material: "Calibrated Structural Landscape Soil" }, drainage: { thickness_m: 0.04, material: "Standard Dimpled Drainage Mat" } } },
};
const GOLDBECK_GARDEN_MATERIALS = {
  low: { waterproofing: "Bitumen membrane, single layer", drainage: "Gravel bed drainage" },
  medium: { waterproofing: "PVC membrane, root-resistant", drainage: "Standard HDPE board" },
  high: { waterproofing: "Reinforced TPO membrane", drainage: "HDPE board + reservoir cups" },
};

function goldbeckFieldItem(sport, quality, x_m, y_m, idx) {
  const d = GOLDBECK_FIELDS[sport]; const mat = GOLDBECK_MATERIALS[quality];
  return {
    id: `gb_item_${idx}`, kind: "field", label: `${sport[0].toUpperCase()}${sport.slice(1)} (standard)`,
    length_m: d.l, width_m: d.w, rotation: 0, x_m, y_m,
    sourceJson: {
      version: "1.0", generator: "Sportify",
      quality_key: `${sport.toUpperCase()}_STANDARD_${quality.toUpperCase()}`,
      field: { sport, variant: "standard", norm: d.norm, dimensions: { length_m: d.l, width_m: d.w, runoff_m: d.runoff, min_height_m: d.h }, capacity: { seats: 0, side_stands: false } },
      materials: { floor_surface: mat.floor, line_marking: mat.marking, gradin_type: mat.gradin, quality_level: quality, reference_material: null, reference_provider: null },
      layers: ["field_boundary", "center_line", "run_off_zone"],
    },
  };
}
function goldbeckGardenItem(typeId, theme, quality, length_m, width_m, x_m, y_m, idx) {
  const item = GOLDBECK_GARDEN_ITEMS[typeId]; const themeObj = GOLDBECK_GARDEN_THEMES[theme]; const mat = GOLDBECK_GARDEN_MATERIALS[quality];
  return {
    id: `gb_item_${idx}`, kind: "garden", label: `${item.label} (${themeObj.label})`,
    length_m, width_m, rotation: 0, x_m, y_m,
    sourceJson: {
      version: "1.0", generator: "Sportify-Garden-Engine",
      quality_key: `GARDEN_${typeId.toUpperCase()}_${theme.toUpperCase()}_${quality.toUpperCase()}`,
      garden: {
        type_id: typeId, category: item.category, theme,
        dimensions: { length_m, width_m },
        layers: Object.entries(themeObj.layers).map(([n, c]) => ({ layer_name: n, thickness_m: c.thickness_m, material: c.material })),
        materials: { waterproofing: mat.waterproofing, drainage: mat.drainage, quality_level: quality, reference_material: null, reference_provider: null },
      },
    },
  };
}

const GOLDBECK_ROOF = { length: 67.6, width: 21.0 };
const GOLDBECK_RULES = { clearance_m: 1.0, boundary_setback_m: 1.5, circulation_width_m: 1.0, min_entry_points: 4, quiet_buffer_m: 3.0 };
const GOLDBECK_ENTRY_POINTS = [
  { x_m: GOLDBECK_ROOF.length / 2, y_m: 0, edge: "top" },
  { x_m: GOLDBECK_ROOF.length / 2, y_m: GOLDBECK_ROOF.width, edge: "bottom" },
  { x_m: 0, y_m: GOLDBECK_ROOF.width / 2, edge: "left" },
  { x_m: GOLDBECK_ROOF.length, y_m: GOLDBECK_ROOF.width / 2, edge: "right" },
];
function goldbeckToPayload(items) {
  const placements = items.map(it => ({
    id: it.id, category: it.kind, label: it.label,
    insertion_point: { center_x_m: it.x_m + it.length_m / 2, center_y_m: it.y_m + it.width_m / 2 },
    bounding_box: { top_left_x_m: it.x_m, top_left_y_m: it.y_m, width_m: it.length_m, height_m: it.width_m },
    transform: { rotation_deg: it.rotation },
    parameters: it.sourceJson,
  }));
  return {
    version: "1.3", generator: "Sportify-Combine",
    roof_context: { length_m: GOLDBECK_ROOF.length, width_m: GOLDBECK_ROOF.width, source_boundary_polygon: null, world_origin_x_m: 0, world_origin_y_m: 0 },
    design_rules: { ...GOLDBECK_RULES },
    entry_points: GOLDBECK_ENTRY_POINTS.map(ep => ({ ...ep })),
    circulation_paths: [],
    site_location: null,
    placements,
  };
}

/* ---- live validation against the app's OWN real engine (rules.js/combineField.js) ---- */
function goldbeckValidatePayload(payload) {
  const roof = { length: payload.roof_context.length_m, width: payload.roof_context.width_m };
  const items = payload.placements.map((pl, i) => ({
    id: pl.id || `v_${i}`, kind: pl.category,
    length_m: pl.bounding_box.width_m, width_m: pl.bounding_box.height_m,
    rotation: pl.transform?.rotation_deg || 0,
    x_m: pl.bounding_box.top_left_x_m, y_m: pl.bounding_box.top_left_y_m,
  }));
  const entryPoints = payload.entry_points;
  const rules = { clearance_m: payload.design_rules.clearance_m, boundarySetback_m: payload.design_rules.boundary_setback_m, circulationWidth_m: payload.design_rules.circulation_width_m, minEntryPoints: payload.design_rules.min_entry_points };

  const overlaps = findOverlappingIds(items, rules.clearance_m);
  if (overlaps.size > 0) return false;
  const oob = findOutOfBoundsIds(items, roof);
  if (oob.size > 0) return false;
  const setback = rules.boundarySetback_m;
  for (const it of items) {
    const fp = getFootprint(it);
    if (it.x_m < setback - 1e-6 || it.y_m < setback - 1e-6 || it.x_m + fp.w > roof.length - setback + 1e-6 || it.y_m + fp.h > roof.width - setback + 1e-6) return false;
  }
  const circulation = computeCirculation({ roof, items, entryPoints }, rules);
  return circulation.unreachable.size === 0;
}

/** Regenerates via generatorFn (no args -> random variant) until it passes the app's own real validation, retrying a few times before falling back to the pattern's own known-good default. */
function goldbeckGenerateAndValidate(generatorFn, defaultFn, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    const payload = generatorFn();
    if (goldbeckValidatePayload(payload)) return payload;
  }
  return defaultFn();
}

function goldbeckRandomInRange(min, max) { return min + Math.random() * (max - min); }
function goldbeckPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function goldbeckShuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ============ Garden Boundary, Sports Core — variable garden-band depth ============ */
const GARDEN_BOUNDARY_DEPTH_RANGE = [2.0, 3.25]; // hand-verified: keeps the sports interior >=8.5m tall (badminton 6.1m + >=1.2m clear margin each side)
const GARDEN_BOUNDARY_DEFAULT_DEPTH = 3.0;

function buildGardenBoundaryPayload(bandDepthM) {
  const d = bandDepthM;
  const seam = 1.5;
  const gardenThemeOrder = goldbeckShuffle(["custom", "japanese", "classic"]);
  const gardenTypeOrder = goldbeckShuffle(["urban_farming", "roof_trees", "decorative_exotic"]);
  const bottomThemeOrder = goldbeckShuffle(["japanese", "english", "classic"]);
  const qualities = goldbeckShuffle(["low", "medium", "high", "medium"]);

  let idx = 0;
  const items = [];
  // top garden band
  [1.5, 22.5, 43.5].forEach((x, i) => items.push(goldbeckGardenItem(gardenTypeOrder[i], gardenThemeOrder[i], "medium", 20, d, x, 1.5, idx++)));
  // bottom garden band
  [1.5, 22.5, 43.5].forEach((x, i) => items.push(goldbeckGardenItem("parcel", bottomThemeOrder[i], "medium", 20, d, x, GOLDBECK_ROOF.width - 1.5 - d, idx++)));
  // sports interior, vertically centered in the band left after both garden bands + seams
  const interiorTop = 1.5 + d + seam;
  const interiorH = GOLDBECK_ROOF.width - 1.5 - d - (1.5 + d + seam) - seam; // = 18 - 2d - 2*seam, restated explicitly for clarity
  const yOff = interiorTop + (interiorH - 6.1) / 2;
  [1.5, 15.9, 30.3, 44.7].forEach((x, i) => items.push(goldbeckFieldItem("badminton", qualities[i], x, yOff, idx++)));

  return goldbeckToPayload(items);
}
function generateGardenBoundary() {
  return goldbeckGenerateAndValidate(
    () => buildGardenBoundaryPayload(goldbeckRandomInRange(...GARDEN_BOUNDARY_DEPTH_RANGE)),
    () => buildGardenBoundaryPayload(GARDEN_BOUNDARY_DEFAULT_DEPTH),
  );
}

/* ============ Sports Boundary, Garden Core — variable sport-band depth ============ */
const SPORTS_BOUNDARY_DEPTH_RANGE = [6.3, 7.0]; // hand-verified: >=0.2m margin around a 6.1m badminton court, and leaves >=1.0m garden interior
const SPORTS_BOUNDARY_DEFAULT_DEPTH = 6.5;

function buildSportsBoundaryPayload(bandDepthM) {
  const d = bandDepthM;
  const seam = 1.5;
  const qualitiesTop = goldbeckShuffle(["medium", "high", "medium", "low"]);
  const qualitiesBot = goldbeckShuffle(["low", "medium", "high", "medium"]);
  const gardenThemeOrder = goldbeckShuffle(["custom", "japanese"]);
  const gardenTypeOrder = goldbeckShuffle(["urban_farming", "roof_trees"]);

  let idx = 0;
  const items = [];
  const topY = 1.5 + (d - 6.1) / 2;
  [1.5, 15.9, 30.3, 44.7].forEach((x, i) => items.push(goldbeckFieldItem("badminton", qualitiesTop[i], x, topY, idx++)));
  const botBandY0 = GOLDBECK_ROOF.width - 1.5 - d;
  const botY = botBandY0 + (d - 6.1) / 2;
  [1.5, 15.9, 30.3, 44.7].forEach((x, i) => items.push(goldbeckFieldItem("badminton", qualitiesBot[i], x, botY, idx++)));

  const gardenDepth = GOLDBECK_ROOF.width - 1.5 - d - (1.5 + d + seam) - seam; // = 18 - 2d - 2*seam
  const gardenTop = 1.5 + d + seam;
  const segW = (64.6 - 2.0) / 2;
  items.push(goldbeckGardenItem(gardenTypeOrder[0], gardenThemeOrder[0], "medium", segW, gardenDepth, 1.5, gardenTop, idx++));
  items.push(goldbeckGardenItem(gardenTypeOrder[1], gardenThemeOrder[1], "medium", segW, gardenDepth, 1.5 + segW + 2.0, gardenTop, idx++));

  return goldbeckToPayload(items);
}
function generateSportsBoundary() {
  return goldbeckGenerateAndValidate(
    () => buildSportsBoundaryPayload(goldbeckRandomInRange(...SPORTS_BOUNDARY_DEPTH_RANGE)),
    () => buildSportsBoundaryPayload(SPORTS_BOUNDARY_DEFAULT_DEPTH),
  );
}

/* ============ Hybrid Chess — fixed grid geometry (already at minimum court size), shuffles theme/quality per cell ============ */
function buildHybridChessPayload() {
  const cols = 4, rows = 2, gap = 1.5;
  const U = { x0: 1.5, y0: 1.5, x1: GOLDBECK_ROOF.length - 1.5, y1: GOLDBECK_ROOF.width - 1.5 };
  const cellW = (U.x1 - U.x0 - (cols - 1) * gap) / cols;
  const cellH = (U.y1 - U.y0 - (rows - 1) * gap) / rows;
  const gardenThemes = goldbeckShuffle(["japanese", "english", "classic", "custom"]);
  const gardenTypes = goldbeckShuffle(["roof_trees", "parcel", "decorative_exotic", "urban_farming"]);
  const sportQualities = goldbeckShuffle(["medium", "high", "medium", "low"]);

  let idx = 0, gi = 0, si = 0;
  const items = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = U.x0 + c * (cellW + gap);
      const cy = U.y0 + r * (cellH + gap);
      const isSport = (r + c) % 2 === 0;
      if (isSport) {
        const bx = cx + (cellW - 13.4) / 2, by = cy + (cellH - 6.1) / 2;
        items.push(goldbeckFieldItem("badminton", sportQualities[si++ % sportQualities.length], bx, by, idx++));
      } else {
        items.push(goldbeckGardenItem(gardenTypes[gi % gardenTypes.length], gardenThemes[gi % gardenThemes.length], "medium", cellW, cellH, cx, cy, idx++));
        gi++;
      }
    }
  }
  return goldbeckToPayload(items);
}
function generateHybridChess() {
  return goldbeckGenerateAndValidate(buildHybridChessPayload, buildHybridChessPayload);
}

/* ---- public registry — sessionGate.js / compareController.js call .generate() on demand, never read a precomputed field ---- */
const GOLDBECK_PREBUILT_SESSIONS = {
  gardenBoundary: {
    id: "gardenBoundary", title: "Garden Boundary, Sports Core",
    tagline: "A green perimeter frames four badminton courts running the length of the roof.",
    generate: generateGardenBoundary,
  },
  sportsBoundary: {
    id: "sportsBoundary", title: "Sports Boundary, Garden Core",
    tagline: "Eight courts form the outer bands; garden strips run through the middle.",
    generate: generateSportsBoundary,
  },
  hybridChess: {
    id: "hybridChess", title: "Hybrid — Chess Pattern",
    tagline: "Sport and garden cells alternate across a 4×2 grid, like a chessboard.",
    generate: generateHybridChess,
  },
};
