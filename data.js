/**
 * data.js — Sportify field & material reference data
 * Source: DIN 18032, FIBA, IHF, FIVB, BWF, DFB
 */

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

const MATERIALS = {
  low:    { floor: "PVC sheet",          marking: "Painted",        gradin: "Steel basic" },
  medium: { floor: "Sports vinyl (2-layer)", marking: "Adhesive tape", gradin: "Steel coated" },
  high:   { floor: "Hardwood parquet",   marking: "Inlay wood",     gradin: "Aluminum seating" },
};

/**
 * quality_key format: {SPORT}_{VARIANT}_{QUALITY}
 * Used as the primary lookup key in the backend database (see Sportify_Norms_Database.xlsx)
 */
function getQualityKey(sport, variant, quality) {
  return `${sport.toUpperCase()}_${variant.toUpperCase()}_${quality.toUpperCase()}`;
}
