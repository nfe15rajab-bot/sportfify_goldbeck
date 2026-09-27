// Tests for workflowNext.js: the "Next" step through the design workflow (Site -> ... -> Revit families), skipping
// what the profile's view hides, shown/hidden for whatever mode is really on screen. Run: node tools/workflow-next-test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function fakeElement() {
  return { textContent: "", hidden: true, handlers: {}, addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }, click() { (this.handlers.click || []).forEach(fn => fn()); } };
}

function page(profile) {
  const els = { workflowNextBtn: fakeElement(), workflowNextLabel: fakeElement() };
  const sandbox = {
    console,
    document: { getElementById: id => els[id] },
    profileState: { profile },
    profileModeVisible: (view, mode, extras) => {
      const hiddenInSimple = ["structure", "conditions", "compare", "postAnalysis", "data", "families"];
      if (view !== "simple") return true;
      if (!hiddenInSimple.includes(mode)) return true;
      const extraModes = { structure: "structure", conditions: "conditions", compare: "compare", postAnalysis: "postAnalysis" };
      return Array.isArray(extras) && extras.some(e => extraModes[e] === mode);
    },
    PROFILE_MODES: {
      site: { label: "Site" }, structure: { label: "Structure inputs" }, conditions: { label: "Site conditions" }, sport: { label: "Sport" },
      gardenBlocks: { label: "Garden" }, combine: { label: "Combine" }, analysis: { label: "Results" }, compare: { label: "Compare" },
      postAnalysis: { label: "Improve" }, data: { label: "Catalogue" }, families: { label: "Revit families" },
      guide: { label: "Overview" }, deliverables: { label: "Documents" }, session: { label: "Save Session" }, profile: { label: "Profile" },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read("workflowNext.js"), sandbox, { filename: "workflowNext.js" });
  return { run: e => vm.runInContext(e, sandbox), els };
}

// ---------------------------------------------------------------------------------------------------------------- workflowNextMode: the order, Advanced (nothing hidden)
{
  const { run } = page({ view: "advanced", extras: [] });
  check("Advanced: the order is exactly Site, Structure inputs, Site conditions, Sport, Garden, Combine, Results, Compare, Improve, Catalogue, Revit families",
    run('WORKFLOW_ORDER.join(",")') === "site,structure,conditions,sport,gardenBlocks,combine,analysis,compare,postAnalysis,data,families");
  const order = ["site", "structure", "conditions", "sport", "gardenBlocks", "combine", "analysis", "compare", "postAnalysis", "data"];
  check("each step's next is exactly the one after it in that order, nothing skipped", order.every((m, i) => run(`workflowNextMode(${JSON.stringify(m)})`) === "families" || run(`workflowNextMode(${JSON.stringify(m)})`) === ["structure", "conditions", "sport", "gardenBlocks", "combine", "analysis", "compare", "postAnalysis", "data", "families"][i]));
  check("Revit families (the last step) has no next", run('workflowNextMode("families")') === null);
  check("a tab that frames the app rather than being a design step (Overview, Documents, Save Session, Profile) is not on the chain at all", ["guide", "deliverables", "session", "profile"].every(m => run(`workflowNextMode(${JSON.stringify(m)})`) === null));
  check("an unknown mode is quietly not on the chain either, never throws", run('workflowNextMode("nonsense")') === null);
}

// ---------------------------------------------------------------------------------------------------------------- Simple view: the hidden tabs are skipped, extras bring them back
{
  const { run } = page({ view: "simple", extras: [] });
  check("Simple, no extras: Site's next is Sport (Structure inputs and Site conditions are both hidden)", run('workflowNextMode("site")') === "sport");
  check("...and Sport's next is Garden, Garden's is Combine, Combine's is Results (still the main path)", run('workflowNextMode("sport")') === "gardenBlocks" && run('workflowNextMode("gardenBlocks")') === "combine" && run('workflowNextMode("combine")') === "analysis");
  check("...and Results is the end of Simple's own chain: Compare/Improve/Catalogue/Revit families are all hidden too, so there is no next at all", run('workflowNextMode("analysis")') === null);
}
{
  const { run } = page({ view: "simple", extras: ["structure"] });
  check("an extra brings its own tab back into the chain: Site's next is now Structure inputs (Site conditions is still hidden, so after it comes Sport directly)", run('workflowNextMode("site")') === "structure" && run('workflowNextMode("structure")') === "sport");
}
{
  const { run } = page({ view: "simple", extras: ["postAnalysis"] });
  check("Improve's own extra: Compare stays hidden (Results' next skips straight to Improve), and Improve's own next (Catalogue) is still hidden, so Improve is the end", run('workflowNextMode("analysis")') === "postAnalysis" && run('workflowNextMode("postAnalysis")') === null);
}
{
  const { run } = page({ view: "simple" });      // no extras array at all — must not throw
  check("a profile with no extras array (undefined, not even [])does not throw and behaves like no extras", run('workflowNextMode("site")') === "sport");
}
{
  const { run } = page(null);      // profileState.profile itself missing (before profile.js has set it up)
  check("no profile at all yet defaults to Advanced (nothing hidden) rather than throwing", run('workflowNextMode("site")') === "structure");
}

// ---------------------------------------------------------------------------------------------------------------- workflowNextUpdate: the button itself
{
  const { run, els } = page({ view: "advanced", extras: [] });
  run('workflowNextUpdate("site")');
  check("on a workflow tab, the button is shown with 'Next: <the next tab's real label>'", els.workflowNextBtn.hidden === false && els.workflowNextLabel.textContent === "Next: Structure inputs");
  run('workflowNextUpdate("families")');
  check("at the end of the chain, the button hides itself (and does not bother relabelling)", els.workflowNextBtn.hidden === true);
  run('workflowNextUpdate("guide")');
  check("on a framing tab (Overview), the button is hidden too", els.workflowNextBtn.hidden === true);
  run('workflowNextUpdate("nonsense")');
  check("an unknown mode hides it rather than throwing", els.workflowNextBtn.hidden === true);
}
{
  // missing elements (a page that has not loaded the button, or an older cached one): must not throw
  const sandbox = { console, document: { getElementById: () => null }, profileState: { profile: { view: "advanced", extras: [] } }, profileModeVisible: () => true, PROFILE_MODES: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("workflowNext.js"), sandbox, { filename: "workflowNext.js" });
  let threw = null;
  try { vm.runInContext('workflowNextUpdate("site")', sandbox); } catch (e) { threw = e; }
  check("no #workflowNextBtn/#workflowNextLabel on the page: workflowNextUpdate quietly does nothing, never throws", threw === null);
}

// ---------------------------------------------------------------------------------------------------------------- the button's own click handler
{
  const { run, els } = page({ view: "advanced", extras: [] });
  let calledWith = null;
  run('activeMode = "sport"; setMode = m => { calledWith = m; };');
  els.workflowNextBtn.click();
  check("clicking the button calls setMode with the real next mode for whatever activeMode actually is (not whatever was last labelled)", run("calledWith") === "gardenBlocks");
}
{
  const { run, els } = page({ view: "advanced", extras: [] });
  run('activeMode = "families"; called = false; setMode = () => { called = true; };');      // a plain assignment, not let/const: those do not persist into the next runInContext call, only a real global property does
  els.workflowNextBtn.click();
  check("clicking it at the end of the chain calls setMode with nothing (there is no next)", run("called") === false);
}

console.log(fails === 0 ? "\nWORKFLOW NEXT OK" : `\n${fails} check(s) failed`);
process.exit(fails === 0 ? 0 : 1);
