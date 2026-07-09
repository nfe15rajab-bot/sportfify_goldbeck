/**
 * gardenData.js — Sportify Garden reference data
 * Source: FLL Green Roof Guideline (Dachbegrünungsrichtlinie)
 * Layer thicknesses are typical defaults per roof type; editable per project.
 */

const GARDEN_ROOF_TYPES = {
  extensive: {
    label: "Extensive",
    norm: "FLL Green Roof Guideline",
    layers: {
      vegetation:    { thickness_m: 0.05, material: "Sedum-moss vegetation mat" },
      substrate:     { thickness_m: 0.08, material: "Extensive substrate mix" },
      filter:        { thickness_m: 0.005, material: "Filter fleece" },
      drainage:      { thickness_m: 0.03, material: "Drainage / water-retention board" },
      rootBarrier:   { thickness_m: 0.005, material: "Root barrier membrane" },
      waterproofing: { thickness_m: 0.005, material: "Waterproofing membrane" },
    },
  },
  intensive: {
    label: "Intensive",
    norm: "FLL Green Roof Guideline",
    layers: {
      vegetation:    { thickness_m: 0.15, material: "Lawn / planting top layer" },
      substrate:     { thickness_m: 0.35, material: "Intensive substrate mix" },
      filter:        { thickness_m: 0.005, material: "Filter fleece" },
      drainage:      { thickness_m: 0.06, material: "Drainage layer (gravel / board)" },
      rootBarrier:   { thickness_m: 0.005, material: "Root barrier membrane" },
      waterproofing: { thickness_m: 0.008, material: "Waterproofing membrane (root-resistant)" },
    },
  },
};

const GARDEN_MATERIALS = {
  low:    { waterproofing: "Bitumen membrane, single layer", drainage: "Gravel drainage layer" },
  medium: { waterproofing: "PVC membrane, root-resistant",   drainage: "HDPE drainage board" },
  high:   { waterproofing: "TPO membrane, reinforced",       drainage: "HDPE drainage board + reservoir cups" },
};

/**
 * quality_key format: GARDEN_{ROOFTYPE}_{QUALITY}
 * Mirrors getQualityKey() in data.js for the sport side.
 */
function getGardenQualityKey(roofType, quality) {
  return `GARDEN_${roofType.toUpperCase()}_${quality.toUpperCase()}`;
}

/** Total build-up thickness (m), summing all layers for a given roof type */
function getGardenTotalThickness(roofType) {
  const layers = GARDEN_ROOF_TYPES[roofType]?.layers;
  if (!layers) return 0;
  return Object.values(layers).reduce((sum, l) => sum + l.thickness_m, 0);
}