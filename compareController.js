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

/** Places one config's items via the real auto-arrange engine, adds edge-snapped entries, then checks every DESIGN_RULES criterion the same way Combine's own rules checklist does — this is the "make sure they satisfy all our criteria" verification, computed live rather than assumed. */
function layoutAndScoreConfig(def) {
  const state = {
    roof: { ...COMPARE_ROOF, boundary: null, originXm: 0, originYm: 0 },
    items: def.items.map((it, i) => ({ ...it, id: `${def.id}_item_${i}`, rotation: 0, x_m: 0, y_m: 0 })),
    entryPoints: [],
  };

  const { placements, unplaced } = ruleBasedArrange(state, DESIGN_RULES);
  state.items.forEach(it => { const p = placements.get(it.id); if (p) { it.x_m = p.x; it.y_m = p.y; } });

  def.entryEdges.forEach((edge, i) => {
    const anchor = edge === "left" ? nearestBoundaryPoint(state.roof, 0, state.roof.width / 2)
      : edge === "right" ? nearestBoundaryPoint(state.roof, state.roof.length, state.roof.width / 2)
      : nearestBoundaryPoint(state.roof, state.roof.length / 2, state.roof.width / 2);
    state.entryPoints.push({ id: `${def.id}_entry_${i}`, x_m: anchor.x, y_m: anchor.y, edge: anchor.edge });
  });

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
    scores,
    checklistHtml: checklist.map(c => `<div class="compare-rule-row ${c.pass ? "pass" : "fail"}"><i class="ti ${c.pass ? "ti-check" : "ti-x"}" aria-hidden="true"></i>${c.label}</div>`).join(""),
    statsLine: `${Math.round(totalItemAreaM2)} m² programmed · ${water.totalAreaM2 ? Math.round(water.totalAreaM2) + " m² garden (" + water.retentionPercent + "% retention)" : "no garden coverage"} · ${maxDist.toFixed(1)} m longest route to an entrance`,
    roofSvg: miniRoofSvg(state),
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
    </div>`;
}

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

function updateCompareUI() {
  document.getElementById("field-label").textContent = "Compare — predefined roof configurations";
  document.getElementById("norm-badge").textContent = "20 × 25 m · 500 m²";
  compareResultsCache = buildCompareConfigDefs().map(layoutAndScoreConfig);
  compareCardsBuilt = false;
  const contentEl = document.getElementById("compare-content");
  if (contentEl) contentEl.innerHTML = `<div class="compare-cards" id="compareCards"></div>`;
  renderCompareResults(compareResultsCache, computeWeights());
}
