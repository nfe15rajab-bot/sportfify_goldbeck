// Tests for sunPosition.js's solar-time conversion: the fix for the Site tab reading its date/time in this
// computer's own time zone instead of the site's (sunrise after sunset was possible whenever they differed).
// Run: node tools/sun-time-test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const sandbox = { console, Date, Math, String, Number };
vm.createContext(sandbox);
vm.runInContext(read("sunPosition.js"), sandbox, { filename: "sunPosition.js" });
const run = e => vm.runInContext(e, sandbox);

// ---------------------------------------------------------------------------------------------------------------- solarTimeToInstant / instantToSolarTime
check("at longitude 0, solar time IS UTC: a clock reading of noon becomes the UTC instant of noon",
  run("solarTimeToInstant(2026, 6, 21, 12, 0, 0).getTime()") === Date.UTC(2026, 5, 21, 12, 0));
check("15 degrees east of Greenwich, noon solar time is an hour earlier in UTC (the sun gets there first)",
  run("solarTimeToInstant(2026, 6, 21, 12, 0, 15).getTime()") === Date.UTC(2026, 5, 21, 11, 0));
check("15 degrees west, noon solar time is an hour later in UTC",
  run("solarTimeToInstant(2026, 6, 21, 12, 0, -15).getTime()") === Date.UTC(2026, 5, 21, 13, 0));
check("instantToSolarTime is the exact reverse of solarTimeToInstant, at a longitude that is not a whole multiple of 15 (fractional hours)",
  run(`(() => { const i = solarTimeToInstant(2026, 9, 27, 14, 37, -71.06); const back = instantToSolarTime(i, -71.06); return back.y === 2026 && back.m === 9 && back.d === 27 && back.hh === 14 && back.mm === 37; })()`));
check("with no longitude (site not set yet), the reading is just the browser's own local time, unconverted — the only behaviour there ever was",
  run("solarTimeToInstant(2026, 6, 21, 12, 0, null).getTime()") === new Date(2026, 5, 21, 12, 0).getTime());
check("a longitude that pushes the reading across midnight still lands on the right calendar day (crossing the date, not just the hour)",
  run(`(() => { const t = instantToSolarTime(new Date(Date.UTC(2026, 0, 1, 1, 0)), -179); return t.y === 2025 && t.m === 12 && t.d === 31; })()`));

// ---------------------------------------------------------------------------------------------------------------- solarTimeLabel / solarNow
check("solarTimeLabel reads an instant back in the same solar-time convention siteDateTime writes it in (round trip through a real siteState)",
  run(`solarTimeLabel(siteDateTime({ date: "2026-09-27", time: "14:37", lng: -71.06 }), -71.06)`) === "14:37");
check("solarTimeLabel with no longitude falls back to the browser's own local clock reading (toLocaleTimeString), not a crash", (() => {
  const label = run(`solarTimeLabel(new Date(2026, 5, 21, 9, 5), null)`);
  return typeof label === "string" && /\d/.test(label);
})());
check("solarTimeLabel on a broken input (not a Date, or an invalid one) returns the placeholder, never throws",
  run(`solarTimeLabel(null, 0)`) === "—" && run(`solarTimeLabel(new Date(NaN), 0)`) === "—");
check("solarNow's date/time are exactly what solarTimeToInstant would turn back into the same instant (round trip through the real 'now')", (() => {
  const ok = run(`(() => {
    const lng = 137.4;
    const now = solarNow(lng);
    const [y, m, d] = now.date.split("-").map(Number);
    const [hh, mm] = now.time.split(":").map(Number);
    const rebuilt = solarTimeToInstant(y, m, d, hh, mm, lng);
    return Math.abs(rebuilt.getTime() - Date.now()) < 90000;   // within the same minute either side of "now" (the test itself takes a moment to run)
  })()`);
  return ok;
})());

// ---------------------------------------------------------------------------------------------------------------- the bug itself: sunrise no longer able to fall after sunset
// A second sandbox with the real SunCalc loaded too (its UMD wrapper attaches to globalThis.SunCalc when neither
// CommonJS's `exports`/`module` nor AMD's `define` exist — exactly a bare vm context, so neither is given here),
// so getSunPosition/getSunTimes can be exercised for real, not just their date math.
const sandbox2 = { console, Date, Math, String, Number };
vm.createContext(sandbox2);
vm.runInContext(read("vendor/suncalc/suncalc.js"), sandbox2, { filename: "suncalc.js" });
vm.runInContext(read("sunPosition.js"), sandbox2, { filename: "sunPosition.js" });
const run2 = e => vm.runInContext(e, sandbox2);
{
  // Birmingham, UK, in September: whatever the browser's own time zone is (simulated here by giving no correction
  // at all would be the old, buggy behaviour) sunrise must still land before sunset once read back in solar time.
  const site = { date: "2026-09-27", time: "12:00", lat: 52.48, lng: -1.9 };
  const sunrise = run2(`solarTimeLabel(getSunTimes(${JSON.stringify(site)}).sunrise, ${site.lng})`);
  const sunset = run2(`solarTimeLabel(getSunTimes(${JSON.stringify(site)}).sunset, ${site.lng})`);
  check("Birmingham, late September: sunrise is a plausible early-morning hour and sunset a plausible evening one (the bug this replaces once showed sunrise at 23:00 and sunset at 10:53)",
    /^0[5-7]:/.test(sunrise) && /^1[7-9]:/.test(sunset), `sunrise ${sunrise}, sunset ${sunset}`);
  const noonSun = run2(`getSunPosition(${JSON.stringify(site)})`);
  check("at solar noon the sun is roughly due south (azimuth near 180°) and above the horizon — not below it, which is what the unconverted browser-clock bug produced whenever the machine was several hours off the site's zone",
    noonSun.altitudeDeg > 0 && Math.abs(noonSun.azimuthDeg - 180) < 20, `azimuth ${noonSun.azimuthDeg.toFixed(1)}, altitude ${noonSun.altitudeDeg.toFixed(1)}`);
}

console.log(fails === 0 ? "\nSUN TIME OK" : `\n${fails} check(s) failed`);
process.exit(fails === 0 ? 0 : 1);
