// Tests that text goes into markup escaped. Run: node tools/escape-audit-test.js
//
// See escape.js and tools/escape-audit.js. Three things: escapeHtml and safeUrl against real attack strings, the lint against samples (a lint that finds nothing passes
// vacuously, so it must be seen to find), and the lint against the app: no script interpolates a name, a label, a description, a note, a source, a provider, a key, an id or
// an error message into an HTML template without escapeHtml (or one of the helpers that delegate to it), and no address goes into an href or src without safeUrl.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { auditFolder, classify, carriesText, scan } = require("./escape-audit.js");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

// ── the two functions ──
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web, "escape.js"), "utf8"), sandbox, { filename: "escape.js" });
const { escapeHtml, safeUrl } = vm.runInContext("({ escapeHtml, safeUrl })", sandbox);
const attacks = [
  `<img src=x onerror=alert(1)>`, `"><script>alert(1)</script>`, `' onmouseover='alert(1)`, `" onfocus="alert(1)" autofocus="`, "`onclick=`alert(1)", `</textarea><svg onload=alert(1)>`, `&lt;already&gt;`,
];
check("escapeHtml leaves no markup-active character in any attack string: no < > \" ' or backtick", attacks.every(a => !/[<>"'`]/.test(escapeHtml(a))));
check("...and the text still reads the same when the browser shows it (& is & first, so it is not double-escaped)", escapeHtml("Fish & Chips <b>") === "Fish &amp; Chips &lt;b&gt;" && escapeHtml(`&lt;`) === "&amp;lt;");
check("null and undefined are empty text, numbers are their digits", escapeHtml(null) === "" && escapeHtml(undefined) === "" && escapeHtml(12.5) === "12.5");
check("safeUrl lets http, https, mailto, a relative path and an inline image through", ["https://a.example/x?y=1&z=2", "http://a.example", "mailto:a@b.c", "images/plant.jpg", "../x.png", "data:image/png;base64,AAAA"].every(u => safeUrl(u) !== "#"));
check("...and turns javascript:, vbscript:, data:text/html, and the same with case, tabs or spaces in the scheme into #", ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "vbscript:x", "data:text/html,<script>alert(1)</script>", "data:image/svg+xml,<svg onload=alert(1)>"].every(u => safeUrl(u) === "#"));
check("...and a link that passes is escaped for its attribute", safeUrl(`https://a.example/"onmouseover="x`) === "https://a.example/&quot;onmouseover=&quot;x");

// ── the lint sees what it should ──
const flagged = js => scan(js).filter(h => carriesText(h.expr)).map(h => h.expr);
check("lint: an unescaped name in a template is found", flagged("const h = `<li>${item.name}</li>`;").join() === "item.name");
check("lint: the same, escaped, is not", flagged("const h = `<li>${escapeHtml(item.name)}</li>`;").length === 0 && flagged("const h = `<li>${resEsc(item.name)}</li>`;").length === 0);
check("lint: inside an attribute, a nested template, a ternary and || are followed", flagged("const h = `<div title=\"${a.label}\">${b.description ? `<p>${b.description}</p>` : \"\"} ${c.note || \"none\"}</div>`;").length === 4);
check("lint: escaping in one branch does not cover the other", flagged("const h = `<p>${x.source ? escapeHtml(x.source) : x.note}</p>`;").join() === "x.source ? escapeHtml(x.source) : x.note");
check("lint: numbers, counts and fixed text are not flagged", flagged("const h = `<td>${row.width.toFixed(1)} ${items.length} ${\"fixed\"}</td>`;").length === 0);
check("lint: a template that is not HTML is not looked at, a comment or a string with backticks does not confuse it", flagged("const a = `${x.name} and ${y.label}`; // `<p>${z.name}</p>`\nconst s = \"`<b>${w.name}</b>`\";").length === 0);
check("lint: a plain variable is text but not one of the fields that carry it: only listed properties fail the test", classify("cx") === "text" && !carriesText("cx") && carriesText("a.description") && carriesText("item.id"));

// ── the app ──
const rows = auditFolder(web);
check("no script puts a name, label, description, note, source, provider, key, id, or message into markup unescaped", rows.length === 0, rows.slice(0, 12).map(r => `${r.file}:${r.line} ${r.expr.slice(0, 60)}`).join(" | "));

const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([A-Za-z0-9_.]+\.js)/g)].map(m => m[1]);
check("escape.js is the first script the page loads (every other script may call escapeHtml)", scripts[0] === "escape.js" || scripts.indexOf("escape.js") >= 0 && scripts.indexOf("escape.js") < scripts.indexOf("data.js"));

const helpers = { "analysisResults.js": "resEsc", "workspaceBridge.js": "wsEsc", "siteTabs.js": "siteTabsEscape", "structure.js": "escapeStructureText", "assumptions.js": "assumptionEscape", "revitFamiliesTab.js": "escapeAttr", "algoPlacementUI.js": "algoEsc" };
const delegates = (text, name) => {
  const at = text.indexOf("function " + name + "(s)") >= 0 ? text.indexOf("function " + name + "(s)") : text.indexOf("const " + name + " = s =>");
  if (at < 0) return false;
  const nl = String.fromCharCode(10);
  const end = text.indexOf(nl, text.indexOf(nl, at) + 1);          // the helper is a line or three: it has to be nothing but the call
  return text.slice(at, end + 1).includes("escapeHtml(s)");
};
const bad = Object.entries(helpers).filter(([f, name]) => !delegates(fs.readFileSync(path.join(web, f), "utf8"), name));
check("the older escape helpers are one line each and delegate to escapeHtml (one rule, the quote and the backtick included)", bad.length === 0, bad.map(b => b[0]).join(", "));

console.log(fails === 0 ? "\nALL ESCAPING CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
process.exit(fails ? 1 : 0);
