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
  cache: {},               // { sports: Sport[], palettes: PlantPalette[], facilities: FacilityGuideline[] }
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
  if (dataState.domain === "sports") return { key: "sports", path: "sports" };
  if (dataState.domain === "facilities") return { key: "facilities", path: "facilities" };
  if (dataState.domain === "analysisParams") return { key: "analysisParameters", path: "AnalysisParameters" };
  return { key: "palettes", path: "plants/palettes" };
}

// Each domain's search box filters against a different field on its items —
// sports/palettes are named, facility guidelines and analysis parameters are grouped by Title/Label instead.
const DOMAIN_SEARCH_FIELD = { sports: "name", vegetation: "name", facilities: "title", analysisParams: "label" };

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

const DOMAIN_CARD_HTML = { sports: sportCardHtml, vegetation: paletteCardHtml, facilities: facilityCardHtml, analysisParams: analysisParamCardHtml };

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

  const searchField = DOMAIN_SEARCH_FIELD[dataState.domain] || "name";
  const term = dataState.search.trim().toLowerCase();
  const filtered = term ? items.filter(it => (it[searchField] || "").toLowerCase().includes(term)) : items;

  if (filtered.length === 0) {
    contentEl.innerHTML = `<div class="step-grid"><div class="section span-2"><p class="hint">No matches${term ? ` for "${dataState.search}"` : ""}.</p></div></div>`;
  } else {
    const cardHtml = DOMAIN_CARD_HTML[dataState.domain] || sportCardHtml;
    contentEl.innerHTML = `<div class="step-grid">${filtered.map(cardHtml).join("")}</div>`;
  }

  if (statusEl) {
    const noun = { sports: "sport", vegetation: "palette", facilities: "guideline", analysisParams: "parameter" }[dataState.domain] || "item";
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

function retryDataFetch() {
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
  PlantPalette: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "text", placeholder: "extensive | intensive" },
    { key: "description", label: "Description", type: "textarea" },
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
  PlantPalette: { path: "plants/palettes", labelField: "name" },
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
