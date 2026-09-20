/**
 * dataTab.js — Sportify reference-data browser (Data tab)
 * Read-only view over the .NET backend's sports/norms/materials/providers
 * and vegetal-palette catalog. This is the first feature in the app with a
 * hard backend dependency, so every fetch failure renders an explicit,
 * actionable card in #data-content — never a blank pane or a silent
 * console-only failure. Kept fully self-contained: only ever touches
 * #dataConfigurator / #data-content / #modeData, so a fetch failure here
 * can't cascade into Sport/Garden/Combine.
 */

const DATA_API_BASE = "http://localhost:5107/api";

const dataState = {
  domain: "sports",       // "sports" | "vegetation" | "facilities"
  search: "",
  cache: {},               // { sports: Sport[], species: Plant[], buildups: RoofAssembly[], facilities: FacilityGuideline[] }
  backendOnline: null,     // null = not checked yet, true/false once known
};

async function fetchDataEntity(key, path) {
  if (dataState.cache[key]) return dataState.cache[key];
  const res = await fetch(`${DATA_API_BASE}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  dataState.cache[key] = data;
  dataState.backendOnline = true;
  return data;
}

function domainFetchPlan() {
  if (dataState.domain === "buildups") return { key: "buildups", path: "RoofAssemblies" };
  if (dataState.domain === "facilities") return { key: "facilities", path: "facilities" };
  if (dataState.domain === "analysisParams") return { key: "analysisParameters", path: "AnalysisParameters" };
  if (dataState.domain === "courtOptions") return { key: "courtOptions", path: "SportOptions" };
  if (dataState.domain === "species") return { key: "species", path: "Plants" };
  return { key: "sports", path: "sports" };
}

/**
 * What each tab actually holds, said once at the top of it.
 *
 * Every one of these was a guess until you opened it and read the cards —
 * "Palettes" in particular meant nothing to anybody, which is part of why it
 * is gone. A reference catalog that cannot say what it is for is not much of
 * a reference.
 */
const DOMAIN_INTRO = {
  sports: "The sports this app can lay out, with the norm each follows, the surfaces it can be built in, and every official field size. Read-only: these come from DIN, FIBA, IHF and the rest, and are not ours to invent.",
  species: "Individual plants you can place on the roof. Each carries its mature height, crown width and the substrate depth its roots need — the Plants panel offers the ones with all three filled in.",
  buildups: "Manufacturer roof build-up systems — ZinCo, Bauder, Optigrün — layer by layer. A drawn zone references one of these, and it becomes a Revit floor type on import.",
  facilities: "Reference requirements from the German sports-hall norms. Nothing in the app reads these; they are here to look up.",
  courtOptions: "The choices each sport offers — a padel wall system, a court surface, a basket. The geometry of a court is fixed by its governing body and lives in code; which product it is built from is a decision, and lives here.",
  analysisParams: "The figures the Analysis checks run on, so a threshold can be corrected without a code change.",
};

// Each domain's search box filters against a different field on its items —
// sports are named, species by botanical name, guidelines and parameters by Title/Label instead.
const DOMAIN_SEARCH_FIELD = { courtOptions: "label", sports: "name", facilities: "title", analysisParams: "label", species: "scientificName", buildups: "systemName" };

function variantsTableHtml(variants) {
  if (!variants || variants.length === 0) return "";
  const rows = variants.map(v => `
    <div class="dim-card">
      <div class="val">${v.lengthM}×${v.widthM} m</div>
      <div class="lbl">${v.variant} — run-off ${v.runoffM}m, h≥${v.heightMinM}m</div>
    </div>`).join("");
  return `<div class="dims" style="grid-template-columns:1fr;">${rows}</div>`;
}

function sportCardHtml(sport) {
  const norms = (sport.norms || []).map(n => n.code).join(", ") || "—";
  const materials = (sport.materials || []).map(m => m.performanceClass ? `${m.name} (${m.normCode} ${m.performanceClass}, force reduction ${m.forceReduction || "—"})` : m.name).join("; ") || "—";
  const providers = (sport.providers || []).map(p => p.name).join(", ") || "—";
  return `
    <div class="section span-2">
      <label>${sport.name}</label>
      <p class="hint">${sport.category}</p>
      <p class="hint"><strong>Norms:</strong> ${norms}</p>
      <p class="hint"><strong>Materials:</strong> ${materials}</p>
      <p class="hint"><strong>Providers:</strong> ${providers}</p>
      <p class="hint" style="margin-top:6px"><strong>Field dimensions (length × width):</strong></p>
      ${variantsTableHtml(sport.variants)}
    </div>`;
}

function paletteCardHtml(palette) {
  const plants = (palette.plants || []).map(p => `${p.commonName} (${p.scientificName})`).join(", ") || "—";
  const norms = (palette.norms || []).map(n => n.code).join(", ") || "—";
  const materials = (palette.materials || []).map(m => m.name).join(", ") || "—";
  const providers = (palette.providers || []).map(p => p.name).join(", ") || "—";
  return `
    <div class="section span-2">
      <label>${palette.name} — ${palette.type}</label>
      <p class="hint">${palette.description}</p>
      <p class="hint"><strong>Plants:</strong> ${plants}</p>
      <p class="hint"><strong>Norms:</strong> ${norms}</p>
      <p class="hint"><strong>Materials:</strong> ${materials}</p>
      <p class="hint"><strong>Providers:</strong> ${providers}</p>
    </div>`;
}

function facilityCardHtml(item) {
  return `
    <div class="section">
      <label>${item.title}</label>
      <p class="hint" style="text-transform:none; font-weight:600; color:var(--text-accent);">${item.category}</p>
      <p class="hint">${item.requirement}</p>
      <p class="hint"><strong>Source:</strong> ${item.authority} — ${item.normCode}</p>
    </div>`;
}

function analysisParamCardHtml(item) {
  return `
    <div class="section">
      <label>${item.label}</label>
      <p class="hint" style="text-transform:none; font-weight:600; color:var(--text-accent);">${item.category}</p>
      <p class="hint"><strong>Value:</strong> ${item.value} ${item.unit}</p>
      ${item.description ? `<p class="hint">${item.description}</p>` : ""}
      <p class="hint"><strong>Source:</strong> ${item.authority} — ${item.normCode}</p>
    </div>`;
}

/**
 * One species. Only the roof dimensions are highlighted — mature height, crown
 * and substrate depth are what decide whether a plant can go on a roof at all,
 * and a species without them can't be placed.
 */
/**
 * A price, with how sure of it we are. Every catalog figure carries a
 * quoted/estimated flag, and showing the number without the flag would be
 * worse than showing nothing — the same rule the thicknesses follow.
 */
function priceHint(value, unit, quoted, source) {
  if (value == null) return `<p class="hint">No price yet.</p>`;
  const u = (unit || "").replace("EUR/", "").replace("m2", "m²").replace("m3", "m³");
  return `<p class="hint"><strong>€ ${value}${u ? " / " + u : ""}</strong> — ` +
    `${quoted ? "supplier quote" : "estimated"}${source ? `<br><span class="hint">${source}</span>` : ""}</p>`;
}

function speciesCardHtml(p) {
  const hasDims = p.matureHeightM > 0 && p.crownM > 0;
  return `
    <div class="section span-2">
      <label>${p.scientificName || "(unnamed)"}</label>
      <p class="hint"><em>${p.commonName || ""}</em>${p.form ? ` · ${p.form}` : ""}${p.category ? ` · ${p.category}` : ""}</p>
      ${hasDims ? `
        <div class="dims">
          <div class="dim-card"><div class="val">${p.heightRange || (p.matureHeightM + " m")}</div><div class="lbl">Mature height</div></div>
          <div class="dim-card"><div class="val">${p.crownM} m</div><div class="lbl">Crown${p.crownMinM ? ` (${p.crownMinM}–${p.crownMaxM} m)` : ""}</div></div>
          <div class="dim-card"><div class="val">${p.minSubstrateMm || "—"} mm</div><div class="lbl">Min. substrate</div></div>
        </div>`
        : `<p class="hint">⚠ No roof dimensions — can't be placed until height, crown and substrate are filled in.</p>`}
      ${priceHint(p.priceValue, p.priceUnit, p.priceIsQuoted, p.priceSource)}
      ${p.notes ? `<p class="hint">${p.notes}</p>` : ""}
      ${p.sunRequirement ? `<p class="hint">Sun: ${p.sunRequirement} · Drought: ${p.droughtTolerance || "—"}</p>` : ""}
      ${p.source ? `<p class="hint">Source: ${p.sourceUrl ? `<a href="${p.sourceUrl}" target="_blank" rel="noopener">${p.source}</a>` : p.source}${p.dimensionsPublished ? " — published figures" : ""}</p>` : ""}
    </div>`;
}

/** One provider build-up, drawn as the layer stack it is rather than a list of numbers. */
function buildupCardHtml(a) {
  // Edit/Delete live on the card itself: you are looking at the thing you want
  // to change, so there is nothing to select from a list first.
  const layers = (a.layers || []).slice().sort((x, y) => x.layerOrder - y.layerOrder);
  const total = layers.reduce((s, l) => s + (l.thicknessMm || 0), 0);
  return `
    <div class="section span-2">
      <label>${a.provider} — ${a.systemName}</label>
      <p class="hint">${a.category}${a.providerCountry ? ` · ${a.providerCountry}` : ""}</p>
      ${a.description ? `<p class="hint">${a.description}</p>` : ""}
      <div class="dims">
        <div class="dim-card"><div class="val">${total}</div><div class="lbl">Build-up mm (from layers)</div></div>
        ${a.buildUpMm ? `<div class="dim-card"><div class="val" style="${Math.abs(total - a.buildUpMm) > 5 ? "color:#f59e0b" : ""}">${a.buildUpMm}</div><div class="lbl">Published${Math.abs(total - a.buildUpMm) > 5 ? " ⚠ differs" : ""}</div></div>` : ""}
        <div class="dim-card"><div class="val">${a.saturatedKgM2 ?? "—"}</div><div class="lbl">Saturated kg/m²</div></div>
        <div class="dim-card"><div class="val">${a.waterStorageLM2 ?? "—"}</div><div class="lbl">Water storage L/m²</div></div>
        <div class="dim-card"><div class="val">${(() => {
          // Per m2 of zone: volume layers priced through their own thickness,
          // sheet goods straight per m2. The same arithmetic the cost panel
          // does, so the catalog and the receipt cannot disagree.
          const per = layers.reduce((sum, l) => {
            if (l.priceValue == null) return sum;
            return sum + (l.priceUnit === "EUR/m3" ? l.priceValue * ((l.thicknessMm || 0) / 1000) : l.priceValue);
          }, 0);
          return per ? "€ " + Math.round(per) : "—";
        })()}</div><div class="lbl">Per m² (estimated)</div></div>
      </div>
      <p class="hint" style="margin-top:8px"><strong>${layers.length} layers</strong></p>
      ${layers.map(l => `<p class="hint">${l.layerOrder + 1}. ${l.name} — <strong>${l.thicknessMm} mm</strong> (${l.function}, ${l.thicknessSource})</p>`).join("")}
      ${a.sourceUrl ? `<p class="hint"><a href="${a.sourceUrl}" target="_blank" rel="noopener">Manufacturer source</a></p>` : ""}
      <div style="margin-top:8px">
        <button class="btn-export" data-buildup-edit="${a.id}">Edit</button>
        <button class="btn-export" data-buildup-delete="${a.id}" data-buildup-label="${a.provider} ${a.systemName}">Delete</button>
      </div>
    </div>`;
}

/**
 * One court option.
 *
 * Sport and group lead, because a row means nothing without them — "acrylic"
 * is a padel surface or a basketball surface and they are priced differently.
 * Only the figures that apply are shown: a colour has no weight, a basket has
 * no area, and printing an empty one as zero would be a claim rather than a
 * blank.
 */
function courtOptionCardHtml(o) {
  const facts = [];
  if (o.weightKgM2 != null) facts.push([`${o.weightKgM2}`, "kg/m²"]);
  if (o.weightKgEach != null) facts.push([`${o.weightKgEach}`, "kg each"]);
  if (o.thicknessMm != null) facts.push([`${o.thicknessMm}`, "mm thick"]);
  if (o.priceValue != null) {
    const unit = (o.priceUnit || "").replace("EUR/", "").replace("m2", "m²").replace("each", "each");
    facts.push([`€ ${o.priceValue}`, unit ? `per ${unit}` : "price"]);
  }
  if (o.costGroupDin276) facts.push([`KG ${o.costGroupDin276}`, "DIN 276"]);

  return `
    <div class="section span-2">
      <label>${o.label || "(unnamed)"}</label>
      <p class="hint">
        <strong>${o.sport}</strong> · ${o.optionGroup} · <code>${o.key}</code>
        ${o.colourHex ? ` · <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${o.colourHex};vertical-align:middle"></span> ${o.colourHex}` : ""}
        ${o.textureHint ? ` · ${o.textureHint}` : ""}
      </p>
      ${o.note ? `<p class="hint">${o.note}</p>` : ""}
      ${facts.length ? `<div class="dims">${facts.map(([v, l]) =>
        `<div class="dim-card"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join("")}</div>` : ""}
      ${o.priceValue != null
        ? `<p class="hint">${o.priceIsQuoted ? "Supplier quote" : "Estimated"}${o.priceSource ? ` — ${o.priceSource}` : ""}</p>`
        : ""}
    </div>`;
}

const DOMAIN_CARD_HTML = { courtOptions: courtOptionCardHtml, sports: sportCardHtml, vegetation: paletteCardHtml, facilities: facilityCardHtml, analysisParams: analysisParamCardHtml, species: speciesCardHtml, buildups: buildupCardHtml };

function offlineCardHtml() {
  return `
    <div class="section span-2">
      <label>Backend not reachable</label>
      <p class="hint">Can't reach the Sportify API at <code>${DATA_API_BASE}</code>.</p>
      <p class="hint">Start it with <code>dotnet run --launch-profile http</code> in <code>Sportify.Api</code>, then retry.</p>
      <button class="btn-export accent" id="btn-data-retry" style="margin-top:8px">
        <i class="ti ti-refresh" aria-hidden="true"></i>Retry
      </button>
    </div>`;
}

/**
 * Build-ups replace the generic record form entirely while that domain is
 * active. Being asked to choose "Material / Provider / Sport / Plant" while
 * standing in Build-ups is nonsense — the answer is obviously a build-up.
 */
/**
 * Which record types make sense to create or edit from the tab you are
 * standing in. Offering all nine everywhere is what made "Create new"
 * meaningless — create new WHAT, while looking at a list of sports?
 *
 * Sport itself is not creatable. The sports of the world are not something
 * this app invents; adding a field size to one of them is.
 */
const DOMAIN_ENTITIES = {
  sports: ["FieldVariant", "Material", "Provider", "Norm"],
  species: ["Plant"],
  courtOptions: ["SportOption"],
  facilities: ["FacilityGuideline"],
  analysisParams: ["AnalysisParameter"],
};

function syncEntityChoices() {
  const sel = document.getElementById("adminEntityType");
  if (!sel) return;
  const allowed = DOMAIN_ENTITIES[dataState.domain] || [];
  let first = null;
  [...sel.options].forEach(o => {
    const ok = allowed.includes(o.value);
    o.hidden = !ok;
    o.disabled = !ok;
    if (ok && !first) first = o.value;
  });
  if (first && !allowed.includes(sel.value)) {
    sel.value = first;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function syncDomainEditor() {
  const generic = document.getElementById("admin-edit-panel") || document.getElementById("data-admin");
  const isBuildups = dataState.domain === "buildups";
  if (generic) generic.hidden = isBuildups;
  if (!isBuildups) syncEntityChoices();

  let createBtn = document.getElementById("btn-new-buildup");
  const host = document.getElementById("buildup-create-host");
  if (host) {
    host.hidden = !isBuildups;
    if (isBuildups && !createBtn) {
      host.innerHTML = `<button class="btn-export accent" id="btn-new-buildup"><i class="ti ti-plus" aria-hidden="true"></i>New build-up</button>`;
      document.getElementById("btn-new-buildup").addEventListener("click", () => openBuildupEditor(null));
    }
  }
  if (!isBuildups && buildupEditorState?.open) closeBuildupEditor();
}

function wireBuildupCardButtons(items) {
  document.querySelectorAll("[data-buildup-edit]").forEach(btn =>
    btn.addEventListener("click", () => {
      const record = items.find(x => String(x.id) === btn.dataset.buildupEdit);
      if (record) openBuildupEditor(record);
    }));
  document.querySelectorAll("[data-buildup-delete]").forEach(btn =>
    btn.addEventListener("click", () => deleteBuildup(Number(btn.dataset.buildupDelete), btn.dataset.buildupLabel)));
}

function renderDataContent(items) {
  const contentEl = document.getElementById("data-content");
  const statusEl = document.getElementById("data-status");
  if (!contentEl) return;

  if (dataState.backendOnline === false) {
    contentEl.innerHTML = `<div class="step-grid">${offlineCardHtml()}</div>`;
    const retryBtn = document.getElementById("btn-data-retry");
    if (retryBtn) retryBtn.addEventListener("click", () => retryDataFetch());
    if (statusEl) statusEl.textContent = "Backend offline.";
    return;
  }

  syncDomainEditor();
  const intro = document.getElementById("data-domain-intro");
  if (intro) intro.textContent = DOMAIN_INTRO[dataState.domain] || "";
  const searchField = DOMAIN_SEARCH_FIELD[dataState.domain] || "name";
  const term = dataState.search.trim().toLowerCase();
  const filtered = term ? items.filter(it => (it[searchField] || "").toLowerCase().includes(term)) : items;

  if (filtered.length === 0) {
    contentEl.innerHTML = `<div class="step-grid"><div class="section span-2"><p class="hint">No matches${term ? ` for "${dataState.search}"` : ""}.</p></div></div>`;
  } else {
    const cardHtml = DOMAIN_CARD_HTML[dataState.domain] || sportCardHtml;
    contentEl.innerHTML = `<div class="step-grid">${filtered.map(cardHtml).join("")}</div>`;
    if (dataState.domain === "buildups") wireBuildupCardButtons(filtered);
  }

  if (statusEl) {
    const noun = { courtOptions: "court option", sports: "sport", facilities: "guideline", analysisParams: "parameter", species: "plant", buildups: "build-up" }[dataState.domain] || "item";
    statusEl.textContent = `${filtered.length} ${noun}${filtered.length === 1 ? "" : "s"}${term ? " matching your search" : ""}.`;
  }
}

async function loadAndRenderDataContent() {
  const statusEl = document.getElementById("data-status");
  const { key, path } = domainFetchPlan();

  if (dataState.cache[key]) {
    renderDataContent(dataState.cache[key]);
    return;
  }

  if (statusEl) statusEl.textContent = "Loading…";
  try {
    const items = await fetchDataEntity(key, path);
    renderDataContent(items);
  } catch (err) {
    dataState.backendOnline = false;
    renderDataContent([]);
  }
}

function setDataDomain(domain) {
  dataState.domain = domain;
  document.querySelectorAll("#data-domain-btns .q-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.domain === domain);
  });
  loadAndRenderDataContent();
}

function setDataSearch(term) {
  dataState.search = term;
  const { key } = domainFetchPlan();
  if (dataState.cache[key]) renderDataContent(dataState.cache[key]);
}

/**
 * Drops the cached copy so the next render actually re-reads the API.
 *
 * Without this a create or an edit appears to do nothing: the record is
 * written, the list re-renders from the copy fetched before the write, and the
 * count never changes — which reads as "the save failed" when it succeeded.
 */
function invalidateDataCache(key) {
  if (key) delete dataState.cache[key];
  else dataState.cache = {};
}

function retryDataFetch(options = {}) {
  // A retry means "go and look again", so the cache goes with it. Callers that
  // only changed one domain can pass its key instead of dropping everything.
  invalidateDataCache(options.key);
  dataState.backendOnline = null;
  loadAndRenderDataContent();
}

function updateDataUI() {
  loadAndRenderDataContent();
}

/* ── Shared material/provider reference lookups — used by the Sport and
   Garden configurators' "reference material/provider" dropdowns, not just
   this Data tab. Lives here since this file already owns DATA_API_BASE /
   fetchDataEntity / the shared cache, and loads before sportController.js
   and gardenController.js in index.html. ── */
async function fetchReferenceMaterials() { return fetchDataEntity("materials", "sports/materials"); }
async function fetchReferenceProviders() { return fetchDataEntity("providers", "sports/providers"); }
async function fetchAnalysisParameters() { return fetchDataEntity("analysisParameters", "AnalysisParameters"); }

/**
 * Populates a <select> with `items` (each needs id+name) plus a trailing
 * "Manual entry…" option, and wires it to show/hide a paired free-text
 * input. Falls back to manual-only if the fetch that produced `items`
 * failed — the configurator must keep working with the backend offline.
 */
function wireReferenceDropdown(selectEl, manualEl, items, offline) {
  if (!selectEl || !manualEl) return;
  if (offline) {
    selectEl.innerHTML = `<option value="__manual__" selected>Manual entry (backend offline)</option>`;
    manualEl.style.display = "block";
  } else {
    selectEl.innerHTML = `<option value="">Select…</option>` +
      items.map(it => `<option value="${it.id}">${it.name}</option>`).join("") +
      `<option value="__manual__">Manual entry…</option>`;
    manualEl.style.display = "none";
  }
  selectEl.addEventListener("change", () => {
    manualEl.style.display = selectEl.value === "__manual__" ? "block" : "none";
  });
}

/** Reads the current value out of a select+manual-input pair built by wireReferenceDropdown, as a plain string (or null if nothing's chosen). */
function readReferenceSelection(selectEl, manualEl, items) {
  if (!selectEl) return null;
  if (selectEl.value === "__manual__") return manualEl && manualEl.value ? manualEl.value.trim() || null : null;
  if (!selectEl.value) return null;
  const picked = items.find(it => String(it.id) === selectEl.value);
  return picked ? picked.name : null;
}

/* ── Data tab: domain switch + search wiring ── */
document.getElementById("data-domain-btns").addEventListener("click", e => {
  const btn = e.target.closest(".q-btn");
  if (btn && typeof setDataDomain === "function") setDataDomain(btn.dataset.domain);
});
document.getElementById("dataSearch").addEventListener("input", e => {
  if (typeof setDataSearch === "function") setDataSearch(e.target.value);
});

/* ── Add reference data: a dropdown picks the entity type, the form below
   it renders that type's real fields (never a generic key/value blob —
   the point is a form that actually matches the database shape), and
   Create POSTs straight to AdminController. Complements the seeded data
   from ReferenceDataSeeder.cs, letting the database grow from the UI
   itself instead of only from a code change. ── */
const ADMIN_ENTITY_FIELDS = {
  Material: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "category", label: "Category", type: "text", required: true, placeholder: "Flooring, Subfloor, Green roof build-up, Roofing, Playground safety surfacing, Spectator seating…" },
    { key: "normCode", label: "Norm code", type: "text", placeholder: "e.g. EN 14904" },
    { key: "performanceClass", label: "Performance class", type: "text" },
    { key: "forceReduction", label: "Force reduction", type: "text", placeholder: "e.g. ≥45%" },
    { key: "embodiedCarbonValue", label: "Embodied carbon (LCA)", type: "number", placeholder: "e.g. 9.1" },
    { key: "embodiedCarbonUnit", label: "Embodied carbon unit", type: "text", placeholder: "e.g. kg CO2e/m2" },
    { key: "embodiedCarbonSource", label: "Embodied carbon source", type: "textarea", placeholder: "Which EPD/database this figure came from" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  Provider: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "country", label: "Country", type: "text" },
    { key: "specialty", label: "Specialty", type: "text" },
    { key: "category", label: "Category", type: "text", placeholder: "Sports flooring & surfaces, Green roof systems, Playground equipment…" },
    { key: "website", label: "Website", type: "text" },
  ],
  Norm: [
    { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. DIN 18032" },
    { key: "authority", label: "Authority", type: "text", required: true, placeholder: "e.g. DIN, FIBA, CEN" },
    { key: "title", label: "Title", type: "textarea", required: true },
  ],
  Sport: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "category", label: "Category", type: "text", required: true },
  ],
  SportOption: [
    // sport + group + key are what the configurator looks a row up by, so all
    // three are required and a duplicate is refused by the API.
    { key: "sport", label: "Sport", type: "text", required: true, placeholder: "padel, basketball" },
    { key: "optionGroup", label: "Option group", type: "text", required: true, placeholder: "surface, wall_system, court_colour, basket" },
    { key: "key", label: "Key", type: "text", required: true, placeholder: "acrylic — the stable name exports reference" },
    { key: "label", label: "Label", type: "text", required: true, placeholder: "What the picker shows" },
    { key: "note", label: "Note", type: "text", placeholder: "The sentence under the picker — what choosing this means" },
    { key: "sortOrder", label: "Sort order", type: "number" },
    // Only fill the ones that apply. A colour has no weight; a basket has no
    // area. An empty field stays empty rather than becoming zero, which is a
    // different claim.
    { key: "weightKgM2", label: "Weight kg/m² (surfaces)", type: "number" },
    { key: "weightKgEach", label: "Weight kg each (baskets, posts)", type: "number" },
    { key: "thicknessMm", label: "Thickness mm (glass)", type: "number" },
    { key: "colourHex", label: "Colour hex", type: "text", placeholder: "#2f6fb5" },
    { key: "textureHint", label: "Texture", type: "text", placeholder: "pile, speckle, sheen, tiles, flat" },
    { key: "priceValue", label: "Price", type: "number" },
    { key: "priceUnit", label: "Price unit", type: "text", placeholder: "EUR/m2 or EUR/each" },
    { key: "priceSource", label: "Price source", type: "text" },
    { key: "costGroupDin276", label: "DIN 276 cost group", type: "text", placeholder: "530, 560…" },
  ],
  FurnitureItem: [
    // Key is what the export and the Revit family name reference, so it is
    // required and a duplicate is refused by the API.
    { key: "key", label: "Key", type: "text", required: true, placeholder: "abes_parkbank_1114 — the stable name exports reference" },
    { key: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "ABES Public Design" },
    { key: "manufacturerCountry", label: "Manufacturer country", type: "text", placeholder: "Germany" },
    { key: "productName", label: "Product name", type: "text", required: true, placeholder: "As the manufacturer writes it" },
    { key: "category", label: "Category", type: "text", required: true, placeholder: "bench, table, bin, bollard, light — decides how it draws" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Say if it has armrests — the drawing reads this and draws them" },
    { key: "material", label: "Material", type: "text", placeholder: "Hot-dip galvanised steel, timber slats…" },

    // ── The picture ──
    // Empty means the configurator draws the piece to scale from the sizes
    // below. Fill it only with a photograph someone has cleared for use: the
    // manufacturers own theirs, and this catalogue gets shown to clients.
    { key: "imageUrl", label: "Photo URL (optional)", type: "text", placeholder: "Leave empty and the piece is drawn from its dimensions instead" },
    { key: "imageCredit", label: "Photo credit", type: "text", placeholder: "Who the photograph belongs to — shown under it" },

    // ── Size ──
    { key: "lengthM", label: "Length m", type: "number", placeholder: "1.8" },
    { key: "widthM", label: "Width m (depth on plan)", type: "number", placeholder: "0.7" },
    { key: "heightM", label: "Height m", type: "number", placeholder: "0.8 — a bench over 0.62 is drawn with a backrest" },
    { key: "dimensionsPublished", label: "Dimensions published? (1 = from the datasheet, 0 = typical)", type: "number", placeholder: "1 or 0" },

    // ── What it does and what it weighs ──
    { key: "seats", label: "Seats", type: "number", placeholder: "0 for a bin or a bollard" },
    { key: "weightKg", label: "Weight kg", type: "number" },
    { key: "weightPublished", label: "Weight published? (1 or 0)", type: "number" },
    { key: "capacityLitres", label: "Capacity litres (bins)", type: "number" },

    { key: "priceValue", label: "Price", type: "number" },
    { key: "priceUnit", label: "Price unit", type: "text", placeholder: "EUR/each" },
    { key: "priceSource", label: "Price source", type: "text" },
    { key: "priceIsQuoted", label: "Quoted rather than estimated? (1 or 0)", type: "number" },
    { key: "costGroupDin276", label: "DIN 276 cost group", type: "text", placeholder: "560 for furniture, 550 for a light" },
    { key: "sourceUrl", label: "Source URL", type: "text", placeholder: "The product page the figures came from" },
  ],
  Plant: [
    { key: "commonName", label: "Common name", type: "text", required: true },
    { key: "scientificName", label: "Scientific name", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "sunRequirement", label: "Sun requirement", type: "text" },
    { key: "droughtTolerance", label: "Drought tolerance", type: "text" },
  ],
  FacilityGuideline: [
    { key: "category", label: "Category", type: "text", required: true, placeholder: "e.g. Changing rooms, Ventilation…" },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "requirement", label: "Requirement", type: "textarea", required: true },
    { key: "authority", label: "Authority", type: "text" },
    { key: "normCode", label: "Norm code", type: "text" },
  ],
  FieldVariant: [
    { key: "sportId", label: "Sport ID", type: "number", required: true, placeholder: "see each sport's id in the Sports domain" },
    { key: "variant", label: "Variant", type: "text", required: true, placeholder: "mini | standard | competition" },
    { key: "lengthM", label: "Length (m)", type: "number", required: true },
    { key: "widthM", label: "Width (m)", type: "number", required: true },
    { key: "runoffM", label: "Run-off (m)", type: "number" },
    { key: "heightMinM", label: "Min. height (m)", type: "number" },
    { key: "norm", label: "Norm citation", type: "text" },
  ],
  AnalysisParameter: [
    { key: "category", label: "Category", type: "text", required: true, placeholder: "Fire Safety, Accessibility, Water Management, Wind Exposure…" },
    { key: "key", label: "Machine key", type: "text", required: true, placeholder: "e.g. max_travel_distance_m — must match what analysisController.js looks up" },
    { key: "label", label: "Label", type: "text", required: true },
    { key: "value", label: "Value", type: "number", required: true },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. m, %, %/cm" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "authority", label: "Authority", type: "text", placeholder: "e.g. DIN, MBO, Illustrative" },
    { key: "normCode", label: "Norm code", type: "text" },
  ],
};

// Which real GET endpoint lists each editable type, and which of its
// fields reads best as the record picker's label — used only by "Edit
// existing" mode. FieldVariant has no standalone list endpoint (it's only
// ever fetched nested under a Sport), so it's create-only.
const ADMIN_ENTITY_LIST = {
  Material: { path: "sports/materials", labelField: "name" },
  Provider: { path: "sports/providers", labelField: "name" },
  Norm: { path: "norms", labelField: "code" },
  Sport: { path: "sports", labelField: "name" },
  SportOption: { path: "SportOptions", labelField: "label" },
  FurnitureItem: { path: "Furniture", labelField: "productName" },
  Plant: { path: "plants", labelField: "commonName" },
  FacilityGuideline: { path: "facilities", labelField: "title" },
  AnalysisParameter: { path: "AnalysisParameters", labelField: "label" },
};

let adminMode = "create"; // "create" | "edit"
let adminEditRecords = [];  // the currently-picked entity type's full list, for the picker + pre-fill
let adminEditSelected = null; // the specific record currently being edited

/** `prefill`, when given, seeds each field's input with the existing record's current value — edit mode only; create mode always starts blank. */
function renderAdminForm(entityType, prefill) {
  const container = document.getElementById("adminFormFields");
  if (!container) return;
  const fields = ADMIN_ENTITY_FIELDS[entityType] || [];
  container.innerHTML = fields.map(f => {
    const current = prefill ? prefill[f.key] : null;
    const value = current === null || current === undefined ? "" : current;
    return `
    <div>
      <span>${f.label}${f.required ? " *" : ""}</span>
      ${f.type === "textarea"
        ? `<textarea data-field="${f.key}" rows="2" placeholder="${f.placeholder || ""}">${value}</textarea>`
        : `<input type="${f.type === "number" ? "number" : "text"}" data-field="${f.key}" placeholder="${f.placeholder || ""}" value="${value}" ${f.type === "number" ? 'step="any"' : ""} />`}
    </div>`;
  }).join("");
}

function setAdminStatus(elId, text, ok) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === true ? "var(--text-success)" : ok === false ? "var(--text-fail)" : "";
}

function updateAdminCreateButton() {
  const btn = document.getElementById("btn-admin-create");
  if (!btn) return;
  btn.innerHTML = adminMode === "edit"
    ? `<i class="ti ti-device-floppy" aria-hidden="true"></i>Save changes`
    : `<i class="ti ti-plus" aria-hidden="true"></i>Create`;
}

async function loadAdminRecordPicker(entityType) {
  const wrap = document.getElementById("adminRecordPickerWrap");
  const picker = document.getElementById("adminRecordPicker");
  const listMeta = ADMIN_ENTITY_LIST[entityType];
  if (!listMeta) {
    wrap.style.display = "block";
    picker.innerHTML = `<option value="">No browsable list for this type — use Create new instead</option>`;
    document.getElementById("adminFormFields").innerHTML = "";
    adminEditRecords = [];
    return;
  }
  wrap.style.display = "block";
  picker.innerHTML = `<option value="">Loading…</option>`;
  try {
    const items = await fetchDataEntity(`admin_${entityType}`, listMeta.path);
    adminEditRecords = items;
    picker.innerHTML = `<option value="">Select a record…</option>` +
      items.map(it => `<option value="${it.id}">#${it.id} — ${it[listMeta.labelField]}</option>`).join("");
    document.getElementById("adminFormFields").innerHTML = "";
  } catch (err) {
    picker.innerHTML = `<option value="">Backend unreachable</option>`;
    adminEditRecords = [];
  }
}

document.getElementById("admin-mode-btns").addEventListener("click", e => {
  const btn = e.target.closest(".q-btn");
  if (!btn) return;
  adminMode = btn.dataset.adminMode;
  document.querySelectorAll("#admin-mode-btns .q-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("adminRecordPickerWrap").style.display = adminMode === "edit" ? "block" : "none";
  updateAdminCreateButton();
  const entityType = document.getElementById("adminEntityType").value;
  if (adminMode === "edit") loadAdminRecordPicker(entityType);
  else { adminEditSelected = null; renderAdminForm(entityType); }
});

document.getElementById("adminRecordPicker").addEventListener("change", e => {
  const entityType = document.getElementById("adminEntityType").value;
  adminEditSelected = adminEditRecords.find(it => String(it.id) === e.target.value) || null;
  renderAdminForm(entityType, adminEditSelected);
});

document.getElementById("adminEntityType").addEventListener("change", e => {
  adminEditSelected = null;
  if (adminMode === "edit") loadAdminRecordPicker(e.target.value);
  else renderAdminForm(e.target.value);
});
renderAdminForm(document.getElementById("adminEntityType").value);

document.getElementById("btn-admin-create").addEventListener("click", async () => {
  const entityType = document.getElementById("adminEntityType").value;
  const fields = ADMIN_ENTITY_FIELDS[entityType] || [];
  const statusId = "admin-create-status";

  if (adminMode === "edit" && !adminEditSelected) {
    setAdminStatus(statusId, "Pick a record to edit first.", false);
    return;
  }

  const data = {};
  for (const f of fields) {
    const el = document.querySelector(`#adminFormFields [data-field="${f.key}"]`);
    const raw = el ? el.value.trim() : "";
    if (adminMode === "create" && f.required && raw === "") { setAdminStatus(statusId, `${f.label} is required.`, false); return; }
    if (raw === "") continue; // never sent — leaves the field unset (create) or unchanged (edit), rather than blanking it out
    data[f.key] = f.type === "number" ? Number(raw) : raw;
  }

  setAdminStatus(statusId, "Saving…", null);
  try {
    const res = adminMode === "edit"
      ? await fetch(`${DATA_API_BASE}/admin/records/${entityType}/${adminEditSelected.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        })
      : await fetch(`${DATA_API_BASE}/admin/records`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType, data }),
        });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body) || res.statusText);

    setAdminStatus(statusId, adminMode === "edit" ? `${entityType} #${body?.id ?? adminEditSelected.id} updated.` : `${entityType} created (id ${body?.id ?? "?"}).`, true);
    dataState.cache = {}; // the change invalidates whichever domain list it belongs to
    if (adminMode === "edit") { adminEditSelected = null; loadAdminRecordPicker(entityType); }
    else renderAdminForm(entityType);
    if (typeof updateDataUI === "function") updateDataUI();
    if (typeof initAnalysisReferenceData === "function") initAnalysisReferenceData(); // LCA/analysis caches pick up the edit immediately
  } catch (err) {
    setAdminStatus(statusId, `Failed: ${err.message}`, false);
  }
});

document.getElementById("btn-admin-import-sql").addEventListener("click", async () => {
  const fileInput = document.getElementById("adminSqlFile");
  const file = fileInput.files[0];
  if (!file) { setAdminStatus("admin-import-status", "Choose a .sql file first.", false); return; }

  setAdminStatus("admin-import-status", "Importing…", null);
  try {
    const sql = await file.text();
    const res = await fetch(`${DATA_API_BASE}/admin/import-sql`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body) || res.statusText);
    setAdminStatus("admin-import-status", `Imported — ${body?.rowsAffected ?? "?"} row(s) affected.`, true);
    fileInput.value = "";
    dataState.cache = {};
    if (typeof updateDataUI === "function") updateDataUI();
  } catch (err) {
    setAdminStatus("admin-import-status", `Import failed, nothing was committed: ${err.message}`, false);
  }
});
