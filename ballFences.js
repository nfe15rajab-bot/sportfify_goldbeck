/**
 * ballFences.js — ball-stop fences along the roof edges: the ball analysis's proposal, taken into the design (user + professor, 2026-09-29: close the loop).
 *
 * The ball trajectory analysis (Revit, run in Unity) flies stray shots from every court and proposes, per roof edge, a fence: the stretch the shots left over
 * and the height that stops 95% of them. "Add these fences to the design" (Results, Sport) puts them in the layout as combineState.ballFences: drawn on the
 * Combine board along their edge, saved with the session, exported as ball_fences, and standing in Unity's next run, which counts what they stop and
 * proposes fences only for what still leaves. Nothing in Revit builds them yet.
 *
 * Edges and stretches are the analysis's own: top = y 0, bottom = y the roof's width, left = x 0, right = x the roof's length (the plan's bounding box,
 * as the analysis uses it); from/to run along x for top and bottom, along y for left and right; metres.
 */

const BALL_FENCE_EDGES = ["top", "bottom", "left", "right"];

function ballFenceClean(f) {
  if (!f || !BALL_FENCE_EDGES.includes(f.edge)) return null;
  const a = Number(f.from_m), b = Number(f.to_m), h = Number(f.height_m);
  if (![a, b, h].every(Number.isFinite) || h <= 0 || a === b) return null;
  const r = v => Math.round(v * 100) / 100;
  return { edge: f.edge, from_m: r(Math.min(a, b)), to_m: r(Math.max(a, b)), height_m: r(h) };
}

/** The export's ball_fences, or null when the design has none (so a layout without fences keeps the identity it always had). */
function ballFencesPayload() {
  const list = (combineState.ballFences || []).map(ballFenceClean).filter(Boolean);
  return list.length ? list : null;
}

/** A saved session's ball_fences, back into the board. */
function ballFencesFromPayload(list) {
  return Array.isArray(list) ? list.map(ballFenceClean).filter(Boolean) : [];
}

/**
 * Adds the analysis's proposed fences (its `fences`: edge, from_m, to_m, height_m) to the design. A proposal that overlaps a fence already on the same edge
 * becomes one fence: the two stretches joined, the taller height. Returns how many fences the design has afterwards.
 */
function addBallFences(proposed) {
  const fences = (combineState.ballFences || []).map(ballFenceClean).filter(Boolean);
  (proposed || []).map(ballFenceClean).filter(Boolean).forEach(p => {
    const same = fences.find(f => f.edge === p.edge && p.from_m <= f.to_m && p.to_m >= f.from_m);
    if (same) { same.from_m = Math.min(same.from_m, p.from_m); same.to_m = Math.max(same.to_m, p.to_m); same.height_m = Math.max(same.height_m, p.height_m); }
    else fences.push(p);
  });
  combineState.ballFences = fences;
  return fences.length;
}

function removeBallFences() {
  combineState.ballFences = [];
}

/** The design's fences on the Combine board: a thick line along the roof's edge with its height, not interactive. */
function ballFencesSvg(scale, roofOx, roofOy) {
  const fences = combineState.ballFences || [];
  if (!fences.length) return "";
  const L = combineState.roof.length, W = combineState.roof.width;
  const dark = typeof isDarkMode === "function" && isDarkMode();
  const stroke = dark ? "#9fb8d8" : "#4d6f99";
  return `<g class="ball-fences" pointer-events="none">` + fences.map(f => {
    const at = (x, y) => [roofOx + x * scale, roofOy + y * scale];
    const [x1, y1] = f.edge === "top" ? at(f.from_m, 0) : f.edge === "bottom" ? at(f.from_m, W) : f.edge === "left" ? at(0, f.from_m) : at(L, f.from_m);
    const [x2, y2] = f.edge === "top" ? at(f.to_m, 0) : f.edge === "bottom" ? at(f.to_m, W) : f.edge === "left" ? at(0, f.to_m) : at(L, f.to_m);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const off = f.edge === "top" ? [0, -8] : f.edge === "bottom" ? [0, 14] : f.edge === "left" ? [-6, 0] : [6, 0];
    const anchor = f.edge === "left" ? "end" : f.edge === "right" ? "start" : "middle";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
      <text x="${mx + off[0]}" y="${my + off[1]}" text-anchor="${anchor}" font-size="10" font-family="'Titillium Web', Arial, sans-serif" fill="${stroke}">fence ${Number(f.height_m).toFixed(1)} m</text>`;
  }).join("") + `</g>`;
}
