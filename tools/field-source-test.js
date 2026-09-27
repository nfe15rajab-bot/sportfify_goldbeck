// Tests that the sports' dimensions come from the database once the API answers (data.js: applyFieldVariants, loadFieldVariantsFromApi). Run: node tools/field-source-test.js
//
// FIELDS in data.js is the offline table; the API's FieldVariants are the source. The seed and the table agreeing is checked in the Revit/API repository (Tools/SourceParity, which
// starts the real API); this pins what the app does with the API's answer: a change made in the Catalogue tab reaches the Sport tab, a bad row does not spoil the table, an API that
// is not there leaves it alone.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

let answer = { ok: false };
const sandbox = { console: { log() {}, warn() {}, error() {} }, fetch: async () => { if (answer.throws) throw new Error("connection refused"); return { ok: answer.ok, json: async () => answer.body }; } };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web, "data.js"), "utf8"), ctx, { filename: "data.js" });
const get = expr => vm.runInContext(expr, ctx);
const variant = (name, v, l, w, runoff, h, norm) => ({ variant: v, lengthM: l, widthM: w, runoffM: runoff, heightMinM: h, norm });

(async () => {
  const offline = JSON.parse(JSON.stringify(get("FIELDS")));
  check("the table stands while the API has not answered", get("FIELDS.basketball.standard.l") === 28 && get("fieldVariantsFromApi") === 0);

  check("sport names map to the table's keys: Polyvalent (multi-sport), Football (indoor), Basketball", get("fieldKeyOfSportName")("Polyvalent (multi-sport)") === "polyvalent" && get("fieldKeyOfSportName")("Football (indoor)") === "football" && get("fieldKeyOfSportName")("  Basketball ") === "basketball" && get("fieldKeyOfSportName")(null) === "");

  const sports = [
    { name: "Basketball", variants: [variant("Basketball", "standard", 30, 16, 2.5, 7.5, "FIBA test"), variant("Basketball", "mini", 22, 13, 2, 7, "FIBA / DIN 18032")] },
    { name: "Football (indoor)", variants: [variant("", "standard", -1, 20, 2, 5, "DFB")] },                 // a bad size: left alone
    { name: "Curling", variants: [variant("Curling", "standard", 45, 5, 1, 4, "WCF")] },                    // a sport the table has no key for: left alone
  ];
  answer = { ok: true, body: sports };
  const applied = await get("loadFieldVariantsFromApi")();
  check("a variant the Catalogue tab changed is what FIELDS says now (30 x 16, run-off 2.5, 7.5 m high, its norm)", applied === 2 && get("FIELDS.basketball.standard.l") === 30 && get("FIELDS.basketball.standard.w") === 16 && get("FIELDS.basketball.standard.runoff") === 2.5 && get("FIELDS.basketball.standard.h") === 7.5 && get("FIELDS.basketball.standard.norm") === "FIBA test");
  check("...and the ones it did not change are as they were", get("FIELDS.basketball.competition.l") === 34 && get("FIELDS.volleyball.competition.h") === 12.5);
  check("a row with a size that is not a positive number leaves the table's entry alone", get("FIELDS.football.standard.l") === 35);
  check("a sport the table has no key for is ignored, not added", get("typeof FIELDS.curling") === "undefined");

  // the same as the table, as the seeding does: nothing changes
  const same = Object.entries(offline).map(([key, variants]) => ({ name: key, variants: Object.entries(variants).map(([v, d]) => variant(key, v, d.l, d.w, d.runoff, d.h, d.norm)) }));
  vm.runInContext("Object.assign(FIELDS.basketball.standard, " + JSON.stringify(offline.basketball.standard) + ");", ctx);
  answer = { ok: true, body: same };
  await get("loadFieldVariantsFromApi")();
  check("the database as seeded gives back the table exactly (nothing to redraw, nothing different)", JSON.stringify(get("FIELDS")) === JSON.stringify(offline));

  // the screen is redrawn when something changed
  let redraws = 0;
  sandbox.state = {}; sandbox.updateUI = () => { redraws++; };
  answer = { ok: true, body: sports };
  await get("loadFieldVariantsFromApi")();
  check("the Sport tab is redrawn after the API's sizes are in", redraws === 1);

  answer = { throws: true };
  const before = JSON.stringify(get("FIELDS"));
  const none = await get("loadFieldVariantsFromApi")();
  check("an API that is not running changes nothing and does not throw", none === 0 && JSON.stringify(get("FIELDS")) === before);
  answer = { ok: false };
  check("an API that answers with an error changes nothing", (await get("loadFieldVariantsFromApi")()) === 0 && JSON.stringify(get("FIELDS")) === before);

  console.log(fails === 0 ? "\nALL FIELD SOURCE CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL  the test itself threw: " + (e && e.stack || e)); process.exit(1); });
