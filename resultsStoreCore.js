/**
 * resultsStoreCore.js — ONE store of analysis results, and the one rule for what each analysis says. Pure (no DOM, no network, no globals of the app), so tools/results-store-test.js runs it as it is;
 * resultsStore.js gathers the inputs and draws it.
 *
 * Why it exists. The same analysis used to be told in several places by several pieces of code: the Analysis tab's own quick-estimate cards, the tabs that show what Revit found, the per-piece
 * explorer, Revit's ribbon. Nobody could tell which number came from where, or whether two of them were the same thing. Now there is one list of analyses (the catalogue below) and one function
 * for each thing a reader is told about an analysis (the tone, the chip, the headline), and every screen reads them:
 *   - the Analysis tab's overview: one icon tile per analysis, the global picture, by default;
 *   - the cards under each group of that tab (the tile and its card cannot disagree: they call the same function);
 *   - Combine's inspector: for the piece you selected, the analyses that apply to it, live as it is dragged.
 *
 * The rule for which result an analysis shows (pickResult), said the same way everywhere:
 *   Revit's full analysis when it has run (flagged when it is about an earlier layout);
 *   otherwise this app's quick estimate, which is computed from the layout on screen (only some analyses have one);
 *   otherwise "not run yet", with where to run it.
 *
 * Nothing here judges beyond what the analyses already judged: tone and chip words are the ones the cards always used (analysisController.js, analysisResults.js now call revitSummary/estimateSummary
 * instead of each having their own), so a number is never told two ways.
 */

/** tones: "ok" | "warn" | "bad" | "neutral" | "prelim" (rests on inputs nobody confirmed) | "none" (nothing to judge yet). */

/** The groups of the Analysis tab's rail that hold results, in the order of the tab's rail (analysisResults.js ANALYSIS_SUBTABS has the same ids, labels and icons: tools/results-store-test.js). */
const RESULTS_GROUPS = [
  { id: "garden", label: "Garden", icon: "ti-plant-2" },
  { id: "structure", label: "Structure", icon: "ti-building" },
  { id: "sun", label: "Sun", icon: "ti-sun" },
  { id: "sport", label: "Sport", icon: "ti-ball-basketball" },
  { id: "safety", label: "Safety", icon: "ti-flame" },
  { id: "other", label: "Other", icon: "ti-leaf" }
];

/**
 * Every analysis, keyed by the name of the section the Revit add-in publishes it under (RESULT_SECTIONS in analysisResults.js has the same keys plus "kinetics", which lives in the Post Analysis tab).
 *   estimate  which quick estimate this app computes for it ("fire", "access", "water", "wind", "lca"), or null: it has none, only Revit's full analysis
 *   piece     which pieces it says something about: "all", "garden" (only garden pieces), or null (a whole-roof analysis)
 */
const RESULTS_CATALOGUE = [
  { key: "soil_percolation", title: "Rain and soil percolation", short: "Rain", icon: "ti-droplet", group: "garden", estimate: "water", piece: "garden" },
  { key: "wind_erosion", title: "Wind and erosion", short: "Wind", icon: "ti-wind", group: "garden", estimate: "wind", piece: "all" },
  { key: "structural_loads", title: "Structural loads", short: "Loads", icon: "ti-building", group: "structure", estimate: null, piece: null },
  { key: "dynamic_analysis", title: "Dynamic analysis", short: "Dynamics", icon: "ti-wave-sine", group: "structure", estimate: null, piece: null },
  { key: "sun_and_shading", title: "Sun and shade", short: "Sun", icon: "ti-sun", group: "sun", estimate: null, piece: null },
  { key: "ball_trajectory", title: "Ball trajectories", short: "Balls", icon: "ti-ball-basketball", group: "sport", estimate: null, piece: null },
  { key: "fire_safety", title: "Fire safety", short: "Fire", icon: "ti-flame", group: "safety", estimate: "fire", piece: "all" },
  { key: "accessibility", title: "Accessibility", short: "Access", icon: "ti-wheelchair", group: "safety", estimate: "access", piece: "all" },
  { key: "lca", title: "LCA", short: "LCA", icon: "ti-recycle", group: "other", estimate: "lca", piece: "all" },
  { key: "carbon_impact", title: "Carbon impact", short: "Carbon", icon: "ti-leaf", group: "other", estimate: null, piece: null }
];

/** The two places a result can come from, in the words used on every badge. */
const RESULT_SOURCES = {
  revit: { label: "Full analysis", where: "Revit", title: "Full analysis in Revit: the layout as a building, with the real engines behind the numbers" },
  estimate: { label: "Quick estimate", where: "this app", title: "Quick estimate in this app: a rule of thumb on the layout on screen, live. Run the full analysis in Revit for the reference figure" },
  none: { label: "Not run", where: "", title: "Nothing has been computed for this yet" }
};

const RESULTS_RULE = "One card per analysis: Revit's full analysis when it has run on this layout, otherwise this app's quick estimate, otherwise not run yet.";

function resultsCatalogueEntry(key) {
  return RESULTS_CATALOGUE.find(e => e.key === key) || null;
}

function resultsGroup(id) {
  return RESULTS_GROUPS.find(g => g.id === id) || null;
}

function resultsInGroup(id) {
  return RESULTS_CATALOGUE.filter(e => e.group === id);
}

// ---------------------------------------------------------------------------------------------------- small helpers

function rsNum(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** A number for a headline: thousands separated, no more than `digits` decimals ("—" for what is not a number). */
function resultsFmt(v, digits) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 0 : digits, minimumFractionDigits: 0 });
}

function rsPlural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

// ---------------------------------------------------------------------------------------------------- the quick estimates (this app)

const ESTIMATE_NEEDS = {
  empty: "Push a sport, activity or garden piece to Combine to check this.",
  "no-entries": "Add an entry point on the Combine board to check this."
};

/**
 * What the app's own calculation of one analysis says: { tone, chip, headline, note? }. `r` is what analyzeFireSafety / analyzeAccessibility / analyzeWaterManagement / analyzeWindExposure /
 * analyzeLCA (analysisController.js) returned, whose `status` is "empty", "no-entries", "fail" or "ok".
 */
function estimateSummary(kind, r) {
  if (!r || r.status === "empty") return { tone: "none", chip: "nothing placed", headline: "Nothing to check yet", note: ESTIMATE_NEEDS.empty };
  if (r.status === "no-entries") return { tone: "none", chip: "needs an entry", headline: "Needs an entry point", note: ESTIMATE_NEEDS["no-entries"] };

  if (kind === "fire") {
    if (r.status === "fail") return { tone: "bad", chip: "no route", headline: rsPlural(rsNum(r.unreachableCount), "piece", "pieces") + " unreachable" };
    const within = !!r.withinLimit;
    return { tone: within ? "ok" : "warn", chip: within ? "within limit" : "over limit", headline: resultsFmt(r.maxDist, 1) + " m longest route (limit " + resultsFmt(r.maxTravelDistance, 0) + " m)" };
  }
  if (kind === "access") {
    const ok = !!(r.widthOk && r.reachOk);
    return { tone: ok ? "ok" : "warn", chip: ok ? "meets reference" : "check needed",
      headline: resultsFmt(r.currentWidth, 1) + " m wide" + (r.widthOk ? "" : ", under the " + resultsFmt(r.minWidth, 1) + " m reference") + ", " + (r.reachOk ? "every piece reachable" : "some pieces not reachable") };
  }
  if (kind === "water") {
    return { tone: "neutral", chip: "estimate", headline: "~" + resultsFmt(r.retentionPercent, 0) + "% of the rain kept" };
  }
  if (kind === "wind") {
    const exposed = rsNum(r.exposedCount);
    return { tone: exposed > 0 ? "warn" : "ok", chip: exposed > 0 ? exposed + " exposed" : "clear", headline: exposed > 0 ? exposed + " of " + rsNum(r.totalCount) + " pieces near the roof edge" : "no piece near the roof edge" };
  }
  if (kind === "lca") {
    if (!rsNum(r.coveredCount)) return { tone: "neutral", chip: "no data", headline: "No material data yet" };
    const missing = rsNum(r.missingCount);
    return { tone: missing > 0 ? "warn" : "ok", chip: missing > 0 ? missing + " missing" : "complete", headline: "~" + resultsFmt(Math.round(rsNum(r.totalKg)), 0) + " kg CO₂e" };
  }
  return { tone: "none", chip: "", headline: "" };
}

// ---------------------------------------------------------------------------------------------------- Revit's full analyses

/** What a section Revit published says: { tone, chip, headline, preliminary }. Unknown or empty sections say nothing (tone "none"). `r` is the section, as the add-in wrote it. */
function revitSummary(key, r) {
  if (!r || typeof r !== "object") return { tone: "none", chip: "", headline: "", preliminary: false };
  const n = rsNum;

  if (key === "soil_percolation") {
    const sat = n(r.zones_saturated_in_cloudburst), under = n(r.zones_below_target);
    return { tone: sat > 0 || under > 0 ? "warn" : "ok", preliminary: false,
      chip: sat > 0 ? sat + " fill up" : under > 0 ? under + " under target" : "within target",
      headline: resultsFmt(n(r.steady_retained_percent), 0) + "% of steady rain kept" };
  }
  if (key === "wind_erosion") {
    const failing = n(r.trees_failing), lift = n(r.zones_uplift_flagged), marginal = n(r.trees_marginal);
    return { tone: failing > 0 || lift > 0 ? "bad" : marginal > 0 ? "warn" : "ok", preliminary: false,
      chip: failing || lift ? "action needed" : marginal ? "marginal" : "holds",
      headline: failing > 0 ? failing + " of " + n(r.trees_checked) + " trees fail" : lift > 0 ? rsPlural(lift, "build-up", "build-ups") + " lift" : resultsFmt(n(r.peak_pressure_pa), 0) + " Pa peak pressure" };
  }
  if (key === "structural_loads") {
    const over = n(r.bays_over_capacity) > 0, off = !!(r.balance_status && r.balance_status !== "balanced"), prelim = !!r.preliminary;
    return { tone: prelim ? "prelim" : over ? "bad" : off ? "warn" : "ok", preliminary: prelim,
      chip: prelim ? "PRELIMINARY" : over ? n(r.bays_over_capacity) + " bays over" : off ? "unbalanced" : "within capacity",
      headline: resultsFmt(n(r.peak_utilisation_percent), 0) + "% in the busiest bay" };
  }
  if (key === "dynamic_analysis") {
    const prelim = !!r.preliminary, vib = n(r.bays_exceeding_comfort);
    return { tone: prelim ? "prelim" : vib > 0 || n(r.worst_case_utilisation_percent) > 100 ? "bad" : "ok", preliminary: prelim,
      chip: prelim ? "PRELIMINARY" : vib > 0 ? vib + " bays vibrate" : "within limits",
      headline: vib > 0 ? vib + " of " + n(r.bays_checked) + " bays vibrate" : "deck " + resultsFmt(n(r.lowest_frequency_hz), 1) + " to " + resultsFmt(n(r.highest_frequency_hz), 1) + " Hz" };
  }
  if (key === "sun_and_shading") {
    // a result from before the sun analysis existed only said the sun had been configured
    if (!Array.isArray(r.days)) return { tone: "neutral", chip: "old result", headline: "An earlier add-in's result", preliminary: false };
    const withEquipment = n(r.pieces) > 0, prelim = !!r.preliminary;
    const sunnyNow = withEquipment ? n(r.people_zones_too_sunny_after) : n(r.people_zones_too_sunny);
    const shadedNow = withEquipment ? n(r.garden_zones_too_shaded_after) : n(r.garden_zones_too_shaded);
    const chip = prelim ? "PRELIMINARY"
      : n(r.people_zones_too_sunny) > 0 ? (withEquipment ? n(r.people_zones_too_sunny) + " too sunny, " + sunnyNow + " after" : n(r.people_zones_too_sunny) + " too sunny")
      : n(r.garden_zones_too_shaded) > 0 ? n(r.garden_zones_too_shaded) + " too shaded" : "balanced";
    return { tone: prelim ? "prelim" : sunnyNow > 0 || shadedNow > 0 ? "warn" : "ok", preliminary: prelim, chip,
      headline: n(r.people_zones_too_sunny) > 0 ? n(r.people_zones_too_sunny) + " of " + n(r.people_zones) + " play areas too sunny"
        : n(r.garden_zones_too_shaded) > 0 ? n(r.garden_zones_too_shaded) + " of " + n(r.garden_zones) + " gardens too shaded" : "sun and shade balanced" };
  }
  if (key === "ball_trajectory") {
    const leaving = n(r.percent_leaving_roof), crossing = n(r.crossing_count);
    return { tone: crossing > 0 || leaving > 0 ? "warn" : "ok", preliminary: false,
      chip: leaving > 0 ? resultsFmt(leaving, 0) + "% leave the roof" : crossing > 0 ? crossing + " crossings" : "contained",
      headline: leaving > 0 ? resultsFmt(leaving, 0) + "% of stray shots leave the roof" : crossing + " boundary crossings" };
  }
  if (key === "fire_safety") {
    const ok = !!r.within_limit && n(r.unreachable_count) === 0;
    return { tone: ok ? "ok" : "bad", preliminary: false,
      chip: ok ? "within the limit" : n(r.unreachable_count) ? n(r.unreachable_count) + " unreachable" : "too far",
      headline: n(r.unreachable_count) > 0 ? rsPlural(n(r.unreachable_count), "piece", "pieces") + " unreachable" : resultsFmt(n(r.max_dist_m), 1) + " m longest route (limit " + resultsFmt(n(r.max_travel_distance_m), 0) + " m)" };
  }
  if (key === "accessibility") {
    const ok = !!(r.width_ok && r.reach_ok);
    return { tone: ok ? "ok" : "bad", preliminary: false,
      chip: ok ? "accessible" : !r.width_ok ? "too narrow" : "not reachable",
      headline: resultsFmt(n(r.current_width_m), 1) + " m wide (reference " + resultsFmt(n(r.min_width_m), 1) + " m)" };
  }
  if (key === "lca") {
    const missing = n(r.missing_count);
    return { tone: missing ? "warn" : "ok", preliminary: false,
      chip: missing ? missing + " pieces missing data" : "all pieces covered",
      headline: "~" + resultsFmt(n(r.total_kg), 0) + " kg CO₂e" };
  }
  if (key === "carbon_impact") {
    return { tone: "neutral", preliminary: false, chip: "illustrative", headline: "~" + resultsFmt(n(r.estimated_daily_wh), 0) + " Wh/day" };
  }
  return { tone: "none", chip: "", headline: "", preliminary: false };
}

// ---------------------------------------------------------------------------------------------------- one result per analysis

/**
 * The result an analysis shows: Revit's when it has run (flagged when it is not about the layout on screen), else the quick estimate, else "not run yet".
 *   est    estimateSummary(...) or null when this analysis has no quick estimate
 *   rev    revitSummary(...) or null when Revit has not sent this section
 *   fresh  { state: "current" | "stale" | "unknown" | "unchecked", computedAt? } for the Revit section (sectionFreshness in analysisResults.js)
 * Returns { source: "revit" | "estimate" | "none", tone, chip, headline, note, preliminary, freshness, computedAt }.
 */
function pickResult(est, rev, fresh) {
  if (rev) {
    const f = (fresh && fresh.state) || "unknown";
    const stale = f === "stale";
    return { source: "revit", tone: stale ? "warn" : rev.tone, chip: stale ? "out of date" : rev.chip, headline: rev.headline, note: "", preliminary: !!rev.preliminary, freshness: f, computedAt: (fresh && fresh.computedAt) || null };
  }
  if (est) return { source: "estimate", tone: est.tone, chip: est.chip, headline: est.headline, note: est.note || "", preliminary: false, freshness: "current", computedAt: null };
  return { source: "none", tone: "none", chip: "not run", headline: "Run it in Revit", note: "", preliminary: false, freshness: "none", computedAt: null };
}

/** The line under a tile or a card that says where the result comes from and whether it is about this layout. */
function resultSourceText(pick) {
  if (pick.source === "estimate") return "Quick estimate · this app · live";
  if (pick.source === "none") return "Not run yet";
  if (pick.freshness === "stale") return "Full analysis · Revit · out of date";
  if (pick.freshness === "unknown") return "Full analysis · Revit · layout not stamped";
  if (pick.freshness === "unchecked") return "Full analysis · Revit";      // nothing is placed to compare with
  return "Full analysis · Revit · this layout";
}

/**
 * The whole overview: one entry per analysis, from what the app computed and what Revit sent.
 *   inputs.estimates  { fire, access, water, wind, lca } the raw results of the analyze* functions (missing ones are treated as having no estimate)
 *   inputs.sections   the payload Revit published ({ soil_percolation: {...}, ... }), or null
 *   inputs.freshness  (sectionKey) => { state, computedAt }
 */
function buildResultsOverview(inputs) {
  const est = (inputs && inputs.estimates) || {}, sections = (inputs && inputs.sections) || {};
  const freshOf = inputs && typeof inputs.freshness === "function" ? inputs.freshness : () => ({ state: "unknown" });
  return RESULTS_CATALOGUE.map(e => {
    const section = sections[e.key] || null;
    const rev = section ? revitSummary(e.key, section) : null;
    const es = e.estimate && est[e.estimate] ? estimateSummary(e.estimate, est[e.estimate]) : null;
    const pick = pickResult(es, rev, section ? freshOf(e.key) : null);
    return Object.assign({ key: e.key, title: e.title, short: e.short, icon: e.icon, group: e.group, hasEstimate: !!e.estimate, hasRevit: !!section }, pick, { sourceText: resultSourceText(pick) });
  });
}

/** How many analyses come from where, for the line above the tiles: { revit, estimate, none, stale, prelim }. */
function resultsOverviewCounts(tiles) {
  const c = { revit: 0, estimate: 0, none: 0, stale: 0, prelim: 0 };
  (tiles || []).forEach(t => {
    c[t.source] = (c[t.source] || 0) + 1;
    if (t.freshness === "stale") c.stale++;
    if (t.preliminary) c.prelim++;
  });
  return c;
}

function resultsOverviewLine(counts) {
  const parts = [];
  if (counts.revit) parts.push(counts.revit + " full from Revit" + (counts.stale ? " (" + counts.stale + " out of date)" : ""));
  if (counts.estimate) parts.push(counts.estimate + " quick estimate" + (counts.estimate === 1 ? "" : "s"));
  if (counts.none) parts.push(counts.none + " not run yet");
  return parts.join(" · ");
}

/**
 * The line that says whether Revit is there and what it has sent, the same words as the status pill in the top bar ("Revit not open": not being in Revit is a normal state, 2D work goes on).
 * connected: true, false, or null before the first answer; hasResults: something was received (now or in an earlier session); cached: what is shown is from an earlier session; when: "12:41" or "".
 * Returns { key: "live" | "idle" | "cached" | "closed" | "looking", text }.
 */
function resultsRevitLine(connected, hasResults, cached, when) {
  const at = when ? ", received " + when : "";
  if (connected === true && hasResults && !cached) return { key: "live", text: "Revit connected. The full analyses below are live from Revit" + at + "." };
  if (connected === true) return { key: "idle", text: "Revit connected. No full analysis has been run in this session yet." };
  if (connected === false && hasResults) return { key: "cached", text: "Revit not open. The full analyses shown are the last ones received" + (when ? " (" + when + (cached ? ", earlier session" : "") + ")" : "") + "." };
  if (connected === false) return { key: "closed", text: "Revit not open. Quick estimates are computed here; the full analyses need a project open in Revit." };
  return { key: "looking", text: "Looking for Revit…" };
}

// ---------------------------------------------------------------------------------------------------- one piece, live

/** Which analyses say something about this piece (a placed item: { kind }): the keys of the catalogue, in the catalogue's order. */
function pieceAnalysisKeys(item) {
  const kind = item && item.kind;
  return RESULTS_CATALOGUE.filter(e => e.piece === "all" || (e.piece === "garden" && kind === "garden")).map(e => e.key);
}

/**
 * What one analysis says about one piece: { tone, chip, headline, text }. `d` is the piece's own numbers from analysisController.js (pieceFireSafety, pieceAccessibility, pieceWater, pieceWind, pieceLca);
 * these are the quick estimates: Revit's zones carry a label, not a piece id, so nothing of Revit's is guessed onto a piece.
 */
function pieceSummary(key, d) {
  if (!d) return { tone: "none", chip: "", headline: "", text: "" };

  if (key === "fire_safety") {
    if (d.state === "no-entries") return { tone: "none", chip: "needs an entry", headline: "Needs an entry", text: ESTIMATE_NEEDS["no-entries"] };
    if (d.state === "unreachable") return { tone: "bad", chip: "no route", headline: "No route", text: "No walkable route to any entry point at all." };
    if (d.state === "no-route") return { tone: "neutral", chip: "no route yet", headline: "No route yet", text: "No route computed yet: add or move a piece or an entry point." };
    const within = d.lengthM <= d.limitM;
    return { tone: within ? "ok" : "warn", chip: resultsFmt(d.lengthM, 1) + " m", headline: resultsFmt(d.lengthM, 1) + " m to the nearest entry",
      text: "Route to the nearest entry point: " + resultsFmt(d.lengthM, 1) + " m (limit " + resultsFmt(d.limitM, 0) + " m)." };
  }
  if (key === "accessibility") {
    const ok = !!(d.reachable && d.widthOk);
    return { tone: ok ? "ok" : "warn", chip: ok ? "reachable" : !d.reachable ? "not reachable" : "too narrow",
      headline: d.reachable ? "reachable" : "not reachable",
      text: (d.reachable ? "There is a walkable route to this piece from an entry point. " : "Not reachable from an entry point yet. ")
        + "Circulation is set to " + resultsFmt(d.currentWidth, 1) + " m (two-way wheelchair reference " + resultsFmt(d.minWidth, 1) + " m), a layout-wide setting." };
  }
  if (key === "soil_percolation") {
    return { tone: "neutral", chip: "~" + resultsFmt(d.retentionPercent, 0) + "%", headline: "~" + resultsFmt(d.retentionPercent, 0) + "% of the rain kept",
      text: resultsFmt(d.areaM2, 1) + " m², " + resultsFmt(d.depthCm, 0) + " cm build-up: about " + resultsFmt(d.retentionPercent, 0) + "% of the rain kept (a rule of thumb, not a certified figure)." };
  }
  if (key === "wind_erosion") {
    if (d.distM < 0) return { tone: "bad", chip: "off the roof", headline: "Extends past the roof", text: "This piece extends past the roof boundary: resize or move it before this check means anything." };
    const exposed = d.distM < d.zoneM;
    return { tone: exposed ? "warn" : "ok", chip: exposed ? "near the edge" : "clear", headline: resultsFmt(d.distM, 1) + " m from the roof edge",
      text: resultsFmt(d.distM, 1) + " m from the nearest roof edge" + (exposed ? ", inside the " + resultsFmt(d.zoneM, 1) + " m zone of elevated wind exposure." : ".") };
  }
  if (key === "lca") {
    if (!d.material) return { tone: "none", chip: "no material", headline: "No reference material", text: "No reference material picked for this piece: choose one in Sport or Garden (\"Reference material (database)\")." };
    if (d.why === "not in the catalogue") return { tone: "none", chip: "not in the catalogue", headline: d.material, text: d.material + ": not found in the database (typed as text, perhaps), so there is no carbon figure to look up." };
    if (d.kg == null) return { tone: "warn", chip: "no carbon figure", headline: d.material, text: d.material + ": no embodied-carbon figure yet. Add one in the Data tab, Materials." };
    return { tone: "neutral", chip: "~" + resultsFmt(Math.round(d.kg), 0) + " kg", headline: "~" + resultsFmt(Math.round(d.kg), 0) + " kg CO₂e",
      text: d.material + ": " + resultsFmt(d.areaM2, 1) + " m² × " + d.kgPerM2 + " " + (d.unit || "kg CO2e/m2") + " = ~" + resultsFmt(Math.round(d.kg), 0) + " kg CO₂e (A1-A3, illustrative)." };
  }
  return { tone: "none", chip: "", headline: "", text: "" };
}

/** What Revit has to say about this analysis for the whole layout, in a few words for the row of a piece (Revit's numbers are about the roof, not the piece). */
function pieceRevitNote(fresh, hasSection) {
  if (!hasSection) return "Full analysis in Revit: not run";
  const f = fresh && fresh.state;
  if (f === "stale") return "Full analysis in Revit: out of date";
  if (f === "unknown") return "Full analysis in Revit: received, layout not stamped";
  return "Full analysis in Revit: run on this layout";
}

/** The worst tone among some (the order the eye should be drawn in): bad, warn, prelim, ok, neutral, none. */
const RESULT_TONE_ORDER = ["bad", "warn", "prelim", "ok", "neutral", "none"];
function worstTone(tones) {
  let best = "none";
  (tones || []).forEach(t => { if (RESULT_TONE_ORDER.indexOf(t) !== -1 && RESULT_TONE_ORDER.indexOf(t) < RESULT_TONE_ORDER.indexOf(best)) best = t; });
  return best;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RESULTS_GROUPS, RESULTS_CATALOGUE, RESULT_SOURCES, RESULTS_RULE, ESTIMATE_NEEDS, RESULT_TONE_ORDER,
    resultsCatalogueEntry, resultsGroup, resultsInGroup, resultsFmt, resultsRevitLine, estimateSummary, revitSummary, pickResult, resultSourceText,
    buildResultsOverview, resultsOverviewCounts, resultsOverviewLine, pieceAnalysisKeys, pieceSummary, pieceRevitNote, worstTone
  };
}
