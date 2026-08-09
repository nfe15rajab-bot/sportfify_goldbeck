/**
 * activitiesData.js — Sportify urban/outdoor activity presets
 * Source: "Sport Activity Options" reference sheet — fixed-size elements
 * (no mini/standard/competition tiers like the indoor FIELDS in data.js;
 * each activity has one fixed footprint).
 *
 * NOTE: "icon" is a placeholder Tabler class (ti-square-rounded, guaranteed
 * to render) for every entry right now. "short" is the caption shown under
 * the icon in the activity bar. Swap "icon" per entry once real sport
 * logos/icons are ready — nothing else needs to change.
 */

const ACTIVITIES = {
  streetbasketball_3x3: {
    label: "3×3 Street Basketball",
    short: "3×3 B-Ball",
    icon: "ti-square-rounded",
    length: 15.00, width: 11.00,
    category: "court",
    norm: "Street format",
  },
  yoga_deck: {
    label: "Yoga / Stretching Deck",
    short: "Yoga",
    icon: "ti-square-rounded",
    length: 10.00, width: 5.00,
    category: "wellness",
    norm: "Reference sheet",
  },
  padel_court: {
    label: "Padel Court",
    short: "Padel",
    icon: "ti-square-rounded",
    length: 20.00, width: 10.00,
    category: "court",
    norm: "Reference sheet",
  },
  multipurpose_court: {
    label: "Multi-purpose Court",
    short: "Multi",
    icon: "ti-square-rounded",
    length: 12.00, width: 22.00,
    category: "court",
    norm: "Reference sheet",
  },
  urban_bocce: {
    label: "Urban Bocce Court",
    short: "Bocce",
    icon: "ti-square-rounded",
    length: 18.00, width: 3.00,
    category: "court",
    norm: "Reference sheet",
  },
  calisthenics: {
    label: "Calisthenics",
    short: "Calisth.",
    icon: "ti-square-rounded",
    length: 8.00, width: 6.00,
    category: "fitness",
    norm: "Reference sheet",
  },
  ping_pong: {
    label: "Ping Pong",
    short: "Ping Pong",
    icon: "ti-square-rounded",
    length: 5.70, width: 3.50,
    category: "court",
    norm: "Reference sheet",
  },
  badminton_outdoor: {
    label: "Badminton (outdoor)",
    short: "Badm. Out",
    icon: "ti-square-rounded",
    length: 13.00, width: 6.00,
    category: "court",
    norm: "Reference sheet",
  },
  minigolf_lane: {
    label: "Mini-Golf Lane",
    short: "Mini-Golf",
    icon: "ti-square-rounded",
    length: 12.00, width: 1.50,
    category: "leisure",
    norm: "Reference sheet",
  },
  sand_pit: {
    label: "Sand Pit",
    short: "Sand Pit",
    icon: "ti-square-rounded",
    length: 4.00, width: 4.00,
    category: "playground",
    norm: "Reference sheet",
  },
  trampoline: {
    label: "Trampoline",
    short: "Trampol.",
    icon: "ti-square-rounded",
    length: 4.00, width: 4.00,
    category: "playground",
    norm: "Reference sheet",
  },
  balance_logs: {
    label: "Balance Logs",
    short: "Bal. Logs",
    icon: "ti-square-rounded",
    length: 6.00, width: 3.00,
    category: "playground",
    norm: "Reference sheet",
  },
  climbing_tower: {
    label: "Climbing Tower",
    short: "Climb Twr",
    icon: "ti-square-rounded",
    length: 6.00, width: 6.00,
    category: "playground",
    norm: "Reference sheet",
  },
  modular_tower_slide: {
    label: "Modular Tower Slide",
    short: "Twr Slide",
    icon: "ti-square-rounded",
    length: 7.00, width: 5.00,
    category: "playground",
    norm: "Reference sheet",
  },
  sprint_lane: {
    label: "Sprint Lane",
    short: "Sprint",
    icon: "ti-square-rounded",
    length: 63.77, width: 1.22,
    category: "fitness",
    norm: "Reference sheet",
  },
};

/** quality_key format, mirroring getQualityKey()/getGardenQualityKey() */
function getActivityQualityKey(activityId) {
  return `ACTIVITY_${activityId.toUpperCase()}`;
}

/**
 * Generic 3-tier materials system, reused across all activities (the
 * actual construction varies a lot by activity type, but a simple
 * surface/structure quality tier mirrors the pattern already used for
 * FIELDS/MATERIALS and GARDEN_ROOF_TYPES/GARDEN_MATERIALS).
 */
const ACTIVITY_MATERIALS = {
  low:    { surface: "Basic surface (gravel / painted asphalt)", structure: "Standard steel / treated wood" },
  medium: { surface: "Reinforced synthetic surface",              structure: "Galvanized steel" },
  high:   { surface: "Premium rubber / synthetic surface",        structure: "Powder-coated aluminum" },
};