/**
 * siteTabs.js — the Structure inputs tab and the Site conditions tab.
 *
 * The Site tab had grown to hold everything the analyses need to know about the place: where the roof is, how it is turned, the structural grid, the deck's
 * capacity and frequency, the snow, the day's schedule, the sun targets. It is split by what each thing is about:
 *
 *   Site              where the roof is and how it stands: the roof boundary and size, the location, the orientation, the roof's height, what Revit says
 *                     about it (openings, entries, edge, drains ...), the sun's position
 *   Structure         what the roof deck is made of and can carry: the grid, columns, beams and walls from Revit, the deck capacity, the natural frequency,
 *                     the comfort limits (the inputs are in assumptions.js: ASSUMPTION_GROUPS.structure)
 *   Site conditions   what the roof lives through: the wind zone, snow and altitude, the day's use, the sun and shade targets (ASSUMPTION_GROUPS.conditions)
 *
 * The sidebars hold the inputs (index.html); the main area of each tab shows what they add up to: the structure drawn on the roof, and the conditions with
 * where each value comes from and which analysis uses it. Nothing is computed here: the values are the ones combineState / siteState already hold.
 */

const SITE_TAB_MODES = ["structure", "conditions"];

/** The analyses that use each input, in words, for the "used by" line of a card. */
const ASSUMPTION_USED_BY = {
  deck_capacity: "static loads, dynamic analysis, sun and shade",
  natural_frequency: "dynamic analysis (resonance)",
  comfort_limit_walking: "dynamic analysis (resonance)",
  comfort_limit_rhythmic: "dynamic analysis (resonance)",
  snow_zone: "dynamic analysis (snow load case)",
  altitude: "dynamic analysis (snow load case)",
  day_schedule: "dynamic analysis (crowd through the day)",
  site_latitude: "sun and shade",
  roof_north: "sun and shade, wind and erosion",
  shade_target: "sun and shade",
  garden_min_sun: "sun and shade",
  shade_equipment: "sun and shade"
};

function siteTabsEscape(s) {
  return escapeHtml(s);
}

/** One input as a tile: its value (entered, or the built-in one), and whether the designer has decided it. */
function siteTabTile(key) {
  const d = assumptionDisplay(key);
  if (!d.def) return "";
  const sub = d.state === "entered" ? "entered by you" : d.state === "accepted" ? "built-in, accepted" : "built-in, not confirmed";
  const tone = d.state === "unconfirmed" ? "warn" : "ok";
  const usedBy = ASSUMPTION_USED_BY[key] ? `<div class="res-tile-sub">used by ${siteTabsEscape(ASSUMPTION_USED_BY[key])}</div>` : "";
  return `<div class="res-tile tone-${tone}"><div class="res-tile-value">${siteTabsEscape(d.text)}</div><div class="res-tile-label">${siteTabsEscape(d.def.label)}</div><div class="res-tile-sub">${sub}</div>${usedBy}</div>`;
}

/** "3 of 4 confirmed", with the tone the card takes from it. */
function siteTabConfirmed(keys) {
  const open = assumptionsOpen(keys).length;
  return { text: open === 0 ? "all confirmed" : `${keys.length - open} of ${keys.length} confirmed`, tone: open === 0 ? "ok" : "warn" };
}

/** A button that opens another tab (handled at the bottom of this file), for the views that show inputs kept elsewhere. */
function siteTabEditButton(tab, label) {
  return `<div><button type="button" class="btn-export" data-open-tab="${tab}"><i class="ti ti-pencil" aria-hidden="true"></i>${siteTabsEscape(label)}</button></div>`;
}

function siteTabCard(title, sub, keys, extraTiles, note, button) {
  const c = keys.length ? siteTabConfirmed(keys) : { text: "", tone: "neutral" };
  return resCard({
    title, sub, tone: c.tone, chip: c.text,
    body: `<div class="res-tiles">${extraTiles || ""}${keys.map(siteTabTile).join("")}</div>${note ? `<p class="hint">${note}</p>` : ""}${button || ""}`
  });
}

// ---------------------------------------------------------------------------------------------------- Structure

/** The roof from above with the structure on it: grid lines (with their names), columns, beams and walls, at whatever size fits. Light background: the drawing's colours are for one. */
function structurePlanSvg() {
  const roof = combineState.roof;
  const W = 860, M = 36;
  const scale = Math.min((W - 2 * M) / roof.length, 380 / roof.width);
  const pxW = roof.length * scale, pxH = roof.width * scale;
  const H = Math.ceil(pxH + 2 * M);
  const ox = (W - pxW) / 2, oy = M;
  const shape = typeof roofShapeSvg === "function" ? roofShapeSvg(roof, scale, ox, oy, pxW, pxH) : `<rect x="${ox}" y="${oy}" width="${pxW}" height="${pxH}" fill="none" stroke="#888" stroke-width="1.5"/>`;
  const label = `<text x="${W / 2}" y="20" text-anchor="middle" font-size="12" font-family="'Titillium Web', Arial, sans-serif" fill="#444">${roof.length} m × ${roof.width} m</text>`;
  return `<svg class="structure-plan" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The roof with its structural grid and columns">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f8fafc"/>${label}${shape}${structureSvg(scale, ox, oy, true)}</svg>`;
}

/** The inputs of the structural analyses as a card: the grid Revit gave, the slab, and the deck capacity, frequency and comfort limits with who decided them. */
function structureInputsCardHtml(edit) {
  const st = combineState.structure;
  const f = combineState.roofFeatures;
  const gridTile = st
    ? `<div class="res-tile tone-ok"><div class="res-tile-value">${st.gridLines.filter(g => Math.abs(g.y2 - g.y1) >= Math.abs(g.x2 - g.x1)).length} + ${st.gridLines.filter(g => Math.abs(g.y2 - g.y1) < Math.abs(g.x2 - g.x1)).length} lines</div><div class="res-tile-label">Structural grid</div><div class="res-tile-sub">${st.columns.length} columns, ${st.source === "revit" ? "from Revit" : "entered"}</div></div>`
    : `<div class="res-tile tone-warn"><div class="res-tile-value">none</div><div class="res-tile-label">Structural grid</div><div class="res-tile-sub">the analyses assume a regular 8.4 m grid</div></div>`;
  const slabTile = f && f.slab && f.slab.structural_thickness_m > 0
    ? `<div class="res-tile tone-ok"><div class="res-tile-value">${Math.round(f.slab.structural_thickness_m * 1000)} mm</div><div class="res-tile-label">Slab, structural thickness</div><div class="res-tile-sub">from Revit; the deck's depth in the resonance estimate</div></div>`
    : "";
  return siteTabCard("What the structural analyses rest on",
    "The deck capacity is the structural engineer's figure; the roof cannot know it. Enter it, or accept the built-in value knowingly: until then every structural result is marked PRELIMINARY.",
    assumptionGroupKeys(ASSUMPTION_GROUPS.structure), gridTile + slabTile,
    edit ? "" : "Enter or accept the values in the panel on the left. Revit asks for the same values before it runs an analysis.",
    edit ? siteTabEditButton("structure", "Change them in the Structure inputs tab") : "");
}

function updateStructureTabUI() {
  const host = document.getElementById("structure-view");
  if (!host) return;
  const st = combineState.structure;

  let planBody;
  if (st) {
    const vertical = st.gridLines.filter(g => Math.abs(g.y2 - g.y1) >= Math.abs(g.x2 - g.x1)).length;
    const counts = [`${vertical} + ${st.gridLines.length - vertical} grid lines`, `${st.columns.length} columns`,
      st.beams && st.beams.length ? `${st.beams.length} beams` : "", st.walls && st.walls.length ? `${st.walls.length} walls (${st.walls.filter(w => w.bearing).length} bearing)` : ""].filter(Boolean).join(", ");
    planBody = `${structurePlanSvg()}
      <p class="hint"><span class="structure-key grid"></span> grid line &nbsp; <span class="structure-key column"></span> column &nbsp; <span class="structure-key beam"></span> beam &nbsp; <span class="structure-key wall"></span> wall — ${siteTabsEscape(counts)}.
      The structural and dynamic analyses lay their bays on this grid.</p>`;
  } else {
    planBody = `<p class="hint">No structural grid yet. Push the roof from Revit (the ribbon's <b>Push to Sportify → Structure: grid, columns, beams, walls</b>) and its grid and columns come with it; without one the analyses assume a regular 8.4 m grid and say so.</p>`;
  }
  const plan = resCard({
    title: "Structure on the roof",
    sub: st ? (st.source === "revit" ? "From the Revit model" : "Entered") : "",
    tone: st ? "ok" : "neutral",
    chip: st ? "grid known" : "no grid",
    body: planBody
  });

  const rests = structureInputsCardHtml(false);

  host.innerHTML = plan + rests;
}

// ---------------------------------------------------------------------------------------------------- Site conditions

/** The four cards of the site conditions: wind, snow and altitude, use over the day, sun and shade. `edit` adds the button to the tab where they are entered. */
function conditionsCardsHtml(edit) {
  const sc = ASSUMPTION_GROUPS.conditions;
  const keysOf = title => sc.sections.find(s => s.title === title).keys;
  const button = tab => (edit ? siteTabEditButton("conditions", "Change them in the Site conditions tab") : "");

  const wind = effectiveWindZone();
  const height = effectiveRoofHeight();
  const windTiles = `
    <div class="res-tile${wind.zone ? "" : " tone-warn"}"><div class="res-tile-value">${wind.zone ? "Zone " + wind.zone : "not known"}</div><div class="res-tile-label">Wind zone (DIN EN 1991-1-4/NA)</div>
      <div class="res-tile-sub">${siteTabsEscape(wind.zone ? (wind.basis || "") : (wind.note || "set a site in Germany, or choose a zone"))}</div><div class="res-tile-sub">used by wind and erosion</div></div>
    <div class="res-tile${height.height_m > 0 ? "" : " tone-warn"}"><div class="res-tile-value">${height.height_m > 0 ? height.height_m + " m" : "12 m assumed"}</div><div class="res-tile-label">Roof height above ground</div>
      <div class="res-tile-sub">${siteTabsEscape(height.height_m > 0 ? height.source : "not given (Site tab)")}</div><div class="res-tile-sub">used by wind and erosion</div></div>`;
  const windCard = resCard({
    title: "Wind", sub: "Set here (the zone); the roof's height above ground is in the Site tab.",
    tone: wind.zone ? "ok" : "warn", chip: wind.zone ? `zone ${wind.zone}` : "not known", body: `<div class="res-tiles">${windTiles}</div>${button()}`
  });

  return windCard +
    siteTabCard("Snow and altitude", "The snow load on the roof follows from the German snow zone and the site's altitude (DIN EN 1991-1-3/NA).", keysOf("Snow"), "", "", button()) +
    siteTabCard("Use over the day", "Which day the roof lives through decides how many people are on it, and when.", keysOf("Use over the day"), "", "", button()) +
    siteTabCard("Sun and shade", "Where the roof is (the Site tab's map gives the latitude), how it is turned, and what the shade should achieve.", keysOf("Sun and shade"),
      "", "The location and the orientation are set in the Site tab; typing a value here overrides them for the analyses.", button());
}

function updateConditionsTabUI() {
  const host = document.getElementById("conditions-view");
  if (host) host.innerHTML = conditionsCardsHtml(false);
}

// ---------------------------------------------------------------------------------------------------- both

/** Redraws whichever of the two tabs is open (the other is drawn when it is opened). Safe before the elements exist. */
function updateSiteTabsUI() {
  if (typeof activeMode === "undefined") return;
  if (activeMode === "structure") updateStructureTabUI();
  else if (activeMode === "conditions") updateConditionsTabUI();
}

// ---------------------------------------------------------------------------------------------------- the Results tab's views of them

/** The headline of a received result, for the "which results use them" table; "" when it has not come. */
function conditionsResultHeadline(name) {
  const r = typeof resSection === "function" ? resSection(name) : null;
  if (!r) return "";
  if (name === "wind_erosion") return `${r.trees_failing} of ${r.trees_checked} trees at risk, ${r.zones_uplift_flagged} of ${r.zones_checked} build-ups could lift`;
  if (name === "dynamic_analysis") return `worst case ${r.worst_case || "?"} in ${r.worst_case_bay || "?"} at ${Math.round(r.worst_case_utilisation_percent)}% of the deck capacity`;
  if (name === "sun_and_shading") return `${r.people_zones_too_sunny} of ${r.people_zones} people zones too sunny, ${r.garden_zones_too_shaded} of ${r.garden_zones} gardens too shaded`;
  return "";
}

/** The Results tab's "Conditions" group: the conditions as they stand, and which results they drive, with the way to each. */
function renderConditionsResults() {
  const rows = [
    { name: "wind_erosion", title: "Wind and erosion", uses: "wind zone, roof height", group: "garden", where: "Garden" },
    { name: "dynamic_analysis", title: "Dynamic analysis", uses: "snow zone, altitude, day schedule", group: "structure", where: "Structure" },
    { name: "sun_and_shading", title: "Sun and shade", uses: "latitude, orientation, shade target, garden sun, equipment", group: "sun", where: "Sun" }
  ];
  const drives = resCard({
    title: "Which results use them", sub: "A condition that is not confirmed makes the result that uses it PRELIMINARY.", tone: "neutral", chip: "",
    body: `<table class="res-table"><thead><tr><th>Analysis</th><th>Uses</th><th>What it found</th><th></th></tr></thead><tbody>${rows.map(r => {
      const head = conditionsResultHeadline(r.name);
      return `<tr><td>${siteTabsEscape(r.title)}</td><td>${siteTabsEscape(r.uses)}</td><td>${head ? siteTabsEscape(head) : '<span class="res-muted">not received yet</span>'}</td>
        <td><button type="button" class="btn-export" data-analysis-sub="${escapeHtml(r.group)}">${siteTabsEscape(r.where)}</button></td></tr>`;
    }).join("")}</tbody></table>`
  });
  return conditionsCardsHtml(true) + drives;
}

// The buttons above: one opens another tab, one another group of the Results tab. Delegated, because the views are redrawn.
document.addEventListener("click", e => {
  const tab = e.target.closest("[data-open-tab]");
  if (tab && typeof setMode === "function") { setMode(tab.dataset.openTab); return; }
  const sub = e.target.closest("[data-analysis-sub]");
  if (sub && typeof setAnalysisSub === "function") setAnalysisSub(sub.dataset.analysisSub);
});
