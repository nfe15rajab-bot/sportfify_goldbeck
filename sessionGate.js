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

// ── Landing: logo, sample video, feature preview, New to Sportify / I've used Sportify before ──
const gateNextBtn = document.getElementById("btn-gate-next");
const gateSplitBackBtn = document.getElementById("btn-gate-split-back");
const gateOnboardBtn = document.getElementById("btn-gate-onboard");
const gateReturningBtn = document.getElementById("btn-gate-returning");
const gateReturningBackBtn = document.getElementById("btn-gate-returning-back");
const landingPreviewStepEl = document.getElementById("landingPreviewStep");
const landingSplitEl = document.getElementById("landingSplit");
const landingCarouselImgEl = document.getElementById("landingCarouselImg");
const landingCarouselCaptionEl = document.getElementById("landingCarouselCaption");
const landingCarouselToggleBtn = document.getElementById("btn-landing-carousel-toggle");
// Declared here (not beside the rest of the carousel wiring below) because showPreviewStep — defined next, and called
// as soon as gateHasHistory() is checked, before the carousel block runs — already needs to read them.
const gatePrefersReducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LANDING_SLIDES = [
  { src: "samples/landing-shot-combine.jpg", caption: "Several courts placed and priced on a real roof, in Combine." },
  { src: "samples/landing-shot-results.jpg", caption: "One card per analysis — Revit's full run, or this app's quick estimate." },
  { src: "samples/landing-shot-safety.jpg", caption: "Fire safety and accessibility, checked against real reference numbers." },
];
const LANDING_SLIDE_MS = 3500;
let landingSlideIndex = 0;
let landingSlideTimer = null;

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

/**
 * Whether this browser has been through Sportify before: an autosave to resume, or a profile that has already been
 * set up (by the quiz or by hand). Decides which of the landing's three steps opens by default — the marketing
 * preview for a genuinely first visit, straight to the practical choices otherwise — without asking either time:
 * someone who wants the other one is one click away ("Back", at every step).
 *
 * The three steps, in order: 1 preview (logo, a looping slideshow of real analysis screens, what Sportify does — ends in "Next"), 2 the split
 * (New to Sportify / I've used it before), 3 the practical actions (Resume/Start new/Preset). A history browser
 * skips straight to 3; reopenSessionGate() (mid-session) does too, for the same reason.
 */
function gateHasHistory() {
  return gatePieceCount > 0 || (typeof profileState !== "undefined" && !!profileState.profile && !!profileState.profile.onboarded);
}

// gatePresetsBtn (below) sets gateMainActionsEl.style.display directly (an inline style, which would otherwise beat
// the plain `hidden` property forever after — an inline style always wins over both the [hidden] rule and the
// .session-gate-actions class rule, whichever was set last): every step change clears it first, so `.hidden` alone
// keeps deciding this element's visibility, same as landingPreviewStepEl/landingSplitEl.
function gateShowMainActions(show) {
  gateMainActionsEl.style.display = "";
  gateMainActionsEl.hidden = !show;
}
function showPreviewStep() {
  landingPreviewStepEl.hidden = false;
  landingSplitEl.hidden = true;
  gateShowMainActions(false);
  gateCardEl.classList.add("session-gate-landing");
  if (!gatePrefersReducedMotion) landingCarouselStart();
}
function showSplitStep() {
  landingPreviewStepEl.hidden = true;
  landingSplitEl.hidden = false;
  gateShowMainActions(false);
  gateCardEl.classList.add("session-gate-landing");
  landingCarouselStop();
}
/** The returning-user's practical actions (Resume/Start new/Preset) — the slideshow stops rather than keep advancing off-screen. */
function showReturningActions() {
  landingPreviewStepEl.hidden = true;
  landingSplitEl.hidden = true;
  gateShowMainActions(true);
  gateCardEl.classList.remove("session-gate-landing");
  landingCarouselStop();
}
if (gateHasHistory()) showReturningActions(); else showPreviewStep();

gateNextBtn?.addEventListener("click", showSplitStep);
gateSplitBackBtn?.addEventListener("click", showPreviewStep);
gateOnboardBtn?.addEventListener("click", () => {
  leaveSessionGate();
  // an explicit ask, unlike gateNewBtn's automatic offer below: opens even for someone the quiz has already met
  setTimeout(() => { if (typeof quizOpen === "function") quizOpen(null); }, 300);
});
gateReturningBtn?.addEventListener("click", showReturningActions);
gateReturningBackBtn?.addEventListener("click", showSplitStep);      // back from the actions goes to the split, one step, not all the way to the preview

// The landing slideshow: real screenshots of this app's own analysis records (not a stand-in), crossfading in a
// loop — a glance at what a finished layout and its results look like, not a video to watch start to finish.
// Respects prefers-reduced-motion (stopped, with the toggle still there to start it on request, gatePrefersReducedMotion
// above): the toggle button is the fallback either way.
function landingShowSlide(i) {
  const slide = LANDING_SLIDES[i];
  if (!landingCarouselImgEl || !slide) return;
  landingCarouselImgEl.style.opacity = "0";
  setTimeout(() => {
    landingCarouselImgEl.src = slide.src;
    if (landingCarouselCaptionEl) landingCarouselCaptionEl.textContent = slide.caption;
    landingCarouselImgEl.style.opacity = "1";
  }, 220);
}
function landingSlideNext() {
  landingSlideIndex = (landingSlideIndex + 1) % LANDING_SLIDES.length;
  landingShowSlide(landingSlideIndex);
}
/** Idempotent (checked from both showPreviewStep, on every "Back", and the toggle button) — never stacks a second interval. */
function landingCarouselStart() {
  if (landingSlideTimer || !landingCarouselImgEl) return;
  landingSlideTimer = setInterval(landingSlideNext, LANDING_SLIDE_MS);
}
function landingCarouselStop() {
  clearInterval(landingSlideTimer);
  landingSlideTimer = null;
}
function gateSetCarouselToggleIcon(playing) {
  if (!landingCarouselToggleBtn) return;
  landingCarouselToggleBtn.innerHTML = playing ? '<i class="ti ti-player-pause-filled" aria-hidden="true"></i>' : '<i class="ti ti-player-play-filled" aria-hidden="true"></i>';
  const label = playing ? "Pause the slideshow" : "Play the slideshow";
  landingCarouselToggleBtn.title = label;
  landingCarouselToggleBtn.setAttribute("aria-label", label);
}
if (landingCarouselImgEl) {
  landingShowSlide(0);
  if (gatePrefersReducedMotion) gateSetCarouselToggleIcon(false);
  else { landingCarouselStart(); gateSetCarouselToggleIcon(true); }
  landingCarouselToggleBtn?.addEventListener("click", () => {
    if (landingSlideTimer) { landingCarouselStop(); gateSetCarouselToggleIcon(false); }
    else { landingCarouselStart(); landingSlideNext(); gateSetCarouselToggleIcon(true); }
  });
}

// ── Link a Revit file: two ways, a toggle between them ──
// "Browse" remembers a picked .rvt file's NAME only (and its size) as a label for this workspace — no browser gives
// a page the file's real location, in any of them, for the same reason a page cannot silently read your disk.
// "Pick the newest export" is the web side of what Import Configuration does in Revit: the newest
// sportify_combined_revit*.json the add-in's Layouts folder has, loaded the same way any other session file is.
const gateRevitModeBrowseBtn = document.getElementById("btn-gate-revit-mode-browse");
const gateRevitModeNewestBtn = document.getElementById("btn-gate-revit-mode-newest");
const gateRevitBrowseModeEl = document.getElementById("gateRevitBrowseMode");
const gateRevitNewestModeEl = document.getElementById("gateRevitNewestMode");
const gateLinkRevitBtn = document.getElementById("btn-gate-link-revit");
const gateRevitFileInput = document.getElementById("gate-revit-file");
const gateRevitLinkStatusEl = document.getElementById("sessionGateRevitLinkStatus");
const gateLoadNewestExportBtn = document.getElementById("btn-gate-load-newest-export");
const gateNewestExportStatusEl = document.getElementById("sessionGateNewestExportStatus");
const REVIT_LINK_KEY = "sportify-linked-revit-file";

function gateSetRevitMode(mode) {
  const browse = mode === "browse";
  gateRevitModeBrowseBtn.classList.toggle("active", browse);
  gateRevitModeBrowseBtn.setAttribute("aria-selected", String(browse));
  gateRevitModeNewestBtn.classList.toggle("active", !browse);
  gateRevitModeNewestBtn.setAttribute("aria-selected", String(!browse));
  gateRevitBrowseModeEl.hidden = !browse;
  gateRevitNewestModeEl.hidden = browse;
}
gateRevitModeBrowseBtn?.addEventListener("click", () => gateSetRevitMode("browse"));
gateRevitModeNewestBtn?.addEventListener("click", () => gateSetRevitMode("newest"));

/** The file linked last time, from localStorage: { name, size, linkedAt }, or null. */
function gateLinkedRevitFile() {
  try {
    const raw = localStorage.getItem(REVIT_LINK_KEY);
    const link = raw ? JSON.parse(raw) : null;
    return link && typeof link.name === "string" ? link : null;
  } catch (e) { return null; }
}
function gateRefreshRevitLinkStatus() {
  const link = gateLinkedRevitFile();
  if (link) {
    const mb = Number(link.size) > 0 ? ` (${(link.size / 1048576).toFixed(1)} MB)` : "";
    gateRevitLinkStatusEl.textContent = `Linked: ${link.name}${mb} — remembered by name only; browsers never give a page a file's real location.`;
    gateRevitLinkStatusEl.hidden = false;
    gateLinkRevitBtn.innerHTML = '<i class="ti ti-link" aria-hidden="true"></i> Change the linked Revit file';
  } else {
    gateRevitLinkStatusEl.hidden = true;
    gateLinkRevitBtn.innerHTML = '<i class="ti ti-link" aria-hidden="true"></i> Link a Revit file';
  }
}
gateRefreshRevitLinkStatus();

gateLinkRevitBtn?.addEventListener("click", () => gateRevitFileInput.click());
gateRevitFileInput?.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    try { localStorage.setItem(REVIT_LINK_KEY, JSON.stringify({ name: file.name, size: file.size, linkedAt: new Date().toISOString() })); }
    catch (err) { /* private window or storage full: the picker still worked, just nothing is remembered for next time */ }
    gateRefreshRevitLinkStatus();
  }
  e.target.value = "";
});

/** Newest sportify_combined_revit*.json in the add-in's Layouts folder (GET /deliverables), or null with why not. */
async function gateNewestExport() {
  const list = await localApi("/deliverables");
  if (!list.ok) return { file: null, reason: "Revit not open: open a project in Revit with the Sportify add-in loaded, then try again." };
  const layouts = ((list.json && list.json.files) || []).filter(f => f.kind === "layouts" && /^sportify_combined_revit.*\.json$/i.test(f.name));
  if (layouts.length === 0) return { file: null, reason: "No export in the Layouts folder yet — use Export Combined JSON in Revit first." };
  layouts.sort((a, b) => new Date(b.modified_utc) - new Date(a.modified_utc));
  return { file: layouts[0], reason: "" };
}
gateLoadNewestExportBtn?.addEventListener("click", async () => {
  gateNewestExportStatusEl.textContent = "Looking for the newest export…";
  const { file, reason } = await gateNewestExport();
  if (!file) { gateNewestExportStatusEl.textContent = reason; return; }
  const got = await localApi(file.url);
  if (!got.ok || !got.json) { gateNewestExportStatusEl.textContent = `Couldn't read ${file.name}: ${got.error || "not a valid session"}.`; return; }
  try {
    applySessionSnapshot(got.json);
    showToast("Session loaded", `${file.name} (${combineState.items.length} piece(s) restored).`);
    leaveSessionGate();
  } catch (err) {
    gateNewestExportStatusEl.textContent = `Load failed: ${err.message}`;
  }
});

function leaveSessionGate() {
  sessionGateEl.classList.add("session-gate-hidden");
  setTimeout(() => { sessionGateEl.style.display = "none"; }, 250);
  // Where the person's answers say to start (the quiz: Site, Combine, Results or Documents), else the Overview — same as a fresh page load
  setMode(typeof profileLandingMode === "function" ? profileLandingMode() : "guide");
}

/**
 * "New Session" in the top bar (next to Save Session): brings the same first-run picker back — Resume/Start New/Load a
 * preset/Load a file — so leaving the current work is a choice made there, not something this button does by itself.
 */
function reopenSessionGate() {
  showReturningActions();      // already using Sportify right now, so straight to the practical choices — not the first-run marketing preview
  sessionGateEl.style.display = "flex";
  sessionGateEl.getBoundingClientRect(); // force layout so the class change below transitions in rather than snapping
  sessionGateEl.classList.remove("session-gate-hidden");
}
document.getElementById("btn-new-session").addEventListener("click", reopenSessionGate);

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

gateNewBtn.addEventListener("click", () => {
  leaveSessionGate();
  // a person who starts a new session and has never met the quiz is offered it now (quiz.js decides: never twice, never for someone who has set their profile by hand)
  if (typeof quizMaybeOpen === "function") setTimeout(quizMaybeOpen, 300);
});

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
    <button class="preset-card" data-preset-id="${escapeHtml(preset.id)}">
      <div class="preset-card-title">
        <i class="ti ti-layout-grid" aria-hidden="true"></i>${escapeHtml(preset.title)}
        <span class="preset-card-shuffle" data-shuffle-id="${escapeHtml(preset.id)}" title="Shuffle this variant"><i class="ti ti-dice-5" aria-hidden="true"></i></span>
      </div>
      <div class="preset-card-tagline">${preset.tagline}</div>
      <div class="preset-card-stats" id="preset-stats-${escapeHtml(preset.id)}">${presetStatsLine(payload)}</div>
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
