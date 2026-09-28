/**
 * prebuiltSessions.js — real Goldbeck IFC model sessions, one per roof
 *
 * The three synthetic hand-built patterns this file used to hold (a made-up
 * 67.6 x 21.0 m roof, invented item mixes) are gone — replaced by real
 * exports taken straight from the actual IFC model
 * (thow_IFC_Modelifc.ifc_sample_nada.fenicheZPV24.RVT), one roof at a time,
 * via the same live "Push to Sportify" + Algorithmic placement + Export
 * Combined JSON path a planner uses themselves (user, 2026-09-28: "this
 * exact roof boundary... this will be the standard goldbeck session").
 *
 * Ten identical top-of-storey slabs exist in that model; the two used here
 * are the top two: E10 (highest) and E9 (the one below it). Each entry's
 * payload is the literal buildCombinedPayload() output captured live —
 * real boundary polygon (12-point L/notched outline, 67.5 x 16.28 m), real
 * entries (the model's own ramps), and a layout checked against the app's
 * own real engine (0 unplaced, 0 overlaps) before being captured.
 *
 * GOLDBECK_PREBUILT_SESSIONS keeps the { id, title, tagline, generate() }
 * shape sessionGate.js/compareController.js already read — generate()
 * returns a fresh deep copy of the fixed payload every time (no randomness:
 * this is real, not generated, data), so "Shuffle" on these cards is a
 * harmless no-op rather than something that needs removing card-by-card.
 * A generated payload is the same shape buildCombinedPayload()
 * (combineController.js) produces and loads straight into
 * applySessionSnapshot() — indistinguishable from a planner's own saved
 * session: fully editable afterward, "Save Session" writes a normal local
 * copy.
 */

function goldbeckCloneRealPayload(payload) {
  return typeof structuredClone === "function" ? structuredClone(payload) : JSON.parse(JSON.stringify(payload));
}

/** Roof 2 — E9, the lower of the top two slabs (world_origin_z_m 12.481): the sports layout (8 courts, 0 unplaced). */
const GOLDBECK_LOW_ROOF_SPORTS_PAYLOAD = {
  "version": "1.3", "generator": "Sportify-Combine",
  "roof_context": {
    "length_m": 67.5, "width_m": 16.28, "program": null, "source": "revit",
    "source_boundary_polygon": [
      { "x_m": 64.8, "y_m": 3.25 }, { "x_m": 67.5, "y_m": 3.25 }, { "x_m": 67.5, "y_m": 16.28 }, { "x_m": 0, "y_m": 16.28 },
      { "x_m": 0, "y_m": 4.41 }, { "x_m": 5.4, "y_m": 4.41 }, { "x_m": 5.4, "y_m": 5 }, { "x_m": 13.5, "y_m": 5 },
      { "x_m": 13.5, "y_m": 0 }, { "x_m": 56.7, "y_m": 0 }, { "x_m": 56.7, "y_m": 5 }, { "x_m": 64.8, "y_m": 5 },
    ],
    "world_origin_x_m": 0.109, "world_origin_y_m": 16.28, "rotation_deg": 0, "world_origin_z_m": 12.481,
    "height_above_ground_m": 12.48, "height_source": "level \"Basisebene\" (nearest the project zero; no ground floor by name)",
    "features": {
      "source": "revit", "notes": [], "openings": [],
      "entries": [
        { "id": "ramp_1", "kind": "ramp", "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 7", "x_m": 58.86, "y_m": 12.55, "width_m": 0, "on_roof": true, "source_element_id": 2520305 },
        { "id": "ramp_2", "kind": "ramp", "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 5", "x_m": 58.86, "y_m": 16.31, "width_m": 0, "on_roof": true, "source_element_id": 2520299 },
        { "id": "ramp_3", "kind": "ramp", "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278", "x_m": 60.75, "y_m": 17.01, "width_m": 0, "on_roof": false, "source_element_id": 2520296 },
        { "id": "ramp_4", "kind": "ramp", "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 6", "x_m": 62.64, "y_m": 12.55, "width_m": 0, "on_roof": true, "source_element_id": 2520308 },
        { "id": "ramp_5", "kind": "ramp", "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 4", "x_m": 62.64, "y_m": 16.31, "width_m": 0, "on_roof": true, "source_element_id": 2520302 },
      ],
      "edges": [], "obstacles": [], "equipment": [], "drains": [], "slab": null, "levels": [],
    },
  },
  "design_rules": { "clearance_m": 1, "boundary_setback_m": 1.5, "circulation_width_m": 1.2, "min_entry_points": 1, "quiet_buffer_m": 3 },
  "entry_points": [
    { "x_m": 58.86, "y_m": 11.28, "edge": "bottom" }, { "x_m": 56.7, "y_m": 16.28, "edge": "bottom" },
    { "x_m": 62.64, "y_m": 11.28, "edge": "bottom" }, { "x_m": 64.8, "y_m": 13.03, "edge": "bottom" },
  ],
  "placements": [
    { "id": "gb_low_0", "category": "activity", "label": "Locker & Dressing Room Module", "insertion_point": { "center_x_m": 50.2, "center_y_m": 10.2 }, "bounding_box": { "top_left_x_m": 45.2, "top_left_y_m": 7.7, "width_m": 10, "height_m": 5 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_LOCKER_ROOM", "activity": { "type_id": "locker_room", "category": "service", "norm": "Reference sheet", "dimensions": { "length_m": 10, "width_m": 5 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null } } },
    { "id": "gb_low_1", "category": "activity", "label": "Bathroom & Shower Module", "insertion_point": { "center_x_m": 38.2, "center_y_m": 10.2 }, "bounding_box": { "top_left_x_m": 33.2, "top_left_y_m": 7.7, "width_m": 10, "height_m": 5 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_BATHROOM_MODULE", "activity": { "type_id": "bathroom_module", "category": "service", "norm": "Reference sheet", "dimensions": { "length_m": 10, "width_m": 5 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null } } },
    { "id": "gb_low_2", "category": "activity", "label": "Ping Pong Station", "insertion_point": { "center_x_m": 27.4, "center_y_m": 7.8 }, "bounding_box": { "top_left_x_m": 23.6, "top_left_y_m": 5.5, "width_m": 7.6, "height_m": 4.6 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_PING_PONG", "activity": { "type_id": "ping_pong", "category": "court", "norm": "Reference sheet", "dimensions": { "length_m": 7.6, "width_m": 4.6 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null }, "ping_pong": { "playing_space": "recreational", "table": "steel_composite", "net": "permanent", "surface": "existing", "appearance_hex": null, "texture": "flat", "length_m": 7.6, "width_m": 4.6, "table_length_m": 2.74, "table_width_m": 1.525, "table_height_m": 0.76, "table_top_thickness_m": 0.025, "net_height_m": 0.1525, "net_overhang_m": 0.1525, "line_width_m": 0.02, "centre_line_width_m": 0.003, "clearance_end_m": 2.43, "clearance_side_m": 1.54, "clear_height_min_m": 5, "weight_kg": 0, "weight_kg_m2": 0, "source": "Casual play — below any ITTF minimum" } } },
    { "id": "gb_low_3", "category": "activity", "label": "Ping Pong Station", "insertion_point": { "center_x_m": 27.4, "center_y_m": 12.4 }, "bounding_box": { "top_left_x_m": 23.6, "top_left_y_m": 10.1, "width_m": 7.6, "height_m": 4.6 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_PING_PONG", "activity": { "type_id": "ping_pong", "category": "court", "norm": "Reference sheet", "dimensions": { "length_m": 7.6, "width_m": 4.6 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null }, "ping_pong": { "playing_space": "recreational", "table": "steel_composite", "net": "permanent", "surface": "existing", "appearance_hex": null, "texture": "flat", "length_m": 7.6, "width_m": 4.6, "table_length_m": 2.74, "table_width_m": 1.525, "table_height_m": 0.76, "table_top_thickness_m": 0.025, "net_height_m": 0.1525, "net_overhang_m": 0.1525, "line_width_m": 0.02, "centre_line_width_m": 0.003, "clearance_end_m": 2.43, "clearance_side_m": 1.54, "clear_height_min_m": 5, "weight_kg": 0, "weight_kg_m2": 0, "source": "Casual play — below any ITTF minimum" } } },
    { "id": "gb_low_4", "category": "activity", "label": "Padel Tennis Court", "insertion_point": { "center_x_m": 11.5, "center_y_m": 4.5 }, "bounding_box": { "top_left_x_m": 1.5, "top_left_y_m": 1.5, "width_m": 20, "height_m": 6 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_PADEL_COURT", "activity": { "type_id": "padel_court", "category": "court", "norm": "FIP (singles court)", "dimensions": { "length_m": 20, "width_m": 6 }, "variant": "mini" }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null } } },
    { "id": "gb_low_5", "category": "activity", "label": "Modular Tower Slide", "insertion_point": { "center_x_m": 62.5, "center_y_m": 5.2 }, "bounding_box": { "top_left_x_m": 59, "top_left_y_m": 2.7, "width_m": 7, "height_m": 5 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_MODULAR_TOWER_SLIDE", "activity": { "type_id": "modular_tower_slide", "category": "playground", "norm": "Reference sheet", "dimensions": { "length_m": 7, "width_m": 5 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null } } },
    { "id": "gb_low_6", "category": "activity", "label": "Sand Pit", "insertion_point": { "center_x_m": 35.2, "center_y_m": 3.5 }, "bounding_box": { "top_left_x_m": 33.2, "top_left_y_m": 1.5, "width_m": 4, "height_m": 4 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_SAND_PIT", "activity": { "type_id": "sand_pit", "category": "playground", "norm": "Reference sheet", "dimensions": { "length_m": 4, "width_m": 4 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null } } },
    { "id": "gb_low_7", "category": "activity", "label": "Trampoline", "insertion_point": { "center_x_m": 41.2, "center_y_m": 3.5 }, "bounding_box": { "top_left_x_m": 39.2, "top_left_y_m": 1.5, "width_m": 4, "height_m": 4 }, "transform": { "rotation_deg": 0 }, "parameters": { "version": "1.0", "generator": "Sportify-Algorithmic-Placement", "quality_key": "ACTIVITY_TRAMPOLINE", "activity": { "type_id": "trampoline", "category": "playground", "norm": "Reference sheet", "dimensions": { "length_m": 4, "width_m": 4 } }, "materials": { "surface": "Reinforced synthetic surface", "structure": "Galvanized steel", "quality_level": "medium", "reference_material": null, "reference_provider": null }, "familyInstance": { "type": "trampoline", "label": "Trampoline in a Sand Pit", "family": "Trampoline-SandPit", "units": "mm", "params": { "Jump_Radius": 1450, "Pad_Width": 300, "Base_Height": 400, "Bedding": 50, "Net_Height": 2100, "Show_Net": false } } } },
  ],
};

/* ---- public registry — sessionGate.js / compareController.js call .generate() on demand, never read a precomputed field ---- */
const GOLDBECK_PREBUILT_SESSIONS = {
  lowRoofSports: {
    id: "lowRoofSports", title: "Goldbeck — Low Roof, Sports",
    tagline: "8 courts on the real E9 slab: Padel, 2 Ping Pong, Sand Pit, Trampoline, Modular Tower Slide, Locker & Bathroom modules.",
    generate: () => goldbeckCloneRealPayload(GOLDBECK_LOW_ROOF_SPORTS_PAYLOAD),
  },
  // highRoofGarden: the E10 slab (the highest of the two), a garden preset — added once that roof is pushed and captured the same way.
};
