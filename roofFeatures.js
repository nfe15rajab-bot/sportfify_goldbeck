/**
 * roofFeatures.js — what the Revit model says about the roof besides its outline and structure.
 *
 * A roof pushed from Revit (revitBridge.js) carries "features": the openings in it (skylights, shafts), the stairs, cores and doors that
 * reach it, its edge (parapet, railing or open, stretch by stretch), the walls that stand on it and cast shade, its drains, the build-up of the
 * slab and the levels. They are in the
 * roof's own plan coordinates, the same as everything on the Combine canvas (x right, y DOWN from the top edge, metres), so they are drawn
 * straight over the roof and travel in the export as roof_context.features for whatever needs the real roof: the combining rules, live
 * sync, the analyses. ROOF_FEATURES.md in the Revit repository describes the contract.
 *
 * Nothing here decides anything: it reads, shows and passes on. The one action is "Use as entry points", which turns the stairs, cores and
 * doors into the layout's entry points (snapped to the roof's edge like an entrance placed by hand), because those are where people
 * really arrive.
 */

const ROOF_FEATURE_COLORS = {
  opening: "#dc2626",
  parapet: "#374151",
  railing: "#0284c7",
  partial: "#d97706",
  open: "#ef4444",
  stair: "#7c3aed",
  core: "#0f766e",
  door: "#b45309",
  ramp: "#16a34a",
  drain: "#2563eb",
  obstacle: "#57534e",
  equipment: "#0e7490"
};

/** The features block of a Revit push (roof.features) or an export (roof_context.features) as the app keeps it, or null when it is empty. */
function roofFeaturesFromPayload(f) {
  if (!f || typeof f !== "object") return null;
  const list = v => (Array.isArray(v) ? v : []);
  const out = {
    source: f.source || "revit",
    notes: list(f.notes).map(String),
    openings: list(f.openings).filter(o => o && list(o.polygon_m).length >= 3),
    entries: list(f.entries).filter(e => e && Number.isFinite(e.x_m) && Number.isFinite(e.y_m)),
    edges: list(f.edges).filter(e => e && e.start_m && e.end_m),
    obstacles: list(f.obstacles).filter(o => o && o.start_m && o.end_m && o.height_m > 0),
    equipment: list(f.equipment).filter(q => q && Number.isFinite(q.x_m) && Number.isFinite(q.y_m) && q.width_m > 0 && q.depth_m > 0),
    drains: list(f.drains).filter(d => d && Number.isFinite(d.x_m) && Number.isFinite(d.y_m)),
    slab: f.slab && list(f.slab.layers).length ? f.slab : null,
    levels: list(f.levels)
  };
  const anything = out.openings.length || out.entries.length || out.edges.length || out.obstacles.length || out.equipment.length || out.drains.length || out.slab || out.levels.length;
  return anything ? out : null;
}

/** The export's roof_context.features, or null when the roof has none (a roof typed in by hand). */
function roofFeaturesPayload() {
  const f = combineState.roofFeatures;
  return f ? JSON.parse(JSON.stringify(f)) : null;
}

function roofFeatureLength(edges, kind) {
  return edges.filter(e => e.kind === kind).reduce((s, e) => s + (e.length_m || 0), 0);
}

/** The features over the roof on the Combine canvas. Not interactive. */
function roofFeaturesSvg(scale, roofOx, roofOy) {
  const f = combineState.roofFeatures;
  if (!f) return "";
  // each kind of thing is drawn only when its Revit layer is on (revitLayers.js)
  const show = key => (typeof revitLayerShown === "function" ? revitLayerShown(key) : true);
  const X = x => roofOx + x * scale, Y = y => roofOy + y * scale;
  const C = ROOF_FEATURE_COLORS;
  let out = "";

  // the edge, stretch by stretch: what stands along it, or that nothing does
  if (show("edge")) f.edges.forEach(e => {
    const a = `${X(e.start_m.x_m)},${Y(e.start_m.y_m)}`, b = `${X(e.end_m.x_m)},${Y(e.end_m.y_m)}`;
    const [x1, y1] = a.split(","), [x2, y2] = b.split(",");
    const style = e.kind === "parapet" ? `stroke="${C.parapet}" stroke-width="4"`
      : e.kind === "railing" ? `stroke="${C.railing}" stroke-width="3" stroke-dasharray="6,3"`
      : e.kind === "partial" ? `stroke="${C.partial}" stroke-width="3" stroke-dasharray="10,4"`
      : `stroke="${C.open}" stroke-width="1.5" stroke-dasharray="2,4"`;
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${style} opacity="0.85" pointer-events="none"><title>Edge ${e.index + 1}: ${e.kind}${e.height_m ? `, ${e.height_m} m high` : ""}</title></line>`;
  });

  // walls and other tall things standing on the roof: what the sun analysis casts shadows from (a stair house, a plant-room wall, a parapet)
  if (show("obstacles")) (f.obstacles || []).forEach(o => {
    const width = Math.max(3, (o.thickness_m || 0) * scale);
    out += `<line x1="${X(o.start_m.x_m)}" y1="${Y(o.start_m.y_m)}" x2="${X(o.end_m.x_m)}" y2="${Y(o.end_m.y_m)}" stroke="${C.obstacle}" stroke-width="${width}" stroke-linecap="butt" opacity="0.7" pointer-events="none"><title>${escapeStructureText(o.name || "Wall")}, ${o.height_m} m high: casts shade</title></line>`;
  });

  // plant on the roof: a box with its name and height on hover
  if (show("equipment")) (f.equipment || []).forEach(q => {
    const w = q.width_m * scale, d = q.depth_m * scale;
    out += `<g pointer-events="none"><title>${escapeStructureText(q.name || q.kind)}, ${q.height_m} m high${q.weight_kn ? ", " + q.weight_kn + " kN" : ""}</title>
      <rect x="${X(q.x_m) - w / 2}" y="${Y(q.y_m) - d / 2}" width="${w}" height="${d}" fill="${C.equipment}" fill-opacity="0.25" stroke="${C.equipment}" stroke-width="1.2"/>
      <text x="${X(q.x_m)}" y="${Y(q.y_m) + 3}" text-anchor="middle" font-size="8" font-weight="700" font-family="'Titillium Web', Arial, sans-serif" fill="${C.equipment}">${q.kind === "electrical" ? "E" : "M"}</text></g>`;
  });

  if (show("openings")) f.openings.forEach(o => {
    const pts = o.polygon_m.map(p => `${X(p.x_m)},${Y(p.y_m)}`).join(" ");
    out += `<polygon points="${pts}" fill="${C.opening}" fill-opacity="0.18" stroke="${C.opening}" stroke-width="1.2" stroke-dasharray="4,2" pointer-events="none"><title>Opening ${o.area_m2} m²</title></polygon>`;
    out += `<line x1="${X(o.x_m)}" y1="${Y(o.y_m)}" x2="${X(o.x_m + o.width_m)}" y2="${Y(o.y_m + o.height_m)}" stroke="${C.opening}" stroke-width="0.8" opacity="0.6" pointer-events="none"/>`;
    out += `<line x1="${X(o.x_m + o.width_m)}" y1="${Y(o.y_m)}" x2="${X(o.x_m)}" y2="${Y(o.y_m + o.height_m)}" stroke="${C.opening}" stroke-width="0.8" opacity="0.6" pointer-events="none"/>`;
  });

  if (show("drains")) f.drains.forEach(d => {
    const x = X(d.x_m), y = Y(d.y_m);
    out += `<g pointer-events="none"><title>${escapeStructureText(d.kind)}${d.name ? `: ${escapeStructureText(d.name)}` : ""}</title>
      <circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${C.drain}" stroke-width="1.4"/>
      <path d="M${x - 3},${y} H${x + 3} M${x},${y - 3} V${y + 3}" stroke="${C.drain}" stroke-width="1.2"/></g>`;
  });

  const ENTRY_LAYER = { stair: "stairs", core: "lifts", door: "doors", ramp: "ramps" };
  f.entries.forEach(e => {
    if (!show(ENTRY_LAYER[e.kind] || "doors")) return;
    const x = X(e.x_m), y = Y(e.y_m);
    const color = C[e.kind] || "#555";
    const letter = e.kind === "stair" ? "S" : e.kind === "core" ? "L" : e.kind === "ramp" ? "R" : "D";
    out += `<g pointer-events="none" opacity="${e.on_roof === false ? 0.75 : 1}"><title>${escapeStructureText(e.kind)}${e.name ? `: ${escapeStructureText(e.name)}` : ""}${e.width_m ? `, ${e.width_m} m wide` : ""}${e.on_roof === false ? " (just beyond the roof's edge)" : ""}</title>
      <rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${color}" stroke="#fff" stroke-width="1.2"/>
      <text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" font-family="'Titillium Web', Arial, sans-serif" fill="#fff">${letter}</text></g>`;
  });
  return out;
}

/** Turns the stairs, cores and doors of the model into the layout's entry points, snapped to the roof's edge. Returns how many were added. */
function useRevitEntriesAsEntryPoints() {
  const f = combineState.roofFeatures;
  if (!f || !f.entries.length) return 0;
  let added = 0;
  f.entries.forEach((e, i) => {
    const snap = nearestBoundaryPoint(combineState.roof, e.x_m, e.y_m);
    const close = combineState.entryPoints.some(p => Math.hypot(p.x_m - snap.x, p.y_m - snap.y) < 1.5);
    if (close) return;
    combineState.entryPoints.push({ id: `entry_${Date.now()}_r${i}`, edge: snap.edge, x_m: snap.x, y_m: snap.y });
    added++;
  });
  if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  if (typeof refreshSuggestions === "function") refreshSuggestions();
  return added;
}

/** The Site tab's "Roof features" section: what came from Revit, in words, with the switch and the entry-point action. Safe before the elements exist. */
function updateRoofFeaturesUI() {
  const status = document.getElementById("site-features-status");
  const details = document.getElementById("site-features-details");
  const show = document.getElementById("siteShowRoofFeatures");
  const use = document.getElementById("btn-use-revit-entries");
  const f = combineState.roofFeatures;
  if (show) show.checked = combineState.showRoofFeatures !== false;
  if (use) use.style.display = f && f.entries.length ? "" : "none";
  if (!status) return;

  // what the model has given so far, and what the "Push to Sportify" drop-down in Revit could still add
  const PUSH_PARTS = { structure: "structure (grid, columns, beams, walls)", entries: "entries (stairs, lifts, doors, ramps)", openings: "openings", edge: "edge and walls on the roof", drains: "drains", equipment: "equipment", slab_levels: "slab build-up and levels" };
  const pushed = combineState.roof.pushedScope;
  const missing = Array.isArray(pushed) ? Object.keys(PUSH_PARTS).filter(k => !pushed.includes(k)) : [];
  const missingLine = missing.length
    ? `<p class="hint">Not pushed from Revit yet: ${missing.map(k => PUSH_PARTS[k]).join(", ")}. Push them from the ribbon's <b>Push to Sportify</b> drop-down${missing.includes("slab_levels") ? " (the slab's thickness is what the resonance estimate needs)" : ""}.</p>` : "";
  const turn = missingLine + (Math.abs(combineState.roof.rotationDeg || 0) > 0.01
    ? `<p class="hint">The roof is turned ${(+combineState.roof.rotationDeg).toFixed(1)}° against the Revit model, so the plan is turned with it: pieces you place are square to the roof, and the import turns them back.</p>` : "");
  if (!f) {
    status.textContent = "Nothing from Revit yet: push a roof and its openings, stairs, doors, edge, drains, slab and levels come with it.";
    if (details) details.innerHTML = turn;
    return;
  }

  const kinds = k => f.entries.filter(e => e.kind === k).length;
  const bits = [];
  bits.push(`${f.openings.length} opening${f.openings.length === 1 ? "" : "s"}`);
  bits.push(`${f.entries.length} entr${f.entries.length === 1 ? "y" : "ies"} (${kinds("stair")} stair, ${kinds("core")} lift, ${kinds("door")} door, ${kinds("ramp")} ramp)`);
  bits.push(`${f.drains.length} drain${f.drains.length === 1 ? "" : "s"}`);
  const equip = (f.equipment || []).length;
  if (equip) bits.push(`${equip} piece${equip === 1 ? "" : "s"} of equipment`);
  const walls = (f.obstacles || []).length;
  if (walls) bits.push(`${walls} wall${walls === 1 ? "" : "s"} that shade${walls === 1 ? "s" : ""} the roof`);
  status.textContent = `From Revit: ${bits.join(", ")}.`;

  if (!details) return;
  const edgeLine = f.edges.length
    ? `Edge: ${roofFeatureLength(f.edges, "parapet").toFixed(1)} m parapet, ${roofFeatureLength(f.edges, "railing").toFixed(1)} m railing, ${roofFeatureLength(f.edges, "partial").toFixed(1)} m partly protected, ${roofFeatureLength(f.edges, "open").toFixed(1)} m open.`
    : "Edge: not read.";
  const slabLine = f.slab
    ? `Slab "${escapeStructureText(f.slab.type_name || "")}": ${Math.round(f.slab.thickness_m * 1000)} mm in all, ${Math.round(f.slab.structural_thickness_m * 1000)} mm structure.`
    : "Slab: not read.";
  const levels = f.levels.length
    ? `Levels: ${f.levels.map(l => `${l.is_roof_level ? "<b>" : ""}${escapeStructureText(l.name || "")}${l.above_ground_m != null ? ` (${l.above_ground_m.toFixed(1)} m)` : ""}${l.is_roof_level ? "</b>" : ""}`).join(", ")}.`
    : "Levels: not read.";
  const notes = f.notes.length ? `<p class="hint">${f.notes.map(escapeStructureText).join(" ")}</p>` : "";
  details.innerHTML = `${turn}<p class="hint">${edgeLine}</p><p class="hint">${slabLine}</p><p class="hint">${levels}</p>${notes}
    <p class="hint">Drains are found by their family names and parapets by their height: check them against the model.</p>`;
}

document.getElementById("siteShowRoofFeatures")?.addEventListener("change", e => {
  combineState.showRoofFeatures = e.target.checked;
  redrawCombineIfShown();
});
document.getElementById("btn-use-revit-entries")?.addEventListener("click", () => {
  const n = useRevitEntriesAsEntryPoints();
  if (typeof showToast === "function") showToast(n ? "Entry points added" : "Nothing to add", n ? `${n} entry point${n === 1 ? "" : "s"} from the Revit model's stairs, lifts and doors.` : "Every stair, lift and door already has an entry point close by.");
});
