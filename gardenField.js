/**
 * gardenField.js — Sportify garden preview renderer
 * Draws a top-view rectangle, generic internal pattern, and grid lines
 * with dynamic dimensions for functional and vegetable landscaping zones.
 */

// Nature palette throughout — functional (paths/hardscape) reads as warm
// stone/sand rather than a cool UI-chrome tint, vegetation as vivid green.
const GARDEN_CAT_COLORS = {
  functional: { light: "#e8dcc8", dark: "#3a3226", grid: "#d9c8a8", stroke: "#8a7355" },
  vegetation: { light: "#c3f0a8", dark: "#1d3d14", grid: "#a8e685", stroke: "#3fa832" }
};

function drawGardenField(itemId, length, width, isDark) {
  const item = GARDEN_ITEMS[itemId];
  if (!item) return;
  const svg = document.getElementById("garden-field");
  if (!svg) return;

  const VW = 600, VH = 400, PAD = 45;
  const aspect = length / width;
  let fw, fh;

  if (aspect > (VW - PAD * 2) / (VH - PAD * 2)) {
    fw = VW - PAD * 2; fh = fw / aspect;
  } else {
    fh = VH - PAD * 2; fw = fh * aspect;
  }
  const ox = (VW - fw) / 2, oy = (VH - fh) / 2;

  const colors = GARDEN_CAT_COLORS[item.category] || GARDEN_CAT_COLORS.functional;
  const fillMat = isDark ? colors.dark : colors.light;
  const gridLine = isDark ? "#3c3c3a" : colors.grid;
  const perimeter = isDark ? "#aaa" : colors.stroke;
  const txtColor = isDark ? "#eee" : "#222";
  const dimColor = isDark ? "#bbb" : "#666";

  svg.innerHTML = `
    <defs>
      <pattern id="gardenPattern" patternUnits="userSpaceOnUse" width="16" height="16">
        <rect width="16" height="16" fill="${fillMat}"/>
        <line x1="0" y1="0" x2="16" y2="0" stroke="${gridLine}" stroke-width="0.5"/>
        <line x1="0" y1="0" x2="0"  y2="16" stroke="${gridLine}" stroke-width="0.5"/>
      </pattern>
    </defs>
    <rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" fill="url(#gardenPattern)" stroke="${perimeter}" stroke-width="2" rx="4"/>
    <text x="${ox + fw / 2}" y="${oy + fh / 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="700" fill="${txtColor}" font-family="'Titillium Web', Arial, sans-serif">
      ${item.label}
    </text>
    <text x="${ox + fw / 2}" y="${oy - 14}" text-anchor="middle" font-size="12" font-weight="600" fill="${dimColor}" font-family="'Titillium Web', Arial, sans-serif">
      ${length.toFixed(1)} m
    </text>
    <text x="${ox - 14}" y="${oy + fh / 2}" text-anchor="middle" font-size="12" font-weight="600" fill="${dimColor}" font-family="'Titillium Web', Arial, sans-serif" transform="rotate(-90, ${ox - 14}, ${oy + fh / 2})">
      ${width.toFixed(1)} m
    </text>
  `;
}