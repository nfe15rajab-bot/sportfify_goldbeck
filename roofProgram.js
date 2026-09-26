/**
 * roofProgram.js — how the roof is defined, and what it is for.
 *
 * The Site tab asks two things, in this order:
 *   1. How is the roof defined?  Its footprint comes from Revit (pushed live from the add-in, or an exported file), or it is typed in as length × breadth.
 *   2. What is the roof?         Sports Core, Garden Core or Mixed.
 *
 * The answer to (2) lives in combineState.roof.program and is saved with a session (roof_context.program); how the footprint arrived is in
 * combineState.roof.source ("revit" | "manual"). Once a footprint arrives and the roof has no type yet, a dialog asks for one.
 *
 * ROOF_PROGRAMS[key].rules is where the rules of each segment go.
 */

const ROOF_PROGRAMS = {
  sports: { label: "Sports Core", icon: "ti-ball-basketball", blurb: "Sport is the main use. Courts and activities lead the roof; garden takes what is left.", rules: {} },
  garden: { label: "Garden Core", icon: "ti-leaf", blurb: "Garden is the main use. Planting and green-roof zones lead; sport takes a smaller share.", rules: {} },
  mixed: { label: "Mixed", icon: "ti-layout-grid", blurb: "Sport and garden share the roof as equals.", rules: {} }
};

/** Which way of defining the roof the Site tab is showing: "revit" or "manual". Follows where the footprint last came from. */
let roofSetupView = "manual";

const roofEsc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The chosen roof type as { key, label, icon, blurb, rules }, or null while the roof has none. */
function getRoofProgram() {
  const key = combineState.roof.program;
  return key && ROOF_PROGRAMS[key] ? Object.assign({ key }, ROOF_PROGRAMS[key]) : null;
}

function roofProgramCardsHtml(selectedKey) {
  return Object.entries(ROOF_PROGRAMS).map(([key, p]) => `<button type="button" class="roof-program-card${key === selectedKey ? " active" : ""}" data-roof-program="${key}" aria-pressed="${key === selectedKey}">
      <i class="ti ${p.icon}" aria-hidden="true"></i>
      <span class="roof-program-name">${roofEsc(p.label)}</span>
      <span class="roof-program-blurb">${roofEsc(p.blurb)}</span>
    </button>`).join("");
}

/** Brings the Site tab (and the Algorithmic placement note) in line with the roof state. */
function updateRoofSetupUI() {
  const roof = combineState.roof;
  document.querySelectorAll("[data-roof-source]").forEach(b => {
    const on = b.dataset.roofSource === roofSetupView;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const revitBox = document.getElementById("roof-src-revit"), manualBox = document.getElementById("roof-src-manual");
  if (revitBox) revitBox.hidden = roofSetupView !== "revit";
  if (manualBox) manualBox.hidden = roofSetupView !== "manual";
  const cards = document.getElementById("roof-program-cards");
  if (cards) cards.innerHTML = roofProgramCardsHtml(roof.program);
  const status = document.getElementById("roof-program-status");
  if (status) {
    const p = getRoofProgram();
    status.className = "hint" + (p ? "" : " roof-program-pending");
    status.textContent = p ? `${p.label}. You can change it at any time.` : "Not chosen yet. Pick one: it decides which rules apply to this roof.";
  }
  if (typeof algoRefreshSiteNote === "function") algoRefreshSiteNote();
  if (typeof algoApplyRoofType === "function") algoApplyRoofType();
}

/**
 * The guided tour opens Combine only to point at it. The question "What is this roof?" must not come up in the middle of it: it would sit under the tour's dimmed screen, which
 * cannot be clicked, and the tour could go neither on nor off. So while the tour runs the question waits: when it is Combine being opened it is simply asked the next time the
 * person opens Combine for real; when it is a roof that arrived (from Revit, or typed in) it is asked as soon as the tour ends (roofProgramAfterTour).
 */
let roofPromptWaiting = null;
let roofPromptDetail = "";      // what the question that is on screen was told (the size that arrived), for asking it again

/** Is the guided tour running (tour.js)? */
function roofTourRunning() {
  try { return tourState.active === true; } catch (_) { return false; }      // tour.js not loaded (yet): no tour
}

/** The roof type must be known once Combine opens: ask for it unless the session already has one (or the tour is only passing through). */
function roofProgramOnCombineOpen() {
  if (roofTourRunning()) return;
  if (!combineState.roof.program && !document.getElementById("roof-program-prompt")) openRoofProgramPrompt("");
}

/**
 * Called by the tour as it starts: a question already on screen (the quiz's "Apply and show me around" can land in Combine, which asks it) steps aside and is asked again when the
 * tour ends. Only the first question of a roof: changing a type that is already set is something the person is doing, and the tour cannot start over it.
 */
function roofProgramOnTourStart() {
  if (combineState.roof.program || !document.getElementById("roof-program-prompt")) return;
  closeRoofProgramPrompt();
  roofPromptWaiting = { detail: roofPromptDetail };
}

/** Called by the tour when it ends: a question that had to wait for it is asked now, unless the roof has a type by then. */
function roofProgramAfterTour() {
  const waiting = roofPromptWaiting;
  roofPromptWaiting = null;
  if (waiting && !combineState.roof.program && !document.getElementById("roof-program-prompt")) openRoofProgramPrompt(waiting.detail);
}

function setRoofProgram(key) {
  if (!ROOF_PROGRAMS[key]) return;
  combineState.roof.program = key;
  closeRoofProgramPrompt();
  updateRoofSetupUI();
  if (typeof showToast === "function") showToast("Roof type set", `${roofEsc(ROOF_PROGRAMS[key].label)}. It is saved with the session.`);
}

/** A footprint has arrived ("revit": pushed or imported) or been confirmed ("manual"): remember where it came from, and ask for the roof type if it has none yet. */
function roofProgramOnFootprint(source, detail) {
  combineState.roof.source = source;
  roofSetupView = source;
  updateRoofSetupUI();
  if (combineState.roof.program) return;
  if (roofTourRunning()) roofPromptWaiting = { detail };
  else openRoofProgramPrompt(detail);
}

/** After a session was loaded: show its way of defining the roof and its type (no dialog: an older session may simply have none). */
function roofProgramLoaded() {
  roofSetupView = combineState.roof.source === "revit" ? "revit" : "manual";
  closeRoofProgramPrompt();
  updateRoofSetupUI();
}

function closeRoofProgramPrompt() {
  const el = document.getElementById("roof-program-prompt");
  if (el) el.remove();
}

function openRoofProgramPrompt(detail) {
  closeRoofProgramPrompt();
  roofPromptDetail = detail || "";
  const el = document.createElement("div");
  el.className = "session-gate roof-prompt";
  el.id = "roof-program-prompt";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "roof-prompt-title");
  el.innerHTML = `<div class="session-gate-card roof-prompt-card">
      <div class="session-gate-icon"><i class="ti ti-building-community" aria-hidden="true"></i></div>
      <h1 id="roof-prompt-title">What is this roof?</h1>
      <p class="hint">${detail ? roofEsc(detail) + ". " : ""}Tell Sportify what the roof is for: the rules that apply depend on it.</p>
      <div class="roof-program-cards">${roofProgramCardsHtml(combineState.roof.program)}</div>
    </div>`;
  document.body.appendChild(el);
  const first = el.querySelector("[data-roof-program]");
  if (first) first.focus();
}

document.addEventListener("click", e => {
  const pick = e.target.closest("[data-roof-program]");
  if (pick) { setRoofProgram(pick.dataset.roofProgram); return; }
  const src = e.target.closest("[data-roof-source]");
  if (src) { roofSetupView = src.dataset.roofSource; updateRoofSetupUI(); return; }
  if (e.target.closest("#btn-roof-manual-confirm")) {
    const r = combineState.roof;
    roofProgramOnFootprint("manual", `${r.length} × ${r.width} m`);
    if (combineState.roof.program && typeof showToast === "function") showToast("Roof size set", `${r.length} m × ${r.width} m.`);
    return;
  }
  if (e.target.closest("[data-roof-type-open]")) openRoofProgramPrompt("");
});

// Escape closes the dialog only while changing an existing type: with no type yet, one must be chosen
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && combineState.roof.program && document.getElementById("roof-program-prompt")) closeRoofProgramPrompt();
});

// typing a size is defining the roof by hand: the outline from Revit no longer applies
["roofLength", "roofWidth"].forEach(id => {
  const inp = document.getElementById(id);
  if (inp) inp.addEventListener("input", () => { combineState.roof.source = "manual"; roofSetupView = "manual"; });
});

updateRoofSetupUI();
