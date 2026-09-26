/**
 * data.js — Sportify field & material reference data
 * Source: DIN 18032, FIBA, IHF, FIVB, BWF, DFB
 */

/* Identifies this build in exports and in the console. Declared in the first
 * script the page loads so every later file can rely on it — and so a stale
 * cached page is visible at a glance instead of being inferred from JSON
 * fields that mysteriously fail to appear. */
const SPORTIFY_BUILD = "2026-09-26-nohalo";
console.log("Sportify build:", SPORTIFY_BUILD);

const FIELDS = {
  polyvalent: {
    mini:        { l: 20,   w: 12,  runoff: 1.5, h: 5.5,  norm: "DIN 18032" },
    standard:    { l: 27,   w: 15,  runoff: 2,   h: 7,    norm: "DIN 18032" },
    competition: { l: 40,   w: 20,  runoff: 2,   h: 7,    norm: "DIN 18032" },
  },
  basketball: {
    mini:        { l: 22,   w: 13,  runoff: 2,   h: 7,    norm: "FIBA / DIN 18032" },
    standard:    { l: 28,   w: 15,  runoff: 2,   h: 7,    norm: "FIBA / DIN 18032" },
    competition: { l: 34,   w: 19,  runoff: 2,   h: 7,    norm: "FIBA" },
  },
  handball: {
    mini:        { l: 30,   w: 16,  runoff: 2,   h: 7,    norm: "IHF / DIN 18032" },
    standard:    { l: 40,   w: 20,  runoff: 1,   h: 7,    norm: "IHF / DIN 18032" },
    competition: { l: 40,   w: 20,  runoff: 2,   h: 7,    norm: "IHF" },
  },
  volleyball: {
    mini:        { l: 16,   w: 8,   runoff: 3,   h: 7,    norm: "FIVB / DIN 18032" },
    standard:    { l: 18,   w: 9,   runoff: 3,   h: 7,    norm: "FIVB / DIN 18032" },
    competition: { l: 18,   w: 9,   runoff: 5,   h: 12.5, norm: "FIVB" },
  },
  badminton: {
    mini:        { l: 13.4, w: 6.1, runoff: 1,   h: 9,    norm: "BWF / DIN 18032" },
    standard:    { l: 13.4, w: 6.1, runoff: 2,   h: 9,    norm: "BWF / DIN 18032" },
    competition: { l: 13.4, w: 6.1, runoff: 3,   h: 9,    norm: "BWF" },
  },
  football: {
    mini:        { l: 25,   w: 16,  runoff: 2,   h: 5,    norm: "DFB / DIN 18032" },
    standard:    { l: 35,   w: 20,  runoff: 2,   h: 5,    norm: "DFB / DIN 18032" },
    competition: { l: 42,   w: 22,  runoff: 3,   h: 7,    norm: "DFB" },
  },
};

/**
 * Sport dimensions: one source.
 *
 * The database (Sportify.Api's FieldVariants, edited in the Data tab and read by the Revit add-in through the layouts the app sends) is the source of the playing-field
 * sizes. The table above is what is used until the API answers, and when it cannot be reached (the app works alone); Tools/SourceParity (in the Revit/API repository) fails when
 * the two disagree in what the API seeds, so a fresh install and this file say the same. Once the API answers, its variants replace the table's entries in place, so a change
 * made in the Data tab is what the Sport tab draws and what a layout exports; nothing here has to be edited by hand.
 */
const FIELD_VARIANTS_API = "http://localhost:5107/api/Sports";

/** "Polyvalent (multi-sport)" -> "polyvalent", "Football (indoor)" -> "football": the table's key for an API sport. */
function fieldKeyOfSportName(name) {
  return String(name == null ? "" : name).trim().toLowerCase().split(/[\s(]/)[0];
}

/** Puts the API's variants into FIELDS. Returns how many entries were set; a variant with a size that is not a positive number, or a sport the table has no key for, is left alone. */
function applyFieldVariants(sports) {
  let applied = 0;
  (Array.isArray(sports) ? sports : []).forEach(sport => {
    const key = fieldKeyOfSportName(sport && sport.name);
    if (!FIELDS[key]) return;
    (sport.variants || []).forEach(v => {
      const ok = [v.lengthM, v.widthM, v.heightMinM].every(n => Number.isFinite(n) && n > 0) && Number.isFinite(v.runoffM) && v.runoffM >= 0;
      if (!ok || !v.variant) return;
      FIELDS[key][v.variant] = { l: v.lengthM, w: v.widthM, runoff: v.runoffM, h: v.heightMinM, norm: v.norm || (FIELDS[key][v.variant] || {}).norm || "" };
      applied++;
    });
  });
  return applied;
}

let fieldVariantsFromApi = 0;
async function loadFieldVariantsFromApi() {
  try {
    const res = await fetch(FIELD_VARIANTS_API, { cache: "no-store" });
    if (!res.ok) return 0;
    fieldVariantsFromApi = applyFieldVariants(await res.json());
    // main.js and sportController.js load after this file: an API that answers before they have run has nothing to redraw yet
    if (fieldVariantsFromApi && typeof updateUI === "function" && typeof state !== "undefined") updateUI();
    return fieldVariantsFromApi;
  } catch (e) {
    return 0;      // the API is not running: the table above stands
  }
}
loadFieldVariantsFromApi();

const MATERIALS = {
  low:    { floor: "PVC sheet",          marking: "Painted",        gradin: "Steel basic" },
  medium: { floor: "Sports vinyl (2-layer)", marking: "Adhesive tape", gradin: "Steel coated" },
  high:   { floor: "Hardwood parquet",   marking: "Inlay wood",     gradin: "Aluminum seating" },
};

/**
 * Which catalog material each quality tier means.
 *
 * The tier names a surface in plain words; the catalog row is what carries the
 * price, the norm and the carbon figure. Without this link a pushed court had
 * no material picked, so it had no price — the reference dropdown was optional
 * and nobody filled it in.
 *
 * Picking one in the Sport tab still overrides this; it is the starting point,
 * not a lock.
 */
const QUALITY_REFERENCE_MATERIAL = {
  low:    "PVC sheet, single-layer (economy)",
  medium: "Sports vinyl / PVC flooring",
  high:   "Wood sprung floor / parquet",
};

/**
 * quality_key format: {SPORT}_{VARIANT}_{QUALITY}
 * Used as the primary lookup key in the backend database (see Sportify_Norms_Database.xlsx)
 */
function getQualityKey(sport, variant, quality) {
  return `${sport.toUpperCase()}_${variant.toUpperCase()}_${quality.toUpperCase()}`;
}
