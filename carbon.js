/**
 * carbon.js — embodied carbon, the one implementation.
 *
 * A piece's embodied carbon is its footprint area times the reference material's kg CO2e per m2 (Materials table: embodiedCarbonValue). A piece with no reference
 * material, or a material with no carbon figure, is counted as missing, never as zero: a layout that reads as carbon-free because nothing was looked up is worse than
 * a layout with a gap.
 *
 * This used to exist three times: the Analysis tab's LCA card (analyzeLCA), the Design panel's CO2 metric (computeCarbonMetric) and the single-piece line under the
 * Analysis tab's component list, and the Revit add-in's LCA command was a fourth. They disagreed: the Analysis tab did not know that a piece with no material picked
 * means the material of its quality tier (the Design panel, Moamen's, did), so the same layout had two totals. Now all of them call embodiedCarbon() /
 * pieceEmbodiedCarbon() here, with his rule for which material a piece is made of, and the add-in's LCA (EmbodiedCarbon.cs) is the same function in C#: Tools/AnalysisParity
 * runs both on every fixture layout and fails when they differ.
 *
 * Pure: no DOM, no globals but getFootprint (combineField.js) and QUALITY_REFERENCE_MATERIAL (data.js), both optional.
 */

/**
 * Which catalog material a placed piece is made of.
 *
 * A layout saved before the tier default existed, or any prebuilt session, carries no reference material at all, which made it read as free and as carbon-neutral.
 * Falling back to what its quality tier means fixes both, since cost and carbon look the piece up the same way.
 */
function referenceMaterialName(item) {
  const m = item.sourceJson?.materials || item.sourceJson?.garden?.materials || {};
  return m.reference_material
    || (typeof QUALITY_REFERENCE_MATERIAL !== "undefined" ? QUALITY_REFERENCE_MATERIAL[m.quality_level] : null)
    || null;
}

function carbonFootprint(item) {
  return typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
}

/** One piece: { material, kgPerM2, areaM2, kg } where kg is null (with `why`) when the piece cannot be counted. */
function pieceEmbodiedCarbon(item, materials) {
  const name = referenceMaterialName(item);
  const material = name ? (materials || []).find(m => m.name === name) : null;
  const fp = carbonFootprint(item);
  const areaM2 = fp.w * fp.h;
  if (!name) return { material: null, kgPerM2: null, areaM2, kg: null, why: "no reference material" };
  if (!material) return { material: name, kgPerM2: null, areaM2, kg: null, why: "not in the catalogue" };
  if (material.embodiedCarbonValue == null) return { material: name, kgPerM2: null, areaM2, kg: null, why: "no carbon figure" };
  return { material: name, kgPerM2: material.embodiedCarbonValue, areaM2, kg: material.embodiedCarbonValue * areaM2, why: null, unit: material.embodiedCarbonUnit || null, source: material.embodiedCarbonSource || null };
}

/** The layout: { totalKg, coveredCount, missingCount, totalCount, pieces } (totalKg is the sum of the counted pieces; 0 with none counted, see coveredCount). */
function embodiedCarbon(items, materials) {
  const pieces = (items || []).map(it => pieceEmbodiedCarbon(it, materials));
  const counted = pieces.filter(p => p.kg != null);
  return {
    totalKg: counted.reduce((sum, p) => sum + p.kg, 0),
    coveredCount: counted.length,
    missingCount: pieces.length - counted.length,
    totalCount: pieces.length,
    pieces,
  };
}
