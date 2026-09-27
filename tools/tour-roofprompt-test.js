// The guided tour and the question "What is this roof?" (roofProgram.js, tour.js). Run: node tools/tour-roofprompt-test.js
//
// Reported 2026-09-26: the tour was blocked when it was asked whether the roof is Sports Core, Garden Core or Mixed. The tour opens Combine to point at it, Combine asks that question when
// it opens and the roof has no type, and the question sat under the tour's dimmed screen (which cannot be clicked): neither could go on. The question now waits for the tour. This runs the
// real roofProgram.js and tour.js together against a stand-in page whose setMode does what main.js's does (Combine opening asks the question).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function fakeElement() {
  const attrs = {};
  const e = { innerHTML: "", style: {}, dataset: {}, handlers: {}, classes: new Set(), offsetWidth: 340, offsetHeight: 190, className: "", id: "",
    classList: null, querySelector: sel => (sel === '[data-tour-act="next"]' || sel === "[data-roof-program]" ? { focus() {} } : null),
    setAttribute(k, v) { attrs[k] = v; }, getAttribute: k => attrs[k],
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    remove() { if (e.id && e.registry && e.registry[e.id] === e) delete e.registry[e.id]; } };
  e.classList = { add: c => e.classes.add(c), remove: c => e.classes.delete(c), contains: c => e.classes.has(c) };
  return e;
}

function page({ program = null, mode = "guide" } = {}) {
  const registry = {};                 // what is in the page by id (the tour's own elements are always there; the question is only there while it is shown)
  const calls = { setMode: [], toasts: [], prompts: 0 };
  const docHandlers = {};
  const combineState = { roof: { program, source: "manual", length: 60, width: 30 } };
  ["tourOverlay", "tourSpot", "tourCard", "sessionGate"].forEach(id => { registry[id] = fakeElement(); registry[id].registry = registry; });
  registry.sessionGate.style.display = "none";
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error,
    setTimeout: fn => { Promise.resolve().then(fn); return 0; }, clearTimeout() {},
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    profileState: { profile: { view: "advanced", extras: [] } }, quizState: { open: false }, activeMode: mode, combineState,
    showToast: (t, m) => calls.toasts.push(t + ": " + m),
    // main.js's setMode, as far as this goes: the mode changes, and opening Combine asks for the roof type
    setMode: m => {
      calls.setMode.push(m); sandbox.activeMode = m;
      if (m === "combine" && typeof sandbox.roofProgramOnCombineOpen === "function") sandbox.roofProgramOnCombineOpen();
    },
    innerWidth: 1280, innerHeight: 720,
    document: {
      body: { appendChild: el => { if (el.id === "roof-program-prompt") calls.prompts++; el.registry = registry; registry[el.id] = el; } },
      getElementById: id => registry[id] || null,
      createElement: () => fakeElement(),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); }
    },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["profileCore.js", "roofProgram.js", "tourCore.js", "tour.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const run = e => vm.runInContext(e, ctx);
  run("tourInit()");
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
  const tourClick = act => { const target = { closest: sel => (sel === "[data-tour-act]" ? { dataset: { tourAct: act } } : null) }; for (const fn of registry.tourCard.handlers.click || []) fn({ target }); };
  const docClick = target => { for (const fn of docHandlers.click || []) fn({ target }); };
  const promptShown = () => !!registry["roof-program-prompt"];
  const promptText = () => (registry["roof-program-prompt"] || {}).innerHTML || "";
  return { calls, run, settle, tourClick, docClick, promptShown, promptText, combineState, sandbox, registry };
}
const pick = key => ({ closest: sel => (sel === "[data-roof-program]" ? { dataset: { roofProgram: key } } : null) });

(async () => {
  // ---- without the tour nothing changes: Combine asks
  {
    const p = page();
    p.sandbox.setMode("combine");
    check("without a tour, opening Combine on a roof with no type asks what the roof is (as before)", p.promptShown() && /What is this roof\?/.test(p.promptText()));
    p.docClick(pick("garden"));
    check("...and answering it sets the type and closes the question", p.combineState.roof.program === "garden" && !p.promptShown());
    const q = page({ program: "sports" });
    q.sandbox.setMode("combine");
    check("a roof that has a type is not asked", !q.promptShown() && q.calls.prompts === 0);
  }

  // ---- the tour passing through Combine
  {
    const p = page();
    check("the tour starts", p.run("tourStart()") === true);
    const sawPrompt = [];
    for (let i = 0; i < 20; i++) {
      await p.settle();
      sawPrompt.push(p.promptShown());
      if (!p.run("tourState.active")) break;
      p.tourClick("next");
    }
    check("the tour reaches Combine (Place them on the roof) and goes on past it", p.calls.setMode.includes("combine") && p.calls.setMode.indexOf("combine") < p.calls.setMode.length - 1);
    check("the question never appears on any step of the tour: it would cover the tour and stop it", sawPrompt.length > 5 && sawPrompt.every(s => !s) && p.calls.prompts === 0);
    check("the tour ends normally, and puts the person back where they started", p.run("tourState.active") === false && p.sandbox.activeMode === "guide" && p.calls.toasts.some(t => /That was the tour/.test(t)));
    check("the question is not asked at the end either when it was only Combine being visited (it comes when the person opens Combine for real)", !p.promptShown() && p.calls.prompts === 0);
    p.sandbox.setMode("combine");
    check("...and then it does come, as ever", p.promptShown() && p.calls.prompts === 1);
  }

  // ---- a roof that arrives while the tour runs
  {
    const p = page();
    p.run("tourStart()"); await p.settle();
    p.tourClick("next"); await p.settle();
    p.run('roofProgramOnFootprint("revit", "65,93 × 47,16 m")');
    check("a roof pushed from Revit during the tour does not open the question over it", !p.promptShown() && p.combineState.roof.source === "revit");
    p.tourClick("end"); await p.settle();
    check("when the tour ends the question is asked, with the size that arrived", p.promptShown() && /65,93 × 47,16 m/.test(p.promptText()));
    p.docClick(pick("mixed"));
    check("...and can be answered", p.combineState.roof.program === "mixed" && !p.promptShown());
  }
  {
    const p = page({ program: "garden" });
    p.run("tourStart()"); await p.settle();
    p.run('roofProgramOnFootprint("revit", "60 × 30 m")');
    p.tourClick("end"); await p.settle();
    check("a roof that already has a type is never asked, tour or not", !p.promptShown() && p.calls.prompts === 0);
  }

  // ---- the tour starting over a question that is already there (the quiz's 'Apply and show me around' can land in Combine)
  {
    const p = page({ mode: "combine" });
    p.sandbox.setMode("combine");       // the landing workspace opens: the question is on screen
    check("the question is on screen when the tour starts", p.promptShown());
    check("the tour starts anyway", p.run("tourStart()") === true);
    check("the question steps aside: it is not on screen under the tour", !p.promptShown());
    await p.settle();
    const during = [], asked = [];
    for (let i = 0; i < 20; i++) { if (!p.run("tourState.active")) break; during.push(p.promptShown()); asked.push(p.calls.prompts); p.tourClick("next"); await p.settle(); }
    check("through the whole tour it stays away (and Combine, visited on the way, does not ask again)", during.length > 5 && during.every(s => !s) && asked.every(n => n === 1));
    check("the tour ended in Combine where the person started, and the question is back, once (asked twice in all: at the start, and now)", p.calls.prompts === 2 && p.run("tourState.active") === false && p.sandbox.activeMode === "combine" && p.promptShown());
    p.docClick(pick("sports"));
    check("...and answering it works", p.combineState.roof.program === "sports" && !p.promptShown());
  }
  {
    const p = page({ mode: "combine" });
    p.sandbox.setMode("combine");
    p.run("tourStart()"); await p.settle();
    p.tourClick("end"); await p.settle();
    check("ending the tour at once brings the question back too", p.promptShown() && p.calls.prompts === 2);
  }
  {
    const p = page({ mode: "guide" });
    p.run("tourStart()"); await p.settle();
    p.run("tourEnd(false)");
    p.run("roofProgramAfterTour()");
    check("nothing waiting means nothing asked: ending a tour on its own never opens the question", !p.promptShown() && p.calls.prompts === 0);
  }

  // ---- the code itself
  {
    const rp = read("roofProgram.js"), tr = read("tour.js");
    check("the wiring: Combine's opening and a footprint check the tour; the tour tells roofProgram.js when it starts and ends", /function roofProgramOnCombineOpen\(\) \{\s*if \(roofTourRunning\(\)\) return;/.test(rp) && /roofProgramOnTourStart\(\)/.test(tr) && /roofProgramAfterTour\(\)/.test(tr));
    check("roofProgram.js asks tour.js's state inside a try (tour.js loads after it), and tour.js stays out of the roof state", /try \{ return tourState\.active === true; \} catch/.test(rp) && !/combineState/.test(tr));
  }

  console.log(fails === 0 ? "\nTOUR + ROOF QUESTION OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
