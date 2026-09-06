/**
 * main.js — Sportify app controller
 * Manages UI state, wires up all events, and handles JSON/DXF export.
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

const gardenState = {
  activeItemId: "parcel",
  themeId: "custom",
  length: 10.0,
  width: 6.0,
  quantity: 1,
  quality: "medium"
};

/* ── Planner / Client role ──
 * Planner = full manual control (raw dimensions, drag/rotate, rule
 * tuning, CAD exports). Client = curates what goes in (sports, garden
 * style, entrances) and lets the rule engine arrange it — no fine manual
 * control. Gated purely client-side via html[data-role]; see style.css
 * for the .planner-only hide rule.
 */
document.documentElement.dataset.role = "planner";

const FIELD_SPORTS = {
  polyvalent: { label: "Polyvalent (multi-sport)", short: "Poly", icon: "ti-square-rounded" },
  basketball: { label: "Basketball", short: "B-Ball", icon: "ti-square-rounded" },
  handball:   { label: "Handball", short: "Handb.", icon: "ti-square-rounded" },
  volleyball: { label: "Volleyball", short: "V-Ball", icon: "ti-square-rounded" },
  badminton:  { label: "Badminton", short: "Badm.", icon: "ti-square-rounded" },
  football:   { label: "Football (indoor)", short: "Football", icon: "ti-square-rounded" },
};

function isDarkMode() {
  return document.documentElement.dataset.mode === "dark" || window.matchMedia("(prefers-color-scheme: dark)").matches;
}

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

function updateActivityBarForMode(mode) {
  const bar = document.getElementById("activity-bar");
  if (mode !== "garden") return;
  
  let html = `<div class="rail-cat-header">FUNC</div>`;
  Object.entries(GARDEN_ITEMS).forEach(([id, item]) => {
    if (item.category !== "functional") return;
    html += `<button class="activity-icon${id === gardenState.activeItemId ? " active" : ""}" data-garden-id="${id}" title="${item.label}">
               <i class="ti ${item.icon}"></i><span class="activity-icon-label">${item.short}</span>
             </button>`;
  });
  html += `<div class="activity-bar-divider"></div><div class="rail-cat-header">VEG</div>`;
  Object.entries(GARDEN_ITEMS).forEach(([id, item]) => {
    if (item.category !== "vegetation") return;
    html += `<button class="activity-icon${id === gardenState.activeItemId ? " active" : ""}" data-garden-id="${id}" title="${item.label}">
               <i class="ti ${item.icon}"></i><span class="activity-icon-label">${item.short}</span>
             </button>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll("[data-garden-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll("[data-garden-id]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      gardenState.activeItemId = btn.dataset.gardenId;
      
      const referenceItem = GARDEN_ITEMS[gardenState.activeItemId];
      gardenState.length = referenceItem.defaultLength;
      gardenState.width = referenceItem.defaultWidth;
      document.getElementById("gardenLength").value = referenceItem.defaultLength;
      document.getElementById("gardenWidth").value = referenceItem.defaultWidth;
      
      updateGardenUI();
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

function buildSportPayload() {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  const mat = MATERIALS[state.quality];
  return {
    version: "1.0", generator: "Sportify",
    quality_key: typeof getQualityKey === "function" ? getQualityKey(state.sport, state.variant, state.quality) : "",
    field: { sport: state.sport, variant: state.variant, norm: d.norm, dimensions: { length_m: d.l, width_m: d.w, runoff_m: d.runoff, min_height_m: d.h }, capacity: { seats: state.capacity, side_stands: state.capacity > 0 } },
    materials: { floor_surface: mat.floor, line_marking: mat.marking, gradin_type: mat.gradin, quality_level: state.quality },
    layers: ["field_boundary", "center_line", "center_circle", "goal_area", "penalty_area", "run_off_zone", "stands"],
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

/* ── Mode Switching ── */
document.getElementById("modeGuide").addEventListener("click", () => setMode("guide"));
document.getElementById("modeSport").addEventListener("click", () => setMode("sport"));
document.getElementById("modeGarden").addEventListener("click", () => setMode("garden"));
document.getElementById("modeCombine").addEventListener("click", () => setMode("combine"));
document.getElementById("modeData").addEventListener("click", () => setMode("data"));
document.getElementById("btn-guide-start").addEventListener("click", () => setMode("sport"));

function setMode(mode) {
  const isGarden = mode === "garden";
  const isSport = mode === "sport";
  const isCombine = mode === "combine";
  const isData = mode === "data";
  const isGuide = mode === "guide";

  if (isGarden) updateActivityBarForMode("garden");
  else if (isSport) buildActivityBar();

  // Warm accent for Sport (energetic court sports), green for Garden
  // (nature) — see the html[data-app-mode] rules in style.css. Combine/Data
  // don't match either selector, so they fall through to the neutral
  // default accent unchanged.
  document.documentElement.dataset.appMode = mode;

  // Combine, Data, and Guide have no per-sport icon rail; Combine also has
  // no use for the sidebar (its panel content lives beside the roof in
  // .canvas-area instead), so collapse it there and give that space to
  // the canvas instead of leaving it empty. Data and Guide keep the
  // sidebar hidden too — neither has any sidebar controls to show.
  document.getElementById("activity-bar").style.display = (isCombine || isData || isGuide) ? "none" : "flex";
  document.querySelector(".panel").style.display = (isCombine || isGuide) ? "none" : "flex";

  document.getElementById("sportConfigurator").style.display = isSport ? "block" : "none";
  document.getElementById("gardenConfigurator").style.display = isGarden ? "block" : "none";
  // combineConfigurator is itself a flex row (roof pane + step pane) now,
  // so it needs "flex" rather than "block" to lay its children out
  // correctly whenever it's re-shown.
  document.getElementById("combineConfigurator").style.display = isCombine ? "flex" : "none";
  document.getElementById("dataConfigurator").style.display = isData ? "block" : "none";

  document.getElementById("field").style.display = isSport ? "block" : "none";
  document.getElementById("garden-field").style.display = isGarden ? "block" : "none";
  // #combine-canvas is nested inside #combineConfigurator now, so toggling
  // that parent already shows/hides it — no separate toggle needed here.
  document.getElementById("data-content").style.display = isData ? "block" : "none";
  document.getElementById("guide-content").style.display = isGuide ? "block" : "none";

  document.getElementById("modeGuide").classList.toggle("active", isGuide);
  document.getElementById("modeSport").classList.toggle("active", isSport);
  document.getElementById("modeGarden").classList.toggle("active", isGarden);
  document.getElementById("modeCombine").classList.toggle("active", isCombine);
  document.getElementById("modeData").classList.toggle("active", isData);

  // Explicit branch per mode — a bare `else` here previously meant "anything
  // that isn't garden/sport" silently ran updateCombineUI(), which broke the
  // instant a 4th mode existed. Guide is static markup — nothing to update.
  if (isGarden) updateGardenUI();
  else if (isSport) updateUI();
  else if (isCombine) updateCombineUI();
  else if (isData && typeof updateDataUI === "function") updateDataUI();

  activeMode = mode;
}

/* ── Role toggle (Planner / Client) ──
 * Swaps a handful of button/label captions to friendlier client-facing
 * text and disables (not hides) the design-rule number inputs so a
 * client can still see *why* a layout looks the way it does without
 * being able to change the thresholds. Hiding the deeper technical
 * controls (raw dimensions, drag/rotate, CAD exports) is handled purely
 * in CSS via the .planner-only class — see style.css.
 */
function applyRoleLabels(role) {
  document.querySelectorAll("[data-client-label]").forEach(el => {
    if (!el.dataset.plannerLabel) el.dataset.plannerLabel = el.textContent;
    el.textContent = role === "client" ? el.dataset.clientLabel : el.dataset.plannerLabel;
  });
}

function setRole(role) {
  document.documentElement.dataset.role = role;
  document.getElementById("rolePlanner").classList.toggle("active", role === "planner");
  document.getElementById("roleClient").classList.toggle("active", role === "client");
  applyRoleLabels(role);
  document.querySelectorAll(".rule-input").forEach(el => { el.disabled = role !== "planner"; });
  if (activeMode === "combine" && typeof drawCombineCanvas === "function") drawCombineCanvas();
  showToast(
    role === "client" ? "Client mode" : "Planner mode",
    role === "client"
      ? "Pick your sports, garden style, and entrances — the rules handle the rest."
      : "Full manual control unlocked — fine-tune placement and design rules."
  );
}
document.getElementById("rolePlanner").addEventListener("click", () => setRole("planner"));
document.getElementById("roleClient").addEventListener("click", () => setRole("client"));

/* ── Revit Live Sync Bridge ── */
let activeMode = "sport"; // Declared ONCE here!
const REVIT_BOUNDARY_URL = "http://localhost:5679/roof-boundary";
const REVIT_POLL_MS = 2000;
let revitPollHandle = null;
let lastRevitPayloadStr = null;

function startRevitPolling() {
  if (revitPollHandle) return;
  pollRevitBoundary();
  revitPollHandle = setInterval(pollRevitBoundary, REVIT_POLL_MS);
}

async function pollRevitBoundary() {
  const statusEl = document.getElementById("import-revit-status");
  try {
    const res = await fetch(REVIT_BOUNDARY_URL, { cache: "no-store" });
    if (!res.ok) {
      if(statusEl) statusEl.textContent = "Connected to Revit — waiting for a push.";
      return;
    }
    const data = await res.json();
    const raw = JSON.stringify(data);
    if (raw === lastRevitPayloadStr) return;
    lastRevitPayloadStr = raw;

    const roof = data.roof;
    combineState.roof.length = roof.length_m;
    combineState.roof.width  = roof.width_m;
    combineState.roof.boundary = roof.boundary_m || null;
    combineState.roof.originXm = roof.origin_x_m ?? 0;
    combineState.roof.originYm = roof.origin_y_m ?? 0;
    document.getElementById("roofLength").value = roof.length_m;
    document.getElementById("roofWidth").value  = roof.width_m;

    const detail = roof.source_element_name
      ? `${roof.length_m}m × ${roof.width_m}m from "${roof.source_element_name}"`
      : `${roof.length_m}m × ${roof.width_m}m`;

    if (statusEl) statusEl.textContent = `🔄 Live from Revit: ${detail}.`;
    showToast("Roof boundary pushed from Revit", detail + (activeMode !== "combine" ? " — switch to Combine to view." : ""));

    if (activeMode === "combine") {
      if (typeof refreshSuggestions === "function") refreshSuggestions();
      else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    }
  } catch (err) {
    if(statusEl) statusEl.textContent = "Not connected to Revit — use manual import below.";
  }
}

/* ── Garden Configurator ── */
function updateGardenUI() {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  const theme = GARDEN_THEMES[gardenState.themeId];
  
  document.getElementById("field-label").textContent = `${item.label} — Theme: ${theme.label}`;
  document.getElementById("norm-badge").textContent  = item.norm;
  document.getElementById("theme-desc").textContent = theme.description;

  document.getElementById("garden-layer-dims").innerHTML = Object.entries(theme.layers).map(([key, layer]) => `
    <div class="dim-card"><div class="val">${(layer.thickness_m * 100).toFixed(0)} cm</div><div class="lbl">${layer.material}</div></div>
  `).join("");

  if(typeof drawGardenField === "function") drawGardenField(gardenState.activeItemId, gardenState.length, gardenState.width, isDarkMode());
}

document.getElementById("gardenTheme").addEventListener("change", e => { gardenState.themeId = e.target.value; updateGardenUI(); });
document.getElementById("gardenLength").addEventListener("input", e => { gardenState.length = Number(e.target.value) || 1; updateGardenUI(); });
document.getElementById("gardenWidth").addEventListener("input", e => { gardenState.width = Number(e.target.value) || 1; updateGardenUI(); });
document.getElementById("gardenQuantity").addEventListener("input", e => { gardenState.quantity = Number(e.target.value); document.getElementById("garden-qty-val").textContent = gardenState.quantity; });
document.querySelectorAll("#garden-quality-setting .q-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#garden-quality-setting .q-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); gardenState.quality = btn.dataset.q;
  });
});

function buildGardenPayload() {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  const theme = GARDEN_THEMES[gardenState.themeId];
  const mat = GARDEN_MATERIALS[gardenState.quality];

  return {
    version: "1.0",
    generator: "Sportify-Garden-Engine",
    quality_key: typeof getGardenQualityKey === "function" ? getGardenQualityKey(gardenState.activeItemId, gardenState.themeId, gardenState.quality) : "",
    garden: {
      type_id: gardenState.activeItemId,
      category: item.category,
      theme: gardenState.themeId,
      dimensions: { length_m: gardenState.length, width_m: gardenState.width },
      layers: Object.entries(theme.layers).map(([name, config]) => ({
        layer_name: name, thickness_m: config.thickness_m, material: config.material
      })),
      materials: { waterproofing: mat.waterproofing, drainage: mat.drainage, quality_level: gardenState.quality }
    }
  };
}

document.getElementById("btn-garden-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(buildGardenPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `garden_${gardenState.activeItemId}_${gardenState.themeId}.json`; a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("btn-push-garden").addEventListener("click", () => {
  const item = GARDEN_ITEMS[gardenState.activeItemId];
  for (let i = 0; i < Math.max(1, gardenState.quantity); i++) {
    addCombineItem({ kind: "garden", label: `${item.short} (${gardenState.themeId})`, length_m: gardenState.length, width_m: gardenState.width, sourceJson: buildGardenPayload() });
  }
  setMode("combine");
});

/* ── Combine Board Core ── */
const combineState = {
  roof: { length: 15, width: 10, boundary: null, originXm: 0, originYm: 0 },
  items: [], entryPoints: [], selectedId: null, selectedKind: null, tool: null,
  suggestions: [],
};
let combineItemCounter = 0;

const siteState = { lat: null, lng: null, address: "", northDeg: 0, date: null, time: "12:00" };

/**
 * ── Combine wizard: step-by-step panel navigation ──
 * The DOM itself is the source of truth for which step is showing (each
 * step's hidden attribute), so nothing needs to re-sync this on mode
 * switches — the panel is left exactly as the user left it.
 */
const WIZARD_STEPS = 4;
let combineWizardStep = 1;
const wizardStepsVisited = new Set([1]);

function setWizardStep(n) {
  combineWizardStep = Math.max(1, Math.min(WIZARD_STEPS, n));
  wizardStepsVisited.add(combineWizardStep);
  document.querySelectorAll(".wizard-step-content").forEach(el => {
    const isCurrent = Number(el.dataset.stepContent) === combineWizardStep;
    el.hidden = !isCurrent;
    if (isCurrent) {
      // Restart the fade-in on every step change, not just first reveal —
      // same reflow trick used for the rules panel / score badge pops.
      el.classList.remove("step-enter");
      void el.offsetWidth;
      el.classList.add("step-enter");
    }
  });
  document.querySelectorAll(".wizard-step-btn").forEach(btn => {
    const step = Number(btn.dataset.step);
    btn.classList.toggle("active", step === combineWizardStep);
    btn.classList.toggle("visited", wizardStepsVisited.has(step) && step !== combineWizardStep);
  });
  document.getElementById("wizard-back").style.display = combineWizardStep === 1 ? "none" : "flex";
  document.getElementById("wizard-next").style.display = combineWizardStep === WIZARD_STEPS ? "none" : "flex";
}

document.getElementById("wizard-nav").addEventListener("click", e => {
  const btn = e.target.closest(".wizard-step-btn");
  if (btn) setWizardStep(Number(btn.dataset.step));
});
document.getElementById("wizard-back").addEventListener("click", () => setWizardStep(combineWizardStep - 1));
document.getElementById("wizard-next").addEventListener("click", () => setWizardStep(combineWizardStep + 1));
setWizardStep(1);

function addCombineItem({ kind, label, length_m, width_m, sourceJson }) {
  const index = combineItemCounter++;
  const item = {
    id: `item_${Date.now()}_${index}`, kind, label, length_m: Number(length_m), width_m: Number(width_m), rotation: 0,
    x_m: 0.5 + (index % 5) * 1.2, y_m: 0.5 + Math.floor(index / 5) * 1.2, sourceJson,
  };
  combineState.items.push(item);
  combineState.selectedId = item.id;
  combineState.selectedKind = "item";
  return item;
}

document.getElementById("btn-push-sport").addEventListener("click", () => {
  const d = FIELDS[state.sport]?.[state.variant] || FIELDS.polyvalent.mini;
  addCombineItem({ kind: "field", label: `${state.sport} (${state.variant})`, length_m: d.l + d.runoff * 2, width_m: d.w + d.runoff * 2, sourceJson: buildSportPayload() });
  setMode("combine");
});

function updateCombineUI() {
  document.getElementById("field-label").textContent = "Combine — roof layout";
  document.getElementById("norm-badge").textContent  = "Prototype";
  if(typeof initSiteMap === "function") initSiteMap();
  if(typeof drawCombineCanvas === "function") drawCombineCanvas();
  if(typeof refreshSuggestions === "function") refreshSuggestions();
}

/** Recomputes suggested spots for whichever item is currently selected (none selected → empty list), then redraws. */
function refreshSuggestions() {
  const item = combineState.selectedKind === "item" ? combineState.items.find(i => i.id === combineState.selectedId) : null;
  combineState.suggestions = item && typeof suggestPositionsForItem === "function" ? suggestPositionsForItem(item, combineState, DESIGN_RULES) : [];
  if (typeof drawCombineCanvas === "function") drawCombineCanvas();
}

function applySuggestion(index) {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  const cand = combineState.suggestions[index];
  if (!item || !cand) return;
  // Rotation swaps the rendered footprint immediately (animateItemsTo only
  // tweens x/y), then the move itself eases into place — same tween used
  // for auto-arrange, so applying a suggestion reads as a deliberate slide
  // rather than a jump-cut.
  item.rotation = cand.rotation;
  animateItemsTo(new Map([[item.id, { x: cand.x_m, y: cand.y_m }]]), () => {
    refreshSuggestions();
    showToast("Suggestion applied", cand.reason);
  });
}

/**
 * Raises DESIGN_RULES to at least the area-aware recommendation (never
 * lowers a value the planner already set higher) and reflects the new
 * values in the rule inputs immediately — same pattern as any other
 * DESIGN_RULES mutation in this file.
 */
function applySmartRuleRecommendation(rec) {
  DESIGN_RULES.minEntryPoints = Math.max(DESIGN_RULES.minEntryPoints, rec.minEntryPoints);
  DESIGN_RULES.circulationWidth_m = Math.max(DESIGN_RULES.circulationWidth_m, rec.circulationWidth_m);
  document.getElementById("ruleMinEntries").value = DESIGN_RULES.minEntryPoints;
  document.getElementById("ruleCirculationWidth").value = DESIGN_RULES.circulationWidth_m;
  if (typeof refreshSuggestions === "function") refreshSuggestions();
  else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  showToast("Smart rules applied", `Circulation width and minimum entries raised for ~${rec.totalAreaM2} m² programmed.`);
}

/** Refreshes the site-location readout + sun compass/summary from siteState — mirrors updateGardenUI/updateCombineUI's role for the new Site & Sun panel. */
function updateSiteUI() {
  const coordsEl = document.getElementById("site-coords-status");
  if (coordsEl) {
    coordsEl.textContent = siteState.lat == null
      ? "No location set — click the map to place the site."
      : `${siteState.lat.toFixed(5)}, ${siteState.lng.toFixed(5)}${siteState.address ? " — " + siteState.address : ""}`;
  }
  const summaryEl = document.getElementById("sun-summary");
  if (summaryEl) {
    const sun = typeof getSunPosition === "function" ? getSunPosition(siteState) : null;
    if (!sun) {
      summaryEl.textContent = "Set a site location to see sun position and shading guidance.";
    } else {
      const times = typeof getSunTimes === "function" ? getSunTimes(siteState) : null;
      const fmt = t => t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
      summaryEl.textContent = sun.altitudeDeg > 0
        ? `Sun at ${Math.round(sun.azimuthDeg)}° azimuth, ${Math.round(sun.altitudeDeg)}° above horizon. Sunrise ${fmt(times?.sunrise)}, sunset ${fmt(times?.sunset)}.`
        : `Sun is below the horizon at this time. Sunrise ${fmt(times?.sunrise)}, sunset ${fmt(times?.sunset)}.`;
    }
  }
  if (typeof drawSunCompass === "function") drawSunCompass(siteState);
}

document.getElementById("siteNorthDeg").addEventListener("input", e => {
  siteState.northDeg = Number(e.target.value) || 0;
  document.getElementById("site-north-val").textContent = `${siteState.northDeg}°`;
  updateSiteUI();
});
document.getElementById("siteDate").addEventListener("input", e => { siteState.date = e.target.value; updateSiteUI(); });
document.getElementById("siteTime").addEventListener("input", e => { siteState.time = e.target.value; updateSiteUI(); });

function doSiteAddressSearch() {
  const q = document.getElementById("siteAddressSearch").value.trim();
  if (q && typeof searchAddress === "function") searchAddress(q);
}
document.getElementById("btn-site-search").addEventListener("click", doSiteAddressSearch);
document.getElementById("siteAddressSearch").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); doSiteAddressSearch(); }
});
document.getElementById("btn-site-geolocate").addEventListener("click", () => { if (typeof useMyLocation === "function") useMyLocation(); });

document.getElementById("roofLength").addEventListener("input", e => { combineState.roof.length = Number(e.target.value) || 1; combineState.roof.boundary = null; combineState.roof.originXm = 0; combineState.roof.originYm = 0; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });
document.getElementById("roofWidth").addEventListener("input", e => { combineState.roof.width = Number(e.target.value) || 1; combineState.roof.boundary = null; combineState.roof.originXm = 0; combineState.roof.originYm = 0; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });

// Manual Revit Import 
document.getElementById("btn-import-revit").addEventListener("click", () => { document.getElementById("import-revit-file").click(); });

document.getElementById("import-revit-file").addEventListener("change", e => {
  const file = e.target.files[0];
  const statusEl = document.getElementById("import-revit-status");
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      const roof = data.roof;
      combineState.roof.length = roof.length_m;
      combineState.roof.width  = roof.width_m;
      combineState.roof.boundary = roof.boundary_m || null;
      combineState.roof.originXm = roof.origin_x_m ?? 0;
      combineState.roof.originYm = roof.origin_y_m ?? 0;
      document.getElementById("roofLength").value = roof.length_m;
      document.getElementById("roofWidth").value  = roof.width_m;
      
      if(statusEl) statusEl.textContent = `Imported ${roof.length_m}m × ${roof.width_m}m from Revit.`;
      if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas();
    } catch (err) {
      if(statusEl) statusEl.textContent = `Import failed: ${err.message}`;
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // Fix: allows re-importing the same file
});

document.getElementById("btn-rotate").addEventListener("click", () => {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  if (item) { item.rotation = (item.rotation + 90) % 180; if(typeof drawCombineCanvas === "function") drawCombineCanvas(); }
});
document.getElementById("btn-remove-selected").addEventListener("click", () => {
  if (!combineState.selectedId) return;
  if (combineState.selectedKind === "entry") {
    combineState.entryPoints = combineState.entryPoints.filter(e => e.id !== combineState.selectedId);
  } else {
    combineState.items = combineState.items.filter(i => i.id !== combineState.selectedId);
  }
  combineState.selectedId = null;
  combineState.selectedKind = null;
  if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas();
});
document.getElementById("btn-clear-all").addEventListener("click", () => { combineState.items = []; combineState.selectedId = null; combineState.selectedKind = null; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });

function autoPlace(direction) {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  if (!item) return;
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  switch (direction) {
    case "left":   item.x_m = 0; break;
    case "right":  item.x_m = Math.max(0, combineState.roof.length - fp.w); break;
    case "front":  item.y_m = Math.max(0, combineState.roof.width - fp.h); break;
    case "behind": item.y_m = 0; break;
  }
  if(typeof drawCombineCanvas === "function") drawCombineCanvas();
}
document.getElementById("btn-auto-left").addEventListener("click", () => autoPlace("left"));
document.getElementById("btn-auto-right").addEventListener("click", () => autoPlace("right"));
document.getElementById("btn-auto-front").addEventListener("click", () => autoPlace("front"));
document.getElementById("btn-auto-behind").addEventListener("click", () => autoPlace("behind"));

/* ── Entry point tool ── */
document.getElementById("btn-add-entry").addEventListener("click", () => {
  combineState.tool = combineState.tool === "addEntry" ? null : "addEntry";
  syncAddEntryTool();
});

/* ── Design rules panel — planner tunes the thresholds, client sees them applied (inputs disabled via setRole) ── */
function bindRuleInput(id, key, parse) {
  document.getElementById(id).addEventListener("input", e => {
    const v = (parse || Number)(e.target.value);
    if (!Number.isFinite(v) || v < 0) return;
    DESIGN_RULES[key] = v;
    if (activeMode !== "combine") return;
    if (typeof refreshSuggestions === "function") refreshSuggestions();
    else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  });
}
bindRuleInput("ruleClearance", "clearance_m");
bindRuleInput("ruleSetback", "boundarySetback_m");
bindRuleInput("ruleCirculationWidth", "circulationWidth_m");
bindRuleInput("ruleMinEntries", "minEntryPoints", v => Math.max(1, Math.round(Number(v))));

/* ── Generate Layout: rule-based auto-arrange, tweened into place ── */
function animateItemsTo(placements, onDone) {
  const items = combineState.items.filter(it => placements.has(it.id));
  if (items.length === 0) { if (onDone) onDone(); return; }
  const from = new Map(items.map(it => [it.id, { x: it.x_m, y: it.y_m }]));
  const duration = 500;
  const start = performance.now();
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    items.forEach(it => {
      const f = from.get(it.id), to = placements.get(it.id);
      it.x_m = Math.round((f.x + (to.x - f.x) * k) * 10) / 10;
      it.y_m = Math.round((f.y + (to.y - f.y) * k) * 10) / 10;
    });
    if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    if (t < 1) requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

document.getElementById("btn-auto-arrange").addEventListener("click", () => {
  if (combineState.items.length === 0) { showToast("Nothing to arrange", "Push a sport, activity, or garden piece first."); return; }

  const { placements, unplaced } = ruleBasedArrange(combineState, DESIGN_RULES);

  animateItemsTo(placements, () => {
    // animateItemsTo's own frame loop already redraws every tick, but it
    // never recomputes combineState.suggestions — refresh once here so a
    // stale candidate list doesn't linger after positions moved.
    if (typeof refreshSuggestions === "function") refreshSuggestions();
    if (unplaced.length > 0) {
      showToast("Layout generated", `${unplaced.length} piece(s) didn't fit their zone — try a larger site or fewer pieces.`);
      return;
    }
    const overlaps = findOverlappingIds(combineState.items, DESIGN_RULES.clearance_m);
    const circulation = computeCirculation(combineState, DESIGN_RULES);
    const allGood = overlaps.size === 0 && circulation.unreachable.size === 0 && combineState.entryPoints.length >= DESIGN_RULES.minEntryPoints;
    if (allGood) {
      showToast("Layout generated 🎉", "All rules satisfied — sports and gardens arranged with clear circulation.");
      if (typeof spawnConfetti === "function") spawnConfetti();
    } else if (combineState.entryPoints.length < DESIGN_RULES.minEntryPoints) {
      showToast("Layout generated", "Add an entry point so circulation can be checked.");
    } else {
      showToast("Layout generated", "Some rules still need attention — check the checklist below.");
    }
  });
});

/* ── Combined JSON export (Revit Optimized) ── */
document.getElementById("btn-combine-json").addEventListener("click", () => {
  if (combineState.items.length === 0) return;

  const placements = combineState.items.map(item => {
    const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };

    return {
      id: item.id,
      category: item.kind, // "field", "activity", or "garden"
      label: item.label,
      
      // Revit Family placement is usually easiest via the Center Point
      insertion_point: {
        center_x_m: item.x_m + (fp.w / 2),
        center_y_m: item.y_m + (fp.h / 2)
      },

      // Bounding box (Top-Left origin, Web Canvas space)
      bounding_box: {
        top_left_x_m: item.x_m,
        top_left_y_m: item.y_m,
        width_m: fp.w,
        height_m: fp.h
      },

      transform: {
        rotation_deg: item.rotation
      },

      // Deep parameters mapped from the sidebars
      parameters: item.sourceJson
    };
  });

  const payload = {
    version: "1.1",
    generator: "Sportify-Combine",
    roof_context: {
      length_m: combineState.roof.length,
      width_m: combineState.roof.width,
      source_boundary_polygon: combineState.roof.boundary || null,
      // World-space position (meters) of this roof's real origin in the
      // Revit project — lets an import command translate placements onto
      // the actual pushed element instead of world (0,0). Both 0 if the
      // roof was set manually rather than pushed from Revit.
      world_origin_x_m: combineState.roof.originXm || 0,
      world_origin_y_m: combineState.roof.originYm || 0
    },
    placements
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_combined_revit.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ── Data tab: domain switch + search — render/fetch logic lives in dataTab.js ── */
document.getElementById("data-domain-btns").addEventListener("click", e => {
  const btn = e.target.closest(".q-btn");
  if (btn && typeof setDataDomain === "function") setDataDomain(btn.dataset.domain);
});
document.getElementById("dataSearch").addEventListener("input", e => {
  if (typeof setDataSearch === "function") setDataSearch(e.target.value);
});

function showToast(title, message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${message}</div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ── Init ── */
buildActivityBar();
siteState.date = typeof todayIsoDate === "function" ? todayIsoDate() : siteState.date;
document.getElementById("siteDate").value = siteState.date;
setMode("guide");
if(typeof initCombineInteractions === "function") initCombineInteractions();
if(typeof updateSiteUI === "function") updateSiteUI();
startRevitPolling();