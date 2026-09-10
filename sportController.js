/**
 * sportController.js — Sport mode controller (field sports + activities)
 * State, activity-bar wiring, listeners, JSON/DXF export for Sport mode.
 * Split out of main.js so mode-specific logic doesn't all live in one file.
 */

/* ── App state ── */
const state = {
  selectionType: "field",
  sport: "polyvalent",
  variant: "mini",
  capacity: 0,
  quality: "medium",
  activityId: null,
  activityLength: null,
  activityWidth: null,
  activityQuantity: 1,
  activityCapacity: 0,
  activityQuality: "medium",
};

const FIELD_SPORTS = {
  polyvalent: { label: "Polyvalent (multi-sport)", short: "Poly", icon: "ti-square-rounded" },
  basketball: { label: "Basketball", short: "B-Ball", icon: "ti-square-rounded" },
  handball:   { label: "Handball", short: "Handb.", icon: "ti-square-rounded" },
  volleyball: { label: "Volleyball", short: "V-Ball", icon: "ti-square-rounded" },
  badminton:  { label: "Badminton", short: "Badm.", icon: "ti-square-rounded" },
  football:   { label: "Football (indoor)", short: "Football", icon: "ti-square-rounded" },
};

/* ── Activity bars ── */
function buildActivityBar() {
  const bar = document.getElementById("activity-bar");
  let html = "";
  Object.entries(FIELD_SPORTS).forEach(([id, f]) => {
    html += `<button class="activity-icon${id === state.sport ? " active" : ""}" data-kind="field" data-id="${id}" title="${f.label}">
               <i class="ti ${f.icon}"></i><span class="activity-icon-label">${f.short}</span>
             </button>`;
  });
  html += `<div class="activity-bar-divider"></div>`;
  Object.entries(ACTIVITIES).forEach(([id, a]) => {
    html += `<button class="activity-icon${id === state.activityId ? " active" : ""}" data-kind="activity" data-id="${id}" title="${a.label}">
               <i class="ti ${a.icon}"></i><span class="activity-icon-label">${a.short}</span>
             </button>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll(".activity-icon").forEach(btn => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".activity-icon").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const kind = btn.dataset.kind;
      const id = btn.dataset.id;

      if (kind === "field") {
        state.selectionType = "field"; state.sport = id;
        document.getElementById("field-params").style.display = "block";
        document.getElementById("activity-params").style.display = "none";
        document.getElementById("sport-panel-title").textContent = "Field configurator";
        document.getElementById("sport-panel-subtitle").textContent = "Indoor sports — school facilities";
        if(typeof spawnBurst === "function") spawnBurst(id);
        updateUI();
      } else {
        state.selectionType = "activity"; state.activityId = id;
        const a = ACTIVITIES[id];
        state.activityLength = a.length; state.activityWidth = a.width;
        state.activityQuantity = 1; state.activityCapacity = 0; state.activityQuality = "medium";

        document.getElementById("activityLength").value = a.length;
        document.getElementById("activityWidth").value = a.width;
        document.getElementById("activityQuantity").value = 1;
        document.getElementById("qty-val").textContent = "1";
        document.getElementById("activityCapacity").value = 0;
        document.getElementById("cap-activity-val").textContent = "No limit set";
        document.querySelectorAll("#activity-quality-btns .q-btn").forEach(b => b.classList.remove("active"));
        document.querySelector('#activity-quality-btns .q-btn[data-q="medium"]').classList.add("active");

        document.getElementById("field-params").style.display = "none";
        document.getElementById("activity-params").style.display = "block";
        document.getElementById("sport-panel-title").textContent = "Activity configurator";
        document.getElementById("sport-panel-subtitle").textContent = "Fixed-size urban / outdoor preset";
        updateActivityUI();
      }
    });
  });
}

/* ── UI Syncing ── */
function updateUI() {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  document.getElementById("d-l").textContent = d.l;
  document.getElementById("d-w").textContent = d.w;
  document.getElementById("d-run").textContent = d.runoff;
  document.getElementById("d-h").textContent = d.h;

  const sportLabel = FIELD_SPORTS[state.sport]?.label.replace(/\s*\(.*\)/, "") || state.sport;
  const variantLabel = state.variant.charAt(0).toUpperCase() + state.variant.slice(1);
  document.getElementById("field-label").textContent = `${sportLabel} — ${variantLabel}`;
  document.getElementById("norm-badge").textContent  = d.norm;
  if(typeof drawField === "function") drawField(state.sport, state.variant, state.capacity, isDarkMode());
}

function updateActivityUI() {
  const a = ACTIVITIES[state.activityId];
  if (!a) return;
  document.getElementById("activity-category").textContent = a.category.charAt(0).toUpperCase() + a.category.slice(1);
  const qtyLabel = state.activityQuantity > 1 ? ` × ${state.activityQuantity}` : "";
  document.getElementById("field-label").textContent = `${a.label}${qtyLabel}`;
  document.getElementById("norm-badge").textContent = a.norm;
  if(typeof drawActivity === "function") drawActivity(state.activityId, { length: state.activityLength, width: state.activityWidth }, isDarkMode());
}

/* ── Sport Listeners & Exports ── */
document.getElementById("variant").addEventListener("change", e => { state.variant = e.target.value; updateUI(); });
document.getElementById("capacity").addEventListener("input", e => { state.capacity = Number(e.target.value); document.getElementById("cap-val").textContent = state.capacity === 0 ? "No stands" : `${state.capacity} seats`; updateUI(); });
document.querySelectorAll("#sportConfigurator .q-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#sportConfigurator .q-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); state.quality = btn.dataset.q;
  });
});

/* ── Reference material/provider (sourced from the .NET reference DB,
   read fresh at export time — doesn't affect the rendered field, so no
   need to track it in `state` the way quality/variant/capacity are). ── */
let sportMaterialRefOptions = [];
let sportProviderRefOptions = [];

async function initSportReferenceDropdowns() {
  const matSelect = document.getElementById("sportMaterialSelect");
  const provSelect = document.getElementById("sportProviderSelect");
  const matManual = document.getElementById("sportMaterialManual");
  const provManual = document.getElementById("sportProviderManual");
  try {
    const [materials, providers] = await Promise.all([fetchReferenceMaterials(), fetchReferenceProviders()]);
    sportMaterialRefOptions = materials.filter(m => m.category === "Flooring" || m.category === "Subfloor");
    sportProviderRefOptions = providers.filter(p => p.category === "Sports flooring & surfaces" || p.category === "Prefab hall construction");
    wireReferenceDropdown(matSelect, matManual, sportMaterialRefOptions, false);
    wireReferenceDropdown(provSelect, provManual, sportProviderRefOptions, false);
  } catch (err) {
    wireReferenceDropdown(matSelect, matManual, [], true);
    wireReferenceDropdown(provSelect, provManual, [], true);
  }
}
initSportReferenceDropdowns();

function buildSportPayload() {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const mat = MATERIALS[state.quality];
  const referenceMaterial = readReferenceSelection(document.getElementById("sportMaterialSelect"), document.getElementById("sportMaterialManual"), sportMaterialRefOptions);
  const referenceProvider = readReferenceSelection(document.getElementById("sportProviderSelect"), document.getElementById("sportProviderManual"), sportProviderRefOptions);
  return {
    version: "1.0", generator: "Sportify",
    quality_key: typeof getQualityKey === "function" ? getQualityKey(state.sport, state.variant, state.quality) : "",
    field: { sport: state.sport, variant: state.variant, norm: d.norm, dimensions: { length_m: d.l, width_m: d.w, runoff_m: d.runoff, min_height_m: d.h }, capacity: { seats: state.capacity, side_stands: state.capacity > 0 } },
    materials: { floor_surface: mat.floor, line_marking: mat.marking, gradin_type: mat.gradin, quality_level: state.quality, reference_material: referenceMaterial, reference_provider: referenceProvider },
    layers: ["field_boundary", "center_line", "center_circle", "goal_area", "penalty_area", "run_off_zone", "stands"],
  };
}

/**
 * Was referenced by the push-to-combine handler below but never defined
 * (typeof-guarded, so it silently fell back to {} instead of erroring) —
 * activity pieces exported with empty parameters ever since Activity
 * presets shipped. Mirrors buildSportPayload()/buildGardenPayload()'s
 * shape: same three universal materials fields (quality_level,
 * reference_material, reference_provider) as both, so this isn't a third
 * one-off shape. Activities have no reference-material picker in the UI
 * (only Sport/Garden do), so those two stay null rather than omitted.
 */
function buildActivityPayload() {
  const a = ACTIVITIES[state.activityId];
  const mat = ACTIVITY_MATERIALS[state.activityQuality];
  return {
    version: "1.0", generator: "Sportify",
    quality_key: typeof getActivityQualityKey === "function" ? getActivityQualityKey(state.activityId) : "",
    activity: {
      type_id: state.activityId,
      category: a.category,
      norm: a.norm,
      dimensions: { length_m: state.activityLength, width_m: state.activityWidth },
    },
    materials: { surface: mat.surface, structure: mat.structure, quality_level: state.activityQuality, reference_material: null, reference_provider: null },
  };
}

document.getElementById("btn-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(buildSportPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sportify_${state.sport}_${state.variant}.json`; a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("btn-dxf").addEventListener("click", () => {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const dxf = serialiseDXF(buildDXFEntities(d, state.sport, state.capacity));
  const blob = new Blob([dxf], { type: "application/dxf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_${state.sport}_${state.variant}.dxf`;
  a.click();
  URL.revokeObjectURL(a.href);
});

function buildDXFEntities(d, sport, capacity = 0) {
  const ro = d.runoff;
  const L  = d.l;
  const W  = d.w;
  let ox   = ro;
  let oy   = ro;
  const cx = ox + L / 2;
  const cy = oy + W / 2;
  const ents = [];

  function rect(layer, x, y, w, h) {
    ents.push(
      { type: "LINE", layer, x1: x,     y1: y,     x2: x + w, y2: y     },
      { type: "LINE", layer, x1: x + w, y1: y,     x2: x + w, y2: y + h },
      { type: "LINE", layer, x1: x + w, y1: y + h, x2: x,     y2: y + h },
      { type: "LINE", layer, x1: x,     y1: y + h, x2: x,     y2: y     },
    );
  }

  function line(layer, x1, y1, x2, y2)     { ents.push({ type: "LINE", layer, x1, y1, x2, y2 }); }
  function circle(layer, xcx, ycy, r)      { ents.push({ type: "CIRCLE", layer, cx: xcx, cy: ycy, r }); }
  function arc(layer, xcx, ycy, r, a1, a2) { ents.push({ type: "ARC", layer, cx: xcx, cy: ycy, r, a1, a2 }); }

  rect("run_off_zone", 0, 0, L + ro * 2, W + ro * 2);
  rect("field_boundary", ox, oy, L, W);
  line("center_line", cx, oy, cx, oy + W);

  switch (sport) {
    case "polyvalent":
      circle("center_circle", cx, cy, Math.min(L, W) * 0.1);
      circle("center_circle", cx, cy, 0.15);
      break;
    case "basketball":
      circle("center_circle", cx, cy, 1.80);
      circle("center_circle", cx, cy, 0.15);
      [ox, ox + L].forEach((baseX, side) => {
        const dir = side === 0 ? 1 : -1;
        rect("penalty_area", side === 0 ? baseX : baseX - 4.90, cy - 2.90, 4.90, 5.80);
        line("penalty_area", baseX + dir * 4.60, cy - 2.90, baseX + dir * 4.60, cy + 2.90);
        arc("penalty_spot", baseX + dir * 1.575, cy, 1.25, side === 0 ? -90 : 90, side === 0 ? 90 : 270);
        arc("service_box", baseX + dir * 1.575, cy, 6.75, side === 0 ? -70 : 110, side === 0 ? 70 : 250);
      });
      break;
    case "handball":
      [ox, ox + L].forEach((baseX, side) => {
        rect("goal_area", side === 0 ? baseX : baseX - 0.20, cy - 1.5, 0.20, 3.00);
        if (side === 0) arc("goal_area", baseX, cy, 6.00, -90, 90);
        else            arc("goal_area", baseX, cy, 6.00, 90, 270);
      });
      break;
    case "volleyball":
      line("penalty_area", cx - 3.00, oy, cx - 3.00, oy + W);
      line("penalty_area", cx + 3.00, oy, cx + 3.00, oy + W);
      break;
    case "badminton":
      line("service_box", ox, oy + W/2 - 1.98, ox + L, oy + W/2 - 1.98);
      break;
    case "football":
      [ox, ox + L].forEach((baseX, side) => {
        const dir = side === 0 ? 1 : -1;
        rect("goal_area", baseX + (dir > 0 ? 0 : -2.00), cy - 1.5, 2.00, 3.00);
        if (side === 0) arc("penalty_area", baseX, cy, 6.00, -90, 90);
        else            arc("penalty_area", baseX, cy, 6.00, 90, 270);
      });
      break;
  }
  return ents;
}

function serialiseDXF(entities) {
  const layerNames = [...new Set(entities.map(e => e.layer))];
  let dxf = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layerNames.length)].join("\n") + "\n";
  layerNames.forEach(name => { dxf += ["0", "LAYER", "2", name, "70", "0", "62", "7", "6", "CONTINUOUS"].join("\n") + "\n"; });
  dxf += ["0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"].join("\n") + "\n";
  entities.forEach(e => {
    const f = n => n.toFixed(4);
    if (e.type === "LINE") dxf += ["0", "LINE", "8", e.layer, "10", f(e.x1), "20", f(e.y1), "30", "0.0000", "11", f(e.x2), "21", f(e.y2), "31", "0.0000"].join("\n") + "\n";
    else if (e.type === "CIRCLE") dxf += ["0", "CIRCLE", "8", e.layer, "10", f(e.cx), "20", f(e.cy), "30", "0.0000", "40", f(e.r)].join("\n") + "\n";
    else if (e.type === "ARC") dxf += ["0", "ARC", "8", e.layer, "10", f(e.cx), "20", f(e.cy), "30", "0.0000", "40", f(e.r), "50", f(e.a1), "51", f(e.a2)].join("\n") + "\n";
  });
  dxf += ["0", "ENDSEC", "0", "EOF"].join("\n") + "\n";
  return dxf;
}

/* ── Activity Listeners & Exports ── */
document.getElementById("activityLength").addEventListener("input", e => { state.activityLength = Number(e.target.value) || ACTIVITIES[state.activityId].length; updateActivityUI(); });
document.getElementById("activityWidth").addEventListener("input", e => { state.activityWidth = Number(e.target.value) || ACTIVITIES[state.activityId].width; updateActivityUI(); });
document.getElementById("activityQuantity").addEventListener("input", e => { state.activityQuantity = Number(e.target.value); document.getElementById("qty-val").textContent = state.activityQuantity; updateActivityUI(); });
document.getElementById("btn-push-activity").addEventListener("click", () => {
  const a = ACTIVITIES[state.activityId];
  for (let i = 0; i < Math.max(1, state.activityQuantity); i++) {
    // We pass the full built payload into sourceJson so Combine can export it later
    const sourceJson = typeof buildActivityPayload === "function" ? buildActivityPayload() : {};
    addCombineItem({ kind: "activity", label: a.label, length_m: state.activityLength, width_m: state.activityWidth, sourceJson });
  }
  setMode("combine");
});

document.getElementById("btn-push-sport").addEventListener("click", () => {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  addCombineItem({ kind: "field", label: `${state.sport} (${state.variant})`, length_m: d.l + d.runoff * 2, width_m: d.w + d.runoff * 2, sourceJson: buildSportPayload() });
  setMode("combine");
});
