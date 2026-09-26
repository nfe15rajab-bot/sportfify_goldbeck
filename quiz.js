/**
 * quiz.js — the start-up quiz as a page: an overlay with four questions and a result screen, the "Your answers" section of the Profile tab, and the "next step" card on the Overview.
 * What the questions are and what the answers set is in quizCore.js (pure, tested); what a profile holds, and saving it, is profile.js.
 *
 *   when it opens   by itself, once, when a person starts a new session and has never been through it, skipped it, or changed their profile (quizShouldOpen); and whenever they
 *                   ask for it in the Profile tab, which also shows their answers and lets them change or clear them
 *   what it sets   defaults only (quizOutcome): the view, the extras added to Simple, where Sportify opens, what to do first. Applying it is one profileChange(), so it is saved
 *                   and sent to Revit like every other change; skipping only records that the quiz has been offered
 */

/** What the person types on the site question (not part of the profile: it belongs to the session, and goes to the Site tab when the quiz is applied). */
function quizNewSite() { return { query: "", results: [], status: "", busy: false, place: null, north: "" }; }

const quizState = { open: false, step: 0, answers: quizNormalizeAnswers(null), site: quizNewSite(), focus: null };
const QUIZ_STEPS = QUIZ_QUESTIONS.length;      // the questions; the step after them is the result

function quizEl(id) { return document.getElementById(id); }

// ------------------------------------------------------------------------------------------------ the answers being given

/** A click on an option: a single question takes it, a multiple one toggles it ("none of these yet" excludes the others, as the core cleans it). */
function quizChoose(questionId, value) {
  const q = quizQuestion(questionId);
  if (!q || !q.options.some(o => o.value === value)) return;
  const a = quizState.answers;
  if (q.kind === "single") a[questionId] = value;
  else {
    const option = q.options.find(o => o.value === value);
    const list = a[questionId].slice();
    const at = list.indexOf(value);
    if (at >= 0) list.splice(at, 1);
    else if (option.exclusive) list.splice(0, list.length, value);
    else list.push(value);
    a[questionId] = list;
  }
  quizState.answers = quizNormalizeAnswers(a);
}

function quizStepAnswered(step) {
  const q = QUIZ_QUESTIONS[step];
  return !q || q.kind === "multi" || !!quizState.answers[q.id];      // a multiple question may be left empty; a single one needs an answer
}

function quizGo(step) {
  quizState.step = Math.max(0, Math.min(QUIZ_STEPS, step));
  quizRender();
}

function quizNext() {
  if (quizState.step < QUIZ_STEPS && !quizStepAnswered(quizState.step)) return;
  if (quizState.step === QUIZ_STEPS - 1 && !quizComplete(quizState.answers)) return;
  quizGo(quizState.step + 1);
}

// ------------------------------------------------------------------------------------------------ open, apply, skip

function quizOpen(prefill) {
  quizState.answers = quizNormalizeAnswers(prefill !== undefined ? prefill : profileState.profile.quiz);
  quizState.step = 0;
  quizState.site = quizNewSite();
  // what the Site tab already has is shown as such (and not sent again unless it is changed)
  if (typeof siteState !== "undefined" && siteState && siteState.lat != null) quizState.site.place = { label: siteState.address || "the location already set on the Site tab", lat: siteState.lat, lng: siteState.lng, addr: null, existing: true };
  if (typeof siteState !== "undefined" && siteState && siteState.northSet) quizState.site.north = String(siteState.northDeg);
  quizState.open = true;
  const overlay = quizEl("quizOverlay");
  if (overlay) { overlay.style.display = "flex"; overlay.getBoundingClientRect(); overlay.classList.add("quiz-shown"); }
  quizRender();
}

function quizClose() {
  quizState.open = false;
  const overlay = quizEl("quizOverlay");
  if (!overlay) return;
  overlay.classList.remove("quiz-shown");
  overlay.style.display = "none";
}

/** Is this a NEW session: nothing has been placed yet (a session that was resumed, loaded from a file or a preset, or already worked on is not new). */
function quizSessionIsNew() {
  return typeof combineState === "undefined" || !combineState || !Array.isArray(combineState.items) || combineState.items.length === 0;
}

/**
 * Opens the quiz, but only for a new session (the welcome screen's "Start a New Session" on an empty session; never when a session is resumed or loaded) and only for a person who
 * has never met it (quizShouldOpen). Anyone can take it at any time from the Profile tab.
 */
function quizMaybeOpen() {
  if (quizState.open || !quizSessionIsNew() || !quizShouldOpen(profileState.profile)) return false;
  quizOpen(null);
  return true;
}

/** Sets what the answers choose, saves it like any profile change, and goes where Sportify opens. */
function quizApply() {
  if (!quizComplete(quizState.answers)) return;
  const o = quizOutcome(quizState.answers);
  const quiz = Object.assign({}, quizNormalizeAnswers(quizState.answers), { taken: new Date().toISOString() });
  profileChange({ view: o.view, extras: o.extras, landing: o.landing, onboarded: true, quiz }, "Set up from your answers.");
  const sent = quizSendSiteData();      // before the workspace opens: the Site tab, when it is the one that opens, shows it at once
  quizClose();
  if (typeof setMode === "function") setMode(profileLandingMode());
  if (typeof showToast === "function") showToast("Sportify is set up", o.summary[0] + " " + o.summary[1] + (sent.length ? " " + sent.join(" and ") + " sent to the Site tab." : ""));
}

// ------------------------------------------------------------------------------------------------ the site data the person types

/** The address the person typed, looked up on request (Enter or the Search button: Nominatim's policy has no room for a search on every keystroke): places to choose from. */
async function quizSearchPlaces() {
  const s = quizState.site;
  if (s.busy) return;
  const q = s.query.trim();
  quizState.focus = "query";
  if (q.length < 3) { s.results = []; s.status = "Type at least three characters of the address."; return quizRender(); }
  if (typeof siteFindPlaces !== "function") { s.results = []; s.status = "The address search is not available here: set the location on the Site tab."; return quizRender(); }
  s.busy = true; s.results = []; s.status = "Searching…";
  quizRender();
  try {
    s.results = await siteFindPlaces(q);
    s.status = s.results.length ? "" : "Nothing was found for that. Try the street and the city, or set the location on the Site tab.";
  } catch (e) {
    s.results = [];
    s.status = "The address search could not be reached (no connection?). You can set the location on the Site tab instead.";
  }
  s.busy = false;
  quizState.focus = s.results.length ? "result" : "query";
  quizRender();
}

function quizChoosePlace(index) {
  const s = quizState.site;
  const place = s.results[index];
  if (!place) return;
  s.place = place;
  s.results = [];
  s.status = "";
  quizState.focus = null;
  quizRender();
}

/** The orientation the person typed, as a number of degrees, or null when the field is empty or not a number. */
function quizNorthValue() {
  const raw = String(quizState.site.north).trim();
  const n = raw === "" ? NaN : Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Sends what was typed to the Site tab: the chosen place (with its region, for the wind zone) and the orientation. Only what the answers still say the person has. Returns what was sent. */
function quizSendSiteData() {
  const s = quizState.site, has = quizState.answers.site_data, sent = [];
  if (has.includes("location") && s.place && !s.place.existing && typeof siteApplyPlace === "function") { siteApplyPlace(s.place); sent.push("The location"); }
  const north = quizNorthValue();
  if (has.includes("orientation") && north !== null && typeof siteApplyNorth === "function") { siteApplyNorth(north); sent.push(sent.length ? "the orientation" : "The orientation"); }
  return sent;
}

/** What will be sent, in words, for the result screen. */
function quizSiteSummary() {
  const s = quizState.site, has = quizState.answers.site_data, lines = [];
  if (has.includes("location") && s.place) lines.push(s.place.existing ? "Location already on the Site tab: " + s.place.label : "Location, sent to the Site tab: " + s.place.label);
  const north = quizNorthValue();
  if (has.includes("orientation") && north !== null) lines.push("Orientation, sent to the Site tab: " + Math.round(((north % 360) + 360) % 360) + "° from the top of the plan to true north");
  return lines;
}

function quizSiteDetailsHtml() {
  const has = quizState.answers.site_data, s = quizState.site, parts = [];
  if (has.includes("location")) {
    let below = "";
    if (s.place) {
      below = `<div class="quiz-chosen"><i class="ti ti-map-pin" aria-hidden="true"></i><span>${escapeHtml(s.place.label)}</span><button type="button" class="session-gate-link" data-quiz-act="site-clear">Change</button></div>
        <div class="quiz-detail-hint">${s.place.existing ? "Already set on the Site tab." : "It goes to the Site tab when you apply the quiz."}</div>`;
    } else if (s.results.length) {
      below = `<div class="quiz-results" role="listbox" aria-label="Places found">${s.results.map((r, i) => `<button type="button" class="quiz-result" role="option" data-quiz-place="${i}"><i class="ti ti-map-pin" aria-hidden="true"></i><span>${escapeHtml(r.label)}</span></button>`).join("")}</div>
        <div class="quiz-detail-hint">Choose the right one.</div>`;
    } else if (s.status) {
      below = `<div class="quiz-detail-hint">${escapeHtml(s.status)}</div>`;
    }
    parts.push(`<div class="quiz-detail">
      <label for="quizSiteQuery">Where is it? <span class="quiz-detail-hint">Type an address, press Enter, and choose it from the list.</span></label>
      <div class="quiz-search-row"><input type="text" id="quizSiteQuery" value="${escapeHtml(s.query)}" placeholder="Street and city" autocomplete="off" /><button type="button" class="btn-export" data-quiz-act="site-search"${s.busy ? " disabled" : ""}><i class="ti ti-search" aria-hidden="true"></i>Search</button></div>
      ${below}
    </div>`);
  }
  if (has.includes("orientation")) {
    parts.push(`<div class="quiz-detail">
      <label for="quizNorth">Which way does it face? <span class="quiz-detail-hint">Degrees clockwise from the top of the roof plan to true north.</span></label>
      <div class="quiz-search-row"><input type="number" id="quizNorth" min="0" max="359" step="1" value="${escapeHtml(s.north)}" placeholder="0 to 359" /></div>
    </div>`);
  }
  return parts.length ? `<div class="quiz-details">${parts.join("")}</div>` : "";
}

/** "Skip": nothing is changed, only remembered so the quiz is not offered again by itself. It is one click away in the Profile tab. */
function quizSkip() {
  if (!profileState.profile.onboarded) profileChange({ onboarded: true }, "");
  quizClose();
}

function quizClearAnswers() {
  profileChange({ quiz: null, extras: [], landing: null }, "Your answers were cleared: nothing is added to the Simple view and Sportify opens on the Overview.");
}

// ------------------------------------------------------------------------------------------------ drawing

function quizOptionHtml(question, option) {
  const on = question.kind === "single" ? quizState.answers[question.id] === option.value : quizState.answers[question.id].includes(option.value);
  return `<button type="button" class="quiz-option${on ? " quiz-selected" : ""}" data-quiz-q="${escapeHtml(question.id)}" data-quiz-v="${escapeHtml(option.value)}" aria-pressed="${on}">
      <span class="quiz-mark quiz-mark-${question.kind === "single" ? "round" : "square"}"><i class="ti ti-check" aria-hidden="true"></i></span>
      <span class="quiz-option-text"><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.hint)}</small></span>
    </button>`;
}

function quizDots(step) {
  return Array.from({ length: QUIZ_STEPS + 1 }, (_, i) => `<span class="quiz-dot${i === step ? " quiz-dot-now" : i < step ? " quiz-dot-done" : ""}"></span>`).join("");
}

function quizRenderResult() {
  const o = quizOutcome(quizState.answers);
  const lines = quizAnswerLines(quizState.answers).map((l, i) => `
      <div class="quiz-answer-row"><span class="quiz-answer-title">${escapeHtml(l.title)}</span><span class="quiz-answer-text">${escapeHtml(l.text)}</span>
        <button type="button" class="session-gate-link" data-quiz-edit="${i}">Change</button></div>`).join("");
  return `
    <div class="quiz-progress">Your setup</div>
    <h2 id="quizTitle">Here is what Sportify will show you</h2>
    <ul class="quiz-summary">${o.summary.concat(quizSiteSummary()).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    <div class="quiz-answers">${lines}</div>
    <p class="hint quiz-foot">This only sets where you start and what is shown. You can change any of it in the Profile tab, and Advanced shows everything.</p>
    <div class="quiz-nav">
      <button type="button" class="btn-export" data-quiz-act="back"><i class="ti ti-arrow-left" aria-hidden="true"></i>Back</button>
      <button type="button" class="btn-export accent" data-quiz-act="apply"><i class="ti ti-check" aria-hidden="true"></i>Apply and start</button>
    </div>`;
}

function quizRenderQuestion() {
  const q = QUIZ_QUESTIONS[quizState.step];
  const last = quizState.step === QUIZ_STEPS - 1;
  const canGo = quizStepAnswered(quizState.step) && (!last || quizComplete(quizState.answers));
  return `
    <div class="quiz-progress">Question ${quizState.step + 1} of ${QUIZ_STEPS}</div>
    <h2 id="quizTitle">${escapeHtml(q.title)}</h2>
    <p class="hint">${escapeHtml(q.hint)}</p>
    <div class="quiz-options" role="group" aria-labelledby="quizTitle">${q.options.map(o => quizOptionHtml(q, o)).join("")}</div>
    ${q.id === "site_data" ? quizSiteDetailsHtml() : ""}
    <div class="quiz-nav">
      ${quizState.step > 0 ? `<button type="button" class="btn-export" data-quiz-act="back"><i class="ti ti-arrow-left" aria-hidden="true"></i>Back</button>` : `<button type="button" class="session-gate-link" data-quiz-act="skip">${profileState.profile.onboarded ? "Cancel" : "Skip the quiz"}</button>`}
      <button type="button" class="btn-export accent" data-quiz-act="next"${canGo ? "" : " disabled"}>${last ? "Show my setup" : "Next"}<i class="ti ti-arrow-right" aria-hidden="true"></i></button>
    </div>`;
}

function quizRender() {
  const card = quizEl("quizCard");
  if (!card) return;
  card.innerHTML = `<div class="quiz-dots" aria-hidden="true">${quizDots(quizState.step)}</div>` + (quizState.step >= QUIZ_STEPS ? quizRenderResult() : quizRenderQuestion());
  // focus: where the person was working (the address field, or the first place found), else the first option
  const want = quizState.focus;
  quizState.focus = null;
  const target = (want === "query" && card.querySelector("#quizSiteQuery")) || (want === "result" && card.querySelector(".quiz-result")) || card.querySelector(".quiz-selected, .quiz-option, [data-quiz-act]");
  if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
}

/** The Profile tab's "Your answers": the answers in words with the way to change them, or the offer to take the quiz. */
function quizRenderProfileSection() {
  const el = quizEl("profile-quiz");
  if (!el) return;
  const p = profileState.profile;
  if (!p.quiz) {
    el.innerHTML = `<p class="profile-note">${p.onboarded ? "You skipped the quiz. " : ""}Four short questions (what you want to do, which analyses matter, what you already have, how well you know Sportify) set what is shown first and where Sportify opens.</p>
      <div class="profile-person-buttons"><button type="button" class="btn-export accent" data-quiz-act="open"><i class="ti ti-list-check" aria-hidden="true"></i>Take the quiz</button></div>`;
    return;
  }
  const lines = quizAnswerLines(p.quiz).map(l => `<div class="quiz-answer-row"><span class="quiz-answer-title">${escapeHtml(l.title)}</span><span class="quiz-answer-text">${escapeHtml(l.text)}</span></div>`).join("");
  el.innerHTML = `<div class="quiz-answers">${lines}</div>
    <div class="profile-person-buttons">
      <button type="button" class="btn-export" data-quiz-act="open"><i class="ti ti-list-check" aria-hidden="true"></i>Take the quiz again</button>
      <button type="button" class="btn-export" data-quiz-act="clear"><i class="ti ti-eraser" aria-hidden="true"></i>Clear my answers</button>
    </div>`;
}

/** The Overview's "Your next step": what to do first, from the answers, with a button to get there. Hidden until the quiz has been taken. */
function quizRenderNextStep() {
  const el = quizEl("overviewNext");
  if (!el) return;
  const p = profileState.profile;
  const o = p.quiz && quizComplete(p.quiz) ? quizOutcome(p.quiz) : null;
  if (!o || !profileModeVisible(p.view, o.next.goto, p.extras)) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "flex";
  el.innerHTML = `<i class="ti ti-flag-3" aria-hidden="true"></i>
    <div class="next-step-body"><div class="next-step-title">Your next step</div><div class="next-step-text">${escapeHtml(o.next.text)}</div></div>
    <button type="button" class="btn-export accent" data-goto="${escapeHtml(o.next.goto)}">Go to ${escapeHtml(PROFILE_MODES[o.next.goto].label)}<i class="ti ti-arrow-right" aria-hidden="true"></i></button>`;
}

// ------------------------------------------------------------------------------------------------ start

function quizInit() {
  const overlay = quizEl("quizOverlay");
  if (overlay) {
    overlay.addEventListener("click", e => {
      const option = e.target.closest("[data-quiz-q]");
      if (option) { quizChoose(option.dataset.quizQ, option.dataset.quizV); return quizRender(); }
      const place = e.target.closest("[data-quiz-place]");
      if (place) return quizChoosePlace(Number(place.dataset.quizPlace));
      const edit = e.target.closest("[data-quiz-edit]");
      if (edit) return quizGo(Number(edit.dataset.quizEdit));
      const act = e.target.closest("[data-quiz-act]");
      if (!act) return;
      if (act.dataset.quizAct === "next") quizNext();
      else if (act.dataset.quizAct === "back") quizGo(quizState.step - 1);
      else if (act.dataset.quizAct === "apply") quizApply();
      else if (act.dataset.quizAct === "skip") quizSkip();
      else if (act.dataset.quizAct === "site-search") quizSearchPlaces();
      else if (act.dataset.quizAct === "site-clear") { quizState.site.place = null; quizState.focus = "query"; quizRender(); }
    });
    // typing only keeps what was typed (the card is not redrawn under the cursor); Enter in the address field searches
    overlay.addEventListener("input", e => {
      if (e.target.id === "quizSiteQuery") quizState.site.query = e.target.value;
      else if (e.target.id === "quizNorth") quizState.site.north = e.target.value;
    });
    overlay.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.id === "quizSiteQuery") { e.preventDefault(); quizState.site.query = e.target.value; quizSearchPlaces(); }
    });
    // Escape closes the list of places first; with none open it leaves the quiz (a skip on the first run)
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !quizState.open) return;
      if (quizState.site.results.length) { quizState.site.results = []; quizState.focus = "query"; quizRender(); }
      else quizSkip();
    });
  }
  const section = quizEl("profile-quiz");
  section?.addEventListener("click", e => {
    const act = e.target.closest("[data-quiz-act]");
    if (!act) return;
    if (act.dataset.quizAct === "open") quizOpen(undefined);
    else if (act.dataset.quizAct === "clear") quizClearAnswers();
  });
  quizEl("overviewNext")?.addEventListener("click", e => {
    const go = e.target.closest("[data-goto]");
    if (go && typeof setMode === "function") setMode(go.dataset.goto);
  });
  quizRenderNextStep();
  quizRenderProfileSection();
}
