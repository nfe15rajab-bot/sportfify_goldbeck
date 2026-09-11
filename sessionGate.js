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
const gateCardEl = document.querySelector(".session-gate-card");
const gateLoadBtn = document.getElementById("btn-gate-load");
const gateLoadLabel = document.getElementById("btn-gate-load-label");
const gateNewBtn = document.getElementById("btn-gate-new");
const gateFileLink = document.getElementById("btn-gate-load-file");
const gateFileInput = document.getElementById("gate-load-file");
const gateStatusEl = document.getElementById("sessionGateStatus");
const gateMainActionsEl = document.getElementById("sessionGateMainActions");
const gatePresetsBtn = document.getElementById("btn-gate-presets");
const gatePresetsEl = document.getElementById("sessionGatePresets");
const gatePresetsBackBtn = document.getElementById("btn-gate-presets-back");
const presetCardsEl = document.getElementById("presetCards");

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
  setMode("guide"); // Overview — same landing mode as a fresh page load
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

/**
 * ── Goldbeck IFC roof prebuilt sessions ──
 * Reads GOLDBECK_PREBUILT_SESSIONS (prebuiltSessions.js) and renders one
 * clickable card per pattern. Each pattern is a generate() function, not a
 * fixed payload — generated once (lazily, the first time the picker opens)
 * and cached here in goldbeckGeneratedPayloads so the card shows stable
 * numbers until the user explicitly shuffles it. The shuffle icon
 * regenerates just that one card (fresh boundary depth + item variety,
 * re-validated against the app's own real engine inside generate() itself)
 * without touching the others. Loading a card goes through the exact same
 * applySessionSnapshot() path as any other load, plus a preset id so
 * compareController.js can show Compare results for this roof instead of
 * its generic demo — it's a normal, fully editable session from that point
 * on, "Save Session" just writes a local copy like it always does.
 */
const goldbeckGeneratedPayloads = {};

function ensureGoldbeckGenerated(id) {
  if (!goldbeckGeneratedPayloads[id]) {
    goldbeckGeneratedPayloads[id] = GOLDBECK_PREBUILT_SESSIONS[id].generate();
  }
  return goldbeckGeneratedPayloads[id];
}

function presetStatsLine(payload) {
  const sportCount = payload.placements.filter(pl => pl.category === "field" || pl.category === "activity").length;
  const gardenCount = payload.placements.filter(pl => pl.category === "garden").length;
  return `${sportCount} sport piece${sportCount === 1 ? "" : "s"} · ${gardenCount} garden piece${gardenCount === 1 ? "" : "s"} · ${payload.entry_points.length} entrances`;
}

function presetCardHtml(preset) {
  const payload = ensureGoldbeckGenerated(preset.id);
  return `
    <button class="preset-card" data-preset-id="${preset.id}">
      <div class="preset-card-title">
        <i class="ti ti-layout-grid" aria-hidden="true"></i>${preset.title}
        <span class="preset-card-shuffle" data-shuffle-id="${preset.id}" title="Shuffle this variant"><i class="ti ti-dice-5" aria-hidden="true"></i></span>
      </div>
      <div class="preset-card-tagline">${preset.tagline}</div>
      <div class="preset-card-stats" id="preset-stats-${preset.id}">${presetStatsLine(payload)}</div>
    </button>`;
}

if (typeof GOLDBECK_PREBUILT_SESSIONS === "object" && presetCardsEl) {
  presetCardsEl.innerHTML = Object.values(GOLDBECK_PREBUILT_SESSIONS).map(presetCardHtml).join("");
}

// .style.display, not the hidden attribute — .session-gate-actions'
// own `display:flex` rule has equal CSS specificity to a plain [hidden]
// selector and, as an author rule, always wins over that browser default,
// so `.hidden = true` alone silently has no visual effect here.
gatePresetsBtn?.addEventListener("click", () => {
  gateMainActionsEl.style.display = "none";
  gatePresetsEl.style.display = "block";
  gateCardEl.classList.add("session-gate-wide");
});
gatePresetsBackBtn?.addEventListener("click", () => {
  gatePresetsEl.style.display = "none";
  gateMainActionsEl.style.display = "flex";
  gateCardEl.classList.remove("session-gate-wide");
});

presetCardsEl?.addEventListener("click", e => {
  const shuffleBtn = e.target.closest(".preset-card-shuffle");
  if (shuffleBtn) {
    const id = shuffleBtn.dataset.shuffleId;
    goldbeckGeneratedPayloads[id] = GOLDBECK_PREBUILT_SESSIONS[id].generate();
    const statsEl = document.getElementById(`preset-stats-${id}`);
    if (statsEl) statsEl.textContent = presetStatsLine(goldbeckGeneratedPayloads[id]);
    return; // don't also trigger the card's own load-on-click below
  }

  const card = e.target.closest(".preset-card");
  if (!card) return;
  const preset = GOLDBECK_PREBUILT_SESSIONS[card.dataset.presetId];
  if (!preset) return;
  try {
    const payload = ensureGoldbeckGenerated(preset.id);
    applySessionSnapshot(payload, { goldbeckPresetId: preset.id });
    showToast(preset.title, `Loaded ${payload.placements.length} piece(s) on the Goldbeck roof. Fully editable — save a copy anytime.`);
    leaveSessionGate();
  } catch (err) {
    gateStatusEl.textContent = `Couldn't load that preset: ${err.message}`;
  }
});
