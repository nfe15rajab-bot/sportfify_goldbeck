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
}

document.getElementById("themeToggle").addEventListener("click", () => {
  setTheme(isDarkMode() ? "light" : "dark");
});

/* ── Mode Switching ── */
let activeMode = "sport"; // Declared ONCE here!

document.getElementById("modeGuide").addEventListener("click", () => setMode("guide"));
document.getElementById("modeSport").addEventListener("click", () => setMode("sport"));
document.getElementById("modeGarden").addEventListener("click", () => setMode("garden"));
document.getElementById("modeCombine").addEventListener("click", () => setMode("combine"));
document.getElementById("modeData").addEventListener("click", () => setMode("data"));
document.getElementById("modeAnalysis").addEventListener("click", () => setMode("analysis"));
document.getElementById("btn-guide-start").addEventListener("click", () => setMode("sport"));

function setMode(mode) {
  const isGarden = mode === "garden";
  const isSport = mode === "sport";
  const isCombine = mode === "combine";
  const isData = mode === "data";
  const isAnalysis = mode === "analysis";
  const isGuide = mode === "guide";

  if (isGarden) updateActivityBarForMode("garden");
  else if (isSport) buildActivityBar();

  // Warm accent for Sport (energetic court sports), green for Garden
  // (nature) — see the html[data-app-mode] rules in style.css. Combine/Data/
  // Analysis don't match either selector, so they fall through to the
  // neutral default accent unchanged.
  document.documentElement.dataset.appMode = mode;

  // Combine, Data, Analysis, and Guide have no per-sport icon rail; Combine
  // also has no use for the sidebar (its panel content lives beside the
  // roof in .canvas-area instead), so collapse it there and give that space
  // to the canvas instead of leaving it empty. Data, Analysis, and Guide
  // keep the sidebar visible/hidden per their own minimal needs.
  document.getElementById("activity-bar").style.display = (isCombine || isData || isAnalysis || isGuide) ? "none" : "flex";
  document.querySelector(".panel").style.display = (isCombine || isGuide) ? "none" : "flex";

  document.getElementById("sportConfigurator").style.display = isSport ? "block" : "none";
  document.getElementById("gardenConfigurator").style.display = isGarden ? "block" : "none";
  // combineConfigurator is itself a flex row (roof pane + step pane) now,
  // so it needs "flex" rather than "block" to lay its children out
  // correctly whenever it's re-shown.
  document.getElementById("combineConfigurator").style.display = isCombine ? "flex" : "none";
  document.getElementById("dataConfigurator").style.display = isData ? "block" : "none";
  document.getElementById("analysisConfigurator").style.display = isAnalysis ? "block" : "none";

  document.getElementById("field").style.display = isSport ? "block" : "none";
  document.getElementById("garden-field").style.display = isGarden ? "block" : "none";
  // #combine-canvas is nested inside #combineConfigurator now, so toggling
  // that parent already shows/hides it — no separate toggle needed here.
  document.getElementById("data-content").style.display = isData ? "block" : "none";
  document.getElementById("analysis-content").style.display = isAnalysis ? "block" : "none";
  document.getElementById("guide-content").style.display = isGuide ? "block" : "none";

  document.getElementById("modeGuide").classList.toggle("active", isGuide);
  document.getElementById("modeSport").classList.toggle("active", isSport);
  document.getElementById("modeGarden").classList.toggle("active", isGarden);
  document.getElementById("modeCombine").classList.toggle("active", isCombine);
  document.getElementById("modeData").classList.toggle("active", isData);
  document.getElementById("modeAnalysis").classList.toggle("active", isAnalysis);

  // Explicit branch per mode — a bare `else` here previously meant "anything
  // that isn't garden/sport" silently ran updateCombineUI(), which broke the
  // instant a 4th mode existed. Guide is static markup — nothing to update.
  if (isGarden) updateGardenUI();
  else if (isSport) updateUI();
  else if (isCombine) updateCombineUI();
  else if (isData && typeof updateDataUI === "function") updateDataUI();
  else if (isAnalysis && typeof updateAnalysisUI === "function") updateAnalysisUI();

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

function setRole(role) {
  document.documentElement.dataset.role = role;
  document.getElementById("rolePlanner").classList.toggle("active", role === "planner");
  document.getElementById("roleClient").classList.toggle("active", role === "client");
  applyRoleLabels(role);
  document.querySelectorAll(".rule-input").forEach(el => { el.disabled = role !== "planner"; });
  if (activeMode === "combine" && typeof drawCombineCanvas === "function") drawCombineCanvas();
  showToast(
    role === "client" ? "Client mode" : "Planner mode",
    role === "client"
      ? "Pick your sports, garden style, and entrances — the rules handle the rest."
      : "Full manual control unlocked — fine-tune placement and design rules."
  );
}
document.getElementById("rolePlanner").addEventListener("click", () => setRole("planner"));
document.getElementById("roleClient").addEventListener("click", () => setRole("client"));

function showToast(title, message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${message}</div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ── Init ── */
// Sync the toggle button's icon/title to whatever theme the head script
// already applied — activeMode is still "guide"'s eventual value at this
// point, so this only updates the button, no SVG redraw happens yet.
applyTheme(document.documentElement.dataset.mode);
buildActivityBar();
siteState.date = typeof todayIsoDate === "function" ? todayIsoDate() : siteState.date;
document.getElementById("siteDate").value = siteState.date;
setMode("guide");
if(typeof initCombineInteractions === "function") initCombineInteractions();
if(typeof updateSiteUI === "function") updateSiteUI();
startRevitPolling();
