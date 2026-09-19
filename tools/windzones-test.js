// Tests for windZones.js. Run: node tools/windzones-test.js
//
// tools/windzones-fixtures.json holds the twelve REAL Nominatim reverse-geocoding responses the lookup was built
// against (Hamburg, Munich, Sylt, Rügen, Osnabrück, Bad Münder, ...) and constructed addresses for the edge cases
// of the DIBt list (Kreise split by Gemeinde, Samtgemeinden, kreisfreie Städte, outside Germany). The expected zones
// were read off the DIBt workbook by hand, not produced by the code under test.
const path = require("path");
const { lookupWindZone, normWindName, windNamesMatch } = require(path.join(__dirname, "..", "windZones.js"));
const cases = require("./windzones-fixtures.json");

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

for (const c of cases) {
  const r = lookupWindZone(c.address);
  check(c.name, r.zone === c.zone && r.confidence === c.confidence,
        `-> zone ${r.zone} (${r.confidence}), expected ${c.zone} (${c.confidence})${r.zone !== c.zone || r.confidence !== c.confidence ? "  basis: " + r.basis : ""}`);
}

check("names: titles and brackets are ignored", normWindName("Landkreis Rotenburg (Wümme)") === "rotenburg");
check("names: umlauts", normWindName("Süderstapel") === "suederstapel");
check("names: a district is matched with words added", windNamesMatch("Bad Münder", "Bad Münder am Deister"));
check("names: different places don't match", !windNamesMatch("Bremen", "Bremerhaven"));
check("names: a short fragment doesn't match", !windNamesMatch("Wald", "Waldkirch"));

console.log(fails === 0 ? "\nALL WIND ZONE CHECKS PASSED (" + cases.length + " sites)" : "\n" + fails + " CHECK(S) FAILED");
process.exit(fails ? 1 : 0);
