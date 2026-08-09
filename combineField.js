/**
 * combineField.js — Sportify Combine canvas renderer + interaction
 * Draws a roof boundary and lets the user drag/rotate any number of
 * pushed pieces (sport fields, activities, garden parcels) inside it —
 * a Y8/JeuxJeuxJeux-style drag-and-drop board. Every "Push to Combine"
 * adds a new independent piece; nothing gets overwritten.
 */

const CVW = 600, CVH = 400, CPAD = 40;

let dragState = null; // { id, startPtX, startPtY, startXm, startYm, scale }

const KIND_COLORS = {
  field:    { stroke: "#185fa5", fill: "rgba(55,138,221,0.35)" },
  activity: { stroke: "#8e44ad", fill: "rgba(155,89,182,0.30)" },
  garden:   { stroke: "#3b6d11", fill: "rgba(124,179,66,0.35)" },
};

/** Returns the on-canvas (possibly rotated) footprint size in meters. */
function getFootprint(obj) {
  const rotated = (obj.rotation % 180) !== 0;
  return {
    w: rotated ? obj.width_m : obj.length_m,
    h: rotated ? obj.length_m : obj.width_m,
  };
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function combineLayout() {
  const roof = combineState.roof;
  const availW = CVW - CPAD * 2;
  const availH = CVH - CPAD * 2 - 30; // room for the title line up top
  const scale = Math.min(availW / roof.length, availH / roof.width);
  const roofPxW = roof.length * scale;
  const roofPxH = roof.width * scale;
  const roofOx = (CVW - roofPxW) / 2;
  const roofOy = 40 + (availH - roofPxH) / 2;
  return { scale, roofPxW, roofPxH, roofOx, roofOy };
}

/**
 * Draws the roof boundary itself. If combineState.roof.boundary holds an
 * exact polygon (from PushRoofBoundaryCommand's sketch extraction), draws
 * that shape. Otherwise falls back to a plain rectangle sized from
 * roof.length / roof.width (bounding box only — no sketch was available).
 */
function roofShapeSvg(roof, scale, roofOx, roofOy, roofPxW, roofPxH) {
  if (roof.boundary && roof.boundary.length >= 3) {
    // Revit's internal Y-axis increases "north" (up), but SVG's Y-axis
    // increases downward — without flipping, the imported shape renders
    // upside-down relative to its true plan orientation. Flipping against
    // the boundary's own height (roof.width) puts north back at the top.
    const pts = roof.boundary
      .map(p => `${roofOx + p.x_m * scale},${roofOy + (roof.width - p.y_m) * scale}`)
      .join(" ");
    return `<polygon points="${pts}" fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }
  return `<rect x="${roofOx}" y="${roofOy}" width="${roofPxW}" height="${roofPxH}"
                fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>`;
}

/** Finds every pair of items whose bounding boxes overlap. Returns a Set of item ids involved in at least one overlap. */
function findOverlappingIds(items) {
  const overlapping = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const aFp = getFootprint(a);
    const aBox = { x: a.x_m, y: a.y_m, w: aFp.w, h: aFp.h };
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const bFp = getFootprint(b);
      const bBox = { x: b.x_m, y: b.y_m, w: bFp.w, h: bFp.h };
      if (rectsOverlap(aBox, bBox)) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

function drawCombineCanvas() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;
  const roof = combineState.roof;
  const items = combineState.items;
  const { scale, roofPxW, roofPxH, roofOx, roofOy } = combineLayout();

  let el = `
    <text x="${CVW / 2}" y="24" text-anchor="middle" font-size="12"
          font-family="Arial, sans-serif" fill="#444">
      Roof boundary — ${roof.length} m × ${roof.width} m
    </text>
    ${roofShapeSvg(roof, scale, roofOx, roofOy, roofPxW, roofPxH)}
  `;

  const overlappingIds = findOverlappingIds(items);
  let anyOutOfBounds = false;

  items.forEach(item => {
    const fp = getFootprint(item);
    const x = roofOx + item.x_m * scale;
    const y = roofOy + item.y_m * scale;
    const w = fp.w * scale;
    const h = fp.h * scale;
    const outOfBounds =
      item.x_m < 0 || item.y_m < 0 ||
      item.x_m + fp.w > roof.length || item.y_m + fp.h > roof.width;
    if (outOfBounds) anyOutOfBounds = true;

    const selected = combineState.selectedId === item.id;
    const warn = overlappingIds.has(item.id) || outOfBounds;
    const colors = KIND_COLORS[item.kind] || KIND_COLORS.field;

    el += `
      <rect data-id="${item.id}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${colors.fill}" stroke="${warn ? '#c0392b' : colors.stroke}"
            stroke-width="${selected ? 2.5 : 1.5}"
            stroke-dasharray="${warn ? '4,2' : 'none'}"
            style="cursor:grab"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="10"
            font-family="Arial, sans-serif" fill="#1a1a18" pointer-events="none">
        ${item.label}${item.rotation ? " (rotated)" : ""}
      </text>
    `;
  });

  svg.innerHTML = el;

  const statusEl = document.getElementById("combine-status");
  if (statusEl) {
    if (items.length === 0) {
      statusEl.textContent = "Push a sport, activity, or garden configuration to begin.";
    } else if (overlappingIds.size > 0) {
      statusEl.textContent = `⚠ ${overlappingIds.size} piece(s) overlap each other.`;
    } else if (anyOutOfBounds) {
      statusEl.textContent = "⚠ One or more pieces extend outside the roof boundary.";
    } else {
      statusEl.textContent = `${items.length} piece(s) placed. Layout OK.`;
    }
  }
}

function initCombineInteractions() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;

  svg.addEventListener("pointerdown", e => {
    const id = e.target.dataset.id;
    if (!id) return;
    const item = combineState.items.find(i => i.id === id);
    if (!item) return;

    combineState.selectedId = id;
    const { scale } = combineLayout();
    const pt = svgPoint(svg, e);

    dragState = {
      id,
      startPtX: pt.x, startPtY: pt.y,
      startXm: item.x_m, startYm: item.y_m,
      scale,
    };
    drawCombineCanvas();
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", e => {
    if (!dragState) return;
    const pt = svgPoint(svg, e);
    const dxM = (pt.x - dragState.startPtX) / dragState.scale;
    const dyM = (pt.y - dragState.startPtY) / dragState.scale;
    const item = combineState.items.find(i => i.id === dragState.id);
    if (!item) return;

    item.x_m = Math.round((dragState.startXm + dxM) * 10) / 10;
    item.y_m = Math.round((dragState.startYm + dyM) * 10) / 10;
    drawCombineCanvas();
  });

  ["pointerup", "pointercancel"].forEach(evtName =>
    svg.addEventListener(evtName, () => { dragState = null; })
  );
}

/** Converts a pointer event's client coords into this SVG's viewBox coordinate space. */
function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}