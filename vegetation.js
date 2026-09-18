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

const VEGETATION_TYPES = {
  ground_cover: {
    label: "Ground cover / sedum",
    short: "Ground cover",
    crown_m: 1.0,
    height_m: 0.2,
    min_substrate_mm: 60,
    color: "#7fb069",
    note: "Mats and low planting. Works on the thinnest extensive build-ups.",
  },
  perennials: {
    label: "Perennials & grasses",
    short: "Perennials",
    crown_m: 1.5,
    height_m: 0.8,
    min_substrate_mm: 150,
    color: "#6b9e4f",
    note: "Herbaceous planting — needs a moderate substrate.",
  },
  shrub: {
    label: "Shrub",
    short: "Shrub",
    crown_m: 2.5,
    height_m: 2.0,
    min_substrate_mm: 400,
    color: "#4a8c3f",
    note: "Woody planting. Intensive build-up territory.",
  },
  small_tree: {
    label: "Small tree",
    short: "Small tree",
    crown_m: 4.0,
    height_m: 6.0,
    min_substrate_mm: 600,
    color: "#2f7a43",
    note: "Ornamental or fruit tree — 600 mm of substrate minimum.",
  },
  large_tree: {
    label: "Large tree",
    short: "Large tree",
    crown_m: 8.0,
    height_m: 12.0,
    min_substrate_mm: 1000,
    color: "#1f5c33",
    note: "Needs a deep build-up and usually a structural check.",
  },
  raised_bed: {
    label: "Raised growing bed",
    short: "Growing bed",
    crown_m: 3.0,
    height_m: 0.8,
    min_substrate_mm: 300,
    color: "#6b8f2f",
    note: "Urban farming — crops in a contained bed.",
  },
};

const vegetationState = {
  typeKey: "small_tree",
  /** Crown diameter in metres, editable: a species is not one fixed size. */
  crown_m: VEGETATION_TYPES.small_tree.crown_m,
};

function activeVegetationType() {
  return VEGETATION_TYPES[vegetationState.typeKey] || VEGETATION_TYPES.small_tree;
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
    label: type.label,
    length_m: crown,
    width_m: crown,
    sourceJson: {
      version: "1.0",
      generator: "Sportify-Vegetation",
      vegetation: {
        type_id: vegetationState.typeKey,
        crown_m: crown,
        height_m: type.height_m,
        min_substrate_mm: type.min_substrate_mm,
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

  const options = Object.entries(VEGETATION_TYPES)
    .map(([k, v]) => `<option value="${k}"${k === vegetationState.typeKey ? " selected" : ""}>${v.label}</option>`).join("");

  const problems = findVegetationRootProblems();
  const planted = (combineState.items || []).filter(i => i.kind === "vegetation").length;

  el.innerHTML = `
    <div class="section">
      <label>What are you planting?</label>
      <select id="veg-type-select">${options}</select>
      <p class="hint">${type.note}</p>
    </div>

    <div class="section">
      <label>Crown diameter (m)</label>
      <input type="number" id="veg-crown" step="0.5" min="0.5" value="${Number(vegetationState.crown_m).toFixed(1)}">
      <p class="hint">
        Mature height ${type.height_m} m · needs <strong>${type.min_substrate_mm} mm</strong> of substrate.
        The crown is the footprint — what has to clear a court or a parapet.
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
