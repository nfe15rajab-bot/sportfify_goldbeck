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
  service:    { light: "#cfd8dc", dark: "#22303a", grid: "#b0bec5" }, // neutral — lockers, bathrooms
};

/**
 * An activity whose footprint holds a table or a court with space round it (ping pong, teqball, pickleball: `play` in activitiesData.js): the footprint is
 * drawn as the run-off band, the table / court in it with its markings, and architect's dimensions like the field sports (field.js) - the total on top and
 * left, the table / court on the bottom and right - with a line saying what the total is made of.
 */
/**
 * The footprint of an activity with a table or court in it (`play`), for any box x, y, w, h (px, the footprint's length along w): the run-off band and the
 * table / court with its markings. Shared by the Sport tab's drawing (drawActivityWithRunoff) and the Algorithmic placement plan (algoPlacementUI.js).
 * Returns { svg, ox, oy, fw, fh } - the markup and where the table / court itself sits.
 */
function activityCourtSvg(a, x, y, w, h, isDark) {
  const p = a.play, length = a.length, width = a.width;
  const scale = w / length;
  const tx = x, ty = y, tw = w, th = h;
  const roW = (length - p.l) / 2 * scale, roH = (width - p.w) / 2 * scale;
  const ox = tx + roW, oy = ty + roH, fw = p.l * scale, fh = p.w * scale;
  const colors = ACTIVITY_CATEGORY_COLORS[a.category] || ACTIVITY_CATEGORY_COLORS.court;
  const runoffStroke = isDark ? "#555" : "#aaa";
  const runoffFill = isDark ? "rgba(255,179,102,0.10)" : "rgba(255,179,102,0.18)";
  const cx = ox + fw / 2, cy = oy + fh / 2;
  let item;
  if (p.kind === "table") {
    // a table: its top, the net across the middle, and (table tennis) the centre line for doubles
    const top = p === ACTIVITIES.teqball_table.play ? (isDark ? "#1e3a5f" : "#2f6fb0") : (isDark ? "#1d4d3a" : "#1f6f4f");
    const r = p === ACTIVITIES.teqball_table.play ? Math.min(fh * 0.5, 14) : 2;       // the teqball table's curved top reads as a rounded one in plan
    item = `<rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" rx="${r}" fill="${top}" stroke="${isDark ? "#ddd" : "#333"}" stroke-width="1.2"/>
      <rect x="${ox + 2}" y="${oy + 2}" width="${fw - 4}" height="${fh - 4}" rx="${Math.max(0, r - 2)}" fill="none" stroke="#fff" stroke-width="1"/>
      ${p === ACTIVITIES.ping_pong.play ? `<line x1="${ox + 2}" y1="${cy}" x2="${ox + fw - 2}" y2="${cy}" stroke="#fff" stroke-width="0.8"/>` : ""}
      <line x1="${cx}" y1="${oy - 5}" x2="${cx}" y2="${oy + fh + 5}" stroke="${isDark ? "#eee" : "#222"}" stroke-width="2.4"/>`;
  } else if (p.kind === "court3x3") {
    // a FIBA 3x3 half court, 15 m along the baseline (top) and 11 m deep: backboard 1.2 m in, basket 1.575 m in, key 4.9 m wide to the free-throw line
    // at 5.8 m with its 1.8 m circle, the 6.75 m two-point line (straight 0.9 m in from the sidelines until it meets the arc), no-charge semicircle 1.25 m
    const s = scale, ls = `stroke="#fff" stroke-width="1.5" fill="none"`;
    const bx = cx, by = oy + 1.575 * s, r2 = 6.75 * s, side = 0.9 * s;
    const dy = Math.sqrt(Math.max(0, 6.75 * 6.75 - (7.5 - 0.9) * (7.5 - 0.9))) * s;          // where the straight part meets the arc
    const kw = 4.9 * s, kd = 5.8 * s;
    item = `<rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" fill="${isDark ? colors.dark : colors.light}" stroke="${isDark ? "#aaa" : "#555"}" stroke-width="1.5"/>
      <rect x="${bx - kw / 2}" y="${oy}" width="${kw}" height="${kd}" fill="rgba(255,255,255,0.18)" ${ls}/>
      <path d="M${bx - 1.8 * s},${oy + kd} A${1.8 * s},${1.8 * s} 0 0 0 ${bx + 1.8 * s},${oy + kd}" ${ls}/>
      <path d="M${ox + side},${oy} L${ox + side},${by + dy} A${r2},${r2} 0 0 0 ${ox + fw - side},${by + dy} L${ox + fw - side},${oy}" ${ls}/>
      <path d="M${bx - 1.25 * s},${by} A${1.25 * s},${1.25 * s} 0 0 0 ${bx + 1.25 * s},${by}" ${ls}/>
      <line x1="${bx - 0.9 * s}" y1="${oy + 1.2 * s}" x2="${bx + 0.9 * s}" y2="${oy + 1.2 * s}" stroke="${isDark ? "#eee" : "#222"}" stroke-width="2.4"/>
      <circle cx="${bx}" cy="${by}" r="${0.225 * s}" fill="none" stroke="#e65100" stroke-width="1.6"/>`;
  } else {
    // a pickleball court: baselines and sidelines, the net, the non-volley zone 2.13 m (7 ft) either side of it, and the centre lines of the service courts
    const kz = 2.13 * scale;
    const ls = `stroke="#fff" stroke-width="1.5" fill="none"`;
    item = `<rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" fill="${isDark ? colors.dark : colors.light}" stroke="${isDark ? "#aaa" : "#555"}" stroke-width="1.5"/>
      <rect x="${cx - kz}" y="${oy}" width="${kz * 2}" height="${fh}" fill="rgba(255,255,255,0.18)"/>
      <line x1="${cx - kz}" y1="${oy}" x2="${cx - kz}" y2="${oy + fh}" ${ls}/><line x1="${cx + kz}" y1="${oy}" x2="${cx + kz}" y2="${oy + fh}" ${ls}/>
      <line x1="${ox}" y1="${cy}" x2="${cx - kz}" y2="${cy}" ${ls}/><line x1="${cx + kz}" y1="${cy}" x2="${ox + fw}" y2="${cy}" ${ls}/>
      <line x1="${cx}" y1="${oy - 4}" x2="${cx}" y2="${oy + fh + 4}" stroke="${isDark ? "#eee" : "#222"}" stroke-width="2.2"/>`;
  }
  return {
    svg: `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="${runoffFill}" stroke="${runoffStroke}" stroke-width="0.7" stroke-dasharray="4,3" rx="2"/>${item}`,
    ox, oy, fw, fh
  };
}

function drawActivityWithRunoff(svg, a, length, width, isDark) {
  const p = a.play, m = v => String(Math.round(v * 1000) / 1000);
  const boxW = VW - PAD * 2, boxH = VH - PAD * 2;
  const scale = length / width > boxW / boxH ? boxW / length : boxH / width;
  const tw = length * scale, th = width * scale;
  const tx = (VW - tw) / 2, ty = (VH - th) / 2;                       // the whole footprint
  const endsM = (length - p.l) / 2, sidesM = (width - p.w) / 2;
  const roW = endsM * scale, roH = sidesM * scale;
  const dimColor = isDark ? "#aaa" : "#666", courtDim = isDark ? "#d8b48c" : "#8a5a2b";
  const court = activityCourtSvg(Object.assign({}, a, { length, width }), tx, ty, tw, th, isDark);
  const { ox, oy, fw, fh } = court;
  const cOffB = roH >= 26 ? Math.min(14, roH * 0.55) : roH + 10, cOffR = roW >= 26 ? Math.min(14, roW * 0.55) : roW + 10;
  const what = p.kind === "table" ? "Table" : "Court";
  const m2 = v => String(Math.round(v * 100) / 100);
  const around = Math.abs(endsM - sidesM) < 0.01 ? `${m2(endsM)} m run-off all round` : `${m2(endsM)} m at the ends, ${m2(sidesM)} m at the sides`;
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.innerHTML = `
    ${court.svg}
    ${archDimSvg("bottom", ox, ox + fw, oy + fh, cOffB, `${m(p.l)} m`, courtDim, 10.5)}
    ${archDimSvg("right", oy, oy + fh, ox + fw, cOffR, `${m(p.w)} m`, courtDim, 10.5)}
    ${archDimSvg("top", tx, tx + tw, ty, 10, `${m(length)} m`, dimColor)}
    ${archDimSvg("left", ty, ty + th, tx, 10, `${m(width)} m`, dimColor)}
    <text x="${VW / 2}" y="${oy + fh + Math.max(roH + 16, cOffB + 26)}" text-anchor="middle" font-size="10.5" fill="${dimColor}"
          font-family="'Titillium Web', Arial, sans-serif">${what} ${m(p.l)} × ${m(p.w)} m + ${around}</text>`;
}

function drawActivity(activityId, dims, isDark) {
  const a = ACTIVITIES[activityId];
  if (!a) return;
  const svg = document.getElementById("field");

  // Padel draws itself. Its geometry is specified by the FIP down to the
  // centre line's 20 cm overrun, and a generic rectangle claims a court
  // exists without showing whether it is one.
  if (typeof syncPadelPanel === "function") syncPadelPanel(activityId);
  if (activityId === "padel_court" && typeof drawPadelPreview === "function") {
    drawPadelPreview(svg, isDark);
    return;
  }

  // dims lets the caller override the preset's default length/width
  // (user-edited values) — falls back to the preset defaults if omitted.
  const length = dims?.length ?? a.length;
  const width = dims?.width ?? a.width;

  if (a.play && length > a.play.l && width > a.play.w) { drawActivityWithRunoff(svg, a, length, width, isDark); return; }

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

  // A specified sport (basketball, volleyball, padel) draws itself into this same #field
  // element at its own, smaller viewBox and never puts the shared one back — this is computed
  // for VW x VH, so it must own that assumption explicitly (see field.js's drawField).
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
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
      ${escapeHtml(a.label)}
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