/**
 * assemblies.js — real green roof systems from real providers
 *
 * Replaces the garden configurator's "material quality: low / medium / high",
 * which mapped to nothing a designer or a supplier would recognise. You do not
 * compose a green roof layer by layer: ZinCo, Bauder and Optigrün sell a NAMED
 * SYSTEM with a fixed build-up, and specifying one means naming that system.
 *
 * Each entry here is one such system, and maps one-to-one onto a Revit floor
 * type — ordered layers, each with a material and a thickness.
 *
 * ── On thickness ──
 * Every layer carries a thickness, because geometry needs one: this becomes
 * real build-up depth in Revit, not a label. But providers publish per-layer
 * figures inconsistently — growing media depth is almost always given, drainage
 * and protection layers usually are not.
 *
 * So each thickness carries its provenance:
 *   "published"  printed in the provider's own material (source_url)
 *   "typical"    a normal value for that layer type, used so the build-up
 *                resolves to real geometry — NOT the provider's figure
 *
 * The distinction matters at specification time. Someone writing "ZinCo
 * Floradrain FD 60" into a tender needs to know which numbers came from ZinCo
 * and which are ours, and a single unmarked number would hide that completely.
 *
 * System-level figures (build-up, saturated weight, water storage) are
 * published values and feed the analysis directly: weight into live loads,
 * storage into water management, depth into the model.
 *
 * Seed data only — three German providers, enough to build against. Extending
 * it is reading a datasheet and adding an entry, not a code change; provider
 * sites block automated fetching (Bauder returns 403) and publish specs as
 * PDFs for humans, so curation is the honest mechanism.
 */

const ASSEMBLY_LAYER_FUNCTIONS = {
  vegetation: { label: "Vegetation", color: "#3f8f4f" },
  substrate: { label: "Growing medium", color: "#8a6a43" },
  filter: { label: "Filter", color: "#c7b89a" },
  drainage: { label: "Drainage / storage", color: "#5b8db8" },
  protection: { label: "Protection", color: "#9aa0a6" },
  root_barrier: { label: "Root barrier", color: "#6b6f76" },
  waterproofing: { label: "Waterproofing", color: "#4a4e55" },
  wearing: { label: "Wearing surface", color: "#a8a29a" },
  bedding: { label: "Bedding", color: "#b8ab93" },
};

const ASSEMBLIES = {
  zinco_roof_garden: {
    provider: "ZinCo",
    provider_country: "Germany",
    system_name: "Roof Garden",
    category: "intensive",
    label: "ZinCo — Roof Garden (intensive)",
    description: "Intensive build-up for planted roof gardens with shrubs and small trees.",
    build_up_mm: 318,          // published: "from 12½ in."
    saturated_kg_m2: 425,      // published: "from 87 lbs/sq. ft."
    water_storage_l_m2: 143,   // published: "from 3.5 gal/sq. ft."
    source_url: "https://zinco-usa.com/systems/roof-garden",
    layers: [
      { name: "Plant layer per plant list", fn: "vegetation", mm: 100, src: "typical" },
      { name: "Growing media Zincoblend I", fn: "substrate", mm: 250, src: "published" },
      { name: "Filter Sheet SF", fn: "filter", mm: 2, src: "typical" },
      { name: "Floradrain FD 60 neo, filled with Zincoblend M", fn: "drainage", mm: 60, src: "typical" },
      { name: "Protection Mat ISM 50", fn: "protection", mm: 5, src: "typical" },
      { name: "Root Barrier WSB 100-PO", fn: "root_barrier", mm: 1, src: "typical" },
    ],
  },

  zinco_sloped_sedum: {
    provider: "ZinCo",
    provider_country: "Germany",
    system_name: "Sloped Sedum",
    category: "extensive",
    label: "ZinCo — Sloped Sedum (extensive)",
    description: "Extensive sedum for pitched roofs, 20°–35°. Low weight, no access.",
    build_up_mm: 127,          // published: "approx. 5 in."
    saturated_kg_m2: 171,      // published: "approx. 35 lbs/sq. ft."
    water_storage_l_m2: 57,    // published: "approx. 1.4 gal/sq. ft."
    source_url: "https://zinco-usa.com/systems/sloped-sedum",
    layers: [
      { name: "Plant community Sloped Sedum", fn: "vegetation", mm: 20, src: "typical" },
      { name: "Growing media Zincoblend E", fn: "substrate", mm: 110, src: "published" },
      { name: "Georaster Elements", fn: "drainage", mm: 40, src: "typical" },
      { name: "Protection Mat WSM 150", fn: "protection", mm: 5, src: "typical" },
    ],
  },

  bauder_extensive_sedum: {
    provider: "Bauder",
    provider_country: "Germany",
    system_name: "BauderEXTENSIVE Lightweight Sedum",
    category: "extensive",
    label: "Bauder — EXTENSIVE Lightweight Sedum",
    description: "Bauder's lightest all-in-one system: mature sedum blanket on a thin substrate.",
    // Bauder's site blocks automated access (HTTP 403), so only the substrate
    // depth quoted in their published product summary is a confirmed figure.
    // The system totals are left null rather than guessed — they are the
    // numbers an engineer would check a deck against.
    build_up_mm: null,
    saturated_kg_m2: null,
    water_storage_l_m2: null,
    source_url: "https://www.bauder.co.uk/green-and-blue-roofs/green-roofs/extensive-lightweight-sedum",
    layers: [
      { name: "Mature sedum blanket", fn: "vegetation", mm: 25, src: "typical" },
      { name: "Extensive substrate", fn: "substrate", mm: 20, src: "published" },
      { name: "Water retention and filter layer", fn: "drainage", mm: 20, src: "typical" },
      { name: "Root-resistant waterproofing", fn: "waterproofing", mm: 4, src: "typical" },
    ],
  },

  optigruen_nature_roof: {
    provider: "Optigrün",
    provider_country: "Germany",
    system_name: "Naturdach",
    category: "extensive",
    label: "Optigrün — Naturdach (extensive)",
    description: "Extensive nature roof for biodiversity, varied substrate depth.",
    build_up_mm: null,
    saturated_kg_m2: null,
    water_storage_l_m2: null,
    source_url: "https://www.optigruen.de/systemloesungen",
    layers: [
      { name: "Seed mix / plug planting", fn: "vegetation", mm: 20, src: "typical" },
      { name: "Extensive substrate", fn: "substrate", mm: 100, src: "typical" },
      { name: "Filter fleece 105", fn: "filter", mm: 2, src: "typical" },
      { name: "Drainage element FKD 25", fn: "drainage", mm: 25, src: "typical" },
      { name: "Protection mat RMS 500", fn: "protection", mm: 5, src: "typical" },
    ],
  },

  // Not a green roof — the pedestrian surface that goes between the planted
  // areas. Included because a roof layout is not all vegetation, and the
  // walkway needs a real build-up in Revit exactly as the planting does.
  zinco_paved_walkway: {
    provider: "ZinCo",
    provider_country: "Germany",
    system_name: "Paved Walkway on Pedestals",
    category: "walkway",
    label: "ZinCo — Paved walkway on pedestals",
    description: "Pedestrian paving on adjustable pedestals, drained beneath.",
    build_up_mm: null,
    saturated_kg_m2: null,
    water_storage_l_m2: null,
    source_url: "https://zinco-greenroof.com/green-roof-systems",
    layers: [
      { name: "Concrete paving slab", fn: "wearing", mm: 40, src: "typical" },
      { name: "Adjustable pedestal", fn: "bedding", mm: 50, src: "typical" },
      { name: "Protection mat", fn: "protection", mm: 5, src: "typical" },
    ],
  },
};

/** Total of the layer thicknesses — what the geometry will actually be. */
function assemblyLayerTotalMm(assembly) {
  return (assembly.layers || []).reduce((sum, l) => sum + (l.mm || 0), 0);
}

/** How much of the build-up rests on figures the provider actually published. */
function assemblyPublishedShare(assembly) {
  const total = assemblyLayerTotalMm(assembly);
  if (!total) return 0;
  const published = (assembly.layers || [])
    .filter(l => l.src === "published")
    .reduce((sum, l) => sum + (l.mm || 0), 0);
  return published / total;
}

function assembliesByProvider() {
  const grouped = {};
  Object.entries(ASSEMBLIES).forEach(([key, a]) => {
    (grouped[a.provider] ||= []).push({ key, ...a });
  });
  return grouped;
}

function getAssembly(key) {
  return ASSEMBLIES[key] || null;
}

/* ── Garden configurator UI ── */

/**
 * Populates the system picker, grouped by provider. Grouping matters: a
 * designer chooses a supplier as much as a product, and "ZinCo" vs "Bauder"
 * is the first cut they make.
 */
function initAssemblyPicker() {
  const select = document.getElementById("gardenAssemblySelect");
  if (!select || select.options.length) return;

  const grouped = assembliesByProvider();
  select.innerHTML = Object.entries(grouped).map(([provider, list]) => `
    <optgroup label="${provider}">
      ${list.map(a => `<option value="${a.key}">${a.system_name} — ${a.category}</option>`).join("")}
    </optgroup>`).join("");

  select.addEventListener("change", () => {
    gardenState.assemblyKey = select.value;
    renderAssemblyDetail();
    if (typeof updateGardenUI === "function") updateGardenUI();
  });

  gardenState.assemblyKey = gardenState.assemblyKey || select.value;
  renderAssemblyDetail();
}

/**
 * The build-up itself, drawn as a stack — the way it appears on a section
 * drawing, thickest layers reading as thickest bands. A list of numbers would
 * carry the same data and none of the sense of what is being specified.
 */
function renderAssemblyDetail() {
  const el = document.getElementById("gardenAssemblyDetail");
  if (!el) return;
  const a = getAssembly(gardenState.assemblyKey);
  if (!a) { el.innerHTML = ""; return; }

  const totalMm = assemblyLayerTotalMm(a);
  const publishedPct = Math.round(assemblyPublishedShare(a) * 100);

  const stack = a.layers.map(l => {
    const f = ASSEMBLY_LAYER_FUNCTIONS[l.fn] || { label: l.fn, color: "#888" };
    // Height in proportion to the real thickness, floored so a 1 mm root
    // barrier is still visible as a line rather than vanishing.
    const h = Math.max(6, Math.round((l.mm / totalMm) * 150));
    return `
      <div style="display:flex;align-items:stretch;gap:8px;margin-bottom:2px">
        <div style="width:54px;height:${h}px;background:${f.color};border-radius:2px;flex:none"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px">${l.name}</div>
          <div class="hint">${f.label} · <strong>${l.mm} mm</strong>${
            l.src === "published"
              ? ` · <span style="color:#0ea355">published</span>`
              : ` · <span style="color:#f59e0b">typical</span>`}</div>
        </div>
      </div>`;
  }).join("");

  const fact = (label, value, unit) => value == null
    ? `<div class="hint">${label}: <span style="color:#f59e0b">not published</span></div>`
    : `<div class="hint">${label}: <strong>${value} ${unit}</strong></div>`;

  el.innerHTML = `
    <p class="hint" style="margin-top:6px">${a.description}</p>
    <div style="margin:10px 0">${stack}</div>
    <div class="hint"><strong>Build-up ${totalMm} mm</strong> from the layers above</div>
    ${fact("Published build-up", a.build_up_mm, "mm")}
    ${fact("Saturated weight", a.saturated_kg_m2, "kg/m²")}
    ${fact("Water storage", a.water_storage_l_m2, "L/m²")}
    <p class="hint" style="margin-top:8px">
      ${publishedPct}% of the build-up is from ${a.provider}'s published figures; the rest are
      typical values so the geometry resolves. Check a datasheet before specifying.
      ${a.source_url ? `<br><a href="${a.source_url}" target="_blank" rel="noopener">${a.provider} source</a>` : ""}
    </p>`;
}

document.addEventListener("DOMContentLoaded", initAssemblyPicker);

/**
 * The export shape for one system: everything Revit needs to build the floor
 * type without consulting a catalog of its own. Layer thicknesses go out in
 * metres like every other dimension in the payload, and each keeps its
 * provenance so a schedule can show which figures are the provider's.
 */
function buildAssemblyPayload(key) {
  const a = getAssembly(key);
  if (!a) return null;
  return {
    key,
    provider: a.provider,
    provider_country: a.provider_country,
    system_name: a.system_name,
    category: a.category,
    // Prefixed so a type this tool created is identifiable in a project
    // template that someone else maintains.
    revit_type_name: `Sportify - ${a.provider} ${a.system_name}`,
    build_up_mm: a.build_up_mm,
    saturated_kg_m2: a.saturated_kg_m2,
    water_storage_l_m2: a.water_storage_l_m2,
    source_url: a.source_url,
    total_thickness_m: assemblyLayerTotalMm(a) / 1000,
    layers: a.layers.map((l, i) => ({
      order: i,
      name: l.name,
      function: l.fn,
      thickness_m: l.mm / 1000,
      thickness_source: l.src,
    })),
  };
}

/** Every distinct system used anywhere in a layout, so an import creates each once. */
function collectUsedAssemblies(items) {
  const seen = new Map();
  (items || []).forEach(it => {
    const a = it.sourceJson && it.sourceJson.garden && it.sourceJson.garden.assembly;
    if (a && !seen.has(a.key)) seen.set(a.key, a);
  });
  return [...seen.values()];
}
