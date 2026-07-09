/**
 * gardenField.js — Sportify garden cross-section renderer
 * Draws the green roof layer stack as a side-view SVG inside a
 * fixed 600×400 viewBox, plus a small plan outline of the parcel.
 */

const GVW = 600, GVH = 400, GPAD = 36;

const GARDEN_LAYER_COLORS = {
  vegetation:    { light: "#7cb342", dark: "#4a7a28" },
  substrate:     { light: "#8d6e4a", dark: "#5c4527" },
  filter:        { light: "#e0d8c0", dark: "#4a4636" },
  drainage:      { light: "#9e9e9e", dark: "#5a5a5a" },
  rootBarrier:   { light: "#4a4a4a", dark: "#2a2a2a" },
  waterproofing: { light: "#2b3a67", dark: "#1a2440" },
};

const LAYER_ORDER = ["vegetation", "substrate", "filter", "drainage", "rootBarrier", "waterproofing"];

function drawGardenField(roofType, lengthM, widthM, isDark) {
  const svg = document.getElementById("garden-field");
  const roof = GARDEN_ROOF_TYPES[roofType] || GARDEN_ROOF_TYPES.extensive;
  const layers = roof.layers;

  const totalThickness = LAYER_ORDER.reduce((s, k) => s + layers[k].thickness_m, 0);

  // Cross-section band — deliberately narrower than the viewBox so there's
  // always room for labels + leader lines to the right without clipping.
  const bandX = GPAD;
  const bandW = 200;
  const sectionTop = 40;
  const sectionMaxH = 170;
  const pxPerM = sectionMaxH / totalThickness;

  const labelX = bandX + bandW + 14;
  const MIN_LABEL_ROW = 16; // guaranteed vertical space per label, regardless of band height

  // ── Pass 1: compute true band positions/heights (visual min 3px) ──
  let y = sectionTop;
  const bands = LAYER_ORDER.map(key => {
    const layer = layers[key];
    const h = Math.max(layer.thickness_m * pxPerM, 3);
    const top = y;
    y += h;
    return { key, layer, top, h };
  });
  const deckH = 22;
  const deckTop = y;
  y += deckH;

  const rows = [
    ...bands.map(b => ({
      text: `${b.layer.material} (${(b.layer.thickness_m * 100).toFixed(1)} cm)`,
      center: b.top + b.h / 2,
    })),
    { text: "Structural deck (existing)", center: deckTop + deckH / 2 },
  ];

  // ── Pass 2: lay out labels top-to-bottom with fixed minimum spacing,
  // and a thin leader line back to each band's true vertical center ──
  let labelY = sectionTop + MIN_LABEL_ROW / 2;
  let labelsEl = "";
  let leadersEl = "";
  const textColor = isDark ? "#ccc" : "#444";
  const leaderColor = isDark ? "#666" : "#bbb";

  rows.forEach(row => {
    labelsEl += `
      <text x="${labelX}" y="${labelY + 3.5}"
            font-size="9.5" fill="${textColor}" font-family="Arial, sans-serif">
        ${row.text}
      </text>
    `;
    leadersEl += `
      <line x1="${bandX + bandW}" y1="${row.center}" x2="${labelX - 4}" y2="${labelY}"
            stroke="${leaderColor}" stroke-width="0.75"/>
    `;
    labelY += MIN_LABEL_ROW;
  });

  // ── Draw bands ──
  let bandsEl = "";
  bands.forEach(b => {
    const color = GARDEN_LAYER_COLORS[b.key][isDark ? "dark" : "light"];
    bandsEl += `
      <rect x="${bandX}" y="${b.top}" width="${bandW}" height="${b.h}"
            fill="${color}" stroke="${isDark ? '#000' : '#fff'}" stroke-width="0.5"/>
    `;
  });
  bandsEl += `
    <rect x="${bandX}" y="${deckTop}" width="${bandW}" height="${deckH}"
          fill="${isDark ? '#3a3a3a' : '#bbb'}" stroke="${isDark ? '#000' : '#fff'}" stroke-width="0.5"/>
  `;

  // ── Plan-view parcel outline (bottom portion, below the cross-section) ──
  const planTop = Math.max(y, labelY) + 30;
  const planMaxW = GVW - GPAD * 2 - 40;
  const planMaxH = GVH - planTop - 20;
  const aspect = lengthM / widthM;
  let pw, ph;
  if (aspect > planMaxW / planMaxH) { pw = planMaxW; ph = pw / aspect; }
  else { ph = planMaxH; pw = ph * aspect; }
  const px = (GVW - pw) / 2;

  const planEl = `
    <rect x="${px}" y="${planTop}" width="${pw}" height="${ph}"
          fill="${isDark ? '#2d3d2d' : '#c8e6c9'}" stroke="${isDark ? '#aaa' : '#555'}" stroke-width="1.5"/>
    <text x="${GVW / 2}" y="${planTop - 8}" text-anchor="middle" font-size="11"
          fill="${isDark ? '#aaa' : '#666'}" font-family="Arial, sans-serif">
      Parcel plan view — ${lengthM} m × ${widthM} m
    </text>
  `;

  svg.innerHTML = `${bandsEl}${leadersEl}${labelsEl}${planEl}`;
}