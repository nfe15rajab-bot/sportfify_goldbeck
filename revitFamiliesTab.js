/**
 * revitFamiliesTab.js — "Revit Families" workspace
 *
 * The firm's OWN Revit content, fetched live from the add-in: whatever
 * .rfa files someone picked with Load Families in Revit, with the
 * parameters each one actually exposes. Controls here are built from that
 * payload at runtime — nothing about this tab knows what a basketball
 * court is, because the point is that it works for content this app has
 * never seen.
 *
 * Deliberately standalone: its own state, its own fetch, no touching
 * combineState/FIELDS/GARDEN_ITEMS. The built-in catalog (sport/garden/
 * activity presets) and this live-from-Revit path are separate ideas for
 * now, and keeping them apart means experimenting here can't break the
 * tabs that already work. Wiring these families through to Combine as
 * placeable pieces is the next step, not this one.
 */

const REVIT_FAMILIES_URL = "http://localhost:5679/families";      // shown in the messages; the request goes through localFetch (localSession.js)

const familiesState = {
  status: "idle",   // idle | loading | ok | empty | offline
  payload: null,
  /** Per-type user edits, keyed "familyName::typeName" → { paramName: value }. */
  edits: {},
};

function familyEditKey(familyName, typeName) {
  return `${familyName}::${typeName}`;
}

/**
 * Reads the current value for a parameter: the user's edit if they've
 * touched it, otherwise whatever Revit reported. Keeping edits in a
 * separate map (rather than mutating the payload) means "what Revit
 * actually has" stays available for comparison — which is what a
 * push-back-to-Revit step will need.
 */
function familyParamValue(familyName, typeName, paramName, revitValue) {
  const edits = familiesState.edits[familyEditKey(familyName, typeName)];
  const edited = edits ? edits[paramName] : undefined;
  return edited === undefined ? revitValue : edited;
}

async function fetchRevitFamilies() {
  familiesState.status = "loading";
  renderFamiliesContent();

  try {
    const res = await localFetch("/families");
    if (res.status === 404) {
      // The bridge is up but nobody has run Load Families yet — a different
      // situation from Revit not running, and worth saying so precisely.
      familiesState.status = "empty";
      familiesState.payload = null;
    } else if (!res.ok) {
      familiesState.status = "offline";
    } else {
      familiesState.payload = await res.json();
      familiesState.status = "ok";
    }
  } catch (err) {
    familiesState.status = "offline";
  }
  renderFamiliesContent();
}

function familiesHeaderHtml() {
  const p = familiesState.payload;
  const count = p ? p.family_count : 0;
  return `
    <div class="section span-2">
      <label>Your Revit families</label>
      <p class="hint">
        Families loaded in Revit with <strong>Load Families</strong>, with the parameters
        each one exposes. Controls below are built from the family itself — nothing here
        is hard-coded per sport.
      </p>
      <button class="btn-export accent" id="btn-families-fetch" style="margin-top:8px">
        <i class="ti ti-refresh" aria-hidden="true"></i>Fetch from Revit
      </button>
      ${p ? `<p class="hint" style="margin-top:8px"><strong>${count}</strong> famil${count === 1 ? "y" : "ies"} from <code>${p.document || "—"}</code></p>` : ""}
    </div>`;
}

function familiesMessageHtml() {
  if (familiesState.status === "loading") {
    return `<div class="section span-2"><p class="hint">Asking Revit…</p></div>`;
  }
  if (familiesState.status === "offline") {
    return `
      <div class="section span-2">
        <label>Revit not reachable</label>
        <p class="hint">Can't reach the Sportify add-in at <code>${REVIT_FAMILIES_URL}</code>.</p>
        <p class="hint">Open Revit with the Sportify add-in loaded, then press Fetch again.</p>
      </div>`;
  }
  if (familiesState.status === "empty") {
    return `
      <div class="section span-2">
        <label>Connected — no families sent yet</label>
        <p class="hint">Revit is running, but nothing has been loaded.</p>
        <p class="hint">In Revit: <strong>Sportify → Load Families</strong>, pick your <code>.rfa</code> files, then press Fetch again.</p>
      </div>`;
  }
  return "";
}

/**
 * One control per parameter Revit said is writable. Dimensions get a
 * number input in meters (the add-in already converted from Revit's
 * internal feet); materials are shown read-only for now, since this app
 * has no way to know which materials exist in the user's project — asking
 * Revit for that list is its own round trip, not something to fake here.
 */
function familyTypeHtml(fam, type) {
  const key = familyEditKey(fam.family_name, type.type_name);
  const dims = type.dimension_candidates || [];
  const mats = type.material_candidates || [];

  // A family with no dimension parameters is fixed-size, not unusable — say
  // which, and show the footprint Revit measured so it can still be laid out.
  const fp = type.footprint_m;
  const dimHtml = dims.length === 0
    ? fixedSizeHtml(fam, type, fp)
    : dims.map(d => {
        const val = familyParamValue(fam.family_name, type.type_name, d.name, d.value_m);
        return `
          <div class="dim-card">
            <span class="lbl">${escapeHtml(d.name)}</span>
            <input type="number" step="0.1" min="0"
                   id="fam-${cssSafeId(key)}-${escapeHtml(cssSafeId(d.name))}"
                   data-fam="${escapeAttr(fam.family_name)}"
                   data-type="${escapeAttr(type.type_name)}"
                   data-param="${escapeAttr(d.name)}"
                   class="family-dim-input"
                   value="${Number(val).toFixed(2)}">
            <span class="hint">m — Revit: ${Number(d.value_m).toFixed(2)} m</span>
          </div>`;
      }).join("");

  const palette = (familiesState.payload && familiesState.payload.materials) || [];

  const matHtml = mats.length === 0 ? "" : `
    <p class="hint" style="margin-top:10px"><strong>Materials</strong></p>
    ${mats.map(m => {
      const current = familyParamValue(fam.family_name, type.type_name, m.name, m.current_id);
      const options = palette.length === 0
        ? `<option value="${escapeAttr(m.current_id || "")}">${escapeAttr(m.value || "—")}</option>`
        : materialOptionsHtml(palette, current);
      return `
        <div class="dim-card">
          <span class="lbl">${escapeHtml(m.name)}</span>
          <select class="family-material-select"
                  data-fam="${escapeAttr(fam.family_name)}"
                  data-type="${escapeAttr(type.type_name)}"
                  data-param="${escapeAttr(m.name)}">${options}</select>
          <span class="hint">Revit: ${escapeAttr(m.value || "—")}${materialCostHint(palette, current)}</span>
        </div>`;
    }).join("")}
    ${palette.length === 0 ? `<p class="hint">No material palette in this payload — re-run Load Families in Revit to pick up the project's materials.</p>` : ""}`;

  return `
    <div class="section">
      <label>${escapeHtml(type.type_name)}</label>
      <div class="dims">${dimHtml}</div>
      ${matHtml}
      <p class="hint" style="margin-top:10px">${(type.parameters || []).length} parameters in total · ${dims.length} drivable · ${mats.length} material slots · ${type.is_resizable ? "resizable" : "fixed size"}</p>
      <button class="btn-export accent family-push-btn" style="margin-top:8px"
              data-fam="${escapeAttr(fam.family_name)}"
              data-type="${escapeAttr(type.type_name)}">
        <i class="ti ti-arrow-right" aria-hidden="true"></i>Push to Combine
      </button>
      ${footprintForCombine(fam, type) ? "" : `<p class="hint">No usable footprint yet — set a length and width above, or place this family once in Revit so it reports a size.</p>`}
    </div>`;
}

/** Synthetic parameter names for a size the user typed in, kept in the same
 *  edits map as real parameters but prefixed so they can never collide with a
 *  parameter name from someone's family. */
const MANUAL_LENGTH = "__sportify_manual_length_m";
const MANUAL_WIDTH = "__sportify_manual_width_m";

/** Starting footprint for a family Revit couldn't measure — a placeholder the
 *  user adjusts, not a claim about the family. Defined once so the inputs and
 *  the push logic can't disagree: they did, and the piece silently refused to
 *  push while showing a perfectly good size on screen. */
const MANUAL_FALLBACK_M = 10;
function manualDefaults(fp) {
  return {
    length_m: fp && fp.length_m > 0 ? fp.length_m : MANUAL_FALLBACK_M,
    width_m: fp && fp.width_m > 0 ? fp.width_m : MANUAL_FALLBACK_M,
  };
}

/**
 * A family with no dimension parameters still needs a footprint to be laid
 * out. Revit measures one where it can, but a symbol that has never been
 * placed often has no cached geometry and reports nothing — which left the
 * piece unpushable, with only a toast to explain why.
 *
 * So the size becomes editable here: pre-filled from Revit's measurement when
 * there is one, typed in by the user when there isn't. The family is still
 * placed at its authored size in Revit — this figure only tells the Combine
 * canvas how much roof it occupies.
 */
function fixedSizeHtml(fam, type, fp) {
  const key = familyEditKey(fam.family_name, type.type_name);
  const def = manualDefaults(fp);
  const len = familyParamValue(fam.family_name, type.type_name, MANUAL_LENGTH, def.length_m);
  const wid = familyParamValue(fam.family_name, type.type_name, MANUAL_WIDTH, def.width_m);

  const note = fp
    ? `Footprint measured from the family's own geometry in Revit. This is its real size —
       changing it only changes how much roof the canvas reserves, not what Revit places.`
    : `Revit could not measure this family — it may be a hosted family that needs a wall or
       level to sit on. Set the footprint it should occupy on the roof, or place it once in
       Revit and load it again to have it measured.`;

  const input = (param, value, label) => `
    <div class="dim-card">
      <span class="lbl">${label}</span>
      <input type="number" step="0.1" min="0"
             id="fam-${cssSafeId(key)}-${cssSafeId(param)}"
             data-fam="${escapeAttr(fam.family_name)}"
             data-type="${escapeAttr(type.type_name)}"
             data-param="${escapeAttr(param)}"
             class="family-dim-input"
             value="${Number(value).toFixed(2)}">
      <span class="hint">m</span>
    </div>`;

  return `
    <p class="hint"><strong>Fixed size</strong> — this family exposes no adjustable dimensions,
       so Revit places it at its authored size. ${note}</p>
    ${input(MANUAL_LENGTH, len, "Footprint length")}
    ${input(MANUAL_WIDTH, wid, "Footprint width")}
    <p class="hint">To make it truly resizable, its author would add Length/Width parameters in the Revit Family Editor.</p>`;
}

function familyCardHtml(fam) {
  return `
    <div class="section span-2">
      <label>${escapeHtml(fam.family_name)}</label>
      <p class="hint">Category: <span class="val">${escapeHtml(fam.category || "—")}</span></p>
      <p class="hint">From: <code>${fam.source_file || "—"}</code></p>
    </div>
    ${(fam.types || []).map(t => familyTypeHtml(fam, t)).join("")}`;
}

function renderFamiliesContent() {
  const el = document.getElementById("families-content");
  if (!el) return;

  const msg = familiesMessageHtml();
  const body = (familiesState.status === "ok" && familiesState.payload)
    ? (familiesState.payload.families || []).map(familyCardHtml).join("")
    : "";

  el.innerHTML = `<div class="step-grid">${familiesHeaderHtml()}${msg}${body}</div>`;

  const btn = document.getElementById("btn-families-fetch");
  if (btn) btn.addEventListener("click", fetchRevitFamilies);

  el.querySelectorAll(".family-dim-input").forEach(input => {
    input.addEventListener("change", () => {
      const k = familyEditKey(input.dataset.fam, input.dataset.type);
      if (!familiesState.edits[k]) familiesState.edits[k] = {};
      familiesState.edits[k][input.dataset.param] = parseFloat(input.value) || 0;
    });
  });

  el.querySelectorAll(".family-push-btn").forEach(btn => {
    btn.addEventListener("click", () => pushFamilyToCombine(btn.dataset.fam, btn.dataset.type));
  });

  el.querySelectorAll(".family-material-select").forEach(select => {
    select.addEventListener("change", () => {
      const k = familyEditKey(select.dataset.fam, select.dataset.type);
      if (!familiesState.edits[k]) familiesState.edits[k] = {};
      familiesState.edits[k][select.dataset.param] = select.value;
      // Re-render so the hint beside the dropdown follows the new choice —
      // class/cost/manufacturer describe the material just picked, not the
      // one Revit started with.
      renderFamiliesContent();
    });
  });
}

/**
 * A real project carries well over a hundred materials (131 in the first
 * one tested), which is far too many for a flat dropdown to be usable.
 * Grouping by Revit's own Material Class turns that into a handful of
 * headed sections — navigable without adding a search box, and using a
 * classification the user's own project already maintains.
 */
function materialOptionsHtml(palette, currentId) {
  const groups = new Map();
  palette.forEach(m => {
    const cls = m.material_class || "Unclassified";
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls).push(m);
  });

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cls, items]) => `
      <optgroup label="${escapeAttr(cls)}">
        ${items.map(m =>
          `<option value="${escapeAttr(m.id)}"${String(m.id) === String(currentId) ? " selected" : ""}>${escapeAttr(m.name)}</option>`
        ).join("")}
      </optgroup>`).join("");
}

/**
 * Revit materials carry their own identity data, including a Cost field.
 * Shown when the project actually fills it in — most don't, so this stays
 * silent rather than displaying an empty "Cost: —" on every row. The app's
 * own material catalog remains the richer source for carbon and providers;
 * this is just what the model itself knows.
 */
function materialCostHint(palette, materialId) {
  const m = palette.find(p => String(p.id) === String(materialId));
  if (!m) return "";
  const bits = [];
  if (m.material_class) bits.push(m.material_class);
  if (m.cost) bits.push(`cost ${m.cost}`);
  if (m.manufacturer) bits.push(m.manufacturer);
  return bits.length ? ` · ${bits.join(" · ")}` : "";
}

/** Parameter and family names are free text from someone else's Revit file — they can hold quotes, spaces, anything. */
function escapeAttr(s) {
  return escapeHtml(s);
}
function cssSafeId(s) {
  return String(s == null ? "" : s).replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * The size this type should occupy on the roof. Prefers the user's edited
 * dimensions, then what Revit reported for those parameters, then the
 * measured bounding box for a fixed-size family — so a family with no
 * parameters at all is still placeable, which is the common case with
 * real third-party content.
 *
 * Returns null when nothing knows the size; the caller shows that rather
 * than dropping a zero-sized rectangle onto the canvas.
 */
function footprintForCombine(fam, type) {
  const dims = type.dimension_candidates || [];

  if (dims.length >= 2) {
    const vals = dims.map(d => Number(familyParamValue(fam.family_name, type.type_name, d.name, d.value_m)))
                     .filter(v => v > 0);
    if (vals.length >= 2) {
      const sorted = [...vals].sort((a, b) => b - a);
      return { length_m: sorted[0], width_m: sorted[1] };
    }
  }

  // Fixed-size family: the size shown in the Fixed size box — Revit's own
  // measurement where it had one, otherwise whatever the user typed.
  const fp = type.footprint_m;
  const def = manualDefaults(fp);
  const len = Number(familyParamValue(fam.family_name, type.type_name, MANUAL_LENGTH, def.length_m));
  const wid = Number(familyParamValue(fam.family_name, type.type_name, MANUAL_WIDTH, def.width_m));
  if (len > 0 && wid > 0) return { length_m: len, width_m: wid };

  return null;
}

/**
 * Hands one configured family type to the Combine tab's tray, where it
 * behaves like any other piece — drag it onto the roof, rotate it, and it
 * takes part in the same clearance/circulation checks.
 *
 * sourceJson carries the Revit identity (family + type + the parameter
 * values chosen here) so the Combine export can tell Revit exactly which
 * family to place and at what size, instead of a quality_key that only
 * means something to this app's own catalog.
 */
function pushFamilyToCombine(familyName, typeName) {
  const p = familiesState.payload;
  if (!p) return;
  const fam = (p.families || []).find(f => f.family_name === familyName);
  const type = fam && (fam.types || []).find(t => t.type_name === typeName);
  if (!fam || !type) return;

  const fp = footprintForCombine(fam, type);
  if (!fp) {
    if (typeof showToast === "function") {
      showToast("No size for this family", "Set a length and width first, or place it once in Revit so it reports a footprint.");
    }
    return;
  }

  const chosen = {};
  (type.dimension_candidates || []).forEach(d => {
    chosen[d.name] = familyParamValue(fam.family_name, type.type_name, d.name, d.value_m);
  });
  (type.material_candidates || []).forEach(m => {
    const id = familyParamValue(fam.family_name, type.type_name, m.name, m.current_id);
    const paletteEntry = (p.materials || []).find(pm => String(pm.id) === String(id));
    chosen[m.name] = { material_id: id, material_name: paletteEntry ? paletteEntry.name : m.value };
  });

  addCombineItem({
    kind: "revit",
    label: `${fam.family_name} — ${type.type_name}`,
    length_m: fp.length_m,
    width_m: fp.width_m,
    sourceJson: {
      source: "revit_family",
      revit_family: {
        family_name: fam.family_name,
        type_name: type.type_name,
        category: fam.category,
        category_id: fam.category_id,
        is_resizable: !!type.is_resizable,
        parameters: chosen,
      },
    },
  });

  if (typeof showToast === "function") {
    showToast("Pushed to Combine", `${fam.family_name} is in the Combine tray — drag it onto the roof.`);
  }
}

/** Called by setMode() whenever this workspace is opened. */
function updateFamiliesUI() {
  renderFamiliesContent();
  // First visit: ask Revit straight away rather than making the user press
  // a button to discover whether anything is connected at all.
  if (familiesState.status === "idle") fetchRevitFamilies();
}
