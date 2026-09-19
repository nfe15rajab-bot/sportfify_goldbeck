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

function addZone(x_m, y_m, length_m, width_m) {
  ensureZoneState();
  const zone = {
    id: `zone_${Date.now()}_${zoneCounter++}`,
    kind: combineState.zoneKind,
    assemblyKey: combineState.zoneAssembly,
    x_m: snapToGrid(x_m),
    y_m: snapToGrid(y_m),
    length_m: snapToGrid(length_m),
    width_m: snapToGrid(width_m),
  };
  combineState.zones.push(zone);
  return zone;
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

    out += `
      <rect data-zone-id="${z.id}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${kind.color}" fill-opacity="${selected ? 0.5 : 0.35}"
            stroke="${bad ? "#ef4444" : kind.color}" stroke-width="${selected ? 2.5 : bad ? 2 : 1}"
            stroke-dasharray="${bad ? "4,2" : "none"}"
            style="cursor:${isPlanner ? "move" : "pointer"}"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="10"
            font-family="'Titillium Web', Arial, sans-serif" fill="#f4f4f2"
            pointer-events="none" opacity="0.9">
        ${kind.short} · ${(z.length_m * z.width_m).toFixed(0)} m²${bad ? " ⚠" : ""}
      </text>`;

    if (selected && isPlanner) {
      // One handle per corner. Which corner is grabbed decides which edges move,
      // so a zone can be resized from any side without a separate mode.
      [["nw", x, y], ["ne", x + w, y], ["se", x + w, y + h], ["sw", x, y + h]].forEach(([corner, hx, hy]) => {
        out += `<rect data-zone-handle="${corner}" data-zone-id="${z.id}"
                      x="${hx - ZONE_HANDLE / 2}" y="${hy - ZONE_HANDLE / 2}"
                      width="${ZONE_HANDLE}" height="${ZONE_HANDLE}"
                      fill="#f4f4f2" stroke="${kind.color}" stroke-width="1"
                      style="cursor:${corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize"}"/>`;
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
              text-anchor="middle" font-size="10" fill="#f4f4f2" pointer-events="none">
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

function toggleZoneFlyout(force) {
  // The flyout lives on the Combine canvas, so opening it from the rail means
  // going there first — otherwise the button appears to do nothing from Sport.
  if ((force === undefined || force) && typeof setMode === "function" && activeMode !== "combine") {
    setMode("combine");
  }
  const fly = document.getElementById("zone-flyout");
  const btn = document.getElementById("btn-zone-toggle");
  if (!fly) return;
  const open = force !== undefined ? force : fly.hidden;
  fly.hidden = !open;
  if (btn) btn.classList.toggle("active", open);
  if (open) renderZonePanel();
  // Closing the flyout disarms the tool — leaving it armed behind a hidden
  // panel means the next canvas click draws a zone nobody asked for.
  else if (combineState.tool === "drawZone") { combineState.tool = null; syncDrawZoneTool(); }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-zone-toggle")?.addEventListener("click", () => toggleZoneFlyout());
  document.getElementById("btn-zone-close")?.addEventListener("click", () => toggleZoneFlyout(false));
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
    area_m2: zone.length_m * zone.width_m,
    assembly_key: zone.assemblyKey,
  };
}

/** Every distinct build-up used by the drawn zones, so an import creates each floor type once. */
function collectZoneAssemblies() {
  ensureZoneState();
  const seen = new Map();
  combineState.zones.forEach(z => {
    if (!z.assemblyKey || seen.has(z.assemblyKey)) return;
    const payload = typeof buildAssemblyPayload === "function" ? buildAssemblyPayload(z.assemblyKey) : null;
    if (payload) seen.set(z.assemblyKey, payload);
  });
  return [...seen.values()];
}
