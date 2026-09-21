// A proxy that poisons the API's answers, to see in a real browser whether any screen turns catalogue text into markup. Run:
//
//   node tools/xss-canary-proxy.js [--api http://localhost:5199] [--port 5107]
//
// Start the API on another port first (on a COPY of reference.db: dotnet Sportify.Api.dll --urls http://localhost:5199 --contentRoot <folder with the copy>), serve the app on
// localhost:8123, and open it. Every text the API sends (names, labels, descriptions, providers, notes, sources ...) comes back with a payload in front of it, and every address
// is a javascript: address, so anything a screen puts in markup unescaped becomes an element that reports itself:
//
//   window.__xss         is filled by any onerror the payload gets to run (an <img src=x onerror=...> that reached the DOM)
//   img[src="x"]         is in the document when the payload became an element, whether or not a script is allowed to run
//   a[href^="javascript:"], [onerror], [onmouseover]  the same for addresses and attribute breakouts
//
// After walking through the tabs, `window.__xss === undefined` and `document.querySelectorAll('img[src="x"], [onerror], [onmouseover], a[href^="javascript:"]').length === 0`
// mean nothing leaked. (The escaping is also pinned without a browser: tools/escape-audit-test.js reads every script. This finds what a reading cannot: a value that goes through
// a function the lint does not know.) Writes are refused: it is a reading tool.
const http = require("http");

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const api = new URL(arg("--api", "http://localhost:5199"));
const port = Number(arg("--port", "5107"));

// what the app reads as a value, not as text to show: poisoning these would break the catalogue rather than test it
const LOGIC = new Set(["id", "key", "category", "kind", "type", "sport", "sportkey", "unit", "code", "group", "surface", "value", "values", "tone", "sportid", "assemblykey", "priceunit", "manufacturercountry", "providercountry", "pricesource", "costgroupdin276"]);
const PAYLOAD = field => `"'><img src=x onerror="(window.__xss=window.__xss||[]).push('${field}')" onmouseover="1">`;

function poison(value, field) {
  if (Array.isArray(value)) return value.map(v => poison(v, field));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = poison(v, k);
    return out;
  }
  if (typeof value !== "string" || !value.trim() || LOGIC.has(String(field).toLowerCase())) return value;
  if (/url|href|link/i.test(field)) return `javascript:(window.__xss=window.__xss||[]).push('${field}')`;
  return PAYLOAD(field) + value;
}

http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": req.headers.origin || "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method !== "GET") { res.writeHead(405, cors); return res.end("the canary proxy only reads"); }
  const up = http.request({ hostname: api.hostname, port: api.port, path: req.url, method: "GET", headers: { Accept: "application/json" } }, r => {
    const chunks = [];
    r.on("data", c => chunks.push(c));
    r.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let out = body;
      if ((r.headers["content-type"] || "").includes("json")) { try { out = JSON.stringify(poison(JSON.parse(body), "")); } catch (e) { /* not JSON: as it was */ } }
      res.writeHead(r.statusCode, Object.assign({ "Content-Type": r.headers["content-type"] || "application/json" }, cors));
      res.end(out);
    });
  });
  up.on("error", e => { res.writeHead(502, cors); res.end(String(e)); });
  up.end();
}).listen(port, "localhost", () => console.log(`canary proxy on http://localhost:${port} -> ${api.origin}`));
