/**
 * main.js — Sportify app orchestration
 * Mode switching, planner/client role toggle, toast notifications, and app
 * init. Per-mode logic lives in its own controller file (sportController.js,
 * gardenController.js, combineController.js, siteController.js), and the
 * Revit live-sync poll lives in revitBridge.js — this file is only the glue
 * that ties them together and starts the app.
 */

/* ── Planner / Client role ──
 * Planner = full manual control (raw dimensions, drag/rotate, rule
 * tuning, CAD exports). Client = curates what goes in (sports, garden
 * style, entrances) and lets the rule engine arrange it — no fine manual
 * control. Gated purely client-side via html[data-role]; see style.css
 * for the .planner-only hide rule.
 */
document.documentElement.dataset.role = "planner";

function isDarkMode() {
  return document.documentElement.dataset.mode === "dark";
}

/* ── Light / dark theme toggle ──
 * index.html's inline head script already sets html[data-mode] to a saved
 * choice (or the OS preference, or "dark") before first paint, so the
 * attribute is always explicitly "light" or "dark" by the time this file
 * runs — never unset. Toggling just flips it, persists the choice, and
 * re-renders the few SVG panels (field/activity/garden) that bake
 * light/dark colors directly into their fills instead of reading CSS
 * variables; everything else re-themes on its own via those variables.
 */
const THEME_STORAGE_KEY = "sportify-theme";

function applyTheme(mode) {
  document.documentElement.dataset.mode = mode;
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = mode === "dark"
      ? '<i class="ti ti-moon" aria-hidden="true"></i>'
      : '<i class="ti ti-sun" aria-hidden="true"></i>';
    btn.title = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
  if (activeMode === "sport") updateUI();
  else if (activeMode === "garden") updateGardenUI();
}

function setTheme(mode) {
  applyTheme(mode);
  try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch (e) {}
  if (typeof profileOnUiChange === "function") profileOnUiChange();      // the PROFILE (profile.js) remembers the theme too
}

document.getElementById("themeToggle").addEventListener("click", () => {
  setTheme(isDarkMode() ? "light" : "dark");
});

/* ── Mode Switching ── */
let activeMode = "sport"; // Declared ONCE here!

document.getElementById("modeGuide").addEventListener("click", () => setMode("guide"));
document.getElementById("modeDeliverables").addEventListener("click", () => setMode("deliverables"));
document.getElementById("modeFamilies").addEventListener("click", () => setMode("families"));
document.getElementById("modeSession").addEventListener("click", () => setMode("session"));
document.getElementById("modeProfile").addEventListener("click", () => setMode("profile"));
document.getElementById("modeSite").addEventListener("click", () => setMode("site"));
document.getElementById("modeStructure").addEventListener("click", () => setMode("structure"));
document.getElementById("modeConditions").addEventListener("click", () => setMode("conditions"));
document.getElementById("modeSport").addEventListener("click", () => setMode("sport"));
// Garden is no longer a workspace — planting is drawn as a zone in Combine.
document.getElementById("modeCombine").addEventListener("click", () => setMode("combine"));
document.getElementById("modeData").addEventListener("click", () => setMode("data"));
document.getElementById("modeAnalysis").addEventListener("click", () => setMode("analysis"));
document.getElementById("modeCompare").addEventListener("click", () => setMode("compare"));
document.getElementById("modePostAnalysis").addEventListener("click", () => setMode("postAnalysis"));
document.getElementById("btn-guide-start").addEventListener("click", () => setMode("site"));

/* ── Overview / Deliverables / Save Session tabs ──
 * Deliverables' buttons delegate to each mode's own real export buttons
 * rather than duplicating logic; Save/Load's own buttons (wired directly
 * in combineController.js — downloadCombinedSession/loadSessionFromFile)
 * are now the ONLY save/load entry point, since the old top-right icons
 * were a redundant second copy of the same action. */
document.getElementById("overviewWorkflow")?.addEventListener("click", e => {
  const btn = e.target.closest(".workflow-step");
  if (btn) setMode(btn.dataset.goto);
});

/* The Overview's "What's new" cards: the profile, the quiz, and the two ways of placing (manual and algorithmic, both in Combine). */
document.getElementById("overviewFeatures")?.addEventListener("click", e => {
  const card = e.target.closest("[data-feature]");
  if (!card) return;
  const feature = card.dataset.feature;
  if (feature === "profile") setMode("profile");
  else if (feature === "quiz") { if (typeof quizOpen === "function") quizOpen(undefined); }
  else if (feature === "manual" || feature === "algo") {
    setMode("combine");
    if (typeof algoSetMode === "function") algoSetMode(feature);
  }
});

function wireDeliverable(overviewId, realId) {
  document.getElementById(overviewId)?.addEventListener("click", () => document.getElementById(realId)?.click());
}
wireDeliverable("btn-deliver-sport-json", "btn-json");
wireDeliverable("btn-deliver-sport-dxf", "btn-dxf");
wireDeliverable("btn-deliver-garden-json", "btn-garden-json");
wireDeliverable("btn-deliver-combine-json", "btn-combine-json");
wireDeliverable("btn-deliver-combine-png", "btn-combine-png");

function setMode(mode) {
  // A workspace the view in force hides (profile.js: the Simple view) is not opened by a link or a button that still points at it; the Profile tab says how to get it.
  if (typeof profileModeAllowed === "function" && !profileModeAllowed(mode)) {
    showToast("Hidden in the Simple view", "Switch to Advanced in the Profile tab to open it.");
    return;
  }
  const isGarden = mode === "garden";
  const isSport = mode === "sport";
  const isCombine = mode === "combine";
  const isData = mode === "data";
  const isAnalysis = mode === "analysis";
  const isCompare = mode === "compare";
  const isPostAnalysis = mode === "postAnalysis";
  const isGuide = mode === "guide";
  const isSite = mode === "site";
  const isStructure = mode === "structure";
  const isConditions = mode === "conditions";
  const isDeliverables = mode === "deliverables";
  const isSession = mode === "session";
  const isProfile = mode === "profile";
  const isFamilies = mode === "families";

  if (isGarden) updateActivityBarForMode("garden");
  else if (isSport) buildActivityBar();
  else if (isAnalysis && typeof buildAnalysisRail === "function") buildAnalysisRail();   // Analysis's own rail: Overview, then a group per kind of analysis
  else if (isPostAnalysis && typeof buildPostAnalysisRail === "function") buildPostAnalysisRail();   // Improve's own rail: Dynamic Families, Recommendations

  // Revit's analysis results are only polled while the Results tab (its overview shows them too) or Improve is open. Combine asks once
  // when it opens, so the results shown for a selected piece are not older than the visit.
  if (typeof startResultsPolling === "function") {
    if (isPostAnalysis || isAnalysis) startResultsPolling();
    else stopResultsPolling();
    if (isCombine && typeof pollAnalysisResults === "function") pollAnalysisResults();
  }

  // Warm accent for Sport (energetic court sports), green for Garden
  // (nature) — see the html[data-app-mode] rules in style.css. Combine/Data/
  // Analysis/Site don't match either selector, so they fall through to the
  // neutral default accent unchanged.
  document.documentElement.dataset.appMode = mode;

  if (isCombine && typeof roofProgramOnCombineOpen === "function") roofProgramOnCombineOpen();

  // Combine, Data, Compare, Site, and Guide have no per-sport icon
  // rail; Combine also has no use for the sidebar (its panel content lives
  // beside the roof in .canvas-area instead), so collapse it there and give
  // that space to the canvas instead of leaving it empty. Data, Compare,
  // Site, and Guide keep the sidebar visible/hidden per their own
  // minimal needs. Analysis uses the rail for the groups of results Revit
  // sends (analysisResults.js).
  document.getElementById("activity-bar").style.display = (isCombine || isData || isCompare || isGuide || isSite || isStructure || isConditions || isDeliverables || isSession || isProfile || isFamilies) ? "none" : "flex";
  document.querySelector(".panel").style.display = (isCombine || isGuide || isDeliverables || isSession || isProfile || isFamilies) ? "none" : "flex";

  document.getElementById("siteConfigurator").style.display = isSite ? "block" : "none";
  document.getElementById("structureConfigurator").style.display = isStructure ? "block" : "none";
  document.getElementById("conditionsConfigurator").style.display = isConditions ? "block" : "none";
  document.getElementById("sportConfigurator").style.display = isSport ? "block" : "none";
  document.getElementById("gardenConfigurator").style.display = isGarden ? "block" : "none";
  // combineConfigurator is itself a flex row (roof pane + step pane) now,
  // so it needs "flex" rather than "block" to lay its children out
  // correctly whenever it's re-shown.
  document.getElementById("combineConfigurator").style.display = isCombine ? "flex" : "none";
  document.getElementById("dataConfigurator").style.display = isData ? "block" : "none";
  document.getElementById("analysisConfigurator").style.display = isAnalysis ? "block" : "none";
  document.getElementById("postAnalysisConfigurator").style.display = isPostAnalysis ? "block" : "none";
  document.getElementById("compareConfigurator").style.display = isCompare ? "block" : "none";

  document.getElementById("field").style.display = isSport ? "block" : "none";
  document.getElementById("garden-field").style.display = isGarden ? "block" : "none";
  // #combine-canvas is nested inside #combineConfigurator now, so toggling
  // that parent already shows/hides it — no separate toggle needed here.
  document.getElementById("site-content").style.display = isSite ? "block" : "none";
  document.getElementById("structure-content").style.display = isStructure ? "block" : "none";
  document.getElementById("conditions-content").style.display = isConditions ? "block" : "none";
  document.getElementById("data-content").style.display = isData ? "block" : "none";
  document.getElementById("analysis-content").style.display = isAnalysis ? "block" : "none";
  document.getElementById("postAnalysis-content").style.display = isPostAnalysis ? "block" : "none";
  document.getElementById("compare-content").style.display = isCompare ? "block" : "none";
  document.getElementById("families-content").style.display = isFamilies ? "block" : "none";
  document.getElementById("guide-content").style.display = isGuide ? "block" : "none";
  document.getElementById("deliverables-content").style.display = isDeliverables ? "block" : "none";
  if (isDeliverables && typeof renderDeliverables === "function") { renderDeliverables(); if (typeof workspaceRefresh === "function") workspaceRefresh(); }
  document.getElementById("session-content").style.display = isSession ? "block" : "none";
  document.getElementById("profile-content").style.display = isProfile ? "block" : "none";
  if (isProfile && typeof profileRender === "function") { profileRender(); if (typeof profileOnTabOpen === "function") profileOnTabOpen(); }

  document.getElementById("modeGuide").classList.toggle("active", isGuide);
  document.getElementById("modeDeliverables").classList.toggle("active", isDeliverables);
  document.getElementById("modeSession").classList.toggle("active", isSession);
  document.getElementById("modeProfile").classList.toggle("active", isProfile);
  document.getElementById("modeSite").classList.toggle("active", isSite);
  document.getElementById("modeStructure").classList.toggle("active", isStructure);
  document.getElementById("modeConditions").classList.toggle("active", isConditions);
  document.getElementById("modeSport").classList.toggle("active", isSport);
  document.getElementById("modeGarden")?.classList.toggle("active", isGarden);
  document.getElementById("modeCombine").classList.toggle("active", isCombine);
  document.getElementById("modeFamilies").classList.toggle("active", isFamilies);
  document.getElementById("modeData").classList.toggle("active", isData);
  document.getElementById("modeAnalysis").classList.toggle("active", isAnalysis);
  document.getElementById("modeCompare").classList.toggle("active", isCompare);
  document.getElementById("modePostAnalysis").classList.toggle("active", isPostAnalysis);

  // Explicit branch per mode — a bare `else` here previously meant "anything
  // that isn't garden/sport" silently ran updateCombineUI(), which broke the
  // instant a 4th mode existed. Guide is static markup — nothing to update.
  // Site is also static markup (its inputs are wired directly by
  // siteController.js/siteField.js) except for the map, which needs an
  // explicit (re)init once its container is actually visible/sized.
  if (isGarden) updateGardenUI();
  else if (isSport) updateUI();
  else if (isCombine) updateCombineUI();
  else if (isData && typeof updateDataUI === "function") updateDataUI();
  else if (isAnalysis && typeof updateAnalysisUI === "function") updateAnalysisUI();
  else if (isPostAnalysis && typeof updatePostAnalysisUI === "function") updatePostAnalysisUI();
  else if (isCompare && typeof updateCompareUI === "function") updateCompareUI();
  else if (isFamilies && typeof updateFamiliesUI === "function") updateFamiliesUI();
  else if (isStructure && typeof updateStructureTabUI === "function") { updateStructureUI(); updateAssumptionsUI(); updateStructureTabUI(); }
  else if (isConditions && typeof updateConditionsTabUI === "function") { updateSiteUI(); updateAssumptionsUI(); updateConditionsTabUI(); }
  else if (isSite && typeof initSiteMap === "function") {
    initSiteMap(); // no-ops after the first call (siteMap already exists)
    // Re-measure every time Site is (re)entered, not just on first creation
    // — a Leaflet map created while its container was ever hidden/mid-
    // transition caches a stale size that only a fresh invalidateSize() fixes.
    if (typeof siteMap !== "undefined" && siteMap) requestAnimationFrame(() => siteMap.invalidateSize());
  }

  activeMode = mode;
}

/* ── Role toggle (Planner / Client) ──
 * Swaps a handful of button/label captions to friendlier client-facing
 * text and disables (not hides) the design-rule number inputs so a
 * client can still see *why* a layout looks the way it does without
 * being able to change the thresholds. Hiding the deeper technical
 * controls (raw dimensions, drag/rotate, CAD exports) is handled purely
 * in CSS via the .planner-only class — see style.css.
 */
function applyRoleLabels(role) {
  document.querySelectorAll("[data-client-label]").forEach(el => {
    if (!el.dataset.plannerLabel) el.dataset.plannerLabel = el.textContent;
    el.textContent = role === "client" ? el.dataset.clientLabel : el.dataset.plannerLabel;
  });
}

function setRole(role, quiet) {
  document.documentElement.dataset.role = role;
  document.getElementById("rolePlanner").classList.toggle("active", role === "planner");
  document.getElementById("roleClient").classList.toggle("active", role === "client");
  applyRoleLabels(role);
  document.querySelectorAll(".rule-input").forEach(el => { el.disabled = role !== "planner"; });
  if (activeMode === "combine" && typeof drawCombineCanvas === "function") drawCombineCanvas();
  if (quiet) return;      // a profile being loaded (profile.js) sets the role without announcing it
  showToast(
    role === "client" ? "Client mode" : "Planner mode",
    role === "client"
      ? "Pick your sports, garden style, and entrances — the rules handle the rest."
      : "Full manual control unlocked — fine-tune placement and design rules."
  );
  if (typeof profileOnUiChange === "function") profileOnUiChange();      // the PROFILE (profile.js) remembers the role too
}
document.getElementById("rolePlanner").addEventListener("click", () => setRole("planner"));
document.getElementById("roleClient").addEventListener("click", () => setRole("client"));

function showToast(title, message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div class="toast-body">${escapeHtml(message)}</div>`;      // toasts carry names from catalogues and files: text, never markup
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ── Init ── */
// Sync the toggle button's icon/title to whatever theme the head script
// already applied — activeMode is still "guide"'s eventual value at this
// point, so this only updates the button, no SVG redraw happens yet.
/**
 * Generic drag-to-resize for a handle sitting next to a fixed-width pane.
 * targetSide "left" = the pane being resized sits to the LEFT of the
 * handle (dragging right grows it, e.g. the main .panel sidebar);
 * "right" = the pane sits to the RIGHT of the handle (dragging right
 * shrinks it instead, e.g. Combine's step/iterations panes) — same
 * pointer-capture idiom the roof canvas's own drags already use.
 */
function makeResizable(handleId, targetEl, { min, max, targetSide }) {
  const handle = document.getElementById(handleId);
  if (!handle || !targetEl) return;
  let startX = 0, startWidth = 0;
  const sign = targetSide === "left" ? 1 : -1;

  handle.addEventListener("pointerdown", e => {
    startX = e.clientX;
    startWidth = targetEl.getBoundingClientRect().width;
    handle.classList.add("resizing");
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* no active pointer for this id — rare, harmless to skip capture */ }
    e.preventDefault();
  });
  handle.addEventListener("pointermove", e => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const newWidth = Math.min(max, Math.max(min, startWidth + sign * (e.clientX - startX)));
    targetEl.style.width = `${newWidth}px`;
  });
  ["pointerup", "pointercancel"].forEach(evt => handle.addEventListener(evt, e => {
    handle.classList.remove("resizing");
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
  }));
}
makeResizable("panelResizer", document.querySelector(".panel"), { min: 180, max: 520, targetSide: "left" });
makeResizable("stepPaneResizer", document.querySelector(".combine-step-pane"), { min: 300, max: 720, targetSide: "right" });
makeResizable("iterationsPaneResizer", document.querySelector(".iterations-pane"), { min: 140, max: 400, targetSide: "right" });

applyTheme(document.documentElement.dataset.mode);
buildActivityBar();
siteState.date = typeof todayIsoDate === "function" ? todayIsoDate() : siteState.date;
document.getElementById("siteDate").value = siteState.date;
setMode("guide");
if(typeof initCombineInteractions === "function") initCombineInteractions();
if(typeof initTrayDragInteractions === "function") initTrayDragInteractions();
if(typeof updateSiteUI === "function") updateSiteUI();
if (typeof profileInit === "function") profileInit();      // the PROFILE (profile.js): view, role and theme as the person left them
if (typeof quizInit === "function") quizInit();            // the start-up quiz (quiz.js): wired now, opened by the welcome screen for a new person
if (typeof tourInit === "function") tourInit();            // the rundgang (tour.js): offered after the quiz, from the Overview and from the Profile tab
if (typeof whereInit === "function") whereInit();          // what runs where (where.js): the status of Revit in the top bar, the badges, the Overview's card
startRevitPolling();
// restoreAutosaveIfAny() is no longer called automatically here — the
// session gate (sessionGate.js, shown on top of whatever setMode("guide")
// just rendered) now owns that decision explicitly instead of silently
// restoring on every load.
