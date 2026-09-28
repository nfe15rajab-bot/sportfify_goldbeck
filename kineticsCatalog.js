/**
 * kineticsCatalog.js — the kinetic elements catalog: louvre pergolas, sails, screens, fences, and a few
 * new ideas (PV canopy, acoustic screen, divider net, membrane roof, green screen, wind-break screen).
 *
 * Placed the same way furniture is: pick one, push it to the tray, drag it onto the roof (or let the
 * Algorithmic placement panel place several by quantity, for the freestanding kinds — an edge-anchored
 * kind belongs on a specific edge, not floating in open area, so it stays manual-only, same as a roller
 * fence already is conceptually).
 *
 * `kineticKind` is the stable key Revit's KineticKind enum uses (KineticsHosts.cs) — carried through the
 * export so the add-in's Kinetics ribbon knows which of its own kinds a placement is for.
 *
 * `built: true` — Revit already has real mechanics for this kind (actuator sizing, SolidWorks assembly,
 * wind checks): Overhead louvre, Sail and Roller fence, exactly the three kinds whose position used to be
 * entirely analysis-derived. Placing one here means "Import Analysis Adaptation" builds from this
 * footprint instead of guessing a spot from the Sun & Shade / Ball Trajectory results.
 *
 * `built: false` — placeable now for spatial planning, but Revit has no parametric mechanism for it yet —
 * picking one in the ribbon says so plainly instead of pretending to compute something.
 *
 * `variants` — every kind offers 2-3 standard BUILD sizes rather than one arbitrary footprint, each keyed
 * "compact" | "standard" | "large" (a shared, generic vocabulary — unlike the sport catalog's own
 * mini/standard/competition, which reads oddly on a pergola or a wind screen). Each is grounded in a real
 * fabrication unit, documented per kind below, the same way the rest of this catalog documents its
 * assumptions rather than hiding them. "standard" is what a designer gets by default, and (for the five
 * freestanding kinds) is the exact figure algoPlacementCore.js's SPORTS table already uses for the
 * Algorithmic placement panel, which does not yet offer a size choice of its own — see that file's own
 * comment on this. Kinetics keeps its own tier storage (kineticsCombine.js's getKineticsBuildSize /
 * setKineticsBuildSize) rather than activitiesData.js's getSportTier/setSportTier: that machinery's
 * "mini/standard/competition" vocabulary is FIBA/DIN court language, and would misdescribe a fence panel run.
 */

const KINETICS = {
  overhead_louvre: {
    label: "Overhead Louvre (Pergola)", short: "Louvre pergola", icon: "ti-sun",
    category: "freestanding", kineticKind: "overhead", built: true,
    hint: "Rotating blades that tilt-track the sun. Position and count here decide where Revit's Kinetics ribbon builds it; the blade spacing and actuator sizing still come from the Sun & Shade Analysis.",
    // Bioclimatic aluminium pergola systems are commonly sold as bay modules of about 3 m; a run is built from 1-3 bays.
    variants: {
      compact: { length: 3.0, width: 3.0, note: "one bay" },
      standard: { length: 6.0, width: 4.0, note: "two bays" },
      large: { length: 9.0, width: 4.0, note: "three bays" },
    },
  },
  shade_sail: {
    label: "Tensile Sail (Movable Pillars)", short: "Shade sail", icon: "ti-triangle",
    category: "freestanding", kineticKind: "sail", built: true,
    hint: "Fabric sail on masts that slide on ground rails to grow or shrink the shade. Real mechanics (mast sizing, track length, drive force) come from the Sun & Shade Analysis once placed.",
    // Off-the-shelf shade-sail kits are typically offered in a handful of set footprints; these three span the usual range.
    variants: {
      compact: { length: 5.0, width: 4.0, note: "small kit" },
      standard: { length: 8.0, width: 6.0, note: "medium kit" },
      large: { length: 10.0, width: 8.0, note: "large kit" },
    },
  },
  roller_fence: {
    label: "Roller Fence", short: "Roller fence", icon: "ti-fence",
    category: "edge", kineticKind: "fence", built: true,
    hint: "A curtain on guide rails at a roof edge, deployed only when needed. Drag it onto the edge you want protected; the Ball Trajectory Analysis still sizes the rails and checks the impact energy.",
    // Guide rails come from 6 m aluminium extrusion stock; a run is 1-3 stock lengths joined end to end.
    variants: {
      compact: { length: 6.0, width: 0.3, note: "one rail run (6 m stock)" },
      standard: { length: 12.0, width: 0.3, note: "two rail runs" },
      large: { length: 18.0, width: 0.3, note: "three rail runs" },
    },
  },
  pv_canopy: {
    label: "Solar-Tracking PV Canopy", short: "PV canopy", icon: "ti-solar-panel",
    category: "freestanding", kineticKind: "pv_canopy", built: true,
    hint: "Same overhead-louvre frame and single-axis tracking, panels in place of blades. Row spacing avoids self-shading (not a shade target); panel mass is a stated placeholder (~15 kg/m²) until a real module spec is entered.",
    // Same bay-module system as the overhead louvre, since it reuses that mechanism.
    variants: {
      compact: { length: 3.0, width: 3.0, note: "one bay" },
      standard: { length: 6.0, width: 4.0, note: "two bays" },
      large: { length: 9.0, width: 4.0, note: "three bays" },
    },
  },
  acoustic_screen: {
    label: "Retractable Acoustic Screen", short: "Acoustic screen", icon: "ti-volume-3",
    category: "edge", kineticKind: "acoustic_screen", built: false,
    hint: "A deployable vertical baffle between a loud court and a quiet zone. Placeable now; Revit has no acoustic-baffle mechanics yet.",
    // Baffle-panel stock in 4 m lengths; a run is 1-2 panels (a third panel would need a mid-span post the concept doesn't have yet).
    variants: {
      compact: { length: 4.0, width: 0.3, note: "one panel" },
      standard: { length: 8.0, width: 0.3, note: "two panels" },
    },
  },
  divider_net: {
    label: "Retractable Court Divider Net", short: "Divider net", icon: "ti-grid-dots",
    category: "edge", kineticKind: "divider_net", built: false,
    hint: "A net or mesh wall that raises/lowers between two courts. Placeable now; Revit has no divider-net mechanics yet.",
    // Sized to the width of the court it divides, rather than an arbitrary stock length.
    variants: {
      compact: { length: 6.1, width: 0.3, note: "badminton / pickleball width" },
      standard: { length: 10.0, width: 0.3, note: "padel width" },
      large: { length: 20.0, width: 0.3, note: "multi-sport court width" },
    },
  },
  membrane_roof: {
    label: "Retractable Membrane Roof", short: "Membrane roof", icon: "ti-tent",
    category: "freestanding", kineticKind: "membrane_roof", built: false,
    hint: "An ETFE/fabric roof over a single court that opens and closes — a single-court-scale version of a kinetic greenhouse. Placeable now; Revit has no membrane-roof mechanics yet.",
    // Sized to the single court it covers.
    variants: {
      compact: { length: 10.0, width: 6.0, note: "padel / pickleball court" },
      standard: { length: 12.0, width: 8.0, note: "badminton / half-court scale" },
      large: { length: 22.0, width: 12.0, note: "full multipurpose court" },
    },
  },
  green_screen: {
    label: "Kinetic Green Screen", short: "Green screen", icon: "ti-plant-2",
    category: "freestanding", kineticKind: "green_screen", built: false,
    hint: "A vertically retractable planted trellis — shade or privacy, bridging the garden and kinetic sides of the roof. Placeable now; Revit has no green-screen mechanics yet.",
    // Trellis systems come as 2 m modules; a run is 1-3 modules.
    variants: {
      compact: { length: 2.0, width: 0.5, note: "one module" },
      standard: { length: 4.0, width: 0.5, note: "two modules" },
      large: { length: 6.0, width: 0.5, note: "three modules" },
    },
  },
  windbreak_screen: {
    label: "Wind-Break Screen", short: "Wind-break", icon: "ti-wind",
    category: "edge", kineticKind: "windbreak", built: false,
    hint: "A deployable screen on an edge flagged by the Wind & Erosion analysis, distinct from the roller fence (which stops balls, not wind). Placeable now; Revit has no wind-break mechanics yet.",
    // Same rail-stock logic as the roller fence.
    variants: {
      compact: { length: 6.0, width: 0.3, note: "one rail run (6 m stock)" },
      standard: { length: 12.0, width: 0.3, note: "two rail runs" },
    },
  },
};

const KINETICS_BUILD_SIZE_ORDER = ["compact", "standard", "large"];

/** The build sizes a kinetic element offers, in order ([] never happens — every entry has at least "standard"). */
function kineticsBuildSizeKeys(id) {
  const v = KINETICS[id] && KINETICS[id].variants;
  return v ? KINETICS_BUILD_SIZE_ORDER.filter(k => v[k]) : [];
}

const kineticsBuildSizeLabel = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
