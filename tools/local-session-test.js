// Tests for localSession.js: how the web app gets and uses the add-in's session token. Run: node tools/local-session-test.js
//
// The add-in's local server (localhost:5679) admits only the app's origins and, for everything but GET /session, only a request with the session token (see the add-in's
// LocalRequestGuard, tested live in the Sportify_Revit_and_API repo: Tools/AddinCheck). This pins the web's side: the token is fetched once and sent, a new one is fetched
// when the add-in answers 401 (Revit was restarted), links carry it, a refused page says why, and NO script talks to the add-in except through this file.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

// a stand-in for the add-in: the session it gave, the requests it saw
const addin = { token: "aaaa1111", up: true, refuseOrigin: false, seen: [], sessionCalls: 0 };
function respond(status, json) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, json: async () => json };
}
async function fakeFetch(url, init) {
  if (!addin.up) throw new TypeError("Failed to fetch");
  const p = url.replace("http://localhost:5679", "");
  const headers = init && init.headers ? Object.fromEntries(init.headers.entries()) : {};
  addin.seen.push({ path: p, token: headers["x-sportify-token"] || null, method: (init && init.method) || "GET" });
  if (p === "/session") {
    addin.sessionCalls++;
    return addin.refuseOrigin ? respond(403, { error: "origin" }) : respond(200, { token: addin.token });
  }
  return headers["x-sportify-token"] === addin.token ? respond(200, { fine: true }) : respond(401, { error: "no token" });
}

const changes = [];
const sandbox = { console, fetch: fakeFetch, Headers, location: { origin: "http://localhost:8123" }, encodeURIComponent, workspaceChanged: () => changes.push(1) };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web, "localSession.js"), "utf8"), ctx, { filename: "localSession.js" });
const get = expr => vm.runInContext(expr, ctx);

(async () => {
  const [a, b, c] = await Promise.all([get("localFetch")("/workspace"), get("localFetch")("/deliverables"), get("localFetch")("/charts")]);
  check("a request is sent with the session token, and three at once ask for one session, not three", a.ok && b.ok && c.ok && addin.sessionCalls === 1 && addin.seen.filter(s => s.path !== "/session").every(s => s.token === "aaaa1111"));
  await get("localFetch")("/workspace");
  check("the token is kept: no new session for the next request", addin.sessionCalls === 1);

  addin.token = "bbbb2222";                      // Revit was restarted
  addin.seen.length = 0;
  const after = await get("localFetch")("/workspace");
  check("when the add-in answers 401 the app gets a new session and tries once more", after.ok && addin.sessionCalls === 2 && addin.seen.map(s => s.path + ":" + s.token).join(" ") === "/workspace:aaaa1111 /session:null /workspace:bbbb2222");
  check("...and redraws what carries the old token in a link", changes.length === 1);

  check("an address for a video or a download carries the token; one with a query gets &token", get("localUrl")("/deliverable?kind=layouts&name=x.json") === "http://localhost:5679/deliverable?kind=layouts&name=x.json&token=bbbb2222"
    && get("localUrl")("/x") === "http://localhost:5679/x?token=bbbb2222");

  addin.up = false;
  let threw = false;
  try { await get("localFetch")("/workspace"); } catch (e) { threw = true; }
  check("not reachable: it throws like fetch does, so the callers' \"not connected\" handling is unchanged", threw);

  // a page the add-in does not know
  addin.up = true; addin.refuseOrigin = true;
  vm.runInContext("localSession.token = null; localSession.problem = '';", ctx);
  try { await get("localFetch")("/workspace"); } catch (e) { /* fine */ }
  const problem = get("localSession.problem");
  check("a page the add-in refuses is told why, with its own address and the way to add it", problem.includes("http://localhost:8123") && problem.includes("SPORTIFY_ALLOWED_ORIGINS"), problem);

  // no script talks to the add-in except through localSession.js
  const offenders = [];
  for (const f of fs.readdirSync(web).filter(f => f.endsWith(".js") && f !== "localSession.js")) {
    const text = fs.readFileSync(path.join(web, f), "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/fetch\(\s*["'`]http:\/\/(localhost|127\.0\.0\.1):5679/.test(line) || /fetch\(\s*(REVIT_[A-Z_]+_URL|SPORTIFY_LOCAL_URL)/.test(line)) offenders.push(f + ":" + (i + 1));
    });
  }
  check("no script calls the add-in with a bare fetch (it would have no token): everything goes through localFetch", offenders.length === 0, offenders.join(", "));
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  check("index.html loads localSession.js before the scripts that use it", html.indexOf("localSession.js") > 0 && html.indexOf("localSession.js") < html.indexOf("revitBridge.js") && html.indexOf("localSession.js") < html.indexOf("analysisResults.js") && html.indexOf("localSession.js") < html.indexOf("workspaceBridge.js"));

  console.log(fails === 0 ? "\nALL LOCAL SESSION CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  the test itself threw: " + (e && e.stack || e)); process.exit(1); });
