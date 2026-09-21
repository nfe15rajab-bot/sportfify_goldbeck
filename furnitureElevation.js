/**
 * furnitureElevation.js — what does this thing actually look like?
 *
 * A bench on the roof plan is a brown bar. The panel beside it says 1.80 x 0.70
 * m, 0.80 m high, 3 seats — all true, and none of it answers "is that the one
 * with the back on it".
 *
 * -- Why this is drawn and not photographed --
 * The manufacturers' product photos belong to the manufacturers. Copying them
 * into a tool that gets shown to a client is a licensing question, not a
 * technical one; the same reason the catalog is typed by hand rather than
 * scraped. So the picture is DRAWN, from the dimensions already in the
 * database — which has the side benefit of being right by construction: the
 * drawing cannot disagree with the numbers, because it is made of them.
 *
 * Where a real photograph IS cleared for use, the catalog carries a link and
 * that wins. See furnitureFigureHtml() at the bottom.
 *
 * -- The piece and its dimensions, nothing else --
 * Length below, height beside, the way they would be on a drawing. There was a
 * scale figure here too; it was noise at the size this is actually viewed at,
 * and the two labels already say how big the thing is.
 */

/**
 * Pixels reserved to the right of the piece for the height dimension. Fixed in
 * pixels rather than metres because it holds a text label, and text does not
 * scale with the drawing.
 */
const HEIGHT_RULE_PX = 40;

/** How far a bollard light washes the ground either side of itself. */
const LIGHT_POOL_RADIUS_M = 1.1;

/**
 * The side view, as an <svg> string.
 *
 * `f` is a catalog entry in the shape loadFurniture() builds — length_m,
 * height_m, category, description.
 */
function furnitureElevationSvg(f, opts) {
  opts = opts || {};
  const W = opts.width || 268;
  const H = opts.height || 152;
  // Thumbnail mode: the shape only, filling the box. At tray size a dimension
  // line is longer than the bench it measures.
  const bare = !!opts.bare;

  const cat = (typeof FURNITURE_CATEGORIES !== "undefined" && FURNITURE_CATEGORIES[f.category])
            || { colour: "#b98a4e" };
  const colour = cat.colour;

  const L = Math.max(0.05, f.length_m || 0.5);
  const h = Math.max(0.05, f.height_m || 0.5);

  const padL = bare ? 2 : 8, padR = bare ? 2 : 8;
  const padTop = bare ? 2 : 8, padBottom = bare ? 2 : 24;
  // A bollard light throws its pool both ways, and the piece itself sits at the
  // left edge — so the drawing is given room on that side, or half the pool is
  // sliced off and the light looks like it only shines one way. In a thumbnail
  // the full pool would be twenty times the width of the bollard casting it,
  // leaving a hairline post in a wash of colour, so it is drawn short.
  const poolR = f.category === "light" ? (bare ? 0.35 : LIGHT_POOL_RADIUS_M) : 0;
  const bleedL = poolR, bleedR = poolR;
  const riseM = h * (bare ? 1 : 1.04);
  // Width has to hold the piece, its pool if it has one, and the height label.
  // Solved for s directly rather than reserving a lane in metres, which would
  // depend on the s it is helping to compute.
  const fixedPx = bare ? 0 : HEIGHT_RULE_PX;
  const perMetre = bleedL + L + bleedR;
  const s = Math.min((W - padL - padR - fixedPx) / perMetre,
                     (H - padTop - padBottom) / riseM);

  // Centred both ways. A bollard is a hairline in a wide box and a bench is a
  // wide bar in a short one; neither should sit in a corner of it.
  const originX = (W - (perMetre * s + fixedPx)) / 2;
  const groundY = bare ? (H + h * s) / 2 : H - padBottom;
  const X = m => originX + (bleedL + m) * s;   // metres from the left edge of the piece
  const Y = m => groundY - m * s;              // metres above the ground

  /** A rectangle given in metres, with the ground at zero. */
  const box = (x0, y0, x1, y1, fill, op) =>
    `<rect x="${X(x0).toFixed(1)}" y="${Y(y1).toFixed(1)}" ` +
    `width="${((x1 - x0) * s).toFixed(1)}" height="${((y1 - y0) * s).toFixed(1)}" ` +
    `fill="${fill}" fill-opacity="${op}"/>`;

  let art;
  switch (f.category) {
    case "bench":   art = benchArt(f, L, h, box, colour); break;
    case "table":   art = tableArt(L, h, box, colour); break;
    case "bin":     art = binArt(L, h, X, Y, box, colour); break;
    case "light":   art = bollardArt(L, h, X, Y, box, colour, poolR); break;
    case "bollard": art = bollardArt(L, h, X, Y, box, colour, 0); break;
    default:        art = box(0, 0, L, h, colour, 0.75);
  }

  return `
<svg class="furniture-elevation" viewBox="0 0 ${W} ${H}" width="100%" height="${H}"
     role="img" aria-label="${escapeHtml(f.product || "Furniture")}, ${L} m long and ${h} m high, drawn to scale">
  <!-- Everything here stands on a roof, so there is always a ground line. -->
  ${bare ? "" : `<line x1="0" y1="${groundY}" x2="${W}" y2="${groundY}"
        stroke="currentColor" stroke-opacity="0.45" stroke-width="1"/>`}
  ${art}
  ${bare ? "" : dimensionRule(X(0), X(L), groundY + 9, L)}
  ${bare ? "" : heightRule(X(L) + 6, Y(h), groundY, h)}
</svg>`;
}

/* -- One shape per category ----------------------------------------------- */

/**
 * The backrest is not a flag in the catalog — it falls out of the height. A
 * bench you sit on is about 450 mm; anything much taller is tall because it has
 * a back, which is exactly the thing the picture has to show.
 */
function benchArt(f, L, h, box, colour) {
  const hasBack = h >= 0.62;
  const seatTop = hasBack ? Math.min(0.45, h - 0.12) : h;
  const slab = 0.05;
  const legW = Math.max(0.04, L * 0.035);

  let out = "";
  // Legs, set in from the ends the way a bench frame is.
  out += box(L * 0.08, 0, L * 0.08 + legW, seatTop - slab, colour, 0.55);
  out += box(L * 0.92 - legW, 0, L * 0.92, seatTop - slab, colour, 0.55);
  out += box(0, seatTop - slab, L, seatTop, colour, 0.92);

  if (hasBack) {
    out += box(L * 0.08, seatTop, L * 0.08 + legW, h, colour, 0.55);
    out += box(L * 0.92 - legW, seatTop, L * 0.92, h, colour, 0.55);
    out += box(L * 0.06, h - 0.16, L * 0.94, h - 0.02, colour, 0.85);
    out += box(L * 0.06, h - 0.30, L * 0.94, h - 0.22, colour, 0.70);
  }

  // Armrests, when the catalog says there are any. It is the one visible
  // difference between two benches of the same size, and it decides whether
  // someone who needs a push to stand up can use it.
  if (/armrest|armlehne/i.test(f.description || "")) {
    const armY = seatTop + 0.22;
    out += box(0, armY - 0.04, L * 0.10, armY, colour, 0.80);
    out += box(L * 0.90, armY - 0.04, L, armY, colour, 0.80);
  }
  return out;
}

/** A picnic set: the table, with the near bench in front of it. */
function tableArt(L, h, box, colour) {
  const topT = 0.05, legW = Math.max(0.04, L * 0.035), seatH = 0.45;
  let out = "";
  out += box(L * 0.14, 0, L * 0.14 + legW, h - topT, colour, 0.45);
  out += box(L * 0.86 - legW, 0, L * 0.86, h - topT, colour, 0.45);
  out += box(0, h - topT, L, h, colour, 0.80);
  // The near bench crosses in front of the table legs, which is what makes it
  // read as one object rather than a table and a bench that happen to touch.
  out += box(L * 0.06, 0, L * 0.06 + legW, seatH - 0.04, colour, 0.70);
  out += box(L * 0.94 - legW, 0, L * 0.94, seatH - 0.04, colour, 0.70);
  out += box(0, seatH - 0.04, L, seatH, colour, 0.95);
  return out;
}

/** A bin: body, rim, and the opening — the bit that says which way up it is. */
function binArt(L, h, X, Y, box, colour) {
  const bodyTop = h * 0.88;
  const inset = L * 0.06;
  const body = `<polygon points="${X(inset).toFixed(1)},${Y(0).toFixed(1)} ` +
    `${X(L - inset).toFixed(1)},${Y(0).toFixed(1)} ` +
    `${X(L).toFixed(1)},${Y(bodyTop).toFixed(1)} ` +
    `${X(0).toFixed(1)},${Y(bodyTop).toFixed(1)}" fill="${colour}" fill-opacity="0.8"/>`;
  return body
    + box(-0.01, bodyTop, L + 0.01, h, colour, 0.95)
    + box(L * 0.22, bodyTop + 0.01, L * 0.78, h - 0.01, "#000", 0.35);
}

/**
 * A bollard, conical the way the product is. `poolR` above zero makes it a
 * bollard light: a lit head and a wash of that radius on the ground.
 */
function bollardArt(L, h, X, Y, box, colour, poolR) {
  const lit = poolR > 0;
  const halfB = L / 2, halfT = L * 0.375;   // 102 mm at the base, 76 mm at the top
  const cx = L / 2;
  const shaftTop = lit ? h - 0.14 : h;

  const shaft = `<polygon points="${X(cx - halfB).toFixed(1)},${Y(0).toFixed(1)} ` +
    `${X(cx + halfB).toFixed(1)},${Y(0).toFixed(1)} ` +
    `${X(cx + halfT).toFixed(1)},${Y(shaftTop).toFixed(1)} ` +
    `${X(cx - halfT).toFixed(1)},${Y(shaftTop).toFixed(1)}" fill="${colour}" fill-opacity="0.85"/>`;

  if (!lit) return shaft;

  // The pool of light, because that is the whole point of the product — the
  // plan view draws it too, for the same reason.
  const pool = `<polygon points="${X(cx).toFixed(1)},${Y(shaftTop).toFixed(1)} ` +
    `${X(cx - poolR).toFixed(1)},${Y(0).toFixed(1)} ` +
    `${X(cx + poolR).toFixed(1)},${Y(0).toFixed(1)}" fill="${colour}" fill-opacity="0.13"/>`;
  return pool + shaft + box(cx - halfT - 0.01, shaftTop, cx + halfT + 0.01, h, colour, 1);
}

/* -- The two dimensions, drawn the way they would be on a drawing ---------- */

function dimensionRule(x0, x1, y, metres) {
  const mid = (x0 + x1) / 2;
  return `
  <g stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <line x1="${x0.toFixed(1)}" y1="${y}" x2="${x1.toFixed(1)}" y2="${y}"/>
    <line x1="${x0.toFixed(1)}" y1="${y - 3}" x2="${x0.toFixed(1)}" y2="${y + 3}"/>
    <line x1="${x1.toFixed(1)}" y1="${y - 3}" x2="${x1.toFixed(1)}" y2="${y + 3}"/>
  </g>
  <text x="${mid.toFixed(1)}" y="${y + 13}" text-anchor="middle"
        font-size="9" fill="currentColor" fill-opacity="0.75">${metres.toFixed(2)} m</text>`;
}

function heightRule(x, yTop, yGround, metres) {
  // Skipped when the piece is too short to label without the text colliding
  // with the ground line.
  if (yGround - yTop < 22) return "";
  return `
  <g stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <line x1="${x.toFixed(1)}" y1="${yTop.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yGround.toFixed(1)}"/>
    <line x1="${(x - 3).toFixed(1)}" y1="${yTop.toFixed(1)}" x2="${(x + 3).toFixed(1)}" y2="${yTop.toFixed(1)}"/>
  </g>
  <text x="${(x + 5).toFixed(1)}" y="${((yTop + yGround) / 2 + 3).toFixed(1)}"
        font-size="9" fill="currentColor" fill-opacity="0.75">${metres.toFixed(2)} m</text>`;
}

/* -- What the panels actually call ----------------------------------------- */

/**
 * A photograph the catalog says may be used, if there is one; the drawing
 * otherwise.
 *
 * image_url is empty for everything seeded, deliberately. A photograph goes in
 * only once someone has decided that particular picture may be used — a
 * supplier sends one, or Goldbeck photographs an installed bench — and that
 * decision belongs to a person, one product at a time, not to this code.
 *
 * A broken link falls back to the drawing rather than leaving a torn-image
 * icon: the URL points at someone else's server and can stop working without
 * anyone here touching anything.
 */
function furnitureFigureHtml(f, opts) {
  if (!f) return "";
  opts = opts || {};
  const caption = "Drawn to scale from the catalogue dimensions";

  if (f.image_url) {
    const credit = f.image_credit || f.manufacturer || "";
    return `
      <figure class="furniture-figure" data-furniture-key="${escapeHtml(f.key)}">
        <img src="${safeUrl(f.image_url)}" alt="${escapeHtml(f.product)}" loading="lazy"/>
        ${credit ? `<figcaption class="hint">Photo: ${escapeHtml(credit)}</figcaption>` : ""}
      </figure>`;
  }

  return `
    <figure class="furniture-figure">
      ${furnitureElevationSvg(f, opts)}
      <figcaption class="hint">${caption}</figcaption>
    </figure>`;
}

/**
 * A photograph that would not load is swapped for the drawing of the same piece. An image's error event does not bubble, so one listener in the capture phase watches
 * for it: no inline onerror handler in the markup (the page's Content-Security-Policy allows no inline script).
 */
document.addEventListener("error", e => {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.closest && t.closest(".furniture-figure[data-furniture-key]")) furnitureImageFailed(t);
}, true);

/** Swaps a photograph that would not load for the drawing of the same piece. */
function furnitureImageFailed(img) {
  const fig = img.closest(".furniture-figure");
  if (!fig) return;
  const f = (typeof FURNITURE !== "undefined" && FURNITURE[fig.dataset.furnitureKey]) || null;
  // Nothing to fall back to — better an empty space than a torn-image icon.
  fig.outerHTML = f ? furnitureFigureHtml({ ...f, image_url: null }) : "";
}
