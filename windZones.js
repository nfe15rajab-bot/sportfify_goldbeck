/**
 * windZones.js — the German wind zone (DIN EN 1991-1-4/NA) of a site, from where it is.
 *
 * DATA: the DIBt's "Zuordnung der Windzonen nach Verwaltungsgrenzen" (workbook, Stand 2 June 2022):
 * https://www.dibt.de/fileadmin/dibt-website/Dokumente/Referat/P5/Technische_Bestimmungen/Windzonen_nach_Verwaltungsgrenzen.xlsx
 * The DIBt compiles the states' lists and says so itself: the states' official announcements are binding. So the
 * result is an aid with its basis shown, and the Site tab lets the designer override it.
 *
 * HOW: Nominatim's reverse geocoding (already used by the Site tab) gives the state (ISO 3166-2 code), Landkreis or
 * kreisfreie Stadt, and Gemeinde. The list is by Kreis, with exceptions by Gemeinde. Where a Kreis is split and the
 * Gemeinde can't be matched (the list names Ämter, Samtgemeinden or "left of the Moselle", which a coordinate doesn't
 * tell), the HIGHER zone is returned and marked as such: an unsafe answer is worse than a cautious one.
 *
 * Coverage: Germany only. Elsewhere the result is null and the analysis says its default was assumed.
 *
 * Regenerate: the NRW block comes straight from the workbook's sheet; the other states were encoded from its text.
 * Check any change with the tests in tools/windzones-test.js (real Nominatim responses).
 */
const WIND_ZONE_SOURCE = { name: "DIBt — Zuordnung der Windzonen nach Verwaltungsgrenzen", stand: "2022-06-02", url: "https://www.dibt.de/fileadmin/dibt-website/Dokumente/Referat/P5/Technische_Bestimmungen/Windzonen_nach_Verwaltungsgrenzen.xlsx" };

const WIND_ZONE_STATES = {
  "DE-SH": { name: "Schleswig-Holstein", areas: [
      { "names": [ "Schleswig-Flensburg", "Flensburg" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [ "Wohlde", "Bergenhusen", "Norderstapel", "Süderstapel", "Erfde", "Meggerdorf", "Tielen" ] } ] },
      { "names": [ "Nordfriesland", "Dithmarschen" ], "zone": 4 },
      { "names": [ "Rendsburg-Eckernförde", "Pinneberg", "Steinburg" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [ "Helgoland" ] } ] },
      { "names": [ "Segeberg", "Plön", "Stormarn", "Herzogtum Lauenburg", "Kiel", "Lübeck", "Neumünster" ], "zone": 2 },
      { "names": [ "Ostholstein" ], "zone": 2, "except": [ { "zone": 3, "municipalities": [ "Gremersdorf", "Neukirchen", "Heringsdorf", "Göhl", "Grube", "Dahme", "Kellenhusen", "Riepsdorf", "Großenbrode", "Heiligenhafen" ] }, { "zone": 4, "municipalities": [ "Fehmarn" ] } ] }
    ] },
  "DE-HH": { name: "Hamburg", defaultZone: 2, note: "Hamburg's port area has its own requirements (Technische Baubestimmungen der Stadt Hamburg)." },
  "DE-NI": { name: "Niedersachsen", areas: [
      { "names": [ "Aurich", "Wittmund", "Friesland", "Cuxhaven", "Emden", "Wilhelmshaven" ], "zone": 4 },
      { "names": [ "Wesermarsch" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [ "Butjadingen", "Stadland", "Nordenham", "Jade", "Ovelgönne", "Brake" ], "unknownMembers": true, "note": "Butjadingen, Stadland and Jader Marsch" } ] },
      { "names": [ "Stade" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [ "Freiburg", "Balje", "Krummendeich", "Oederquart" ], "unknownMembers": true, "note": "the Kehdingen area" } ] },
      { "names": [ "Leer", "Ammerland", "Oldenburg", "Osterholz", "Delmenhorst" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [ "Borkum" ] } ] },
      { "names": [ "Rotenburg (Wümme)" ], "zone": 2, "except": [ { "zone": 3, "municipalities": [ "Bremervörde", "Gnarrenburg", "Zeven", "Heeslingen" ], "unknownMembers": true, "note": "the Samtgemeinden Geestequelle, Selsingen and Tarmstedt" } ] },
      { "names": [ "Hannover", "Emsland", "Grafschaft Bentheim", "Cloppenburg", "Vechta", "Diepholz", "Verden", "Harburg", "Lüneburg", "Heidekreis", "Uelzen", "Lüchow-Dannenberg", "Celle", "Nienburg (Weser)", "Gifhorn", "Peine", "Helmstedt", "Wolfenbüttel", "Goslar", "Wolfsburg", "Braunschweig", "Salzgitter" ], "zone": 2 },
      { "names": [ "Osnabrück" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Wallenhorst", "Belm", "Bissendorf", "Melle", "Dissen am Teutoburger Wald", "Bad Iburg", "Hilter am Teutoburger Wald", "Georgsmarienhütte", "Hagen am Teutoburger Wald", "Hasbergen", "Osnabrück" ] } ] },
      { "names": [ "Schaumburg" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Rinteln" ] } ] },
      { "names": [ "Hameln-Pyrmont" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Bad Münder" ] } ] },
      { "names": [ "Hildesheim" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Duingen", "Alfeld", "Freden" ] } ] },
      { "names": [ "Holzminden", "Northeim", "Göttingen" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Bad Grund", "Bad Lauterberg im Harz", "Bad Sachsa", "Herzberg am Harz", "Osterode am Harz", "Walkenried", "Hattorf" ], "unknownMembers": true, "note": "the Samtgemeinde Hattorf" } ] }
    ] },
  "DE-HB": { name: "Bremen", areas: [
      { "names": [ "Bremen" ], "zone": 3 },
      { "names": [ "Bremerhaven" ], "zone": 4 }
    ] },
  "DE-NW": { name: "Nordrhein-Westfalen", areas: [
      { "names": [ "Düsseldorf" ], "municipalityZones": { "Düsseldorf": 1 } },
      { "names": [ "Duisburg" ], "municipalityZones": { "Duisburg": 1 } },
      { "names": [ "Essen" ], "municipalityZones": { "Essen": 1 } },
      { "names": [ "Krefeld" ], "municipalityZones": { "Krefeld": 2 } },
      { "names": [ "Mönchengladbach" ], "municipalityZones": { "Mönchengladbach": 2 } },
      { "names": [ "Mülheim an der Ruhr" ], "municipalityZones": { "Mülheim an der Ruhr": 1 } },
      { "names": [ "Oberhausen" ], "municipalityZones": { "Oberhausen": 1 } },
      { "names": [ "Remscheid" ], "municipalityZones": { "Remscheid": 1 } },
      { "names": [ "Solingen" ], "municipalityZones": { "Solingen": 1 } },
      { "names": [ "Wuppertal" ], "municipalityZones": { "Wuppertal": 1 } },
      { "names": [ "Kleve" ], "zone": 2 },
      { "names": [ "Mettmann" ], "zone": 1 },
      { "names": [ "Rhein-Kreis Neuss" ], "zone": 2 },
      { "names": [ "Viersen" ], "zone": 2 },
      { "names": [ "Wesel" ], "zone": 2 },
      { "names": [ "Bonn" ], "municipalityZones": { "Bonn": 2 } },
      { "names": [ "Köln" ], "municipalityZones": { "Köln": 1 } },
      { "names": [ "Leverkusen" ], "municipalityZones": { "Leverkusen": 1 } },
      { "names": [ "Aachen" ], "zone": 2 },
      { "names": [ "Düren" ], "zone": 2 },
      { "names": [ "Rhein-Erft-Kreis" ], "zone": 2 },
      { "names": [ "Euskirchen" ], "zone": 2 },
      { "names": [ "Heinsberg" ], "zone": 2 },
      { "names": [ "Oberbergischer Kreis" ], "zone": 1 },
      { "names": [ "Rheinisch-Bergischer Kreis" ], "zone": 1 },
      { "names": [ "Rhein-Sieg-Kreis" ], "municipalityZones": { "Alfter": 2, "Bad Honnef": 1, "Bornheim": 2, "Eitorf": 1, "Hennef (Sieg)": 1, "Königswinter": 1, "Lohmar": 1, "Meckenheim": 2, "Much": 1, "Neunkirchen-Seelscheid": 1, "Niederkassel": 1, "Rheinbach": 2, "Ruppichteroth": 1, "Sankt Augustin": 1, "Siegburg": 1, "Swisttal": 2, "Troisdorf": 1, "Wachtberg": 2, "Windeck": 1 } },
      { "names": [ "Bottrop" ], "municipalityZones": { "Bottrop": 1 } },
      { "names": [ "Gelsenkirchen" ], "municipalityZones": { "Gelsenkirchen": 1 } },
      { "names": [ "Münster" ], "municipalityZones": { "Münster": 2 } },
      { "names": [ "Borken" ], "zone": 2 },
      { "names": [ "Coesfeld" ], "zone": 2 },
      { "names": [ "Recklinghausen" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Gladbeck" ] } ] },
      { "names": [ "Steinfurt" ], "zone": 2 },
      { "names": [ "Warendorf" ], "zone": 2 },
      { "names": [ "Bielefeld" ], "municipalityZones": { "Bielefeld": 1 } },
      { "names": [ "Gütersloh" ], "municipalityZones": { "Borgholzhausen": 1, "Gütersloh": 2, "Halle": 1, "Harsewinkel": 2, "Herzebrock-Clarholz": 1, "Langenberg": 2, "Rheda-Wiedenbrück": 2, "Rietberg": 2, "Schloß Holte-Stukenbrock": 1, "Steinhagen": 1, "Verl": 2, "Versmold": 2, "Werther": 1 } },
      { "names": [ "Herford" ], "zone": 1 },
      { "names": [ "Höxter" ], "zone": 1 },
      { "names": [ "Lippe" ], "zone": 1 },
      { "names": [ "Minden-Lübbecke" ], "zone": 2 },
      { "names": [ "Paderborn" ], "zone": 1 },
      { "names": [ "Bochum" ], "municipalityZones": { "Bochum": 1 } },
      { "names": [ "Dortmund" ], "municipalityZones": { "Dortmund": 1 } },
      { "names": [ "Hagen" ], "municipalityZones": { "Hagen": 1 } },
      { "names": [ "Hamm" ], "municipalityZones": { "Hamm": 2 } },
      { "names": [ "Herne" ], "municipalityZones": { "Herne": 1 } },
      { "names": [ "Ennepe-Ruhr-Kreis" ], "zone": 1 },
      { "names": [ "Hochsauerlandkreis" ], "zone": 1 },
      { "names": [ "Märkischer Kreis" ], "zone": 1 },
      { "names": [ "Olpe" ], "zone": 1 },
      { "names": [ "Siegen-Wittgenstein" ], "zone": 1 },
      { "names": [ "Soest" ], "zone": 1 },
      { "names": [ "Unna" ], "zone": 1 }
    ] },
  "DE-HE": { name: "Hessen", defaultZone: 1 },
  "DE-RP": { name: "Rheinland-Pfalz", defaultZone: 1, areas: [
      { "names": [ "Ahrweiler", "Vulkaneifel", "Bitburg-Prüm", "Eifelkreis Bitburg-Prüm" ], "zone": 2 },
      { "names": [ "Cochem-Zell", "Bernkastel-Wittlich", "Trier-Saarburg", "Trier" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [], "unknownMembers": true, "note": "the parts left of the Moselle are zone 2" } ] },
      { "names": [ "Mayen-Koblenz", "Koblenz" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [], "unknownMembers": true, "note": "the parts left of the Moselle and the Rhine are zone 2" } ] }
    ] },
  "DE-BW": { name: "Baden-Württemberg", defaultZone: 1, areas: [
      { "names": [ "Bodenseekreis", "Biberach", "Ravensburg", "Sigmaringen" ], "zone": 2 },
      { "names": [ "Alb-Donau-Kreis" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Balzheim", "Dietenheim", "Hüttisheim", "Illerkirchberg", "Illerrieden", "Schnürpflingen", "Staig" ] } ] },
      { "names": [ "Konstanz" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [], "unknownMembers": true, "note": "the Bodensee shore communes up to 3 km inland are zone 2" } ] }
    ] },
  "DE-BY": { name: "Bayern", defaultZone: 1, areas: [
      { "names": [ "Donau-Ries", "Dillingen an der Donau", "Kempten" ], "zone": 1 },
      { "names": [ "Günzburg", "Neu-Ulm", "Augsburg", "Aichach-Friedberg", "Unterallgäu", "Lindau (Bodensee)", "Memmingen", "Kaufbeuren" ], "zone": 2 },
      { "names": [ "Oberallgäu" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Altusried", "Dietmannsried", "Haldenwang" ] } ] },
      { "names": [ "Ostallgäu" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Pfronten", "Hopferau", "Nesselwang", "Füssen", "Schwangau", "Rieden am Forggensee", "Roßhaupten", "Seeg", "Görisried", "Wald", "Lengenwang", "Stötten am Auerberg", "Rückholz", "Eisenberg", "Lechbruck", "Halblech" ] } ] },
      { "names": [ "Eichstätt", "Freising", "Neuburg-Schrobenhausen", "Erding", "Pfaffenhofen an der Ilm", "Mühldorf am Inn", "Berchtesgadener Land", "Garmisch-Partenkirchen", "Altötting", "Ingolstadt" ], "zone": 1 },
      { "names": [ "Dachau", "München", "Fürstenfeldbruck", "Landsberg am Lech", "Ebersberg", "Starnberg", "Rosenheim" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Kiefersfelden", "Oberaudorf", "Flintsbach am Inn", "Brannenburg", "Nußdorf am Inn", "Samerberg", "Aschau im Chiemgau" ] } ] },
      { "names": [ "Weilheim-Schongau" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Steingaden", "Bernbeuren" ], "unknownMembers": true, "note": "the Verwaltungsgemeinschaft Steingaden and Bernbeuren" } ] },
      { "names": [ "Bad Tölz-Wolfratshausen" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Wolfratshausen", "Icking", "Münsing", "Egling", "Geretsried", "Eurasburg", "Königsdorf", "Bad Tölz", "Reichersbeuern", "Dietramszell", "Bad Heilbrunn", "Sachsenkam" ] } ] },
      { "names": [ "Miesbach" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Holzkirchen", "Otterfing", "Warngau", "Valley", "Weyarn", "Irschenberg", "Miesbach", "Gmund am Tegernsee", "Waakirchen", "Hausham" ] } ] },
      { "names": [ "Traunstein" ], "zone": 2, "except": [ { "zone": 1, "municipalities": [ "Grassau", "Schleching", "Staudach-Egerndach", "Marquartstein", "Unterwössen", "Reit im Winkl", "Ruhpolding", "Bergen", "Siegsdorf", "Inzell", "Surberg", "Petting", "Wonneberg", "Waging am See", "Kirchanschöring", "Fridolfing", "Taching am See", "Palling", "Tittmoning", "Engelsberg", "Tacherting" ] } ] }
    ] },
  "DE-SL": { name: "Saarland", defaultZone: 1 },
  "DE-BE": { name: "Berlin", defaultZone: 2 },
  "DE-BB": { name: "Brandenburg", defaultZone: 2 },
  "DE-MV": { name: "Mecklenburg-Vorpommern", areas: [
      { "names": [ "Ludwigslust-Parchim", "Mecklenburgische Seenplatte", "Vorpommern-Greifswald", "Schwerin" ], "zone": 2 },
      { "names": [ "Nordwestmecklenburg" ], "zone": 3, "except": [ { "zone": 2, "municipalities": [], "unknownMembers": true, "note": "the Ämter Gadebusch and Lützow-Lübstorf are zone 2" } ] },
      { "names": [ "Rostock" ], "cityOnly": true, "zone": 3 },
      { "names": [ "Rostock" ], "zone": 3, "except": [ { "zone": 2, "municipalities": [ "Güstrow", "Teterow" ], "unknownMembers": true, "note": "the Ämter Bützow-Land, Güstrow-Land, Laage, Krakow am See, Mecklenburgische Schweiz and Gnoien are zone 2" } ] },
      { "names": [ "Vorpommern-Rügen" ], "zone": 3, "except": [ { "zone": 4, "municipalities": [], "unknownMembers": true, "note": "the Ämter West-Rügen (with Hiddensee), Nord-Rügen and Bergen (except Gustow, Poseritz, Garz) are zone 4" } ] }
    ] },
  "DE-SN": { name: "Sachsen", defaultZone: 2 },
  "DE-ST": { name: "Sachsen-Anhalt", defaultZone: 2 },
  "DE-TH": { name: "Thüringen", areas: [
      { "names": [ "Schmalkalden-Meiningen", "Hildburghausen", "Sonneberg", "Suhl" ], "zone": 1 },
      { "names": [ "Wartburgkreis" ], "zone": 1, "except": [ { "zone": 2, "municipalities": [ "Behringen", "Berka vor dem Hainich", "Creuzburg", "Falken", "Großenlupnitz", "Ifta", "Mihla", "Nazza", "Reichenbach", "Ruhla", "Schnellmannshausen", "Treffurt", "Tüngeda", "Wutha-Farnroda" ] } ] },
      { "names": [ "Eichsfeld", "Nordhausen", "Unstrut-Hainich-Kreis", "Kyffhäuserkreis", "Sömmerda", "Gotha", "Ilm-Kreis", "Weimarer Land", "Greiz", "Saale-Holzland-Kreis", "Saalfeld-Rudolstadt", "Altenburger Land", "Saale-Orla-Kreis", "Erfurt", "Weimar", "Jena", "Gera", "Eisenach" ], "zone": 2 }
    ] },
};

/* ── Matching ── */

/** Names compared without titles, umlauts, brackets or punctuation: "Landkreis Rotenburg (Wümme)" -> "rotenburg". */
function normWindName(s) {
  return String(s || "").toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\b(landeshauptstadt|freie|hansestadt|landkreis|kreisfreie|stadt|kreis|region|samtgemeinde|verwaltungsgemeinschaft|gemeinde|amt|landschaft|insel)\b/g, " ")
    .replace(/kreis\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same name, or one is the other with words added at the front or back ("Bad Münder" / "Bad Münder am Deister"). */
function windNamesMatch(a, b) {
  const x = normWindName(a), y = normWindName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 3) return false;
  return long.startsWith(short + " ") || long.endsWith(" " + short);
}

function windAreaFor(state, candidates, hasCounty) {
  for (const cand of candidates) {
    // cityOnly: the kreisfreie Stadt of the same name as a Landkreis (Rostock): it has no county in an address.
    const area = (state.areas || []).find(a => !(a.cityOnly && hasCounty) && a.names.some(n => windNamesMatch(n, cand)));
    if (area) return { area, matchedOn: cand };
  }
  return null;
}

function windMunicipalityMatch(list, candidates) {
  return candidates.some(c => (list || []).some(m => windNamesMatch(m, c)));
}

/**
 * The wind zone for a Nominatim reverse-geocoding "address" object.
 *
 * Returns { zone, confidence, basis, note, possibleZones }:
 *   zone        1-4, or null when it can't be told (outside Germany, or a Landkreis that didn't match the list)
 *   confidence  "gemeinde"     the Gemeinde is named in the list
 *               "kreis"        the whole Kreis (or state) is in one zone, or every part of it is
 *               "conservative" the Kreis is split and the Gemeinde couldn't be placed: the HIGHER zone is returned
 *               "none"         no answer
 */
function lookupWindZone(addr) {
  const none = note => ({ zone: null, confidence: "none", basis: "", note, possibleZones: [] });
  if (!addr || String(addr.country_code || "").toLowerCase() !== "de")
    return none("Outside Germany: the German wind zones don't apply. Set the wind zone by hand.");

  const state = WIND_ZONE_STATES[addr["ISO3166-2-lvl4"]];
  if (!state) return none("This state isn't in the wind zone list. Set the wind zone by hand.");

  const areaCandidates = [addr.county, addr.city, addr.town, addr.municipality, addr.village].filter(Boolean);
  const gemeindeCandidates = [addr.municipality, addr.town, addr.city, addr.village, addr.hamlet].filter(Boolean);
  const place = gemeindeCandidates[0] || "";
  const source = " (DIBt list, " + WIND_ZONE_SOURCE.stand + ")";

  const found = windAreaFor(state, areaCandidates, !!addr.county);
  if (!found) {
    if (state.defaultZone) {
      return { zone: state.defaultZone, confidence: "kreis", possibleZones: [state.defaultZone],
               basis: state.name + (state.areas ? " (not among the Kreise listed with other zones)" : " (the whole state)") + source, note: state.note || "" };
    }
    return none("Couldn't match \"" + (addr.county || addr.city || addr.town || "this place") + "\" to the wind zone list for " + state.name + ". Set the wind zone by hand.");
  }

  const area = found.area;
  const where = (addr.county || addr.city || found.matchedOn) + ", " + state.name;

  // Areas listed by Gemeinde (NRW's mixed Kreise).
  if (area.municipalityZones) {
    const names = Object.keys(area.municipalityZones);
    const hit = names.find(n => windMunicipalityMatch([n], gemeindeCandidates));
    if (hit) return { zone: area.municipalityZones[hit], confidence: "gemeinde", possibleZones: [area.municipalityZones[hit]], basis: where + " — " + hit + source, note: "" };
    const all = [...new Set(names.map(n => area.municipalityZones[n]))];
    const zone = Math.max(...all);
    return { zone, confidence: "conservative", possibleZones: all, basis: where + source,
             note: "This Kreis is split by Gemeinde and \"" + place + "\" wasn't found in the list: the higher zone is used." };
  }

  // Exceptions by Gemeinde: a named Gemeinde takes its exception's zone.
  const exceptions = area.except || [];
  for (const ex of exceptions) {
    if (windMunicipalityMatch(ex.municipalities, gemeindeCandidates)) {
      return { zone: ex.zone, confidence: "gemeinde", possibleZones: [ex.zone], basis: where + " — " + place + source, note: "" };
    }
  }

  // Not named. Exceptions whose members aren't all known (Ämter, Samtgemeinden, "left of the Moselle") could still apply.
  const uncertain = exceptions.filter(ex => ex.unknownMembers);
  const possible = [...new Set([area.zone, ...uncertain.map(ex => ex.zone)])].sort();
  if (possible.length === 1) {
    return { zone: area.zone, confidence: "kreis", possibleZones: possible, basis: where + source, note: "" };
  }
  return {
    zone: Math.max(...possible), confidence: "conservative", possibleZones: possible, basis: where + source,
    note: "Part of this Kreis is in another zone (" + uncertain.map(ex => ex.note).filter(Boolean).join("; ") + "), which a coordinate can't tell: the higher zone is used. Check the state's list.",
  };
}

if (typeof module !== "undefined") module.exports = { lookupWindZone, normWindName, windNamesMatch, WIND_ZONE_STATES, WIND_ZONE_SOURCE };
