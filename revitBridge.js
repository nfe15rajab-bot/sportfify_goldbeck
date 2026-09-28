/**
 * revitBridge.js — Revit live-sync polling
 * Polls SportfyRevit's RoofBoundaryServer for a pushed roof boundary.
 * Split out of main.js since it's an independent, self-contained concern.
 */

const REVIT_POLL_MS = 2000;
let revitPollHandle = null;
let lastRevitPayloadStr = null;
// True from the first roof this session actually receives from a live Revit connection onward (sticky through a
// later reconnect, same as combineState.roof itself) — landingPreview3d.js's gate for showing the live 3D preview
// instead of the landing page's slideshow: "connected" alone isn't enough, since a freshly opened project with
// nothing pushed yet would otherwise show whatever roof combineState already held (a demo/autosave, not Revit's).
let revitRoofPushed = false;

function startRevitPolling() {
  if (revitPollHandle) return;
  pollRevitBoundary();
  refreshRoofPicker();
  revitPollHandle = setInterval(() => { pollRevitBoundary(); refreshRoofPicker(); }, REVIT_POLL_MS);
}

let lastRoofPickerStr = null;

/**
 * The roof picker beside the "Revit connected" pill: every roof pushed this Revit session (RoofBoundaryServer.ListRoofs, one per
 * distinct roof/floor element — a project can have several at different heights), shown only once there's more than one to choose
 * from. Picking a different one asks the add-in to make it active (POST /roofs/active), then re-polls the boundary right away so
 * the board updates without waiting out the next tick.
 */
async function refreshRoofPicker() {
  const picker = document.getElementById("roofPicker");
  if (!picker) return;
  let list;
  try {
    const res = await localFetch("/roofs");
    if (!res.ok) { picker.hidden = true; return; }
    list = (await res.json()).roofs || [];
  } catch (err) { picker.hidden = true; return; }

  if (list.length < 2) { picker.hidden = true; return; }

  const raw = JSON.stringify(list);
  if (raw === lastRoofPickerStr) { picker.hidden = false; return; }
  lastRoofPickerStr = raw;

  picker.innerHTML = list.map(r =>
    `<option value="${escapeHtml(r.id)}"${r.active ? " selected" : ""}>${escapeHtml(r.name)} (${r.length_m.toFixed(1)}×${r.width_m.toFixed(1)} m)</option>`
  ).join("");
  picker.hidden = false;
}

document.getElementById("roofPicker")?.addEventListener("change", async e => {
  const id = e.target.value;
  const res = await localFetch("/roofs/active?id=" + encodeURIComponent(id), { method: "POST" });
  if (!res.ok) { showToast("Couldn't switch roofs", "The add-in didn't accept that roof — try again."); refreshRoofPicker(); return; }
  lastRevitPayloadStr = null;      // force pollRevitBoundary to apply the newly active roof even if its JSON happens to match what's already on screen
  await pollRevitBoundary();
  await refreshRoofPicker();
});

async function pollRevitBoundary() {
  const statusEl = document.getElementById("import-revit-status");
  try {
    const res = await localFetch("/roof-boundary");      // localSession.js: the add-in's address and its session token
    if (!res.ok) {
      if(statusEl) statusEl.textContent = "Connected to Revit — waiting for a push.";
      return;
    }
    const data = await res.json();
    const raw = JSON.stringify(data);
    if (raw === lastRevitPayloadStr) return;
    lastRevitPayloadStr = raw;
    revitRoofPushed = true;

    const roof = data.roof;
    const footKey = r => JSON.stringify([r.length, r.width, r.boundary || null]);
    const oldFoot = footKey(combineState.roof);
    combineState.roof.length = roof.length_m;
    combineState.roof.width  = roof.width_m;
    combineState.roof.boundary = roof.boundary_m || null;
    combineState.roof.originXm = roof.origin_x_m ?? 0;
    combineState.roof.originYm = roof.origin_y_m ?? 0;
    // The plan follows the roof: how far it is turned from the model's axes (0 for a roof square to the model).
    combineState.roof.rotationDeg = roof.rotation_deg ?? 0;
    // Which parts of the model this roof has (the ribbon's "Push to Sportify" drop-down pushes them one at a time or all together).
    combineState.roof.pushedScope = Array.isArray(roof.pushed_scope) ? roof.pushed_scope : null;
    // Height of the pushed roof in the Revit project. Carried straight through
    // to the export so an import lands the layout ON the roof rather than at
    // Z=0 on the ground.
    combineState.roof.originZm = roof.origin_z_m ?? 0;
    // How high the roof stands above the ground, worked out by the Revit add-in (topography, else the lowest level).
    combineState.roof.heightAboveGroundM = roof.height_above_ground_m ?? 0;
    combineState.roof.heightSource = roof.height_source ?? "";
    // The structural grid and columns under the roof, already in canvas coordinates. A push replaces them (a different
    // roof has a different structure); the deck capacity is the designer's own entry and stays.
    if (typeof structureFromPayload === "function") combineState.structure = structureFromPayload(roof.structure);
    // The openings, entries, edge, drains, slab and levels the model has on this roof: a different roof has different ones, so a push replaces them.
    if (typeof roofFeaturesFromPayload === "function") combineState.roofFeatures = roofFeaturesFromPayload(roof.features);
    if (typeof updateSiteUI === "function") updateSiteUI();
    if (typeof updateRevitLayersUI === "function") updateRevitLayersUI();       // what Revit has pushed, layer by layer
    document.getElementById("roofLength").value = roof.length_m;
    document.getElementById("roofWidth").value  = roof.width_m;

    const turned = Math.abs(roof.rotation_deg || 0) > 0.01 ? ` (the roof is turned ${(+roof.rotation_deg).toFixed(1)}° against the Revit model; the plan follows it)` : "";
    const detail = (roof.source_element_name
      ? `${roof.length_m}m × ${roof.width_m}m from "${roof.source_element_name}"`
      : `${roof.length_m}m × ${roof.width_m}m`) + turned;

    if (statusEl) statusEl.textContent = `🔄 Live from Revit: ${detail}.`;
    showToast("Roof boundary pushed from Revit", detail + (activeMode !== "combine" ? " — switch to Combine to view." : ""));
    // a footprint has arrived: remember it came from Revit and, if the roof has no type yet, ask for one (Sports Core / Garden Core / Mixed)
    if (typeof roofProgramOnFootprint === "function") roofProgramOnFootprint("revit", detail);
    // a NEW footprint gets the default green roof in its setback (gardenPresets.js); the same roof arriving again (a page reload, a resumed session) does not
    if (footKey(combineState.roof) !== oldFoot && typeof defaultSetbackBeds === "function") defaultSetbackBeds();

    if (activeMode === "combine") {
      if (typeof refreshSuggestions === "function") refreshSuggestions();
      else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    }
    if (typeof landingPreview3dCheck === "function") landingPreview3dCheck();
  } catch (err) {
    if(statusEl) statusEl.textContent = "Revit not open. Import an exported file, or enter the size by hand.";
  }
}
