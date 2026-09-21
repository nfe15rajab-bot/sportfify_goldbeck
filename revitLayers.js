/**
 * revitLayers.js — Combine's "Revit layers" switch: what the Revit model has, drawn over the roof only when you turn it on.
 *
 * The Revit add-in's "Push to Sportify" drop-down (and a selection made in Revit: selected grid lines, columns, beams, walls, stairs, lifts, doors and ramps
 * are pushed instead of everything of that kind) sends the roof's boundary, structural grid and columns, beams and bearing walls, entries (stairs, lifts, doors,
 * ramps), openings, edge, walls on the roof, equipment and drains. revitBridge.js takes them in as they arrive and the analyses use them whether they are drawn or
 * not; this file only decides what is DRAWN in Combine, layer by layer, because the structure in particular makes a busy plan busier.
 *
 * Off by default. The panel also carries the way on: what Revit has pushed, the results and the settings that came back from it, the Run analysis button and the
 * way to the Deliverables tab, so the loop (select in Revit, see the layers, run the analysis, read the results, take the deliverables) is in one place.
 */

/**
 * key, short label, colour, whether it is drawn when the switch is turned on (the structure is opt-in: its grid and columns cover the plan),
 * how many of it Revit pushed and what exactly (for the tooltip).
 */
const REVIT_LAYERS = [
  { key: "boundary", label: "Roof boundary", color: "#2563eb", on: true, n: () => (combineState.roof.boundary || []).length >= 3 ? combineState.roof.boundary.length : 0, detail: n => `${n} corners` },
  { key: "structure", label: "Grid and columns", color: "#5b8def", on: false, n: () => { const s = combineState.structure; return s ? s.gridLines.length + s.columns.length : 0; }, detail: () => { const s = combineState.structure; return `${s.gridLines.length} grid lines, ${s.columns.length} columns`; } },
  { key: "beams_walls", label: "Beams, bearing walls", color: "#b45309", on: false, n: () => { const s = combineState.structure; return s ? (s.beams || []).length + (s.walls || []).length : 0; }, detail: () => { const s = combineState.structure; return `${(s.beams || []).length} beams, ${(s.walls || []).length} walls`; } },
  { key: "stairs", label: "Stairs", color: "#7c3aed", on: true, n: () => entryCount("stair") },
  { key: "lifts", label: "Lifts", color: "#0f766e", on: true, n: () => entryCount("core") },
  { key: "doors", label: "Entry doors", color: "#b45309", on: true, n: () => entryCount("door") },
  { key: "ramps", label: "Ramps", color: "#16a34a", on: true, n: () => entryCount("ramp") },
  { key: "openings", label: "Openings", color: "#dc2626", on: true, n: () => featureCount("openings") },
  { key: "edge", label: "Roof edge", color: "#374151", on: true, n: () => featureCount("edges"), detail: n => `${n} stretches (parapet, railing, open)` },
  { key: "obstacles", label: "Walls on the roof", color: "#57534e", on: true, n: () => featureCount("obstacles") },
  { key: "equipment", label: "Equipment", color: "#0e7490", on: true, n: () => featureCount("equipment") },
  { key: "drains", label: "Drains", color: "#2563eb", on: true, n: () => featureCount("drains") }
];

function entryCount(kind) {
  const f = combineState.roofFeatures;
  return f ? f.entries.filter(e => e.kind === kind).length : 0;
}

function featureCount(name) {
  const f = combineState.roofFeatures;
  return f && Array.isArray(f[name]) ? f[name].length : 0;
}

/** Whether a layer is drawn on the Combine canvas: the switch is on, and the layer is not switched off. */
function revitLayerShown(key) {
  const L = combineState.revitLayers;
  if (!L || !L.on) return false;
  const v = L.shown[key];
  if (v !== undefined) return !!v;
  const def = REVIT_LAYERS.find(l => l.key === key);
  return def ? def.on : true;
}

/** The roof's outline as Revit gave it, over the plain dashed one: solid, with its corners and the length of each side. */
function revitBoundarySvg(scale, roofOx, roofOy) {
  const roof = combineState.roof;
  if (!revitLayerShown("boundary") || !roof.boundary || roof.boundary.length < 3) return "";
  const P = roof.boundary.map(p => ({ x: roofOx + p.x_m * scale, y: roofOy + (roof.width - p.y_m) * scale, xm: p.x_m, ym: p.y_m }));
  let out = `<polygon points="${P.map(p => `${p.x},${p.y}`).join(" ")}" fill="#2563eb" fill-opacity="0.05" stroke="#2563eb" stroke-width="2" pointer-events="none"><title>Roof boundary from Revit</title></polygon>`;
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length];
    out += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#fff" stroke="#2563eb" stroke-width="1.4" pointer-events="none"/>`;
    const len = Math.hypot(q.xm - p.xm, q.ym - p.ym);
    if (len * scale < 34) return;
    out += `<text x="${(p.x + q.x) / 2}" y="${(p.y + q.y) / 2 - 4}" text-anchor="middle" font-size="9" font-weight="600" font-family="'Titillium Web', Arial, sans-serif" fill="#1d4ed8" pointer-events="none">${len.toFixed(1)} m</text>`;
  });
  return out;
}

function redrawCombineForLayers() {
  if (typeof drawCombineCanvas === "function" && typeof activeMode !== "undefined" && activeMode === "combine") drawCombineCanvas();
}

/** The panel over the Combine canvas. Safe to call before it exists and at any time (it redraws only its own box). */
function updateRevitLayersUI() {
  const box = document.getElementById("revit-layers");
  if (!box || typeof combineState === "undefined") return;
  const L = combineState.revitLayers;
  const connected = typeof workspaceState !== "undefined" && workspaceState.connected === true;
  const head = `<label class="revit-layers-master" title="Show what the Revit model has, layer by layer, over the roof"><input type="checkbox" id="revit-layers-master" ${L.on ? "checked" : ""}>
      <span class="revit-layers-title"><i class="ti ti-stack-2" aria-hidden="true"></i> Revit layers</span>
      <span class="revit-layers-state ${connected ? "live" : ""}">${connected ? "connected" : "not connected"}</span></label>${L.on ? `<button class="revit-layers-fold" id="revit-layers-fold" title="${L.folded ? "Show the layers" : "Hide the list, keep the layers"}"><i class="ti ${L.folded ? "ti-chevron-down" : "ti-chevron-up"}" aria-hidden="true"></i></button>` : ""}`;
  if (!L.on || L.folded) {
    box.innerHTML = head;
    return;
  }

  const rows = REVIT_LAYERS.map(l => {
    const n = l.n();
    const tip = n ? (l.detail ? l.detail(n) : String(n)) : "Nothing pushed from Revit for this yet";
    return `<label class="revit-layer${n ? "" : " empty"}" title="${tip}"><input type="checkbox" data-layer="${escapeHtml(l.key)}" ${revitLayerShown(l.key) ? "checked" : ""} ${n ? "" : "disabled"}>
      <span class="revit-layer-chip" style="background:${escapeHtml(l.color)}"></span><span class="revit-layer-name">${escapeHtml(l.label)}</span><span class="revit-layer-count">${n || "–"}</span></label>`;
  }).join("");

  const haveResults = typeof resultsState !== "undefined" && resultsState.payload && typeof RESULT_SECTIONS !== "undefined";
  const sent = haveResults ? Object.keys(RESULT_SECTIONS).filter(k => resultsState.payload[k]) : [];
  const outOfDate = typeof resFreshness === "function" ? sent.filter(k => resFreshness(k).state === "stale").length : 0;
  const received = sent.length - outOfDate;
  const total = typeof RESULT_SECTIONS !== "undefined" ? Object.keys(RESULT_SECTIONS).length : 0;
  const running = typeof workspaceState !== "undefined" && !!workspaceState.busy.run;
  const canRun = connected && combineState.items.length > 0 && !running;
  const scope = combineState.roof.pushedScope;

  box.innerHTML = head + `<div class="revit-layers-body">
      <div class="revit-layers-hint">${connected
        ? (Array.isArray(scope) ? "In Revit, select what you want and choose <b>Push to Sportify</b>: a selection sends only the selected grid lines, columns, beams, walls, stairs, lifts, doors and ramps." : "Nothing pushed from Revit yet: select the roof in Revit and choose <b>Push to Sportify</b>.")
        : "Open a project in Revit with the Sportify add-in to bring its layers in."}</div>
      <div class="revit-layer-list">${rows}</div>
      <div class="revit-layers-flow">
        <div class="revit-layers-line"><i class="ti ti-chart-bar" aria-hidden="true"></i> Results from Revit: <b>${received}</b> of ${total} analyses${outOfDate ? ` <span class="revit-layers-stale">(${outOfDate} out of date)</span>` : ""}</div>
        <div class="revit-layers-actions">
          <button class="btn-export ws-inline-btn" data-ws-action="run" ${canRun ? "" : "disabled"} title="${connected ? (combineState.items.length ? "Run the physical analyses on this layout" : "Place something on the roof first") : "Needs Revit"}"><i class="ti ${running ? "ti-loader-2 ws-spin" : "ti-player-play"}" aria-hidden="true"></i>${running ? "Running..." : "Run analysis"}</button>
          <button class="btn-export ws-inline-btn" data-goto-mode="analysis"><i class="ti ti-chart-dots" aria-hidden="true"></i>Results</button>
          <button class="btn-export ws-inline-btn" data-goto-mode="deliverables"><i class="ti ti-package" aria-hidden="true"></i>Deliverables</button>
        </div>
      </div>
    </div>`;
}

document.addEventListener("change", e => {
  const t = e.target;
  if (!t || !t.closest || !t.closest("#revit-layers")) return;
  const L = combineState.revitLayers;
  if (t.id === "revit-layers-master") {
    L.on = t.checked;
    if (t.checked && typeof pollRevitBoundary === "function") pollRevitBoundary();      // take in whatever Revit has pushed since
    if (t.checked && typeof workspaceRefresh === "function") workspaceRefresh();
  } else if (t.dataset.layer) {
    L.shown[t.dataset.layer] = t.checked;
  } else return;
  updateRevitLayersUI();
  redrawCombineForLayers();
});

document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#revit-layers [data-goto-mode]");
  if (b && typeof setMode === "function") setMode(b.dataset.gotoMode);
  if (e.target.closest && e.target.closest("#revit-layers-fold")) {
    combineState.revitLayers.folded = !combineState.revitLayers.folded;
    updateRevitLayersUI();
  }
});

updateRevitLayersUI();
