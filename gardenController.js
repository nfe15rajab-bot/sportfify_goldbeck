/**
 * gardenController.js — Garden mode controller
 * State, activity-bar wiring, listeners, JSON export for Garden mode.
 * Split out of main.js so mode-specific logic doesn't all live in one file.
 */

const gardenState = {
  activeItemId: "parcel",
  themeId: "custom",
  length: 10.0,
  width: 6.0,
  quantity: 1,
  quality: "medium"
};

/* ── Garden activity bar ── */
function updateActivityBarForMode(mode) {
  const bar = document.getElementById("activity-bar");
  if (mode !== "garden") return;

  let html = `<div class="rail-cat-header">FUNC</div>`;
  Object.entries(GARDEN_ITEMS).forEach(([id, item]) => {
    if (item.category !== "functional") return;
    html += `<button class="activity-icon${id === gardenState.activeItemId ? " active" : ""}" data-garden-id="${id}" title="${item.label}">
               <i class="ti ${item.icon}"></i><span class="activity-icon-label">${item.short}</span>
             </button>`;
  });
  html += `<div class="activity-bar-divider"></div><div class="rail-cat-header">VEG</div>`;
  Object.entries(GARDEN_ITEMS).forEach(([id, item]) => {
    if (item.category !== "vegetation") return;
    html += `<button class="activity-icon${id === gardenState.activeItemId ? " active" : ""}" data-garden-id="${id}" title="${item.label}">
               <i class="ti ${item.icon}"></i><span class="activity-icon-label">${item.short}</span>
             </button>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll("[data-garden-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll("[data-garden-id]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      gardenState.activeItemId = btn.dataset.gardenId;

      const referenceItem = GARDEN_ITEMS[gardenState.activeItemId];
      gardenState.length = referenceItem.defaultLength;
      gardenState.width = referenceItem.defaultWidth;
      document.getElementById("gardenLength").value = referenceItem.defaultLength;
      document.getElementById("gardenWidth").value = referenceItem.defaultWidth;

      updateGardenUI();
    });
  });
}

/* ── Garden Configurator ── */
function updateGardenUI() {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  const theme = GARDEN_THEMES[gardenState.themeId];

  document.getElementById("field-label").textContent = `${item.label} — Theme: ${theme.label}`;
  document.getElementById("norm-badge").textContent  = item.norm;
  document.getElementById("theme-desc").textContent = theme.description;

  document.getElementById("garden-layer-dims").innerHTML = Object.entries(theme.layers).map(([key, layer]) => `
    <div class="dim-card"><div class="val">${(layer.thickness_m * 100).toFixed(0)} cm</div><div class="lbl">${layer.material}</div></div>
  `).join("");

  if(typeof drawGardenField === "function") drawGardenField(gardenState.activeItemId, gardenState.length, gardenState.width, isDarkMode());
}

document.getElementById("gardenTheme").addEventListener("change", e => { gardenState.themeId = e.target.value; updateGardenUI(); });
document.getElementById("gardenLength").addEventListener("input", e => { gardenState.length = Number(e.target.value) || 1; updateGardenUI(); });
document.getElementById("gardenWidth").addEventListener("input", e => { gardenState.width = Number(e.target.value) || 1; updateGardenUI(); });
document.getElementById("gardenQuantity").addEventListener("input", e => { gardenState.quantity = Number(e.target.value); document.getElementById("garden-qty-val").textContent = gardenState.quantity; });
document.querySelectorAll("#garden-quality-setting .q-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#garden-quality-setting .q-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); gardenState.quality = btn.dataset.q;
  });
});

/* ── Reference material/provider (sourced from the .NET reference DB,
   read fresh at export time — mirrors sportController.js's version). ── */
let gardenMaterialRefOptions = [];
let gardenProviderRefOptions = [];

async function initGardenReferenceDropdowns() {
  const matSelect = document.getElementById("gardenMaterialSelect");
  const provSelect = document.getElementById("gardenProviderSelect");
  const matManual = document.getElementById("gardenMaterialManual");
  const provManual = document.getElementById("gardenProviderManual");
  try {
    const [materials, providers] = await Promise.all([fetchReferenceMaterials(), fetchReferenceProviders()]);
    gardenMaterialRefOptions = materials.filter(m => m.category === "Green roof build-up" || m.category === "Roofing");
    gardenProviderRefOptions = providers.filter(p => p.category === "Green roof systems" || p.category === "Roofing & waterproofing");
    wireReferenceDropdown(matSelect, matManual, gardenMaterialRefOptions, false);
    wireReferenceDropdown(provSelect, provManual, gardenProviderRefOptions, false);
  } catch (err) {
    wireReferenceDropdown(matSelect, matManual, [], true);
    wireReferenceDropdown(provSelect, provManual, [], true);
  }
}
initGardenReferenceDropdowns();

function buildGardenPayload() {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  const theme = GARDEN_THEMES[gardenState.themeId];
  const mat = GARDEN_MATERIALS[gardenState.quality];
  const referenceMaterial = readReferenceSelection(document.getElementById("gardenMaterialSelect"), document.getElementById("gardenMaterialManual"), gardenMaterialRefOptions);
  const referenceProvider = readReferenceSelection(document.getElementById("gardenProviderSelect"), document.getElementById("gardenProviderManual"), gardenProviderRefOptions);

  return {
    version: "1.0",
    generator: "Sportify-Garden-Engine",
    quality_key: typeof getGardenQualityKey === "function" ? getGardenQualityKey(gardenState.activeItemId, gardenState.themeId, gardenState.quality) : "",
    garden: {
      type_id: gardenState.activeItemId,
      category: item.category,
      theme: gardenState.themeId,
      dimensions: { length_m: gardenState.length, width_m: gardenState.width },
      layers: Object.entries(theme.layers).map(([name, config]) => ({
        layer_name: name, thickness_m: config.thickness_m, material: config.material
      })),
      materials: { waterproofing: mat.waterproofing, drainage: mat.drainage, quality_level: gardenState.quality, reference_material: referenceMaterial, reference_provider: referenceProvider }
    }
  };
}

document.getElementById("btn-garden-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(buildGardenPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `garden_${gardenState.activeItemId}_${gardenState.themeId}.json`; a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("btn-push-garden").addEventListener("click", () => {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  for (let i = 0; i < Math.max(1, gardenState.quantity); i++) {
    addCombineItem({ kind: "garden", label: `${item.short} (${gardenState.themeId})`, length_m: gardenState.length, width_m: gardenState.width, sourceJson: buildGardenPayload() });
  }
  setMode("combine");
});
