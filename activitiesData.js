/**
 * activitiesData.js — Sportify urban/outdoor activity presets
 * Source: "Sport Activity Options" reference sheet — fixed-size elements
 * Most activities have one fixed footprint. The court activities that a norm
 * sizes in tiers of different sizes carry `variants` (a tier the same size as another is left out) ({ mini | standard | competition: { l, w, norm } },
 * playing area only), chosen in the Sport tab like the FIELDS tiers in data.js.
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
    length: 19.00, width: 15.00,
    category: "court",
    norm: "Street format",
    play: { kind: "court3x3", l: 15.00, w: 11.00, norm: "FIBA 3x3 court" },   // + 2 m all round, as the app's FIBA basketball run-off (FIBA 3x3 sets no free zone)
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
    variants: { mini: { l: 20.00, w: 6.00, norm: "FIP (singles court)" }, standard: { l: 20.00, w: 10.00, norm: "FIP" } },
  },
  multipurpose_court: {
    label: "Multi-purpose Court",
    short: "Multi",
    icon: "ti-square-rounded",
    length: 12.00, width: 22.00,
    category: "court",
    norm: "Reference sheet",
    hidden: true,                 // duplicate of the Polyvalent field sport: not offered any more, kept so older layouts still open
  },
  urban_bocce: {
    label: "Urban Bocce Court",
    short: "Bocce",
    icon: "ti-square-rounded",
    length: 18.00, width: 3.00,
    category: "court",
    norm: "Reference sheet",
    variants: { standard: { l: 18.00, w: 3.00, norm: "Recreational" }, competition: { l: 26.50, w: 4.00, norm: "Official (26.5 x 4 m)" } },
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
    play: { kind: "table", l: 2.74, w: 1.525, norm: "ITTF table" },      // the table; the rest of the footprint is the space round it
  },
  badminton_outdoor: {
    label: "Badminton (outdoor)",
    short: "Badm. Out",
    icon: "ti-square-rounded",
    length: 13.00, width: 6.00,
    category: "court",
    norm: "Reference sheet",
    hidden: true,                 // not offered (2026-09-26); kept so older layouts still open
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
  teqball_table: {
    label: "Teqball Table",
    short: "Teqball",
    icon: "ti-square-rounded",
    length: 6.00, width: 4.00,
    category: "court",
    norm: "Reference sheet",
    play: { kind: "table", l: 3.00, w: 1.50, norm: "FITEQ table" },
  },
  bouldering_wall: {
    label: "Bouldering Wall",
    short: "Boulder",
    icon: "ti-square-rounded",
    length: 6.00, width: 1.50,
    category: "fitness",
    norm: "Reference sheet",
    hidden: true,                 // not offered (2026-09-26); kept so older layouts still open
  },
  pickleball_court: {
    label: "Pickleball Court",
    short: "Pickleball",
    icon: "ti-square-rounded",
    length: 18.29, width: 9.14,
    category: "court",
    norm: "Reference sheet",
    play: { kind: "court", l: 13.41, w: 6.10, norm: "USA Pickleball court" },   // footprint = 60 x 30 ft, the minimum total playing area
  },
  crossfit_rig: {
    label: "CrossFit Training Rig",
    short: "CrossFit",
    icon: "ti-square-rounded",
    length: 6.00, width: 5.00,
    category: "fitness",
    norm: "Reference sheet",
  },
  trx_frame: {
    label: "TRX Suspension Frame",
    short: "TRX",
    icon: "ti-square-rounded",
    length: 6.00, width: 3.00,
    category: "fitness",
    norm: "Reference sheet",
  },
  hiit_turf_grid: {
    label: "HIIT Turf Grid",
    short: "HIIT",
    icon: "ti-square-rounded",
    length: 8.00, width: 5.00,
    category: "fitness",
    norm: "Reference sheet",
  },
  locker_module: {
    label: "Locker & Dressing Room Module",
    short: "Lockers",
    icon: "ti-square-rounded",
    length: 10.00, width: 5.00,
    category: "service",
    norm: "Reference sheet",
  },
  bathroom_module: {
    label: "Bathroom & Shower Module",
    short: "Bathroom",
    icon: "ti-square-rounded",
    length: 10.00, width: 5.00,
    category: "service",
    norm: "Reference sheet",
  },
  rest_area: {
    label: "Rest / Hydration Area",
    short: "Rest",
    icon: "ti-square-rounded",
    length: 6.00, width: 4.00,
    category: "leisure",
    norm: "Reference sheet",
  },
};

/* ── Size tiers, one per sport, shared by the Sport tab and Algorithmic placement ──
 * A field sport (FIELDS in data.js) is keyed by its id ("basketball"), an activity by "act:<id>". The tier chosen in the Sport tab
 * is remembered per sport (so Basketball can be Standard while Handball stays Mini) and every change is announced with the
 * "sportify:tier-changed" event, which Algorithmic placement listens to so its list and sizes follow at once. */
const SPORT_TIER_ORDER = ["mini", "standard", "competition"];
const SPORT_TIER_STORAGE_KEY = "sportify-sport-tiers";
const sportTiers = (() => { try { return JSON.parse(localStorage.getItem(SPORT_TIER_STORAGE_KEY) || "{}") || {}; } catch (e) { return {}; } })();

/** The tiers an activity offers, in order ([] for a single-size activity). */
function activityTierKeys(id) {
  const v = ACTIVITIES[id] && ACTIVITIES[id].variants;
  return v ? SPORT_TIER_ORDER.filter(k => v[k]) : [];
}

/** The tiers a sport offers: a field sport's own (FIELDS), an activity's variants. */
function sportTierKeys(key) {
  if (String(key).startsWith("act:")) return activityTierKeys(key.slice(4));
  const f = typeof FIELDS !== "undefined" && FIELDS[key];
  return f ? SPORT_TIER_ORDER.filter(k => f[k]) : [];
}

/** The tier chosen for a sport: the remembered one while the sport still offers it, else Mini, else the first it offers. */
function getSportTier(key) {
  const keys = sportTierKeys(key);
  if (!keys.length) return null;
  return keys.includes(sportTiers[key]) ? sportTiers[key] : (keys.includes("mini") ? "mini" : keys[0]);
}

function setSportTier(key, tier) {
  if (!sportTierKeys(key).includes(tier) || sportTiers[key] === tier) return;
  sportTiers[key] = tier;
  try { localStorage.setItem(SPORT_TIER_STORAGE_KEY, JSON.stringify(sportTiers)); } catch (e) { /* not kept */ }
  document.dispatchEvent(new CustomEvent("sportify:tier-changed", { detail: { key, tier } }));
}

const sportTierLabel = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : "";

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