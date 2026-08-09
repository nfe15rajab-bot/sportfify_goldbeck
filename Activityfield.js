/**
 * activityField.js — Sportify activity preview renderer
 * Draws a simple top-view rectangle + dimensions for fixed-size activities
 * (street basketball, padel court, sand pit, sprint lane, etc.) into the
 * same #field SVG used by drawField() for indoor sports — just a simpler
 * shape since these presets have no goal/line geometry.
 */

const ACTIVITY_CATEGORY_COLORS = {
  court:      { light: "#c8e6c9", dark: "#1e2a1e", grid: "#b2d8b4" },
  fitness:    { light: "#ffe0b2", dark: "#3a2a12", grid: "#ffcc80" },
  wellness:   { light: "#e1bee7", dark: "#2a1a2e", grid: "#ce93d8" },
  leisure:    { light: "#b3e5fc", dark: "#12242e", grid: "#81d4fa" },
  playground: { light: "#fff9c4", dark: "#2e2a12", grid: "#fff59d" },
};

function drawActivity(activityId, dims, isDark) {
  const a = ACTIVITIES[activityId];
  if (!a) return;
  const svg = document.getElementById("field");

  // dims lets the caller override the preset's default length/width
  // (user-edited values) — falls back to the preset defaults if omitted.
  const length = dims?.length ?? a.length;
  const width = dims?.width ?? a.width;

  const aspect = length / width;
  let fw, fh;
  if (aspect > (VW - PAD * 2) / (VH - PAD * 2)) {
    fw = VW - PAD * 2; fh = fw / aspect;
  } else {
    fh = VH - PAD * 2; fw = fh * aspect;
  }
  const ox = (VW - fw) / 2, oy = (VH - fh) / 2;

  const colors = ACTIVITY_CATEGORY_COLORS[a.category] || ACTIVITY_CATEGORY_COLORS.court;
  const floorFill = isDark ? colors.dark : colors.light;
  const floorGrid = isDark ? "#333" : colors.grid;
  const stroke = isDark ? "#aaa" : "#555";
  const dimColor = isDark ? "#aaa" : "#666";

  svg.innerHTML = `
    <defs>
      <pattern id="activityFloor" patternUnits="userSpaceOnUse" width="20" height="20">
        <rect width="20" height="20" fill="${floorFill}"/>
        <line x1="0" y1="0" x2="20" y2="0" stroke="${floorGrid}" stroke-width="0.5"/>
        <line x1="0" y1="0" x2="0"  y2="20" stroke="${floorGrid}" stroke-width="0.5"/>
      </pattern>
    </defs>
    <rect x="${ox}" y="${oy}" width="${fw}" height="${fh}"
          fill="url(#activityFloor)" stroke="${stroke}" stroke-width="1.5"/>
    <text x="${ox + fw / 2}" y="${oy + fh / 2}"
          text-anchor="middle" dominant-baseline="middle"
          font-size="13" font-weight="600" fill="${stroke}" font-family="Arial, sans-serif">
      ${a.label}
    </text>
    <text x="${ox + fw / 2}" y="${oy - 10}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="Arial, sans-serif">
      ${length} m
    </text>
    <text x="${ox - 10}" y="${oy + fh / 2}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="Arial, sans-serif"
          transform="rotate(-90, ${ox - 10}, ${oy + fh / 2})">
      ${width} m
    </text>
  `;
}