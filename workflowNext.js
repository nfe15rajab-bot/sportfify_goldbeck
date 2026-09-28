/**
 * workflowNext.js — a "Next" step through the app's own design workflow: Site, Structure inputs, Site conditions,
 * Sport, Garden, Combine, Results, Compare, Catalogue, Revit families, in that order (the same order the
 * mode rail lists them in). Not the tabs that frame the app rather than being a step of designing a roof (Overview,
 * Documents, Save Session, Profile) — those get no "Next", and are not a step something else leads to either.
 *
 * One button, fixed on the page rather than built into each tab's own (very different) markup — Site/Structure/
 * Conditions/Sport/Garden/Data/Analysis/Compare share one <aside class="panel">, but Combine and Revit
 * families are laid out completely differently, so a button living inside any one tab's own HTML could not appear
 * consistently in all of them. setMode() (main.js) calls workflowNextUpdate(mode) as the last thing it does, so the
 * button always reflects whatever is actually on screen, including a mode a link jumped straight to.
 */

const WORKFLOW_ORDER = ["site", "structure", "conditions", "roofAccess", "sport", "facilities", "combine", "analysis", "compare", "data", "families"];

/** The next workflow step after `mode` that the person's profile view actually shows (profileModeVisible — the same rule the tabs themselves follow), or null at the end of the chain, or off it entirely. */
function workflowNextMode(mode) {
  const i = WORKFLOW_ORDER.indexOf(mode);
  if (i < 0) return null;
  const profile = typeof profileState !== "undefined" && profileState ? profileState.profile : null;
  const view = (profile && profile.view) || "advanced";
  const extras = profile ? profile.extras : [];
  for (let j = i + 1; j < WORKFLOW_ORDER.length; j++) {
    const next = WORKFLOW_ORDER[j];
    if (typeof profileModeVisible !== "function" || profileModeVisible(view, next, extras)) return next;
  }
  return null;
}

/** Shows/hides/labels the one "Next" button for whatever mode is now on screen; called from setMode()'s own end. */
function workflowNextUpdate(mode) {
  const btn = document.getElementById("workflowNextBtn");
  const labelEl = document.getElementById("workflowNextLabel");
  if (btn && labelEl) {
    const next = workflowNextMode(mode);
    if (!next) btn.hidden = true;
    else {
      const info = typeof PROFILE_MODES !== "undefined" && PROFILE_MODES[next];
      labelEl.textContent = "Next: " + (info ? info.label : next);
      btn.hidden = false;
    }
  }
  workflowShortcutsUpdate(mode);
}

document.getElementById("workflowNextBtn")?.addEventListener("click", () => {
  const next = typeof activeMode !== "undefined" ? workflowNextMode(activeMode) : null;
  if (next && typeof setMode === "function") setMode(next);
});

/**
 * "Sync with Revit" (applies the algorithm's preview to the board — Apply to Combine's own button — the step
 * before a layout can be sent on to Revit; shown in Combine regardless of which of Manual/Algorithmic placement
 * is open right now, so switching between them never hides the shortcut) and "Save for Compare" (anywhere in
 * Combine) beside the main Next button: real shortcuts, not a second copy of what each does — each just clicks
 * its real button in the Design panel, so there is exactly one place that ever needs to change.
 */
function workflowShortcutsUpdate(mode) {
  const applyBtn = document.getElementById("workflowApplyBtn");
  const saveBtn = document.getElementById("workflowSaveCompareBtn");
  const inCombine = (mode || (typeof activeMode !== "undefined" ? activeMode : null)) === "combine";
  if (applyBtn) applyBtn.hidden = !inCombine;
  if (saveBtn) saveBtn.hidden = !(inCombine && document.getElementById("btn-save-compare"));
}

document.getElementById("workflowApplyBtn")?.addEventListener("click", () => document.getElementById("algo-apply")?.click());
document.getElementById("workflowSaveCompareBtn")?.addEventListener("click", () => document.getElementById("btn-save-compare")?.click());
