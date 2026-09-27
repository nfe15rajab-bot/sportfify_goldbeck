/**
 * kineticsCombine.js — the Kinetics flyout: pick a kinetic element, a build size, push it to the tray, drag
 * it onto the roof. Same "placed, not drawn" pattern as furniture.js (a louvre pergola has a position and a
 * footprint, not an area you mark out) — the catalog itself lives in kineticsCatalog.js.
 *
 * Distinct from kineticsPostAnalysis.js's "Dynamic Families" panel (the Improve tab): that one only
 * displays what Revit's Kinetics ribbon already built from an analysis; this one is where the user decides
 * where a kinetic element goes, and at which of its standard build sizes, in the first place.
 */

const kineticsState = { category: null, key: null };

const KINETICS_CATEGORY_LABEL = { freestanding: "Freestanding", edge: "Edge-mounted" };

const KINETICS_BUILD_SIZE_STORAGE_KEY = "sportify-kinetics-build-sizes";
const kineticsBuildSizes = (() => { try { return JSON.parse(localStorage.getItem(KINETICS_BUILD_SIZE_STORAGE_KEY) || "{}") || {}; } catch (e) { return {}; } })();

/** The build size remembered for this kind while it still offers it, else "standard". */
function getKineticsBuildSize(id) {
  const keys = kineticsBuildSizeKeys(id);
  if (!keys.length) return null;
  return keys.includes(kineticsBuildSizes[id]) ? kineticsBuildSizes[id] : (keys.includes("standard") ? "standard" : keys[0]);
}

function setKineticsBuildSize(id, size) {
  if (!kineticsBuildSizeKeys(id).includes(size) || kineticsBuildSizes[id] === size) return;
  kineticsBuildSizes[id] = size;
  try { localStorage.setItem(KINETICS_BUILD_SIZE_STORAGE_KEY, JSON.stringify(kineticsBuildSizes)); } catch (e) { /* not kept */ }
}

function kineticsCategoriesPresent() {
  const cats = [];
  Object.values(KINETICS).forEach(k => { if (!cats.includes(k.category)) cats.push(k.category); });
  return cats;
}

function kineticsInCategory(cat) {
  return Object.keys(KINETICS)
    .filter(key => KINETICS[key].category === cat)
    .sort((a, b) => KINETICS[a].label.localeCompare(KINETICS[b].label));
}

/** Keeps the chosen element inside the chosen category, same reasoning as furniture's ensureFurnitureSelection(). */
function ensureKineticsSelection() {
  const inCat = kineticsInCategory(kineticsState.category);
  if (!inCat.length) { kineticsState.key = null; return; }
  if (!kineticsState.key || KINETICS[kineticsState.key]?.category !== kineticsState.category) {
    kineticsState.key = inCat[0];
  }
}

function activeKinetics() {
  return kineticsState.key ? KINETICS[kineticsState.key] : null;
}

/** The active element's chosen build size's footprint, { length, width, note }; null if none is chosen yet. */
function activeKineticsFootprint() {
  const k = activeKinetics();
  const size = k && getKineticsBuildSize(kineticsState.key);
  return k && size ? k.variants[size] : null;
}

function kineticsPanelHtml() {
  if (!kineticsState.category) kineticsState.category = kineticsCategoriesPresent()[0] || null;
  ensureKineticsSelection();
  const k = activeKinetics();
  if (!k) return `<div class="section"><p class="hint">No kinetic elements in the catalog yet.</p></div>`;

  const tabs = kineticsCategoriesPresent().map(cat => {
    const n = kineticsInCategory(cat).length;
    return `<button class="furniture-tab${cat === kineticsState.category ? " active" : ""}"
                    data-kinetics-cat="${escapeHtml(cat)}" title="${escapeHtml(KINETICS_CATEGORY_LABEL[cat] || cat)}">
              ${escapeHtml(KINETICS_CATEGORY_LABEL[cat] || cat)}<span class="furniture-tab-count">${n}</span>
            </button>`;
  }).join("");

  const options = kineticsInCategory(kineticsState.category).map(key =>
    `<option value="${escapeHtml(key)}"${key === kineticsState.key ? " selected" : ""}>${escapeHtml(KINETICS[key].label)}</option>`).join("");

  const sizeKeys = kineticsBuildSizeKeys(kineticsState.key);
  const size = getKineticsBuildSize(kineticsState.key);
  const fp = activeKineticsFootprint();
  const sizeSelect = sizeKeys.length > 1
    ? `<div class="section">
         <label>Build size</label>
         <select id="kinetics-size-select">${sizeKeys.map(sk => {
           const v = k.variants[sk];
           return `<option value="${escapeHtml(sk)}"${sk === size ? " selected" : ""}>${escapeHtml(kineticsBuildSizeLabel(sk))} — ${v.note} (${v.length} × ${v.width} m)</option>`;
         }).join("")}</select>
         <p class="hint">Standard build sizes for fabrication, not a free-form dimension — the same reasoning a manufacturer's own size chart gives.</p>
       </div>`
    : "";

  return `
    <p class="hint">
      Position and build size decide where — and at what scale — Revit's Kinetics ribbon builds the real thing.
      Push one to the tray, then drag it onto the roof — same as any other piece.
    </p>

    <div class="section">
      <label>What are you placing?</label>
      <div class="furniture-tabs">${tabs}</div>
      <select id="kinetics-select">${options}</select>
    </div>

    ${sizeSelect}

    <div class="section">
      <div class="dims">
        <div class="dim-card"><div class="val">${fp.length} × ${fp.width} m</div><div class="lbl">Footprint · ${fp.note}</div></div>
        <div class="dim-card"><div class="val">${k.built ? "Yes" : "Not yet"}</div><div class="lbl">Real mechanics in Revit</div></div>
      </div>
      <p class="hint">${escapeHtml(k.hint)}</p>
      ${!k.built ? `<p class="hint">Placeable now for layout and spatial planning; picking this kind in Revit's "Import Analysis Adaptation" will say plainly that it has no dynamic mechanism built yet, rather than guessing.</p>` : ""}
    </div>

    <div class="section">
      <button class="btn-export accent" id="btn-push-kinetics">
        <i class="ti ti-plus" aria-hidden="true"></i>Push to Combine
      </button>
      <p class="hint">Lands in the tray — drag it onto the roof like any other piece.</p>
    </div>`;
}

function renderKineticsPanel() {
  const el = document.getElementById("kinetics-panel");
  if (!el) return;
  el.innerHTML = kineticsPanelHtml();

  el.querySelectorAll("[data-kinetics-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      kineticsState.category = btn.dataset.kineticsCat;
      ensureKineticsSelection();
      renderKineticsPanel();
    });
  });
  document.getElementById("kinetics-select")?.addEventListener("change", e => {
    kineticsState.key = e.target.value;
    renderKineticsPanel();
  });
  document.getElementById("kinetics-size-select")?.addEventListener("change", e => {
    setKineticsBuildSize(kineticsState.key, e.target.value);
    renderKineticsPanel();
  });
  document.getElementById("btn-push-kinetics")?.addEventListener("click", pushKineticsToCombine);
}

function pushKineticsToCombine() {
  const k = activeKinetics();
  const fp = activeKineticsFootprint();
  if (!k || !fp || typeof addCombineItem !== "function") return;
  const size = getKineticsBuildSize(kineticsState.key);

  addCombineItem({
    kind: "kinetics",
    label: k.label,
    length_m: fp.length,
    width_m: fp.width,
    sourceJson: {
      version: "1.0", generator: "Sportify",
      kinetics: {
        kinetic_kind: k.kineticKind,
        label: k.label,
        built: k.built,
        build_size: size,
        build_size_note: fp.note,
      },
    },
  });
  if (typeof setMode === "function") setMode("combine");
}
