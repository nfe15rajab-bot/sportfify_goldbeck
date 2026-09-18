/**
 * buildupEditor.js — editing a roof build-up
 *
 * The Data tab's existing form asks "what kind of record?" and then shows a
 * handful of text boxes. That works for a material or a provider, which are
 * flat rows that all look alike. It does not work here, for two reasons:
 *
 *   1. Standing in Build-ups and pressing Create, being asked to choose
 *      between Material, Provider, Sport and Plant is nonsense — the answer is
 *      obviously "a build-up".
 *   2. A build-up is not a flat row. It is a system PLUS an ordered list of
 *      layers, and the layers are the part that matters. A form that can
 *      rename Bauder's system but not change its substrate depth edits
 *      everything except the point.
 *
 * So this is a dedicated editor: the system's own fields, and a layer table
 * you can add to, delete from and reorder. Order is part of the specification
 * — vegetation on top, waterproofing at the bottom — so moving a row up and
 * down is a first-class action, not an afterthought.
 */

const BUILDUP_API = "http://localhost:5107/api/RoofAssemblies";

/** The layer roles the rest of the pipeline understands, in the order they normally occur. */
const LAYER_FUNCTIONS = [
  "vegetation", "substrate", "filter", "drainage",
  "protection", "root_barrier", "waterproofing", "wearing", "bedding",
];

const buildupEditorState = {
  open: false,
  /** null when creating, the record's id when editing. */
  editingId: null,
  draft: null,
  saving: false,
  error: null,
};

function blankBuildup() {
  return {
    key: "",
    provider: "",
    providerCountry: "Germany",
    systemName: "",
    category: "extensive",
    description: "",
    buildUpMm: null,
    saturatedKgM2: null,
    waterStorageLM2: null,
    sourceUrl: "",
    layers: [],
  };
}

function openBuildupEditor(record) {
  buildupEditorState.open = true;
  buildupEditorState.error = null;
  buildupEditorState.editingId = record ? record.id : null;
  // A deep copy, so abandoning the edit leaves the loaded catalog untouched.
  buildupEditorState.draft = record
    ? JSON.parse(JSON.stringify({ ...record, layers: (record.layers || []).slice().sort((a, b) => a.layerOrder - b.layerOrder) }))
    : blankBuildup();
  renderBuildupEditor();
}

function closeBuildupEditor() {
  buildupEditorState.open = false;
  buildupEditorState.draft = null;
  renderBuildupEditor();
  // The list is served from a cache, so a write has to drop it or the new
  // record never appears and the save looks like it failed.
  if (typeof retryDataFetch === "function") retryDataFetch({ key: "buildups" });
}

function addBuildupLayer() {
  buildupEditorState.draft.layers.push({
    name: "", function: "substrate", thicknessMm: 0, thicknessSource: "typical",
  });
  renderBuildupEditor();
}

function removeBuildupLayer(i) {
  buildupEditorState.draft.layers.splice(i, 1);
  renderBuildupEditor();
}

/** Moves a layer up or down. The sequence on screen is the sequence that gets saved. */
function moveBuildupLayer(i, delta) {
  const layers = buildupEditorState.draft.layers;
  const j = i + delta;
  if (j < 0 || j >= layers.length) return;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  renderBuildupEditor();
}

async function saveBuildup() {
  const d = buildupEditorState.draft;

  if (!d.provider.trim() || !d.systemName.trim()) {
    buildupEditorState.error = "A build-up needs a provider and a system name.";
    return renderBuildupEditor();
  }
  if (d.layers.length === 0) {
    buildupEditorState.error = "A build-up with no layers is just a name — add at least one.";
    return renderBuildupEditor();
  }
  if (d.layers.some(l => !l.name.trim())) {
    buildupEditorState.error = "Every layer needs a product name — it is what a contractor orders against.";
    return renderBuildupEditor();
  }

  // Derived rather than typed: the key exists so exports and Revit imports can
  // reference a system stably, and having someone invent one invites two
  // systems that differ only by a typo.
  if (!d.key.trim()) {
    d.key = `${d.provider}_${d.systemName}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  buildupEditorState.saving = true;
  buildupEditorState.error = null;
  renderBuildupEditor();

  try {
    const editing = buildupEditorState.editingId != null;
    const res = await fetch(editing ? `${BUILDUP_API}/${buildupEditorState.editingId}` : BUILDUP_API, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...d, id: buildupEditorState.editingId ?? 0 }),
    });
    if (!res.ok) throw new Error((await res.text()) || `API returned ${res.status}`);

    // The zones panel reads a cached catalog, so a saved change has to
    // invalidate it or the designer keeps drawing with the old build-up.
    if (typeof assembliesLoaded !== "undefined") assembliesLoaded = false;
    if (typeof showToast === "function") {
      showToast(editing ? "Build-up updated" : "Build-up created",
        `${d.provider} ${d.systemName} — ${d.layers.length} layers.`);
    }
    closeBuildupEditor();
  } catch (err) {
    buildupEditorState.error = err.message;
    buildupEditorState.saving = false;
    renderBuildupEditor();
  }
}

async function deleteBuildup(id, label) {
  if (!confirm(`Delete "${label}"? Any zone already drawn with it keeps its own copy, but it can't be chosen again.`)) return;
  try {
    const res = await fetch(`${BUILDUP_API}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    if (typeof assembliesLoaded !== "undefined") assembliesLoaded = false;
    if (typeof retryDataFetch === "function") retryDataFetch({ key: "buildups" });
  } catch (err) {
    alert(`Couldn't delete: ${err.message}`);
  }
}

/**
 * Compares the layer total against what the manufacturer publishes.
 *
 * They disagree whenever a manufacturer states an overall depth but not every
 * layer's — the gaps get filled with typical values, and those can add up past
 * the stated total. Revit builds the layers, so a silent disagreement means
 * modelling a deeper roof than the supplier is quoting. Better shown than
 * hidden behind two unrelated boxes.
 */
function publishedTotalNote(draft, layerTotal) {
  const published = Number(draft.buildUpMm);
  if (!published) return `<p class="hint">No published total to compare against.</p>`;

  const diff = layerTotal - published;
  if (Math.abs(diff) <= 5) {
    return `<p class="hint" style="color:#0ea355">Matches the published ${published} mm.</p>`;
  }
  return `<p class="hint" style="color:#f59e0b">
      Manufacturer publishes <strong>${published} mm</strong> — the layers come to
      <strong>${layerTotal} mm</strong>, ${Math.abs(diff)} mm ${diff > 0 ? "more" : "less"}.
      Revit builds the layers, so check the typical values against a datasheet.
    </p>`;
}

/* ── Rendering ── */

function renderBuildupEditor() {
  const el = document.getElementById("buildup-editor");
  if (!el) return;

  if (!buildupEditorState.open) { el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;

  const d = buildupEditorState.draft;
  const total = d.layers.reduce((s, l) => s + (Number(l.thicknessMm) || 0), 0);

  const field = (label, key, type = "text", placeholder = "") => `
    <div class="section">
      <label>${label}</label>
      <input type="${type}" data-bu-field="${key}" value="${d[key] ?? ""}" placeholder="${placeholder}">
    </div>`;

  el.innerHTML = `
    <div class="section span-2" style="display:flex;justify-content:space-between;align-items:center">
      <label style="margin:0">${buildupEditorState.editingId != null ? "Edit build-up" : "New build-up"}</label>
      <button class="btn-export" id="bu-cancel">Cancel</button>
    </div>

    ${buildupEditorState.error ? `<div class="section span-2"><p class="hint" style="color:#ef4444">${buildupEditorState.error}</p></div>` : ""}

    ${field("Provider", "provider", "text", "ZinCo, Bauder, Optigrün…")}
    ${field("System name", "systemName", "text", "Roof Garden")}

    <div class="section">
      <label>Category</label>
      <select data-bu-field="category">
        ${["extensive", "intensive", "walkway"].map(c =>
          `<option value="${c}"${d.category === c ? " selected" : ""}>${c}</option>`).join("")}
      </select>
    </div>
    ${field("Country", "providerCountry")}

    <div class="section span-2">
      <label>Description</label>
      <input type="text" data-bu-field="description" value="${d.description ?? ""}" placeholder="What the system is for">
    </div>

    <div class="section span-2">
      <label>Build-up thickness — <strong>${total} mm</strong></label>
      <p class="hint">
        Adds up from the layers below, and is what Revit actually builds. Not typed:
        a total someone enters by hand is a second, competing answer to a question
        the layers already answer.
      </p>
      ${publishedTotalNote(d, total)}
    </div>

    <div class="section span-2">
      <label>Manufacturer's published figures — leave blank if they don't state one</label>
      <p class="hint">
        What an engineer checks a deck against. A blank is honest; a guess is not.
        The published build-up below is a cross-check against the layers, not a substitute.
      </p>
    </div>
    ${field("Published build-up (mm)", "buildUpMm", "number")}
    ${field("Saturated weight (kg/m²)", "saturatedKgM2", "number")}
    ${field("Water storage (L/m²)", "waterStorageLM2", "number")}
    ${field("Source URL", "sourceUrl", "text", "https://…")}

    <div class="section span-2">
      <label>Layers — outermost first (${d.layers.length}, ${total} mm total)</label>
      <p class="hint">Order is the specification: vegetation on top, waterproofing at the bottom.</p>
      ${d.layers.map((l, i) => `
        <div class="dim-card" style="display:grid;grid-template-columns:1fr 130px 90px 110px auto;gap:6px;align-items:center;margin-bottom:6px">
          <input type="text" data-bu-layer="${i}" data-bu-key="name" value="${l.name ?? ""}" placeholder="Product name">
          <select data-bu-layer="${i}" data-bu-key="function">
            ${LAYER_FUNCTIONS.map(f => `<option value="${f}"${l.function === f ? " selected" : ""}>${f}</option>`).join("")}
          </select>
          <input type="number" step="1" min="0" data-bu-layer="${i}" data-bu-key="thicknessMm" value="${l.thicknessMm ?? 0}" title="mm">
          <select data-bu-layer="${i}" data-bu-key="thicknessSource" title="Did the manufacturer publish this thickness?">
            <option value="published"${l.thicknessSource === "published" ? " selected" : ""}>published</option>
            <option value="typical"${l.thicknessSource !== "published" ? " selected" : ""}>typical</option>
          </select>
          <span style="white-space:nowrap">
            <button class="btn-export" data-bu-move="${i}" data-bu-delta="-1" title="Move up">↑</button>
            <button class="btn-export" data-bu-move="${i}" data-bu-delta="1" title="Move down">↓</button>
            <button class="btn-export" data-bu-remove="${i}" title="Remove">✕</button>
          </span>
        </div>`).join("")}
      <button class="btn-export" id="bu-add-layer"><i class="ti ti-plus" aria-hidden="true"></i>Add layer</button>
    </div>

    <div class="section span-2">
      <button class="btn-export accent" id="bu-save" ${buildupEditorState.saving ? "disabled" : ""}>
        ${buildupEditorState.saving ? "Saving…" : (buildupEditorState.editingId != null ? "Save changes" : "Create build-up")}
      </button>
    </div>`;

  wireBuildupEditor();
}

function wireBuildupEditor() {
  const d = buildupEditorState.draft;

  document.querySelectorAll("[data-bu-field]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.buField;
      // Blank stays null for the published figures, so "not stated" survives a
      // round trip through the form instead of becoming zero.
      d[key] = input.type === "number"
        ? (input.value === "" ? null : Number(input.value))
        : input.value;
    });
  });

  document.querySelectorAll("[data-bu-layer]").forEach(input => {
    input.addEventListener("change", () => {
      const layer = d.layers[Number(input.dataset.buLayer)];
      const key = input.dataset.buKey;
      layer[key] = key === "thicknessMm" ? Number(input.value) || 0 : input.value;
      if (key === "thicknessMm") renderBuildupEditor();   // refresh the running total
    });
  });

  document.querySelectorAll("[data-bu-move]").forEach(btn =>
    btn.addEventListener("click", () => moveBuildupLayer(Number(btn.dataset.buMove), Number(btn.dataset.buDelta))));
  document.querySelectorAll("[data-bu-remove]").forEach(btn =>
    btn.addEventListener("click", () => removeBuildupLayer(Number(btn.dataset.buRemove))));

  document.getElementById("bu-add-layer")?.addEventListener("click", addBuildupLayer);
  document.getElementById("bu-save")?.addEventListener("click", saveBuildup);
  document.getElementById("bu-cancel")?.addEventListener("click", closeBuildupEditor);
}
