/**
 * tourCore.js — the rundgang: a short guided walk through the real screens of Sportify. Pure (no DOM, no network), so tools/tour-test.js runs it as it is; tour.js draws it.
 *
 * The tour is a list of steps. Each step names the workspace to open, the element of the page to point at (a CSS selector) and says in a sentence or two what it is for. A person
 * only ever sees steps for workspaces THEIR profile shows (the Simple view leaves out structure, conditions, compare and post analysis unless the quiz added them), so the tour never
 * opens a tab that is hidden. It is offered, never forced: after the quiz, from the Overview and from the Profile tab.
 */

const TOUR_WORLD = typeof PROFILE_MODES !== "undefined"
  ? { modes: PROFILE_MODES, visible: profileModeVisible, views: PROFILE_VIEWS }
  : (() => { const c = require("./profileCore.js"); return { modes: c.PROFILE_MODES, visible: c.profileModeVisible, views: c.PROFILE_VIEWS }; })();

/**
 * `mode`: the workspace to open (main.js's setMode name); `requires`: the workspace the profile must show for this step to be part of the tour (defaults to `mode`);
 * `target`: the selector of what to point at, or null for a step that is only words. `text` may be a function of the profile (the wording follows the view).
 */
const TOUR_STEPS = [
  {
    id: "path", mode: "guide", target: "#overviewWorkflow", title: "The path Sportify follows",
    text: p => p.view === "simple"
      ? "Set the site, choose the sports and the garden, place them on the roof, then check the layout. Each step is a tab in the rail on the left; the arrows show the order."
      : "Site, sports and garden, Combine, Results, and Compare to weigh variants. Each step is a tab in the rail on the left; the arrows show the order."
  },
  {
    id: "topbar", mode: "guide", target: ".mode-toggle", title: "The top bar",
    text: () => "Overview (where you are), Documents (everything Sportify makes for you), Save Session (a file you keep), New Session (the welcome screen again) and your Profile. The pill on the right says whether Revit is open."
  },
  {
    id: "where", mode: "guide", target: "#overviewWhere", title: "What runs where",
    text: () => "Here you decide: the site, the sports, the placement. Revit turns the decision into a building: the model, the full analyses, the documents. Unity and SOLIDWORKS are engines Revit calls. No Revit open? You keep working in 2D."
  },
  {
    id: "rail", mode: "guide", target: "#modeRail", title: "Your workspaces",
    text: p => p.view === "simple"
      ? "This is the Simple view: only the main path is shown. Structure inputs, site conditions, comparing variants and the rest are one click away when you choose Advanced in the Profile tab."
      : "This is the Advanced view: every workspace is here. If it is too much, the Simple view in the Profile tab shows only the main path."
  },
  {
    id: "site", mode: "site", target: ".site-address-row", title: "Say where the roof is",
    text: () => "Search an address (press Enter and choose the right place) or click the map. The sun, the shade and the wind zone come from this. Turn the roof to true north with the orientation slider below."
  },
  {
    id: "sport", mode: "sport", target: "#activity-bar", title: "Sports and garden",
    text: () => "Choose the court or the activity you want; each one has its own settings. Zones, Plants and Furniture in the rail open panels for the ground, the planting and the furniture."
  },
  {
    id: "combine", mode: "combine", target: "[data-placement-switch]", title: "Place them on the roof",
    text: () => "Manual: drag pieces onto the roof; the rules check every move, and a selected piece shows its own results beside the roof. Algorithmic: say how many of each court you want and the packing engine places them; then change anything by hand."
  },
  {
    id: "analysis", mode: "analysis", target: "#activity-bar", title: "Check the layout",
    text: () => "One tile per analysis for the whole layout: Revit's full result when it has run, this app's quick estimate otherwise, each marked with where it comes from. The groups on the left open the cards, with charts and videos."
  },
  {
    id: "structure", mode: "structure", target: "#structure-content", title: "Structure inputs",
    text: () => "The structural inputs: the grid, the columns and the capacity of the deck. The analyses use them, and whatever is still unconfirmed is marked PRELIMINARY."
  },
  {
    id: "conditions", mode: "conditions", target: "#conditions-content", title: "Site conditions",
    text: () => "Wind, snow and the use of the roof over the day, and the sun and the shade: the inputs of the environmental analyses."
  },
  {
    id: "compare", mode: "compare", target: "#compare-content", title: "Compare variants",
    text: () => "Save layouts for Compare and weigh them against each other."
  },
  {
    id: "postAnalysis", mode: "postAnalysis", target: "#postAnalysis-content", title: "Improve",
    text: () => "What to change first, ranked from the results, and the moving shading (louvres, sails, fences) built from the analysis."
  },
  {
    id: "deliverables", mode: "deliverables", target: "#deliverables-content .guide-hero", title: "Take your documents",
    text: () => "Layouts, charts, the analysis report, schedules and diagrams are kept in your Sportify folder. This tab lists them and can ask Revit for the ones it makes."
  },
  {
    id: "profile", mode: "profile", target: "#profile-view", title: "Make it yours",
    text: () => "Your name and photo, Simple or Advanced, your role and the theme. Take the quiz again here, and see which tools this computer has. The Sportify tab in Revit follows your view."
  },
  {
    id: "revit", mode: "profile", requires: "profile", target: null, title: "In Revit",
    text: () => "Open Sportify App docks this app inside Revit. Push to Sportify sends the roof, and Send All to Web App brings the analyses back here. That is the loop. Getting Started in the ribbon lists the steps. You can take this tour again from the Overview."
  }
];

/**
 * The tour for a profile: the steps whose workspace the profile shows, in order, each with its words for that profile and its number.
 * [{ id, mode, target, title, text, index, total }]
 */
function tourPlan(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  const view = TOUR_WORLD.views[p.view] ? p.view : "advanced";
  const extras = Array.isArray(p.extras) ? p.extras : [];
  const chosen = TOUR_STEPS.filter(s => TOUR_WORLD.visible(view, s.requires || s.mode, extras));
  return chosen.map((s, i) => ({ id: s.id, mode: s.mode, target: s.target, title: s.title, text: s.text({ view, extras }), index: i + 1, total: chosen.length }));
}

/**
 * Where the explanation card goes. `rect` is what is pointed at ({ x, y, w, h }, in the window's pixels) or null (a step that is only words: the card is centred), `view` the
 * window ({ w, h }), `card` the card's size ({ w, h }). The card goes below the target, else above, else to its right, else to its left, else over the middle of it; it is always kept
 * inside the window with a margin. Returns { left, top, side }.
 */
function tourCardPlacement(rect, view, card, gap = 14, margin = 12) {
  const clampX = x => Math.max(margin, Math.min(view.w - card.w - margin, x));
  const clampY = y => Math.max(margin, Math.min(view.h - card.h - margin, y));
  if (!rect) return { left: clampX((view.w - card.w) / 2), top: clampY((view.h - card.h) / 2), side: "center" };
  const cx = rect.x + rect.w / 2 - card.w / 2, cy = rect.y + rect.h / 2 - card.h / 2;
  if (rect.y + rect.h + gap + card.h + margin <= view.h) return { left: clampX(cx), top: rect.y + rect.h + gap, side: "below" };
  if (rect.y - gap - card.h - margin >= 0) return { left: clampX(cx), top: rect.y - gap - card.h, side: "above" };
  if (rect.x + rect.w + gap + card.w + margin <= view.w) return { left: rect.x + rect.w + gap, top: clampY(cy), side: "right" };
  if (rect.x - gap - card.w - margin >= 0) return { left: rect.x - gap - card.w, top: clampY(cy), side: "left" };
  return { left: clampX(cx), top: clampY(cy), side: "over" };
}

/** The lit-up part of the page: the target's rectangle with some air around it, kept inside the screen. null when there is nothing to point at (no target, or it has no size). */
function tourSpotRect(rect, view, pad = 6) {
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return null;
  const x = Math.max(0, rect.x - pad), y = Math.max(0, rect.y - pad);
  return { x, y, w: Math.min(view.w, rect.x + rect.w + pad) - x, h: Math.min(view.h, rect.y + rect.h + pad) - y };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TOUR_STEPS, tourPlan, tourCardPlacement, tourSpotRect };
}
