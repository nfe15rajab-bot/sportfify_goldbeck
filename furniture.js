/**
 * furniture.js — benches, tables, bins, bollards and lights
 *
 * The fourth thing you can put on the roof, after courts, ground and planting.
 *
 * ── Why this file is thinner than the sports ──
 * A padel court needed its geometry in code because the FIP decides it. A
 * bench has no governing body: it is 1,800 mm because ABES made it that way.
 * So there is nothing to encode here — every dimension, weight and price comes
 * from the catalog, and this file is only the picking, the drawing and the
 * arithmetic.
 *
 * ── Placed, not drawn ──
 * Same act as a tree: you pick a product and put it somewhere. So it works the
 * way the Plants panel works, and for the same reason — a bench has a position
 * and a footprint, not an area you mark out.
 *
 * ── Furniture does not subtract from the roof finish ──
 * A bench sits ON the paving. Courts and planted zones cut a hole in the
 * finish because they replace it; furniture stands on it, so the surface runs
 * underneath and the leftover area is unchanged.
 */

const FURNITURE_API = "http://localhost:5107/api/Furniture";

let FURNITURE = {};
let furnitureLoaded = false;

// Category first, then the product inside it. One dropdown holding every
// bench, bin, bollard and light stops being findable the moment the catalog is
// real — and a catalog that cannot be added to without becoming unusable is
// not much of a catalog.
const furnitureState = { category: null, key: null };

/** How each category reads on the canvas — it has to be legible at 2 m wide. */
const FURNITURE_CATEGORIES = {
  bench:   { label: "Benches",  short: "Bench",   colour: "#b98a4e", shape: "bar" },
  table:   { label: "Tables",   short: "Table",   colour: "#a8763f", shape: "table" },
  bin:     { label: "Bins",     short: "Bin",     colour: "#6f7681", shape: "round" },
  bollard: { label: "Bollards", short: "Bollard", colour: "#8a9099", shape: "round" },
  light:   { label: "Lights",   short: "Light",   colour: "#e0b44c", shape: "glow" },
};

async function loadFurniture() {
  const res = await fetch(FURNITURE_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Furniture API returned ${res.status}`);
  const rows = await res.json();

  FURNITURE = {};
  rows.forEach(r => {
    FURNITURE[r.key] = {
      key: r.key,
      manufacturer: r.manufacturer,
      product: r.productName,
      label: `${r.manufacturer.split(" (")[0]} ${r.productName}`,
      category: r.category,
      description: r.description || "",
      material: r.material || "",
      length_m: r.lengthM, width_m: r.widthM, height_m: r.heightM,
      dimensions_published: !!r.dimensionsPublished,
      seats: r.seats || 0,
      weight_kg: r.weightKg ?? null,
      weight_published: !!r.weightPublished,
      capacity_l: r.capacityLitres ?? null,
      price: r.priceValue ?? null,
      price_quoted: !!r.priceIsQuoted,
      cost_group: r.costGroupDin276 || null,
      source_url: r.sourceUrl || null,
      // Empty for everything seeded. A photograph is added per product, by a
      // person who has decided that picture may be used — see furnitureFigureHtml().
      image_url: r.imageUrl || null,
      image_credit: r.imageCredit || null,
    };
  });

  furnitureLoaded = true;
  if (!furnitureState.category || !furnitureInCategory(furnitureState.category).length) {
    furnitureState.category = furnitureCategoriesPresent()[0] || null;
  }
  ensureFurnitureSelection();
  return FURNITURE;
}

/** Only the categories the catalog actually has something in. */
function furnitureCategoriesPresent() {
  return Object.keys(FURNITURE_CATEGORIES)
    .filter(cat => Object.values(FURNITURE).some(f => f.category === cat));
}

function furnitureInCategory(cat) {
  return Object.values(FURNITURE)
    .filter(f => f.category === cat)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Keeps the chosen product inside the chosen category. Switching to Bins while
 * a bench is still selected would show one product and describe another.
 */
function ensureFurnitureSelection() {
  const inCat = furnitureInCategory(furnitureState.category);
  if (!inCat.length) { furnitureState.key = null; return; }
  if (!furnitureState.key || FURNITURE[furnitureState.key]?.category !== furnitureState.category) {
    furnitureState.key = inCat[0].key;
  }
}

function activeFurniture() {
  return furnitureState.key ? FURNITURE[furnitureState.key] : null;
}

/* ── What the roof adds up to ────────────────────────────────────────────── */

/**
 * Seats, weight and cost across everything placed.
 *
 * Seats is the one worth having: "how many people can sit up here" is a
 * question a client asks early, and counting benches by hand is the only
 * alternative.
 */
function furnitureTotals() {
  const items = (typeof combineState !== "undefined" && combineState.items) || [];
  const placed = items.filter(it => it.kind === "furniture");
  const byProduct = new Map();

  let seats = 0, weight_kg = 0, cost = 0, unpriced = 0, unweighed = 0;
  placed.forEach(it => {
    const f = it.sourceJson?.furniture || {};
    seats += f.seats || 0;
    if (f.weight_kg != null) weight_kg += f.weight_kg; else unweighed++;
    if (f.price != null) cost += f.price; else unpriced++;

    const key = f.key || it.label;
    const row = byProduct.get(key) || {
      label: f.label || it.label, category: f.category || "bench",
      count: 0, seatsEach: f.seats || 0, unitPrice: f.price ?? null,
      unitWeight: f.weight_kg ?? null, costGroup: f.cost_group || null,
    };
    row.count += 1;
    byProduct.set(key, row);
  });

  return {
    count: placed.length, seats, weight_kg, cost, unpriced, unweighed,
    byProduct: [...byProduct.values()].sort((a, b) => b.count - a.count),
  };
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * A bench is 1.8 x 0.6 m. On a 60 m roof that is a few pixels, so this draws a
 * shape that reads at that size rather than a miniature of the real thing —
 * a bar for a bench, a circle for a bin, a glow for a light.
 */
function furnitureSvg(x, y, w, h, item, selected, strokeColour, isPlanner) {
  const f = item.sourceJson?.furniture || {};
  const cat = FURNITURE_CATEGORIES[f.category] || FURNITURE_CATEGORIES.bench;
  const cx = x + w / 2, cy = y + h / 2;
  const cursor = isPlanner ? "grab" : "pointer";
  const sw = selected ? 2 : 1;

  if (cat.shape === "round" || cat.shape === "glow") {
    const r = Math.max(2, Math.min(w, h) / 2);
    let out = "";
    if (cat.shape === "glow") {
      // A light is drawn with its pool, because what matters about a bollard
      // light on a plan is the bit of route it actually lights.
      out += `<circle cx="${cx}" cy="${cy}" r="${r * 4}" fill="${escapeHtml(cat.colour)}" fill-opacity="0.12" pointer-events="none"/>`;
    }
    out += `<circle data-id="${escapeHtml(item.id)}" cx="${cx}" cy="${cy}" r="${r}"
                    fill="${escapeHtml(cat.colour)}" fill-opacity="0.85"
                    stroke="${strokeColour}" stroke-width="${sw}" style="cursor:${cursor}"/>`;
    return out;
  }

  if (cat.shape === "table") {
    // Table with a bench each side — the thing that makes a picnic set read as
    // one rather than as a big bench.
    const benchH = Math.max(1.5, h * 0.22);
    return `
      <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${escapeHtml(cat.colour)}" fill-opacity="0.32"
            stroke="${strokeColour}" stroke-width="${sw}" style="cursor:${cursor}"/>
      <rect x="${x}" y="${cy - h * 0.16}" width="${w}" height="${h * 0.32}"
            fill="${escapeHtml(cat.colour)}" fill-opacity="0.9" pointer-events="none"/>
      <rect x="${x}" y="${y}" width="${w}" height="${benchH}"
            fill="${escapeHtml(cat.colour)}" fill-opacity="0.65" pointer-events="none"/>
      <rect x="${x}" y="${y + h - benchH}" width="${w}" height="${benchH}"
            fill="${escapeHtml(cat.colour)}" fill-opacity="0.65" pointer-events="none"/>`;
  }

  // Bench: a bar, with a thinner line behind it when it has a backrest —
  // enough to tell the two apart at roof scale.
  const seatH = Math.max(1.5, h * 0.55);
  return `
    <rect data-id="${escapeHtml(item.id)}" x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${escapeHtml(cat.colour)}" fill-opacity="0.25"
          stroke="${strokeColour}" stroke-width="${sw}" style="cursor:${cursor}"/>
    <rect x="${x}" y="${y + (h - seatH) / 2}" width="${w}" height="${seatH}"
          fill="${escapeHtml(cat.colour)}" fill-opacity="0.9" pointer-events="none"/>`;
}

function isFurnitureItem(item) {
  return item?.kind === "furniture";
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

/* The picker moved to components.js, where the supplier catalogue and the
   design team's families are offered together. What stays here is the catalogue
   itself, the plan-view drawing and the roof totals. */

function pushFurnitureToCombine() {
  const f = activeFurniture();
  if (!f || typeof addCombineItem !== "function") return;

  addCombineItem({
    kind: "furniture",
    label: f.product,
    length_m: f.length_m,
    width_m: f.width_m,
    sourceJson: {
      version: "1.0", generator: "Sportify",
      furniture: {
        key: f.key,
        manufacturer: f.manufacturer,
        product: f.product,
        label: f.label,
        category: f.category,
        length_m: f.length_m, width_m: f.width_m, height_m: f.height_m,
        dimensions_published: f.dimensions_published,
        // Carried with the placement so a saved layout keeps the product it
        // was given, even if the catalog price or weight moves afterwards.
        seats: f.seats,
        weight_kg: f.weight_kg,
        weight_published: f.weight_published,
        capacity_l: f.capacity_l,
        price: f.price,
        price_quoted: f.price_quoted,
        cost_group: f.cost_group,
        material: f.material,
        // Description comes along because the drawing reads it — armrests are
        // only ever mentioned there — and the inspector draws placed pieces too.
        description: f.description,
        source_url: f.source_url,
        image_url: f.image_url,
        image_credit: f.image_credit,
        revit_family_name: `Sportify - ${f.manufacturer.split(" (")[0]} ${f.product}`,
      },
    },
  });
  if (typeof setMode === "function") setMode("combine");
}

