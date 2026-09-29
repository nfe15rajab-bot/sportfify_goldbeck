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
  "version": "1.3",
  "generator": "Sportify-Combine",
  "roof_context": {
    "length_m": 67.5,
    "width_m": 16.28,
    "program": "sports",
    "source": "revit",
    "source_boundary_polygon": [
      {
        "x_m": 64.8,
        "y_m": 3.25
      },
      {
        "x_m": 67.5,
        "y_m": 3.25
      },
      {
        "x_m": 67.5,
        "y_m": 16.28
      },
      {
        "x_m": 0,
        "y_m": 16.28
      },
      {
        "x_m": 0,
        "y_m": 4.41
      },
      {
        "x_m": 5.4,
        "y_m": 4.41
      },
      {
        "x_m": 5.4,
        "y_m": 5
      },
      {
        "x_m": 13.5,
        "y_m": 5
      },
      {
        "x_m": 13.5,
        "y_m": 0
      },
      {
        "x_m": 56.7,
        "y_m": 0
      },
      {
        "x_m": 56.7,
        "y_m": 5
      },
      {
        "x_m": 64.8,
        "y_m": 5
      }
    ],
    "world_origin_x_m": 0.109,
    "world_origin_y_m": 16.28,
    "rotation_deg": 0,
    "world_origin_z_m": 12.481,
    "height_above_ground_m": 12.48,
    "height_source": "level \"Basisebene\" (nearest the project zero; no ground floor by name)",
    "features": {
      "source": "revit",
      "notes": [],
      "openings": [],
      "entries": [
        {
          "id": "ramp_1",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 7",
          "x_m": 58.86,
          "y_m": 12.55,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2520305
        },
        {
          "id": "ramp_2",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 5",
          "x_m": 58.86,
          "y_m": 16.31,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2520299
        },
        {
          "id": "ramp_3",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278",
          "x_m": 60.75,
          "y_m": 17.01,
          "width_m": 0,
          "on_roof": false,
          "source_element_id": 2520296
        },
        {
          "id": "ramp_4",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 6",
          "x_m": 62.64,
          "y_m": 12.55,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2520308
        },
        {
          "id": "ramp_5",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791278 4",
          "x_m": 62.64,
          "y_m": 16.31,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2520302
        }
      ],
      "edges": [],
      "obstacles": [],
      "equipment": [],
      "drains": [],
      "slab": null,
      "levels": []
    },
    "structure": {
      "source": "revit",
      "deck_capacity_kn_m2": null,
      "natural_frequency_hz": null,
      "grid_lines": [
        {
          "name": "1",
          "start_m": {
            "x_m": -0.109,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": -0.109,
            "y_m": -0.25
          }
        },
        {
          "name": "10",
          "start_m": {
            "x_m": 24.3,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 24.3,
            "y_m": -0.25
          }
        },
        {
          "name": "11",
          "start_m": {
            "x_m": 27,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 27,
            "y_m": -0.25
          }
        },
        {
          "name": "12",
          "start_m": {
            "x_m": 29.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 29.7,
            "y_m": -0.25
          }
        },
        {
          "name": "13",
          "start_m": {
            "x_m": 32.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 32.4,
            "y_m": -0.25
          }
        },
        {
          "name": "14",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": -0.25
          }
        },
        {
          "name": "15",
          "start_m": {
            "x_m": 37.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 37.8,
            "y_m": -0.25
          }
        },
        {
          "name": "16",
          "start_m": {
            "x_m": 40.5,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 40.5,
            "y_m": -0.25
          }
        },
        {
          "name": "17",
          "start_m": {
            "x_m": 43.2,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 43.2,
            "y_m": -0.25
          }
        },
        {
          "name": "18",
          "start_m": {
            "x_m": 45.9,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 45.9,
            "y_m": -0.25
          }
        },
        {
          "name": "19",
          "start_m": {
            "x_m": 48.6,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 48.6,
            "y_m": -0.25
          }
        },
        {
          "name": "2",
          "start_m": {
            "x_m": 2.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": -0.25
          }
        },
        {
          "name": "20",
          "start_m": {
            "x_m": 51.3,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 51.3,
            "y_m": -0.25
          }
        },
        {
          "name": "21",
          "start_m": {
            "x_m": 54,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 54,
            "y_m": -0.25
          }
        },
        {
          "name": "22",
          "start_m": {
            "x_m": 56.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 56.7,
            "y_m": -0.25
          }
        },
        {
          "name": "22'",
          "start_m": {
            "x_m": 56.833,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 56.833,
            "y_m": 10.78
          }
        },
        {
          "name": "23",
          "start_m": {
            "x_m": 59.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": -0.25
          }
        },
        {
          "name": "24",
          "start_m": {
            "x_m": 62.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": -0.25
          }
        },
        {
          "name": "24'",
          "start_m": {
            "x_m": 64.667,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 64.667,
            "y_m": 10.78
          }
        },
        {
          "name": "25",
          "start_m": {
            "x_m": 64.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 64.8,
            "y_m": -0.25
          }
        },
        {
          "name": "26",
          "start_m": {
            "x_m": 67.609,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 67.609,
            "y_m": -0.25
          }
        },
        {
          "name": "3",
          "start_m": {
            "x_m": 5.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 5.4,
            "y_m": -0.25
          }
        },
        {
          "name": "3'",
          "start_m": {
            "x_m": 5.533,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 5.533,
            "y_m": 10.78
          }
        },
        {
          "name": "4",
          "start_m": {
            "x_m": 8.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": -0.25
          }
        },
        {
          "name": "5",
          "start_m": {
            "x_m": 10.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": -0.25
          }
        },
        {
          "name": "5'",
          "start_m": {
            "x_m": 13.367,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 13.367,
            "y_m": 10.78
          }
        },
        {
          "name": "6",
          "start_m": {
            "x_m": 13.5,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 13.5,
            "y_m": -0.25
          }
        },
        {
          "name": "7",
          "start_m": {
            "x_m": 16.2,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 16.2,
            "y_m": -0.25
          }
        },
        {
          "name": "8",
          "start_m": {
            "x_m": 18.9,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 18.9,
            "y_m": -0.25
          }
        },
        {
          "name": "9",
          "start_m": {
            "x_m": 21.6,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 21.6,
            "y_m": -0.25
          }
        },
        {
          "name": "H",
          "start_m": {
            "x_m": -0.25,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 16.28
          }
        },
        {
          "name": "I",
          "start_m": {
            "x_m": -0.25,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 13.78
          }
        },
        {
          "name": "I'",
          "start_m": {
            "x_m": -0.25,
            "y_m": 11.875
          },
          "end_m": {
            "x_m": 5.6,
            "y_m": 11.875
          }
        },
        {
          "name": "I''",
          "start_m": {
            "x_m": 64.6,
            "y_m": 13.03
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 13.03
          }
        },
        {
          "name": "J",
          "start_m": {
            "x_m": -0.25,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 11.28
          }
        },
        {
          "name": "K",
          "start_m": {
            "x_m": -0.25,
            "y_m": 9.19
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 9.19
          }
        },
        {
          "name": "L",
          "start_m": {
            "x_m": -0.25,
            "y_m": 7.09
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 7.09
          }
        },
        {
          "name": "M",
          "start_m": {
            "x_m": -0.25,
            "y_m": 5
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 5
          }
        },
        {
          "name": "N",
          "start_m": {
            "x_m": -0.25,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 2.5
          }
        },
        {
          "name": "O",
          "start_m": {
            "x_m": -0.25,
            "y_m": 0
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 0
          }
        }
      ],
      "columns": [
        {
          "label": "16791945",
          "x_m": -0.109,
          "y_m": -0.015
        },
        {
          "label": "16791917",
          "x_m": -0.109,
          "y_m": 2.5
        },
        {
          "label": "16791914",
          "x_m": -0.109,
          "y_m": 5
        },
        {
          "label": "16791911",
          "x_m": -0.109,
          "y_m": 7.09
        },
        {
          "label": "16791908",
          "x_m": -0.109,
          "y_m": 9.19
        },
        {
          "label": "16791905",
          "x_m": -0.109,
          "y_m": 11.28
        },
        {
          "label": "16792096",
          "x_m": -0.109,
          "y_m": 11.875
        },
        {
          "label": "16791986",
          "x_m": 2.7,
          "y_m": 0
        },
        {
          "label": "16792120",
          "x_m": 2.7,
          "y_m": 11.86
        },
        {
          "label": "16791992",
          "x_m": 5.4,
          "y_m": 0
        },
        {
          "label": "16792108",
          "x_m": 5.509,
          "y_m": 11.875
        },
        {
          "label": "16791867",
          "x_m": 5.533,
          "y_m": 11.28
        },
        {
          "label": "16791836",
          "x_m": 5.533,
          "y_m": 13.78
        },
        {
          "label": "16791833",
          "x_m": 5.533,
          "y_m": 16.28
        },
        {
          "label": "16791996",
          "x_m": 8.1,
          "y_m": 0
        },
        {
          "label": "16791883",
          "x_m": 8.1,
          "y_m": 11.256
        },
        {
          "label": "16792000",
          "x_m": 10.8,
          "y_m": 0
        },
        {
          "label": "16791886",
          "x_m": 10.8,
          "y_m": 11.256
        },
        {
          "label": "16791873",
          "x_m": 13.367,
          "y_m": 11.28
        },
        {
          "label": "16791845",
          "x_m": 13.367,
          "y_m": 13.78
        },
        {
          "label": "16791842",
          "x_m": 13.367,
          "y_m": 16.28
        },
        {
          "label": "16792004",
          "x_m": 13.5,
          "y_m": 0
        },
        {
          "label": "16792008",
          "x_m": 16.2,
          "y_m": 0
        },
        {
          "label": "16791953",
          "x_m": 16.2,
          "y_m": 16.28
        },
        {
          "label": "16792012",
          "x_m": 18.9,
          "y_m": 0
        },
        {
          "label": "16791956",
          "x_m": 18.9,
          "y_m": 16.28
        },
        {
          "label": "16792016",
          "x_m": 21.6,
          "y_m": 0
        },
        {
          "label": "16791959",
          "x_m": 21.6,
          "y_m": 16.28
        },
        {
          "label": "16792020",
          "x_m": 24.3,
          "y_m": 0
        },
        {
          "label": "16791961",
          "x_m": 24.3,
          "y_m": 16.28
        },
        {
          "label": "16792024",
          "x_m": 27,
          "y_m": 0
        },
        {
          "label": "16791963",
          "x_m": 27,
          "y_m": 16.28
        },
        {
          "label": "16792028",
          "x_m": 29.7,
          "y_m": 0
        },
        {
          "label": "16791965",
          "x_m": 29.7,
          "y_m": 16.28
        },
        {
          "label": "16792032",
          "x_m": 32.4,
          "y_m": 0
        },
        {
          "label": "16791967",
          "x_m": 32.4,
          "y_m": 16.28
        },
        {
          "label": "16792036",
          "x_m": 35.1,
          "y_m": 0
        },
        {
          "label": "16792089",
          "x_m": 35.1,
          "y_m": 11.28
        },
        {
          "label": "16792087",
          "x_m": 35.1,
          "y_m": 13.78
        },
        {
          "label": "16792092",
          "x_m": 35.1,
          "y_m": 16.28
        },
        {
          "label": "16792040",
          "x_m": 37.8,
          "y_m": 0
        },
        {
          "label": "16791969",
          "x_m": 37.8,
          "y_m": 16.28
        },
        {
          "label": "16792044",
          "x_m": 40.5,
          "y_m": 0
        },
        {
          "label": "16791971",
          "x_m": 40.5,
          "y_m": 16.28
        },
        {
          "label": "16792048",
          "x_m": 43.2,
          "y_m": 0
        },
        {
          "label": "16791973",
          "x_m": 43.2,
          "y_m": 16.28
        },
        {
          "label": "16792052",
          "x_m": 45.9,
          "y_m": 0
        },
        {
          "label": "16791975",
          "x_m": 45.9,
          "y_m": 16.28
        },
        {
          "label": "16792056",
          "x_m": 48.6,
          "y_m": 0
        },
        {
          "label": "16791977",
          "x_m": 48.6,
          "y_m": 16.28
        },
        {
          "label": "16792060",
          "x_m": 51.3,
          "y_m": 0
        },
        {
          "label": "16791979",
          "x_m": 51.3,
          "y_m": 16.28
        },
        {
          "label": "16792064",
          "x_m": 54,
          "y_m": 0
        },
        {
          "label": "16791981",
          "x_m": 54,
          "y_m": 16.28
        },
        {
          "label": "16792068",
          "x_m": 56.7,
          "y_m": 0
        },
        {
          "label": "16791877",
          "x_m": 56.833,
          "y_m": 11.28
        },
        {
          "label": "16791852",
          "x_m": 56.833,
          "y_m": 13.78
        },
        {
          "label": "16791850",
          "x_m": 56.833,
          "y_m": 16.28
        },
        {
          "label": "16792072",
          "x_m": 59.4,
          "y_m": 0
        },
        {
          "label": "16792076",
          "x_m": 62.1,
          "y_m": 0
        },
        {
          "label": "16791881",
          "x_m": 64.667,
          "y_m": 11.28
        },
        {
          "label": "16791860",
          "x_m": 64.667,
          "y_m": 13.78
        },
        {
          "label": "16791857",
          "x_m": 64.667,
          "y_m": 16.28
        },
        {
          "label": "16792114",
          "x_m": 64.691,
          "y_m": 13.03
        },
        {
          "label": "16792080",
          "x_m": 64.8,
          "y_m": 0
        },
        {
          "label": "16791951",
          "x_m": 67.609,
          "y_m": -0.015
        },
        {
          "label": "16791941",
          "x_m": 67.609,
          "y_m": 2.5
        },
        {
          "label": "16791939",
          "x_m": 67.609,
          "y_m": 5
        },
        {
          "label": "16791937",
          "x_m": 67.609,
          "y_m": 7.09
        },
        {
          "label": "16791935",
          "x_m": 67.609,
          "y_m": 9.19
        },
        {
          "label": "16791933",
          "x_m": 67.609,
          "y_m": 11.28
        },
        {
          "label": "16792102",
          "x_m": 67.609,
          "y_m": 13.03
        }
      ],
      "beams": [
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793607",
          "start_m": {
            "x_m": 0.004,
            "y_m": 5.001
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": -0.014
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 12.462
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793598",
          "start_m": {
            "x_m": 0.004,
            "y_m": 5.001
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": -0.014
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 9.712
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793604",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.281
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 5
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 12.525
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793595",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.281
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 5
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 9.775
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793601",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.876
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 11.28
          },
          "width_m": 0.226,
          "depth_m": 0.156,
          "top_elevation_m": 12.531
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793592",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.876
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 11.28
          },
          "width_m": 0.226,
          "depth_m": 0.156,
          "top_elevation_m": 9.781
        },
        {
          "name": "IPE-Träger:IPE 400-Träger:16793090",
          "start_m": {
            "x_m": 2.7,
            "y_m": 11.88
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": 0
          },
          "width_m": 0.18,
          "depth_m": 0.622,
          "top_elevation_m": 12.494
        },
        {
          "name": "IPE-Träger:IPE 400-Träger:16793087",
          "start_m": {
            "x_m": 2.7,
            "y_m": 11.88
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": 0
          },
          "width_m": 0.18,
          "depth_m": 0.622,
          "top_elevation_m": 9.744
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793770",
          "start_m": {
            "x_m": 5.408,
            "y_m": 11.876
          },
          "end_m": {
            "x_m": 5.408,
            "y_m": 11.28
          },
          "width_m": 0.25,
          "depth_m": 0.156,
          "top_elevation_m": 12.531
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793764",
          "start_m": {
            "x_m": 5.408,
            "y_m": 11.876
          },
          "end_m": {
            "x_m": 5.408,
            "y_m": 11.28
          },
          "width_m": 0.25,
          "depth_m": 0.156,
          "top_elevation_m": 9.781
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791388",
          "start_m": {
            "x_m": 5.633,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 11.28
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 12.381
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791370",
          "start_m": {
            "x_m": 5.633,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 11.28
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 9.631
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791387",
          "start_m": {
            "x_m": 5.633,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 13.78
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 12.771
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791369",
          "start_m": {
            "x_m": 5.633,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 13.78
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 10.021
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791389",
          "start_m": {
            "x_m": 5.633,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 16.28
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 13.146
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791371",
          "start_m": {
            "x_m": 5.633,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 16.28
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 10.396
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793049",
          "start_m": {
            "x_m": 8.1,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 12.488
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793034",
          "start_m": {
            "x_m": 8.1,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 9.738
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793052",
          "start_m": {
            "x_m": 10.8,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 12.488
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793037",
          "start_m": {
            "x_m": 10.8,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 9.738
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793794",
          "start_m": {
            "x_m": 13.49,
            "y_m": 16.281
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": 11.28
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 12.575
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793788",
          "start_m": {
            "x_m": 13.49,
            "y_m": 16.281
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": 11.28
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 9.825
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793734",
          "start_m": {
            "x_m": 13.49,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": 16.279
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 8.45
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793740",
          "start_m": {
            "x_m": 13.49,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": 16.279
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 11.2
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793040",
          "start_m": {
            "x_m": 35.1,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 9.738
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793055",
          "start_m": {
            "x_m": 35.1,
            "y_m": 11.364
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.577,
          "top_elevation_m": 12.489
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793131",
          "start_m": {
            "x_m": 35.1,
            "y_m": 13.783
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 11.28
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 9.763
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793134",
          "start_m": {
            "x_m": 35.1,
            "y_m": 13.862
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 11.28
          },
          "width_m": 0.18,
          "depth_m": 0.3,
          "top_elevation_m": 12.514
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793146",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.283
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 13.78
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 12.538
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793143",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.283
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 13.78
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 9.788
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793116",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 16.277
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 8.413
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793119",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 16.277
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 11.163
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793773",
          "start_m": {
            "x_m": 56.711,
            "y_m": 16.281
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": 11.28
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 12.575
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793767",
          "start_m": {
            "x_m": 56.711,
            "y_m": 16.281
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": 11.28
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 9.825
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793707",
          "start_m": {
            "x_m": 56.711,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": 16.279
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 8.45
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793713",
          "start_m": {
            "x_m": 56.711,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": 16.279
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 11.2
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791265",
          "start_m": {
            "x_m": 56.933,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 11.28
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 9.631
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791283",
          "start_m": {
            "x_m": 56.933,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 11.28
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 12.381
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791264",
          "start_m": {
            "x_m": 56.933,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 13.78
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 9.396
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791282",
          "start_m": {
            "x_m": 56.933,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 13.78
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 12.146
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791263",
          "start_m": {
            "x_m": 56.933,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 16.28
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 9.021
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791281",
          "start_m": {
            "x_m": 56.933,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 16.28
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 11.771
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793058",
          "start_m": {
            "x_m": 59.4,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 12.488
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793043",
          "start_m": {
            "x_m": 59.4,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 9.738
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793061",
          "start_m": {
            "x_m": 62.1,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 12.488
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16793046",
          "start_m": {
            "x_m": 62.1,
            "y_m": 11.285
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": 0
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 9.738
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793791",
          "start_m": {
            "x_m": 64.792,
            "y_m": 13.031
          },
          "end_m": {
            "x_m": 64.792,
            "y_m": 11.28
          },
          "width_m": 0.25,
          "depth_m": 0.167,
          "top_elevation_m": 9.792
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793683",
          "start_m": {
            "x_m": 67.496,
            "y_m": 5.001
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 12.462
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793674",
          "start_m": {
            "x_m": 67.496,
            "y_m": 5.001
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 9.712
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793686",
          "start_m": {
            "x_m": 67.496,
            "y_m": 11.281
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 5
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 12.525
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793677",
          "start_m": {
            "x_m": 67.496,
            "y_m": 11.281
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 5
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 9.775
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793689",
          "start_m": {
            "x_m": 67.496,
            "y_m": 13.031
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 11.28
          },
          "width_m": 0.226,
          "depth_m": 0.167,
          "top_elevation_m": 12.542
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793680",
          "start_m": {
            "x_m": 67.496,
            "y_m": 13.031
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 11.28
          },
          "width_m": 0.226,
          "depth_m": 0.167,
          "top_elevation_m": 9.792
        }
      ],
      "walls": []
    }
  },
  "design_rules": {
    "clearance_m": 1,
    "boundary_setback_m": 1.5,
    "circulation_width_m": 1.2,
    "min_entry_points": 1,
    "quiet_buffer_m": 3
  },
  "entry_points": [
    {
      "x_m": 58.86,
      "y_m": 11.28,
      "edge": "bottom"
    },
    {
      "x_m": 56.7,
      "y_m": 16.28,
      "edge": "bottom"
    },
    {
      "x_m": 62.64,
      "y_m": 11.28,
      "edge": "bottom"
    },
    {
      "x_m": 64.8,
      "y_m": 13.03,
      "edge": "bottom"
    }
  ],
  "placements": [
    {
      "id": "gb_low_0",
      "category": "activity",
      "label": "Locker & Dressing Room Module",
      "insertion_point": {
        "center_x_m": 50.2,
        "center_y_m": 10.2
      },
      "bounding_box": {
        "top_left_x_m": 45.2,
        "top_left_y_m": 7.7,
        "width_m": 10,
        "height_m": 5
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_LOCKER_ROOM",
        "activity": {
          "type_id": "locker_room",
          "category": "service",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 10,
            "width_m": 5
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        }
      }
    },
    {
      "id": "gb_low_1",
      "category": "activity",
      "label": "Bathroom & Shower Module",
      "insertion_point": {
        "center_x_m": 38.2,
        "center_y_m": 10.2
      },
      "bounding_box": {
        "top_left_x_m": 33.2,
        "top_left_y_m": 7.7,
        "width_m": 10,
        "height_m": 5
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_BATHROOM_MODULE",
        "activity": {
          "type_id": "bathroom_module",
          "category": "service",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 10,
            "width_m": 5
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        }
      }
    },
    {
      "id": "gb_low_2",
      "category": "activity",
      "label": "Ping Pong Station",
      "insertion_point": {
        "center_x_m": 27.4,
        "center_y_m": 7.8
      },
      "bounding_box": {
        "top_left_x_m": 23.6,
        "top_left_y_m": 5.5,
        "width_m": 7.6,
        "height_m": 4.6
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_PING_PONG",
        "activity": {
          "type_id": "ping_pong",
          "category": "court",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 7.6,
            "width_m": 4.6
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        },
        "ping_pong": {
          "playing_space": "recreational",
          "table": "steel_composite",
          "net": "permanent",
          "surface": "existing",
          "appearance_hex": null,
          "texture": "flat",
          "length_m": 7.6,
          "width_m": 4.6,
          "table_length_m": 2.74,
          "table_width_m": 1.525,
          "table_height_m": 0.76,
          "table_top_thickness_m": 0.025,
          "net_height_m": 0.1525,
          "net_overhang_m": 0.1525,
          "line_width_m": 0.02,
          "centre_line_width_m": 0.003,
          "clearance_end_m": 2.43,
          "clearance_side_m": 1.54,
          "clear_height_min_m": 5,
          "weight_kg": 0,
          "weight_kg_m2": 0,
          "source": "Casual play — below any ITTF minimum"
        }
      }
    },
    {
      "id": "gb_low_3",
      "category": "activity",
      "label": "Ping Pong Station",
      "insertion_point": {
        "center_x_m": 27.4,
        "center_y_m": 12.4
      },
      "bounding_box": {
        "top_left_x_m": 23.6,
        "top_left_y_m": 10.1,
        "width_m": 7.6,
        "height_m": 4.6
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_PING_PONG",
        "activity": {
          "type_id": "ping_pong",
          "category": "court",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 7.6,
            "width_m": 4.6
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        },
        "ping_pong": {
          "playing_space": "recreational",
          "table": "steel_composite",
          "net": "permanent",
          "surface": "existing",
          "appearance_hex": null,
          "texture": "flat",
          "length_m": 7.6,
          "width_m": 4.6,
          "table_length_m": 2.74,
          "table_width_m": 1.525,
          "table_height_m": 0.76,
          "table_top_thickness_m": 0.025,
          "net_height_m": 0.1525,
          "net_overhang_m": 0.1525,
          "line_width_m": 0.02,
          "centre_line_width_m": 0.003,
          "clearance_end_m": 2.43,
          "clearance_side_m": 1.54,
          "clear_height_min_m": 5,
          "weight_kg": 0,
          "weight_kg_m2": 0,
          "source": "Casual play — below any ITTF minimum"
        }
      }
    },
    {
      "id": "gb_low_4",
      "category": "activity",
      "label": "Padel Tennis Court",
      "insertion_point": {
        "center_x_m": 11.5,
        "center_y_m": 4.5
      },
      "bounding_box": {
        "top_left_x_m": 1.5,
        "top_left_y_m": 1.5,
        "width_m": 20,
        "height_m": 6
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_PADEL_COURT",
        "activity": {
          "type_id": "padel_court",
          "category": "court",
          "norm": "FIP (singles court)",
          "dimensions": {
            "length_m": 20,
            "width_m": 6
          },
          "variant": "mini"
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        }
      }
    },
    {
      "id": "gb_low_5",
      "category": "activity",
      "label": "Modular Tower Slide",
      "insertion_point": {
        "center_x_m": 62.5,
        "center_y_m": 5.2
      },
      "bounding_box": {
        "top_left_x_m": 59,
        "top_left_y_m": 2.7,
        "width_m": 7,
        "height_m": 5
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_MODULAR_TOWER_SLIDE",
        "activity": {
          "type_id": "modular_tower_slide",
          "category": "playground",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 7,
            "width_m": 5
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        }
      }
    },
    {
      "id": "gb_low_6",
      "category": "activity",
      "label": "Sand Pit",
      "insertion_point": {
        "center_x_m": 35.2,
        "center_y_m": 3.5
      },
      "bounding_box": {
        "top_left_x_m": 33.2,
        "top_left_y_m": 1.5,
        "width_m": 4,
        "height_m": 4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_SAND_PIT",
        "activity": {
          "type_id": "sand_pit",
          "category": "playground",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 4,
            "width_m": 4
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        }
      }
    },
    {
      "id": "gb_low_7",
      "category": "activity",
      "label": "Trampoline",
      "insertion_point": {
        "center_x_m": 41.2,
        "center_y_m": 3.5
      },
      "bounding_box": {
        "top_left_x_m": 39.2,
        "top_left_y_m": 1.5,
        "width_m": 4,
        "height_m": 4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Algorithmic-Placement",
        "quality_key": "ACTIVITY_TRAMPOLINE",
        "activity": {
          "type_id": "trampoline",
          "category": "playground",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 4,
            "width_m": 4
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        },
        "familyInstance": {
          "type": "trampoline",
          "label": "Trampoline in a Sand Pit",
          "family": "Trampoline-SandPit",
          "units": "mm",
          "params": {
            "Jump_Radius": 1450,
            "Pad_Width": 300,
            "Base_Height": 400,
            "Bedding": 50,
            "Net_Height": 2100,
            "Show_Net": false
          }
        }
      }
    }
  ]
};

/** Roof 1 — E10, the higher of the top two slabs (world_origin_z_m 13.856): the Quiet Garden preset (20 items: 6 Planter T, 12 Planter S, 1 Calisthenics, 1 Yoga deck; 6 green-roof zones; 0 failures on import). */
const GOLDBECK_HIGH_ROOF_GARDEN_PAYLOAD = {
  "version": "1.3",
  "generator": "Sportify-Combine",
  "roof_context": {
    "length_m": 67.5,
    "width_m": 16.28,
    "program": "garden",
    "source": "revit",
    "source_boundary_polygon": [
      {
        "x_m": 5.4,
        "y_m": 11.88
      },
      {
        "x_m": 0,
        "y_m": 11.88
      },
      {
        "x_m": 0,
        "y_m": 0
      },
      {
        "x_m": 67.5,
        "y_m": 0
      },
      {
        "x_m": 67.5,
        "y_m": 13.03
      },
      {
        "x_m": 64.8,
        "y_m": 13.03
      },
      {
        "x_m": 64.8,
        "y_m": 11.28
      },
      {
        "x_m": 56.7,
        "y_m": 11.28
      },
      {
        "x_m": 56.7,
        "y_m": 16.28
      },
      {
        "x_m": 13.5,
        "y_m": 16.28
      },
      {
        "x_m": 13.5,
        "y_m": 11.28
      },
      {
        "x_m": 5.4,
        "y_m": 11.28
      }
    ],
    "world_origin_x_m": 0.109,
    "world_origin_y_m": 0,
    "rotation_deg": 0,
    "world_origin_z_m": 13.856,
    "height_above_ground_m": 13.86,
    "height_source": "level \"Basisebene\" (nearest the project zero; no ground floor by name)",
    "features": {
      "source": "revit",
      "notes": [],
      "openings": [],
      "entries": [
        {
          "id": "ramp_1",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791386 4",
          "x_m": 7.56,
          "y_m": -0.03,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2519521
        },
        {
          "id": "ramp_2",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791386 6",
          "x_m": 7.56,
          "y_m": 3.74,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2519527
        },
        {
          "id": "ramp_3",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791386",
          "x_m": 8.97,
          "y_m": 0.33,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2519515
        },
        {
          "id": "ramp_4",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791386 5",
          "x_m": 11.34,
          "y_m": -0.03,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2519518
        },
        {
          "id": "ramp_5",
          "kind": "ramp",
          "name": "Parkhäuser_Rampe_Splitlevel-Geschosshöhe-2750_Rampenträger-HEA200-16791386 7",
          "x_m": 11.34,
          "y_m": 3.73,
          "width_m": 0,
          "on_roof": true,
          "source_element_id": 2519524
        }
      ],
      "edges": [
        {
          "index": 0,
          "start_m": {
            "x_m": 5.4,
            "y_m": 4.41
          },
          "end_m": {
            "x_m": 0,
            "y_m": 4.41
          },
          "length_m": 5.4,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 1,
          "start_m": {
            "x_m": 0,
            "y_m": 4.41
          },
          "end_m": {
            "x_m": 0,
            "y_m": 16.28
          },
          "length_m": 11.88,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 2,
          "start_m": {
            "x_m": 0,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 67.5,
            "y_m": 16.28
          },
          "length_m": 67.5,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 3,
          "start_m": {
            "x_m": 67.5,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 67.5,
            "y_m": 3.25
          },
          "length_m": 13.03,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 4,
          "start_m": {
            "x_m": 67.5,
            "y_m": 3.25
          },
          "end_m": {
            "x_m": 64.8,
            "y_m": 3.25
          },
          "length_m": 2.7,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 5,
          "start_m": {
            "x_m": 64.8,
            "y_m": 3.25
          },
          "end_m": {
            "x_m": 64.8,
            "y_m": 5
          },
          "length_m": 1.75,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 6,
          "start_m": {
            "x_m": 64.8,
            "y_m": 5
          },
          "end_m": {
            "x_m": 56.7,
            "y_m": 5
          },
          "length_m": 8.1,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 7,
          "start_m": {
            "x_m": 56.7,
            "y_m": 5
          },
          "end_m": {
            "x_m": 56.7,
            "y_m": 0
          },
          "length_m": 5,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 8,
          "start_m": {
            "x_m": 56.7,
            "y_m": 0
          },
          "end_m": {
            "x_m": 13.5,
            "y_m": 0
          },
          "length_m": 43.2,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 9,
          "start_m": {
            "x_m": 13.5,
            "y_m": 0
          },
          "end_m": {
            "x_m": 13.5,
            "y_m": 5
          },
          "length_m": 5,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 10,
          "start_m": {
            "x_m": 13.5,
            "y_m": 5
          },
          "end_m": {
            "x_m": 5.4,
            "y_m": 5
          },
          "length_m": 8.1,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        },
        {
          "index": 11,
          "start_m": {
            "x_m": 5.4,
            "y_m": 5
          },
          "end_m": {
            "x_m": 5.4,
            "y_m": 4.41
          },
          "length_m": 0.59,
          "kind": "open",
          "height_m": 0,
          "thickness_m": 0,
          "parapet_coverage": 0,
          "railing_coverage": 0
        }
      ],
      "obstacles": [],
      "equipment": [],
      "drains": [],
      "slab": null,
      "levels": [
        {
          "name": "OK FU Achse A",
          "elevation_m": -0.3,
          "above_ground_m": -0.3,
          "is_roof_level": false
        },
        {
          "name": "OK FU Achse H",
          "elevation_m": -0.14,
          "above_ground_m": -0.14,
          "is_roof_level": false
        },
        {
          "name": "Basisebene",
          "elevation_m": 0,
          "above_ground_m": 0,
          "is_roof_level": false
        },
        {
          "name": "E0 TP",
          "elevation_m": 0,
          "above_ground_m": 0,
          "is_roof_level": false
        },
        {
          "name": "E1 TP",
          "elevation_m": 1.375,
          "above_ground_m": 1.375,
          "is_roof_level": false
        },
        {
          "name": "E2 TP",
          "elevation_m": 2.75,
          "above_ground_m": 2.75,
          "is_roof_level": false
        },
        {
          "name": "E3 TP",
          "elevation_m": 4.125,
          "above_ground_m": 4.125,
          "is_roof_level": false
        },
        {
          "name": "E4 TP",
          "elevation_m": 5.5,
          "above_ground_m": 5.5,
          "is_roof_level": false
        },
        {
          "name": "E5 TP",
          "elevation_m": 6.875,
          "above_ground_m": 6.875,
          "is_roof_level": false
        },
        {
          "name": "E6 TP",
          "elevation_m": 8.25,
          "above_ground_m": 8.25,
          "is_roof_level": false
        },
        {
          "name": "E7 TP",
          "elevation_m": 9.625,
          "above_ground_m": 9.625,
          "is_roof_level": false
        },
        {
          "name": "E8 TP",
          "elevation_m": 11,
          "above_ground_m": 11,
          "is_roof_level": false
        },
        {
          "name": "E9 TP",
          "elevation_m": 12.375,
          "above_ground_m": 12.375,
          "is_roof_level": false
        },
        {
          "name": "E10 TP",
          "elevation_m": 13.75,
          "above_ground_m": 13.75,
          "is_roof_level": true
        },
        {
          "name": "Bauteilgruppenebene (BTGE)",
          "elevation_m": 50,
          "above_ground_m": 50,
          "is_roof_level": false
        }
      ]
    },
    "structure": {
      "source": "revit",
      "deck_capacity_kn_m2": null,
      "natural_frequency_hz": null,
      "grid_lines": [
        {
          "name": "1",
          "start_m": {
            "x_m": -0.109,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": -0.109,
            "y_m": -0.25
          }
        },
        {
          "name": "10",
          "start_m": {
            "x_m": 24.3,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 24.3,
            "y_m": -0.25
          }
        },
        {
          "name": "11",
          "start_m": {
            "x_m": 27,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 27,
            "y_m": -0.25
          }
        },
        {
          "name": "12",
          "start_m": {
            "x_m": 29.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 29.7,
            "y_m": -0.25
          }
        },
        {
          "name": "13",
          "start_m": {
            "x_m": 32.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 32.4,
            "y_m": -0.25
          }
        },
        {
          "name": "14",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": -0.25
          }
        },
        {
          "name": "15",
          "start_m": {
            "x_m": 37.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 37.8,
            "y_m": -0.25
          }
        },
        {
          "name": "16",
          "start_m": {
            "x_m": 40.5,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 40.5,
            "y_m": -0.25
          }
        },
        {
          "name": "17",
          "start_m": {
            "x_m": 43.2,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 43.2,
            "y_m": -0.25
          }
        },
        {
          "name": "18",
          "start_m": {
            "x_m": 45.9,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 45.9,
            "y_m": -0.25
          }
        },
        {
          "name": "19",
          "start_m": {
            "x_m": 48.6,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 48.6,
            "y_m": -0.25
          }
        },
        {
          "name": "2",
          "start_m": {
            "x_m": 2.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": -0.25
          }
        },
        {
          "name": "20",
          "start_m": {
            "x_m": 51.3,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 51.3,
            "y_m": -0.25
          }
        },
        {
          "name": "21",
          "start_m": {
            "x_m": 54,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 54,
            "y_m": -0.25
          }
        },
        {
          "name": "22",
          "start_m": {
            "x_m": 56.7,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 56.7,
            "y_m": -0.25
          }
        },
        {
          "name": "22'",
          "start_m": {
            "x_m": 56.833,
            "y_m": 5.5
          },
          "end_m": {
            "x_m": 56.833,
            "y_m": -0.25
          }
        },
        {
          "name": "23",
          "start_m": {
            "x_m": 59.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": -0.25
          }
        },
        {
          "name": "24",
          "start_m": {
            "x_m": 62.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": -0.25
          }
        },
        {
          "name": "24'",
          "start_m": {
            "x_m": 64.667,
            "y_m": 5.5
          },
          "end_m": {
            "x_m": 64.667,
            "y_m": -0.25
          }
        },
        {
          "name": "25",
          "start_m": {
            "x_m": 64.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 64.8,
            "y_m": -0.25
          }
        },
        {
          "name": "26",
          "start_m": {
            "x_m": 67.609,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 67.609,
            "y_m": -0.25
          }
        },
        {
          "name": "3",
          "start_m": {
            "x_m": 5.4,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 5.4,
            "y_m": -0.25
          }
        },
        {
          "name": "3'",
          "start_m": {
            "x_m": 5.533,
            "y_m": 5.5
          },
          "end_m": {
            "x_m": 5.533,
            "y_m": -0.25
          }
        },
        {
          "name": "4",
          "start_m": {
            "x_m": 8.1,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": -0.25
          }
        },
        {
          "name": "5",
          "start_m": {
            "x_m": 10.8,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": -0.25
          }
        },
        {
          "name": "5'",
          "start_m": {
            "x_m": 13.367,
            "y_m": 5.5
          },
          "end_m": {
            "x_m": 13.367,
            "y_m": -0.25
          }
        },
        {
          "name": "6",
          "start_m": {
            "x_m": 13.5,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 13.5,
            "y_m": -0.25
          }
        },
        {
          "name": "7",
          "start_m": {
            "x_m": 16.2,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 16.2,
            "y_m": -0.25
          }
        },
        {
          "name": "8",
          "start_m": {
            "x_m": 18.9,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 18.9,
            "y_m": -0.25
          }
        },
        {
          "name": "9",
          "start_m": {
            "x_m": 21.6,
            "y_m": 16.53
          },
          "end_m": {
            "x_m": 21.6,
            "y_m": -0.25
          }
        },
        {
          "name": "A",
          "start_m": {
            "x_m": -0.25,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 16.28
          }
        },
        {
          "name": "B",
          "start_m": {
            "x_m": -0.25,
            "y_m": 13.78
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 13.78
          }
        },
        {
          "name": "C",
          "start_m": {
            "x_m": -0.25,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 11.28
          }
        },
        {
          "name": "D",
          "start_m": {
            "x_m": -0.25,
            "y_m": 9.19
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 9.19
          }
        },
        {
          "name": "E",
          "start_m": {
            "x_m": -0.25,
            "y_m": 7.09
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 7.09
          }
        },
        {
          "name": "F",
          "start_m": {
            "x_m": -0.25,
            "y_m": 5
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 5
          }
        },
        {
          "name": "F'",
          "start_m": {
            "x_m": -0.25,
            "y_m": 4.405
          },
          "end_m": {
            "x_m": 5.6,
            "y_m": 4.405
          }
        },
        {
          "name": "F''",
          "start_m": {
            "x_m": 64.6,
            "y_m": 3.25
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 3.25
          }
        },
        {
          "name": "G",
          "start_m": {
            "x_m": -0.25,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 2.5
          }
        },
        {
          "name": "H",
          "start_m": {
            "x_m": -0.25,
            "y_m": 0
          },
          "end_m": {
            "x_m": 67.75,
            "y_m": 0
          }
        }
      ],
      "columns": [
        {
          "label": "16792094",
          "x_m": -0.109,
          "y_m": 4.405
        },
        {
          "label": "16791902",
          "x_m": -0.109,
          "y_m": 5
        },
        {
          "label": "16791892",
          "x_m": -0.109,
          "y_m": 7.09
        },
        {
          "label": "16791889",
          "x_m": -0.109,
          "y_m": 9.19
        },
        {
          "label": "16791899",
          "x_m": -0.109,
          "y_m": 11.28
        },
        {
          "label": "16791895",
          "x_m": -0.109,
          "y_m": 13.78
        },
        {
          "label": "16791943",
          "x_m": -0.109,
          "y_m": 16.295
        },
        {
          "label": "16792117",
          "x_m": 2.7,
          "y_m": 4.42
        },
        {
          "label": "16791983",
          "x_m": 2.7,
          "y_m": 16.28
        },
        {
          "label": "16791989",
          "x_m": 5.4,
          "y_m": 16.28
        },
        {
          "label": "16792105",
          "x_m": 5.509,
          "y_m": 4.405
        },
        {
          "label": "16791833",
          "x_m": 5.533,
          "y_m": 0
        },
        {
          "label": "16791826",
          "x_m": 5.533,
          "y_m": 2.5
        },
        {
          "label": "16791863",
          "x_m": 5.533,
          "y_m": 5
        },
        {
          "label": "16791994",
          "x_m": 8.1,
          "y_m": 16.28
        },
        {
          "label": "16791998",
          "x_m": 10.8,
          "y_m": 16.28
        },
        {
          "label": "16791842",
          "x_m": 13.367,
          "y_m": 0
        },
        {
          "label": "16791839",
          "x_m": 13.367,
          "y_m": 2.5
        },
        {
          "label": "16791870",
          "x_m": 13.367,
          "y_m": 5
        },
        {
          "label": "16792002",
          "x_m": 13.5,
          "y_m": 16.28
        },
        {
          "label": "16791953",
          "x_m": 16.2,
          "y_m": 0
        },
        {
          "label": "16792006",
          "x_m": 16.2,
          "y_m": 16.28
        },
        {
          "label": "16791956",
          "x_m": 18.9,
          "y_m": 0
        },
        {
          "label": "16792010",
          "x_m": 18.9,
          "y_m": 16.28
        },
        {
          "label": "16791959",
          "x_m": 21.6,
          "y_m": 0
        },
        {
          "label": "16792014",
          "x_m": 21.6,
          "y_m": 16.28
        },
        {
          "label": "16791961",
          "x_m": 24.3,
          "y_m": 0
        },
        {
          "label": "16792018",
          "x_m": 24.3,
          "y_m": 16.28
        },
        {
          "label": "16791963",
          "x_m": 27,
          "y_m": 0
        },
        {
          "label": "16792022",
          "x_m": 27,
          "y_m": 16.28
        },
        {
          "label": "16791965",
          "x_m": 29.7,
          "y_m": 0
        },
        {
          "label": "16792026",
          "x_m": 29.7,
          "y_m": 16.28
        },
        {
          "label": "16791967",
          "x_m": 32.4,
          "y_m": 0
        },
        {
          "label": "16792030",
          "x_m": 32.4,
          "y_m": 16.28
        },
        {
          "label": "16792092",
          "x_m": 35.1,
          "y_m": 0
        },
        {
          "label": "16792084",
          "x_m": 35.1,
          "y_m": 2.5
        },
        {
          "label": "16792082",
          "x_m": 35.1,
          "y_m": 5
        },
        {
          "label": "16792034",
          "x_m": 35.1,
          "y_m": 16.28
        },
        {
          "label": "16791969",
          "x_m": 37.8,
          "y_m": 0
        },
        {
          "label": "16792038",
          "x_m": 37.8,
          "y_m": 16.28
        },
        {
          "label": "16791971",
          "x_m": 40.5,
          "y_m": 0
        },
        {
          "label": "16792042",
          "x_m": 40.5,
          "y_m": 16.28
        },
        {
          "label": "16791973",
          "x_m": 43.2,
          "y_m": 0
        },
        {
          "label": "16792046",
          "x_m": 43.2,
          "y_m": 16.28
        },
        {
          "label": "16791975",
          "x_m": 45.9,
          "y_m": 0
        },
        {
          "label": "16792050",
          "x_m": 45.9,
          "y_m": 16.28
        },
        {
          "label": "16791977",
          "x_m": 48.6,
          "y_m": 0
        },
        {
          "label": "16792054",
          "x_m": 48.6,
          "y_m": 16.28
        },
        {
          "label": "16791979",
          "x_m": 51.3,
          "y_m": 0
        },
        {
          "label": "16792058",
          "x_m": 51.3,
          "y_m": 16.28
        },
        {
          "label": "16791981",
          "x_m": 54,
          "y_m": 0
        },
        {
          "label": "16792062",
          "x_m": 54,
          "y_m": 16.28
        },
        {
          "label": "16792066",
          "x_m": 56.7,
          "y_m": 16.28
        },
        {
          "label": "16791850",
          "x_m": 56.833,
          "y_m": 0
        },
        {
          "label": "16791848",
          "x_m": 56.833,
          "y_m": 2.5
        },
        {
          "label": "16791875",
          "x_m": 56.833,
          "y_m": 5
        },
        {
          "label": "16792070",
          "x_m": 59.4,
          "y_m": 16.28
        },
        {
          "label": "16792074",
          "x_m": 62.1,
          "y_m": 16.28
        },
        {
          "label": "16791857",
          "x_m": 64.667,
          "y_m": 0
        },
        {
          "label": "16791854",
          "x_m": 64.667,
          "y_m": 2.5
        },
        {
          "label": "16791879",
          "x_m": 64.667,
          "y_m": 5
        },
        {
          "label": "16792111",
          "x_m": 64.691,
          "y_m": 3.25
        },
        {
          "label": "16792078",
          "x_m": 64.8,
          "y_m": 16.28
        },
        {
          "label": "16792099",
          "x_m": 67.609,
          "y_m": 3.25
        },
        {
          "label": "16791930",
          "x_m": 67.609,
          "y_m": 5
        },
        {
          "label": "16791927",
          "x_m": 67.609,
          "y_m": 7.09
        },
        {
          "label": "16791925",
          "x_m": 67.609,
          "y_m": 9.19
        },
        {
          "label": "16791923",
          "x_m": 67.609,
          "y_m": 11.28
        },
        {
          "label": "16791920",
          "x_m": 67.609,
          "y_m": 13.78
        },
        {
          "label": "16791948",
          "x_m": 67.609,
          "y_m": 16.295
        }
      ],
      "beams": [
        {
          "name": "IPE-Träger:IPE 400-Träger:16791404",
          "start_m": {
            "x_m": -0.109,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": -0.109,
            "y_m": 5
          },
          "width_m": 0.18,
          "depth_m": 2.97,
          "top_elevation_m": 2.97
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793544",
          "start_m": {
            "x_m": 0.004,
            "y_m": 5
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 4.404
          },
          "width_m": 0.226,
          "depth_m": 0.156,
          "top_elevation_m": 5.656
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793533",
          "start_m": {
            "x_m": 0.004,
            "y_m": 5
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 4.404
          },
          "width_m": 0.226,
          "depth_m": 0.156,
          "top_elevation_m": 2.906
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793541",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 4.999
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 5.65
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793528",
          "start_m": {
            "x_m": 0.004,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 4.999
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 2.9
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793538",
          "start_m": {
            "x_m": 0.004,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 11.279
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 5.587
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793514",
          "start_m": {
            "x_m": 0.004,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 0.004,
            "y_m": 11.279
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 2.837
        },
        {
          "name": "IPE-Träger:IPE 400-Träger:16793068",
          "start_m": {
            "x_m": 2.7,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": 4.4
          },
          "width_m": 0.18,
          "depth_m": 0.622,
          "top_elevation_m": 5.619
        },
        {
          "name": "IPE-Träger:IPE 400-Träger:16793064",
          "start_m": {
            "x_m": 2.7,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 2.7,
            "y_m": 4.4
          },
          "width_m": 0.18,
          "depth_m": 0.622,
          "top_elevation_m": 2.869
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793698",
          "start_m": {
            "x_m": 5.408,
            "y_m": 5
          },
          "end_m": {
            "x_m": 5.408,
            "y_m": 4.404
          },
          "width_m": 0.25,
          "depth_m": 0.156,
          "top_elevation_m": 5.656
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793692",
          "start_m": {
            "x_m": 5.408,
            "y_m": 5
          },
          "end_m": {
            "x_m": 5.408,
            "y_m": 4.404
          },
          "width_m": 0.25,
          "depth_m": 0.156,
          "top_elevation_m": 2.906
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791335",
          "start_m": {
            "x_m": 5.633,
            "y_m": 0
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 4.896
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791317",
          "start_m": {
            "x_m": 5.633,
            "y_m": 0
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 2.146
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791336",
          "start_m": {
            "x_m": 5.633,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 2.5
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 5.271
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791318",
          "start_m": {
            "x_m": 5.633,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 2.5
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 2.521
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791337",
          "start_m": {
            "x_m": 5.633,
            "y_m": 5
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 5
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 5.506
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791319",
          "start_m": {
            "x_m": 5.633,
            "y_m": 5
          },
          "end_m": {
            "x_m": 13.267,
            "y_m": 5
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 2.756
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792944",
          "start_m": {
            "x_m": 8.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 5.613
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792915",
          "start_m": {
            "x_m": 8.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 8.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 2.863
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792947",
          "start_m": {
            "x_m": 10.8,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 5.613
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792931",
          "start_m": {
            "x_m": 10.8,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 10.8,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 2.863
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793776",
          "start_m": {
            "x_m": 13.49,
            "y_m": 0.001
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": -0.25
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 4.325
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793728",
          "start_m": {
            "x_m": 13.49,
            "y_m": 5
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": -0.001
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 5.7
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793722",
          "start_m": {
            "x_m": 13.49,
            "y_m": 5
          },
          "end_m": {
            "x_m": 13.49,
            "y_m": -0.001
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 2.95
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793137",
          "start_m": {
            "x_m": 35.1,
            "y_m": 0.003
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": -0.25
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 4.288
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793113",
          "start_m": {
            "x_m": 35.1,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": -0.003
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 5.663
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793110",
          "start_m": {
            "x_m": 35.1,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": -0.003
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 2.913
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793097",
          "start_m": {
            "x_m": 35.1,
            "y_m": 5
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 2.497
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 5.638
        },
        {
          "name": "HEA-Träger:HEA 180-Träger:16793093",
          "start_m": {
            "x_m": 35.1,
            "y_m": 5
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 2.497
          },
          "width_m": 0.18,
          "depth_m": 0.299,
          "top_elevation_m": 2.888
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792950",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 5.613
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792935",
          "start_m": {
            "x_m": 35.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 35.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 2.863
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793755",
          "start_m": {
            "x_m": 56.711,
            "y_m": 0.001
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": -0.25
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 4.325
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793701",
          "start_m": {
            "x_m": 56.711,
            "y_m": 5
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": -0.001
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 5.7
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793695",
          "start_m": {
            "x_m": 56.711,
            "y_m": 5
          },
          "end_m": {
            "x_m": 56.711,
            "y_m": -0.001
          },
          "width_m": 0.245,
          "depth_m": 0.2,
          "top_elevation_m": 2.95
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791245",
          "start_m": {
            "x_m": 56.933,
            "y_m": 0
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 6.271
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791205",
          "start_m": {
            "x_m": 56.933,
            "y_m": 0
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 0
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 3.521
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791243",
          "start_m": {
            "x_m": 56.933,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 2.5
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 5.896
        },
        {
          "name": "HEX-RPT:HEA 200 - RPT:16791203",
          "start_m": {
            "x_m": 56.933,
            "y_m": 2.5
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 2.5
          },
          "width_m": 0.226,
          "depth_m": 0.218,
          "top_elevation_m": 3.146
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791244",
          "start_m": {
            "x_m": 56.933,
            "y_m": 5
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 5
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 5.506
        },
        {
          "name": "ABF-RPT:SPR 360 - RPT:16791204",
          "start_m": {
            "x_m": 56.933,
            "y_m": 5
          },
          "end_m": {
            "x_m": 64.567,
            "y_m": 5
          },
          "width_m": 0.19,
          "depth_m": 0.36,
          "top_elevation_m": 2.756
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792953",
          "start_m": {
            "x_m": 59.4,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 5.613
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792938",
          "start_m": {
            "x_m": 59.4,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 59.4,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 2.863
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792956",
          "start_m": {
            "x_m": 62.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 5.613
        },
        {
          "name": "IPE-Träger:IPE 360-Träger:16792941",
          "start_m": {
            "x_m": 62.1,
            "y_m": 16.28
          },
          "end_m": {
            "x_m": 62.1,
            "y_m": 4.995
          },
          "width_m": 0.17,
          "depth_m": 0.576,
          "top_elevation_m": 2.863
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793731",
          "start_m": {
            "x_m": 64.792,
            "y_m": 5
          },
          "end_m": {
            "x_m": 64.792,
            "y_m": 3.249
          },
          "width_m": 0.25,
          "depth_m": 0.167,
          "top_elevation_m": 5.667
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793725",
          "start_m": {
            "x_m": 64.792,
            "y_m": 5
          },
          "end_m": {
            "x_m": 64.792,
            "y_m": 3.249
          },
          "width_m": 0.25,
          "depth_m": 0.167,
          "top_elevation_m": 2.917
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793620",
          "start_m": {
            "x_m": 67.496,
            "y_m": 5
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 3.249
          },
          "width_m": 0.226,
          "depth_m": 0.167,
          "top_elevation_m": 5.667
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793610",
          "start_m": {
            "x_m": 67.496,
            "y_m": 5
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 3.249
          },
          "width_m": 0.226,
          "depth_m": 0.167,
          "top_elevation_m": 2.917
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793623",
          "start_m": {
            "x_m": 67.496,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 4.999
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 5.65
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793614",
          "start_m": {
            "x_m": 67.496,
            "y_m": 11.28
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 4.999
          },
          "width_m": 0.226,
          "depth_m": 0.213,
          "top_elevation_m": 2.9
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793626",
          "start_m": {
            "x_m": 67.496,
            "y_m": 16.294
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 11.279
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 5.587
        },
        {
          "name": "L-Träger_gleichschenklig:L 150*10-Träger:16793617",
          "start_m": {
            "x_m": 67.496,
            "y_m": 16.294
          },
          "end_m": {
            "x_m": 67.496,
            "y_m": 11.279
          },
          "width_m": 0.226,
          "depth_m": 0.2,
          "top_elevation_m": 2.837
        }
      ],
      "walls": []
    }
  },
  "design_rules": {
    "clearance_m": 1,
    "boundary_setback_m": 1.5,
    "circulation_width_m": 1,
    "min_entry_points": 4,
    "quiet_buffer_m": 3
  },
  "entry_points": [
    {
      "x_m": 2.3025579012047994,
      "y_m": 4.4,
      "edge": "top"
    },
    {
      "x_m": 9.18890997023449,
      "y_m": 5.000000000000002,
      "edge": "top"
    },
    {
      "x_m": 60.98625379380562,
      "y_m": 5.000000000000002,
      "edge": "top"
    },
    {
      "x_m": 66.12606729460316,
      "y_m": 3.2500000000000018,
      "edge": "top"
    }
  ],
  "placements": [
    {
      "id": "gb_high_0",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 21.5,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 20.3,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_1",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 26.4,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 25.2,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_2",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 31.3,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 30.1,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_3",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 36.2,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 35,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_4",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 41.1,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 39.9,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_5",
      "category": "gardenBlock",
      "label": "Planter T",
      "insertion_point": {
        "center_x_m": 46,
        "center_y_m": 8.14
      },
      "bounding_box": {
        "top_left_x_m": 44.8,
        "top_left_y_m": 6.94,
        "width_m": 2.4,
        "height_m": 2.4
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_t",
          "label": "Planter T",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 2400,
            "rimHeight": 900,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 1000,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 530,
            "capTop": 1070,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_6",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 21.5,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 20.3,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_7",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 26.4,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 25.2,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_8",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 31.3,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 30.1,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_9",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 36.2,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 35,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_10",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 41.1,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 39.9,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_11",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 46,
        "center_y_m": 3.44
      },
      "bounding_box": {
        "top_left_x_m": 44.8,
        "top_left_y_m": 2.94,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_12",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 21.5,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 20.3,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_13",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 26.4,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 25.2,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_14",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 31.3,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 30.1,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_15",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 36.2,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 35,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_16",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 41.1,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 39.9,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": false,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_17",
      "category": "gardenBlock",
      "label": "Planter S",
      "insertion_point": {
        "center_x_m": 46,
        "center_y_m": 12.84
      },
      "bounding_box": {
        "top_left_x_m": 44.8,
        "top_left_y_m": 12.34,
        "width_m": 2.4,
        "height_m": 1
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "preset": "quiet_garden",
        "gardenBlock": {
          "type": "planter_s",
          "label": "Planter S",
          "family": "Planter",
          "params": {
            "defaultElevation": 0,
            "length": 2400,
            "width": 1000,
            "rimHeight": 450,
            "pedestalHeight": 100,
            "protectionMat": 5,
            "drainageDepth": 40,
            "filterFleece": 5,
            "substrateDepth": 300,
            "outletHeight": 30,
            "outletBottomOffset": 25,
            "outletTopOffset": 55,
            "centreRow": true,
            "seatCap": true,
            "tree": true,
            "rimLevel": 550,
            "trayFloorTop": 120,
            "matTop": 125,
            "drainageTop": 165,
            "fleeceTop": 170,
            "substrateTop": 470,
            "freeboard": 80,
            "capTop": 620,
            "outletTop": 155
          }
        }
      }
    },
    {
      "id": "gb_high_18",
      "category": "activity",
      "label": "Calisthenics",
      "insertion_point": {
        "center_x_m": 13.3,
        "center_y_m": 11.78
      },
      "bounding_box": {
        "top_left_x_m": 9.3,
        "top_left_y_m": 8.78,
        "width_m": 8,
        "height_m": 6
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "quality_key": "ACTIVITY_CALISTHENICS",
        "activity": {
          "type_id": "calisthenics",
          "category": "fitness",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 8,
            "width_m": 6
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        },
        "preset": "quiet_garden"
      }
    },
    {
      "id": "gb_high_19",
      "category": "activity",
      "label": "Yoga / Stretching Deck",
      "insertion_point": {
        "center_x_m": 55.2,
        "center_y_m": 12.28
      },
      "bounding_box": {
        "top_left_x_m": 50.2,
        "top_left_y_m": 9.78,
        "width_m": 10,
        "height_m": 5
      },
      "transform": {
        "rotation_deg": 0
      },
      "parameters": {
        "version": "1.0",
        "generator": "Sportify-Garden-Preset",
        "quality_key": "ACTIVITY_YOGA_DECK",
        "activity": {
          "type_id": "yoga_deck",
          "category": "wellness",
          "norm": "Reference sheet",
          "dimensions": {
            "length_m": 10,
            "width_m": 5
          }
        },
        "materials": {
          "surface": "Reinforced synthetic surface",
          "structure": "Galvanized steel",
          "quality_level": "medium",
          "reference_material": null,
          "reference_provider": null
        },
        "familyInstance": {
          "type": "yoga_deck",
          "label": "Yoga / Stretching Deck",
          "family": "Yoga Deck",
          "units": "m",
          "params": {
            "Deck_Length": 10,
            "Deck_Width": 5,
            "Roof_Height": 4,
            "Roof_Thickness": 0.15,
            "Planter_Spacing": 1.5,
            "Default Elevation": 0,
            "Show_Roof": true
          }
        },
        "preset": "quiet_garden"
      }
    }
  ],
  "zones": [
    {
      "id": "zone_gb_high_0",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 0,
        "top_left_y_m": 14.78,
        "width_m": 67.5,
        "height_m": 1.5000000000000018
      },
      "points": [
        {
          "x_m": 0,
          "y_m": 14.78
        },
        {
          "x_m": 67.5,
          "y_m": 14.78
        },
        {
          "x_m": 67.5,
          "y_m": 16.28
        },
        {
          "x_m": 0,
          "y_m": 16.28
        }
      ],
      "area_m2": 101.25000000000011,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 67500,
          "width": 1500,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    },
    {
      "id": "zone_gb_high_1",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 13.5,
        "top_left_y_m": 0,
        "width_m": 43.2,
        "height_m": 1.5
      },
      "points": [
        {
          "x_m": 13.5,
          "y_m": 0
        },
        {
          "x_m": 56.7,
          "y_m": 0
        },
        {
          "x_m": 56.7,
          "y_m": 1.5
        },
        {
          "x_m": 13.5,
          "y_m": 1.5
        }
      ],
      "area_m2": 64.80000000000001,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 43200,
          "width": 1500,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    },
    {
      "id": "zone_gb_high_2",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 66,
        "top_left_y_m": 3.25,
        "width_m": 1.5,
        "height_m": 11.53
      },
      "points": [
        {
          "x_m": 66,
          "y_m": 3.25
        },
        {
          "x_m": 67.5,
          "y_m": 3.25
        },
        {
          "x_m": 67.5,
          "y_m": 14.78
        },
        {
          "x_m": 66,
          "y_m": 14.78
        }
      ],
      "area_m2": 17.295000000000073,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 1500,
          "width": 11530,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    },
    {
      "id": "zone_gb_high_3",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 0,
        "top_left_y_m": 4.4,
        "width_m": 1.5,
        "height_m": 10.38
      },
      "points": [
        {
          "x_m": 0,
          "y_m": 4.4
        },
        {
          "x_m": 1.5,
          "y_m": 4.4
        },
        {
          "x_m": 1.5,
          "y_m": 14.780000000000001
        },
        {
          "x_m": 0,
          "y_m": 14.780000000000001
        }
      ],
      "area_m2": 15.57,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 1500,
          "width": 10380,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    },
    {
      "id": "zone_gb_high_4",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 1.5,
        "top_left_y_m": 10.78,
        "width_m": 4,
        "height_m": 4
      },
      "points": [
        {
          "x_m": 1.5,
          "y_m": 10.78
        },
        {
          "x_m": 5.5,
          "y_m": 10.78
        },
        {
          "x_m": 5.5,
          "y_m": 14.78
        },
        {
          "x_m": 1.5,
          "y_m": 14.78
        }
      ],
      "area_m2": 15.99999999999999,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 4000,
          "width": 4000,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    },
    {
      "id": "zone_gb_high_5",
      "kind": "green_roof",
      "label": "Green roof",
      "bounding_box": {
        "top_left_x_m": 62,
        "top_left_y_m": 10.78,
        "width_m": 4,
        "height_m": 4
      },
      "points": [
        {
          "x_m": 62,
          "y_m": 10.78
        },
        {
          "x_m": 66,
          "y_m": 10.78
        },
        {
          "x_m": 66,
          "y_m": 14.78
        },
        {
          "x_m": 62,
          "y_m": 14.78
        }
      ],
      "area_m2": 16,
      "assembly_key": null,
      "family": {
        "family": "Sportify_GreenRoofModule",
        "type": "Green Roof Module",
        "units": "mm",
        "parameters": {
          "defaultElevation": 0,
          "pedestalHeight": 100,
          "protectionMat": 5,
          "drainageDepth": 25,
          "filterFleece": 5,
          "substrateDepth": 80,
          "outletHeight": 30,
          "outletBottomOffset": 25,
          "outletTopOffset": 55,
          "centreRow": true,
          "seatCap": false,
          "tree": false,
          "rimHeight": 170,
          "length": 4000,
          "width": 4000,
          "rimLevel": 270,
          "trayFloorTop": 120,
          "matTop": 125,
          "drainageTop": 150,
          "fleeceTop": 155,
          "substrateTop": 235,
          "freeboard": 35,
          "capTop": 340,
          "outletTop": 155
        },
        "strip_generic_model": false,
        "floor_top_mm": 235,
        "trayed_mm": 115,
        "untrayed_layers": []
      }
    }
  ]
};

/* ---- public registry — sessionGate.js / compareController.js call .generate() on demand, never read a precomputed field ---- */
const GOLDBECK_PREBUILT_SESSIONS = {
  lowRoofSports: {
    id: "lowRoofSports", title: "Goldbeck — Low Roof, Sports",
    tagline: "8 courts on the real E9 slab: Padel, 2 Ping Pong, Sand Pit, Trampoline, Modular Tower Slide, Locker & Bathroom modules.",
    generate: () => goldbeckCloneRealPayload(GOLDBECK_LOW_ROOF_SPORTS_PAYLOAD),
  },
  highRoofGarden: {
    id: "highRoofGarden", title: "Goldbeck — High Roof, Garden",
    tagline: "Quiet Garden preset on the real E10 slab: 6 Planter T, 12 Planter S, Calisthenics and a Yoga deck, with green-roof zones.",
    generate: () => goldbeckCloneRealPayload(GOLDBECK_HIGH_ROOF_GARDEN_PAYLOAD),
  },
};
