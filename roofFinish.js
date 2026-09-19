/**
 * roofFinish.js — what the rest of the roof is made of
 *
 * Everything else in this app is something you PLACE: a court, a bed, a tree.
 * That left the roof itself undefined — and the roof is not empty between the
 * things on it. What is left over is the circulation, and it is built of
 * something: paving on pedestals, a timber deck, gravel.
 *
 * So the finish is not placed. It is the leftover, and its area is whatever
 * the placed things do not take:
 *
 *     finish area  =  roof  −  zones  −  courts
 *
 * Trees do not subtract. A trunk is a point, not an area, and the deck runs
 * on underneath the canopy.
 *
 * ── One thing the model deliberately simplifies ──
 * Constructionally the waterproofing is continuous: a green roof sits ON the
 * deck rather than replacing it. Subtracting is right for the FINISH — what is
 * exposed, what you walk on, what gets costed and scheduled — but the layers
 * underneath genuinely run through. Revit gets the finish as a floor with
 * openings, which is how the exposed surface is actually drawn.
 */

/** Chosen finish, by assembly key. Null until the catalog loads. */
let roofFinishKey = null;

/** Finishes are the systems meant for the leftover, not for a planted bed. */
function finishAssemblies() {
  if (typeof ASSEMBLIES !== "object") return [];
  return Object.entries(ASSEMBLIES)
    .filter(([, a]) => a.category === "finish")
    .map(([key, a]) => ({ key, ...a }));
}

function ensureRoofFinishState() {
  const options = finishAssemblies();
  if (!options.length) { roofFinishKey = null; return; }
  if (!roofFinishKey || !options.some(o => o.key === roofFinishKey)) {
    // Cheapest first, so the default is the one that assumes least.
    roofFinishKey = options.slice().sort((a, b) =>
      finishPricePerM2(a) - finishPricePerM2(b))[0].key;
  }
}

/** Per m² of the system, volume layers priced through their own thickness. */
function finishPricePerM2(assembly) {
  return (assembly?.layers || []).reduce((sum, l) => {
    if (l.price == null) return sum;
    return sum + (l.price_unit === "EUR/m3" ? l.price * ((l.mm || 0) / 1000) : l.price);
  }, 0);
}

/* ── Area ────────────────────────────────────────────────────────────────── */

/**
 * The roof's real area.
 *
 * length × width is the bounding box, which is what every other figure in this
 * app has used. That is fine for a rectangle and wrong for anything pushed
 * from Revit, where the boundary is a polygon — an L-shaped deck would have
 * its finish over-measured by whatever the notch is. The finish is billed by
 * the square metre, so it is worth the shoelace.
 */
function roofPolygonAreaM2() {
  const roof = (typeof combineState !== "undefined" && combineState.roof) || {};
  const pts = roof.boundary;
  if (!Array.isArray(pts) || pts.length < 3) {
    return (roof.length || 0) * (roof.width || 0);
  }
  let twice = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ax = a.x_m ?? a.x ?? a[0], ay = a.y_m ?? a.y ?? a[1];
    const bx = b.x_m ?? b.x ?? b[0], by = b.y_m ?? b.y ?? b[1];
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

/** What the placed things take out of it. */
function occupiedAreaM2() {
  const zones = (typeof combineState !== "undefined" && combineState.zones) || [];
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const zoneArea = zones.reduce((s, z) =>
    s + (typeof zoneAreaM2 === "function" ? zoneAreaM2(z) : (z.length_m || 0) * (z.width_m || 0)), 0);
  // Vegetation is excluded on purpose — see the header.
  const pieceArea = items
    .filter(it => it.kind !== "vegetation")
    .reduce((s, it) => {
      if (typeof getFootprint !== "function") return s;
      const fp = getFootprint(it);
      return s + fp.w * fp.h;
    }, 0);
  return { zoneArea, pieceArea, total: zoneArea + pieceArea };
}

function roofFinishMetrics() {
  // The default has to hold whether or not the Zones panel has been opened —
  // the cost and the export read this without ever rendering the picker.
  ensureRoofFinishState();
  const roofArea = roofPolygonAreaM2();
  const occupied = occupiedAreaM2();
  // Clamped: a layout that overflows its roof is a rule violation reported
  // elsewhere, and a negative area here would be a second, confusing symptom.
  const netArea = Math.max(0, roofArea - occupied.total);
  const assembly = roofFinishKey && typeof getAssembly === "function" ? getAssembly(roofFinishKey) : null;
  const perM2 = assembly ? finishPricePerM2(assembly) : 0;
  return {
    key: roofFinishKey, assembly,
    roofArea, netArea,
    zoneArea: occupied.zoneArea, pieceArea: occupied.pieceArea,
    perM2, cost: assembly ? netArea * perM2 : null,
  };
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

/**
 * Rendered at the top of the Zones flyout rather than in a panel of its own.
 * Zones is already "what is the ground made of"; the finish is the same
 * question asked about everything you did not draw on.
 */
function roofFinishSectionHtml() {
  ensureRoofFinishState();
  const options = finishAssemblies();
  if (!options.length) {
    return `<div class="section">
        <label>The rest of the roof</label>
        <p class="hint">No roof finish systems in the catalog yet.</p>
      </div>`;
  }
  const m = roofFinishMetrics();
  const opts = options.map(o =>
    `<option value="${o.key}"${o.key === roofFinishKey ? " selected" : ""}>${
      o.provider === "Generic" ? o.system_name : `${o.provider} — ${o.system_name}`
    } · €${Math.round(finishPricePerM2(o))}/m²</option>`).join("");

  return `<div class="section">
      <label>The rest of the roof</label>
      <select id="roof-finish-select">${opts}</select>
      <p class="hint">
        Everything you have not drawn on or placed a court on is circulation, and it is
        built of something. This is that surface.
      </p>
      <div class="dims">
        <div class="dim-card"><div class="val">${Math.round(m.netArea)} m²</div><div class="lbl">Finish area</div></div>
        <div class="dim-card"><div class="val">${Math.round(m.roofArea)} m²</div><div class="lbl">Roof</div></div>
        <div class="dim-card"><div class="val">−${Math.round(m.zoneArea + m.pieceArea)} m²</div><div class="lbl">Zones &amp; courts</div></div>
      </div>
      <p class="hint">Trees are not subtracted — a trunk is not an area, and the deck runs on under the canopy.</p>
    </div>`;
}

function wireRoofFinishSection() {
  document.getElementById("roof-finish-select")?.addEventListener("change", e => {
    roofFinishKey = e.target.value;
    if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    if (typeof renderZonePanel === "function") renderZonePanel();
  });
}

/* ── Export ──────────────────────────────────────────────────────────────── */

/**
 * Revit draws this as ONE floor with holes: the roof boundary is the outer
 * loop and every zone and court is an opening. Coplanar, no overlap — which is
 * how the slab would be drawn by hand, and why the openings travel with it
 * rather than being inferred on the far side.
 */
function buildRoofFinishPayload() {
  const m = roofFinishMetrics();
  if (!m.assembly) return null;
  const zones = (typeof combineState !== "undefined" && combineState.zones) || [];
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const openings = [];

  zones.forEach(z => openings.push({
    source: "zone", id: z.id,
    x_m: z.x_m, y_m: z.y_m, length_m: z.length_m, width_m: z.width_m,
  }));
  items.filter(it => it.kind !== "vegetation").forEach(it => {
    if (typeof getFootprint !== "function") return;
    const fp = getFootprint(it);
    openings.push({
      source: "piece", id: it.id,
      x_m: it.x_m, y_m: it.y_m, length_m: fp.w, width_m: fp.h,
    });
  });

  return {
    assembly_key: m.key,
    revit_type_name: `Sportify - ${m.assembly.provider} ${m.assembly.system_name}`,
    net_area_m2: Math.round(m.netArea * 100) / 100,
    roof_area_m2: Math.round(m.roofArea * 100) / 100,
    openings,
  };
}
