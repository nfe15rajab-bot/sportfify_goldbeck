/**
 * sessionGate.js — First-run session gate
 * A blocking full-screen overlay, visible by default in the HTML, that
 * asks "load a session or start a new one" before anything else — then
 * redirects to Sport mode either way. Reuses combineController.js's
 * existing save/load machinery (applySessionSnapshot, the AUTOSAVE_KEY
 * localStorage entry) rather than inventing a second load path: "Load a
 * Session" resumes the autosave in one click when one exists (the same
 * data restoreAutosaveIfAny() used to restore silently on every page
 * load — main.js no longer calls that automatically, this gate is now
 * the single place that decides), with a fallback link to pick a
 * specific exported .json file instead. Independent of every other
 * controller file — wires its own elements at top level, same convention
 * as sportController.js/gardenController.js.
 */

const sessionGateEl = document.getElementById("sessionGate");
const gateLoadBtn = document.getElementById("btn-gate-load");
const gateLoadLabel = document.getElementById("btn-gate-load-label");
const gateNewBtn = document.getElementById("btn-gate-new");
const gateFileLink = document.getElementById("btn-gate-load-file");
const gateFileInput = document.getElementById("gate-load-file");
const gateStatusEl = document.getElementById("sessionGateStatus");

let gateAutosave = null;
try {
  const raw = localStorage.getItem("sportify-autosave");
  if (raw) gateAutosave = JSON.parse(raw);
} catch (e) { /* corrupt or inaccessible (private mode) — treat as no autosave */ }

const gatePieceCount = gateAutosave && Array.isArray(gateAutosave.placements) ? gateAutosave.placements.length : 0;
if (gatePieceCount > 0) {
  gateLoadLabel.textContent = `Resume Last Session (${gatePieceCount} piece${gatePieceCount === 1 ? "" : "s"})`;
  gateFileLink.style.display = "inline";
}

function leaveSessionGate() {
  sessionGateEl.classList.add("session-gate-hidden");
  setTimeout(() => { sessionGateEl.style.display = "none"; }, 250);
  setMode("sport");
}

function loadGateFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      applySessionSnapshot(JSON.parse(evt.target.result));
      showToast("Session loaded", `${combineState.items.length} piece(s) restored.`);
      leaveSessionGate();
    } catch (err) {
      gateStatusEl.textContent = `Load failed: ${err.message}`;
    }
  };
  reader.readAsText(file);
}

gateLoadBtn.addEventListener("click", () => {
  if (gatePieceCount > 0) {
    try {
      applySessionSnapshot(gateAutosave);
      if (typeof lastAutosaveJson !== "undefined") lastAutosaveJson = localStorage.getItem("sportify-autosave");
      showToast("Welcome back", `Restored your last session (${combineState.items.length} piece(s)). Clear All to start fresh instead.`);
      leaveSessionGate();
    } catch (err) {
      gateStatusEl.textContent = `Couldn't resume last session: ${err.message}`;
    }
  } else {
    gateFileInput.click();
  }
});

gateFileLink.addEventListener("click", () => gateFileInput.click());

gateFileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) loadGateFile(file);
  e.target.value = "";
});

gateNewBtn.addEventListener("click", leaveSessionGate);
