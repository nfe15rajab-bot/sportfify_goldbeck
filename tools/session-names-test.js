// Tests for the session's and the iteration's name (sessionNames.js): the names the files are called after. Run: node tools/session-names-test.js
//
// The cleaning and the prefix are the Revit add-in's DeliverableNaming.Clean and .Prefix: the same examples are pinned in Tools/AddinCheck, so the two cannot drift apart unseen. The rest runs
// the real script against a stand-in page (two fields, the browser's storage, the add-in's local server): what typing does, what is kept, what is sent and when, what a loaded session brings, and
// that the layout sent to the add-in as it changes never carries the names (its identity is a hash of that text).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };
const S = require(path.join(web, "sessionNames.js"));

// ---------------------------------------------------------------------------------------------------------------- the cleaning and the prefix (the add-in's examples)
const words = Array(40).fill("word").join(" ");
check("a name as a part of a file name: characters Windows refuses and control characters become spaces, spaces collapse, dots and spaces at the ends go, umlauts stay",
  S.sessionNameClean("  Dach: Sport / Garten?* ") === "Dach Sport Garten" && S.sessionNameClean("Süd\tTeil\n2...") === "Süd Teil 2" && S.sessionNameClean('a<b>c|d"e') === "a b c d e" && S.sessionNameClean(null) === "" && S.sessionNameClean(undefined) === "" && S.sessionNameClean("  ...  ") === "" && S.sessionNameClean("Über größe") === "Über größe");
check("it is cut to the limit without leaving a space at the cut", S.sessionNameClean("x".repeat(200)).length === S.SESSION_NAME_MAX && S.sessionNameClean(words, 20) === "word word word word" && S.sessionNameClean(words, 25) === "word word word word word");
const session = "DIGITAL TOOLS AND METHODS 2 - Roof and Sports";
check("the prefix is 'Session - Iteration - ', one of them alone with its ' - ', and nothing when neither is given", S.sessionNamePrefix(session, "Algorithmic") === session + " - Algorithmic - " && S.sessionNamePrefix(session, null) === session + " - " && S.sessionNamePrefix("", "Manual") === "Manual - " && S.sessionNamePrefix(null, null) === "" && S.sessionNamePrefix("  ", "?*") === "");
check("what is typed cannot make a file name Windows refuses: none of its characters, whatever was typed", ["a/b\\c:d", "CON.", "<>|", "x\u0000y", "name?", "ü".repeat(300), "\u007f\u0085"].every(n => !/[\\/:*?"<>|\u0000-\u001f]/.test(S.sessionNamePrefix(n, n))));

// ---------------------------------------------------------------------------------------------------------------- the script against a stand-in page
function page({ connected = true, stored = null, noStorage = false } = {}) {
  const calls = [], storage = {};
  if (stored) storage["sportify-session-names"] = JSON.stringify(stored);
  const fields = {};
  const field = id => (fields[id] = fields[id] || { id, value: "", textContent: "", handlers: {}, addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); } });
  const sandbox = {
    console, JSON, Promise, Math, String, Object, Array, Error,
    document: { activeElement: null, getElementById: id => (["session-name", "session-iteration", "session-names-preview"].includes(id) ? field(id) : null) },
    localStorage: noStorage ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } : { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = v; } },
    workspaceState: { connected },
    localApi: async (p, o) => { calls.push({ path: p, body: o && o.body ? JSON.parse(o.body) : null, method: o && o.method }); return { ok: true, status: 200, json: {} }; },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read("sessionNames.js"), ctx, { filename: "sessionNames.js" });
  const run = e => vm.runInContext(e, ctx);
  const type = (id, value) => { const f = field(id); f.value = value; (f.handlers.input || []).forEach(fn => fn({ target: f })); };
  const settle = () => new Promise(r => setImmediate(r));
  return { run, type, field, calls, storage, sandbox, settle };
}

(async () => {
  {
    const p = page();
    check("nothing typed: no names to send or save, and the line under the fields says the files keep their plain names", p.run("sessionNamesPayload()") === null && /plain names/.test(p.field("session-names-preview").textContent));
    p.type("session-name", "  DIGITAL TOOLS AND METHODS 2 - Roof: Sports "); await p.settle();
    check("typing the session's name shows what the files will start with, and keeps it in the browser", p.field("session-names-preview").textContent === "Files start with: DIGITAL TOOLS AND METHODS 2 - Roof Sports - Sportify_Analysis_Report_..." && JSON.parse(p.storage["sportify-session-names"]).name === "  DIGITAL TOOLS AND METHODS 2 - Roof: Sports ");      // kept as typed (so typing is not disturbed); cleaned where it is used
    p.type("session-iteration", "Algorithmic"); await p.settle();
    check("the iteration goes after it", p.field("session-names-preview").textContent === "Files start with: DIGITAL TOOLS AND METHODS 2 - Roof Sports - Algorithmic - Sportify_Analysis_Report_...");
    const payload = p.run("sessionNamesPayload()");
    check("the payload is the two names, cleaned", payload && payload.name === "DIGITAL TOOLS AND METHODS 2 - Roof Sports" && payload.iteration === "Algorithmic");
    check("the add-in is told, each change once, on its own route (POST /session-names) and not through the layout", p.calls.length === 2 && p.calls.every(c => c.path === "/session-names" && c.method === "POST") && p.calls.at(-1).body.name.endsWith("Sports") && p.calls.at(-1).body.iteration === "Algorithmic");
    await p.run("sessionNamesSync(false)");
    check("the same names are not sent again", p.calls.length === 2);
    p.run("sessionNames.sent = null"); await p.run("sessionNamesSync(false)");
    check("...until the add-in has to hear them again (Revit was restarted)", p.calls.length === 3);
    p.type("session-name", ""); p.type("session-iteration", ""); await p.settle();
    check("clearing both fields sends empty names (the add-in clears them) and the payload is null again", p.calls.at(-1).body.name === "" && p.calls.at(-1).body.iteration === "" && p.run("sessionNamesPayload()") === null);
  }
  {
    const p = page({ connected: false });
    p.type("session-name", "Dach"); await p.settle();
    check("without the add-in nothing is sent (it is told when it connects), and the names are kept all the same", p.calls.length === 0 && p.run("sessionNames.name") === "Dach" && JSON.parse(p.storage["sportify-session-names"]).name === "Dach");
    p.sandbox.workspaceState.connected = true;
    await p.run("sessionNamesSync(false)");
    check("...and once it is there, the names are sent", p.calls.length === 1 && p.calls[0].body.name === "Dach");
  }
  {
    const p = page({ stored: { name: "Kept from last time", iteration: "Manual" } });
    check("a name kept in the browser is there after a reload, in the fields too", p.run("sessionNames.name") === "Kept from last time" && p.run("sessionNames.iteration") === "Manual" && p.field("session-name").value === "Kept from last time" && p.field("session-iteration").value === "Manual");
    const q = page({ stored: { name: 5, iteration: null } });
    check("a kept value that is not text is ignored", q.run("sessionNames.name") === "" && q.run("sessionNames.iteration") === "");
    const r = page({ noStorage: true });
    r.type("session-name", "x"); await r.settle();
    check("a browser that refuses storage (a private window) still works: the names just are not kept", r.run("sessionNames.name") === "x" && r.calls.length === 1);
  }
  {
    const p = page();
    p.type("session-name", "Typed"); p.calls.length = 0;
    p.run('sessionNamesApply({ name: " Loaded: session ", iteration: "It/1" })'); await p.settle();
    check("a loaded session brings its names (cleaned) into the fields and tells the add-in", p.run("sessionNames.name") === "Loaded session" && p.run("sessionNames.iteration") === "It 1" && p.field("session-name").value === "Loaded session" && p.calls.at(-1).body.name === "Loaded session");
    const before = p.calls.length;
    p.run("sessionNamesApply(undefined)"); p.run("sessionNamesApply(null)"); p.run('sessionNamesApply("text")'); await p.settle();
    check("a session saved without names (an older one, a preset) leaves what is typed alone", p.run("sessionNames.name") === "Loaded session" && p.calls.length === before);
    p.run('sessionNamesApply({ name: 5, iteration: [] })');
    check("odd values in a saved session become empty names, never an error", p.run("sessionNames.name") === "" && p.run("sessionNames.iteration") === "");
  }

  // ---------------------------------------------------------------------------------------------------------------- the layout does not carry them
  {
    const wb = read("workspaceBridge.js");
    const fn = /function currentDraftBody\(\) \{[\s\S]*?\n\}/.exec(wb);
    check("the layout sent to the add-in as it changes is built by currentDraftBody, which takes the names out (its identity is a hash of its text)", !!fn && /delete payload\.session/.test(fn[0]));
    const sandbox = { JSON, combineState: { items: [1] }, buildCombinedPayload: () => ({ version: "1.3", session: { name: "S", iteration: "I" }, placements: [] }) };
    vm.runInContext(fn[0], vm.createContext(sandbox));
    const body = vm.runInContext("currentDraftBody()", sandbox);
    check("...so the text it makes has no session in it, and everything else", body === '{"version":"1.3","placements":[]}', body);
    check("the names go out with every explicit save and export (the Combined JSON's session), the way back reads them, and the sync runs with the layout's and on reconnect",
      /\.\.\.\(typeof sessionNamesPayload === "function" && sessionNamesPayload\(\) \? \{ session: sessionNamesPayload\(\) \} : \{\}\)/.test(read("combineController.js")) && /sessionNamesApply\(payload\.session\)/.test(read("combineController.js"))
      && /sessionNamesSync\(false\)/.test(wb) && /sessionNames\.sent = null/.test(wb));
  }

  // ---------------------------------------------------------------------------------------------------------------- the page
  {
    const html = read("index.html"), src = read("sessionNames.js");
    const ids = ["session-names", "session-name", "session-iteration", "session-names-preview"];
    check("the fields are in the Documents tab and the script loads after the bridge it talks through", ids.every(i => new RegExp('id="' + i + '"').test(html)) && html.indexOf('id="session-names"') > html.indexOf('id="deliverables-content"') && html.indexOf('id="session-names"') < html.indexOf('class="deliverables-grid"')
      && html.indexOf('<script src="sessionNames.js') > html.indexOf('<script src="workspaceBridge.js'));
    check("what is typed is only ever shown as text (textContent, value), never as markup", !/innerHTML/.test(src) && /textContent = prefix/.test(src));
    check("the names are limited in the page too (60 and 40 characters), like the add-in does", /id="session-name"[^>]*maxlength="60"/.test(html) && /id="session-iteration"[^>]*maxlength="40"/.test(html));
  }

  console.log(fails === 0 ? "\nSESSION NAMES OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
