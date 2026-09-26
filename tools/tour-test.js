// Tests for the rundgang (tourCore.js, tour.js). Run: node tools/tour-test.js
//
// The tour is a walk through the real screens: it must only visit tabs the person's profile shows, point at things that are really in the page, put its card where it can be read, and
// leave the person where they were. This pins the plan for every profile the quiz can make, the geometry of the card, that every target still exists in index.html (so renaming an element
// cannot silently break the tour), and, with the real tour.js against a stand-in page, a whole tour with the buttons and the keyboard.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const core = require(path.join(web, "profileCore.js"));
const quiz = require(path.join(web, "quizCore.js"));
const tour = require(path.join(web, "tourCore.js"));
const html = read("index.html");

// ---------------------------------------------------------------------------------------------------------------- the plan
const adv = tour.tourPlan({ view: "advanced" });
const simple = tour.tourPlan({ view: "simple", extras: [] });
check("the steps have unique ids, a title, and words of a sentence or two (under 260 characters)", new Set(tour.TOUR_STEPS.map(s => s.id)).size === tour.TOUR_STEPS.length && tour.TOUR_STEPS.every(s => s.title && s.title.length <= 40 && s.mode && (s.target === null || typeof s.target === "string")) && adv.every(s => s.text.length > 20 && s.text.length <= 260));
check("Advanced sees the whole tour, in order, numbered 1 to " + adv.length, adv.length === tour.TOUR_STEPS.length && adv.every((s, i) => s.index === i + 1 && s.total === adv.length) && adv[0].id === "path" && adv.at(-1).id === "revit");
check("Simple leaves out the steps of the tabs it hides (structure, conditions, compare, post analysis) and keeps the rest", simple.map(s => s.id).join() === "path,topbar,rail,site,sport,combine,analysis,deliverables,profile,revit" && simple.every((s, i) => s.total === simple.length && s.index === i + 1));
check("an extra the quiz added brings its step back, in its place in the tour", tour.tourPlan({ view: "simple", extras: ["structure", "postAnalysis"] }).map(s => s.id).join() === "path,topbar,rail,site,sport,combine,analysis,structure,postAnalysis,deliverables,profile,revit" && tour.tourPlan({ view: "simple", extras: ["safety", "carbon"] }).length === simple.length);
check("extras change nothing in Advanced, which sees everything anyway", tour.tourPlan({ view: "advanced", extras: ["structure"] }).length === adv.length);
check("the words follow the view: the rail step says which view it is, and where the other one is", /Simple view/.test(simple.find(s => s.id === "rail").text) && /Advanced view/.test(adv.find(s => s.id === "rail").text) && simple.find(s => s.id === "path").text !== adv.find(s => s.id === "path").text);
check("anything that is not a profile is the Advanced tour, and never throws", [null, undefined, 5, "x", [], {}, { view: "expert" }, { view: "simple", extras: "structure" }].every(g => { const p = tour.tourPlan(g); return Array.isArray(p) && p.length >= simple.length; }) && tour.tourPlan({ view: "expert" }).length === adv.length);
check("the tour never opens a tab the profile hides: every step's workspace is shown in that profile (every profile the quiz can make)", (() => {
  const goals = ["design", "check", "documents", null], exps = ["first", "some", "expert"];
  const analyses = [[], ["structure"], ["sun", "rain"], ["kinetics"], ["safety", "carbon"], quiz.QUIZ_QUESTIONS[1].options.map(o => o.value)];
  let n = 0;
  for (const g of goals) for (const e of exps) for (const a of analyses) {
    const o = quiz.quizOutcome({ goal: g, analyses: a, site_data: [], experience: e });
    const plan = tour.tourPlan({ view: o.view, extras: o.extras }); n++;
    if (!plan.length || !plan.every(s => core.profileModeVisible(o.view, s.mode, o.extras))) return false;
  }
  return n === 72;
})());
check("it starts on the Overview and ends with the words about Revit (no target: only words)", adv[0].mode === "guide" && adv.at(-1).target === null && /Revit/.test(adv.at(-1).text));

// ---------------------------------------------------------------------------------------------------------------- the page it points at
const cssSelectorPresent = sel => sel.split(/\s+/).every(part => {
  const id = /^#([\w-]+)$/.exec(part), cls = /^\.([\w-]+)$/.exec(part), attr = /^\[([\w-]+)\]$/.exec(part);
  if (id) return html.includes('id="' + id[1] + '"');
  if (cls) return new RegExp('class="[^"]*\\b' + cls[1] + '\\b[^"]*"').test(html);
  if (attr) return html.includes(attr[1]);
  return false;
});
check("every element the tour points at is in the page (an id, a class or an attribute of index.html)", tour.TOUR_STEPS.filter(s => s.target).every(s => cssSelectorPresent(s.target)), tour.TOUR_STEPS.filter(s => s.target && !cssSelectorPresent(s.target)).map(s => s.id + ":" + s.target).join(","));
check("every workspace the tour opens is one main.js opens (and the profile knows)", tour.TOUR_STEPS.every(s => core.PROFILE_MODES[s.mode] && new RegExp('setMode\\("' + s.mode + '"\\)').test(read("main.js"))));
check("the page has the tour's overlay, spotlight and card (a dialog), and two buttons that offer it (the Overview, the Profile tab)", /id="tourOverlay"/.test(html) && /id="tourSpot"/.test(html) && /id="tourCard"[^>]*role="dialog"/.test(html) && (html.match(/data-tour-start/g) || []).length === 2);
const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
check("the scripts load in this order: profileCore, quizCore, quiz, tourCore, tour, then the welcome screen and main.js", ["profileCore.js", "quizCore.js", "quiz.js", "tourCore.js", "tour.js", "sessionGate.js", "main.js"].every((f, i, all) => scripts.includes(f) && (i === 0 || scripts.indexOf(all[i - 1]) < scripts.indexOf(f))));
check("main.js starts the tour's wiring, the quiz can end with 'Apply and show me around', and the tour's core never touches the page or the network", /tourInit\(\)/.test(read("main.js")) && /apply-tour/.test(read("quiz.js")) && !/document\.|window\.|fetch\(|localStorage/.test(read("tourCore.js")));
check("the overlay sits above the quiz and the welcome screen, and catches clicks so the page behind cannot be used", (() => { const css = read("style.css"); const z = re => Number((re.exec(css) || [0, 0])[1]); return z(/\.tour-overlay \{[^}]*z-index: (\d+)/) > z(/\.quiz-overlay \{[^}]*z-index: (\d+)/) && z(/\.quiz-overlay \{[^}]*z-index: (\d+)/) > z(/\.session-gate \{[^}]*z-index: (\d+)/) && !/\.tour-overlay \{[^}]*pointer-events: none/.test(css) && /\.tour-spot \{[^}]*pointer-events: none/.test(css); })());

// ---------------------------------------------------------------------------------------------------------------- where the card goes
const view = { w: 1280, h: 720 }, card = { w: 360, h: 200 };
const inside = (p, margin = 12) => p.left >= margin - 0.001 && p.top >= margin - 0.001 && p.left + card.w <= view.w - margin + 0.001 && p.top + card.h <= view.h - margin + 0.001;
const overlap = (p, r) => p.left < r.x + r.w && p.left + card.w > r.x && p.top < r.y + r.h && p.top + card.h > r.y;
check("a target near the top gets the card below it, centred on it", (() => { const r = { x: 500, y: 60, w: 200, h: 40 }, p = tour.tourCardPlacement(r, view, card); return p.side === "below" && p.top === 114 && Math.abs(p.left + card.w / 2 - (r.x + r.w / 2)) < 0.5 && inside(p) && !overlap(p, r); })());
check("a target at the bottom gets the card above it", (() => { const r = { x: 500, y: 640, w: 200, h: 40 }, p = tour.tourCardPlacement(r, view, card); return p.side === "above" && inside(p) && !overlap(p, r); })());
check("a tall target with no room above or below gets the card beside it (right, else left)", (() => {
  const a = { x: 40, y: 20, w: 120, h: 690 }, pa = tour.tourCardPlacement(a, view, card);
  const b = { x: 1100, y: 20, w: 150, h: 690 }, pb = tour.tourCardPlacement(b, view, card);
  return pa.side === "right" && inside(pa) && !overlap(pa, a) && pb.side === "left" && inside(pb) && !overlap(pb, b);
})());
check("a target that fills the window gets the card over its middle (there is nowhere else)", (() => { const r = { x: 0, y: 0, w: 1280, h: 720 }, p = tour.tourCardPlacement(r, view, card); return p.side === "over" && inside(p); })());
check("no target: the card is centred", (() => { const p = tour.tourCardPlacement(null, view, card); return p.side === "center" && Math.abs(p.left + card.w / 2 - view.w / 2) < 0.5 && Math.abs(p.top + card.h / 2 - view.h / 2) < 0.5; })());
check("a target at the left edge keeps the card inside the window (clamped, not cut off)", (() => { const r = { x: 0, y: 100, w: 30, h: 30 }, p = tour.tourCardPlacement(r, view, card); return inside(p); })());
check("for any target anywhere in windows of many sizes the card stays inside the window and off the target (unless nothing else fits)", (() => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4000; i++) {
    const v = { w: 700 + Math.floor(rnd() * 1300), h: 480 + Math.floor(rnd() * 700) };
    const c = { w: 300 + Math.floor(rnd() * 100), h: 140 + Math.floor(rnd() * 120) };
    const r = { x: Math.floor(rnd() * v.w * 0.9), y: Math.floor(rnd() * v.h * 0.9), w: 10 + Math.floor(rnd() * v.w * 0.8), h: 10 + Math.floor(rnd() * v.h * 0.8) };
    r.w = Math.min(r.w, v.w - r.x); r.h = Math.min(r.h, v.h - r.y);
    const p = tour.tourCardPlacement(r, v, c);
    const ok = p.left >= 12 - 0.001 && p.top >= 12 - 0.001 && p.left + c.w <= v.w - 12 + 0.001 && p.top + c.h <= v.h - 12 + 0.001;
    const clear = p.side === "over" || !(p.left < r.x + r.w && p.left + c.w > r.x && p.top < r.y + r.h && p.top + c.h > r.y);
    if (!ok || !clear) return false;
  }
  return true;
})());
check("the spotlight is the target with 6 pixels of air, kept inside the window; nothing to light without a size", (() => {
  const s = tour.tourSpotRect({ x: 100, y: 50, w: 200, h: 40 }, view), edge = tour.tourSpotRect({ x: 0, y: 0, w: 1280, h: 720 }, view);
  return s.x === 94 && s.y === 44 && s.w === 212 && s.h === 52 && edge.x === 0 && edge.y === 0 && edge.w === 1280 && edge.h === 720 && tour.tourSpotRect(null, view) === null && tour.tourSpotRect({ x: 1, y: 1, w: 0, h: 10 }, view) === null && tour.tourSpotRect({ x: 1, y: 1, w: 10, h: -3 }, view) === null;
})());

// ---------------------------------------------------------------------------------------------------------------- tour.js against a stand-in page
function fakeElement() {
  const e = { innerHTML: "", style: {}, dataset: {}, handlers: {}, classes: new Set(), focused: 0, offsetWidth: 340, offsetHeight: 190, scrolled: 0,
    classList: null, querySelector: sel => (sel === '[data-tour-act="next"]' ? { focus() { e.focused++; } } : null),
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); } };
  e.classList = { add: c => e.classes.add(c), remove: c => e.classes.delete(c), contains: c => e.classes.has(c) };
  return e;
}
function page({ profile = { view: "advanced", extras: [] }, mode = "guide", gate = false, quizOpen = false, targets = null, width = 1280, height = 720 } = {}) {
  const els = {};
  const calls = { setMode: [], toasts: [], draws: 0 };
  const rects = targets || {};
  const docHandlers = {}, winHandlers = {};
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error,
    setTimeout: fn => { Promise.resolve().then(fn); return 0; }, clearTimeout() {},
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    profileState: { profile }, activeMode: mode, quizState: { open: quizOpen },
    showToast: (t, m) => calls.toasts.push(t + ": " + m),
    setMode: m => { calls.setMode.push(m); sandbox.activeMode = m; },
    innerWidth: width, innerHeight: height,
    document: {
      getElementById: id => (els[id] = els[id] || fakeElement()),
      querySelector: sel => (rects[sel] ? { getBoundingClientRect: () => rects[sel], scrollIntoView() { calls.scrolled = (calls.scrolled || 0) + 1; } } : null),
      addEventListener: (t, fn) => { docHandlers[t] = fn; }
    },
    addEventListener: (t, fn) => { winHandlers[t] = fn; }
  };
  sandbox.window = sandbox;
  els.sessionGate = fakeElement();      // the welcome screen: showing, or already closed (display none) as it is once a person has moved on
  els.sessionGate.style.display = gate ? "flex" : "none";
  const ctx = vm.createContext(sandbox);
  for (const f of ["profileCore.js", "tourCore.js", "tour.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const run = e => vm.runInContext(e, ctx);
  run("tourInit()");
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
  const click = act => { const target = { closest: sel => (sel === "[data-tour-act]" ? { dataset: { tourAct: act } } : null) }; for (const fn of els.tourCard.handlers.click || []) fn({ target }); };
  const key = k => { let prevented = false; docHandlers.keydown({ key: k, preventDefault() { prevented = true; } }); return prevented; };
  return { els, calls, run, settle, click, key, docHandlers, winHandlers, sandbox, card: () => els.tourCard.innerHTML, spot: () => els.tourSpot.style, overlay: () => els.tourOverlay };
}
const R = (x, y, w, h) => ({ left: x, top: y, width: w, height: h });
const allTargets = () => Object.fromEntries(tour.TOUR_STEPS.filter(s => s.target).map((s, i) => [s.target, R(100 + i * 10, 80 + i * 20, 300, 60)]));

(async () => {
  {
    const p = page({ targets: allTargets() });
    check("start opens the overlay on the first step: its number, its title, its words, and Back is disabled on the first", p.run("tourStart()") === true && (await p.settle(), p.overlay().style.display === "block") && /Step 1 of 14/.test(p.card()) && /The path Sportify follows/.test(p.card()) && /data-tour-act="back" disabled/.test(p.card()) && />Next</.test(p.card().replace(/<i[^>]*><\/i>/g, "")));
    check("the target is lit: the spotlight sits on it (with the air around it) and the page is not dimmed as a whole", p.spot().display === "block" && p.spot().left === "94px" && p.spot().top === "74px" && !p.overlay().classes.has("tour-dim"));
    check("the card is placed by the geometry (below the target) and shown, and Next has the keyboard focus", p.els.tourCard.style.visibility === "visible" && Number.parseFloat(p.els.tourCard.style.top) > 140 && p.els.tourCard.focused >= 1);
    check("the target is scrolled into view", p.calls.scrolled >= 1);
    check("the workspace the tour starts on is the one it is already on: no needless switch", p.calls.setMode.length === 0);
    p.click("next"); await p.settle();
    check("Next goes to step 2 (same workspace: nothing is switched)", /Step 2 of 14/.test(p.card()) && /The top bar/.test(p.card()) && p.calls.setMode.length === 0);
    for (let i = 0; i < 2; i++) { p.click("next"); await p.settle(); }
    check("a step in another workspace opens it first (the site tab for step 4), then points at it", /Step 4 of 14/.test(p.card()) && p.calls.setMode.at(-1) === "site" && p.sandbox.activeMode === "site");
    p.click("back"); await p.settle();
    check("Back goes to the step before, into its workspace (the Overview again)", /Step 3 of 14/.test(p.card()) && p.calls.setMode.at(-1) === "guide" && !/data-tour-act="back" disabled/.test(p.card()));
    for (let i = 0; i < 20; i++) { if (!p.run("tourState.active")) break; p.click("next"); await p.settle(); }
    const visited = p.calls.setMode.filter((m, i, a) => i === 0 || m !== a[i - 1]);
    check("going through the whole tour visits the workspaces in the plan's order", visited.join() === "site,guide,site,sport,combine,analysis,structure,conditions,compare,postAnalysis,deliverables,profile,guide", visited.join());
    check("the last step says Finish, and finishing closes the overlay, puts the person back on the Overview, and says so", p.overlay().style.display === "none" && p.run("tourState.active") === false && p.sandbox.activeMode === "guide" && p.calls.toasts.some(t => /That was the tour/.test(t)));
  }
  {
    const p = page({ targets: allTargets() });
    p.run("tourStart()"); await p.settle();
    for (let i = 0; i < 13; i++) { p.click("next"); await p.settle(); }
    check("the last step is only words: no spotlight, the page is dimmed as a whole, and the card is centred", /Step 14 of 14/.test(p.card()) && /In Revit/.test(p.card()) && /Finish/.test(p.card()) && p.spot().display === "none" && p.overlay().classes.has("tour-dim") && Math.abs(Number.parseFloat(p.els.tourCard.style.left) + 170 - 640) < 1);
  }
  {
    const p = page({ targets: allTargets() });
    p.run("tourStart()"); await p.settle();
    check("ArrowRight goes forward and is handled (the page is not scrolled by it)", p.key("ArrowRight") === true && (await p.settle(), /Step 2 of 14/.test(p.card())));
    check("ArrowLeft goes back", p.key("ArrowLeft") === true && (await p.settle(), /Step 1 of 14/.test(p.card())));
    p.key("ArrowLeft"); await p.settle();
    check("Back on the first step does nothing", /Step 1 of 14/.test(p.card()));
    check("Enter is left to the focused button (no second Next from the keyboard handler)", p.key("Enter") === false && (await p.settle(), /Step 1 of 14/.test(p.card())));
    for (let i = 0; i < 4; i++) { p.key("ArrowRight"); await p.settle(); }
    p.key("Escape");
    check("Escape ends the tour without the 'that was the tour' message, and puts the person back where they started", p.overlay().style.display === "none" && !p.run("tourState.active") && p.sandbox.activeMode === "guide" && !p.calls.toasts.length);
    check("keys do nothing when there is no tour", p.key("ArrowRight") === false && p.overlay().style.display === "none");
  }
  {
    const p = page({ mode: "combine", targets: allTargets() });
    p.run("tourStart()"); await p.settle();
    p.click("next"); await p.settle();
    p.click("end"); await p.settle();
    check("ending the tour from a workspace other than the Overview puts the person back in it (where they started)", p.sandbox.activeMode === "combine" && p.overlay().style.display === "none" && p.calls.setMode.at(-1) === "combine");
    check("the tour can be taken again after it ended", p.run("tourStart()") === true && (await p.settle(), /Step 1 of 14/.test(p.card())));
  }
  {
    const p = page({ profile: { view: "simple", extras: [] }, targets: allTargets() });
    p.run("tourStart()"); await p.settle();
    for (let i = 0; i < 12; i++) { if (!p.run("tourState.active")) break; p.click("next"); await p.settle(); }
    check("the Simple tour has 10 steps and never switches to a workspace Simple hides", p.run("tourState.plan.length") === 10 && p.calls.setMode.every(m => core.profileModeVisible("simple", m, [])), p.calls.setMode.join());
  }
  {
    const p = page({ targets: {} });
    p.run("tourStart()"); await p.settle();
    check("a target that is not in the page is not pointed at: the card is centred and the page dimmed, and the tour goes on", p.spot().display === "none" && p.overlay().classes.has("tour-dim") && /Step 1 of 14/.test(p.card()));
    const q = page({ targets: Object.assign(allTargets(), { "#overviewWorkflow": R(10, 10, 0, 0) }) });
    q.run("tourStart()"); await q.settle();
    check("a target that is hidden (no size) is treated the same way", q.spot().display === "none" && q.overlay().classes.has("tour-dim"));
  }
  {
    check("the tour does not start over the welcome screen", page({ gate: true, targets: allTargets() }).run("tourStart()") === false);
    check("...or over the quiz", page({ quizOpen: true, targets: allTargets() }).run("tourStart()") === false);
    const p = page({ targets: allTargets() });
    p.run("tourStart()");
    check("...or a second time while it runs", p.run("tourStart()") === false);
    const g = page({ gate: true, targets: allTargets() }); g.els.sessionGate.classList.add("session-gate-hidden");
    check("a welcome screen that is fading out is no longer in the way", g.run("tourStart()") === true);
  }
  {
    const p = page({ targets: allTargets() });
    p.run("tourStart()"); await p.settle();
    p.click("next"); p.click("next"); p.click("next"); await p.settle();
    check("clicking Next several times quickly ends on the right step, drawn once (a slow step never overwrites a newer one)", /Step 4 of 14/.test(p.card()) && p.run("tourState.index") === 3);
  }
  {
    const t = allTargets();
    const p = page({ targets: t });
    p.run("tourStart()"); await p.settle();
    const before = p.els.tourSpot.style.left;
    t["#overviewWorkflow"] = R(300, 300, 300, 60);
    p.winHandlers.resize(); await p.settle();
    check("resizing the window draws the step again where its target is now", before === "94px" && p.els.tourSpot.style.left === "294px" && p.els.tourSpot.style.top === "294px");
  }
  {
    const p = page({ targets: allTargets() });
    p.docHandlers.click({ target: { closest: sel => (sel === "[data-tour-start]" ? {} : null) } }); await p.settle();
    check("anything marked data-tour-start starts the tour (the Overview's button, the Profile tab's)", p.run("tourState.active") === true && /Step 1 of 14/.test(p.card()));
    const q = page({ targets: allTargets() });
    q.docHandlers.click({ target: { closest: () => null } }); await q.settle();
    check("a click on anything else does not", q.run("tourState.active") === false);
  }
  {
    const src = read("tour.js");
    check("the card's words go through escapeHtml, and the tour talks to the page only through setMode, querySelector and the overlay (no fetch, no storage)", (src.match(/\$\{[^}]*(step\.title|step\.text)[^}]*\}/g) || []).every(m => /escapeHtml/.test(m)) && !/fetch\(|localStorage|XMLHttpRequest|innerHTML\s*=\s*step/.test(src));
    check("what the tour does not touch: it never changes the profile, the session or the site", !/profileChange|applySessionSnapshot|siteState|combineState/.test(src));
  }

  // ---- the quiz's 'Apply and show me around'
  {
    const quizSrc = read("quiz.js");
    check("the quiz's result screen offers 'Apply and show me around' next to 'Apply and start', and it starts the tour after the landing workspace is on screen", /data-quiz-act="apply-tour"/.test(quizSrc) && /data-quiz-act="apply"/.test(quizSrc) && /options && options\.tour && typeof tourStart === "function"\) setTimeout\(tourStart, 500\)/.test(quizSrc) && /quizApply\(\{ tour: true \}\)/.test(quizSrc));
  }

  console.log(fails === 0 ? "\nTOUR OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
