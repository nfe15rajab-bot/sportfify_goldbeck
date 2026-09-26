// Tests for the start-up quiz (quizCore.js): its questions, how answers are cleaned, and what they set. Run: node tools/quiz-test.js
//
// The quiz sets DEFAULTS (view, the extras added to Simple, where Sportify opens, what to do first) and nothing that cannot be changed afterwards. This pins the rules: the same
// answers always give the same outcome, every outcome names things that exist (a tab, a view, an extra), garbage answers never break it, and a person who is an expert is not
// given a smaller Sportify.
const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const core = require(path.join(web, "profileCore.js"));
const quiz = require(path.join(web, "quizCore.js"));
const { QUIZ_QUESTIONS } = quiz;

// ---------------------------------------------------------------------------------------------------------------- the questions
check("four questions: what to do, which analyses, what is known about the site, how well Sportify is known (the tools are found by the add-in, not asked)", QUIZ_QUESTIONS.map(q => q.id).join() === "goal,analyses,site_data,experience");
check("each question has a title, a hint and at least two options, every option a value, a label and a hint; values are unique", QUIZ_QUESTIONS.every(q => q.title && q.hint && q.options.length >= 2 && q.options.every(o => o.value && o.label && o.hint) && new Set(q.options.map(o => o.value)).size === q.options.length));
check("goal and experience are single choices, the other two multiple", QUIZ_QUESTIONS.map(q => q.kind).join() === "single,multi,multi,single");
check("the wording is plain: no option label is longer than 50 characters, no title longer than 60", QUIZ_QUESTIONS.every(q => q.title.length <= 60 && q.options.every(o => o.label.length <= 50)));
check("'none of these yet' is the one exclusive option, and only in the site question", QUIZ_QUESTIONS.flatMap(q => q.options.filter(o => o.exclusive).map(o => q.id + ":" + o.value)).join() === "site_data:none");
check("every analysis the quiz offers brings back something that exists in the profile (an extra)", Object.entries(quiz.QUIZ_ANALYSIS_EXTRA).every(([a, e]) => core.PROFILE_EXTRAS[e]) && quiz.quizQuestion("analyses").options.every(o => quiz.QUIZ_ANALYSIS_EXTRA[o.value]));

// ---------------------------------------------------------------------------------------------------------------- cleaning answers
const garbage = [null, undefined, "", "x", 5, [], [1], {}, { goal: 7, analyses: "sun", site_data: { a: 1 }, experience: [] }, { goal: "fly", analyses: ["magic", 3, null], site_data: ["everything"], experience: "god" }];
check("garbage answers become empty answers, and never throw", garbage.every(g => { const a = quiz.quizNormalizeAnswers(g); return a.goal === null && a.experience === null && a.analyses.length === 0 && a.site_data.length === 0; }));
const good = { goal: "design", analyses: ["wind", "structure", "structure", "nonsense"], site_data: ["location", "roof_outline"], experience: "some", junk: 1 };
const clean = quiz.quizNormalizeAnswers(good);
check("valid answers are kept, each value once, in the order the question offers them, and nothing else", clean.goal === "design" && clean.analyses.join() === "structure,wind" && clean.site_data.join() === "location,roof_outline" && clean.experience === "some" && !("junk" in clean));
check("'none of these yet' next to something else is the something else", quiz.quizNormalizeAnswers({ site_data: ["none", "location"] }).site_data.join() === "location" && quiz.quizNormalizeAnswers({ site_data: ["none"] }).site_data.join() === "none");
check("cleaning twice changes nothing", JSON.stringify(quiz.quizNormalizeAnswers(clean)) === JSON.stringify(clean));
check("the quiz is complete when the goal and the experience are answered (the two lists may be empty)", quiz.quizComplete({ goal: "check", experience: "first" }) && !quiz.quizComplete({ goal: "check" }) && !quiz.quizComplete({ experience: "first" }) && !quiz.quizComplete(null));

// ---------------------------------------------------------------------------------------------------------------- what the answers set
const answers = (goal, analyses, site, experience) => ({ goal, analyses, site_data: site, experience });
const out = a => quiz.quizOutcome(a);

check("someone who knows Sportify well gets the Advanced view, everyone else Simple", out(answers("design", [], [], "expert")).view === "advanced" && out(answers("design", [], [], "first")).view === "simple" && out(answers("design", [], [], "some")).view === "simple");
check("the analyses chosen bring back their extras: structure, conditions (sun, wind and rain together), improve, safety, carbon, each once", out(answers("check", ["structure", "sun", "wind", "rain", "kinetics", "safety", "carbon"], [], "some")).extras.join() === "structure,conditions,postAnalysis,safety,carbon" && out(answers("check", ["sun", "rain"], [], "some")).extras.join() === "conditions" && out(answers("check", [], [], "some")).extras.length === 0);
check("designing with a roof model and a location starts in Combine; without a roof model or without a location, in Site", out(answers("design", [], ["roof_outline", "location"], "some")).landing === "combine" && out(answers("design", [], ["location"], "some")).landing === "site" && out(answers("design", [], ["roof_outline"], "some")).landing === "site" && out(answers("design", [], ["none"], "first")).landing === "site");
check("checking a design starts in Results when there is a roof model, in Site (where the roof comes in) when there is not", out(answers("check", ["sun"], ["roof_outline"], "some")).landing === "analysis" && out(answers("check", ["sun"], [], "some")).landing === "site");
check("making documents starts in Documents", out(answers("documents", [], [], "first")).landing === "deliverables");
check("the next step is one sentence and points at a workspace that exists", ["design", "check", "documents", null].every(g => [[], ["roof_outline"], ["roof_outline", "location"]].every(s => { const n = out(answers(g, ["sun"], s, "first")).next; return typeof n.text === "string" && n.text.length > 10 && n.text.length < 260 && core.PROFILE_MODES[n.goto]; })));
check("the next step names what to do first: the roof from Revit when there is none, the location when only that is missing, Combine when both are there", /Push to Sportify/.test(out(answers("design", [], [], "first")).next.text) && /where the roof is/i.test(out(answers("design", [], ["roof_outline"], "first")).next.text) && out(answers("design", [], ["roof_outline", "location"], "first")).next.goto === "combine");
check("checking names the analyses the person chose", /sun and shade, wind and erosion/.test(out(answers("check", ["sun", "wind"], ["roof_outline"], "some")).next.text));
check("no goal answered is treated as designing (the main path starts with the site)", out(answers(null, [], [], "first")).landing === "site");
check("the same answers always give the same outcome", JSON.stringify(out(good)) === JSON.stringify(out(JSON.parse(JSON.stringify(good)))));
check("every outcome names things that exist: a view, extras of the profile, a landing the profile allows, tabs of the app", (() => {
  const goals = ["design", "check", "documents", null], exps = ["first", "some", "expert"];
  const analysesSets = [[], ["structure"], ["sun", "wind", "rain"], QUIZ_QUESTIONS[1].options.map(o => o.value)];
  const sites = [[], ["none"], ["location"], ["roof_outline"], ["roof_outline", "location", "structure_grid", "wind_snow", "orientation"]];
  let n = 0;
  for (const g of goals) for (const e of exps) for (const an of analysesSets) for (const s of sites) {
    const o = out(answers(g, an, s, e)); n++;
    if (!core.PROFILE_VIEWS[o.view] || !o.extras.every(x => core.PROFILE_EXTRAS[x]) || !core.PROFILE_LANDINGS.includes(o.landing) || !core.PROFILE_MODES[o.next.goto] || o.summary.length !== 3) return false;
    // a landing must be shown in the view the quiz picks, with the extras it picks
    if (!core.profileModeVisible(o.view, o.landing, o.extras) || !core.profileModeVisible(o.view, o.next.goto, o.extras)) return false;
  }
  return n === 4 * 3 * 4 * 5;
})());
check("the summary says the view (and what was added to Simple), where Sportify opens, and what to do first", (() => {
  const s = out(answers("check", ["structure", "sun"], ["roof_outline"], "some")).summary;
  return s.length === 3 && s[0] === "Simple view, with structure inputs, site conditions added." && s[1] === "Sportify opens on Results." && /^First: /.test(s[2]);
})());
check("an Advanced view is not described as having anything 'added'", out(answers("check", ["structure"], [], "expert")).summary[0] === "Advanced view.");

// ---------------------------------------------------------------------------------------------------------------- what the profile makes of it
check("applying an outcome to a profile keeps it valid: extras, landing and the answers survive normalisation", (() => {
  const o = out(good);
  const p = core.normalizeProfile({ view: o.view, extras: o.extras, landing: o.landing, onboarded: true, quiz: Object.assign({}, quiz.quizNormalizeAnswers(good), { taken: "2026-09-26T09:00:00Z" }) });
  return p.view === o.view && p.extras.join() === o.extras.join() && p.landing === o.landing && p.onboarded === true && p.quiz.goal === "design" && p.quiz.analyses.join() === "structure,wind" && p.quiz.taken === "2026-09-26T09:00:00.000Z";
})());
check("the answers as lines for the Profile tab: one per question, in words", (() => {
  const lines = quiz.quizAnswerLines(good);
  return lines.length === 4 && lines[0].text === "Design a new roof layout" && lines[1].text === "Structure, Wind and erosion" && lines[3].text === "I have used it a little" && quiz.quizAnswerLines(null)[0].text === "not answered" && quiz.quizAnswerLines(null)[1].text === "none";
})());
check("the quiz opens by itself only for someone who never took it, never skipped it and never changed their profile", quiz.quizShouldOpen(core.profileDefaults()) && !quiz.quizShouldOpen(Object.assign(core.profileDefaults(), { onboarded: true })) && !quiz.quizShouldOpen(Object.assign(core.profileDefaults(), { updated: "2026-09-25T10:00:00.000Z" })) && !quiz.quizShouldOpen(Object.assign(core.profileDefaults(), { quiz: { goal: "design" } })) && quiz.quizShouldOpen(null));

// ---------------------------------------------------------------------------------------------------------------- the profile's new fields
check("extras are cleaned: only the ones that exist, each once, in the profile's order", core.normalizeExtras(["carbon", "structure", "nope", "structure", 5, null]).join() === "structure,carbon" && core.normalizeExtras("structure").length === 0 && core.normalizeExtras(null).length === 0);
check("a landing the profile does not allow is dropped, one it allows is kept", core.normalizeProfile({ landing: "deliverables" }).landing === "deliverables" && core.normalizeProfile({ landing: "profile" }).landing === null && core.normalizeProfile({ landing: "<script>" }).landing === null && core.normalizeProfile({}).landing === null);
check("onboarded is only ever true or false", core.normalizeProfile({ onboarded: true }).onboarded === true && core.normalizeProfile({ onboarded: "yes" }).onboarded === false && core.normalizeProfile({}).onboarded === false);
check("Simple with an extra shows the extra's tab and nothing else more; Advanced ignores extras; an unknown extra brings nothing", core.profileModeVisible("simple", "structure", ["structure"]) && !core.profileModeVisible("simple", "conditions", ["structure"]) && !core.profileModeVisible("simple", "structure", ["nope"]) && !core.profileModeVisible("simple", "structure") && core.profileModeVisible("advanced", "structure", []));
check("safety and carbon add no tab (their results are in Results): Simple stays as it is for them", core.profileHiddenModes("simple", ["safety", "carbon"]).join() === core.profileHiddenModes("simple").join());
check("the tabs Simple hides shrink by exactly the extras' tabs", core.profileHiddenModes("simple", ["structure", "conditions"]).join() === "compare,postAnalysis,data,families");

// ---------------------------------------------------------------------------------------------------------------- the files
const html = read("index.html");
const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
check("the scripts load in this order: profileCore, profile, quizCore, quiz, then the welcome screen and main.js", ["profileCore.js", "profile.js", "quizCore.js", "quiz.js", "sessionGate.js", "main.js"].every((f, i, all) => scripts.includes(f) && (i === 0 || scripts.indexOf(all[i - 1]) < scripts.indexOf(f))));
check("the quiz's core never touches the page or the network", !/document\.|window\.|fetch\(|localStorage|XMLHttpRequest/.test(read("quizCore.js")));
check("the page has the quiz's overlay and card (a dialog), the Profile tab's answers section and the Overview's next-step card", /id="quizOverlay"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html) && html.includes('id="quizCard"') && html.includes('id="profile-quiz"') && html.includes('id="overviewNext"'));
check("the welcome screen opens on the person's landing tab and offers a new person the quiz; main.js wires the quiz", /profileLandingMode\(\)/.test(read("sessionGate.js")) && /quizMaybeOpen/.test(read("sessionGate.js")) && /quizInit\(\)/.test(read("main.js")));
check("the quiz is offered ONLY by 'Start a New Session': one call in the welcome screen, inside that button's handler, none for resume, file, preset or page load", (() => {
  const gate = read("sessionGate.js");
  const calls = gate.match(/quizMaybeOpen/g) || [];
  const handler = /gateNewBtn\.addEventListener\("click", \(\) => \{[\s\S]*?\}\);/.exec(gate);
  const main = read("main.js");
  const cardHandler = /getElementById\("overviewFeatures"\)\?\.addEventListener\("click"[\s\S]*?\n\}\);/.exec(main);
  const explicit = main.match(/quizOpen\(/g) || [];      // "Take the quiz" on the Overview: the person asked for it
  return !!handler && calls.length > 0 && calls.length === (handler[0].match(/quizMaybeOpen/g) || []).length
    && !/quizMaybeOpen/.test(main) && explicit.length === 1 && !!cardHandler && /quizOpen\(/.test(cardHandler[0]);
})());
{
  const overview = (/<div id="guide-content"[\s\S]*?<div id="deliverables-content"/.exec(html) || [""])[0];
  const features = [...overview.matchAll(/data-feature="(\w+)"/g)].map(m => m[1]);
  check("the Overview's outdated 'How it thinks' block (grid-based, fractal, organic) is gone, with its diagrams and styles", overview.length > 1000 && !/How it thinks|philosophy|Grid-based|Fractal|Organic|philosophy-diagram/i.test(overview) && !/philosophy-diagram|diagram-blob|diagram-outline/.test(read("style.css")));
  check("in its place: 'What's new' with four cards: Profile, the quiz, manual placement and algorithmic placement, each with a button", /What's new/.test(overview) && features.join() === "profile,quiz,manual,algo" && /class="feature-head"[^>]*><i class="ti ti-user-circle"/.test(overview) && (overview.match(/class="feature-card"/g) || []).length === 4);
  const mainJs = read("main.js");
  check("each card's button is wired in main.js: the profile tab, the quiz, and Combine in the manual or the algorithmic mode (algoSetMode)", /feature === "profile"\) setMode\("profile"\)/.test(mainJs) && /feature === "quiz"/.test(mainJs) && /feature === "manual" \|\| feature === "algo"/.test(mainJs) && /algoSetMode\(feature\)/.test(mainJs) && /function algoSetMode\(mode\)/.test(read("algoPlacementUI.js")) && /mode === "algo" \? "algo" : "manual"/.test(read("algoPlacementUI.js")));
  check("the rules section no longer refers to the philosophies that are gone", !/philosoph/i.test(overview) && /placed by hand or by the algorithm/.test(overview));
  check("Simple keeps every workspace these cards lead to (the profile, Combine)", core.profileModeVisible("simple", "profile") && core.profileModeVisible("simple", "combine"));
}
check("the quiz overlay sits above the welcome screen (z-index)", (() => { const css = read("style.css"); const z = re => Number((re.exec(css) || [0, 0])[1]); return z(/\.quiz-overlay \{[^}]*z-index: (\d+)/) > z(/\.session-gate \{[^}]*z-index: (\d+)/); })());

// ---------------------------------------------------------------------------------------------------------------- quiz.js and profile.js against a stand-in page
const vm = require("vm");
function fakeElement() {
  const e = { innerHTML: "", textContent: "", style: {}, dataset: {}, handlers: {}, focused: false, classes: new Set(), children: [], value: "",
    classList: null, getBoundingClientRect() {}, focus() { this.focused = true; }, querySelector: () => null, querySelectorAll: () => [],
    appendChild(c) { this.children.push(c); return c; }, setAttribute() {}, removeAttribute() {}, toggleAttribute() {}, matches: () => false,
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); } };
  e.classList = { add: c => e.classes.add(c), remove: c => e.classes.delete(c), contains: c => e.classes.has(c), toggle: (c, on) => { if (on === undefined ? !e.classes.has(c) : on) e.classes.add(c); else e.classes.delete(c); } };
  return e;
}
function page({ stored = null, siteState = null } = {}) {
  const els = {};
  const store = new Map(stored ? [["sportify-profile", JSON.stringify(stored)]] : []);
  const calls = { setMode: [], toasts: [] };
  const docHandlers = {};
  const dataset = { role: "planner", mode: "dark" };
  // the Site tab as the quiz sees it: the search it may call, what it was sent
  const site = {
    found: [{ label: "Marienstraße 5, 33098 Paderborn, Nordrhein-Westfalen, Deutschland", lat: 51.7189, lng: 8.7575, addr: { state: "Nordrhein-Westfalen", city: "Paderborn" } },
            { label: "Marienstraße 5, 32756 Detmold, Nordrhein-Westfalen, Deutschland", lat: 51.9361, lng: 8.8779, addr: { state: "Nordrhein-Westfalen", city: "Detmold" } }],
    fail: false, calls: { find: [], place: [], north: [] }
  };
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error, setTimeout, clearTimeout, Blob,
    document: { documentElement: { dataset }, getElementById: id => (els[id] = els[id] || fakeElement()), createElement: () => fakeElement(), querySelectorAll: () => [], activeElement: null, addEventListener: (t, f) => { docHandlers[t] = f; } },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    showToast: (t, m) => calls.toasts.push(t + ": " + m), triggerDownload: () => {},
    activeMode: "guide", setRole: () => {}, setTheme: () => {}, setMode: m => calls.setMode.push(m),
    localApi: async () => ({ ok: false, status: 0, json: null, error: "Revit is not reachable" }),
    siteFindPlaces: async q => { site.calls.find.push(q); if (site.fail) throw new Error("offline"); return site.found; },
    siteApplyPlace: p => site.calls.place.push(p), siteApplyNorth: d => site.calls.north.push(d)
  };
  if (siteState) sandbox.siteState = siteState;
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["profileCore.js", "profile.js", "quizCore.js", "quiz.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const run = e => vm.runInContext(e, ctx);
  run("profileInit(); quizInit();");
  // a click on the overlay whose target is (or is inside) the given element: closest() answers by selector
  const click = (id, hits) => { const target = { closest: sel => hits[sel] || null }; for (const fn of els[id].handlers.click || []) fn({ target }); };
  const option = (q, v) => click("quizOverlay", { "[data-quiz-q]": { dataset: { quizQ: q, quizV: v } } });
  const act = name => click("quizOverlay", { "[data-quiz-act]": { dataset: { quizAct: name } } });
  const type = (id, value) => { for (const fn of els.quizOverlay.handlers.input || []) fn({ target: { id, value } }); };
  const key = (id, k, value) => { for (const fn of els.quizOverlay.handlers.keydown || []) fn({ key: k, target: { id, value }, preventDefault() {} }); };
  return { els, store, calls, docHandlers, run, click, option, act, site, type, key, profile: () => run("profileState.profile"), saved: () => (store.has("sportify-profile") ? JSON.parse(store.get("sportify-profile")) : null), card: () => els.quizCard.innerHTML };
}

{
  const p = page();
  check("a new person is offered the quiz by the welcome screen; it opens on the first question", p.run("quizMaybeOpen()") === true && p.run("quizState.open") === true && p.els.quizOverlay.style.display === "flex" && /Question 1 of 4/.test(p.card()) && /What do you want to do with Sportify\?/.test(p.card()));
  check("the first screen offers the three ways of using Sportify and a way to skip, and Next waits for an answer", /Design a new roof layout/.test(p.card()) && /Check a design I already have/.test(p.card()) && /Skip the quiz/.test(p.card()) && /data-quiz-act="next" disabled/.test(p.card()));
  p.act("next");
  check("Next without an answer to a single question does nothing", p.run("quizState.step") === 0);
  p.option("goal", "check");
  check("choosing an option marks it (aria-pressed) and lets Next through", /aria-pressed="true"[^>]*>\s*<span class="quiz-mark quiz-mark-round"/.test(p.card().replace(/\n/g, " ")) || /quiz-selected/.test(p.card()));
  check("Next is enabled once a single question is answered", !/data-quiz-act="next" disabled/.test(p.card()));
  p.act("next");
  check("the second question is the multiple one: the person may leave it empty and go on", p.run("quizState.step") === 1 && /Question 2 of 4/.test(p.card()) && !/data-quiz-act="next" disabled/.test(p.card()));
  p.option("analyses", "sun"); p.option("analyses", "structure"); p.option("analyses", "sun");
  check("a multiple question toggles: sun chosen then chosen again is off, structure stays", p.run("quizState.answers.analyses.join()") === "structure");
  p.act("next");
  p.option("site_data", "roof_outline"); p.option("site_data", "none");
  check("'none of these yet' replaces the others, and choosing another one takes 'none' away", p.run("quizState.answers.site_data.join()") === "none" && (p.option("site_data", "roof_outline"), p.run("quizState.answers.site_data.join()") === "roof_outline"));
  p.act("next");
  check("the last question says 'Show my setup' and waits for an answer", /Question 4 of 4/.test(p.card()) && /Show my setup/.test(p.card()) && /data-quiz-act="next" disabled/.test(p.card()));
  p.act("next");
  check("Show my setup without an answer to the last question does nothing", p.run("quizState.step") === 3);
  p.option("experience", "first"); p.act("next");
  check("the result says what Sportify will show: the view, where it opens, what to do first, and the answers, each with a way to change it", p.run("quizState.step") === 4 && /Simple view, with structure inputs added\./.test(p.card()) && /Sportify opens on Results\./.test(p.card()) && /First: /.test(p.card()) && (p.card().match(/data-quiz-edit/g) || []).length === 4 && /Apply and start/.test(p.card()));
  p.click("quizOverlay", { "[data-quiz-edit]": { dataset: { quizEdit: "1" } } });
  check("Change goes back to that question, with the answers kept", p.run("quizState.step") === 1 && p.run("quizState.answers.goal") === "check" && p.run("quizState.answers.analyses.join()") === "structure");
  p.act("next"); p.act("next"); p.act("next");
  check("...and forward again to the result", p.run("quizState.step") === 4);
  p.act("apply");
  const applied = p.saved();
  check("Apply sets the profile from the answers: view, extras, landing, the answers themselves, and that the quiz was taken", applied.view === "simple" && applied.extras.join() === "structure" && applied.landing === "analysis" && applied.onboarded === true && applied.quiz.goal === "check" && applied.quiz.analyses.join() === "structure" && applied.quiz.experience === "first" && !!applied.quiz.taken && !!applied.updated);
  check("...then closes the quiz and opens the workspace it chose (Results: a roof model and a design to check)", p.run("quizState.open") === false && p.els.quizOverlay.style.display === "none" && p.calls.setMode.at(-1) === "analysis");
  check("a toast says what was set", p.calls.toasts.some(t => /Sportify is set up: Simple view, with structure inputs added\./.test(t)));
  check("the quiz does not open by itself again", p.run("quizMaybeOpen()") === false);
  check("the view now follows: the Simple view shows the structure tab the person asked for, and hides the rest of what Simple hides", p.run('profileModeAllowed("structure")') === true && p.run('profileModeAllowed("conditions")') === false && p.run("profileLandingMode()") === "analysis");
  check("the Overview shows 'Your next step' with a button to get there", p.els.overviewNext.style.display === "flex" && /Your next step/.test(p.els.overviewNext.innerHTML) && /data-goto="analysis"/.test(p.els.overviewNext.innerHTML) && /Go to Results/.test(p.els.overviewNext.innerHTML));
  p.calls.setMode.length = 0;
  p.click("overviewNext", { "[data-goto]": { dataset: { goto: "analysis" } } });
  check("its button opens that workspace", p.calls.setMode.at(-1) === "analysis");
  check("the Profile tab shows the answers in words and the buttons to take the quiz again or clear them", /What you want to do/.test(p.els["profile-quiz"].innerHTML) && /Check a design I already have/.test(p.els["profile-quiz"].innerHTML) && /Take the quiz again/.test(p.els["profile-quiz"].innerHTML) && /Clear my answers/.test(p.els["profile-quiz"].innerHTML));
  p.click("profile-quiz", { "[data-quiz-act]": { dataset: { quizAct: "open" } } });
  check("taking the quiz again starts from the saved answers, and the first screen says Cancel (not Skip)", p.run("quizState.open") === true && p.run("quizState.answers.goal") === "check" && /Cancel/.test(p.card()) && !/Skip the quiz/.test(p.card()));
  p.docHandlers.keydown({ key: "Escape" });
  check("Escape closes it without changing anything", p.run("quizState.open") === false && p.saved().view === "simple" && p.saved().quiz.goal === "check");
  p.click("profile-quiz", { "[data-quiz-act]": { dataset: { quizAct: "clear" } } });
  const cleared = p.saved();
  check("Clear my answers removes the answers, the extras and the landing, keeps the view and the fact that the quiz was offered", cleared.quiz === null && cleared.extras.length === 0 && cleared.landing === null && cleared.onboarded === true && cleared.view === "simple");
  check("...the Overview's next step goes away and the Profile tab offers the quiz again", p.els.overviewNext.style.display === "none" && /Take the quiz/.test(p.els["profile-quiz"].innerHTML) && !/Take the quiz again/.test(p.els["profile-quiz"].innerHTML));
}
{
  const p = page();
  p.run("quizMaybeOpen()");
  p.act("skip");
  const s = p.saved();
  check("Skip changes nothing about the view, and is remembered so the quiz is not offered again by itself", s.onboarded === true && s.view === "advanced" && s.extras.length === 0 && s.quiz === null && p.run("quizState.open") === false && p.run("quizMaybeOpen()") === false);
  check("the Profile tab says the quiz was skipped and offers it", /You skipped the quiz/.test(p.els["profile-quiz"].innerHTML) && /Take the quiz/.test(p.els["profile-quiz"].innerHTML));
}
{
  const p = page();
  p.run("quizMaybeOpen()"); p.docHandlers.keydown({ key: "Escape" });
  check("Escape on the first run is a skip: remembered, nothing else changed", p.saved().onboarded === true && p.run("quizState.open") === false);
}
{
  // only a NEW session: one that already has pieces on the roof (resumed, loaded, or worked on) is not offered the quiz, an empty one is
  const worked = page();
  worked.run("var combineState = { items: [{ id: 1 }] }");
  check("a session that already has pieces on the roof is not a new session: the quiz is not offered", worked.run("quizSessionIsNew()") === false && worked.run("quizMaybeOpen()") === false && worked.run("quizState.open") === false);
  worked.run("combineState.items.length = 0");
  check("the same session emptied is new again, and the quiz is offered", worked.run("quizSessionIsNew()") === true && worked.run("quizMaybeOpen()") === true);
  const bare = page();
  check("with no session state at all (nothing loaded yet) it counts as new", bare.run("quizSessionIsNew()") === true);
  const p = page();
  p.run("quizOpen(null)"); p.docHandlers.keydown({ key: "Escape" });
  const again = page({ stored: { onboarded: true, view: "advanced" } });
  check("a person who has taken or skipped the quiz is not asked at the next new session (their answers are in the profile; the Profile tab has the quiz)", again.run("quizMaybeOpen()") === false);
}
{
  const set = page({ stored: { view: "simple", updated: "2026-09-25T10:00:00.000Z" } });
  check("someone who already set their profile by hand is not interrupted", set.run("quizMaybeOpen()") === false && set.run("quizState.open") === false);
  const p = page();
  p.run("quizOpen(null)");
  ["goal:design", "experience:expert"].forEach(x => p.option(x.split(":")[0], x.split(":")[1]));
  p.run("quizGo(4)");
  p.act("apply");
  const s = p.saved();
  check("an expert who takes the quiz gets the Advanced view, and the extras are still remembered for later", s.view === "advanced" && s.onboarded === true && s.landing === "site");
  check("applying an incomplete quiz does nothing", (() => { const q = page(); q.run("quizOpen(null)"); q.option("goal", "design"); q.act("apply"); return q.saved() === null; })());
}
{
  // words that are typed or come from files are put on the page escaped
  const p = page({ stored: { view: "simple", updated: "2026-09-25T10:00:00.000Z", quiz: { goal: "<img src=x onerror=alert(1)>", analyses: ["<b>x</b>"], site_data: [], experience: "first" } } });
  p.run("profileRender()");
  check("nothing in the answers is ever written as markup (unknown values are dropped by the core; what is shown is escaped)", !/<img|<b>x/.test(p.els["profile-quiz"].innerHTML) && !/<img|<b>x/.test(p.els.overviewNext.innerHTML));
  const src = read("quiz.js");
  check("every label and hint is put through escapeHtml, and the file has no bare fetch", (src.match(/\$\{[^}]*(label|hint|title|text)[^}]*\}/g) || []).every(m => /escapeHtml/.test(m) || /\.length|\.join|\?/.test(m)) && !/fetch\(/.test(src));
}

// ---------------------------------------------------------------------------------------------------------------- the site data typed in the quiz, and the Site tab it goes to
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
(async () => {
  const toSiteQuestion = p => { p.run("quizOpen(null)"); p.option("goal", "design"); p.act("next"); p.act("next"); };
  {
    const p = page();
    toSiteQuestion(p);
    check("the site question has no typing fields until the person says they have the location or the orientation", p.run("quizState.step") === 2 && !/quizSiteQuery|quizNorth/.test(p.card()));
    p.option("site_data", "location");
    check("saying they have the location shows an address field with a Search button and says how to use it", /id="quizSiteQuery"/.test(p.card()) && /data-quiz-act="site-search"/.test(p.card()) && /press Enter, and choose it from the list/.test(p.card()) && !/quizNorth/.test(p.card()));
    p.option("site_data", "orientation");
    check("saying they have the orientation shows a degrees field (0 to 359) too", /id="quizNorth"[^>]*min="0" max="359"/.test(p.card()) && /true north/.test(p.card()));
    // typing must never search: the public geocoder does not allow a search on every keystroke
    const before = p.card();
    for (const v of ["M", "Ma", "Mar", "Mari", "Marienstr", "Marienstraße 5 Paderborn"]) p.type("quizSiteQuery", v);
    await tick();
    check("typing only keeps the text: no search is made, and the card is not redrawn under the cursor", p.site.calls.find.length === 0 && p.card() === before && p.run("quizState.site.query") === "Marienstraße 5 Paderborn");
    p.act("site-search");
    await tick();
    check("the Search button searches once, for what was typed, and lists the places found", p.site.calls.find.length === 1 && p.site.calls.find[0] === "Marienstraße 5 Paderborn" && (p.card().match(/data-quiz-place=/g) || []).length === 2 && /Marienstraße 5, 33098 Paderborn/.test(p.card()) && /Choose the right one/.test(p.card()));
    check("the field keeps what was typed after the list appears", /id="quizSiteQuery" value="Marienstraße 5 Paderborn"/.test(p.card()));
    p.click("quizOverlay", { "[data-quiz-place]": { dataset: { quizPlace: "1" } } });
    check("choosing a place from the list shows it as chosen, closes the list, and says it goes to the Site tab when the quiz is applied", /quiz-chosen/.test(p.card()) && /Detmold/.test(p.card()) && !/data-quiz-place=/.test(p.card()) && /goes to the Site tab when you apply/.test(p.card()));
    p.act("site-clear");
    check("Change on a chosen place goes back to the search", !/quiz-chosen/.test(p.card()) && /id="quizSiteQuery"/.test(p.card()) && p.run("quizState.site.place") === null);
    p.key("quizSiteQuery", "Enter", "Marienstraße 5 Paderborn");
    await tick();
    check("Enter in the address field searches too", p.site.calls.find.length === 2 && (p.card().match(/data-quiz-place=/g) || []).length === 2);
    p.click("quizOverlay", { "[data-quiz-place]": { dataset: { quizPlace: "0" } } });
    p.type("quizNorth", "20");
    // on to the result and apply
    p.act("next"); p.option("experience", "some"); p.act("next");
    check("the result screen says what will be sent to the Site tab", /Location, sent to the Site tab: Marienstraße 5, 33098 Paderborn/.test(p.card()) && /Orientation, sent to the Site tab: 20° from the top of the plan to true north/.test(p.card()));
    p.act("apply");
    check("applying sends the chosen place (with the region the search gave) and the orientation to the Site tab", p.site.calls.place.length === 1 && p.site.calls.place[0].lat === 51.7189 && p.site.calls.place[0].addr.city === "Paderborn" && p.site.calls.north.join() === "20");
    check("...and the toast says so, and the profile got the answers (location and orientation ticked)", p.calls.toasts.some(t => /The location and the orientation sent to the Site tab\./.test(t)) && p.saved().quiz.site_data.join() === "location,orientation");
    check("a person who typed a location has a roof to place things on next: the workspace that opens is Site (no roof model yet)", p.calls.setMode.at(-1) === "site");
  }
  {
    const p = page();
    toSiteQuestion(p);
    p.option("site_data", "location");
    p.act("site-search");
    await tick();
    check("searching with nothing typed asks for at least three characters and makes no request", p.site.calls.find.length === 0 && /at least three characters/.test(p.card()));
    p.type("quizSiteQuery", "Pad"); p.site.fail = true; p.act("site-search"); await tick();
    check("a search that cannot be reached says so and points at the Site tab, and can be tried again", p.site.calls.find.length === 1 && /could not be reached/.test(p.card()) && /Site tab instead/.test(p.card()) && !/disabled/.test(p.card().replace(/data-quiz-act="next" disabled/, "")));
    p.site.fail = false; p.site.found = []; p.act("site-search"); await tick();
    check("a search that finds nothing says so", /Nothing was found/.test(p.card()) && p.site.calls.find.length === 2);
    p.site.found = [{ label: '<img src=x onerror="alert(1)">Weg 1', lat: 1, lng: 2, addr: null }];
    p.act("site-search"); await tick();
    check("names of places from the geocoder are put on the page escaped", !/<img/.test(p.card()) && /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;Weg 1/.test(p.card()));
    p.docHandlers.keydown({ key: "Escape" });
    check("Escape with a list open closes the list only; the quiz stays", p.run("quizState.open") === true && !/data-quiz-place=/.test(p.card()));
    p.docHandlers.keydown({ key: "Escape" });
    check("...and Escape again leaves the quiz", p.run("quizState.open") === false);
  }
  {
    const p = page();
    toSiteQuestion(p);
    p.option("site_data", "location"); p.type("quizSiteQuery", "Marienstraße 5 Paderborn"); p.act("site-search"); await tick();
    p.click("quizOverlay", { "[data-quiz-place]": { dataset: { quizPlace: "0" } } });
    p.option("site_data", "location");      // untick: they no longer say they have it
    p.act("next"); p.option("experience", "first"); p.act("next"); p.act("apply");
    check("a place that was chosen and then unticked is not sent", p.site.calls.place.length === 0 && !/Site tab/.test(p.calls.toasts.join(" ")));
  }
  {
    const p = page();
    toSiteQuestion(p);
    p.option("site_data", "orientation");
    for (const [typed, sent] of [["", null], ["abc", null], ["  ", null], ["45", 45], ["-10", -10], ["20,5", 20.5], ["380", 380]]) {
      p.type("quizNorth", typed);
      check("orientation typed as '" + typed + "' is " + (sent === null ? "not sent (it is not a number)" : "sent as " + sent), p.run("quizNorthValue()") === sent);
    }
    p.type("quizNorth", "-10");
    p.act("next"); p.option("experience", "first"); p.act("next");
    check("the result shows the orientation as a compass angle 0 to 359", /Orientation, sent to the Site tab: 350°/.test(p.card()));
  }
  {
    const p = page({ siteState: { lat: 52.5, lng: 13.4, address: "Alexanderplatz, Berlin", northSet: true, northDeg: 15 } });
    p.run("quizOpen(null)");
    check("what the Site tab already has is shown when the quiz is taken again, and not sent a second time", p.run("quizState.site.place.existing") === true && p.run("quizState.site.north") === "15");
    p.option("goal", "design"); p.act("next"); p.act("next");
    p.option("site_data", "location");
    check("...as 'already set on the Site tab'", /Alexanderplatz, Berlin/.test(p.card()) && /Already set on the Site tab/.test(p.card()));
    p.act("next"); p.option("experience", "first"); p.act("next"); p.act("apply");
    check("...so applying does not send it again", p.site.calls.place.length === 0);
  }
  {
    const src = read("quiz.js");
    const inputHandler = /overlay\.addEventListener\("input"[\s\S]*?\n    \}\);/.exec(src);
    check("the address is searched only when asked (Enter, the button); the typing handler never searches", !!inputHandler && !/quizSearchPlaces|siteFindPlaces/.test(inputHandler[0]) && (src.match(/siteFindPlaces\(/g) || []).length === 1 && /key === "Enter" && e\.target\.id === "quizSiteQuery"/.test(src));
    check("every place name and status put on the card goes through escapeHtml", (src.match(/\$\{[^}]*(s\.place\.label|r\.label|s\.status|s\.query|s\.north)[^}]*\}/g) || []).every(m => /escapeHtml/.test(m)));
  }

  // ---- the Site tab's own functions: the real siteField.js and siteController.js against a stand-in map and a stand-in geocoder
  {
    const map = { views: [], markers: [] };
    const fetches = [];
    let geocoder = () => ({ ok: true, status: 200, json: async () => [] });
    const sandbox = {
      console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error, encodeURIComponent, setTimeout, clearTimeout,
      document: { getElementById: id => (sandbox.__els[id] = sandbox.__els[id] || fakeElement()), createElement: () => fakeElement(), querySelectorAll: () => [] },
      __els: {}, requestAnimationFrame: fn => fn(),
      lookupWindZone: r => ({ zone: r && r.state === "Nordrhein-Westfalen" ? 2 : null, confidence: "auto", basis: "test" }),
      fetch: async url => { fetches.push(url); return geocoder(url); },
      L: {
        map: () => ({ setView(c, z) { map.views.push([c, z]); return this; }, on() {}, invalidateSize() {} }),
        tileLayer: () => ({ addTo() {} }),
        marker: ll => { const m = { ll, on() {}, addTo() { return m; }, setLatLng(x) { m.ll = x; }, getLatLng: () => ({ lat: m.ll[0], lng: m.ll[1] }) }; map.markers.push(m); return m; }
      }
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    for (const f of ["siteController.js", "siteField.js"]) vm.runInContext(read(f), ctx, { filename: f });
    const run = e => vm.runInContext(e, ctx);
    run("updateSiteUI = function () {}; resolveSiteRegion = function () { globalThis.__resolved = (globalThis.__resolved || 0) + 1; };");

    check("a place sent to the Site tab before its map exists sets the location, the address, the region and the wind zone, and puts no marker anywhere yet", (() => {
      run('siteApplyPlace({ label: "Marienstraße 5, Paderborn", lat: 51.7189, lng: 8.7575, addr: { state: "Nordrhein-Westfalen", city: "Paderborn", suburb: "x" } })');
      return run("siteState.lat") === 51.7189 && run("siteState.lng") === 8.7575 && run("siteState.address") === "Marienstraße 5, Paderborn" && run("siteState.region.state") === "Nordrhein-Westfalen" && run("siteState.region.suburb") === undefined
        && run("siteState.windZoneAuto.zone") === 2 && map.markers.length === 0 && sandbox.__els.siteAddressSearch.value === "Marienstraße 5, Paderborn";
    })());
    check("the region came with the search, so no second lookup was made", (sandbox.__resolved || 0) === 0 && fetches.length === 0);
    run("initSiteMap()");
    check("when the Site tab's map is made the marker is on the place that was sent, and the map is centred on it", map.markers.length === 1 && map.markers[0].ll[0] === 51.7189 && map.markers[0].ll[1] === 8.7575 && map.views.at(-1)[0][0] === 51.7189 && map.views.at(-1)[1] === 13);
    run('siteApplyPlace({ label: "Detmold", lat: 51.9361, lng: 8.8779, addr: null })');
    check("a second place moves the marker (no second marker) and, with no region from the search, asks for the region lookup", map.markers.length === 1 && map.markers[0].ll[0] === 51.9361 && sandbox.__resolved === 1);
    run("setSiteLocation(50, 9)");
    check("a click on the map still works as before: the state and the marker move, the region is looked up", run("siteState.lat") === 50 && map.markers[0].ll[0] === 50 && sandbox.__resolved === 2);
    run("siteApplyNorth(380)");
    check("the orientation sent to the Site tab is the slider's: the state, the slider and its label, as a compass angle", run("siteState.northDeg") === 20 && run("siteState.northSet") === true && sandbox.__els.siteNorthDeg.value === "20" && sandbox.__els["site-north-val"].textContent === "20°");
    run("siteApplyNorth(-90)");
    check("a negative angle is turned into its compass angle", run("siteState.northDeg") === 270);

    // the search itself
    geocoder = () => ({ ok: true, status: 200, json: async () => [
      { display_name: "Marienstraße 5, Paderborn", lat: "51.7189", lon: "8.7575", address: { state: "NRW" } },
      { display_name: "", lat: "1", lon: "2" }, { display_name: "No coordinates", lat: "x", lon: "y" }, { display_name: "Third", lat: "3", lon: "4" }] });
    const found = await run('siteFindPlaces("  Marienstraße 5 Paderborn ")');
    check("the search asks Nominatim for up to five places with their address parts, for the trimmed and encoded text", /nominatim\.openstreetmap\.org\/search\?/.test(fetches.at(-1)) && /limit=5/.test(fetches.at(-1)) && /addressdetails=1/.test(fetches.at(-1)) && /q=Marienstra%C3%9Fe%205%20Paderborn$/.test(fetches.at(-1)));
    check("it returns numbers, drops results with no name or no coordinates, and keeps the address parts for the wind zone", found.length === 2 && found[0].lat === 51.7189 && typeof found[0].lng === "number" && found[0].addr.state === "NRW" && found[1].label === "Third" && found[1].addr === null);
    const n = fetches.length;
    check("a text under three characters is not sent anywhere", (await run('siteFindPlaces("ab")')).length === 0 && (await run("siteFindPlaces(null)")).length === 0 && fetches.length === n);
    geocoder = () => ({ ok: false, status: 429, json: async () => ({}) });
    let failed = "";
    try { await run('siteFindPlaces("Paderborn")'); } catch (e) { failed = e.message; }
    check("a refusal from the service (rate limit) is an error the caller can say in words", /429/.test(failed));
    geocoder = () => ({ ok: true, status: 200, json: async () => ({ not: "a list" }) });
    check("an answer that is not a list is no places", (await run('siteFindPlaces("Paderborn")')).length === 0);
    check("the search is a function of its own that only the quiz calls: the Site tab's own search still runs only on Enter or its button", !/siteFindPlaces/.test(read("siteController.js")) && /keydown", e => \{\s*if \(e\.key === "Enter"\)/.test(read("siteController.js")));
  }

  console.log(fails === 0 ? "\nQUIZ OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
