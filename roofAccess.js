/**
 * roofAccess.js — the "Roof Type and Accessibility" tab (user, 2026-09-28), right after Site conditions.
 *
 * One place for the two things every later step depends on: what the roof is for (the Sports Core / Garden Core / Mixed cards, moved here from
 * the Site tab; roofProgram.js still owns them) and where people come in (the entry points, added here instead of from Combine's Rules tab).
 * The drawing shows the roof outline (Revit's, or the rectangle) with the length of every edge, architect style (algoRoofDimensions, the
 * same drawing Algorithmic placement uses), and the entry points numbered. "Add Entry Point", then a click near an edge, snaps a pin onto the
 * outline (addEntryPoint, combineField.js — the same function the board used). A pin can be selected and removed here; dragging it along its
 * edge stays on the Combine board.
 */

let roofAccessTool = false;          // "Add Entry Point" armed: the next click on the drawing places one pin
let roofAccessSelected = null;       // the entry point selected in this tab

function roofAccessFootprint() {
  if (typeof algoFootprint === "function") return algoFootprint();
  const r = combineState.roof;
  return [[0, 0], [r.length, 0], [r.length, r.width], [0, r.width]];
}

/** The roof, its edge lengths and the entry points, in metres (x right, y down, as the Combine board). */
function renderRoofAccess() {
  const svg = document.getElementById("roofaccess-field");
  if (!svg) return;
  const foot = roofAccessFootprint();
  const xs = foot.map(p => p[0]), ys = foot.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1), fs = Math.max(0.6, span / 45), off = fs * 2.2, pad = off + fs * 2.5;
  const dark = typeof isDarkMode === "function" && isDarkMode();
  const edge = dark ? "#c9cbe0" : "#2f3542", fill = dark ? "#262b3a" : "#f4f2ec";
  const R = v => Math.round(v * 1000) / 1000;
  let g = `<polygon points="${foot.map(p => p.join(",")).join(" ")}" fill="${fill}" stroke="${edge}" stroke-width="${R(fs * 0.22)}" stroke-linejoin="miter"/>`;
  if (typeof algoRoofDimensions === "function") g += algoRoofDimensions(foot, off, fs, edge);
  (combineState.entryPoints || []).forEach((ep, i) => {
    const sel = ep.id === roofAccessSelected, r = fs * 0.75;
    g += `<g data-roofaccess-entry="${escapeHtml(ep.id)}" style="cursor:pointer"><title>Entry point ${i + 1}</title>`
      + `<circle cx="${R(ep.x_m)}" cy="${R(ep.y_m)}" r="${R(sel ? r * 1.35 : r)}" fill="#f59e0b" stroke="${sel ? "#2563eb" : "#78350f"}" stroke-width="${R(fs * (sel ? 0.22 : 0.12))}"/>`
      + `<text x="${R(ep.x_m)}" y="${R(ep.y_m)}" text-anchor="middle" dominant-baseline="central" font-size="${R(fs * 0.9)}" font-weight="700" fill="#3b2506">${i + 1}</text></g>`;
  });
  svg.setAttribute("viewBox", `${R(x0 - pad)} ${R(y0 - pad)} ${R(x1 - x0 + 2 * pad)} ${R(y1 - y0 + 2 * pad)}`);
  svg.style.cursor = roofAccessTool ? "crosshair" : "default";
  svg.innerHTML = g;
  renderRoofAccessList();
}

/** The entry points as a list under the button, each removable. */
function renderRoofAccessList() {
  const host = document.getElementById("roofaccess-entries");
  const btn = document.getElementById("btn-roofaccess-add-entry"), hint = document.getElementById("roofaccess-add-hint");
  if (btn) btn.classList.toggle("active", roofAccessTool);
  if (hint) hint.hidden = !roofAccessTool;
  if (!host) return;
  const eps = combineState.entryPoints || [];
  host.innerHTML = eps.length ? eps.map((ep, i) => {
    const edgeName = ep.edge || "roof";
    return `<div class="roofaccess-entry${ep.id === roofAccessSelected ? " selected" : ""}" data-roofaccess-entry="${escapeHtml(ep.id)}">
        <span class="roofaccess-num">${i + 1}</span><span>Entry point ${i + 1} · ${escapeHtml(edgeName)} edge</span>
        <button type="button" class="roofaccess-remove" data-roofaccess-remove="${escapeHtml(ep.id)}" title="Remove this entry point">×</button>
      </div>`;
  }).join("") : `<p class="hint">No entry point yet. Pathways start from the entry points, so add at least one.</p>`;
}

function roofAccessRemove(id) {
  combineState.entryPoints = (combineState.entryPoints || []).filter(e => e.id !== id);
  if (roofAccessSelected === id) roofAccessSelected = null;
  if (combineState.selectedKind === "entry" && combineState.selectedId === id) { combineState.selectedId = null; combineState.selectedKind = null; }
  if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  renderRoofAccess();
}

// wired once, at load
document.getElementById("btn-roofaccess-add-entry")?.addEventListener("click", () => { roofAccessTool = !roofAccessTool; renderRoofAccess(); });

document.getElementById("roofaccess-field")?.addEventListener("pointerdown", e => {
  const svg = e.currentTarget;
  const hit = e.target.closest && e.target.closest("[data-roofaccess-entry]");
  if (hit && !roofAccessTool) { roofAccessSelected = hit.dataset.roofaccessEntry; renderRoofAccess(); return; }
  if (!roofAccessTool || typeof addEntryPoint !== "function") { roofAccessSelected = null; renderRoofAccess(); return; }
  const m = svg.getScreenCTM();
  if (!m) return;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  addEntryPoint(pt.x, pt.y);                                   // snaps onto the outline, as on the board
  const eps = combineState.entryPoints;
  roofAccessSelected = eps.length ? eps[eps.length - 1].id : null;
  roofAccessTool = false;                                      // one pin per click, as on the board
  renderRoofAccess();
});

document.addEventListener("click", e => {
  const rm = e.target.closest && e.target.closest("[data-roofaccess-remove]");
  if (rm) { roofAccessRemove(rm.dataset.roofaccessRemove); return; }
  const row = e.target.closest && e.target.closest(".roofaccess-entry");
  if (row) { roofAccessSelected = row.dataset.roofaccessEntry; renderRoofAccess(); }
});

document.addEventListener("keydown", e => {
  if ((e.key !== "Delete" && e.key !== "Backspace") || typeof activeMode === "undefined" || activeMode !== "roofAccess" || !roofAccessSelected) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
  roofAccessRemove(roofAccessSelected);
});
