/**
 * designPanel.js — the live design panel beside the Combine canvas
 *
 * Replaces the Rules / Arrange / Review wizard that used to own this space.
 * Those three were sorted by WHEN in the process you need them, which put a
 * one-time setup screen in permanent view and hid the rule checklist — the
 * one thing that changes continuously — behind a click. Setup moved to a
 * flyout, per-selection tools stay with the selection, and what's left here
 * is only what changes as you design. That is the whole rule for this pane.
 *
 * Every tile opens a breakdown, because a single number tells you something
 * moved but never what caused it.
 */

/* Cost and carbon are shown as empty slots rather than omitted: they are the
   two numbers this panel exists for, and a visible "—" with a reason is how
   you tell a missing figure from a zero. Same posture the LCA card already
   takes for materials without an embodied-carbon value. */
const DESIGN_METRICS = [
  { key: "cost",    label: "Cost",    unit: "€"    },
  { key: "co2",     label: "CO₂",     unit: "kg"   },
  { key: "quality", label: "Quality", unit: ""     },
  { key: "access",  label: "Access",  unit: ""     },
  { key: "green",   label: "Green",   unit: "%"    },
];

const DESIGN_QUALITY_SCORE = { low: 40, medium: 70, high: 100 };

/** Last rendered values, so a tile can show what the last change did to it. */
let lastDesignMetrics = null;
let openDesignDetail = null;

/* ── Quantities ───────────────────────────────────────────────────────────
   The shopping list. A zone is not bought as "40 m² of ZinCo Roof Garden" —
   it is bought as 10 m³ of substrate plus 40 m² of drainage board, each in
   its own unit at its own price. Everything downstream (cost, carbon,
   weight) is this list times a different column, which is why it is computed
   once here rather than three times in three places.

   Unit rule: the layer's own price_unit decides. "EUR/m3" means it is bought
   by volume, "EUR/m2" by area. A drainage board is 60 mm thick and still sold
   by the square metre, so thickness alone cannot tell you — only the supplier
   can, and that is what the field records. The threshold below is the fallback
   for a layer with no price yet. */
const VOLUME_UNIT_THRESHOLD_MM = 25;

function zoneAreaM2(zone) {
  return (zone.length_m || 0) * (zone.width_m || 0);
}

/**
 * Per-layer quantities across every drawn zone, grouped by the layer's own
 * product name so two zones on the same build-up add up into one order line.
 */
function computeQuantityTakeoff() {
  const zones = (typeof combineState !== "undefined" && combineState.zones) || [];
  const lines = new Map();
  let unpricedArea = 0;

  zones.forEach(z => {
    const assembly = typeof getAssembly === "function" ? getAssembly(z.assemblyKey) : null;
    const area = zoneAreaM2(z);
    if (!assembly) { unpricedArea += area; return; }

    (assembly.layers || []).forEach((l, i) => {
      const mm = l.mm || 0;
      // Vegetation is the exception when guessing: its thickness is the
      // planting's height, not a bulk material. Once a price exists, the
      // price's unit settles it either way.
      const byVolume = l.price_unit
        ? l.price_unit === "EUR/m3"
        : (mm >= VOLUME_UNIT_THRESHOLD_MM && l.fn !== "vegetation");
      const id = `${l.name}||${l.fn}`;
      const row = lines.get(id) || {
        name: l.name, fn: l.fn, thicknessMm: mm, order: i,
        unit: byVolume ? "m³" : "m²", qty: 0,
        // Carried through so a quantity can always be traced back to whether
        // the provider actually published the thickness it was derived from.
        src: l.src, providers: new Set(),
        price: l.price ?? null, priceQuoted: !!l.price_quoted,
        costGroup: l.cost_group || null, cost: 0,
      };
      const qty = byVolume ? area * (mm / 1000) : area;
      row.qty += qty;
      if (row.price != null) row.cost += qty * row.price;
      row.providers.add(assembly.provider || "—");
      lines.set(id, row);
    });
  });

  const rows = [...lines.values()].sort((a, b) => a.order - b.order);
  return {
    lines: rows,
    zoneCount: zones.length,
    zoneAreaM2: zones.reduce((s, z) => s + zoneAreaM2(z), 0),
    unpricedArea,
    cost: rows.reduce((s, r) => s + r.cost, 0),
    missingPrices: rows.filter(r => r.price == null).length,
  };
}

/**
 * Courts, activity pieces and equipment: area times the reference material's
 * price per m². A piece with no reference material picked, or a material with
 * no price, is counted as missing rather than as free — the same rule the LCA
 * card already follows for carbon.
 */
function computePieceCost() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const materials = typeof analysisMaterialsCache !== "undefined" ? analysisMaterialsCache : [];
  let total = 0, covered = 0, missing = 0;
  const rows = [];
  items.filter(it => it.kind !== "vegetation").forEach(it => {
    if (typeof getFootprint !== "function") return;
    const fp = getFootprint(it);
    const area = fp.w * fp.h;
    const name = it.sourceJson?.materials?.reference_material
      || it.sourceJson?.garden?.materials?.reference_material;
    const mat = name ? materials.find(m => m.name === name) : null;
    if (!mat || mat.priceValue == null) { missing++; rows.push({ label: it.label, areaM2: area, cost: null }); return; }
    // Per m2 whatever the unit says: a piece is a surface, and a m3 price on a
    // surface material would be a data error rather than something to guess at.
    const cost = area * mat.priceValue;
    total += cost; covered++;
    rows.push({ label: it.label, areaM2: area, cost, material: mat.name,
                quoted: !!mat.priceIsQuoted, costGroup: mat.costGroupDin276 || null });
  });
  return { total, covered, missing, rows };
}

/** Plants are priced per plant, as a nursery sells them. */
function computePlantCost() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  let total = 0, missing = 0;
  items.filter(it => it.kind === "vegetation").forEach(it => {
    const p = it.sourceJson?.vegetation?.price_eur;
    if (p == null) { missing++; return; }
    total += p;
  });
  return { total, missing };
}

/** Plants grouped by species — a plant list is per species, never per stem. */
function computeSpeciesTally() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const tally = new Map();
  items.filter(it => it.kind === "vegetation").forEach(it => {
    const v = it.sourceJson?.vegetation || {};
    const name = v.botanical_name || it.label || "Unknown";
    const row = tally.get(name) || {
      name, common: v.common_name || "", count: 0,
      crownM: v.crown_m, heightM: v.mature_height_m,
      minSubstrateMm: v.min_substrate_mm,
    };
    row.count += 1;
    tally.set(name, row);
  });
  return [...tally.values()].sort((a, b) => b.count - a.count);
}

/* ── Metrics ─────────────────────────────────────────────────────────────── */

/**
 * Sustainability here counts the drawn ZONES and their real substrate depth.
 * compareController's version only looks at legacy `garden` items, so a roof
 * designed entirely from ground zones scored zero green — correct when it was
 * written, wrong since zones replaced the Garden tab.
 */
function computeGreenMetrics() {
  const roof = (typeof combineState !== "undefined" && combineState.roof) || { length: 0, width: 0 };
  const roofAreaM2 = (roof.length || 0) * (roof.width || 0);
  const zones = (typeof combineState !== "undefined" && combineState.zones) || [];

  let greenAreaM2 = 0, weightedSubstrateMm = 0;
  zones.forEach(z => {
    const assembly = typeof getAssembly === "function" ? getAssembly(z.assemblyKey) : null;
    const area = zoneAreaM2(z);
    greenAreaM2 += area;
    if (!assembly) return;
    // Only substrate holds water a plant can use — drainage and protection
    // add build-up height but no root space, the same distinction the
    // planting rule already makes.
    const substrateMm = (assembly.layers || [])
      .filter(l => l.fn === "substrate")
      .reduce((s, l) => s + (l.mm || 0), 0);
    weightedSubstrateMm += area * substrateMm;
  });

  const avgSubstrateCm = greenAreaM2 ? (weightedSubstrateMm / greenAreaM2) / 10 : 0;
  return {
    greenAreaM2,
    roofAreaM2,
    coveragePercent: roofAreaM2 ? Math.round((greenAreaM2 / roofAreaM2) * 100) : 0,
    avgSubstrateCm,
    retentionPercent: greenAreaM2 ? Math.min(90, Math.round(30 + avgSubstrateCm * 2)) : 0,
  };
}

function computeQualityMetric() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  let totalArea = 0, weighted = 0;
  const tiers = new Map();
  items.forEach(it => {
    if (typeof getFootprint !== "function") return;
    const fp = getFootprint(it);
    const area = fp.w * fp.h;
    const tier = it.sourceJson?.materials?.quality_level
      || it.sourceJson?.garden?.materials?.quality_level || "medium";
    totalArea += area;
    weighted += area * (DESIGN_QUALITY_SCORE[tier] ?? 70);
    const row = tiers.get(tier) || { tier, count: 0, areaM2: 0 };
    row.count += 1; row.areaM2 += area;
    tiers.set(tier, row);
  });
  return {
    score: totalArea ? Math.round(weighted / totalArea) : null,
    totalAreaM2: totalArea,
    tiers: [...tiers.values()].sort((a, b) => b.areaM2 - a.areaM2),
  };
}

function computeAccessMetric(circulation) {
  if (!circulation || typeof pathLengthM !== "function") return { score: null };
  const distances = circulation.paths.map(p => pathLengthM(p.points));
  const maxDist = distances.length ? Math.max(...distances) : 0;
  const reachOk = circulation.unreachable.size === 0;
  const minWidth = typeof getAnalysisParam === "function"
    ? getAnalysisParam("Accessibility", "min_circulation_width_m") : 1.5;
  const widthOk = DESIGN_RULES.circulationWidth_m >= minWidth;
  const distScore = Math.max(15, Math.min(100, 100 - maxDist * 4));
  return {
    score: reachOk ? Math.round(distScore * 0.6 + (widthOk ? 100 : 50) * 0.4) : 20,
    maxDist, reachOk, widthOk, minWidth,
    unreachable: circulation.unreachable.size,
  };
}

/**
 * Embodied carbon, same basis as the Analysis tab: a piece's area times its
 * reference material's kg CO2e/m². Pieces without either are counted as
 * uncovered, never as zero.
 *
 * Build-up layers contribute NOTHING yet — the layers carry no material link
 * and no carbon figure, so a 418 mm six-product green roof currently counts
 * as nothing at all. That is the gap the quantity takeoff above exists to
 * close: the same lines, times a carbon column instead of a price column.
 */
function computeCarbonMetric() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const materials = typeof analysisMaterialsCache !== "undefined" ? analysisMaterialsCache : null;
  if (!materials || typeof getFootprint !== "function") {
    return { totalKg: null, covered: 0, total: items.length, reason: "material carbon figures not loaded" };
  }
  let totalKg = 0, covered = 0;
  items.forEach(it => {
    const name = it.sourceJson?.materials?.reference_material
      || it.sourceJson?.garden?.materials?.reference_material;
    const mat = name ? materials.find(m => m.name === name) : null;
    if (mat && mat.embodiedCarbonValue != null) {
      const fp = getFootprint(it);
      totalKg += mat.embodiedCarbonValue * fp.w * fp.h;
      covered += 1;
    }
  });
  return { totalKg: covered ? totalKg : null, covered, total: items.length };
}

function computeDesignMetrics(circulation) {
  const takeoff = computeQuantityTakeoff();
  const green = computeGreenMetrics();
  const quality = computeQualityMetric();
  const access = computeAccessMetric(circulation);
  const carbon = computeCarbonMetric();

  const pieces = computePieceCost();
  const plants = computePlantCost();
  const costTotal = takeoff.cost + pieces.total + plants.total;
  const anythingPriced = takeoff.cost > 0 || pieces.total > 0 || plants.total > 0;

  return {
    // Ground, pieces and planting, each measured in its own unit and summed.
    // Null rather than zero when nothing carries a price — an empty roof and
    // an unpriced one are different facts.
    cost: {
      value: anythingPriced ? costTotal : null,
      detail: { takeoff, pieces, plants, total: costTotal },
    },
    co2: { value: carbon.totalKg, detail: carbon },
    quality: { value: quality.score, detail: quality },
    access: { value: access.score, detail: access },
    green: { value: green.greenAreaM2 ? green.coveragePercent : null, detail: green },
    takeoff, species: computeSpeciesTally(),
  };
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

function formatMetric(key, value) {
  if (value == null) return "—";
  if (key === "cost") return "€ " + Math.round(value).toLocaleString("en-US");
  if (key === "co2") return value >= 1000
    ? (value / 1000).toFixed(1) + " t" : Math.round(value) + " kg";
  if (key === "green") return value + " %";
  return Math.round(value);
}

function metricDeltaHtml(key, value) {
  if (!lastDesignMetrics || value == null) return "";
  const prev = lastDesignMetrics[key];
  if (prev == null || prev === value) return "";
  const diff = value - prev;
  const up = diff > 0;
  const shown = key === "cost" ? "€" + Math.abs(Math.round(diff)).toLocaleString("en-US")
    : key === "co2" ? Math.abs(Math.round(diff)) + " kg"
    : Math.abs(Math.round(diff));
  return `<span class="design-delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${shown}</span>`;
}

function renderDesignPanel(circulation) {
  const host = document.getElementById("design-metrics");
  if (!host) return;

  const m = computeDesignMetrics(circulation);

  host.innerHTML = DESIGN_METRICS.map(def => {
    const v = m[def.key].value;
    return `<button class="design-tile${openDesignDetail === def.key ? " open" : ""}${v == null ? " empty" : ""}"
              data-metric="${def.key}" title="Show the breakdown">
              <span class="design-tile-val">${formatMetric(def.key, v)}</span>
              <span class="design-tile-lbl">${def.label}</span>
              ${metricDeltaHtml(def.key, v)}
            </button>`;
  }).join("");

  lastDesignMetrics = DESIGN_METRICS.reduce((acc, d) => {
    acc[d.key] = m[d.key].value; return acc;
  }, {});

  host.querySelectorAll(".design-tile").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.metric;
      openDesignDetail = openDesignDetail === key ? null : key;
      renderDesignDetail(m);
      renderDesignPanel(circulation);
    });
  });

  renderDesignDetail(m);
  updateRulesBadge();
}

function detailRows(rows) {
  if (!rows.length) return `<p class="hint">Nothing to show yet.</p>`;
  return `<table class="design-detail-table"><tbody>${rows.map(r =>
    `<tr><td>${r[0]}</td><td class="num">${r[1]}</td>${r[2] ? `<td class="note">${r[2]}</td>` : "<td></td>"}</tr>`
  ).join("")}</tbody></table>`;
}

function renderDesignDetail(m) {
  const el = document.getElementById("design-detail");
  if (!el) return;
  if (!openDesignDetail) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;

  let title = "", body = "";

  if (openDesignDetail === "cost") {
    const d = m.cost.detail, t = d.takeoff;
    title = "Where the cost is";

    const eur = v => v == null ? "—" : "€ " + Math.round(v).toLocaleString("en-US");

    // By DIN 276 cost group first, because that is the shape a German estimate
    // has to arrive in — a bare total cannot be benchmarked or handed on.
    const groups = new Map();
    const add = (kg, cost) => { if (cost) groups.set(kg || "—", (groups.get(kg || "—") || 0) + cost); };
    t.lines.forEach(l => add(l.costGroup, l.cost));
    d.pieces.rows.forEach(r => add(r.costGroup, r.cost));
    (combineState.items || []).filter(i => i.kind === "vegetation")
      .forEach(i => add(i.sourceJson?.vegetation?.cost_group, i.sourceJson?.vegetation?.price_eur));

    const KG_LABEL = { "363": "Roof coverings", "530": "Surfaces", "560": "Fitted items", "570": "Planted areas" };

    const summary = detailRows([
      ["Ground build-ups", eur(t.cost), `${t.zoneCount} zone(s)`],
      ["Courts and equipment", eur(d.pieces.total), `${d.pieces.covered} priced`],
      ["Plants", eur(d.plants.total), ""],
      ["<strong>Total</strong>", `<strong>${eur(d.total)}</strong>`, ""],
    ]);

    const byGroup = groups.size
      ? `<label class="design-detail-sub">By DIN 276 cost group</label>` + detailRows(
          [...groups.entries()].sort().map(([kg, c]) => [`KG ${kg}`, eur(c), KG_LABEL[kg] || ""]))
      : "";

    const layers = t.lines.length
      ? `<label class="design-detail-sub">Build-up, per layer</label>` + detailRows(t.lines.map(l => [
          l.name,
          `${l.qty < 10 ? l.qty.toFixed(1) : Math.round(l.qty)} ${l.unit}`,
          l.price == null ? "no price" : eur(l.cost),
        ]))
      : "";

    const unpriced = t.missingPrices + d.pieces.missing + d.plants.missing;
    body = summary + byGroup + layers
      + `<p class="hint"><strong>Every price here is estimated</strong>, not quoted — German market rates for
         material plus installation. They carry that flag in the database, so replacing one with a real
         supplier quote changes the number and the flag together.</p>`
      + (unpriced ? `<p class="hint">${unpriced} item(s) carry no price and are excluded from the total,
         rather than counted as free.</p>` : "")
      + (t.lines.length ? "" : `<p class="hint">Draw a ground zone and its build-up becomes an order list here.</p>`);
  }

  if (openDesignDetail === "co2") {
    const c = m.co2.detail;
    title = "Embodied carbon";
    body = `<p class="hint">${c.covered} of ${c.total} piece(s) have both a reference material and a
              published carbon figure${c.totalKg == null ? " — so no total is shown rather than a misleading zero" : ""}.</p>
            <p class="hint"><strong>Build-up layers count for nothing here yet.</strong> A six-product green roof
              contributes zero because the layers carry no material link. The quantity list under Cost is
              what closes that — same lines, carbon column instead of a price column.</p>`;
  }

  if (openDesignDetail === "quality") {
    const q = m.quality.detail;
    title = "Quality by area";
    body = detailRows(q.tiers.map(t => [
      t.tier[0].toUpperCase() + t.tier.slice(1),
      `${Math.round(t.areaM2)} m²`,
      `${t.count} piece${t.count > 1 ? "s" : ""}`,
    ])) + `<p class="hint">Area-weighted, so a large Economy court outweighs a small Premium one.</p>`;
  }

  if (openDesignDetail === "access") {
    const a = m.access.detail;
    title = "Getting around";
    body = a.score == null ? `<p class="hint">Place a piece and an entrance to check routes.</p>`
      : detailRows([
          ["Longest route to an entrance", `${(a.maxDist || 0).toFixed(1)} m`, ""],
          ["Pieces not reachable", a.unreachable, a.reachOk ? "all reachable" : "needs a route"],
          ["Circulation width", `${DESIGN_RULES.circulationWidth_m} m`, a.widthOk ? `≥ ${a.minWidth} m` : `below ${a.minWidth} m`],
        ]);
  }

  if (openDesignDetail === "green") {
    const g = m.green.detail;
    const sp = m.species;
    title = "Planting";
    body = detailRows([
      ["Green area", `${Math.round(g.greenAreaM2)} m²`, `${g.coveragePercent}% of the roof`],
      ["Average substrate", `${g.avgSubstrateCm.toFixed(0)} cm`, "root space only"],
      ["Rain retained", `${g.retentionPercent}%`, "illustrative"],
    ]) + (sp.length
      ? `<label class="design-detail-sub">Species</label>` + detailRows(sp.map(s => [
          `<em>${s.name}</em>${s.common ? ` — ${s.common}` : ""}`,
          `${s.count}×`,
          s.heightM ? `${s.heightM} m tall` : "",
        ]))
      : `<p class="hint">No plants placed yet.</p>`);
  }

  el.innerHTML = `<div class="design-detail-head"><strong>${title}</strong>
      <button class="design-detail-close" title="Close">&times;</button></div>${body}`;
  el.querySelector(".design-detail-close")?.addEventListener("click", () => {
    openDesignDetail = null;
    renderDesignDetail(m);
    document.querySelectorAll(".design-tile.open").forEach(b => b.classList.remove("open"));
  });
}

/* ── Tabs ─────────────────────────────────────────────────────────────────
   Design / Rules / Tools share this pane. Grouped by what a thing IS — what
   the design scores, what it breaks, what edits it — rather than by when in
   the process you reach for it, which is what made the old wizard wrong. */

function setDesignTab(name) {
  document.querySelectorAll(".design-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".design-tab-body").forEach(el =>
    el.hidden = el.dataset.tabBody !== name);
}

document.getElementById("design-tabs")?.addEventListener("click", e => {
  const btn = e.target.closest(".design-tab");
  if (btn) setDesignTab(btn.dataset.tab);
});

/* Configuring the rules is occasional; checking them is constant. So the
   settings live behind the gear inside Rules rather than greeting you. */
document.getElementById("btn-rules-config")?.addEventListener("click", e => {
  const cfg = document.getElementById("rules-config");
  const btn = e.currentTarget;
  if (!cfg) return;
  cfg.hidden = !cfg.hidden;
  btn.setAttribute("aria-expanded", String(!cfg.hidden));
  btn.classList.toggle("on", !cfg.hidden);
});

/**
 * A count on the Rules tab, so a broken rule is noticed without going
 * looking — the one thing the checklist gave you by sitting in permanent
 * view, kept now that it has a tab of its own.
 */
function updateRulesBadge() {
  const badge = document.getElementById("rules-badge");
  if (!badge) return;
  const failed = document.querySelectorAll("#rules-panel .rule-row.fail").length;
  badge.textContent = failed || "";
  badge.hidden = failed === 0;
}

/* ── Suggested spots: on by default, but yours to switch off ───────────── */
let suggestionsEnabled = true;

function setSuggestionsEnabled(on) {
  suggestionsEnabled = !!on;
  const list = document.getElementById("suggestions-list");
  const hint = document.getElementById("suggestions-hint");
  if (list) list.hidden = !suggestionsEnabled;
  if (hint) hint.hidden = !suggestionsEnabled;
  // Recompute rather than just repaint: combineState.suggestions is gated at
  // source (combineController.js), so the roof and the list agree.
  if (typeof refreshSuggestions === "function") refreshSuggestions();
  else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
}

document.getElementById("toggle-suggestions")?.addEventListener("change", e =>
  setSuggestionsEnabled(e.target.checked));
