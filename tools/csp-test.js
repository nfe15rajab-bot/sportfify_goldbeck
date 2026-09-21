// Tests the page's Content-Security-Policy and that the page keeps to it. Run: node tools/csp-test.js
//
// index.html carries the policy in a <meta> tag (one place, whatever serves the page: the add-in's web server, the presentation copy, a dev server). A policy is only as good
// as the page's obedience: one inline script, one CDN link, one fetch to a host the policy does not list, and it is either broken or has to be weakened. This checks both:
// what the policy says, and that nothing in the page or in the scripts needs more.
const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
check("index.html carries a Content-Security-Policy", !!meta);
const policy = {};
if (meta) for (const part of meta[1].split(";")) { const bits = part.trim().split(/\s+/); if (bits[0]) policy[bits[0]] = bits.slice(1); }

const has = (dir, v) => (policy[dir] || []).includes(v);
check("scripts only from this site: script-src 'self', no 'unsafe-inline', no 'unsafe-eval', no host, no data:", policy["script-src"] && policy["script-src"].length === 1 && has("script-src", "'self'"));
check("nothing else falls back to a wide default: default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'", has("default-src", "'self'") && has("object-src", "'none'") && has("base-uri", "'self'") && has("form-action", "'self'") && !(policy["default-src"] || []).includes("*"));
check("fonts only from this site (they are vendored)", policy["font-src"] && policy["font-src"].length === 1 && has("font-src", "'self'"));
check("no directive lists a wildcard host or 'unsafe-eval'", Object.entries(policy).every(([d, v]) => !v.includes("*") && !v.includes("'unsafe-eval'")));
check("the only 'unsafe-inline' is in style-src (the app sets style attributes throughout)", Object.entries(policy).filter(([d, v]) => v.includes("'unsafe-inline'")).map(([d]) => d).join() === "style-src");

// ── the page obeys it ──
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(m => !/\bsrc=/.test(m[1]));
check("index.html has no inline <script>", inlineScripts.length === 0);
check("index.html has no inline event handler (onclick=, onerror=, ...)", !/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<!--[\s\S]*?-->/g, "")));
check("index.html has no javascript: link", !/(href|src|action)\s*=\s*["']\s*javascript:/i.test(html));
const external = [...html.matchAll(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["'](https?:)?\/\/([^"']+)["']/gi)].map(m => m[2]);
check("index.html loads nothing from another site (no CDN, no font service)", external.length === 0, external.join(", "));
check("...and does not connect ahead to one either (no preconnect)", !/rel="preconnect"/i.test(html));

const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"':?#]+)(?:\?[^"']*)?["']/gi)].map(m => m[1]).filter(r => !/^(https?:|data:|#)/.test(r));
const missing = refs.filter(r => !fs.existsSync(path.join(web, r)));
check("every script and stylesheet index.html names exists in the repository", missing.length === 0, missing.join(", "));
check("...including the vendored ones", ["vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/suncalc/suncalc.js", "vendor/tabler-icons/tabler-icons.css", "vendor/fonts/titillium-web/fonts.css"].every(r => refs.includes(r)));
const cssFiles = refs.filter(r => r.endsWith(".css"));
const brokenUrls = [];
for (const css of cssFiles) {
  const text = fs.readFileSync(path.join(web, css), "utf8");
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g)) {
    const u = m[1].split(/[?#]/)[0];
    if (/^(data:|https?:|#)/.test(u)) { if (/^https?:/.test(u)) brokenUrls.push(css + ": " + u); continue; }
    if (!fs.existsSync(path.join(web, path.dirname(css), u))) brokenUrls.push(css + ": " + u);
  }
}
check("the stylesheets' fonts and images exist, and none is loaded from another site", brokenUrls.length === 0, brokenUrls.slice(0, 5).join(" | "));
for (const licence of ["vendor/leaflet/LICENSE", "vendor/suncalc/LICENSE", "vendor/tabler-icons/LICENSE", "vendor/fonts/titillium-web/OFL.txt"]) check(`${licence} is kept with what it covers`, fs.existsSync(path.join(web, licence)));

// ── every host a script talks to is in connect-src / img-src ──
const connect = policy["connect-src"] || [];
const hosts = new Set();
for (const f of fs.readdirSync(web).filter(f => f.endsWith(".js"))) {
  const text = fs.readFileSync(path.join(web, f), "utf8");
  for (const m of text.matchAll(/fetch\(\s*[`"'](https?:\/\/[^/`"'$]+)/g)) hosts.add(m[1]);
  for (const m of text.matchAll(/(?:const|let|var)\s+[A-Z_]+(?:URL|API|BASE)\w*\s*=\s*[`"'](https?:\/\/[^/`"'$]+)/g)) hosts.add(m[1]);
}
const uncovered = [...hosts].filter(h => !connect.includes(h));
check("every host a script fetches from is in connect-src (a fetch to another one would be blocked)", uncovered.length === 0, uncovered.join(", ") + "  (found: " + [...hosts].join(", ") + ")");
const tileHosts = [...fs.readFileSync(path.join(web, "siteField.js"), "utf8").matchAll(/tileLayer\(\s*["'](https?):\/\/(?:\{s\}\.)?([^/"']+)/g)].map(m => m[2]);
check("the map tiles come over https, which img-src allows", tileHosts.length > 0 && has("img-src", "https:"), tileHosts.join(", "));
check("recordings from the add-in may play (media-src has its address)", has("media-src", "http://localhost:5679"));

// ── no script builds an inline handler or a script tag into the page ──
const handlers = [];
for (const f of fs.readdirSync(web).filter(f => f.endsWith(".js") && !f.startsWith("."))) {
  const text = fs.readFileSync(path.join(web, f), "utf8");
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (/[`"'][^`"']*<[a-z][^>]*\son[a-z]+\s*=\s*\\?["']/i.test(line) || /<script[\s>]/i.test(line) && /[`"']/.test(line)) handlers.push(f + ":" + (i + 1));
  });
}
check("no script writes an inline event handler or a <script> tag into the page (the policy would block it)", handlers.length === 0, handlers.join(", "));

console.log(fails === 0 ? "\nALL CSP CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
process.exit(fails ? 1 : 0);
