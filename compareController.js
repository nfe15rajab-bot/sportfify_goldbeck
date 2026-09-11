/**
 * compareController.js — Compare tab
 * Three predefined 20 m × 25 m roof configurations, each built from real
 * reference-database figures (data.js/gardenData.js field & garden figures,
 * mirrored 1:1 from Sportify.Api's ReferenceDataSeeder.cs — same EN 14904
 * material classes and the same real providers: Polytan, Gerflor, ZinCo,
 * Optigrün, Bauder). Every layout is placed with the exact same
 * ruleBasedArrange()/computeCirculation() engine Combine itself uses — a
 * "predefined" config here still means "actually passes the same rules a
 * hand-built layout would," not a hardcoded set of x/y coordinates.
 *
 * Fully isolated: builds its own {roof, items, entryPoints} state per
 * config and never reads or writes the live combineState, so switching to
 * Compare can never affect a planner's in-progress Combine layout.
 */

const COMPARE_ROOF = { length: 25, width: 20 }; // 500 m², per the user's 20×25 m spec

const QUALITY_SCORE = { low: 40, medium: 70, high: 100 };
const COST_SCORE = { low: 100, medium: 65, high: 30 };

/* ── Item builders — same payload shape sportController.js/gardenController.js
   build, so the component data reads exactly like a real pushed piece. ── */

function cmpFieldItem(sport, variant, quality, refMaterial, refClass, refProvider) {
  const d = FIELDS[sport][variant];
  const mat = MATERIALS[quality];
  return {
    kind: "field",
    label: `${titleCase(sport)} — ${titleCase(variant)}`,
    length_m: d.l, width_m: d.w,
    sourceJson: {
      version: "1.0", generator: "Sportify",
      quality_key: getQualityKey(sport, variant, quality),
      field: { sport, variant, norm: d.norm, dimensions: { length_m: d.l, width_m: d.w, runoff_m: d.runoff, min_height_m: d.h }, capacity: { seats: 0, side_stands: false } },
      materials: { floor_surface: mat.floor, line_marking: mat.marking, gradin_type: mat.gradin, quality_level: quality, reference_material: refMaterial, reference_provider: refProvider },
      reference_material_class: refClass,
      layers: ["field_boundary", "center_line", "center_circle", "goal_area", "penalty_area", "run_off_zone", "stands"],
    },
  };
}

function cmpGardenItem(itemId, theme, quality, length_m, width_m, refMaterial, refProvider) {
  const item = GARDEN_ITEMS[itemId];
  const themeObj = GARDEN_THEMES[theme];
  const mat = GARDEN_MATERIALS[quality];
  return {
    kind: "garden",
    label: `${item.short} (${themeObj.label})`,
    length_m, width_m,
    sourceJson: {
      version: "1.0", generator: "Sportify-Garden-Engine",
      quality_key: getGardenQualityKey(itemId, theme, quality),
      garden: {
        type_id: itemId, category: item.category, theme,
        dimensions: { length_m, width_m },
        layers: Object.entries(themeObj.layers).map(([name, config]) => ({ layer_name: name, thickness_m: config.thickness_m, material: config.material })),
        materials: { waterproofing: mat.waterproofing, drainage: mat.drainage, quality_level: quality, reference_material: refMaterial, reference_provider: refProvider },
      },
    },
  };
}

/**
 * ── Goldbeck IFC roof configs ──
 * When a Goldbeck prebuilt session is active (combineController.js's
 * activeGoldbeckPresetId, set by sessionGate.js), Compare shows these 3
 * variants on the actual Goldbeck roof instead of the generic 25x20m demo
 * below. Each preset's generate() runs fresh here (a live variant, not a
 * frozen one) — see prebuiltSessions.js; the specific variant shown stays
 * stable for as long as Compare is open (updateCompareUI only re-generates
 * on mode entry, not on every slider tweak).
 */
function snapshotToDef(id, name, tagline, payload, goldbeckPresetId) {
  return {
    id, name, tagline, goldbeckPresetId: goldbeckPresetId || null,
    roof: { length: payload.roof_context.length_m, width: payload.roof_context.width_m },
    prePositioned: true,
    entryPoints: payload.entry_points,
    items: payload.placements.map(pl => ({
      kind: pl.category, label: pl.label,
      length_m: pl.bounding_box.width_m, width_m: pl.bounding_box.height_m,
      rotation: pl.transform?.rotation_deg || 0,
      x_m: pl.bounding_box.top_left_x_m, y_m: pl.bounding_box.top_left_y_m,
      sourceJson: pl.parameters,
    })),
  };
}

function buildGoldbeckCompareConfigDefs() {
  return Object.values(GOLDBECK_PREBUILT_SESSIONS).map(preset =>
    snapshotToDef(preset.id, preset.title, preset.tagline, preset.generate(), preset.id));
}

/**
 * ── Saved-for-Compare rolling buffer ──
 * "Save for Compare" (Combine step 4) calls saveConfigToCompare() with the
 * current combineState snapshot (buildCombinedPayload() shape). Compare
 * holds at most 3 at a time; updateCompareUI() below fills each of its 3
 * card slots from here first and only falls back to a built-in default
 * (Goldbeck A/B/C, or the generic demo) for a slot with no save yet — so
 * saves replace defaults one at a time as the user makes them, exactly like
 * asked. A 4th save evicts the oldest saved slot (FIFO); un-replaced
 * default slots are never evicted by a save landing in another slot.
 */
let savedCompareConfigs = [];

function saveConfigToCompare(payload) {
  const sportCount = payload.placements.filter(pl => pl.category === "field" || pl.category === "activity").length;
  const gardenCount = payload.placements.filter(pl => pl.category === "garden").length;
  const entry = {
    id: `saved_${Date.now()}`,
    name: `Saved Layout ${savedCompareConfigs.length + 1}`,
    tagline: `Saved from Combine — ${sportCount} sport, ${gardenCount} garden piece(s) on ${payload.roof_context.length_m}×${payload.roof_context.width_m} m.`,
    payload,
  };
  savedCompareConfigs.push(entry);
  if (savedCompareConfigs.length > 3) savedCompareConfigs.shift();
  renderIterationsPanels();
}

/**
 * ── Iterations panels (Combine's docked pane + Analysis's sidebar section) ──
 * Both show the exact same savedCompareConfigs list — a self-contained mini
 * roof preview (not compareController's own miniRoofSvg/COMPARE_ROOF-bound
 * version, so this works independent of whatever Compare's own state is)
 * plus a name, clickable to load. "Results update as per the tab": loading
 * always goes through applySessionSnapshot (making it the live session),
 * then Combine jumps to Arrange and Analysis re-renders its own cards —
 * each tab reacting to the same live-state change in its own way.
 */
function miniIterationSvg(payload) {
  const VW = 150, VH = 90, PAD = 5;
  const scale = Math.min((VW - PAD * 2) / payload.roof_context.length_m, (VH - PAD * 2) / payload.roof_context.width_m);
  const rw = payload.roof_context.length_m * scale, rh = payload.roof_context.width_m * scale;
  const ox = (VW - rw) / 2, oy = (VH - rh) / 2;
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="${ox}" y="${oy}" width="${rw}" height="${rh}" fill="none" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3,2"/>`;
  payload.placements.forEach(pl => {
    const colors = KIND_COLORS[pl.category] || KIND_COLORS.field;
    const x = ox + pl.bounding_box.top_left_x_m * scale, y = oy + pl.bounding_box.top_left_y_m * scale;
    const w = pl.bounding_box.width_m * scale, h = pl.bounding_box.height_m * scale;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="0.8"/>`;
  });
  svg += `</svg>`;
  return svg;
}

function iterationCardHtml(entry) {
  return `
    <button class="iteration-card" data-iteration-id="${entry.id}">
      <div class="iteration-card-thumb">${miniIterationSvg(entry.payload)}</div>
      <div class="iteration-card-label">${entry.name}</div>
    </button>`;
}

function renderIterationsPanels() {
  const html = savedCompareConfigs.length === 0
    ? `<p class="hint">No saved iterations yet — use "Save for Compare" in Combine's Review step.</p>`
    : savedCompareConfigs.map(iterationCardHtml).join("");
  ["iterationsListCombine", "iterationsListAnalysis"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

document.addEventListener("click", e => {
  const card = e.target.closest(".iteration-card");
  if (!card) return;
  const entry = savedCompareConfigs.find(c => c.id === card.dataset.iterationId);
  if (!entry) return;
  try {
    applySessionSnapshot(entry.payload);
    if (activeMode === "combine") {
      if (typeof setWizardStep === "function") setWizardStep(2);
      showToast(entry.name, "Loaded into Combine — Arrange step.");
    } else if (activeMode === "analysis" && typeof updateAnalysisUI === "function") {
      updateAnalysisUI();
      showToast(entry.name, "Loaded — Analysis results updated.");
    }
  } catch (err) {
    showToast("Couldn't load that iteration", err.message);
  }
});

/* ── The 3 configurations ──
 * Real figures throughout: field dimensions from data.js's FIELDS (same
 * table Sportify.Api's FieldVariant seed mirrors), garden build-up depths
 * from gardenData.js's GARDEN_THEMES, and reference_material/provider
 * strings copied verbatim from ReferenceDataSeeder.cs's seeded Material/
 * Provider rows. Kept to sport-scale footprints (badminton/volleyball, not
 * full competition halls) because a 500 m² roof genuinely can't fit a
 * standard basketball/handball court AND a garden zone with clearance to
 * spare — the same constraint a real rooftop retrofit would hit.
 */
function buildCompareConfigDefs() {
  return [
    {
      id: "premium", name: "Premium Performance",
      tagline: "One competition-grade court, top-tier materials — no shared-space compromise.",
      entryEdges: ["left", "right"],
      items: [
        cmpFieldItem("volleyball", "competition", "high",
          "Wood sprung floor / parquet", "EN 14904 Type 1 · ≥55% force reduction", "Gerflor"),
      ],
    },
    {
      id: "value", name: "Smart Value",
      tagline: "A compact court plus a modest green patch — Economy tier throughout, still BWF/DIN-compliant.",
      entryEdges: ["left", "right"],
      items: [
        cmpFieldItem("badminton", "standard", "low",
          "Sports vinyl / PVC flooring", "EN 14904 Type 3–4 · ≥35% force reduction", "Polytan GmbH"),
        cmpGardenItem("parcel", "custom", "low", 4, 4,
          "Extensive substrate (mineral, lightweight)", "ZinCo GmbH"),
      ],
    },
    {
      id: "balanced", name: "Balanced & Sustainable",
      tagline: "A modest court balanced by two green zones — the highest rainfall retention of the three.",
      entryEdges: ["left", "right"],
      items: [
        cmpFieldItem("badminton", "standard", "medium",
          "Sports vinyl / PVC flooring", "EN 14904 Type 3–4 · ≥35% force reduction", "Polytan GmbH"),
        cmpGardenItem("parcel", "english", "medium", 4, 4,
          "Intensive substrate (deep, high water-capacity)", "Paul Bauder GmbH & Co. KG"),
        cmpGardenItem("roof_trees", "japanese", "medium", 4, 4,
          "Extensive substrate (mineral, lightweight)", "ZinCo GmbH"),
      ],
    },
  ];
}

/* ── Layout + scoring ──
 * Places each config with the app's own auto-arrange/circulation engine
 * against the live DESIGN_RULES (so Compare always reflects whatever
 * clearance/setback/circulation/entry thresholds the planner currently has
 * set — same single source of truth the rest of the app uses), then scores
 * 4 axes so the priority sliders below have something real to weight.
 */

function compareWaterManagement(state) {
  const gardenItems = state.items.filter(it => it.kind === "garden");
  if (gardenItems.length === 0) return { totalAreaM2: 0, avgDepthCm: 0, retentionPercent: 0 };
  let totalAreaM2 = 0, weightedDepthCm = 0;
  gardenItems.forEach(it => {
    const fp = getFootprint(it);
    const area = fp.w * fp.h;
    const theme = GARDEN_THEMES[it.sourceJson?.garden?.theme] || GARDEN_THEMES.custom;
    const depthCm = Object.values(theme.layers).reduce((s, l) => s + l.thickness_m * 100, 0);
    totalAreaM2 += area;
    weightedDepthCm += area * depthCm;
  });
  const avgDepthCm = weightedDepthCm / totalAreaM2;
  const retentionPercent = Math.min(90, Math.round(30 + avgDepthCm * 2));
  return { totalAreaM2, avgDepthCm, retentionPercent };
}

/** Quality/Cost: area-weighted over each item's own quality tier (the app's existing Economy/Standard/Premium tiers double as the only cost signal in the reference database — no separate price table exists yet, matching how the Analysis tab's LCA card also declines to invent numbers it doesn't have). Sustainability: real water-retention formula (identical to analysisController.js's) blended with green-coverage ratio. Accessibility: real circulation reachability + longest route, blended with the same wheelchair-width reference the Analysis tab checks. */
function computeAxisScores(state) {
  let totalArea = 0, qWeighted = 0, cWeighted = 0;
  state.items.forEach(it => {
    const fp = getFootprint(it);
    const area = fp.w * fp.h;
    const quality = it.sourceJson?.materials?.quality_level || it.sourceJson?.garden?.materials?.quality_level || "medium";
    totalArea += area;
    qWeighted += area * (QUALITY_SCORE[quality] ?? 70);
    cWeighted += area * (COST_SCORE[quality] ?? 65);
  });
  const quality = totalArea ? Math.round(qWeighted / totalArea) : 70;
  const cost = totalArea ? Math.round(cWeighted / totalArea) : 65;

  const water = compareWaterManagement(state);
  const roofAreaM2 = state.roof.length * state.roof.width;
  const coverage = water.totalAreaM2 / roofAreaM2;
  const sustainability = water.totalAreaM2 > 0
    ? Math.round(water.retentionPercent * 0.75 + Math.min(100, coverage * 100 * 4) * 0.25)
    : 5;

  const circulation = computeCirculation(state, DESIGN_RULES);
  const distances = circulation.paths.map(p => pathLengthM(p.points));
  const maxDist = distances.length ? Math.max(...distances) : 0;
  const reachOk = circulation.unreachable.size === 0;
  // WHEELCHAIR_MIN_WIDTH_M used to be a bare constant here; analysisController.js
  // now sources it from the AnalysisParameter database table (falling back to
  // the same 1.5 default offline) via getAnalysisParam() — reused directly so
  // Compare's accessibility check never disagrees with the Analysis tab's.
  const widthOk = DESIGN_RULES.circulationWidth_m >= getAnalysisParam("Accessibility", "min_circulation_width_m");
  const distScore = clamp(100 - maxDist * 4, 15, 100);
  const accessibility = reachOk ? Math.round(distScore * 0.6 + (widthOk ? 100 : 50) * 0.4) : 20;

  return { scores: { quality, cost, sustainability, accessibility }, water, maxDist, reachOk, widthOk, circulation };
}

function miniRoofSvg(state) {
  const VW = 280, VH = 190, PAD = 12;
  const availW = VW - PAD * 2, availH = VH - PAD * 2;
  const scale = Math.min(availW / state.roof.length, availH / state.roof.width);
  const rw = state.roof.length * scale, rh = state.roof.width * scale;
  const ox = (VW - rw) / 2, oy = (VH - rh) / 2;
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" class="compare-roof-svg" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="${ox}" y="${oy}" width="${rw}" height="${rh}" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  state.items.forEach(it => {
    const fp = getFootprint(it);
    const colors = KIND_COLORS[it.kind] || KIND_COLORS.field;
    const x = ox + it.x_m * scale, y = oy + it.y_m * scale, w = fp.w * scale, h = fp.h * scale;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.3"/>`;
  });
  state.entryPoints.forEach(ep => {
    const x = ox + ep.x_m * scale, y = oy + ep.y_m * scale;
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="var(--text-accent)" stroke="var(--surface-2)" stroke-width="1"/>`;
  });
  svg += `</svg>`;
  return svg;
}

/**
 * Places one config's items, adds entries, then checks every DESIGN_RULES
 * criterion the same way Combine's own rules checklist does — this is the
 * "make sure they satisfy all our criteria" verification, computed live
 * rather than assumed. Two modes: the generic 25x20m demo configs below
 * supply unpositioned items + entryEdges and get auto-arranged here (as
 * before); a Goldbeck prebuilt config (def.prePositioned) already carries
 * real, pre-verified x_m/y_m/rotation per item and an exact entryPoints
 * list, so arranging is skipped — this function then only re-derives the
 * scores/checklist against the live DESIGN_RULES, never the positions.
 */
function layoutAndScoreConfig(def) {
  const roof = def.roof || COMPARE_ROOF;
  const state = {
    roof: { ...roof, boundary: null, originXm: 0, originYm: 0 },
    items: def.items.map((it, i) => ({ ...it, id: `${def.id}_item_${i}`, rotation: it.rotation || 0, x_m: it.x_m ?? 0, y_m: it.y_m ?? 0 })),
    entryPoints: [],
  };

  let unplaced = [];
  if (!def.prePositioned) {
    const arranged = ruleBasedArrange(state, DESIGN_RULES);
    state.items.forEach(it => { const p = arranged.placements.get(it.id); if (p) { it.x_m = p.x; it.y_m = p.y; } });
    unplaced = arranged.unplaced;
  }

  if (def.entryPoints) {
    state.entryPoints = def.entryPoints.map((ep, i) => ({ id: `${def.id}_entry_${i}`, x_m: ep.x_m, y_m: ep.y_m, edge: ep.edge }));
  } else {
    def.entryEdges.forEach((edge, i) => {
      const anchor = edge === "left" ? nearestBoundaryPoint(state.roof, 0, state.roof.width / 2)
        : edge === "right" ? nearestBoundaryPoint(state.roof, state.roof.length, state.roof.width / 2)
        : nearestBoundaryPoint(state.roof, state.roof.length / 2, state.roof.width / 2);
      state.entryPoints.push({ id: `${def.id}_entry_${i}`, x_m: anchor.x, y_m: anchor.y, edge: anchor.edge });
    });
  }

  const overlappingIds = findOverlappingIds(state.items, DESIGN_RULES.clearance_m);
  const outOfBoundsIds = findOutOfBoundsIds(state.items, state.roof);
  const { scores, water, maxDist, circulation } = computeAxisScores(state);

  const checklist = [
    { label: "No overlaps between pieces", pass: overlappingIds.size === 0 },
    { label: "Every piece inside the roof boundary + setback", pass: outOfBoundsIds.size === 0 },
    { label: `${state.entryPoints.length} ≥ ${DESIGN_RULES.minEntryPoints} required entry point(s)`, pass: state.entryPoints.length >= DESIGN_RULES.minEntryPoints },
    { label: "Every piece reachable from an entrance", pass: circulation.unreachable.size === 0 },
    { label: "All pieces placed (none skipped for space)", pass: unplaced.length === 0 },
  ];

  const totalItemAreaM2 = state.items.reduce((s, it) => { const fp = getFootprint(it); return s + fp.w * fp.h; }, 0);

  return {
    id: def.id, name: def.name, tagline: def.tagline,
    goldbeckPresetId: def.goldbeckPresetId || null,
    scores,
    checklistHtml: checklist.map(c => `<div class="compare-rule-row ${c.pass ? "pass" : "fail"}"><i class="ti ${c.pass ? "ti-check" : "ti-x"}" aria-hidden="true"></i>${c.label}</div>`).join(""),
    statsLine: `${Math.round(totalItemAreaM2)} m² programmed · ${water.totalAreaM2 ? Math.round(water.totalAreaM2) + " m² garden (" + water.retentionPercent + "% retention)" : "no garden coverage"} · ${maxDist.toFixed(1)} m longest route to an entrance`,
    roofSvg: miniRoofSvg(state),
    rawSnapshot: stateToSnapshot(state),
  };
}

/** Converts a scored config's final, positioned {roof, items, entryPoints} state back into a buildCombinedPayload()-shaped snapshot — lets any Compare card (default or saved) be loaded straight back into Combine via applySessionSnapshot(). */
function stateToSnapshot(state) {
  const placements = state.items.map(it => ({
    id: it.id, category: it.kind, label: it.label,
    insertion_point: { center_x_m: it.x_m + it.length_m / 2, center_y_m: it.y_m + it.width_m / 2 },
    bounding_box: { top_left_x_m: it.x_m, top_left_y_m: it.y_m, width_m: it.length_m, height_m: it.width_m },
    transform: { rotation_deg: it.rotation },
    parameters: it.sourceJson,
  }));
  return {
    version: "1.3", generator: "Sportify-Combine",
    roof_context: { length_m: state.roof.length, width_m: state.roof.width, source_boundary_polygon: null, world_origin_x_m: 0, world_origin_y_m: 0 },
    design_rules: { clearance_m: DESIGN_RULES.clearance_m, boundary_setback_m: DESIGN_RULES.boundarySetback_m, circulation_width_m: DESIGN_RULES.circulationWidth_m, min_entry_points: DESIGN_RULES.minEntryPoints, quiet_buffer_m: DESIGN_RULES.quietBufferM },
    entry_points: state.entryPoints.map(ep => ({ x_m: ep.x_m, y_m: ep.y_m, edge: ep.edge })),
    circulation_paths: [],
    site_location: null,
    placements,
  };
}

/* ── Priority weights: presets + sliders ── */

const COMPARE_PRESETS = {
  quality: { quality: 90, cost: 20, sustainability: 40, accessibility: 50 },
  cost: { quality: 20, cost: 90, sustainability: 30, accessibility: 50 },
  sustainability: { quality: 30, cost: 30, sustainability: 90, accessibility: 50 },
  balanced: { quality: 50, cost: 50, sustainability: 50, accessibility: 50 },
};

function computeWeights() {
  return {
    quality: Number(document.getElementById("weightQuality").value),
    cost: Number(document.getElementById("weightCost").value),
    sustainability: Number(document.getElementById("weightSustainability").value),
    accessibility: Number(document.getElementById("weightAccessibility").value),
  };
}

function updateWeightLabels() {
  ["Quality", "Cost", "Sustainability", "Accessibility"].forEach(k => {
    const id = "weight" + k;
    const val = document.getElementById(id).value;
    const lbl = document.getElementById(id + "Val");
    if (lbl) lbl.textContent = val + "%";
  });
}

function applyPreset(name) {
  const p = COMPARE_PRESETS[name];
  if (!p) return;
  document.getElementById("weightQuality").value = p.quality;
  document.getElementById("weightCost").value = p.cost;
  document.getElementById("weightSustainability").value = p.sustainability;
  document.getElementById("weightAccessibility").value = p.accessibility;
  updateWeightLabels();
  document.querySelectorAll("#comparePresetBtns .q-btn").forEach(b => b.classList.toggle("active", b.dataset.preset === name));
  renderCompareResults(compareResultsCache, computeWeights());
}

document.getElementById("comparePresetBtns")?.addEventListener("click", e => {
  const btn = e.target.closest(".q-btn");
  if (btn) applyPreset(btn.dataset.preset);
});
["weightQuality", "weightCost", "weightSustainability", "weightAccessibility"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", () => {
    updateWeightLabels();
    document.querySelectorAll("#comparePresetBtns .q-btn").forEach(b => b.classList.remove("active"));
    renderCompareResults(compareResultsCache, computeWeights());
  });
});

function overallScore(scores, weights) {
  const wSum = weights.quality + weights.cost + weights.sustainability + weights.accessibility;
  if (wSum <= 0) return Math.round((scores.quality + scores.cost + scores.sustainability + scores.accessibility) / 4);
  return Math.round((scores.quality * weights.quality + scores.cost * weights.cost + scores.sustainability * weights.sustainability + scores.accessibility * weights.accessibility) / wSum);
}

/* ── Rendering: static card shell built once per config, then only the
   score bars/rank/overall number are mutated in place so the browser's own
   CSS transitions animate width/color changes — and cards are FLIP-
   reordered (record old position, move in the DOM, animate the resulting
   offset back to zero) so re-ranking reads as a smooth swap, not a jump. ── */

const COMPARE_AXES = [["Quality", "quality"], ["Cost-effective", "cost"], ["Sustainability", "sustainability"], ["Accessibility", "accessibility"]];
let compareResultsCache = null;
let compareCardsBuilt = false;

function cardShellHtml(r) {
  return `
    <div class="compare-card" data-config-id="${r.id}">
      <div class="compare-card-head">
        <span class="compare-rank" id="rank-${r.id}">—</span>
        <div>
          <div class="compare-card-title">${r.name}</div>
          <p class="hint">${r.tagline}</p>
        </div>
      </div>
      <div class="compare-roof-preview">${r.roofSvg}</div>
      <div class="compare-checklist">${r.checklistHtml}</div>
      <p class="hint compare-stats">${r.statsLine}</p>
      <div class="compare-bars">
        ${COMPARE_AXES.map(([label, key]) => `
          <div class="compare-bar-row">
            <span class="compare-bar-label">${label}</span>
            <div class="compare-bar-track"><div class="compare-bar-fill" id="bar-${r.id}-${key}" style="width:0%"></div></div>
            <span class="compare-bar-val" id="val-${r.id}-${key}">0</span>
          </div>`).join("")}
      </div>
      <div class="compare-overall">
        <span>Overall match to your priorities</span>
        <span class="compare-overall-num" id="overall-${r.id}" data-val="0">0</span>
      </div>
      <p class="hint compare-load-hint"><i class="ti ti-arrow-right" aria-hidden="true"></i>Click to load into Combine's Arrange step</p>
    </div>`;
}

/**
 * Clicking any card loads its exact positioned layout back into Combine
 * (applySessionSnapshot, same path a saved file or a gate preset uses) and
 * jumps straight to the Arrange step — "if an entity is selected, user is
 * directed to the arrange mode directly". Delegated on document rather than
 * #compareCards directly: updateCompareUI() replaces that element's
 * innerHTML (and so the element itself is a fresh node) every time Compare
 * is opened, which would silently drop a listener attached to it directly.
 */
document.addEventListener("click", e => {
  const card = e.target.closest(".compare-card");
  if (!card || !compareResultsCache) return;
  const result = compareResultsCache.find(r => r.id === card.dataset.configId);
  if (!result || !result.rawSnapshot) return;
  try {
    applySessionSnapshot(result.rawSnapshot, { goldbeckPresetId: result.goldbeckPresetId });
    setMode("combine");
    if (typeof setWizardStep === "function") setWizardStep(2);
    showToast(result.name, "Loaded into Combine — Arrange step.");
  } catch (err) {
    showToast("Couldn't load that config", err.message);
  }
});

/** rAF-driven count-up, tweening from the number's own last value. rAF can be starved indefinitely (a backgrounded tab, a minimized/hidden window) — setting the correct value up front means a starved tween still ends up showing the right number immediately, just without the animation, instead of silently freezing on a stale one. */
function animateNumber(el, target) {
  if (!el) return;
  const start = Number(el.dataset.val || 0);
  el.textContent = Math.round(target);
  el.dataset.val = target;
  const startTime = performance.now();
  const dur = 450;
  function frame(now) {
    const t = Math.min(1, (now - startTime) / dur);
    const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    el.textContent = Math.round(start + (target - start) * k);
    if (t < 1) requestAnimationFrame(frame); else el.textContent = Math.round(target);
  }
  requestAnimationFrame(frame);
}

function updateCardScores(r) {
  COMPARE_AXES.forEach(([, key]) => {
    const bar = document.getElementById(`bar-${r.id}-${key}`);
    const val = document.getElementById(`val-${r.id}-${key}`);
    if (bar) bar.style.width = Math.round(r.scores[key]) + "%";
    if (val) val.textContent = Math.round(r.scores[key]);
  });
  const rankEl = document.getElementById(`rank-${r.id}`);
  if (rankEl) { rankEl.textContent = r.rank; rankEl.className = `compare-rank rank-${r.rank}`; }
  animateNumber(document.getElementById(`overall-${r.id}`), r.overall);
}

function renderCompareResults(results, weights) {
  if (!results) return;
  const container = document.getElementById("compareCards");
  if (!container) return;

  const scored = results.map(r => ({ ...r, overall: overallScore(r.scores, weights) }));
  scored.sort((a, b) => b.overall - a.overall);
  scored.forEach((r, i) => { r.rank = i + 1; });

  if (!compareCardsBuilt) {
    container.innerHTML = scored.map(cardShellHtml).join("");
    compareCardsBuilt = true;
    scored.forEach(updateCardScores);
    return;
  }

  const firstRects = new Map();
  container.querySelectorAll(".compare-card").forEach(el => firstRects.set(el.dataset.configId, el.getBoundingClientRect()));

  scored.forEach(r => {
    const el = container.querySelector(`.compare-card[data-config-id="${r.id}"]`);
    if (el) container.appendChild(el);
  });

  scored.forEach(r => {
    const el = container.querySelector(`.compare-card[data-config-id="${r.id}"]`);
    const first = firstRects.get(r.id);
    if (!el || !first) return;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top;
    if (dx || dy) {
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = "transform 0.45s cubic-bezier(.22,.8,.25,1)";
        el.style.transform = "";
      }));
    }
  });

  scored.forEach(updateCardScores);
}

/**
 * Compare defaults to showing ONLY the user's own saved iterations
 * (savedCompareConfigs) — no auto-filled demo/Goldbeck defaults mixed in,
 * so "compare" always means comparing your own work, not padding it out
 * with examples you didn't ask for. The generic/Goldbeck defaults still
 * exist, just moved behind the "Compare Guide" toggle below (compareGuide()
 * / btn-compare-guide) as a reference example, never the default view.
 */
let compareShowingGuide = false;

function buildCompareSlotDefs() {
  return savedCompareConfigs.map(saved => snapshotToDef(saved.id, saved.name, saved.tagline, saved.payload, null));
}

/**
 * Real per-roof dimensions/area for the sidebar block — computed from the
 * actual set of defs being shown, not a hardcoded string. A saved config
 * keeps whatever roof it was saved from, so once any def differs from the
 * rest the block says "Varies" instead of quietly showing a number that's
 * only true for some of the cards.
 */
function compareRoofSummary(defs) {
  // Same fallback layoutAndScoreConfig itself uses — the generic demo defs
  // (buildCompareConfigDefs) never set def.roof directly, they rely on it.
  const roofs = defs.map(d => d.roof || COMPARE_ROOF);
  const dims = roofs.map(r => `${r.length}×${r.width}`);
  const uniform = dims.every(d => d === dims[0]);
  if (uniform) {
    const { length, width } = roofs[0];
    return { dimsText: `${length} × ${width} m`, areaText: `${(length * width).toLocaleString()} m²` };
  }
  return { dimsText: "Varies", areaText: "See each card" };
}

const COMPARE_EMPTY_HTML = `
  <div class="compare-empty">
    <i class="ti ti-stack-2" aria-hidden="true"></i>
    <h3>No saved iterations yet</h3>
    <p class="hint">Compare only shows your own work — build a layout in Combine, then use <strong>"Save for Compare"</strong> in its Review step to bring it here. Save up to 3 at once.</p>
    <p class="hint">New to Compare? <button class="btn-link" id="btn-compare-guide-empty">Open the Compare Guide</button> to see a worked example first.</p>
  </div>`;

function setComparePriorityControlsVisible(visible) {
  ["comparePrioritySection", "compareFineTuneSection", "compareRoofSection"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? "" : "none";
  });
}

/**
 * Two views, toggled by #btn-compare-guide:
 *  - Default ("My Comparisons"): ONLY savedCompareConfigs — the user's own
 *    "Save for Compare" layouts, never padded out with demo/Goldbeck
 *    defaults. Empty until the user has saved at least one.
 *  - Guide (compareShowingGuide=true): the original worked example (the
 *    Goldbeck roof's 3 patterns if a Goldbeck session is active, else the
 *    generic 25x20m demo) — a pure reference view, independent of whatever
 *    the user has saved.
 */
function updateCompareUI() {
  const goldbeckPreset = typeof activeGoldbeckPresetId !== "undefined" ? activeGoldbeckPresetId : null;
  const usingGoldbeck = !!goldbeckPreset && typeof GOLDBECK_PREBUILT_SESSIONS === "object";

  const guideBtnLabel = document.getElementById("btn-compare-guide-label");
  if (guideBtnLabel) guideBtnLabel.textContent = compareShowingGuide ? "Back to My Comparisons" : "View Compare Guide";

  const contentEl = document.getElementById("compare-content");

  if (compareShowingGuide) {
    const slotDefs = usingGoldbeck ? buildGoldbeckCompareConfigDefs() : buildCompareConfigDefs();
    const { dimsText, areaText } = compareRoofSummary(slotDefs);

    document.getElementById("compare-heading").textContent = "Compare Guide";
    if (usingGoldbeck) {
      document.getElementById("field-label").textContent = "Compare Guide — Goldbeck IFC roof, 3 layout variants";
      document.getElementById("compare-intro").textContent = "A worked example, not your own data: three real layouts on the actual Goldbeck roof (67.6 × 21 m) — garden-boundary, sports-boundary, and a hybrid chess pattern.";
      document.getElementById("compare-roof-hint").textContent = "This example's own roof — from the loaded Goldbeck IFC prebuilt session, not the generic demo roof.";
    } else {
      document.getElementById("field-label").textContent = "Compare Guide — predefined roof configurations";
      document.getElementById("compare-intro").textContent = "A worked example, not your own data: three predefined 20 × 25 m roof layouts, built from real reference-database figures.";
      document.getElementById("compare-roof-hint").textContent = "Fixed for this example — each configuration is auto-arranged and rule-checked against the same 20 × 25 m boundary.";
    }
    document.getElementById("norm-badge").textContent = `${dimsText} · ${areaText}`;
    document.getElementById("compare-roof-dims").textContent = dimsText;
    document.getElementById("compare-roof-area").textContent = areaText;

    setComparePriorityControlsVisible(true);
    compareResultsCache = slotDefs.map(layoutAndScoreConfig);
    compareCardsBuilt = false;
    if (contentEl) contentEl.innerHTML = `<div class="compare-cards" id="compareCards"></div>`;
    renderCompareResults(compareResultsCache, computeWeights());
    return;
  }

  document.getElementById("compare-heading").textContent = "My Comparisons";
  document.getElementById("field-label").textContent = "Compare — your saved iterations";
  document.getElementById("norm-badge").textContent = `${savedCompareConfigs.length} of 3 saved`;

  if (savedCompareConfigs.length === 0) {
    document.getElementById("compare-intro").textContent = "Save layouts from Combine's Review step to compare them here — side by side, scored against your own priorities.";
    document.getElementById("compare-roof-dims").textContent = "—";
    document.getElementById("compare-roof-area").textContent = "—";
    document.getElementById("compare-roof-hint").textContent = "No saved layouts yet.";
    setComparePriorityControlsVisible(false);
    compareResultsCache = null;
    compareCardsBuilt = false;
    if (contentEl) contentEl.innerHTML = COMPARE_EMPTY_HTML;
    return;
  }

  document.getElementById("compare-intro").textContent = `Your own saved layout${savedCompareConfigs.length === 1 ? "" : "s"} (from Combine's "Save for Compare") — click a card to load it back into Combine's Arrange step.`;

  const slotDefs = buildCompareSlotDefs();
  const { dimsText, areaText } = compareRoofSummary(slotDefs);
  document.getElementById("compare-roof-dims").textContent = dimsText;
  document.getElementById("compare-roof-area").textContent = areaText;
  document.getElementById("compare-roof-hint").textContent = dimsText === "Varies"
    ? "Each saved layout keeps the roof it was saved from — every card's own stats reflect its real size."
    : "Every saved layout shares this roof.";

  setComparePriorityControlsVisible(true);
  compareResultsCache = slotDefs.map(layoutAndScoreConfig);
  compareCardsBuilt = false;
  if (contentEl) contentEl.innerHTML = `<div class="compare-cards" id="compareCards"></div>`;
  renderCompareResults(compareResultsCache, computeWeights());
}

document.getElementById("btn-compare-guide")?.addEventListener("click", () => {
  compareShowingGuide = !compareShowingGuide;
  updateCompareUI();
});
document.addEventListener("click", e => {
  if (!e.target.closest("#btn-compare-guide-empty")) return;
  compareShowingGuide = true;
  updateCompareUI();
});
