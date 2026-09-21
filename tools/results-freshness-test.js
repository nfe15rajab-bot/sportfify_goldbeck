// Tests for how the Analysis tab tells a result that is about the layout on screen from one that is about an earlier layout. Run: node tools/results-freshness-test.js
//
// The Revit add-in stamps every section of its results with { layout_id, computed_at } (the layout's id is the first 16 hex characters of the SHA-256 of the layout
// JSON the app posted) and drops the sections of other layouts when it publishes. The app computes the same id for what is on screen and badges what does not match.
// The add-in's side of this is tested in the Sportify_Revit_and_API repo (Tools/ContractCheck: "results are tied to a layout and a time"); this pins the web's side:
// the id rule (against the same known answer), the comparison, and the card the designer sees.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function nothing() {
  return new Proxy(function () {}, {
    get(_, p) { return p === Symbol.toPrimitive ? () => "" : p === Symbol.iterator || p === "then" ? undefined : p === "length" ? 0 : nothing(); },
    apply() { return nothing(); },
    construct() { return nothing(); },
    set() { return true; }
  });
}
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: { getElementById: () => nothing(), querySelector: () => nothing(), querySelectorAll: () => [], addEventListener() {}, createElement: () => nothing(), body: nothing(), readyState: "complete" },
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  crypto: nodeCrypto.webcrypto, TextEncoder, Headers, location: { origin: "http://localhost:8123" }, encodeURIComponent,
  fetch: async () => { throw new Error("no network in this test"); }
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(web, f), "utf8"), ctx, { filename: f });
const get = expr => vm.runInContext(expr, ctx);

load("localSession.js");
load("analysisResults.js");
load("workspaceBridge.js");

(async () => {
  // ── the id ──
  check("a layout's id is the first 16 hex characters of the SHA-256 of its JSON text (the add-in's known answer for \"abc\")", await get("layoutIdOf")("abc") === "ba7816bf8f01cfea");
  check("another text is another id", await get("layoutIdOf")("abd") !== "ba7816bf8f01cfea");
  const withUmlauts = "Zürich, Größe";
  const expected = nodeCrypto.createHash("sha256").update(Buffer.from(withUmlauts, "utf8")).digest("hex").slice(0, 16);
  check("the text is hashed as UTF-8, as the add-in hashes the bytes it receives", await get("layoutIdOf")(withUmlauts) === expected);

  // ── the comparison ──
  const section = (id, at) => ({ sections: { wind_erosion: { layout_id: id, computed_at: at } }, wind_erosion: {} });
  const F = get("sectionFreshness");
  check("the same id: current", F(section("aaaa", "2026-09-21T10:00:00Z"), "wind_erosion", "aaaa").state === "current");
  const stale = F(section("aaaa", "2026-09-21T10:00:00Z"), "wind_erosion", "bbbb");
  check("another id: stale, and it says when the result was computed and for which layout", stale.state === "stale" && stale.computedAt === "2026-09-21T10:00:00Z" && stale.layoutId === "aaaa");
  check("no stamp (an older add-in, or a result kept in the browser from before): unknown, never silently current", F({ wind_erosion: {} }, "wind_erosion", "aaaa").state === "unknown" && F(null, "wind_erosion", "aaaa").state === "unknown");
  check("nothing on screen to compare with: unchecked, not stale", F(section("aaaa", null), "wind_erosion", null).state === "unchecked");

  // ── the card ──
  const state = get("resultsState");
  const bridge = get("workspaceState");
  state.payload = { wind_erosion: { case_study: "x" }, sections: { wind_erosion: { layout_id: "aaaa", computed_at: "2026-09-21T10:00:00Z" } } };
  const card = opts => get("resCard")(Object.assign({ section: "wind_erosion", title: "Wind and erosion", tone: "ok", chip: "holds", body: "<p>numbers</p>" }, opts || {}));

  bridge.layoutIdNow = "aaaa";
  let html = card();
  check("a current result is a plain card", !html.includes("res-stale") && html.includes(">holds<") && html.includes("tone-ok"));

  bridge.layoutIdNow = "bbbb";
  html = card();
  check("after the layout changed the card is badged out of date, not left saying \"holds\"", html.includes("res-stale") && html.includes(">out of date<") && !html.includes(">holds<") && html.includes("Out of date."));
  check("...and its numbers stay visible (badged, not dropped: the designer may still want to compare)", html.includes("<p>numbers</p>"));

  state.payload.sections = {};
  html = card();
  check("a result with no stamp says it does not know which layout it is about", html.includes("does not say which layout") && !html.includes("res-stale\""));

  html = get("resCard")({ title: "Fire safety", tone: "neutral", chip: "estimated in the app", body: "" });
  check("the app's own estimates (no section from Revit) are never badged", !html.includes("out of date") && !html.includes("does not say"));

  // ── the count in Combine's layers panel and the run list use the same rule ──
  state.payload = { wind_erosion: {}, soil_percolation: {}, sections: { wind_erosion: { layout_id: "aaaa" }, soil_percolation: { layout_id: "bbbb" } } };
  bridge.layoutIdNow = "bbbb";
  check("of two received results, one is out of date", get("resFreshness")("wind_erosion").state === "stale" && get("resFreshness")("soil_percolation").state === "current");

  // ── the app follows the layout on screen ──
  sandbox.combineState = { items: [{ id: 1 }] };
  let placed = 1;
  sandbox.buildCombinedPayload = () => ({ placements: [{ id: placed }] });
  sandbox.updateRevitLayersUI = () => {};
  bridge.layoutIdNow = null;
  await get("refreshLayoutIdNow")();
  const idOne = bridge.layoutIdNow;
  check("the id of what is on screen is kept up to date", /^[0-9a-f]{16}$/.test(idOne || ""));
  placed = 2;
  await get("refreshLayoutIdNow")();
  check("...and changes when the layout does", /^[0-9a-f]{16}$/.test(bridge.layoutIdNow || "") && bridge.layoutIdNow !== idOne);
  placed = 1;
  await get("refreshLayoutIdNow")();
  check("...and is the same for the same layout again", bridge.layoutIdNow === idOne);
  sandbox.combineState = { items: [] };
  await get("refreshLayoutIdNow")();
  check("an empty roof has no id", bridge.layoutIdNow === null);

  // ── what the add-in answers when the draft is sent ──
  sandbox.combineState = { items: [{ id: 1 }] };
  bridge.connected = true; bridge.draftSent = null; bridge.layoutId = null;
  // the add-in: gives its session, then answers the layout
  const addin = answer => async url => url.endsWith("/session") ? { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ token: "t" }) } : answer;
  sandbox.fetch = addin({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ layout_id: "0123456789abcdef", draft: true }) });
  const ok = await get("syncDraftLayout")(true);
  check("sending the layout keeps the id the add-in answered", ok === true && bridge.layoutId === "0123456789abcdef");
  sandbox.fetch = addin({ ok: true, status: 200, headers: { get: () => "text/plain" }, json: async () => { throw new Error("no json"); } });
  bridge.layoutId = null;
  await get("syncDraftLayout")(true);
  check("an older add-in that answers nothing: the id is worked out here", /^[0-9a-f]{16}$/.test(bridge.layoutId || ""));

  console.log(fails === 0 ? "\nALL RESULT FRESHNESS CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  the test itself threw: " + (e && e.stack || e)); process.exit(1); });
