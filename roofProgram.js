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
  if (!combineState.roof.program) openRoofProgramPrompt(detail);
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
      <button type="button" class="session-gate-link" data-roof-later>Decide later</button>
    </div>`;
  document.body.appendChild(el);
  const first = el.querySelector("[data-roof-program]");
  if (first) first.focus();
}

document.addEventListener("click", e => {
  const pick = e.target.closest("[data-roof-program]");
  if (pick) { setRoofProgram(pick.dataset.roofProgram); return; }
  if (e.target.closest("[data-roof-later]")) { closeRoofProgramPrompt(); return; }
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

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("roof-program-prompt")) closeRoofProgramPrompt();
});

// typing a size is defining the roof by hand: the outline from Revit no longer applies
["roofLength", "roofWidth"].forEach(id => {
  const inp = document.getElementById(id);
  if (inp) inp.addEventListener("input", () => { combineState.roof.source = "manual"; roofSetupView = "manual"; });
});

updateRoofSetupUI();
