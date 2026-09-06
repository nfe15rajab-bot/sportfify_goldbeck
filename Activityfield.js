/**
 * activityField.js — Sportify activity preview renderer
 * Draws a simple top-view rectangle + dimensions for fixed-size activities
 * (street basketball, padel court, sand pit, sprint lane, etc.) into the
 * same #field SVG used by drawField() for indoor sports — just a simpler
 * shape since these presets have no goal/line geometry.
 */

// Energetic, competitive/active categories get warm tones; calm, low-
// intensity ones (wellness, leisure) get cool tones — same energetic/zen
// split as the rest of the app's palette.
const ACTIVITY_CATEGORY_COLORS = {
  court:      { light: "#ffcc9e", dark: "#4a2a12", grid: "#ffb366" }, // energetic — 3x3, padel, bocce, ping pong, badminton
  fitness:    { light: "#ffab91", dark: "#4a2416", grid: "#ff8a65" }, // energetic — calisthenics, sprint
  wellness:   { light: "#c9b8f5", dark: "#2a2049", grid: "#b39ceb" }, // zen — yoga
  leisure:    { light: "#a3e0e6", dark: "#123840", grid: "#7ad0d9" }, // zen — mini-golf
  playground: { light: "#fff08a", dark: "#4a4318", grid: "#ffe95c" }, // energetic — playful/active
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
          font-size="13" font-weight="600" fill="${stroke}" font-family="'Titillium Web', Arial, sans-serif">
      ${a.label}
    </text>
    <text x="${ox + fw / 2}" y="${oy - 10}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="'Titillium Web', Arial, sans-serif">
      ${length} m
    </text>
    <text x="${ox - 10}" y="${oy + fh / 2}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="'Titillium Web', Arial, sans-serif"
          transform="rotate(-90, ${ox - 10}, ${oy + fh / 2})">
      ${width} m
    </text>
  `;
}