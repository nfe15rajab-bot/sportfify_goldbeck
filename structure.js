/**
 * structure.js — the roof's structural grid, columns, beams and bearing walls, and the deck capacity.
 *
 * The grid lines and columns come with a roof pushed from Revit (revitBridge.js), already in the roof's own plan
 * coordinates: x right, y DOWN from the top edge, the same as everything drawn on the Combine canvas. They are drawn
 * over the roof so the layout can be judged against the structure it sits on, and they travel in the export
 * ("structure") for the structural load analysis, which sums the weight of the layout bay by bay.
 *
 * The deck capacity is the one number the layout cannot know: what the structural engineer says the roof deck can carry,
 * characteristic permanent + imposed load in kN/m². Until it is entered the analysis uses a placeholder and says so.
 */

const STRUCTURE_PLACEHOLDER_CAPACITY_KN_M2 = 8; // shown in the hint only; the analysis owns the real default (StructureModel.DefaultCapacityKnM2)

/** The export's "structure" block (or a Revit push's roof.structure) as the app keeps it, or null when it carries no grid and no columns. */
function structureFromPayload(s) {
  if (!s) return null;
  const gridLines = (s.grid_lines || [])
    .filter(g => g && g.start_m && g.end_m)
    .map(g => ({ name: g.name || "", x1: g.start_m.x_m, y1: g.start_m.y_m, x2: g.end_m.x_m, y2: g.end_m.y_m }));
  const columns = (s.columns || []).map(c => ({ label: c.label || "", x: c.x_m, y: c.y_m }));
  // beams under the slab and the walls that reach it (Revit push, "Structure" part): kept and passed on, drawn thin under the grid
  const seg = a => a && a.start_m && a.end_m;
  const beams = (s.beams || []).filter(seg).map(b => ({ name: b.name || "", x1: b.start_m.x_m, y1: b.start_m.y_m, x2: b.end_m.x_m, y2: b.end_m.y_m, widthM: b.width_m || 0, depthM: b.depth_m || 0, topElevationM: b.top_elevation_m ?? null }));
  const walls = (s.walls || []).filter(seg).map(w => ({ name: w.name || "", x1: w.start_m.x_m, y1: w.start_m.y_m, x2: w.end_m.x_m, y2: w.end_m.y_m, thicknessM: w.thickness_m || 0, heightM: w.height_m || 0, bearing: !!w.bearing }));
  if (!gridLines.length && !columns.length && !beams.length && !walls.length) return null;
  return { source: s.source || "revit", gridLines, columns, beams, walls };
}

/** The "structure" block of the export: null when there is nothing to say, else the grid (if any), the deck capacity and the natural frequency (if entered). */
function structurePayload() {
  const st = combineState.structure;
  const cap = combineState.deckCapacityKnM2;
  const freq = combineState.naturalFrequencyHz;
  if (!st && !(cap > 0) && !(freq > 0)) return null;
  return {
    source: st ? st.source : "manual",
    deck_capacity_kn_m2: cap > 0 ? cap : null,
    natural_frequency_hz: freq > 0 ? freq : null,
    grid_lines: st ? st.gridLines.map(g => ({ name: g.name, start_m: { x_m: g.x1, y_m: g.y1 }, end_m: { x_m: g.x2, y_m: g.y2 } })) : [],
    columns: st ? st.columns.map(c => ({ label: c.label, x_m: c.x, y_m: c.y })) : [],
    ...(st && st.beams && st.beams.length ? { beams: st.beams.map(b => ({ name: b.name, start_m: { x_m: b.x1, y_m: b.y1 }, end_m: { x_m: b.x2, y_m: b.y2 }, width_m: b.widthM, depth_m: b.depthM, top_elevation_m: b.topElevationM })) } : {}),
    ...(st && st.walls && st.walls.length ? { walls: st.walls.map(w => ({ name: w.name, start_m: { x_m: w.x1, y_m: w.y1 }, end_m: { x_m: w.x2, y_m: w.y2 }, thickness_m: w.thicknessM, height_m: w.heightM, bearing: w.bearing })) } : {})
  };
}

/**
 * What the dynamic analysis needs to know about the site and the use: the snow zone and altitude (snow load, DIN EN 1991-1-3/NA), and which
 * day the roof lives through. Merged into the export's site_conditions. Null / absent = not given, and the analysis says what it assumed.
 */
function dynamicSitePayload() {
  const alt = combineState.altitudeM;
  return {
    snow_zone: combineState.snowZone || null,
    altitude_m: alt != null ? alt : null,
    altitude_set: alt != null,
    day_schedule: combineState.daySchedule || null      // null = not chosen: the analysis assumes a sports day and says so
  };
}

/** Reads those back from a saved session. */
function applyDynamicSite(payload) {
  const sc = (payload && payload.site_conditions) || {};
  combineState.snowZone = sc.snow_zone ? String(sc.snow_zone) : "";
  combineState.altitudeM = sc.altitude_m != null && sc.altitude_set !== false ? sc.altitude_m : null;
  combineState.daySchedule = sc.day_schedule ? String(sc.day_schedule) : "";
  const st = payload && payload.structure;
  combineState.naturalFrequencyHz = st && st.natural_frequency_hz > 0 ? st.natural_frequency_hz : null;
}

/** Grid lines (chain-dotted, with a name bubble outside the roof edge) and columns, for the Combine canvas and the Structure tab. Not interactive. */
function structureSvg(scale, roofOx, roofOy, force) {
  const st = combineState.structure;
  if (!st) return "";
  // Combine draws each part only when its Revit layer is on (revitLayers.js); the Structure tab (force) always shows all of it.
  const show = key => force || (typeof revitLayerShown === "function" ? revitLayerShown(key) : true);
  const BUBBLE_R = 8;
  let out = "";

  // walls under the roof (solid grey, dark when Revit marks them load-bearing) and beams (thin brown), beneath the grid
  if (show("beams_walls")) (st.walls || []).forEach(w => {
    const px = Math.max(2, (w.thicknessM || 0.2) * scale);
    out += `<line x1="${roofOx + w.x1 * scale}" y1="${roofOy + w.y1 * scale}" x2="${roofOx + w.x2 * scale}" y2="${roofOy + w.y2 * scale}" stroke="${w.bearing ? "#1e293b" : "#94a3b8"}" stroke-width="${px}" stroke-linecap="butt" opacity="0.55" pointer-events="none"><title>${escapeStructureText(w.name || "Wall")}, ${w.bearing ? "load-bearing" : "not load-bearing"}, ${w.thicknessM} m thick</title></line>`;
  });
  if (show("beams_walls")) (st.beams || []).forEach(b => {
    out += `<line x1="${roofOx + b.x1 * scale}" y1="${roofOy + b.y1 * scale}" x2="${roofOx + b.x2 * scale}" y2="${roofOy + b.y2 * scale}" stroke="#b45309" stroke-width="1.6" opacity="0.7" pointer-events="none"><title>${escapeStructureText(b.name || "Beam")}${b.depthM ? ", " + Math.round(b.depthM * 1000) + " mm deep" : ""}</title></line>`;
  });

  if (show("structure")) st.gridLines.forEach(g => {
    const ax = roofOx + g.x1 * scale, ay = roofOy + g.y1 * scale;
    const bx = roofOx + g.x2 * scale, by = roofOy + g.y2 * scale;
    out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#5b8def" stroke-width="1"
                  stroke-dasharray="10,3,2,3" opacity="0.75" pointer-events="none"/>`;
    if (!g.name) return;
    // The bubble sits just beyond the line's top end (vertical lines) or left end (horizontal ones), where a drawing would put it.
    const vertical = Math.abs(g.y2 - g.y1) >= Math.abs(g.x2 - g.x1);
    const startFirst = vertical ? g.y1 <= g.y2 : g.x1 <= g.x2;
    const [px, py, qx, qy] = startFirst ? [ax, ay, bx, by] : [bx, by, ax, ay];
    const len = Math.hypot(qx - px, qy - py) || 1;
    const cx = px - (qx - px) / len * (BUBBLE_R + 2);
    const cy = py - (qy - py) / len * (BUBBLE_R + 2);
    out += `<circle cx="${cx}" cy="${cy}" r="${BUBBLE_R}" fill="#fff" stroke="#5b8def" stroke-width="1" pointer-events="none"/>
            <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="10" font-weight="600"
                  font-family="'Titillium Web', Arial, sans-serif" fill="#2f5fbf" pointer-events="none">${escapeStructureText(g.name)}</text>`;
  });

  if (show("structure")) st.columns.forEach(c => {
    const x = roofOx + c.x * scale, y = roofOy + c.y * scale;
    out += `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#334155" stroke="#fff" stroke-width="0.8" pointer-events="none"/>`;
  });
  return out;
}

function escapeStructureText(s) {
  return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

/** Status line and checkbox of the Structure tab's grid section. Safe to call before the elements exist. */
/** The grid section's status line (and its switch and button): what Revit gave, and what the deck capacity is. Does not touch the assumptions panel (that calls this). */
function updateStructureStatus() {
  const status = document.getElementById("site-structure-status");
  const st = combineState.structure;
  if (status) {
    const cap = combineState.deckCapacityKnM2;
    const capText = cap > 0
      ? `Deck capacity ${cap} kN/m² (as entered).`
      : `Deck capacity not entered: the analysis uses ${STRUCTURE_PLACEHOLDER_CAPACITY_KN_M2} kN/m² as a placeholder (enter it below).`;
    if (st) {
      const vertical = st.gridLines.filter(g => Math.abs(g.y2 - g.y1) >= Math.abs(g.x2 - g.x1)).length;
      status.textContent = `${st.source === "revit" ? "From Revit" : "Entered"}: ${vertical} + ${st.gridLines.length - vertical} grid lines, ${st.columns.length} columns. ${capText}`;
    } else {
      status.textContent = `No structural grid: push the roof from Revit (its grids and columns come with it), or the analysis assumes a regular 8.4 m grid. ${capText}`;
    }
  }
  const show = document.getElementById("siteShowStructure");
  if (show) show.checked = combineState.showStructure !== false;
  const clear = document.getElementById("btn-clear-structure");
  if (clear) clear.style.display = st ? "" : "none";
}

/** Status line and checkbox of the Structure tab's grid section, and the assumptions panels. Safe to call before the elements exist. */
function updateStructureUI() {
  updateStructureStatus();
  if (typeof updateAssumptionsUI === "function") updateAssumptionsUI();   // the deck capacity, frequency and comfort limits (Structure tab) and the snow, schedule and sun targets (Site conditions tab) are in the assumptions panels
}

function redrawCombineIfShown() {
  if (typeof drawCombineCanvas === "function" && typeof activeMode !== "undefined" && activeMode === "combine") drawCombineCanvas();
}

document.getElementById("siteShowStructure")?.addEventListener("change", e => {
  combineState.showStructure = e.target.checked;
  redrawCombineIfShown();
});
document.getElementById("btn-clear-structure")?.addEventListener("click", () => {
  combineState.structure = null;
  updateStructureUI();
  redrawCombineIfShown();
});
