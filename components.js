/**
 * components.js — one picker for everything that stands on the roof
 *
 * There were two of these. A Furniture flyout over the Combine canvas, holding
 * catalogued supplier products, and a Garden workspace in the rail, holding the
 * design team's planter family. Two tabs, two mental models, for one action:
 * put a thing on the roof.
 *
 * They are the same thing and this is now the one place to pick from. What
 * differs is not WHAT the object is but WHERE ITS GEOMETRY COMES FROM, and that
 * is a property of the item, not a reason for a second tab:
 *
 *   catalogue product — a real product from a supplier. Fixed size, real
 *                       weight, price, DIN 276 group and a source URL. You pick
 *                       it and place it; there is nothing to configure, because
 *                       ABES decided the dimensions, not us.
 *
 *   Revit family      — authored by the design team, mirrored here parameter
 *                       for parameter. You pick it and then CONFIGURE it, and
 *                       the parameters offered are the ones the family actually
 *                       exposes.
 *
 * Both end up in the Combine tray the same way, so everything downstream — the
 * roof drawing, the weights, the export, Revit — is untouched by this merge.
 *
 * ── What this file does NOT own ──
 * The planter editor itself. That is planters.js, and it stays exactly as it
 * was written: plan and section, the family's own formulas, the freeboard
 * warning. "Configure" opens it. Rewriting careful work to move it one level up
 * a menu would be a poor trade.
 */

/**
 * The categories, in rail order. Grouped by WHAT THE THING IS, which is what
 * someone looking for a bench is thinking about — never by which of the two
 * sources it came from.
 */
const COMPONENT_CATEGORIES = [
  { key: "seating",  label: "Seating",  icon: "ti-armchair" },
  { key: "tables",   label: "Tables",   icon: "ti-table" },
  { key: "planters", label: "Planters", icon: "ti-plant-2" },
  { key: "bins",     label: "Bins",     icon: "ti-trash" },
  { key: "bollards", label: "Bollards", icon: "ti-traffic-cone" },
  { key: "lighting", label: "Lighting", icon: "ti-bulb" },
];

/** A catalogue product's own category → the category a person looks under. */
const CATALOGUE_TO_COMPONENT = {
  bench: "seating", table: "tables", bin: "bins", bollard: "bollards", light: "lighting",
};

/**
 * `editing` is the id of the family whose parameters are open, or null for the
 * picker. Configuring happens IN this panel, over the roof — you never leave
 * the thing you are designing to change a number about it.
 */
const componentsState = { category: null, id: null, editing: null };

/* ── The merged list ──────────────────────────────────────────────────────── */

/**
 * Every placeable component, from both sources, in one list.
 *
 * Families are read from planters.js's own tables rather than copied, so a
 * planter added there appears here without this file being touched.
 */
function componentItems() {
  const out = [];

  if (typeof FURNITURE !== "undefined") {
    Object.values(FURNITURE).forEach(f => out.push({
      source: "catalogue",
      id: f.key,
      label: f.product,
      sub: f.manufacturer.split(" (")[0],
      category: CATALOGUE_TO_COMPONENT[f.category] || "seating",
      product: f,
    }));
  }

  if (typeof PLANTER_VARIANTS !== "undefined") {
    Object.entries(PLANTER_VARIANTS).forEach(([id, v]) => out.push({
      source: "family",
      id,
      label: v.label,
      sub: "Planter family",
      category: "planters",
      family: "Planter",
    }));
  }

  // The bench and table of the same kit. Its family has not arrived yet, so it
  // has a footprint and nothing else — said plainly rather than implied by an
  // empty panel.
  if (typeof GARDEN_BENCH !== "undefined") {
    out.push({
      source: "family", id: GARDEN_BENCH.id, label: GARDEN_BENCH.label,
      sub: "Family to come", category: "tables", family: null, pending: true,
    });
  }

  return out;
}

function componentsInCategory(key) {
  return componentItems().filter(i => i.category === key);
}

/** Only the categories that actually hold something. */
function componentCategoriesPresent() {
  const items = componentItems();
  return COMPONENT_CATEGORIES.filter(c => items.some(i => i.category === c.key));
}

function ensureComponentSelection() {
  const present = componentCategoriesPresent();
  if (!present.length) return;
  if (!present.some(c => c.key === componentsState.category)) componentsState.category = present[0].key;
  const here = componentsInCategory(componentsState.category);
  if (!here.some(i => i.id === componentsState.id)) componentsState.id = here.length ? here[0].id : null;
}

function activeComponent() {
  ensureComponentSelection();
  return componentItems().find(i => i.id === componentsState.id) || null;
}

/* ── A family, drawn to scale like everything else ────────────────────────── */

/**
 * A family shaped like a catalogue entry, so the same drawing code can draw it.
 * The numbers come from the family's own current parameters, which is why a
 * planter you have configured looks configured here too.
 */
function familyAsDrawable(item) {
  if (item.id === (typeof GARDEN_BENCH !== "undefined" ? GARDEN_BENCH.id : null)) {
    return { product: item.label, category: "table",
             length_m: GARDEN_BENCH.length / 1000, width_m: GARDEN_BENCH.width / 1000, height_m: 0.75 };
  }
  const p = typeof planterParams === "function" ? planterParams(item.id) : null;
  if (!p) return null;
  return {
    product: item.label, category: "planter",
    length_m: p.length / 1000, width_m: p.width / 1000, height_m: p.rimHeight / 1000,
    // What the drawing needs beyond size: how full it is, and what is on it.
    substrate_ratio: p.rimLevel ? (p.substrateTop - p.pedestalHeight) / (p.rimLevel - p.pedestalHeight) : null,
    seat_cap: !!p.seatCap, tree: !!p.tree,
  };
}

/* ── The panel ────────────────────────────────────────────────────────────── */

function componentsPanelHtml() {
  const item = activeComponent();
  if (!item) return `<div class="section"><p class="hint">No components in the catalogue yet.</p></div>`;

  const tabs = componentCategoriesPresent().map(c => {
    const n = componentsInCategory(c.key).length;
    return `<button class="furniture-tab${c.key === componentsState.category ? " active" : ""}"
                    data-component-cat="${escapeHtml(c.key)}" title="${escapeHtml(c.label)}">
              ${escapeHtml(c.label)}<span class="furniture-tab-count">${n}</span>
            </button>`;
  }).join("");

  const options = componentsInCategory(componentsState.category).map(i =>
    `<option value="${escapeHtml(i.id)}"${i.id === componentsState.id ? " selected" : ""}>${i.sub} ${escapeHtml(i.label)}</option>`).join("");

  const picker = `
    <div class="section">
      <label>What are you placing?</label>
      <div class="furniture-tabs">${tabs}</div>
      <select id="component-select">${options}</select>
    </div>`;

  return picker + (item.source === "catalogue" ? catalogueComponentHtml(item) : familyComponentHtml(item)) + onThisRoofHtml();
}

/**
 * The family's own parameters, in the panel.
 *
 * The controls, the formulas and the drawing are planters.js's — its tables are
 * read rather than copied, so a parameter added to the family appears here
 * without this file changing. What is different from the old workspace is only
 * where it sits: over the roof, with a way back.
 */
function componentEditorHtml(item) {
  const p = planterParams(item.id);
  const input = ([key, label]) =>
    `<tr><td>${escapeHtml(label)}</td><td><input type="number" step="1" min="0" data-planter-param="${key}" value="${escapeHtml(p[key])}"> <small>mm</small></td></tr>`;
  const formula = ([key, label, text]) =>
    `<tr class="planter-formula"><td>${escapeHtml(label)}</td><td>${escapeHtml(p[key])} <small>mm</small><br><small>= ${escapeHtml(text)}</small></td></tr>`;
  const group = g => PLANTER_INPUTS.filter(i => i[2] === g).map(input).join("");

  return `
    <div class="section component-editor-head">
      <button class="btn-link" id="btn-editor-done"><i class="ti ti-arrow-left" aria-hidden="true"></i> Done</button>
      <div class="furniture-hero-name">${escapeHtml(item.label)}</div>
      <p class="hint">Revit family: Planter · the parameters it exposes</p>
    </div>

    <div class="section">
      <svg id="planter-field" class="component-editor-drawing" viewBox="0 0 600 400"></svg>
    </div>

    ${p.freeboard < 0 ? `<div class="section"><p class="planter-warn">The substrate rises ${-p.freeboard} mm above the rim: lower the Substrate Depth or raise the Rim Height.</p></div>` : ""}

    <div class="section">
      <label>Options</label>
      ${PLANTER_TOGGLES.map(([key, label]) => `<label class="planter-toggle"><span>${escapeHtml(label)}</span>
        <span class="planter-yn"><button type="button" data-planter-toggle="${key}" data-val="1" class="${p[key] ? "on" : ""}">Yes</button><button type="button" data-planter-toggle="${key}" data-val="0" class="${p[key] ? "" : "on"}">No</button></span></label>`).join("")}
    </div>

    <div class="section">
      <label>Parameters</label>
      <table class="planter-table">
        <tbody>
          <tr class="planter-group"><td colspan="2">Constraints</td></tr>${group("Constraints")}
          <tr class="planter-group"><td colspan="2">Dimensions</td></tr>${group("Dimensions")}
          <tr class="planter-group"><td colspan="2">Worked out by the family</td></tr>${PLANTER_FORMULAS.map(formula).join("")}
        </tbody>
      </table>
      <button type="button" class="btn-link" data-planter-reset>Reset to the family's defaults</button>
    </div>

    <div class="section">
      <button class="btn-export accent" id="btn-push-component">
        <i class="ti ti-plus" aria-hidden="true"></i>Push to Combine
      </button>
    </div>`;
}

/** A supplier's product: what it is, what it costs, where the figures came from. */
function catalogueComponentHtml(item) {
  const f = item.product;
  const dimNote = f.dimensions_published ? "published" : "typical — check the datasheet";
  const wNote = f.weight_published ? "published" : "typical";
  return `
    <div class="section furniture-hero">
      ${furnitureFigureHtml(f)}
      <div class="furniture-hero-name">${escapeHtml(f.product)}</div>
      <p class="hint">${componentSourceBadge(item)} · ${escapeHtml(f.manufacturer.split(" (")[0])}</p>
      <p class="hint">${escapeHtml(f.description)}</p>
    </div>

    <div class="section">
      <div class="dims">
        <div class="dim-card"><div class="val">${f.length_m} × ${f.width_m} m</div><div class="lbl">Footprint · ${dimNote}</div></div>
        <div class="dim-card"><div class="val">${f.height_m} m</div><div class="lbl">Height</div></div>
        ${f.seats ? `<div class="dim-card"><div class="val">${f.seats}</div><div class="lbl">Seats</div></div>` : ""}
        ${f.capacity_l ? `<div class="dim-card"><div class="val">${f.capacity_l} L</div><div class="lbl">Capacity</div></div>` : ""}
        ${f.weight_kg != null ? `<div class="dim-card"><div class="val">${f.weight_kg} kg</div><div class="lbl">Weight · ${wNote}</div></div>` : ""}
        ${f.price != null ? `<div class="dim-card"><div class="val">€ ${f.price}</div><div class="lbl">${f.price_quoted ? "quoted" : "estimated"}</div></div>` : ""}
      </div>
      <p class="hint">
        ${escapeHtml(f.material)}${f.cost_group ? ` · DIN 276 KG ${escapeHtml(f.cost_group)}` : ""}
        ${f.source_url ? ` · <a href="${safeUrl(f.source_url)}" target="_blank" rel="noopener">${escapeHtml(f.manufacturer.split(" (")[0])}</a>` : ""}
      </p>
    </div>

    <div class="section">
      <button class="btn-export accent" id="btn-push-component">
        <i class="ti ti-plus" aria-hidden="true"></i>Push to Combine
      </button>
      <p class="hint">Lands in the tray — drag it onto the roof like any other piece.</p>
    </div>`;
}

/** The design team's own family: what it is now, and the way in to change it. */
function familyComponentHtml(item) {
  const drawable = familyAsDrawable(item);
  const p = item.pending || typeof planterParams !== "function" ? null : planterParams(item.id);

  const figure = drawable && typeof furnitureFigureHtml === "function"
    ? furnitureFigureHtml(drawable, { from: "family" }) : "";

  const dims = item.pending
    ? `<div class="dims">
         <div class="dim-card"><div class="val">${GARDEN_BENCH.length} × ${GARDEN_BENCH.width}</div><div class="lbl">Footprint (mm)</div></div>
       </div>
       <p class="hint">Only the overall footprint is fixed. The rest follows the Revit family when it arrives.</p>`
    : `<div class="dims">
         <div class="dim-card"><div class="val">${p.length} × ${p.width}</div><div class="lbl">Footprint (mm)</div></div>
         <div class="dim-card"><div class="val">${p.rimHeight}</div><div class="lbl">Rim height (mm)</div></div>
         <div class="dim-card"><div class="val">${p.substrateDepth}</div><div class="lbl">Substrate (mm)</div></div>
         <div class="dim-card"><div class="val">${p.seatCap ? "Yes" : "No"}</div><div class="lbl">Seat cap</div></div>
       </div>
       ${p.freeboard < 0
         ? `<p class="planter-warn">The substrate rises ${-p.freeboard} mm above the rim — open Configure and lower it.</p>` : ""}`;

  return `
    <div class="section furniture-hero">
      ${figure}
      <div class="furniture-hero-name">${escapeHtml(item.label)}</div>
      <p class="hint">${componentSourceBadge(item)}${item.family ? ` · Revit family: ${escapeHtml(item.family)}` : ""}</p>
    </div>

    <div class="section">
      ${dims}
    </div>

    <div class="section">
      ${item.pending ? "" : `<button class="btn-export" id="btn-configure-component">
        <i class="ti ti-adjustments" aria-hidden="true"></i>Configure parameters
      </button>`}
      <button class="btn-export accent" id="btn-push-component">
        <i class="ti ti-plus" aria-hidden="true"></i>Push to Combine
      </button>
      <p class="hint">${item.pending
        ? "Pushes at its footprint until the family arrives."
        : "Configure opens the family's own parameters — the ones it actually exposes."}</p>
    </div>`;
}

/**
 * Where this component's geometry comes from. The same honesty the catalogue
 * already applies to a price or a dimension, applied to the shape itself.
 */
function componentSourceBadge(item) {
  if (item.source === "catalogue") return "Supplier product";
  return item.pending ? "Design team family" : "Design team family";
}

function onThisRoofHtml() {
  if (typeof furnitureTotals !== "function") return "";
  const t = furnitureTotals();
  return `
    <div class="section">
      <label>On this roof</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${t.count}</div><div class="lbl">Pieces</div></div>
        <div class="dim-card"><div class="val">${t.seats}</div><div class="lbl">Seats</div></div>
        <div class="dim-card"><div class="val">${Math.round(t.weight_kg)} kg</div><div class="lbl">On the deck</div></div>
        <div class="dim-card"><div class="val">€ ${Math.round(t.cost).toLocaleString("en-US")}</div><div class="lbl">Components</div></div>
      </div>
      ${t.unpriced || t.unweighed
        ? `<p class="hint">${t.unpriced} without a price, ${t.unweighed} without a weight — left out of the totals rather than counted as zero.</p>`
        : ""}
      <p class="hint">Components sit on the roof finish, so they take no area from it — unlike a court or a planted zone, which replace it.</p>
    </div>`;
}

/* ── Rendering and wiring ─────────────────────────────────────────────────── */

async function renderComponentsPanel() {
  const el = document.getElementById("furniture-panel");
  if (!el) return;

  if (typeof furnitureLoaded !== "undefined" && !furnitureLoaded && typeof loadFurniture === "function") {
    el.innerHTML = `<div class="section"><p class="hint">Loading the catalogue…</p></div>`;
    try { await loadFurniture(); }
    catch (e) {
      el.innerHTML = `<div class="section"><p class="hint">The catalogue could not be read — is the API running on :5107?</p></div>`;
      return;
    }
  }

  ensureComponentSelection();

  const editing = componentsState.editing
    ? componentItems().find(i => i.id === componentsState.editing && i.source === "family") : null;

  const flyout = document.getElementById("furniture-flyout");

  if (editing && typeof planterParams === "function") {
    flyout?.classList.add("is-editing");
    el.innerHTML = componentEditorHtml(editing);
    // planters.js draws into #planter-field, which only exists once the markup
    // above is in the page.
    if (typeof drawPlanter === "function") drawPlanter(planterParams(editing.id));
    return;
  }

  componentsState.editing = null;
  flyout?.classList.remove("is-editing");
  el.innerHTML = componentsPanelHtml();
}

/** Kept so the flyout owner and the undo restore can call it by its old name. */
function renderFurniturePanel() { return renderComponentsPanel(); }

document.addEventListener("click", e => {
  const cat = e.target.closest && e.target.closest("[data-component-cat]");
  if (cat) {
    componentsState.category = cat.dataset.componentCat;
    componentsState.id = null;
    renderComponentsPanel();
    return;
  }

  if (e.target.closest && e.target.closest("#btn-configure-component")) {
    const item = activeComponent();
    if (item && item.source === "family" && !item.pending) {
      componentsState.editing = item.id;
      if (typeof planterState !== "undefined") planterState.active = item.id;
      renderComponentsPanel();
    }
    return;
  }

  if (e.target.closest && e.target.closest("#btn-editor-done")) {
    componentsState.editing = null;
    renderComponentsPanel();
    return;
  }

  if (e.target.closest && e.target.closest("#btn-push-component")) {
    const item = activeComponent();
    if (!item) return;
    if (item.source === "catalogue") {
      // The catalogue picker keeps its own idea of what is selected, because
      // the push carries the whole product record.
      if (typeof furnitureState !== "undefined") {
        furnitureState.key = item.id;
        furnitureState.category = item.product.category;
      }
      if (typeof pushFurnitureToCombine === "function") pushFurnitureToCombine();
    } else {
      if (typeof planterState !== "undefined") planterState.active = item.id;
      if (typeof pushGardenItemToCombine === "function") pushGardenItemToCombine();
    }
  }
});

document.addEventListener("change", e => {
  if (e.target && e.target.id === "component-select") {
    componentsState.id = e.target.value;
    renderComponentsPanel();
  }
});
