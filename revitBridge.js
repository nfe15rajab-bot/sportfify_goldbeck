/**
 * revitBridge.js — Revit live-sync polling
 * Polls SportfyRevit's RoofBoundaryServer for a pushed roof boundary.
 * Split out of main.js since it's an independent, self-contained concern.
 */

const REVIT_BOUNDARY_URL = "http://localhost:5679/roof-boundary";
const REVIT_COMBINED_LAYOUT_URL = "http://localhost:5679/combined-layout";
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
    if (typeof updateSiteUI === "function") updateSiteUI();
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
