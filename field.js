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

  // A specified sport draws itself. On a basketball court the markings ARE
  // the court — a plain rectangle says nothing about whether it is one.
  // The variant is set BEFORE the panel renders: the panel states which court
  // this is, and reading a stale variant made it call a mini court regulation.
  if (sport === "basketball" && typeof basketballState !== "undefined") basketballState.variant = variant;
  if (sport === "volleyball" && typeof volleyballState !== "undefined") volleyballState.variant = variant;

  // A sport that names its own surface hides the generic material controls; a
  // sport that does not has to get them back, so this runs for every sport
  // rather than only for the specified ones.
  const specifiesItsOwn = sport === "basketball" || sport === "volleyball";
  document.querySelectorAll("#field-params .section").forEach(sec => {
    const l = sec.querySelector("label")?.textContent?.trim();
    if (l === "Material quality" || l === "Reference material (database)"
        || l === "Reference provider (database)") sec.hidden = specifiesItsOwn;
  });
  if (!specifiesItsOwn) {
    const host = document.getElementById("sport-spec-panel");
    if (host) host.innerHTML = "";
  }

  if (typeof syncBasketballPanel === "function") syncBasketballPanel(sport);
  if (typeof syncVolleyballPanel === "function") syncVolleyballPanel(sport);
  if (sport === "volleyball" && typeof drawVolleyballPreview === "function") {
    drawVolleyballPreview(svg, isDark);
    return;
  }
  if (sport === "basketball" && typeof drawBasketballPreview === "function") {
    drawBasketballPreview(svg, isDark);
    return;
  }

  // Stands (fixed px width, independent of the court's own scale) get their own budget off
  // the padded box before anything is fitted, so they never crowd the court out past it.
  const standW = capacity > 0 ? (capacity >= 300 ? 20 : capacity >= 100 ? 12 : 7) : 0;
  const standGap = capacity > 0 ? 4 : 0;

  // Fit the court's OUTER extent — pitch plus its run-off margin on every side, not the pitch
  // alone — into what's left of the padded box. Fitting the pitch alone and drawing run-off
  // outside that budget let a court whose run-off is large next to its width (volleyball,
  // handball, badminton) push its run-off line and dimension label past the viewBox edge,
  // clipped clean off — same "meet" viewBox that fits everything perfectly also crops
  // anything drawn beyond 0..VW / 0..VH without complaint.
  const outerL = d.l + d.runoff * 2, outerW = d.w + d.runoff * 2;
  const boxW = VW - PAD * 2 - (standW + standGap) * 2, boxH = VH - PAD * 2;
  const outerAspect = outerL / outerW;
  let ow, oh;
  if (outerAspect > boxW / boxH) { ow = boxW; oh = ow / outerAspect; }
  else { oh = boxH; ow = oh * outerAspect; }
  const scale = ow / outerL;      // px per metre, uniform in both directions (aspect preserved)
  const fw = scale * d.l, fh = scale * d.w;
  const ox = (VW - fw) / 2, oy = (VH - fh) / 2;

  // Warm, energetic court tones — these are all fast-paced team/court
  // sports (there's no "zen" entry among the FIELDS presets; that
  // distinction lives in the activity categories instead, see
  // ACTIVITY_CATEGORY_COLORS in activityField.js).
  const floorFill  = isDark ? "#4a2a12" : "#ffcc9e";
  const floorGrid  = isDark ? "#6b3f1c" : "#ffb366";
  const fieldStroke = isDark ? "#aaa" : "#555";
  const runoffStroke = isDark ? "#555" : "#aaa";
  const dimColor   = isDark ? "#aaa" : "#666";
  const standFill  = isDark ? "#3a2e22" : "#f5e6d8";
  const standStroke = isDark ? "#8a6a3f" : "#d9a876";

  // Stands
  let standsEl = "";
  if (capacity > 0) {
    standsEl = `
      <rect x="${ox - standW - standGap}" y="${oy}" width="${standW}" height="${fh}"
            fill="${standFill}" stroke="${standStroke}" stroke-width="0.5" rx="2"/>
      <rect x="${ox + fw + standGap}" y="${oy}" width="${standW}" height="${fh}"
            fill="${standFill}" stroke="${standStroke}" stroke-width="0.5" rx="2"/>
    `;
  }

  // Run-off zone
  const roW = d.runoff * scale, roH = d.runoff * scale;
  // the band is tinted so the run-off reads as floor the players use, not just a line: it is what differs between the size variants of a court
  const runoffFill = isDark ? "rgba(255,179,102,0.10)" : "rgba(255,179,102,0.18)";
  const runoffEl = `
    <rect x="${ox - roW}" y="${oy - roH}" width="${fw + roW * 2}" height="${fh + roH * 2}"
          fill="${runoffFill}" stroke="${runoffStroke}" stroke-width="0.7" stroke-dasharray="4,3" rx="2"/>
  `;

  // Field surface
  const fieldEl = `
    <rect x="${ox}" y="${oy}" width="${fw}" height="${fh}"
          fill="url(#floor)" stroke="${fieldStroke}" stroke-width="1.5"/>
  `;

  // Sport-specific lines
  const linesEl = getFieldLines(sport, ox, oy, fw, fh, isDark);

  // Dimension labels: the dashed outline carries the total (court + run-off), and a line under it says what that total is made of
  const m = v => String(Math.round(v * 100) / 100);
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;
  // the court's own size just outside it on the bottom and right (in the run-off band when that is wide enough to hold it, else just past the dashed
  // outline), the total with the run-off on the top and left, so the two never overlap
  const cOff = roH >= 26 ? Math.min(14, roH * 0.55) : roH + 10;
  const courtDim = isDark ? "#d8b48c" : "#8a5a2b";
  const dimsEl = `
    ${archDimSvg("bottom", ox, ox + fw, oy + fh, cOff, `${m(d.l)} m`, courtDim, 10.5)}
    ${archDimSvg("right", oy, oy + fh, ox + fw, cOff, `${m(d.w)} m`, courtDim, 10.5)}
    ${archDimSvg("top", ox - roW, ox + fw + roW, oy - roH, 10, `${m(outerL)} m`, dimColor)}
    ${archDimSvg("left", oy - roH, oy + fh + roH, ox - roW, 10, `${m(outerW)} m`, dimColor)}
    <text x="${ox + fw / 2}" y="${oy + fh + Math.max(roH + 16, cOff + 26)}"
          text-anchor="middle" font-size="10.5" fill="${dimColor}" ${font}>
      Court ${m(d.l)} × ${m(d.w)} m + ${m(d.runoff)} m run-off all round
    </text>
  `;

  // A specified sport (basketball, volleyball, padel) draws itself into this same #field
  // element at its own, smaller viewBox and never puts the shared one back — everything below
  // is computed for VW x VH, so it must own that assumption explicitly rather than inherit
  // whatever viewBox a previous court left behind (drawn hugely oversized/cropped otherwise).
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
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

/**
 * An architect's dimension, as on a plan: the dimension line set `off` px outside an edge, extension lines back to that edge, a 45° tick at each end and
 * the length written along the line. `side` = "top" (a horizontal edge from x1 to x2 at y) or "left" (a vertical edge from y1 to y2 at x); the text sits
 * on the far side of the line from the edge, and a vertical one reads bottom to top. Shared by the Sport tab's court drawings (field.js, basketballCourt.js,
 * volleyballCourt.js).
 */
function archDimSvg(side, a, b, at, off, label, color, fontSize) {
  const t = 4, gap = 2, fs = fontSize || 11;
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;
  const tick = (x, y) => `<line x1="${x - t}" y1="${y + t}" x2="${x + t}" y2="${y - t}" stroke-width="1.4"/>`;
  if (side === "top" || side === "bottom") {
    const dir = side === "top" ? -1 : 1, y = at + dir * off;
    const ty = side === "top" ? y - 4 : y + fs + 1;
    return `<g stroke="${color}" stroke-width="0.8" fill="none">
        <line x1="${a}" y1="${at + dir * gap}" x2="${a}" y2="${y + dir * t}"/><line x1="${b}" y1="${at + dir * gap}" x2="${b}" y2="${y + dir * t}"/>
        <line x1="${a - t}" y1="${y}" x2="${b + t}" y2="${y}"/>${tick(a, y)}${tick(b, y)}
      </g><text x="${(a + b) / 2}" y="${ty}" text-anchor="middle" font-size="${fs}" fill="${color}" ${font}>${label}</text>`;
  }
  const dir = side === "left" ? -1 : 1, x = at + dir * off, cy = (a + b) / 2;
  const tx = side === "left" ? x - 5 : x + fs + 1;                 // turned -90°, the letters stand toward -x from their baseline
  return `<g stroke="${color}" stroke-width="0.8" fill="none">
      <line x1="${at + dir * gap}" y1="${a}" x2="${x + dir * t}" y2="${a}"/><line x1="${at + dir * gap}" y1="${b}" x2="${x + dir * t}" y2="${b}"/>
      <line x1="${x}" y1="${a - t}" x2="${x}" y2="${b + t}"/>${tick(x, a)}${tick(x, b)}
    </g><text x="${tx}" y="${cy}" text-anchor="middle" font-size="${fs}" fill="${color}" ${font} transform="rotate(-90, ${tx}, ${cy})">${label}</text>`;
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
