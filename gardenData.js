/**
 * gardenData.js — Sportify Garden reference data
 * Supports Functional items, Vegetation categories, and Design themes.
 */

const GARDEN_ITEMS = {
  parcel: { label: "Standard Green Parcel", short: "Parcel", icon: "ti-square-rounded", category: "functional", defaultLength: 10.0, defaultWidth: 6.0, norm: "FLL Guideline" },
  sidewalk: { label: "Paved Pedestrian Walkway", short: "Walkway", icon: "ti-square-rounded", category: "functional", defaultLength: 15.0, defaultWidth: 1.5, norm: "DIN 18032-2 Paving" },
  roof_trees: { label: "Roof Trees & Deep-Root Shrubbery", short: "Trees", icon: "ti-square-rounded", category: "vegetation", defaultLength: 5.0, defaultWidth: 5.0, norm: "FLL Intensive" },
  urban_farming: { label: "Farm Crops & Urban Agriculture", short: "Farming", icon: "ti-square-rounded", category: "vegetation", defaultLength: 8.0, defaultWidth: 4.0, norm: "FLL Productive" },
  decorative_exotic: { label: "Decorative & Exotic Flora", short: "Exotic", icon: "ti-square-rounded", category: "vegetation", defaultLength: 6.0, defaultWidth: 3.0, norm: "FLL Ornamental" }
};

const GARDEN_THEMES = {
  custom: {
    label: "Custom Configuration", description: "Manual dimensional parameters enabled.",
    layers: { substrate: { thickness_m: 0.12, material: "Standard Growth Mix" }, drainage: { thickness_m: 0.04, material: "HDPE Drainage Core" } }
  },
  japanese: {
    label: "Japanese Zen Garden", description: "Asymmetrical balance, mosses, decorative gravel, and fine maples.",
    layers: { decorative_sand: { thickness_m: 0.05, material: "Fine Shirakawa Gravel Matrix" }, substrate: { thickness_m: 0.20, material: "Acidic Organo-Mineral Soil" }, drainage: { thickness_m: 0.06, material: "High-Capacity Reservoir Board" } }
  },
  english: {
    label: "English Cottage Landscape", description: "Lush perennial borders, dense turf zones, and structural hedges.",
    layers: { turf_topsoil: { thickness_m: 0.35, material: "Premium Loam-Rich Substrate" }, drainage: { thickness_m: 0.05, material: "Expanded Clay Aggregate Layer" } }
  },
  classic: {
    label: "Classic Formal Garden", description: "Symmetrical geometric axes, low boxwood parterres, and structured lawns.",
    layers: { parterre_mix: { thickness_m: 0.25, material: "Calibrated Structural Landscape Soil" }, drainage: { thickness_m: 0.04, material: "Standard Dimpled Drainage Mat" } }
  }
};

const GARDEN_MATERIALS = {
  low:    { waterproofing: "Bitumen membrane, single layer", drainage: "Gravel bed drainage" },
  medium: { waterproofing: "PVC membrane, root-resistant",   drainage: "Standard HDPE board" },
  high:   { waterproofing: "Reinforced TPO membrane",        drainage: "HDPE board + reservoir cups" },
};

function getGardenQualityKey(itemId, themeId, quality) { return `GARDEN_${itemId.toUpperCase()}_${themeId.toUpperCase()}_${quality.toUpperCase()}`; }