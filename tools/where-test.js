// Tests for "what runs where" (whereCore.js, where.js). Run: node tools/where-test.js
//
// The rule is: decide in this app, build in Revit, and the engines (Unity, SOLIDWORKS) are programs Revit calls. This pins the wording of Revit's status, when an action that needs a
// program is blocked and why, that every claim on the Overview's card is about something the app really has (so the card cannot drift from the app), and, with the real where.js
// against a stand-in page, the pill, the badges and the card.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const where = require(path.join(web, "whereCore.js"));
const html = read("index.html");

// ---------------------------------------------------------------------------------------------------------------- the rule and the card
check("the rule is one short line: decide here, build in Revit, results come back to the Analysis tab", where.WHERE_RULE === "Decide here. Build in Revit. Results come back to the Analysis tab." && where.WHERE_RULE.length < 90);
check("the card has three columns: this app (decide), Revit (build), engines (Revit calls them)", where.WHERE_COLUMNS.map(c => c.key + ":" + c.tagline).join() === "app:Decide,revit:Build,engines:Revit calls them");
check("each column has three or four points, each one line (under 100 characters), and none uses the word 'bridge'", where.WHERE_COLUMNS.every(c => c.points.length >= 3 && c.points.length <= 4 && c.points.every(p => p.length > 15 && p.length < 100 && !/bridge/i.test(p))));
const icons = read("vendor/tabler-icons/tabler-icons.css");
check("the icons of the columns exist in the icon font", where.WHERE_COLUMNS.every(c => icons.includes("." + c.icon)));
check("the note on the same numbers is one sentence and names the analyses that agree in this app and in Revit", /Fire safety, accessibility and LCA give the same numbers here and in Revit/.test(where.WHERE_SAME_NUMBERS) && where.WHERE_SAME_NUMBERS.length < 130);

// what the card claims about this app must be true of this app
const analysisSrc = read("analysisController.js");
const store = require(path.join(web, "resultsStoreCore.js"));
check("'quick estimates: fire safety, accessibility, LCA, sun path, wind and water' are analyses this app computes itself: the results store has a quick estimate for each of fire safety, accessibility, rain (water), wind and LCA, computed by functions that exist, and the Sun group draws the site's sun path",
  store.RESULTS_CATALOGUE.filter(e => e.estimate).map(e => e.key).sort().join() === "accessibility,fire_safety,lca,soil_percolation,wind_erosion"
  && ["analyzeFireSafety", "analyzeAccessibility", "analyzeWaterManagement", "analyzeWindExposure", "analyzeLCA", "sunPathSectionHtml"].every(f => analysisSrc.includes("function " + f + "("))
  && /sunPathSectionHtml\(\)/.test(read("analysisResults.js"))
  && /quick estimates: fire safety, accessibility, LCA, sun path, wind and water/i.test(where.WHERE_COLUMNS[0].points.join(" ")));
check("'set the site: the address, which way it faces, the roof size' are inputs of the Site tab", ["siteAddressSearch", "siteNorthDeg", "roofLength", "roofWidth"].every(id => html.includes('id="' + id + '"')));
check("'place them on the roof by hand or by the algorithm' is the Combine tab's manual and algorithmic switch", /data-placement="manual"/.test(read("algoPlacementUI.js")) && /data-placement="algo"/.test(read("algoPlacementUI.js")) && /by hand or by the algorithm/.test(where.WHERE_COLUMNS[0].points.join(" ")));
check("'compare variants and save your sessions' are tabs of this app", html.includes('id="modeCompare"') && html.includes('id="modeSession"'));
check("the card's Revit column names what Revit does that this app does not: the model, the full analyses, schedules and documents", /full analyses/.test(where.WHERE_COLUMNS[1].points.join(" ")) && /Schedules/.test(where.WHERE_COLUMNS[1].points.join(" ")) && /families/.test(where.WHERE_COLUMNS[1].points.join(" ")));
check("the engines column says what Unity and SOLIDWORKS are for, and that both are optional", /Unity/.test(where.WHERE_COLUMNS[2].points[0]) && /videos/.test(where.WHERE_COLUMNS[2].points[0]) && /SOLIDWORKS/.test(where.WHERE_COLUMNS[2].points[1]) && /optional/.test(where.WHERE_COLUMNS[2].points[2]));

// ---------------------------------------------------------------------------------------------------------------- the status of Revit
const on = where.whereRevitState(true, "2025"), off = where.whereRevitState(false, ""), asking = where.whereRevitState(null, "");
check("connected: 'Revit 2025 connected' (the version when there is one), green", on.key === "connected" && on.label === "Revit 2025 connected" && where.whereRevitState(true, "").label === "Revit connected");
check("a version that is not a year is not shown (nothing odd from the add-in reaches the screen)", ["25", "<b>2025</b>", "2025 beta", null, undefined, 2025].every(v => where.whereRevitState(true, v).label === "Revit connected"));
check("not open: 'Revit not open', and the tooltip says 2D work goes on and what to open for the rest", off.key === "closed" && off.label === "Revit not open" && /2D/.test(off.title) && /open a project in Revit/.test(off.title));
check("before the first answer: 'Looking for Revit…'", asking.key === "looking" && /Looking for Revit/.test(asking.label));
check("every state has a tooltip that leads to the explanation (click), except while looking", on.title.length > 40 && /Click/.test(on.title) && /Click/.test(off.title));
check("not being in Revit is described as a normal state, never as an error", !/error|fail|problem|cannot|can't/i.test(off.title + off.label));

check("a tool of this computer is unknown until Revit is open, then found or not found", where.whereToolState("Unity", { found: true }, false).key === "unknown" && where.whereToolState("Unity", { found: true }, null).key === "unknown" && where.whereToolState("Unity", undefined, true).key === "unknown"
  && where.whereToolState("Unity", { found: true }, true).label === "Unity: found" && where.whereToolState("SOLIDWORKS", { found: false }, true).label === "SOLIDWORKS: not found");
check("a tool answer that is not an object, or a 'found' that is not exactly true, is not found", ["yes", 5, null].every(t => where.whereToolState("Unity", t, true).key === "unknown") && where.whereToolState("Unity", { found: "true" }, true).key === "missing");

// ---------------------------------------------------------------------------------------------------------------- can an action be done
const all = { connected: true, machine: { unity: { found: true }, solidworks: { found: true } } };
const noSw = { connected: true, machine: { unity: { found: true }, solidworks: { found: false } } };
const closed = { connected: false, machine: null };
check("an action that needs Revit is possible when Revit is connected, and says what to open when it is not", where.whereNeed("revit", all).ok && where.whereNeed("revit", all).reason === "" && !where.whereNeed("revit", closed).ok && /open a project with the Sportify tab/.test(where.whereNeed("revit", closed).reason) && !where.whereNeed("revit", { connected: null }).ok);
check("an action that needs Unity or SOLIDWORKS needs Revit open first (Revit is what calls them), then the tool", !where.whereNeed("unity", closed).ok && /Revit open, and Unity/.test(where.whereNeed("unity", closed).reason) && where.whereNeed("unity", all).ok && where.whereNeed("solidworks", all).ok && !where.whereNeed("solidworks", noSw).ok && /SOLIDWORKS, which was not found on this computer/.test(where.whereNeed("solidworks", noSw).reason));
check("Revit open but not yet saying what this computer has: the tool is not blocked (no guessing)", where.whereNeed("unity", { connected: true, machine: null }).ok && where.whereNeed("solidworks", { connected: true, machine: {} }).ok);
check("a need that is not one of ours is never blocked, and has no badge", (() => { const n = where.whereNeed("rhino", closed); return n.ok && n.name === "" && where.whereNeed(undefined, closed).ok && where.whereNeed(null, null).ok; })());
check("the badge names are Revit, Unity and SOLIDWORKS", where.whereNeed("revit", all).name === "Revit" && where.whereNeed("unity", all).name === "Unity" && where.whereNeed("solidworks", all).name === "SOLIDWORKS");
check("garbage contexts never throw", [undefined, null, 5, "x", {}, { connected: "true" }].every(c => ["revit", "unity", "solidworks"].every(n => { try { return typeof where.whereNeed(n, c).ok === "boolean"; } catch (e) { return false; } })));

// ---------------------------------------------------------------------------------------------------------------- the page
check("the top bar has the status pill (a button with its dot and label) among the controls at the top right", /class="top-right-controls"[\s\S]*?id="whereRevit"[\s\S]*?id="whereRevitLabel"/.test(html));
check("the Overview has the card, under its own heading, before 'What's new'", /<h2>What runs where<\/h2>[\s\S]*?id="overviewWhere"[\s\S]*?<h2>What's new<\/h2>/.test(html));
check("an action drawn by the page's own markup that needs Revit says so (data-needs)", /id="btn-send-iterations-revit" data-needs="revit"/.test(html));
const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
check("whereCore.js is loaded before where.js, both before the welcome screen and main.js", scripts.indexOf("whereCore.js") >= 0 && scripts.indexOf("whereCore.js") < scripts.indexOf("where.js") && scripts.indexOf("where.js") < scripts.indexOf("sessionGate.js") && scripts.indexOf("sessionGate.js") < scripts.indexOf("main.js"));
const bridge = read("workspaceBridge.js");
check("the workspace bridge tells where.js on every change, keeps the version the add-in gives, and draws the badge on the Deliverables actions and the Run button", /function workspaceChanged\(\) \{[\s\S]*?whereRender\(\)/.test(bridge) && /workspaceState\.revitVersion = typeof ws\.json\.revit_version === "string"/.test(bridge) && (bridge.match(/whereChipHtml\("revit"\)/g) || []).length === 2);
check("the profile tells where.js when what this computer has arrives or goes, and main.js starts it", (read("profile.js").match(/whereRender\(\)/g) || []).length === 2 && /whereInit\(\)/.test(read("main.js")));
check("the where files never fetch anything: the state is what the app already knows", !/fetch\(|localApi\(|localStorage/.test(read("where.js")) && !/fetch\(|document\.|window\./.test(read("whereCore.js")));
check("the pill gives way to the centred tab bar on narrow screens: label gone below 1240 px, the pill itself below 1000 px (found by measuring the real page: it overlapped the tabs)", /@media \(max-width: 1240px\) \{.*\.where-pill #whereRevitLabel \{ display: none/.test(read("style.css")) && /@media \(max-width: 1000px\) \{ \.where-pill \{ display: none/.test(read("style.css")));
check("the pill is grey when Revit is not open (not red), and the badge is grey when what it needs is missing", /\.where-dot \{[^}]*background: var\(--text-muted\)/.test(read("style.css")) && /\.where-chip-off \{[^}]*color: var\(--text-muted\)/.test(read("style.css")) && !/\.where-closed[^{]*\{[^}]*#ef4444/.test(read("style.css")));

// ---------------------------------------------------------------------------------------------------------------- where.js against a stand-in page
function fake() {
  const e = { _html: "", writes: 0, classes: new Set(), style: {}, dataset: {}, children: [], title: "", textContent: "", className: "", handlers: {},
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; this.writes++; },
    classList: null, appendChild(c) { this.children.push(c); return c; }, querySelector(sel) { return sel === ".where-chip" ? this.children.find(c => c.className.includes("where-chip")) || null : null; },
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }, scrollIntoView() { this.scrolled = (this.scrolled || 0) + 1; } };
  e.classList = { toggle: (c, on) => { const has = e.className.split(" ").includes(c); const want = on === undefined ? !has : on; const list = e.className.split(" ").filter(x => x && x !== c); if (want) list.push(c); e.className = list.join(" "); }, contains: c => e.className.split(" ").includes(c) };
  return e;
}
function page({ connected = null, version = "", machine = null } = {}) {
  const els = {}, needy = [fake(), fake()];
  needy[0].dataset.needs = "revit"; needy[1].dataset.needs = "unity";
  const calls = { setMode: [] };
  const sandbox = {
    console, JSON, Math, Promise, Object, Array, String, Number, Set, RegExp, Error, setTimeout: fn => { fn(); return 0; },
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    workspaceState: { connected, revitVersion: version }, profileState: { machine }, setMode: m => calls.setMode.push(m),
    document: { getElementById: id => (els[id] = els[id] || fake()), createElement: () => fake(), querySelectorAll: sel => (sel === "[data-needs]" ? needy : []) }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["whereCore.js", "where.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const run = e => vm.runInContext(e, ctx);
  return { els, needy, calls, run, sandbox };
}
{
  const p = page();
  p.run("whereInit()");
  check("before the first answer the pill says it is looking, and the card is there with the rule and the three columns", p.els.whereRevit.className === "where-pill where-looking" && p.els.whereRevitLabel.textContent === "Looking for Revit…" && /Decide here\. Build in Revit\./.test(p.els.overviewWhere.innerHTML) && (p.els.overviewWhere.innerHTML.match(/class="where-col /g) || []).length === 3);
  check("the card's chips say what cannot be known yet: Unity and SOLIDWORKS are unknown until Revit is open", /where-status-unknown[^>]*>[\s\S]*?Unity: unknown until Revit is open/.test(p.els.overviewWhere.innerHTML) && /SOLIDWORKS: unknown until Revit is open/.test(p.els.overviewWhere.innerHTML));
  const c = page({ connected: true, version: "2025", machine: { unity: { found: true }, solidworks: { found: false } } });
  c.run("whereInit()");
  check("connected: the pill says 'Revit 2025 connected' in green, and the card shows Revit connected, Unity found, SOLIDWORKS not found", c.els.whereRevit.className === "where-pill where-connected" && c.els.whereRevitLabel.textContent === "Revit 2025 connected" && /where-status-connected[\s\S]*?Revit 2025 connected/.test(c.els.overviewWhere.innerHTML) && /where-status-found[\s\S]*?Unity: found/.test(c.els.overviewWhere.innerHTML) && /where-status-missing[\s\S]*?SOLIDWORKS: not found/.test(c.els.overviewWhere.innerHTML));
  check("the pill's tooltip is the state's, so it explains itself on hover", c.els.whereRevit.title === where.whereRevitState(true, "2025").title);
  const o = page({ connected: false });
  o.run("whereInit()");
  check("not open: 'Revit not open', grey, and the chips do not pretend to know the tools", o.els.whereRevit.className === "where-pill where-closed" && o.els.whereRevitLabel.textContent === "Revit not open" && /where-status-closed/.test(o.els.overviewWhere.innerHTML) && /unknown until Revit is open/.test(o.els.overviewWhere.innerHTML));
  check("the badge is put on every element that says what it needs, once: Revit on the first, Unity on the second", c.needy[0].children.length === 1 && c.needy[0].children[0].textContent === "Revit" && c.needy[1].children.length === 1 && c.needy[1].children[0].textContent === "Unity");
  c.run("whereRender(); whereRender()");
  check("drawing again does not add a second badge", c.needy[0].children.length === 1 && c.needy[1].children.length === 1);
  check("a badge is 'on' when what it needs is there (title: this happens in Revit) and 'off' when it is not (title: what is needed)", !c.needy[0].children[0].className.includes("where-chip-off") && c.needy[0].children[0].title === "This happens in Revit." && (() => { o.run("whereRender()"); return o.needy[0].children[0].className.includes("where-chip-off") && /Needs Revit: open a project with the Sportify tab\./.test(o.needy[0].children[0].title); })());
  c.sandbox.workspaceState.connected = false; c.run("whereRender()");
  check("when the connection changes the pill, the badges and the card follow", c.els.whereRevit.className === "where-pill where-closed" && c.needy[0].children[0].className.includes("where-chip-off") && /where-status-closed/.test(c.els.overviewWhere.innerHTML));
  const q = page({ connected: true, version: "2025", machine: { unity: { found: true }, solidworks: { found: true } } });
  q.run("whereInit()"); const writes = q.els.overviewWhere.writes;
  q.run("whereRender(); whereRender(); whereRender()");
  check("the card is not redrawn when nothing in it changed (the poll calls this often)", q.els.overviewWhere.writes === writes);
  q.sandbox.profileState.machine = { unity: { found: false }, solidworks: { found: true } }; q.run("whereRender()");
  check("...and is redrawn when a tool appears or goes", q.els.overviewWhere.writes === writes + 1 && /Unity: not found/.test(q.els.overviewWhere.innerHTML));
  check("whereChipHtml gives the badge as markup for the places that draw their own buttons: escaped, with its title, nothing for a need that is not ours", (() => {
    const html = q.run('whereChipHtml("revit")');
    return /^<span class="where-chip" data-where-need="revit" title="This happens in Revit\.">Revit<\/span>$/.test(html) && /where-chip-off/.test(o.run('whereChipHtml("revit")')) && q.run('whereChipHtml("rhino")') === "" && q.run('whereChipHtml("<img>")') === "";
  })());
  for (const fn of p.els.whereRevit.handlers.click || []) fn();      // the handler whereInit() put on the pill (p was initialised above, once)
  check("a click on the pill opens the Overview and scrolls to the card", p.calls.setMode.at(-1) === "guide" && p.els.overviewWhere.scrolled === 1);
  const stripped = page({ connected: true });
  stripped.sandbox.document.getElementById = () => null;
  check("a page without the pill or the card does not break it", (() => { try { stripped.run("whereRender()"); return true; } catch (e) { return false; } })());
}

console.log(fails === 0 ? "\nWHERE OK" : `\n${fails} check(s) failed`);
process.exit(fails === 0 ? 0 : 1);
