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
  return { key: "palettes", path: "plants/palettes" };
}

// Each domain's search box filters against a different field on its items —
// sports/palettes are named, facility guidelines are grouped by Title instead.
const DOMAIN_SEARCH_FIELD = { sports: "name", vegetation: "name", facilities: "title" };

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
  return `
    <div class="section span-2">
      <label>${palette.name} — ${palette.type}</label>
      <p class="hint">${palette.description}</p>
      <p class="hint"><strong>Plants:</strong> ${plants}</p>
      <p class="hint"><strong>Norms:</strong> ${norms}</p>
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

const DOMAIN_CARD_HTML = { sports: sportCardHtml, vegetation: paletteCardHtml, facilities: facilityCardHtml };

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
    const noun = { sports: "sport", vegetation: "palette", facilities: "guideline" }[dataState.domain] || "item";
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

/* ── Data tab: domain switch + search wiring ── */
document.getElementById("data-domain-btns").addEventListener("click", e => {
  const btn = e.target.closest(".q-btn");
  if (btn && typeof setDataDomain === "function") setDataDomain(btn.dataset.domain);
});
document.getElementById("dataSearch").addEventListener("input", e => {
  if (typeof setDataSearch === "function") setDataSearch(e.target.value);
});
