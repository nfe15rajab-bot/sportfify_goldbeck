/**
 * zones.js — ground you draw, replacing the Garden tab
 *
 * A court has a size; a garden has an area. A handball court is 40 x 20 because
 * IHF says so, and you place it. A green patch is whatever shape the design
 * leaves for it — typing 10 x 6 into a tab and dragging that rectangle in
 * treated the garden like a court, and the number was fiction.
 *
 * So a zone is defined by marking where it goes:
 *
 *   1. choose what you are drawing (planting, walkway, trees…)
 *   2. choose the provider build-up for it — the list narrows to systems that
 *      suit that kind, since a paving system is not an answer for a tree pit
 *   3. drag it out on the roof; the drag IS the size
 *
 * Afterwards it behaves like any other piece: select, move, resize by its
 * corners, Delete to remove.
 *
 * Zones do NOT reflow around objects. A court dropped on a zone is refused
 * rather than silently re-cutting the zone underneath, so the design only
 * changes when the designer changes it — and an overlap is an ordinary rule
 * violation rather than a special case.
 *
 * Rectangles only. The canvas and the whole rules engine are built on
 * axis-aligned boxes, and arbitrary shapes are not the problem worth solving
 * to find out whether this way of working is right.
 */

/**
 * What you can draw, and which build-up categories suit each. The kinds mirror
 * the old GARDEN_ITEMS so nothing a planner could describe before has been
 * lost — only the way it gets sized has changed.
 */
/**
 * What you can draw. Two kinds, because there are two real things:
 *
 *   GREEN ROOF   the build-up — substrate, drainage, filter, membrane. This is
 *                the ground itself, and the industry's own split runs through
 *                it: extensive (thin, sedum, no access) versus intensive (deep,
 *                accessible, shrubs and trees). That distinction lives in the
 *                assembly, not in a separate zone kind.
 *
 *   VEGETATION   deeper planted areas — beds, raised planting, growing. Needs
 *                an intensive build-up for root depth, so the systems offered
 *                narrow accordingly.
 *
 * The previous six (planting bed / lawn / trees / urban farming / walkway) came
 * from the old GARDEN_ITEMS list and did not survive contact with the question
 * "what is the difference". Planting bed, lawn and urban farming were three
 * names for an area with plants in it, differing only in WHAT is planted —
 * which is not a property of the ground.
 *
 * Walkway is gone entirely: pedestrian circulation is the negative space
 * between things, not an area you draw. Its material gets decided later, for
 * whatever ground is left over.
 */
const ZONE_KINDS = {
  green_roof: {
    label: "Green roof",
    short: "Green roof",
    color: "#4a9c5d",
    hint: "The roof build-up itself. Extensive or intensive is chosen by the system below.",
    assemblyCategories: ["extensive", "intensive"],
  },
};

let zoneCounter = 0;

/**
 * The rectangle being dragged out right now, or null. Deliberately not part of
 * combineState: a half-finished gesture is not layout data and has no business
 * being saved, exported or compared.
 */
let zoneDraft = null;

function ensureZoneState() {
  if (!Array.isArray(combineState.zones)) combineState.zones = [];
  if (!combineState.zoneKind) combineState.zoneKind = "green_roof";
  if (!combineState.zoneAssembly) combineState.zoneAssembly = defaultAssemblyFor(combineState.zoneKind);
}

/** Build-up systems that suit a kind — a paving system is not an answer for a tree pit. */
function assembliesForKind(kindKey) {
  const kind = ZONE_KINDS[kindKey];
  if (!kind || typeof ASSEMBLIES === "undefined") return [];
  return Object.entries(ASSEMBLIES)
    .filter(([, a]) => kind.assemblyCategories.includes(a.category))
    .map(([key, a]) => ({ key, ...a }));
}

function defaultAssemblyFor(kindKey) {
  const list = assembliesForKind(kindKey);
  return list.length ? list[0].key : null;
}

/* ── Shape ────────────────────────────────────────────────────────────────
   A zone is a polygon. It starts as a rectangle because dragging one out is
   the fastest way to say "about here", but a bed is not a rectangle and the
   shape has to be able to follow what the roof actually leaves.

   `points` is the truth. x_m / y_m / length_m / width_m are its bounding box,
   kept in step on every change, because the clash checks, the canvas ordering
   and the rule engine all read the box and none of them need the polygon.
   Area does not come from the box — see zoneAreaM2. */

function rectPoints(x_m, y_m, length_m, width_m) {
  return [
    { x_m, y_m },
    { x_m: x_m + length_m, y_m },
    { x_m: x_m + length_m, y_m: y_m + width_m },
    { x_m, y_m: y_m + width_m },
  ];
}

/** Recomputes the bounding box from the points. Call after any shape change. */
function syncZoneBounds(zone) {
  const xs = zone.points.map(p => p.x_m);
  const ys = zone.points.map(p => p.y_m);
  zone.x_m = Math.min(...xs);
  zone.y_m = Math.min(...ys);
  zone.length_m = Math.max(...xs) - zone.x_m;
  zone.width_m = Math.max(...ys) - zone.y_m;
  return zone;
}

/**
 * True area, by the shoelace — not the bounding box.
 *
 * The moment a zone stops being a rectangle these two diverge, and everything
 * downstream is measured in square metres of real surface: the substrate to
 * order, the weight the deck carries, the leftover the roof finish covers.
 */
function zoneAreaM2(zone) {
  const pts = zone.points;
  if (!Array.isArray(pts) || pts.length < 3) {
    return (zone.length_m || 0) * (zone.width_m || 0);
  }
  let twice = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    twice += a.x_m * b.y_m - b.x_m * a.y_m;
  }
  return Math.abs(twice) / 2;
}

function addZone(x_m, y_m, length_m, width_m) {
  ensureZoneState();
  const zone = {
    id: `zone_${Date.now()}_${zoneCounter++}`,
    kind: combineState.zoneKind,
    assemblyKey: combineState.zoneAssembly,
    points: rectPoints(snapToGrid(x_m), snapToGrid(y_m), snapToGrid(length_m), snapToGrid(width_m)),
  };
  syncZoneBounds(zone);
  combineState.zones.push(zone);
  return zone;
}

/** Moves one vertex, and only that one. */
function moveZonePoint(id, index, x_m, y_m) {
  const zone = getZone(id);
  if (!zone || !zone.points[index]) return;
  zone.points[index] = { x_m: snapToGrid(x_m), y_m: snapToGrid(y_m) };
  syncZoneBounds(zone);
}

/**
 * Inserts a vertex at the midpoint of edge `index`, so the handle you clicked
 * becomes a corner you can drag. Splitting an existing edge rather than
 * appending keeps the winding order intact — a point added at the end would
 * cross the outline back on itself.
 */
function addZonePoint(id, index) {
  const zone = getZone(id);
  if (!zone) return;
  const a = zone.points[index];
  const b = zone.points[(index + 1) % zone.points.length];
  zone.points.splice(index + 1, 0, {
    x_m: snapToGrid((a.x_m + b.x_m) / 2),
    y_m: snapToGrid((a.y_m + b.y_m) / 2),
  });
  syncZoneBounds(zone);
}

/** Removes a vertex. Three is the floor — below that there is no area left. */
function removeZonePoint(id, index) {
  const zone = getZone(id);
  if (!zone || zone.points.length <= 3) return false;
  zone.points.splice(index, 1);
  syncZoneBounds(zone);
  return true;
}

function removeZone(id) {
  ensureZoneState();
  combineState.zones = combineState.zones.filter(z => z.id !== id);
  if (combineState.selectedKind === "zone" && combineState.selectedId === id) {
    combineState.selectedId = null;
    combineState.selectedKind = null;
  }
}

function getZone(id) {
  ensureZoneState();
  return combineState.zones.find(z => z.id === id) || null;
}

/**
 * Zones a box would land on. Objects are refused rather than allowed to
 * overlap — see the file comment on why zones don't reflow.
 */
function zonesUnder(x_m, y_m, w_m, h_m) {
  ensureZoneState();
  const box = { x: x_m, y: y_m, w: w_m, h: h_m };
  return combineState.zones.filter(z =>
    rectsOverlap(box, { x: z.x_m, y: z.y_m, w: z.length_m, h: z.width_m }));
}

function zoneColor(zone) {
  return (ZONE_KINDS[zone.kind] || ZONE_KINDS.planting).color;
}

/* ── Rendering ── */

/** Corner handle size in canvas units — big enough to grab, small enough not to hide a narrow zone. */
const ZONE_HANDLE = 5;

/**
 * Drawn beneath the pieces: the ground is what objects sit on, not a peer of
 * them. Corner handles appear only on the selected zone, so an unselected
 * layout stays readable.
 */
function zonesSvg(scale, roofOx, roofOy) {
  ensureZoneState();
  const selectedId = combineState.selectedKind === "zone" ? combineState.selectedId : null;
  const isPlanner = document.documentElement.dataset.role !== "client";

  const violating = typeof zonesInViolation === "function" ? zonesInViolation() : new Set();

  let out = "";
  combineState.zones.forEach(z => {
    const kind = ZONE_KINDS[z.kind] || ZONE_KINDS.green_roof;
    const bad = violating.has(z.id);
    const x = roofOx + z.x_m * scale;
    const y = roofOy + z.y_m * scale;
    const w = z.length_m * scale;
    const h = z.width_m * scale;
    const selected = z.id === selectedId;

    const px = p => roofOx + p.x_m * scale;
    const py = p => roofOy + p.y_m * scale;
    const poly = z.points.map(p => `${px(p)},${py(p)}`).join(" ");
    const cx = z.points.reduce((s, p) => s + px(p), 0) / z.points.length;
    const cy = z.points.reduce((s, p) => s + py(p), 0) / z.points.length;

    out += `
      <polygon data-zone-id="${z.id}" points="${poly}"
            fill="${kind.color}" fill-opacity="${selected ? 0.5 : 0.35}"
            stroke="${bad ? "#ef4444" : kind.color}" stroke-width="${selected ? 2.5 : bad ? 2 : 1}"
            stroke-dasharray="${bad ? "4,2" : "none"}"
            style="cursor:${isPlanner ? "move" : "pointer"}"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10"
            font-family="'Titillium Web', Arial, sans-serif" fill="${typeof canvasLabelFill === "function" ? canvasLabelFill() : "#f4f4f2"}"
            pointer-events="none" opacity="0.9">
        ${kind.short} · ${zoneAreaM2(z).toFixed(0)} m²${bad ? " ⚠" : ""}
      </text>`;

    if (selected && isPlanner) {
      // A handle per vertex, dragging that vertex alone — a bed is not a
      // rectangle, and resizing from a corner could only ever keep it one.
      z.points.forEach((p, i) => {
        out += `<rect data-zone-point="${i}" data-zone-id="${z.id}"
                      x="${px(p) - ZONE_HANDLE / 2}" y="${py(p) - ZONE_HANDLE / 2}"
                      width="${ZONE_HANDLE}" height="${ZONE_HANDLE}"
                      fill="#f4f4f2" stroke="${kind.color}" stroke-width="1"
                      style="cursor:grab">
                  <title>Drag to move this corner · double-click to remove it</title>
                </rect>`;
      });
      // And a smaller one on every edge: click it and that midpoint becomes a
      // corner, which is how the outline gains detail where it needs it.
      z.points.forEach((p, i) => {
        const q = z.points[(i + 1) % z.points.length];
        const mx = (px(p) + px(q)) / 2, my = (py(p) + py(q)) / 2;
        out += `<circle data-zone-addpoint="${i}" data-zone-id="${z.id}"
                        cx="${mx}" cy="${my}" r="${ZONE_HANDLE / 2}"
                        fill="${kind.color}" fill-opacity="0.85" stroke="#f4f4f2" stroke-width="1"
                        style="cursor:copy">
                  <title>Add a corner here</title>
                </circle>`;
      });
    }
  });

  if (zoneDraft) {
    const kind = ZONE_KINDS[combineState.zoneKind] || ZONE_KINDS.green_roof;
    const b = zoneDraftBox();
    if (b && b.w > 0 && b.h > 0) {
      out += `
        <rect x="${roofOx + b.x * scale}" y="${roofOy + b.y * scale}"
              width="${b.w * scale}" height="${b.h * scale}"
              fill="${kind.color}" fill-opacity="0.25"
              stroke="${kind.color}" stroke-width="1.5" stroke-dasharray="4,3"
              pointer-events="none"/>
        <text x="${roofOx + (b.x + b.w / 2) * scale}" y="${roofOy + (b.y + b.h / 2) * scale + 4}"
              text-anchor="middle" font-size="10" fill="${typeof canvasLabelFill === "function" ? canvasLabelFill() : "#f4f4f2"}" pointer-events="none">
          ${b.w.toFixed(1)} × ${b.h.toFixed(1)} m
        </text>`;
    }
  }
  return out;
}

/* ── Drawing gesture ── */

/** Normalises the in-progress drag into a positive-sized box, whichever way it was dragged. */
function zoneDraftBox() {
  if (!zoneDraft) return null;
  return {
    x: snapToGrid(Math.min(zoneDraft.startXm, zoneDraft.curXm)),
    y: snapToGrid(Math.min(zoneDraft.startYm, zoneDraft.curYm)),
    w: snapToGrid(Math.abs(zoneDraft.curXm - zoneDraft.startXm)),
    h: snapToGrid(Math.abs(zoneDraft.curYm - zoneDraft.startYm)),
  };
}

function beginZoneDraw(xm, ym) {
  ensureZoneState();
  zoneDraft = { startXm: xm, startYm: ym, curXm: xm, curYm: ym };
}

function updateZoneDraw(xm, ym) {
  if (!zoneDraft) return;
  zoneDraft.curXm = xm;
  zoneDraft.curYm = ym;
  drawCombineCanvas();
}

/**
 * Anything under half a metre square is a slip of the mouse rather than an
 * intended zone — dropping those silently is kinder than littering the roof
 * with specks the user then has to find and delete.
 */
function finishZoneDraw() {
  const b = zoneDraftBox();
  zoneDraft = null;
  if (!b || b.w < 0.5 || b.h < 0.5) { drawCombineCanvas(); return null; }

  // A zone drawn over a court is refused at the point of drawing, the same way
  // a court is refused when dropped on a zone. Blocking one direction only
  // would let the same clash in through the back door.
  const onTop = combineState.items.filter(item => {
    if (item.kind === "vegetation") return false;   // a plant belongs in a zone
    const fp = getFootprint(item);
    return rectsOverlap({ x: b.x, y: b.y, w: b.w, h: b.h },
                        { x: item.x_m, y: item.y_m, w: fp.w, h: fp.h });
  });
  if (onTop.length > 0) {
    if (typeof showToast === "function") {
      showToast("Something's already there",
        `${onTop[0].label} occupies this spot — move it first, or draw the zone around it.`);
    }
    drawCombineCanvas();
    return null;
  }

  const zone = addZone(b.x, b.y, b.w, b.h);
  combineState.selectedKind = "zone";
  combineState.selectedId = zone.id;
  drawCombineCanvas();
  renderZonePanel();

  const kind = ZONE_KINDS[zone.kind];
  const assembly = typeof getAssembly === "function" ? getAssembly(zone.assemblyKey) : null;
  if (typeof showToast === "function") {
    showToast(`${kind.label} drawn`,
      `${zone.length_m.toFixed(1)} × ${zone.width_m.toFixed(1)} m — ${(zone.length_m * zone.width_m).toFixed(0)} m²`
      + (assembly ? ` of ${assembly.provider} ${assembly.system_name}.` : "."));
  }
  return zone;
}

/* ── Move and resize ── */

/** True if this rectangle would sit on any placed piece. */
function zoneBoxHitsItem(x_m, y_m, w_m, h_m) {
  return combineState.items.some(item => {
    if (item.kind === "vegetation") return false;   // a plant belongs in a zone
    const fp = getFootprint(item);
    return rectsOverlap({ x: x_m, y: y_m, w: w_m, h: h_m },
                        { x: item.x_m, y: item.y_m, w: fp.w, h: fp.h });
  });
}

function moveZoneTo(id, x_m, y_m) {
  // Translate the outline, not the box: the box is only ever derived from it.
  const zoneForMove = getZone(id);
  if (zoneForMove && Array.isArray(zoneForMove.points)) {
    const dx = snapToGrid(x_m) - zoneForMove.x_m;
    const dy = snapToGrid(y_m) - zoneForMove.y_m;
    zoneForMove.points = zoneForMove.points.map(p => ({ x_m: p.x_m + dx, y_m: p.y_m + dy }));
    syncZoneBounds(zoneForMove);
    return;
  }

  const z = getZone(id);
  if (!z) return;
  const nx = snapToGrid(x_m), ny = snapToGrid(y_m);
  // The drag simply stops at the obstruction rather than reporting an error —
  // the same way a piece behaves when dragged into a zone.
  if (zoneBoxHitsItem(nx, ny, z.length_m, z.width_m)) return;
  z.x_m = nx;
  z.y_m = ny;
  drawCombineCanvas();
}

/**
 * Resizes from whichever corner was grabbed: the opposite corner stays put and
 * the dragged one follows the cursor, which is how every drawing tool behaves
 * and means no separate handle is needed per edge.
 */
function resizeZoneTo(id, corner, x_m, y_m) {
  const z = getZone(id);
  if (!z) return;

  let left = z.x_m, top = z.y_m, right = z.x_m + z.length_m, bottom = z.y_m + z.width_m;
  if (corner === "nw") { left = x_m; top = y_m; }
  else if (corner === "ne") { right = x_m; top = y_m; }
  else if (corner === "se") { right = x_m; bottom = y_m; }
  else if (corner === "sw") { left = x_m; bottom = y_m; }

  // Dragging a corner past its opposite flips the rectangle rather than
  // inverting it into a negative size.
  const x0 = snapToGrid(Math.min(left, right));
  const y0 = snapToGrid(Math.min(top, bottom));
  const w = snapToGrid(Math.abs(right - left));
  const h = snapToGrid(Math.abs(bottom - top));
  if (w < 0.5 || h < 0.5) return;
  if (zoneBoxHitsItem(x0, y0, w, h)) return;

  z.x_m = x0; z.y_m = y0; z.length_m = w; z.width_m = h;
  drawCombineCanvas();
  renderZonePanel();
}

/* ── Panel ── */

/**
 * Configure-then-draw, in that order: what you are drawing narrows which
 * build-up systems are offered, and only then does the drawing tool arm. The
 * reverse order would let someone draw a tree pit and afterwards discover the
 * only systems available are paving.
 */
function renderZonePanel() {
  const el = document.getElementById("zone-panel");
  if (!el) return;

  // The catalog lives in the database, so there is nothing to draw with until
  // it has been fetched. Said plainly rather than shown as an empty dropdown,
  // which would read as "no systems exist".
  if (!assembliesLoaded) {
    el.innerHTML = `<div class="section"><p class="hint">Loading build-up systems…</p></div>`;
    loadAssemblies()
      .then(() => { ensureZoneState(); renderZonePanel(); })
      .catch(err => {
        el.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Build-up systems live in the Sportify API, and it isn't answering (${err.message}).</p>
            <p class="hint">Start it with <code>dotnet run --launch-profile http</code> in <code>Sportify.Api</code>.</p>
            <button class="btn-export accent" id="btn-zone-retry">Retry</button>
          </div>`;
        document.getElementById("btn-zone-retry")?.addEventListener("click", renderZonePanel);
      });
    return;
  }

  ensureZoneState();

  const kindOptions = Object.entries(ZONE_KINDS)
    .map(([k, v]) => `<option value="${k}"${k === combineState.zoneKind ? " selected" : ""}>${v.label}</option>`).join("");

  const available = assembliesForKind(combineState.zoneKind);
  const assemblyOptions = available.length === 0
    ? `<option value="">No build-up system for this kind yet</option>`
    : available.map(a =>
        `<option value="${a.key}"${a.key === combineState.zoneAssembly ? " selected" : ""}>${a.provider} — ${a.system_name}</option>`).join("");

  const assembly = typeof getAssembly === "function" ? getAssembly(combineState.zoneAssembly) : null;
  const totalMm = assembly && typeof assemblyLayerTotalMm === "function" ? assemblyLayerTotalMm(assembly) : null;

  const drawn = combineState.zones.length;
  const totalArea = combineState.zones.reduce((s, z) => s + z.length_m * z.width_m, 0);
  const selected = combineState.selectedKind === "zone" ? getZone(combineState.selectedId) : null;

  el.innerHTML = `
    ${typeof roofFinishSectionHtml === "function" ? roofFinishSectionHtml() : ""}

    <div class="section">
      <label>What are you drawing?</label>
      <select id="zone-kind-select">${kindOptions}</select>
      <p class="hint">${(ZONE_KINDS[combineState.zoneKind] || {}).hint || ""}</p>
    </div>

    <div class="section">
      <label>Build-up system</label>
      <select id="zone-assembly-select">${assemblyOptions}</select>
      ${assembly ? `
        <p class="hint">${assembly.layers.length} layers · <strong>${totalMm} mm</strong> build-up${
          assembly.saturated_kg_m2 ? ` · ${assembly.saturated_kg_m2} kg/m² saturated` : ""}${
          assembly.water_storage_l_m2 ? ` · ${assembly.water_storage_l_m2} L/m² storage` : ""}</p>
        <div style="margin:8px 0">${assemblyStripSvg(assembly)}</div>` : ""}
    </div>

    <div class="section">
      <button class="btn-export accent" id="btn-draw-zone">
        <i class="ti ti-square-plus" aria-hidden="true"></i>Draw on the roof
      </button>
      <p class="hint" id="zone-draw-hint" style="display:none">Tool active — drag a rectangle on the roof (click the button again to cancel).</p>
      <p class="hint">Drag to set the area. Afterwards: drag to move, grab a corner to resize, Delete to remove.</p>
    </div>

    ${selected ? `
      <div class="section">
        <label>Selected: ${(ZONE_KINDS[selected.kind] || {}).label || selected.kind}</label>
        <p class="hint">${selected.length_m.toFixed(1)} × ${selected.width_m.toFixed(1)} m —
           <strong>${(selected.length_m * selected.width_m).toFixed(0)} m²</strong></p>
        <button class="btn-export" id="btn-delete-zone">
          <i class="ti ti-trash" aria-hidden="true"></i>Delete this zone
        </button>
      </div>` : ""}

    ${drawn ? `<div class="section"><p class="hint"><strong>${drawn}</strong> zone(s) drawn, ${totalArea.toFixed(0)} m² total</p></div>` : ""}
  `;

  wireZonePanel();
}

/** A compact section through the build-up, so the choice is visible rather than just named. */
function assemblyStripSvg(assembly) {
  const total = assemblyLayerTotalMm(assembly);
  if (!total) return "";
  return `<div style="display:flex;flex-direction:column;border-radius:3px;overflow:hidden">` +
    assembly.layers.map(l => {
      const f = (typeof ASSEMBLY_LAYER_FUNCTIONS !== "undefined" && ASSEMBLY_LAYER_FUNCTIONS[l.fn]) || { color: "#888", label: l.fn };
      const h = Math.max(4, Math.round((l.mm / total) * 60));
      return `<div title="${l.name} — ${l.mm} mm (${l.src})" style="height:${h}px;background:${f.color}"></div>`;
    }).join("") + `</div>`;
}

function wireZonePanel() {
  if (typeof wireRoofFinishSection === "function") wireRoofFinishSection();

  const kindSel = document.getElementById("zone-kind-select");
  if (kindSel) kindSel.addEventListener("change", () => {
    combineState.zoneKind = kindSel.value;
    // The previous system may not suit the new kind, so fall back to one that does.
    const still = assembliesForKind(combineState.zoneKind).some(a => a.key === combineState.zoneAssembly);
    if (!still) combineState.zoneAssembly = defaultAssemblyFor(combineState.zoneKind);
    renderZonePanel();
  });

  const asmSel = document.getElementById("zone-assembly-select");
  if (asmSel) asmSel.addEventListener("change", () => {
    combineState.zoneAssembly = asmSel.value;
    renderZonePanel();
  });

  const drawBtn = document.getElementById("btn-draw-zone");
  if (drawBtn) drawBtn.addEventListener("click", () => {
    combineState.tool = combineState.tool === "drawZone" ? null : "drawZone";
    // Only one tool armed at a time, or the next canvas click does the wrong thing.
    if (typeof syncAddEntryTool === "function") syncAddEntryTool();
    syncDrawZoneTool();
  });

  const delBtn = document.getElementById("btn-delete-zone");
  if (delBtn) delBtn.addEventListener("click", () => {
    removeZone(combineState.selectedId);
    drawCombineCanvas();
    renderZonePanel();
  });
}

function syncDrawZoneTool() {
  const btn = document.getElementById("btn-draw-zone");
  const hint = document.getElementById("zone-draw-hint");
  if (!btn || !hint) return;
  const active = combineState.tool === "drawZone";
  btn.classList.toggle("active", active);
  hint.style.display = active ? "block" : "none";
}

/** Delete removes the selected zone, matching how every other piece behaves. */
document.addEventListener("keydown", e => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  if (combineState.selectedKind !== "zone" || !combineState.selectedId) return;
  e.preventDefault();
  removeZone(combineState.selectedId);
  drawCombineCanvas();
  renderZonePanel();
});


/* ── Flyout open/close ── */


document.addEventListener("DOMContentLoaded", () => {
});

/* ── Rules ── */

/**
 * Zones that clash with a placed piece.
 *
 * The drop and drag paths already refuse to put a court on a zone, but a zone
 * can be DRAWN over a court, or resized onto one — the block has to work from
 * both directions or it is only half a rule. Reported rather than prevented
 * outright here, so the canvas can show the clash the same way it shows two
 * courts sitting too close.
 */
function findZoneClashes() {
  ensureZoneState();
  const clashes = [];
  combineState.zones.forEach(z => {
    combineState.items.forEach(item => {
      if (item.kind === "vegetation") return;       // a plant belongs in a zone
      const fp = getFootprint(item);
      if (rectsOverlap({ x: z.x_m, y: z.y_m, w: z.length_m, h: z.width_m },
                       { x: item.x_m, y: item.y_m, w: fp.w, h: fp.h })) {
        clashes.push({ zoneId: z.id, itemId: item.id, itemLabel: item.label });
      }
    });
  });
  return clashes;
}

/** Zones extending past the roof — the same check placed pieces already get. */
function findZonesOutOfBounds() {
  ensureZoneState();
  const roof = combineState.roof;
  return combineState.zones
    .filter(z => z.x_m < 0 || z.y_m < 0 ||
                 z.x_m + z.length_m > roof.length + 1e-6 ||
                 z.y_m + z.width_m > roof.width + 1e-6)
    .map(z => z.id);
}

/** Ids of every zone in violation, for the canvas to draw in warning colours. */
function zonesInViolation() {
  const bad = new Set(findZoneClashes().map(c => c.zoneId));
  findZonesOutOfBounds().forEach(id => bad.add(id));
  return bad;
}

/* ── Export ── */

/**
 * The export shape for one zone: a rectangle plus the build-up it is made of.
 * That is all Revit needs — a boundary and a floor type — which is why a zone
 * maps so much more directly than a court ever did.
 */
function buildZonePayload(zone) {
  const kind = ZONE_KINDS[zone.kind] || ZONE_KINDS.planting;
  return {
    id: zone.id,
    kind: zone.kind,
    label: kind.label,
    bounding_box: {
      top_left_x_m: zone.x_m,
      top_left_y_m: zone.y_m,
      width_m: zone.length_m,
      height_m: zone.width_m,
    },
    // The real shape. bounding_box stays for anything that only needs extents;
    // this is what Revit sketches the floor from and what a reload restores.
    points: (zone.points || []).map(p => ({ x_m: p.x_m, y_m: p.y_m })),
    area_m2: zoneAreaM2(zone),
    assembly_key: zone.assemblyKey,
  };
}

/** Rebuilds a zone from its exported form — a reload, or a loaded save file. */
function zoneFromPayload(z, i) {
  const bb = z.bounding_box || {};
  const zone = {
    id: z.id || `zone_${Date.now()}_${i}`,
    kind: z.kind || "green_roof",
    assemblyKey: z.assembly_key || null,
    points: Array.isArray(z.points) && z.points.length >= 3
      ? z.points.map(p => ({ x_m: p.x_m, y_m: p.y_m }))
      // An export from before zones had corners: rebuild the rectangle it was.
      : rectPoints(bb.top_left_x_m || 0, bb.top_left_y_m || 0, bb.width_m || 0, bb.height_m || 0),
  };
  return syncZoneBounds(zone);
}

/** Every distinct build-up used by the drawn zones, so an import creates each floor type once. */
/**
 * Every build-up the export refers to, zones and the roof finish alike.
 *
 * The finish was missing from this list, which meant Revit looked up a system
 * the export had never described and quietly drew no floor. Anything that
 * names an assembly_key has to have that assembly here, or the far side is
 * reading a reference to nothing.
 */
function collectZoneAssemblies() {
  ensureZoneState();
  const seen = new Map();
  const add = key => {
    if (!key || seen.has(key)) return;
    const payload = typeof buildAssemblyPayload === "function" ? buildAssemblyPayload(key) : null;
    if (payload) seen.set(key, payload);
  };
  combineState.zones.forEach(z => add(z.assemblyKey));
  if (typeof roofFinishKey !== "undefined") add(roofFinishKey);
  return [...seen.values()];
}

/**
 * Build-ups an export refers to but cannot describe, because the catalog was
 * never fetched. Silence here produced "no floor type was built for its
 * build-up system" in Revit, with nothing on this side to explain it.
 */
function unresolvedAssemblyKeys() {
  ensureZoneState();
  const keys = new Set(combineState.zones.map(z => z.assemblyKey).filter(Boolean));
  if (typeof roofFinishKey !== "undefined" && roofFinishKey) keys.add(roofFinishKey);
  return [...keys].filter(k => !(typeof getAssembly === "function" && getAssembly(k)));
}
