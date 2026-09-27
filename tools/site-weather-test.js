// Tests for siteWeather.js (the Site conditions tab's annual weather overview) and its wiring into siteController.js.
// Run: node tools/site-weather-test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function fakeElement() {
  const e = { innerHTML: "", textContent: "", style: {}, dataset: {}, handlers: {}, classes: new Set(), value: "",
    classList: null, appendChild() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); } };
  e.classList = { add: c => e.classes.add(c), remove: c => e.classes.delete(c), contains: c => e.classes.has(c), toggle() {} };
  return e;
}

// A year of daily data with an obvious, checkable shape: 15 deg C and 2 mm every day of January, 25 deg C and 0 mm every day of July — so the monthly means/sums are exact round numbers to assert on.
function daysOf(year) {
  const days = [];
  for (let m = 1; m <= 12; m++) {
    const inMonth = new Date(year, m, 0).getDate();
    for (let d = 1; d <= inMonth; d++) days.push(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}
function sampleYearJson(year) {
  const time = daysOf(year);
  const temperature_2m_mean = time.map(t => (t.slice(5, 7) === "01" ? 15 : t.slice(5, 7) === "07" ? 25 : 20));
  const precipitation_sum = time.map(t => (t.slice(5, 7) === "01" ? 2 : t.slice(5, 7) === "07" ? 0 : 1));
  return { daily: { time, temperature_2m_mean, precipitation_sum } };
}

function sandboxWith(fetchImpl) {
  const sandbox = { console, Date, Math, String, Number, Array, Map, JSON, Promise, fetch: fetchImpl, escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) };
  vm.createContext(sandbox);
  vm.runInContext(read("siteWeather.js"), sandbox, { filename: "siteWeather.js" });
  return sandbox;
}
const run = (sandbox, e) => vm.runInContext(e, sandbox);

(async () => {
  const year = new Date().getFullYear() - 1;

  // ---------------------------------------------------------------------------------------------------------------- fetchAnnualWeather: the fetch itself and the monthly bucketing
  {
    const calls = [];
    const sandbox = sandboxWith(async url => { calls.push(url); return { ok: true, status: 200, json: async () => sampleYearJson(year) }; });
    check("fetchAnnualWeather asks for the most recently completed calendar year, at the given place, over https, with the two variables it needs",
      run(sandbox, "annualWeatherYear()") === year);
    const summary = await run(sandbox, "fetchAnnualWeather(52.48, -1.9)");
    check("the URL is the real Open-Meteo archive endpoint (so tools/csp-test.js's scan of connect-src covers it), for that year and place",
      calls.length === 1 && /^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/.test(calls[0]) && calls[0].includes(`latitude=52.48`) && calls[0].includes(`longitude=-1.9`) && calls[0].includes(`start_date=${year}-01-01`) && calls[0].includes(`end_date=${year}-12-31`));
    check("the summary is the completed year and 12 months, January and July matching the sample data exactly (mean of a constant is itself, sum of 2mm/day over 31 days is 62mm)",
      summary.year === year && summary.months.length === 12 && summary.months[0].tempMeanC === 15 && summary.months[0].precipMm === 62 && summary.months[6].tempMeanC === 25 && summary.months[6].precipMm === 0);
    check("every other month reads the shared 20 deg C / 1 mm days correctly, and each month keeps a one-letter label", summary.months[3].tempMeanC === 20 && summary.months[3].precipMm === 30 && summary.months.map(m => m.label).join("") === "JFMAMJJASOND");
    const again = await run(sandbox, "fetchAnnualWeather(52.48, -1.9)");
    check("a second call for the same place (even rounded slightly differently) is cached, not fetched again", calls.length === 1 && again === summary);
    const elsewhere = await run(sandbox, "fetchAnnualWeather(10, 10)");
    check("a genuinely different place is fetched again", calls.length === 2 && elsewhere !== summary);
  }

  // ---------------------------------------------------------------------------------------------------------------- failure paths
  {
    const sandbox = sandboxWith(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    let threw = null;
    // Not "instanceof Error": the throw happened inside the vm context's own realm, so it is an instance of THAT
    // realm's Error, not this file's — a real cross-realm subtlety, not a stand-in for one. Its shape (a message) is what every catch site actually reads.
    try { await run(sandbox, "fetchAnnualWeather(1, 1)"); } catch (e) { threw = e; }
    check("an HTTP error from the service throws (the caller shows its own 'could not be looked up' message, same shape as the wind-zone/region lookup)", threw && typeof threw.message === "string" && threw.message.includes("503"));

    const empty = sandboxWith(async () => ({ ok: true, status: 200, json: async () => ({ daily: { time: [], temperature_2m_mean: [], precipitation_sum: [] } }) }));
    let threw2 = null;
    try { await run(empty, "fetchAnnualWeather(1, 1)"); } catch (e) { threw2 = e; }
    check("a reply with no days in it throws too, rather than silently drawing an empty chart", threw2 && typeof threw2.message === "string");
  }

  // ---------------------------------------------------------------------------------------------------------------- buildAnnualWeatherSvg
  {
    const sandbox = sandboxWith(async () => ({ ok: true, status: 200, json: async () => sampleYearJson(year) }));
    const summary = await run(sandbox, "fetchAnnualWeather(52.48, -1.9)");
    const svg = run(sandbox, `buildAnnualWeatherSvg(${JSON.stringify(summary)})`);
    check("the chart is one bar per month (12 rects) and a temperature line through all 12 months, starting with <svg and nothing else", svg.startsWith("<svg") && (svg.match(/<rect/g) || []).length === 12 && /<polyline /.test(svg) && (svg.match(/<circle/g) || []).length === 12);
    check("every month's one-letter label appears as text, escaped like any other rendered text even though these particular ones can never carry anything unsafe", "JFMAMJJASOND".split("").every(l => svg.includes(`>${l}<`)));
    check("malformed input (not the real shape) is refused instead of throwing", run(sandbox, "buildAnnualWeatherSvg(null)") === null && run(sandbox, "buildAnnualWeatherSvg({ months: [] })") === null);
  }

  // ---------------------------------------------------------------------------------------------------------------- wired into siteController.js: the real resolveAnnualWeather/updateWeatherUI against a stand-in page
  {
    const els = {};
    let weatherImpl = async () => ({ ok: true, status: 200, json: async () => sampleYearJson(year) });
    const calls = [];      // only the weather service's own calls — resolveSiteRegion's own Nominatim call shares this stub fetch but is not what these checks are about
    const sandbox = {
      console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error, encodeURIComponent, setTimeout, clearTimeout,
      setInterval: () => 0, clearInterval: () => {},
      document: { getElementById: id => (els[id] = els[id] || fakeElement()) },
      lookupWindZone: () => null,
      escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
      fetch: async url => {
        if (String(url).includes("archive-api.open-meteo.com")) { calls.push(url); return weatherImpl(); }
        return { ok: true, status: 200, json: async () => ({}) };      // resolveSiteRegion's own Nominatim reverse-geocode: not what this block tests, just needs to not throw
      },
    };
    const ctx = vm.createContext(sandbox);
    for (const f of ["siteWeather.js", "siteController.js"]) vm.runInContext(read(f), ctx, { filename: f });
    const run3 = e => vm.runInContext(e, ctx);
    run3('updateAssumptionsUI = function(){}; drawSunCompass = function(){}; buildSunPathSvg = function(){ return null; }; updateStructureUI = function(){}; updateRoofFeaturesUI = function(){}; updateSiteTabsUI = function(){};');

    check("before any site is set, nothing has been fetched (the HTML's own static text is the invitation to set one — updateWeatherUI has not had a reason to touch it yet)", calls.length === 0);

    run3("siteState.lat = 52.48; siteState.lng = -1.9; updateSiteUI(); resolveSiteRegion();");
    check("choosing a site does not fetch its weather immediately (the same 700ms debounce as the region/wind-zone lookup — a dragged marker asks once, for where it stopped)", calls.length === 0);
    await new Promise(r => setTimeout(r, 750));
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    check("once it resolves, the status names the year and the chart has real content", /the last full year on record/.test(els["site-weather-status"].textContent) && /<svg/.test(els["site-weather-chart"].innerHTML));
    check("exactly one request was made for it", calls.length === 1);

    run3("siteState.lat = 52.48; siteState.lng = -1.9; updateSiteUI(); resolveSiteRegion();");
    await new Promise(r => setTimeout(r, 750));
    await new Promise(r => setImmediate(r));
    check("the same place again, moments later, does not ask the service again (siteWeather.js's own cache)", calls.length === 1);

    weatherImpl = async () => { throw new Error("offline"); };
    run3("siteState.lat = 3; siteState.lng = 3; updateSiteUI(); resolveSiteRegion();");
    await new Promise(r => setTimeout(r, 750));
    await new Promise(r => setImmediate(r));
    check("a place the service cannot be reached for gets a plain-English fallback, not a stack trace, and does not crash the rest of the tab", /Couldn.t be looked up/.test(els["site-weather-status"].textContent) && els["site-weather-chart"].innerHTML === "");
  }

  console.log(fails === 0 ? "\nSITE WEATHER OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
