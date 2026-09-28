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

// A catalog size is a manufacturer's own size chart; "custom" is the exception — an exact length/width the
// user types in, for a project that needs a size the chart doesn't offer. Revit's Kinetics ribbon reads the
// placed footprint's own bounding box either way (KineticsHosts.FromPlacements), never the size key itself,
// so a custom footprint builds the real thing exactly the same way a catalog one does.
const KINETICS_CUSTOM_SIZE_STORAGE_KEY = "sportify-kinetics-custom-sizes";
const kineticsCustomSizes = (() => { try { return JSON.parse(localStorage.getItem(KINETICS_CUSTOM_SIZE_STORAGE_KEY) || "{}") || {}; } catch (e) { return {}; } })();
const KINETICS_CUSTOM_MIN_M = 0.2, KINETICS_CUSTOM_MAX_M = 60;

/** Every size this kind offers, catalog presets first, "custom" always last. */
function kineticsBuildSizeKeysWithCustom(id) {
  return [...kineticsBuildSizeKeys(id), "custom"];
}

/** The custom length/width remembered for this kind, defaulting to its standard catalog size the first time. */
function getKineticsCustomSize(id) {
  const k = KINETICS[id];
  const keys = kineticsBuildSizeKeys(id);
  const fallback = (k && keys.length) ? (k.variants[keys.includes("standard") ? "standard" : keys[0]]) : { length: 4, width: 4 };
  const c = kineticsCustomSizes[id];
  return {
    length: (c && c.length > 0) ? c.length : fallback.length,
    width: (c && c.width > 0) ? c.width : fallback.width,
  };
}

function setKineticsCustomSize(id, length, width) {
  const clamp = v => Math.min(KINETICS_CUSTOM_MAX_M, Math.max(KINETICS_CUSTOM_MIN_M, Number(v) || 0));
  const prev = getKineticsCustomSize(id);
  kineticsCustomSizes[id] = { length: length == null ? prev.length : clamp(length), width: width == null ? prev.width : clamp(width) };
  try { localStorage.setItem(KINETICS_CUSTOM_SIZE_STORAGE_KEY, JSON.stringify(kineticsCustomSizes)); } catch (e) { /* not kept */ }
}

/** The build size remembered for this kind while it still offers it, else "standard". */
function getKineticsBuildSize(id) {
  const keys = kineticsBuildSizeKeysWithCustom(id);
  if (!keys.length) return null;
  return keys.includes(kineticsBuildSizes[id]) ? kineticsBuildSizes[id] : (keys.includes("standard") ? "standard" : keys[0]);
}

function setKineticsBuildSize(id, size) {
  if (!kineticsBuildSizeKeysWithCustom(id).includes(size) || kineticsBuildSizes[id] === size) return;
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
  if (!k) return null;
  const size = getKineticsBuildSize(kineticsState.key);
  if (size === "custom") { const c = getKineticsCustomSize(kineticsState.key); return { length: c.length, width: c.width, note: "custom size" }; }
  return size ? k.variants[size] : null;
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

  const sizeKeys = kineticsBuildSizeKeysWithCustom(kineticsState.key);
  const size = getKineticsBuildSize(kineticsState.key);
  const fp = activeKineticsFootprint();
  const custom = getKineticsCustomSize(kineticsState.key);
  const sizeSelect = `
    <div class="section">
      <label>Build size</label>
      <select id="kinetics-size-select">${sizeKeys.map(sk => {
        if (sk === "custom") return `<option value="custom"${sk === size ? " selected" : ""}>Custom size…</option>`;
        const v = k.variants[sk];
        return `<option value="${escapeHtml(sk)}"${sk === size ? " selected" : ""}>${escapeHtml(kineticsBuildSizeLabel(sk))} — ${escapeHtml(v.note)} (${v.length} × ${v.width} m)</option>`;
      }).join("")}</select>
      ${size === "custom" ? `
        <div class="kinetics-custom-size">
          <label>Length (m)<input type="number" id="kinetics-custom-length" min="${KINETICS_CUSTOM_MIN_M}" max="${KINETICS_CUSTOM_MAX_M}" step="0.1" value="${custom.length}"></label>
          <label>Width (m)<input type="number" id="kinetics-custom-width" min="${KINETICS_CUSTOM_MIN_M}" max="${KINETICS_CUSTOM_MAX_M}" step="0.1" value="${custom.width}"></label>
        </div>
        <p class="hint">Your own exact size — Revit's Kinetics ribbon builds it at this footprint, same as a catalog size; only its real dimensions change, not how it's built.</p>
      ` : `<p class="hint">Standard build sizes for fabrication, the same reasoning a manufacturer's own size chart gives — or pick "Custom size…" to enter your own.</p>`}
    </div>`;

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
        <div class="dim-card"><div class="val">${fp.length} × ${fp.width} m</div><div class="lbl">Footprint · ${escapeHtml(fp.note)}</div></div>
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
  document.getElementById("kinetics-custom-length")?.addEventListener("change", e => {
    setKineticsCustomSize(kineticsState.key, e.target.value, null);
    renderKineticsPanel();
  });
  document.getElementById("kinetics-custom-width")?.addEventListener("change", e => {
    setKineticsCustomSize(kineticsState.key, null, e.target.value);
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
