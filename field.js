/**
 * field.js — Sportify SVG field renderer
 * Draws the sport field inside a fixed 600×400 viewBox coordinate space.
 * The SVG element itself scales via CSS (width/height: 100%) so the field
 * always fills the available canvas area regardless of browser zoom.
 */

const VW = 600, VH = 400, PAD = 36;

function drawField(sport, variant, capacity, isDark) {
  const d = FIELDS[sport]?.[variant] || FIELDS.polyvalent.mini;
  const svg = document.getElementById("field");

  const aspect = d.l / d.w;
  let fw, fh;
  if (aspect > (VW - PAD * 2) / (VH - PAD * 2)) {
    fw = VW - PAD * 2; fh = fw / aspect;
  } else {
    fh = VH - PAD * 2; fw = fh * aspect;
  }
  const ox = (VW - fw) / 2, oy = (VH - fh) / 2;

  const floorFill  = isDark ? "#1e2a1e" : "#c8e6c9";
  const floorGrid  = isDark ? "#2d3d2d" : "#b2d8b4";
  const fieldStroke = isDark ? "#aaa" : "#555";
  const runoffStroke = isDark ? "#555" : "#aaa";
  const dimColor   = isDark ? "#aaa" : "#666";
  const standFill  = isDark ? "#2a2a3a" : "#e8eaf6";
  const standStroke = isDark ? "#3a3a5a" : "#9fa8da";

  // Stands
  let standsEl = "";
  if (capacity > 0) {
    const sw = capacity >= 300 ? 20 : capacity >= 100 ? 12 : 7;
    standsEl = `
      <rect x="${ox - sw - 4}" y="${oy}" width="${sw}" height="${fh}"
            fill="${standFill}" stroke="${standStroke}" stroke-width="0.5" rx="2"/>
      <rect x="${ox + fw + 4}" y="${oy}" width="${sw}" height="${fh}"
            fill="${standFill}" stroke="${standStroke}" stroke-width="0.5" rx="2"/>
    `;
  }

  // Run-off zone
  const roScale = fw / d.l;
  const roW = d.runoff * roScale, roH = d.runoff * (fh / d.w);
  const runoffEl = `
    <rect x="${ox - roW}" y="${oy - roH}" width="${fw + roW * 2}" height="${fh + roH * 2}"
          fill="none" stroke="${runoffStroke}" stroke-width="0.7" stroke-dasharray="4,3" rx="2"/>
  `;

  // Field surface
  const fieldEl = `
    <rect x="${ox}" y="${oy}" width="${fw}" height="${fh}"
          fill="url(#floor)" stroke="${fieldStroke}" stroke-width="1.5"/>
  `;

  // Sport-specific lines
  const linesEl = getFieldLines(sport, ox, oy, fw, fh, isDark);

  // Dimension labels
  const dimsEl = `
    <text x="${ox + fw / 2}" y="${oy - roH - 6}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="Arial, sans-serif">
      ${d.l} m
    </text>
    <text x="${ox - roW - 8}" y="${oy + fh / 2}"
          text-anchor="middle" font-size="11" fill="${dimColor}" font-family="Arial, sans-serif"
          transform="rotate(-90, ${ox - roW - 8}, ${oy + fh / 2})">
      ${d.w} m
    </text>
  `;

  svg.innerHTML = `
    <defs>
      <pattern id="floor" patternUnits="userSpaceOnUse" width="20" height="20">
        <rect width="20" height="20" fill="${floorFill}"/>
        <line x1="0" y1="0" x2="20" y2="0" stroke="${floorGrid}" stroke-width="0.5"/>
        <line x1="0" y1="0" x2="0"  y2="20" stroke="${floorGrid}" stroke-width="0.5"/>
      </pattern>
    </defs>
    ${standsEl}
    ${runoffEl}
    ${fieldEl}
    ${linesEl}
    ${dimsEl}
  `;
}

function getFieldLines(sport, ox, oy, fw, fh, isDark) {
  const lc = isDark ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.95)";
  const ls = `stroke="${lc}" stroke-width="1.5" fill="none"`;
  const cx = ox + fw / 2, cy = oy + fh / 2;

  const base = `
    <line x1="${cx}" y1="${oy}" x2="${cx}" y2="${oy + fh}" ${ls}/>
    <circle cx="${cx}" cy="${cy}" r="${Math.min(fw, fh) * 0.12}" ${ls}/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="${lc}"/>
  `;

  switch (sport) {
    case "basketball": {
      const k = Math.min(fw, fh), r3 = k * 0.35;
      return base + `
        <rect x="${ox + fw * 0.04}" y="${cy - fh * 0.22}" width="${fw * 0.18}" height="${fh * 0.44}" ${ls}/>
        <rect x="${ox + fw - fw * 0.22}" y="${cy - fh * 0.22}" width="${fw * 0.18}" height="${fh * 0.44}" ${ls}/>
        <path d="M${ox + fw * 0.04} ${cy - fh * 0.22} A${r3} ${r3} 0 0 0 ${ox + fw * 0.04} ${cy + fh * 0.22}"
              ${ls} stroke-dasharray="4,3"/>
        <path d="M${ox + fw - fw * 0.04} ${cy - fh * 0.22} A${r3} ${r3} 0 0 1 ${ox + fw - fw * 0.04} ${cy + fh * 0.22}"
              ${ls} stroke-dasharray="4,3"/>
        <circle cx="${ox + fw * 0.04 + 8}" cy="${cy}" r="${Math.min(fw, fh) * 0.04}" ${ls}/>
        <circle cx="${ox + fw - fw * 0.04 - 8}" cy="${cy}" r="${Math.min(fw, fh) * 0.04}" ${ls}/>
      `;
    }
    case "handball": {
      const gw = fh * 0.3, gd = fw * 0.025;
      return base + `
        <rect x="${ox}" y="${cy - gw / 2}" width="${gd}" height="${gw}" ${ls}/>
        <rect x="${ox + fw - gd}" y="${cy - gw / 2}" width="${gd}" height="${gw}" ${ls}/>
        <path d="M${ox + fw * 0.13} ${cy - fh * 0.36} A${fw * 0.25} ${fh * 0.36} 0 0 0 ${ox + fw * 0.13} ${cy + fh * 0.36}" ${ls}/>
        <path d="M${ox + fw - fw * 0.13} ${cy - fh * 0.36} A${fw * 0.25} ${fh * 0.36} 0 0 1 ${ox + fw - fw * 0.13} ${cy + fh * 0.36}" ${ls}/>
      `;
    }
    case "volleyball":
      return `
        <line x1="${cx}" y1="${oy}" x2="${cx}" y2="${oy + fh}" stroke="${lc}" stroke-width="2.5"/>
        <rect x="${ox + fw * 0.1}" y="${oy + fh * 0.1}" width="${fw * 0.8}" height="${fh * 0.8}" ${ls} stroke-dasharray="5,3"/>
      `;
    case "badminton": {
      const sl = fh * 0.2;
      return `
        <line x1="${cx}" y1="${oy}" x2="${cx}" y2="${oy + fh}" stroke="${lc}" stroke-width="2.5"/>
        <line x1="${ox + fw * 0.07}" y1="${oy}" x2="${ox + fw * 0.07}" y2="${oy + fh}" ${ls}/>
        <line x1="${ox + fw - fw * 0.07}" y1="${oy}" x2="${ox + fw - fw * 0.07}" y2="${oy + fh}" ${ls}/>
        <line x1="${ox}" y1="${cy}" x2="${ox + fw}" y2="${cy}" ${ls} stroke-dasharray="4,3"/>
        <line x1="${ox}" y1="${oy + sl}" x2="${ox + fw}" y2="${oy + sl}" ${ls}/>
        <line x1="${ox}" y1="${oy + fh - sl}" x2="${ox + fw}" y2="${oy + fh - sl}" ${ls}/>
      `;
    }
    case "football": {
      const gw = fh * 0.28, gd = fw * 0.04, paw = fw * 0.25, pah = fh * 0.5;
      return base + `
        <rect x="${ox}" y="${cy - gw / 2}" width="${gd}" height="${gw}" ${ls}/>
        <rect x="${ox + fw - gd}" y="${cy - gw / 2}" width="${gd}" height="${gw}" ${ls}/>
        <rect x="${ox + fw * 0.04}" y="${cy - pah / 2}" width="${paw}" height="${pah}" ${ls}/>
        <rect x="${ox + fw - fw * 0.04 - paw}" y="${cy - pah / 2}" width="${paw}" height="${pah}" ${ls}/>
      `;
    }
    default:
      return base;
  }
}
