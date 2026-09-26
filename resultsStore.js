/**
 * resultsStore.js — draws the one store of analysis results (resultsStoreCore.js has the words and the rule; this gathers the inputs and makes the HTML).
 *
 * Two views of the same store:
 *   the overview  the Analysis tab's default: one icon tile per analysis, grouped as the tab's rail is. A tile says the headline number, whether it is Revit's full analysis or this app's quick
 *                 estimate, and whether it is about the layout on screen. Clicking it opens the group with that analysis's card (analysisResults.js resultsCardHtml: the tile and the card call the
 *                 same functions, so they cannot disagree).
 *   one piece     Combine's inspector, for the piece you selected: an icon per analysis that applies to it, the selected one's own figures and words, live as the piece is dragged (the inspector
 *                 redraws with the canvas). These are quick estimates: what Revit found is about the roof, and its zones carry a label, not a piece id, so nothing of it is guessed onto a piece.
 *
 * Reads: analyze*() and piece*() (analysisController.js: the estimates), resultsState/resSection/resFreshness/resultsStatusHtml (analysisResults.js: what Revit sent).
 */

let resultsOverviewKey = null;
let pieceResultsOpen = null;      // which analysis's figures are open under the icons; null = the one that needs the most attention

// ---------------------------------------------------------------------------------------------------- the overview

function resultsStoreEstimates() {
  return { fire: analyzeFireSafety(), access: analyzeAccessibility(), water: analyzeWaterManagement(), wind: analyzeWindExposure(), lca: analyzeLCA() };
}

/** Every analysis with the result it shows now (buildResultsOverview): from what this app computes and what Revit sent. */
function resultsStoreOverview() {
  return buildResultsOverview({ estimates: resultsStoreEstimates(), sections: resultsState.payload, freshness: resFreshness });
}

function resultsOverviewStateKey() {
  return JSON.stringify([resultsState.raw, resultsState.receivedAt, resultsState.connected, resultsState.cached, typeof workspaceState !== "undefined" ? [workspaceState.stamp, workspaceState.layoutIdNow] : 0]);
}

function resultTileHtml(t) {
  const src = RESULT_SOURCES[t.source] ? t.source : "none";
  return `<button type="button" class="result-tile tone-${escapeHtml(t.tone)} src-${escapeHtml(src)}${t.freshness === "stale" ? " is-stale" : ""}" data-result="${escapeHtml(t.key)}" data-group="${escapeHtml(t.group)}" title="${escapeHtml(RESULT_SOURCES[src].title)}">
    <span class="result-tile-icon"><i class="ti ${escapeHtml(t.icon)}" aria-hidden="true"></i></span>
    <span class="result-tile-body">
      <span class="result-tile-title">${escapeHtml(t.title)}</span>
      <span class="result-tile-headline">${escapeHtml(t.headline)}</span>
      <span class="result-tile-source ${escapeHtml(src)}">${escapeHtml(t.sourceText)}</span>
    </span>
    <span class="res-chip tone-${escapeHtml(t.tone)} result-tile-chip">${escapeHtml(t.chip)}</span>
  </button>`;
}

function resultsOverviewHtml() {
  resultsOverviewKey = resultsOverviewStateKey();
  const tiles = resultsStoreOverview();
  const line = resultsOverviewLine(resultsOverviewCounts(tiles));
  const groups = RESULTS_GROUPS.map(g => `<section class="results-group" data-group="${escapeHtml(g.id)}">
      <h4 class="results-group-title"><i class="ti ${escapeHtml(g.icon)}" aria-hidden="true"></i>${escapeHtml(g.label)}</h4>
      <div class="results-tile-grid">${tiles.filter(t => t.group === g.id).map(resultTileHtml).join("")}</div>
    </section>`).join("");
  return `<div class="res-wrap results-overview">
    <header class="results-overview-head">
      <h3>The whole layout at a glance</h3>
      <p class="hint">${escapeHtml(RESULTS_RULE)}</p>
      <p class="res-status">${resultsStatusHtml()}</p>
      <p class="results-overview-counts">${escapeHtml(line)}</p>
    </header>
    ${groups}
    <div class="results-piece-note">
      <i class="ti ti-pointer" aria-hidden="true"></i>
      <div><strong>One piece?</strong> Select it in Combine: the analyses that apply to it appear beside the roof and follow it as you drag it.</div>
      <button type="button" class="btn-export" id="btn-results-open-combine">Open Combine</button>
    </div>
  </div>`;
}

/** Clicking a tile opens its group and brings its card into view. */
function resultsOpenCard(group, key) {
  if (typeof setAnalysisSub === "function") setAnalysisSub(group);
  const el = document.getElementById("res-" + key);
  if (!el) return;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" });
  el.classList.add("res-flash");
  setTimeout(() => el.classList.remove("res-flash"), 1800);
}

function resultsOverviewWire(root) {
  if (!root) return;
  root.querySelectorAll(".result-tile").forEach(btn => btn.addEventListener("click", () => resultsOpenCard(btn.dataset.group, btn.dataset.result)));
  const open = root.querySelector("#btn-results-open-combine");
  if (open) open.addEventListener("click", () => setMode("combine"));
}

/** Redraws the overview when what it shows changed (a result arrived, Revit came or went, the layout on screen changed), not on every poll: a tile the reader is pointing at should not flicker. */
function renderAnalysisOverviewIfChanged() {
  if (resultsOverviewStateKey() === resultsOverviewKey) return;
  if (typeof renderAnalysisContent === "function") renderAnalysisContent();
}

// ---------------------------------------------------------------------------------------------------- one piece

/** What each analysis says about this piece now: [{ key, cat, sum, revitNote }] in the catalogue's order. */
function resultsPieceRows(item, circulation) {
  return pieceAnalysisKeys(item).map(key => {
    const has = !!resSection(key);
    return { key, cat: resultsCatalogueEntry(key), sum: pieceSummary(key, pieceAnalysisData(key, item, circulation)), revitNote: pieceRevitNote(has ? resFreshness(key) : null, has) };
  });
}

/** The strip and the open analysis's figures, for Combine's inspector; "" when nothing applies. */
function resultsPieceHtml(item, circulation) {
  const rows = resultsPieceRows(item, circulation);
  if (!rows.length) return "";
  const worst = worstTone(rows.map(r => r.sum.tone));
  const open = rows.find(r => r.key === pieceResultsOpen) || rows.find(r => r.sum.tone === worst) || rows[0];
  const icons = rows.map(r => `<button type="button" class="piece-res-icon tone-${escapeHtml(r.sum.tone)}${r === open ? " is-open" : ""}" data-result="${escapeHtml(r.key)}" aria-pressed="${r === open ? "true" : "false"}"
      title="${escapeHtml(r.cat.title + ": " + r.sum.headline)}" aria-label="${escapeHtml(r.cat.title + ": " + r.sum.headline)}"><i class="ti ${escapeHtml(r.cat.icon)}" aria-hidden="true"></i></button>`).join("");
  return `<div class="piece-results">
    <div class="piece-results-head"><strong>Results for this piece</strong><span class="hint">live, quick estimates</span></div>
    <div class="piece-results-strip" role="group" aria-label="Analyses that apply to this piece">${icons}</div>
    <div class="piece-results-detail tone-${escapeHtml(open.sum.tone)}">
      <div class="piece-res-row-head"><span class="piece-res-name">${escapeHtml(open.cat.title)}</span><span class="res-chip tone-${escapeHtml(open.sum.tone)}">${escapeHtml(open.sum.chip)}</span></div>
      <p class="hint">${escapeHtml(open.sum.text)}</p>
      <p class="piece-res-source"><i class="ti ti-bolt" aria-hidden="true"></i>${escapeHtml(resultSourceText({ source: "estimate", freshness: "current" }))}</p>
      <p class="piece-res-revit">${escapeHtml(open.revitNote)}</p>
      <button type="button" class="piece-res-analysis" data-result="${escapeHtml(open.key)}" data-group="${escapeHtml(open.cat.group)}">See it in Analysis</button>
    </div>
  </div>`;
}

function resultsPieceWire(host) {
  if (!host) return;
  host.querySelectorAll(".piece-res-icon").forEach(btn => btn.addEventListener("click", () => {
    pieceResultsOpen = btn.dataset.result;
    if (typeof renderInspector === "function") renderInspector();
  }));
  const go = host.querySelector(".piece-res-analysis");
  if (go) go.addEventListener("click", () => {
    setMode("analysis");
    resultsOpenCard(go.dataset.group, go.dataset.result);
  });
}
