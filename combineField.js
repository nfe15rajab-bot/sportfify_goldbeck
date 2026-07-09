/**
 * combineField.js — Sportify Combine canvas renderer + interaction
 * Draws a roof boundary and lets the user drag/rotate the pushed
 * sport-field and garden-parcel footprints inside it (top view, plan).
 */

const CVW = 600, CVH = 400, CPAD = 40;

let dragState = null; // { type, startPtX, startPtY, startXm, startYm, scale, roofOx, roofOy }

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

/** Converts a pointer event's client coords into this SVG's viewBox coordinate space. */
function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}

function drawCombineCanvas() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;
  const roof = combineState.roof;
  const { scale, roofPxW, roofPxH, roofOx, roofOy } = combineLayout();

  let el = `
    <text x="${CVW / 2}" y="24" text-anchor="middle" font-size="12"
          font-family="Arial, sans-serif" fill="#444">
      Roof boundary — ${roof.length} m × ${roof.width} m
    </text>
    <rect x="${roofOx}" y="${roofOy}" width="${roofPxW}" height="${roofPxH}"
          fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>
  `;

  const items = [];
  if (combineState.sport)  items.push({ key: "sport",  obj: combineState.sport,  stroke: "#185fa5", fill: "rgba(55,138,221,0.35)"  });
  if (combineState.garden) items.push({ key: "garden", obj: combineState.garden, stroke: "#3b6d11", fill: "rgba(124,179,66,0.35)" });

  // Overlap check (only meaningful once both are present)
  let overlap = false;
  if (items.length === 2) {
    const boxes = items.map(it => {
      const fp = getFootprint(it.obj);
      return { x: it.obj.x_m, y: it.obj.y_m, w: fp.w, h: fp.h };
    });
    overlap = rectsOverlap(boxes[0], boxes[1]);
  }

  let anyOutOfBounds = false;

  items.forEach(it => {
    const fp = getFootprint(it.obj);
    const x = roofOx + it.obj.x_m * scale;
    const y = roofOy + it.obj.y_m * scale;
    const w = fp.w * scale;
    const h = fp.h * scale;
    const outOfBounds =
      it.obj.x_m < 0 || it.obj.y_m < 0 ||
      it.obj.x_m + fp.w > roof.length || it.obj.y_m + fp.h > roof.width;
    if (outOfBounds) anyOutOfBounds = true;

    const selected = combineState.selected === it.key;
    const warn = overlap || outOfBounds;

    el += `
      <rect data-type="${it.key}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${it.fill}" stroke="${warn ? '#c0392b' : it.stroke}"
            stroke-width="${selected ? 2.5 : 1.5}"
            stroke-dasharray="${warn ? '4,2' : 'none'}"
            style="cursor:grab"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="10"
            font-family="Arial, sans-serif" fill="#1a1a18" pointer-events="none">
        ${it.obj.label}${it.obj.rotation ? " (rotated)" : ""}
      </text>
    `;
  });

  svg.innerHTML = el;

  const statusEl = document.getElementById("combine-status");
  if (statusEl) {
    if (!combineState.sport && !combineState.garden) {
      statusEl.textContent = "Push a sport or garden configuration to begin.";
    } else if (overlap) {
      statusEl.textContent = "⚠ Sport and garden footprints overlap.";
    } else if (anyOutOfBounds) {
      statusEl.textContent = "⚠ A footprint extends outside the roof boundary.";
    } else {
      statusEl.textContent = "Layout OK.";
    }
  }
}

function initCombineInteractions() {
  const svg = document.getElementById("combine-canvas");
  if (!svg) return;

  svg.addEventListener("pointerdown", e => {
    const type = e.target.dataset.type;
    if (!type) return;
    combineState.selected = type;
    const obj = combineState[type];
    const { scale, roofOx, roofOy } = combineLayout();
    const pt = svgPoint(svg, e);

    dragState = {
      type,
      startPtX: pt.x, startPtY: pt.y,
      startXm: obj.x_m, startYm: obj.y_m,
      scale, roofOx, roofOy,
    };
    drawCombineCanvas();
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", e => {
    if (!dragState) return;
    const pt = svgPoint(svg, e);
    const dxM = (pt.x - dragState.startPtX) / dragState.scale;
    const dyM = (pt.y - dragState.startPtY) / dragState.scale;
    const obj = combineState[dragState.type];
    obj.x_m = Math.round((dragState.startXm + dxM) * 10) / 10;
    obj.y_m = Math.round((dragState.startYm + dyM) * 10) / 10;
    drawCombineCanvas();
  });

  ["pointerup", "pointercancel"].forEach(evtName =>
    svg.addEventListener(evtName, () => { dragState = null; })
  );
}