/**
 * tour.js — the rundgang as a page: a dimmed screen with a spotlight on the real element and a small card that says what it is for (Back, Next, End the tour).
 * What the steps are, which ones a profile sees and where the card goes is in tourCore.js (pure, tested).
 *
 * It is offered, never forced: after the quiz ("Apply and show me around"), from the Overview and from the Profile tab (anything with data-tour-start). It opens each workspace of its
 * steps with the app's own setMode() (so it only ever visits tabs the person's profile shows), and puts the person back where they were when it ends. Arrow keys go
 * back and forth, Escape ends it; while it runs the page behind it cannot be clicked, so an accidental click cannot lose the thread.
 */

const tourState = { active: false, index: 0, plan: [], startMode: "guide", token: 0 };

function tourEl(id) { return document.getElementById(id); }

/** Not while the welcome screen or the quiz is on top, and never twice. */
function tourCanStart() {
  if (tourState.active) return false;
  if (typeof quizState !== "undefined" && quizState.open) return false;
  const gate = tourEl("sessionGate");
  if (gate && gate.style.display !== "none" && !gate.classList.contains("session-gate-hidden")) return false;
  return true;
}

function tourStart() {
  if (!tourCanStart()) return false;
  const plan = tourPlan(profileState.profile);
  if (!plan.length) return false;
  tourState.plan = plan;
  tourState.startMode = typeof activeMode !== "undefined" ? activeMode : "guide";
  tourState.active = true;
  tourState.index = 0;
  if (typeof roofProgramOnTourStart === "function") roofProgramOnTourStart();      // a "What is this roof?" already on screen steps aside until the tour ends (roofProgram.js)
  const overlay = tourEl("tourOverlay");
  if (overlay) overlay.style.display = "block";
  tourShow(0);
  return true;
}

/** Opens the step's workspace (waiting for it to be laid out: a map and a rail need a moment), points at its element, and draws the card. A newer step cancels an older one still waiting. */
async function tourShow(i) {
  const token = ++tourState.token;
  const step = tourState.plan[i];
  if (!step) return tourEnd(true);
  tourState.index = i;
  if (typeof setMode === "function" && typeof activeMode !== "undefined" && activeMode !== step.mode) {
    setMode(step.mode);
    await new Promise(r => setTimeout(r, 260));
    if (token !== tourState.token) return;
  }
  const el = step.target ? document.querySelector(step.target) : null;
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", inline: "nearest" });
  await new Promise(r => setTimeout(r, 40));
  if (token !== tourState.token) return;
  tourDraw(step, el);
}

/** The spotlight and the card for a step. A target that is missing, or hidden (no size), is not pointed at: the card is centred and the page dimmed as a whole. */
function tourDraw(step, el) {
  const overlay = tourEl("tourOverlay"), spotEl = tourEl("tourSpot"), card = tourEl("tourCard");
  if (!overlay || !spotEl || !card) return;
  const view = { w: window.innerWidth, h: window.innerHeight };
  const r = el ? el.getBoundingClientRect() : null;
  const rect = r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  const spot = tourSpotRect(rect, view);
  if (spot) {
    spotEl.style.display = "block";
    spotEl.style.left = spot.x + "px"; spotEl.style.top = spot.y + "px"; spotEl.style.width = spot.w + "px"; spotEl.style.height = spot.h + "px";
    overlay.classList.remove("tour-dim");
  } else {
    spotEl.style.display = "none";
    overlay.classList.add("tour-dim");
  }
  const last = step.index === step.total;
  card.style.visibility = "hidden";
  card.innerHTML = `
    <div class="tour-progress">Step ${step.index} of ${step.total}</div>
    <h3 id="tourTitle">${escapeHtml(step.title)}</h3>
    <p>${escapeHtml(step.text)}</p>
    <div class="tour-nav">
      <button type="button" class="session-gate-link" data-tour-act="end">${last ? "Close" : "End the tour"}</button>
      <span class="tour-buttons">
        <button type="button" class="btn-export" data-tour-act="back"${step.index === 1 ? " disabled" : ""}><i class="ti ti-arrow-left" aria-hidden="true"></i>Back</button>
        <button type="button" class="btn-export accent" data-tour-act="next">${last ? "Finish" : "Next"}${last ? "" : `<i class="ti ti-arrow-right" aria-hidden="true"></i>`}</button>
      </span>
    </div>`;
  const place = tourCardPlacement(spot, view, { w: card.offsetWidth || 340, h: card.offsetHeight || 190 });
  card.style.left = place.left + "px";
  card.style.top = place.top + "px";
  card.style.visibility = "visible";
  const next = card.querySelector('[data-tour-act="next"]');
  if (next && typeof next.focus === "function") next.focus({ preventScroll: true });
}

function tourRedraw() {
  const step = tourState.plan[tourState.index];
  if (!tourState.active || !step) return;
  tourDraw(step, step.target ? document.querySelector(step.target) : null);
}

function tourNext() { if (tourState.active) tourShow(tourState.index + 1); }
function tourBack() { if (tourState.active && tourState.index > 0) tourShow(tourState.index - 1); }

/** Ends the tour (finished, or the person ended it), hides the overlay and puts the person back where they were. */
function tourEnd(completed) {
  if (!tourState.active) return;
  tourState.token++;
  tourState.active = false;
  const overlay = tourEl("tourOverlay");
  if (overlay) { overlay.style.display = "none"; overlay.classList.remove("tour-dim"); }
  if (typeof setMode === "function" && typeof activeMode !== "undefined" && activeMode !== tourState.startMode) setMode(tourState.startMode);
  if (completed && typeof showToast === "function") showToast("That was the tour", "Take it again any time from the Overview or the Profile tab.");
  if (typeof roofProgramAfterTour === "function") roofProgramAfterTour();      // "What is this roof?" waits for the tour to end (roofProgram.js)
}

function tourInit() {
  tourEl("tourCard")?.addEventListener("click", e => {
    const act = e.target.closest("[data-tour-act]");
    if (!act) return;
    if (act.dataset.tourAct === "next") tourNext();
    else if (act.dataset.tourAct === "back") tourBack();
    else if (act.dataset.tourAct === "end") tourEnd(false);
  });
  // the buttons that offer the tour (the Overview, the Profile tab)
  document.addEventListener("click", e => {
    const start = e.target.closest && e.target.closest("[data-tour-start]");
    if (start) tourStart();
  });
  // arrow keys go back and forth; Escape ends; Enter and Space belong to the focused button (Next has the focus)
  document.addEventListener("keydown", e => {
    if (!tourState.active) return;
    if (e.key === "ArrowRight") { e.preventDefault(); tourNext(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); tourBack(); }
    else if (e.key === "Escape") tourEnd(false);
  });
  window.addEventListener("resize", () => { if (tourState.active) tourRedraw(); });
}
