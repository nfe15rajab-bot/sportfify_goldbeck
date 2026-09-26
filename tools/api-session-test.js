// Tests for apiSession.js: how the web app gets and sends the API's write key. Run: node tools/api-session-test.js
//
// The API (localhost:5107) refuses a POST, PUT, PATCH or DELETE without the header X-Sportify-Key. The API side is tested live (Sportify_Revit_and_API: Tools/ApiSecurityCheck).
// This pins the web's side: the key is fetched from GET /api/session when the API made it, typed once per tab when the API was given one, sent on every write, asked again after
// a 401, and no script writes to the API without going through apiWrite.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const api = { mode: "handshake", key: "aaaa", seen: [], up: true, asked: 0 };
const respond = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
async function fakeFetch(url, init) {
  if (!api.up) throw new TypeError("Failed to fetch");
  const headers = init && init.headers ? Object.fromEntries(init.headers.entries()) : {};
  api.seen.push({ url, key: headers["x-sportify-key"] || null, method: (init && init.method) || "GET" });
  if (url.endsWith("/api/session")) return api.mode === "handshake" ? respond(200, { mode: "handshake", key: api.key }) : respond(200, { mode: "configured" });
  if (url.endsWith("/api/Admin/capabilities")) return respond(200, { sqlImport: false });
  return headers["x-sportify-key"] === api.key ? respond(201, { id: 1 }) : respond(401, { error: "key" });
}
const store = {};
const sandbox = {
  console, fetch: fakeFetch, Headers,
  sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  prompt: () => { api.asked++; return api.typed; },
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web, "apiSession.js"), "utf8"), ctx, { filename: "apiSession.js" });
const get = expr => vm.runInContext(expr, ctx);
const reset = () => { vm.runInContext("apiSession.key = null; apiSession.pending = null;", ctx); for (const k of Object.keys(store)) delete store[k]; api.seen.length = 0; api.asked = 0; };

(async () => {
  // the API made the key
  const r = await get("apiWrite")("http://localhost:5107/api/Admin/records", { method: "POST", body: "{}" });
  check("a write carries the key the API handed the app (handshake), and goes through", r.status === 201 && api.seen.filter(s => s.method === "POST").every(s => s.key === "aaaa") && api.asked === 0);
  const before = api.seen.length;
  await get("apiWrite")("http://localhost:5107/api/Furniture/1", { method: "DELETE" });
  check("the key is kept: the next write does not ask for a session again", api.seen.slice(before).every(s => !s.url.endsWith("/api/session")));

  api.key = "bbbb";                                    // the API restarted and made a new one
  api.seen.length = 0;
  const again = await get("apiWrite")("http://localhost:5107/api/Furniture/1", { method: "DELETE" });
  check("after the API restarted (a 401) the app fetches the new key and tries once more", again.status === 201 && api.seen.map(s => s.method + ":" + s.key).join(" ").endsWith("GET:null DELETE:bbbb"));

  // the API was given a key
  reset(); api.mode = "configured"; api.key = "chosen-key"; api.typed = "chosen-key";
  const typed = await get("apiWrite")("http://localhost:5107/api/Furniture", { method: "POST", body: "{}" });
  check("when the API was given its key it is not handed out: the person is asked once, and the write goes through", typed.status === 201 && api.asked === 1);
  await get("apiWrite")("http://localhost:5107/api/Furniture", { method: "POST", body: "{}" });
  check("...and the key is kept for the tab (sessionStorage): not asked again", api.asked === 1 && store["sportify-api-write-key"] === "chosen-key");

  reset(); api.typed = "wrong";
  api.mode = "configured";
  const wrong = await get("apiWrite")("http://localhost:5107/api/Furniture", { method: "POST", body: "{}" });
  check("a wrong key typed is refused (401) after one more ask, and is not kept", wrong.status === 401 && api.asked === 2 && !store["sportify-api-write-key"]);

  reset(); api.typed = null;
  const cancelled = await get("apiWrite")("http://localhost:5107/api/Furniture", { method: "POST", body: "{}" });
  check("cancelling the question sends the write without a key, and the API says 401 (nothing changes)", cancelled.status === 401);

  reset(); api.up = false;
  let threw = false;
  try { await get("apiWrite")("http://localhost:5107/api/Furniture", { method: "POST", body: "{}" }); } catch (e) { threw = true; }
  check("API not running: the write fails as fetch does, so the callers' error handling is unchanged", threw);
  api.up = true;

  const cap = await get("apiCapabilities")();
  check("the app can ask what the API allows (the SQL import)", cap.sqlImport === false);

  // no script writes to the API without the key
  const offenders = [];
  for (const f of fs.readdirSync(web).filter(f => f.endsWith(".js") && f !== "apiSession.js" && f !== "localSession.js")) {
    const text = fs.readFileSync(path.join(web, f), "utf8");
    const at = /(^|[^A-Za-z_.])fetch\(/g;
    let m;
    while ((m = at.exec(text))) {
      const statement = text.slice(m.index, m.index + 400).split(/\)\s*;|\n\s*\n/)[0];
      if (/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(statement)) offenders.push(f + ":" + text.slice(0, m.index).split("\n").length);
    }
  }
  check("no script writes with a bare fetch: every POST, PUT, PATCH and DELETE goes through apiWrite (or localFetch, for the add-in)", offenders.length === 0, offenders.join(", "));
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  check("index.html loads apiSession.js before the Catalogue tab and the build-up editor", html.indexOf("apiSession.js") > 0 && html.indexOf("apiSession.js") < html.indexOf("dataTab.js") && html.indexOf("apiSession.js") < html.indexOf("buildupEditor.js"));

  console.log(fails === 0 ? "\nALL API SESSION CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  the test itself threw: " + (e && e.stack || e)); process.exit(1); });
