/**
 * vegetation.js — plants as objects you place, not ground you draw
 *
 * A tree has a position, a crown diameter and a root ball. You place one; you
 * do not draw a rectangle of trees. That puts vegetation on the same side of
 * the split as courts and equipment, and off the side where green roof
 * build-ups live:
 *
 *   DRAWN   ground with no fixed size  — green roof zones
 *   PLACED  objects with real dimensions — courts, equipment, and plants
 *
 * The footprint is the crown, because that is what actually occupies the roof
 * and what has to clear a court, a parapet or another tree. Trunk position is
 * the centre of it.
 *
 * ── The rule that connects the two halves ──
 * Every plant needs a minimum substrate depth for its roots, and a green roof
 * assembly has a real substrate layer with a real thickness. So a tree placed
 * on an extensive sedum roof (100 mm) is not a judgement call — it is wrong,
 * and the app can say so. This is the first rule where the ground the designer
 * drew and the object they placed actually have to agree.
 *
 * Depths follow FLL, the German green roof guideline the rest of this app's
 * garden data already cites: roughly 150-250 mm for grasses and perennials,
 * 400-600 mm for shrubs, 600-1000 mm for small and large trees.
 */

/**
 * Real species, not size categories.
 *
 * "Small tree" is not something a nursery supplies or a Revit family
 * represents — Cornus mas is. And once it is a species, its dimensions come
 * WITH it: crown width is a property of the plant, not a number a designer
 * types. Where a species is supplied in a range of sizes the range travels
 * too, and the designer picks within it.
 *
 * Trees are the eight Van den Berk specifically recommends for roof gardens,
 * with each one's published mature height and crown width. Their guidance for
 * roof planting is also where the tree substrate figure comes from: "you need
 * at least 70-80 cm root space for trees", and a roof carrying around
 * 1000 kg/m2 before small trees are possible at all.
 *
 * height_m matters beyond drawing: it is what a shading, wind or clearance
 * analysis needs, and none of that can be reconstructed from a plan footprint.
 * So it travels in the export whether or not this app uses it yet.
 *
 * Sourced figures are marked. Where a dimension is a horticultural norm rather
 * than a published nursery figure it says so, for the same reason the
 * assemblies distinguish published from typical: someone specifying a plant
 * needs to know which numbers came from the grower.
 */
const VEGETATION_TYPES = {
  cornus_mas: {
    label: "Cornus mas",
    common: "Cornelian cherry",
    short: "Cornus mas",
    form: "tree",
    height_m: 6, height_range: "5–6 m",
    crown_m: 5.5, crown_min_m: 5, crown_max_m: 6,
    min_substrate_mm: 800,
    color: "#2f7a43",
    note: "Multi-stemmed small tree, dense round crown. Slow growing.",
    source: "Van den Berk",
    source_url: "https://www.vdberk.com/trees/cornus-mas/",
    dimensions_published: true,
  },
  pyrus_salicifolia_pendula: {
    label: "Pyrus salicifolia 'Pendula'",
    common: "Weeping willow-leaved pear",
    short: "Pyrus 'Pendula'",
    form: "tree",
    height_m: 6, height_range: "5–6 m",
    crown_m: 5.5, crown_min_m: 5, crown_max_m: 6,
    min_substrate_mm: 800,
    color: "#3f8f4f",
    note: "Broad weeping crown. Withstands wind and dry soil, tolerates paving.",
    source: "Van den Berk",
    source_url: "https://www.vdberk.com/trees/pyrus-salicifolia-pendula/",
    dimensions_published: true,
  },
  pinus_parviflora_glauca: {
    label: "Pinus parviflora 'Glauca'",
    common: "Japanese white pine",
    short: "Pinus 'Glauca'",
    form: "tree",
    height_m: 9, height_range: "6–12 m",
    crown_m: 8, crown_min_m: 6, crown_max_m: 10,
    min_substrate_mm: 800,
    color: "#1f5c33",
    note: "Evergreen, broad pyramidal. Withstands sea wind — but tolerates no paving.",
    source: "Van den Berk",
    source_url: "https://www.vdberk.com/trees/pinus-parviflora-glauca/",
    dimensions_published: true,
  },
  carpinus_japonica: {
    label: "Carpinus japonica",
    common: "Japanese hornbeam",
    short: "Carpinus japonica",
    form: "tree",
    height_m: 11, height_range: "8–15 m",
    crown_m: 7, crown_min_m: 6, crown_max_m: 8,
    min_substrate_mm: 800,
    color: "#27663a",
    note: "Vase-shaped becoming rounded. The largest here — check the structure.",
    source: "Van den Berk",
    source_url: "https://www.vdberk.com/trees/carpinus-japonica/",
    dimensions_published: true,
  },

  lavandula_angustifolia: {
    label: "Lavandula angustifolia",
    common: "Lavender",
    short: "Lavender",
    form: "shrub",
    height_m: 0.6, height_range: "0.4–0.8 m",
    crown_m: 0.8, crown_min_m: 0.6, crown_max_m: 1.0,
    min_substrate_mm: 200,
    color: "#7b6fa8",
    note: "Drought-tolerant sub-shrub, a green roof staple.",
    source: "Horticultural norm",
    dimensions_published: false,
  },
  festuca_glauca: {
    label: "Festuca glauca",
    common: "Blue fescue",
    short: "Blue fescue",
    form: "grass",
    height_m: 0.3, height_range: "0.2–0.4 m",
    crown_m: 0.4, crown_min_m: 0.3, crown_max_m: 0.5,
    min_substrate_mm: 150,
    color: "#6b9e8f",
    note: "Ornamental grass, clump forming. Tolerates thin substrate.",
    source: "Horticultural norm",
    dimensions_published: false,
  },
  sedum_mix: {
    label: "Sedum mix",
    common: "Stonecrop mat",
    short: "Sedum",
    form: "groundcover",
    height_m: 0.15, height_range: "0.05–0.2 m",
    crown_m: 1.0, crown_min_m: 0.5, crown_max_m: 2.0,
    min_substrate_mm: 60,
    color: "#7fb069",
    note: "The extensive green roof default — survives the thinnest build-ups.",
    source: "Horticultural norm",
    dimensions_published: false,
  },
};

const vegetationState = {
  typeKey: "cornus_mas",
  /** Crown diameter in metres, editable: a species is not one fixed size. */
  crown_m: VEGETATION_TYPES.cornus_mas.crown_m,
};

function activeVegetationType() {
  return VEGETATION_TYPES[vegetationState.typeKey] || VEGETATION_TYPES.cornus_mas;
}

/**
 * Pushes one plant to the Combine tray, where it behaves like any other placed
 * object — drag onto the roof, move, rotate, delete.
 *
 * The crown is square on the canvas because the whole rules engine works in
 * axis-aligned boxes. A crown is round, so this slightly over-reserves at the
 * corners — the safe direction for a clearance check.
 */
function pushVegetationToCombine() {
  const type = activeVegetationType();
  const crown = Number(vegetationState.crown_m) || type.crown_m;

  const item = addCombineItem({
    kind: "vegetation",
    label: type.short,
    length_m: crown,
    width_m: crown,
    sourceJson: {
      version: "1.0",
      generator: "Sportify-Vegetation",
      vegetation: {
        species_key: vegetationState.typeKey,
        botanical_name: type.label,
        common_name: type.common,
        form: type.form,
        crown_m: crown,
        // Carried whether or not this app uses it: a shading, wind or clearance
        // analysis needs height, and it cannot be recovered from a plan.
        height_m: type.height_m,
        height_range: type.height_range,
        min_substrate_mm: type.min_substrate_mm,
        // Named so a Revit family can be found or generated per species, the
        // same way an assembly becomes a floor type.
        revit_family_name: `Sportify - ${type.label}`,
        source: type.source,
        source_url: type.source_url || null,
        dimensions_published: !!type.dimensions_published,
      },
    },
  });

  if (typeof showToast === "function") {
    showToast(`${type.label} added`,
      `${crown.toFixed(1)} m crown — drag it onto the roof. Needs ${type.min_substrate_mm} mm of substrate.`);
  }
  return item;
}

/* ── Rules ── */

/** The green roof zone a plant is standing on, if any. */
function zoneUnderVegetation(item) {
  if (typeof combineState.zones === "undefined") return null;
  const fp = getFootprint(item);
  const hits = (combineState.zones || []).filter(z =>
    rectsOverlap({ x: item.x_m, y: item.y_m, w: fp.w, h: fp.h },
                 { x: z.x_m, y: z.y_m, w: z.length_m, h: z.width_m }));
  return hits.length ? hits[0] : null;
}

/** Substrate depth a zone's build-up actually provides, in millimetres. */
function zoneSubstrateMm(zone) {
  if (!zone || typeof getAssembly !== "function") return 0;
  const assembly = getAssembly(zone.assemblyKey);
  if (!assembly) return 0;
  // Growing medium only. Drainage and protection layers add build-up height but
  // nothing a root can occupy, and counting them would pass a tree on a roof
  // that cannot hold one.
  return assembly.layers
    .filter(l => l.fn === "substrate")
    .reduce((sum, l) => sum + l.mm, 0);
}

/**
 * Plants whose roots have nowhere to go: standing on bare roof, or on a
 * build-up too shallow for them. The one rule where the ground someone drew
 * and the object they placed have to agree.
 */
function findVegetationRootProblems() {
  return (combineState.items || [])
    .filter(it => it.kind === "vegetation")
    .map(it => {
      const need = it.sourceJson?.vegetation?.min_substrate_mm || 0;
      const zone = zoneUnderVegetation(it);
      const have = zoneSubstrateMm(zone);
      if (!zone) return { itemId: it.id, label: it.label, need, have: 0, reason: "not on a green roof zone" };
      if (have < need) return { itemId: it.id, label: it.label, need, have, reason: `only ${have} mm of substrate` };
      return null;
    })
    .filter(Boolean);
}

/* ── Panel ── */

function renderVegetationPanel() {
  const el = document.getElementById("vegetation-panel");
  if (!el) return;
  const type = activeVegetationType();

  const forms = { tree: "Trees", shrub: "Shrubs", grass: "Grasses", groundcover: "Ground cover" };
  const options = Object.entries(forms).map(([form, heading]) => {
    const inForm = Object.entries(VEGETATION_TYPES).filter(([, v]) => v.form === form);
    if (!inForm.length) return "";
    return `<optgroup label="${heading}">` + inForm.map(([k, v]) =>
      `<option value="${k}"${k === vegetationState.typeKey ? " selected" : ""}>${v.label} — ${v.common}</option>`).join("") + `</optgroup>`;
  }).join("");

  const problems = findVegetationRootProblems();
  const planted = (combineState.items || []).filter(i => i.kind === "vegetation").length;

  el.innerHTML = `
    <div class="section">
      <label>What are you planting?</label>
      <select id="veg-type-select">${options}</select>
      <p class="hint"><em>${type.common}</em> — ${type.note}</p>
    </div>

    <div class="section">
      <label>Crown diameter — ${type.crown_min_m}–${type.crown_max_m} m</label>
      <input type="range" id="veg-crown" style="width:100%"
             min="${type.crown_min_m}" max="${type.crown_max_m}" step="0.1"
             value="${Number(vegetationState.crown_m).toFixed(1)}">
      <p class="hint">
        <strong>${Number(vegetationState.crown_m).toFixed(1)} m</strong> crown —
        the species' own range, since a nursery supplies it at different sizes.
      </p>
      <p class="hint">
        Mature height <strong>${type.height_range}</strong> ·
        needs <strong>${type.min_substrate_mm} mm</strong> of substrate ·
        ${type.dimensions_published
            ? `<a href="${type.source_url}" target="_blank" rel="noopener">${type.source}</a> figures`
            : `${type.source}`}
      </p>
    </div>

    <div class="section">
      <button class="btn-export accent" id="btn-push-vegetation">
        <i class="ti ti-plus" aria-hidden="true"></i>Push to Combine
      </button>
      <p class="hint">Lands in the tray — drag it onto the roof like any other piece.</p>
    </div>

    ${planted ? `<div class="section"><p class="hint"><strong>${planted}</strong> plant(s) placed</p></div>` : ""}

    ${problems.length ? `
      <div class="section">
        <label style="color:#ef4444">Roots have nowhere to go</label>
        ${problems.map(p => `<p class="hint">⚠ ${p.label} needs ${p.need} mm — ${p.reason}.</p>`).join("")}
        <p class="hint">Draw a green roof zone beneath it, or choose a deeper build-up.</p>
      </div>` : ""}
  `;

  document.getElementById("veg-type-select")?.addEventListener("change", e => {
    vegetationState.typeKey = e.target.value;
    // Reset the crown to the new type's own size — carrying a large tree's
    // 8 m crown onto a ground-cover mat would be nonsense.
    vegetationState.crown_m = activeVegetationType().crown_m;
    renderVegetationPanel();
  });
  document.getElementById("veg-crown")?.addEventListener("change", e => {
    vegetationState.crown_m = Math.max(0.5, parseFloat(e.target.value) || activeVegetationType().crown_m);
    renderVegetationPanel();
  });
  document.getElementById("btn-push-vegetation")?.addEventListener("click", () => {
    pushVegetationToCombine();
    renderVegetationPanel();
  });
}

function toggleVegetationFlyout(force) {
  if ((force === undefined || force) && typeof setMode === "function" && activeMode !== "combine") setMode("combine");
  const fly = document.getElementById("vegetation-flyout");
  const btn = document.getElementById("btn-vegetation-toggle");
  if (!fly) return;
  const open = force !== undefined ? force : fly.hidden;
  fly.hidden = !open;
  if (btn) btn.classList.toggle("active", open);
  if (open) renderVegetationPanel();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-vegetation-toggle")?.addEventListener("click", () => toggleVegetationFlyout());
  document.getElementById("btn-vegetation-close")?.addEventListener("click", () => toggleVegetationFlyout(false));
});
