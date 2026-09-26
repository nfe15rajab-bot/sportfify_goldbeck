/**
 * whereCore.js — "what is done where": the one rule and the one vocabulary for it. Pure (no DOM, no network), so tools/where-test.js runs it as it is; where.js draws it.
 *
 * The rule is this, and everything on the screen says it the same way:
 *   this app     is where you DECIDE: the site, the sports and the garden, the placement, quick estimates, comparing variants (2D, fast, no Revit needed)
 *   Revit        is where the decision becomes a BUILDING: the model, the layout as families, the full analyses on it, schedules, views, the Sportify folder of documents
 *   engines      (Unity, SOLIDWORKS) are programs Revit calls for a video or a mechanical assembly. They are never places you go: Sportify finds them and hides what cannot work
 * Results always come back to the Results tab, whichever program computed them.
 *
 * A status, in words a person can act on, for each of the three, and the little badge ("Revit", "Unity", "SOLIDWORKS") that marks an action which needs one of them.
 */

const WHERE_RULE = "Decide here. Build in Revit. The answers come back to the Results tab.";

/** The card on the Overview: three columns, one sentence each. Every claim is about something that exists (tools/where-test.js checks the names against the page and the analyses). */
const WHERE_COLUMNS = [
  {
    key: "app", title: "This app", tagline: "Decide", icon: "ti-device-desktop",
    points: [
      "Set the site: the address, which way it faces, the roof size",
      "Choose the sports and the garden, and place them on the roof by hand or by the algorithm",
      "Quick estimates: fire safety, accessibility, LCA, sun path, wind and water",
      "Compare variants and save your sessions"
    ]
  },
  {
    key: "revit", title: "Revit", tagline: "Build", icon: "ti-building",
    points: [
      "Push the roof from the model, and bring the layout back into it as families",
      "The full analyses on your roof: structure, dynamics, sun, wind and rain",
      "Schedules, views, worksets and phases, and your Sportify folder of documents"
    ]
  },
  {
    key: "engines", title: "Engines", tagline: "Revit calls them", icon: "ti-cpu",
    points: [
      "Unity makes the 3D videos of the analyses",
      "SOLIDWORKS builds the moving parts as a mechanical assembly",
      "Both are optional: Sportify finds them and hides what cannot work here"
    ]
  }
];

/** Fire safety, accessibility and LCA give the same numbers in this app and in Revit (they are tested to agree): a note, so nobody wonders which one to trust. */
const WHERE_SAME_NUMBERS = "Fire safety, accessibility and LCA give the same numbers here and in Revit: use whichever is open.";

/**
 * The state of Revit for the status pill: { key: "connected" | "closed" | "looking", label, title }. `connected` is what the app knows (true, false, or null before the first answer);
 * `version` is Revit's own ("2025"), or "".
 */
function whereRevitState(connected, version) {
  if (connected === true) {
    const v = typeof version === "string" && /^[0-9]{4}$/.test(version) ? version + " " : "";
    return { key: "connected", label: "Revit " + v + "connected", title: "Sportify in Revit is connected to this app. Exports are kept in your Sportify folder, and the analyses, the PDFs and the schedule can be run from here. Click for what runs where." };
  }
  if (connected === false) {
    return { key: "closed", label: "Revit not open", title: "You can decide and place here in 2D. To build the model, run the full analyses or make documents, open a project in Revit with the Sportify tab. Click for what runs where." };
  }
  return { key: "looking", label: "Looking for Revit…", title: "Asking whether Revit is open with the Sportify add-in." };
}

/** One tool of this computer for the Overview's chips: { key: "found" | "missing" | "unknown", label }. `tool` is the add-in's answer for it ({ found }), or undefined; nothing can be known while Revit is not connected. */
function whereToolState(name, tool, connected) {
  if (connected !== true || !tool || typeof tool !== "object") return { key: "unknown", label: name + ": unknown until Revit is open" };
  return tool.found === true ? { key: "found", label: name + ": found" } : { key: "missing", label: name + ": not found" };
}

const WHERE_NEEDS = { revit: "Revit", unity: "Unity", solidworks: "SOLIDWORKS" };

/**
 * Can an action that needs `need` ("revit", "unity" or "solidworks") be done now? { need, name, ok, reason }. `ctx`: { connected, machine } (machine = the add-in's /capabilities answer).
 * The reason is one sentence for a tooltip; "" when it can be done. An unknown need is never blocked (it is not one of ours).
 */
function whereNeed(need, ctx) {
  const name = WHERE_NEEDS[need];
  if (!name) return { need, name: "", ok: true, reason: "" };
  const connected = !!(ctx && ctx.connected === true), machine = ctx && ctx.machine;
  if (need === "revit") return { need, name, ok: connected, reason: connected ? "" : "Needs Revit: open a project with the Sportify tab." };
  if (!connected) return { need, name, ok: false, reason: "Needs Revit open, and " + name + " on this computer." };
  const tool = machine && machine[need];
  if (!tool || typeof tool !== "object") return { need, name, ok: true, reason: "" };      // Revit is open but has not said what this computer has yet: not blocked
  return tool.found === true ? { need, name, ok: true, reason: "" } : { need, name, ok: false, reason: "Needs " + name + ", which was not found on this computer." };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { WHERE_RULE, WHERE_COLUMNS, WHERE_SAME_NUMBERS, WHERE_NEEDS, whereRevitState, whereToolState, whereNeed };
}
