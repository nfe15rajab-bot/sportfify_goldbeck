// Tests for what the tabs are called (profileCore.js PROFILE_MODES is the table) and for the one wording of "Revit is not there". Run: node tools/names-test.js
//
// The tabs were renamed so that a newcomer can tell what each is for: Analysis -> Results, Post Analysis -> Improve, Data -> Catalogue, Families -> Revit families,
// Deliverables -> Documents, Structure -> Structure inputs (and Site conditions keeps its name). The ids (analysis, postAnalysis, data, families, deliverables ...) stay: code, saved
// profiles and the Revit add-in know them. This pins the table against the page (the rail, the top bar, the tooltips), that the words the quiz and the tour use are the table's, and
// that no text of the app still calls a tab by an older name or says "Revit is not connected" one way here and "not reachable" another there.
const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const core = require(path.join(web, "profileCore.js"));
const tour = require(path.join(web, "tourCore.js"));
const quiz = require(path.join(web, "quizCore.js"));
const where = require(path.join(web, "whereCore.js"));
const html = read("index.html");
const M = core.PROFILE_MODES;

// ---------------------------------------------------------------------------------------------------------------- the table
check("the ids of the workspaces are the ones code, saved profiles and the add-in know (only the words changed)", Object.keys(M).join() === "guide,site,structure,conditions,sport,combine,analysis,compare,postAnalysis,data,families,deliverables,session,profile");
check("the new names: Results, Improve, Catalogue, Revit families, Documents, Structure inputs, Site conditions", ["analysis:Results", "postAnalysis:Improve", "data:Catalogue", "families:Revit families", "deliverables:Documents", "structure:Structure inputs", "conditions:Site conditions"].every(p => M[p.split(":")[0]].label === p.split(":")[1]));
check("every name is unique, so no two tabs can be confused", new Set(Object.values(M).map(m => m.label)).size === Object.keys(M).length);
check("a rail label fits on two lines of the 48 px rail (no word over 10 characters, 18 in all), a top bar label on one (16 at most)", Object.entries(M).every(([id, m]) => {
  const rail = html.includes(`<button id="${m.button}" class="activity-icon"`);
  return rail ? m.label.length <= 18 && m.label.split(" ").every(w => w.length <= 10) : m.label.length <= 16;
}));

// ---------------------------------------------------------------------------------------------------------------- the page says what the table says
const button = id => { const m = new RegExp(`<button id="${id}"([^>]*)>([\\s\\S]*?)</button>`).exec(html); return m ? { attrs: m[1], inner: m[2] } : null; };
const text = inner => inner.replace(/<[^>]+>/g, "").trim();
const attr = (attrs, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(attrs); return m ? m[1].replace(/&amp;/g, "&") : null; };
Object.entries(M).forEach(([id, m]) => {
  const b = button(m.button);
  check(`the button of "${id}" says "${m.label}"${m.title ? " and its tooltip says what it is for" : ""}`, !!b && text(b.inner) === m.label && (!m.title || attr(b.attrs, "title") === m.title));
});
check("the panels are headed with the same words: Structure inputs, Site conditions, Catalogue, Improve, Documents & files, and the Results heading in the tab's first group", /<h2>Structure inputs<\/h2>/.test(html) && /<h2>Site conditions<\/h2>/.test(html) && /<h2>Catalogue<\/h2>/.test(html) && /<h2>Improve<\/h2>/.test(html) && /<h1>Documents &amp; files<\/h1>/.test(html) && /id="analysis-heading">Results: /.test(html));
check("the Overview's path names the tab: Results", /<span class="workflow-label">Results<\/span>/.test(html) && /Combine, Results, Compare and the Catalogue/.test(html));
const rule = where.WHERE_RULE;
check("the rule that comes with the Overview's card sends the answers to the Results tab", /Results tab/.test(rule) && rule.length < 90);

// ---------------------------------------------------------------------------------------------------------------- the words other screens use are the table's
const steps = tour.TOUR_STEPS, stepText = id => steps.find(s => s.id === id).text({ view: "advanced" });
check("the tour names the top bar tabs as they are: Overview, Documents, Save Session, Profile", ["guide", "deliverables", "session", "profile"].every(m => stepText("topbar").includes(M[m].label)));
check("the tour's step for each renamed tab has its new name as its title or in its words", steps.find(s => s.id === "structure").title === M.structure.label && steps.find(s => s.id === "postAnalysis").title === M.postAnalysis.label && steps.find(s => s.id === "conditions").title === M.conditions.label && /Results/.test(stepText("path")));
const out = (goal, analyses) => quiz.quizOutcome({ goal, analyses, site_data: ["roof_outline"], experience: "some" });
check("the quiz sends a person to the tab by its name: Results after 'check', Documents after 'documents'", out("check", ["sun"]).next.text.includes(M.analysis.label) && out("documents", []).next.text.includes(M.deliverables.label));
check("the extras the quiz adds to the Simple view carry the names of the tabs they bring back", core.PROFILE_EXTRAS.structure.label === M.structure.label && core.PROFILE_EXTRAS.conditions.label === M.conditions.label && core.PROFILE_EXTRAS.postAnalysis.label.startsWith(M.postAnalysis.label));

// ---------------------------------------------------------------------------------------------------------------- nothing still uses an older name or a second wording
const OLD = [
  /\bAnalysis tab\b/, /\bPost Analysis\b/, /post-analysis/i, /\bdata tables\b/i, /take the deliverables/i, /\bDeliverables tab\b/, /\bData tab\b/, /\bFamilies tab\b/, /\bRevit Families\b/, /\bStructure tab\b/,
  /Revit is not connected/i, /Not connected to Revit/i, /Revit not reachable/i, /Revit is not reachable/i, /Revit is not open/i
];
// the text of a script: comments out (a comment may say what a tab used to be called), strings and markup in
const words = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;,{(])\/\/.*$/gm, "$1");
const scripts = fs.readdirSync(web).filter(f => f.endsWith(".js"));
const offenders = [];
scripts.forEach(f => { const w = words(read(f)); OLD.forEach(re => { const m = re.exec(w); if (m) offenders.push(f + ": " + m[0]); }); });
OLD.forEach(re => { const m = re.exec(html.replace(/<!--[\s\S]*?-->/g, "")); if (m) offenders.push("index.html: " + m[0]); });
check("no script or page still calls a tab by an older name, or says Revit is not there in another wording (comments may say what a tab was called)", offenders.length === 0, offenders.slice(0, 6).join(" | "));
check("the tour's Revit step names the ribbon's Getting Started button, which the add-in has under that name (its RibbonLayout.cs is checked by the add-in's ReleaseCheck)", /Getting Started in the ribbon/.test(steps.find(s => s.id === "revit").text({ view: "advanced" })) && steps.find(s => s.id === "revit").text({ view: "advanced" }).length < 260);
check("'Revit not open' is the one wording, in the top bar's pill, the Results tab, the Documents tab, Combine's layers panel, the Revit families tab and the profile", ["whereCore.js", "resultsStoreCore.js", "workspaceBridge.js", "revitLayers.js", "revitFamiliesTab.js", "profileCore.js", "profile.js", "compareController.js", "revitBridge.js"].every(f => /Revit not open/.test(read(f))));

console.log(fails === 0 ? "\nNAMES OK" : "\n" + fails + " CHECK(S) FAILED");
process.exit(fails ? 1 : 0);
