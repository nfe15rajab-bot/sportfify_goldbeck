/**
 * greenRoof.js — the green roof family that a Zone is built from.
 *
 * ── Why this is not in the Components tab ──
 * Everything in Components is a THING YOU PUT ON the roof: a bench, a planter,
 * a locker bank. A green roof module is not put on the roof — it IS the roof, or
 * rather it is the tray the roof build-up sits in. It belongs to the zone you
 * draw, which is why the picker for it lives in the Zones panel next to the
 * build-up system, and why a zone now carries a family key alongside its
 * assembly key.
 *
 * ── What the family turned out to be ──
 * Sportify_GreenRoofModule is the SAME parametric family as the planters, value
 * for value: every formula in planters.js's PLANTER_FORMULAS reproduces the
 * green roof's shipped numbers exactly (rim level 270, fleece top 155, freeboard
 * 35, cap top 340). It is a tray with a pedestal, a rim, a drainage outlet, and
 * a stack of layers inside it — a planter whose rim happens to be 170 mm rather
 * than 450.
 *
 * That is worth stating plainly because it is what makes this file short: there
 * is no second geometry model to maintain. The family's own arithmetic is
 * already written down in planters.js and is reused here rather than copied.
 *
 * ── The generic model box, and what replaces it ──
 * Inside the family, between Fleece Top (155) and Rim Level (270), sits a
 * generic-model extrusion. It is a PLACEHOLDER for the build-up: a solid block
 * standing in for layers nobody had chosen yet.
 *
 * Once a build-up system IS chosen, that block is a lie — it says "something
 * 115 mm thick" where the real answer is "ZinCo Floradrain FD 60, five named
 * layers, 27 kg/m² saturated". So on import Revit deletes the block and sketches
 * a real floor of the chosen system in its place. The tray, rim, pedestal and
 * outlet stay: those are the product. Only the stand-in goes.
 *
 * ── The build-up drives the tray ──
 * The chosen system's layers are mapped onto the four the family exposes
 * (protection, drainage, filter, substrate) so the tray is not left describing a
 * different build-up from the floor inside it. Layers the tray has no slot for —
 * vegetation, root barrier, waterproofing — are carried by the floor alone,
 * which is correct: they are not things the tray is made of.
 *
 * The rim then follows from the layers rather than being set by hand, using the
 * family's own relationship. Checked against the shipped defaults:
 *   20 + 5 protection + 25 drainage + 5 filter + 80 substrate + 35 freeboard
 *     = 170 = the family's Rim Height.
 * So a deeper system raises the rim to contain it, which is what a tray has to
 * do, instead of quietly overflowing.
 */

/** Millimetres of freeboard kept between the top of the substrate and the rim. The family ships with exactly this. */
const GREEN_ROOF_FREEBOARD_MM = 35;

/** The tray floor sits this far above the pedestal top — the family's "Tray Floor Top = Pedestal Height + 20 mm". */
const GREEN_ROOF_TRAY_FLOOR_MM = 20;

/**
 * The green roof families we can build a zone from.
 *
 * One today. It is a table rather than a constant so that a second module — a
 * different manufacturer's tray, a deeper one for intensive systems — is a row
 * here and a .rfa in the library, not a change to the panel or to Revit.
 */
const GREEN_ROOF_FAMILIES = {
  green_roof_module: {
    label: "Green Roof Module",
    family: "Sportify_GreenRoofModule",
    type: "Green Roof Module",
    // The rim is worked out from the build-up, so it is not listed as a default.
    defaults: {
      defaultElevation: 0,
      pedestalHeight: 100,
      protectionMat: 5,
      drainageDepth: 25,
      filterFleece: 5,
      substrateDepth: 80,
      outletHeight: 30,
      outletBottomOffset: 25,
      outletTopOffset: 55,
      centreRow: true,
      seatCap: false,
      tree: false,
    },
    // Both 2400 in the family, but the family is parametric in Length and
    // Width, so a zone sets them rather than being tiled out of modules.
    nominal: { length: 2400, width: 2400 },
    note: "Parametric tray — Length and Width follow the zone.",
  },
};

const GREEN_ROOF_DEFAULT_FAMILY = "green_roof_module";

/**
 * Which family parameter each build-up layer function feeds.
 *
 * A build-up may have several layers of one function (two drainage boards, say);
 * they are summed, because the tray has one slot and the total is what has to
 * fit under the rim.
 */
const GREEN_ROOF_LAYER_SLOTS = {
  protection: "protectionMat",
  drainage: "drainageDepth",
  filter: "filterFleece",
  substrate: "substrateDepth",
};

/** Layer functions the tray has no slot for — carried by the floor, not by the family. */
const GREEN_ROOF_UNTRAYED = ["vegetation", "root_barrier", "waterproofing", "wearing", "bedding"];

function getGreenRoofFamily(key) {
  return GREEN_ROOF_FAMILIES[key || GREEN_ROOF_DEFAULT_FAMILY] || null;
}

/**
 * The family's parameters for one zone: the build-up mapped onto the tray's
 * layers, the rim sized to contain them, and Length/Width from the zone.
 *
 * Returns null when there is no family — a zone with no family is still a valid
 * zone (it becomes a floor with no tray), so this is a normal answer, not a fault.
 */
function greenRoofParams(familyKey, assembly, length_m, width_m) {
  const fam = getGreenRoofFamily(familyKey);
  if (!fam) return null;

  const p = Object.assign({}, fam.defaults);

  // The build-up overrides the family's own layer depths, slot by slot. A system
  // that simply has no protection layer sets that slot to 0 rather than leaving
  // the family's 5 mm behind, which would describe a layer the system does not have.
  if (assembly && Array.isArray(assembly.layers)) {
    Object.values(GREEN_ROOF_LAYER_SLOTS).forEach(slot => { p[slot] = 0; });
    assembly.layers.forEach(l => {
      const slot = GREEN_ROOF_LAYER_SLOTS[l.fn];
      if (slot) p[slot] += (l.mm || 0);
    });
  }

  // The rim contains the layers, plus freeboard. The family's own relationship.
  p.rimHeight = GREEN_ROOF_TRAY_FLOOR_MM
    + p.protectionMat + p.drainageDepth + p.filterFleece + p.substrateDepth
    + GREEN_ROOF_FREEBOARD_MM;

  // Metres on the roof, millimetres in the family — as everywhere else here.
  p.length = Math.round((length_m || 0) * 1000);
  p.width = Math.round((width_m || 0) * 1000);

  // The family works the rest out by formula; we work them out with the SAME
  // formulas so the panel and Revit cannot disagree. Revit is never asked to set
  // these — they are read-only there, driven by the formulas that produced them.
  if (typeof PLANTER_FORMULAS !== "undefined") {
    PLANTER_FORMULAS.forEach(([key, , , fn]) => { p[key] = fn(p); });
  }
  return p;
}

/**
 * The layers the chosen build-up has that the tray cannot express, so the panel
 * can say so rather than letting the two quietly describe different roofs.
 */
function greenRoofUntrayedLayers(assembly) {
  if (!assembly || !Array.isArray(assembly.layers)) return [];
  return assembly.layers.filter(l => GREEN_ROOF_UNTRAYED.includes(l.fn));
}

/** Total build-up carried by the tray itself, in mm. */
function greenRoofTrayedMm(params) {
  if (!params) return 0;
  return params.protectionMat + params.drainageDepth + params.filterFleece + params.substrateDepth;
}

/**
 * A section through the tray with the build-up in it — the point being to show
 * that the build-up FITS, which is the one thing that can go wrong when a system
 * is swapped for a deeper one.
 */
function greenRoofSectionSvg(params, assembly, isDark) {
  if (!params) return "";
  const W = 260, H = 130, PAD = 26;
  const totalMm = params.capTop || (params.rimLevel + 70);
  const s = (H - PAD * 2) / Math.max(1, totalMm);      // one scale, mm -> px
  const baseY = H - PAD;
  const mm = v => v * s;
  const yOf = v => baseY - mm(v);

  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const tray = isDark ? "#4a4e58" : "#8d939c";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  const x0 = PAD + 34, x1 = W - PAD;
  const wall = Math.max(2, mm(40));

  // The layers, bottom up, in the same colours the build-up strip uses.
  const fnOf = key => Object.keys(GREEN_ROOF_LAYER_SLOTS).find(f => GREEN_ROOF_LAYER_SLOTS[f] === key);
  const stack = [
    ["protectionMat", params.trayFloorTop],
    ["drainageDepth", params.matTop],
    ["filterFleece", params.drainageTop],
    ["substrateDepth", params.fleeceTop],
  ];

  let out = "";
  // Pedestal and tray floor.
  out += `<rect x="${x0}" y="${yOf(params.pedestalHeight)}" width="${x1 - x0}" height="${mm(params.pedestalHeight)}"
                fill="none" stroke="${tray}" stroke-width="1" stroke-dasharray="3 3"/>`;
  out += `<rect x="${x0}" y="${yOf(params.trayFloorTop)}" width="${x1 - x0}" height="${mm(GREEN_ROOF_TRAY_FLOOR_MM)}" fill="${tray}"/>`;

  stack.forEach(([slot, bottom]) => {
    const d = params[slot];
    if (!d) return;
    const f = (typeof ASSEMBLY_LAYER_FUNCTIONS !== "undefined" && ASSEMBLY_LAYER_FUNCTIONS[fnOf(slot)]) || { color: "#888", label: slot };
    out += `<rect x="${x0 + wall}" y="${yOf(bottom + d)}" width="${x1 - x0 - wall * 2}" height="${Math.max(1, mm(d))}"
                  fill="${f.color}"><title>${escapeHtml(f.label)} — ${d} mm</title></rect>`;
  });

  // The rim walls, drawn last so they read as in front of the fill.
  out += `<rect x="${x0}" y="${yOf(params.rimLevel)}" width="${wall}" height="${mm(params.rimLevel - params.pedestalHeight)}" fill="${tray}"/>`;
  out += `<rect x="${x1 - wall}" y="${yOf(params.rimLevel)}" width="${wall}" height="${mm(params.rimLevel - params.pedestalHeight)}" fill="${tray}"/>`;

  // Freeboard, the gap that proves it fits.
  out += `<line x1="${x0 + wall}" y1="${yOf(params.substrateTop)}" x2="${x1 - wall}" y2="${yOf(params.substrateTop)}"
                stroke="${dim}" stroke-width="0.75" stroke-dasharray="4 3"/>`;

  out += `<text x="${x0 - 6}" y="${yOf(params.rimLevel) + 3}" text-anchor="end" font-size="8.5" fill="${dim}" ${font}>${params.rimLevel}</text>`;
  out += `<text x="${x0 - 6}" y="${yOf(params.substrateTop) + 3}" text-anchor="end" font-size="8.5" fill="${dim}" ${font}>${params.substrateTop}</text>`;
  out += `<text x="${x0 - 6}" y="${yOf(0) + 3}" text-anchor="end" font-size="8.5" fill="${dim}" ${font}>0</text>`;
  out += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="8.5" fill="${dim}" ${font}>Section through the tray · mm</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Section through the green roof tray">${out}</svg>`;
}

/**
 * What a zone's family carries into the export.
 *
 * `strip_generic_model` is the instruction that matters: it tells the importer
 * the placeholder block between Fleece Top and Rim Level is to be deleted and a
 * real floor of `assembly_key` put in its place. It is false when no build-up
 * was chosen, because then the placeholder is still the best thing we have.
 */
function greenRoofFamilyPayload(familyKey, assembly, length_m, width_m) {
  const fam = getGreenRoofFamily(familyKey);
  const params = greenRoofParams(familyKey, assembly, length_m, width_m);
  if (!fam || !params) return null;

  return {
    key: familyKey,
    family: fam.family,
    type: fam.type,
    units: "mm",
    parameters: params,
    strip_generic_model: !!assembly,
    // Where the floor's top goes: level with the substrate, inside the tray.
    floor_top_mm: params.substrateTop,
    trayed_mm: greenRoofTrayedMm(params),
    untrayed_layers: greenRoofUntrayedLayers(assembly).map(l => ({ name: l.name, fn: l.fn, mm: l.mm })),
  };
}
