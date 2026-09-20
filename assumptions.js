/**
 * assumptions.js — the assumptions behind the structural analyses, and the panel where the designer confirms them.
 *
 * The structural analyses (static loads, dynamic analysis) give numbers that look more certain than the values they rest on: the deck
 * capacity is a stand-in for the structural engineer's figure, the deck's frequency is estimated, the snow zone, the day's schedule
 * and the comfort limits are the author's choices. Each of them is listed here with where the built-in value comes from (a code
 * clause, published guidance, or just a judgement), and for each the designer either
 *
 *   - ENTERS their own value, or
 *   - ACCEPTS the built-in one, knowingly.
 *
 * Until they do, the analyses' results (Revit dialogs, PDF, videos) carry a PRELIMINARY warning that names what is unconfirmed. The same
 * choice is offered in Revit before an analysis runs; what is decided here travels in the export as "analysis_assumptions" (the keys
 * accepted, and the comfort limits) next to the values themselves (structure.deck_capacity_kn_m2, structure.natural_frequency_hz,
 * site_conditions.snow_zone / altitude_m / day_schedule).
 *
 * The inputs are shown in two tabs (ASSUMPTION_GROUPS): Structure (deck capacity, natural frequency, comfort limits) and Site conditions
 * (snow zone and altitude, the day's schedule, the sun and shade targets), so the Site tab is left with where the roof is and how it is turned.
 *
 * ANALYSIS_ASSUMPTIONS below is the SAME list as Sportify.Simulation/Assets/Scripts/Simulation/Structure/AnalysisAssumptions.cs
 * (same keys, texts, defaults, references). Tools/StructuralCheck/assumptions-parity.js compares the two: change both together.
 */

const ANALYSIS_ASSUMPTIONS = {
  editable: [
    {"key":"deck_capacity","label":"Deck capacity","shortLabel":"deck capacity","kind":"number","status":"placeholder","unit":"kN/m2","analyses":"structural dynamic sun","defaultText":"8.0 kN/m2","default":8,"min":0.5,"max":30,"reference":"No code value: it is the structural engineer's figure for the deck (characteristic permanent + imposed load per m2).","basis":"A stand-in, not the engineer's figure: 5.0 for sports use (DIN EN 1991-1-1/NA Table 6.1DE, category C4) plus 3.0 permanent. Every over-capacity result depends on it."},
    {"key":"natural_frequency","label":"Deck's first natural frequency","shortLabel":"natural frequency","kind":"number","status":"estimated","unit":"Hz","analyses":"dynamic","defaultText":"estimated from the spans","default":null,"min":0.5,"max":40,"reference":"The first vertical mode from the engineer's structural model (DIN EN 1990/NA, vibration serviceability).","basis":"Each bay as a simply supported strip along its long span, depth span/25, E 30 GPa, 3% damping. Good to about 25%, and the response is taken over that band."},
    {"key":"snow_zone","label":"Snow load zone","shortLabel":"snow zone","kind":"choice","status":"assumed","unit":"","analyses":"dynamic","defaultText":"zone 2","defaultKey":"2","choices":[{"key":"1","label":"Zone 1"},{"key":"1a","label":"Zone 1a"},{"key":"2","label":"Zone 2"},{"key":"2a","label":"Zone 2a"},{"key":"3","label":"Zone 3"}],"reference":"DIN EN 1991-1-3/NA: the German snow load zone map (zones 1, 1a, 2, 2a, 3).","basis":"Zone 2 is a mid-range stand-in: there is no lookup by address, so the site's zone must be read off the map."},
    {"key":"altitude","label":"Site altitude","shortLabel":"altitude","kind":"number","status":"assumed","unit":"m","analyses":"dynamic","defaultText":"100 m above sea level","default":100,"min":-10,"max":2500,"reference":"DIN EN 1991-1-3/NA: the ground snow load rises with the altitude above sea level in every zone.","basis":"100 m is a lowland stand-in. Altitude matters most in zones 2, 2a and 3."},
    {"key":"day_schedule","label":"Use over the day","shortLabel":"day schedule","kind":"choice","status":"assumed","unit":"","analyses":"dynamic","defaultText":"school and club sports day","defaultKey":"sports_day","choices":[{"key":"sports_day","label":"School and club sports day"},{"key":"event_day","label":"Evening event with full stands"},{"key":"community_day","label":"Community garden day"}],"reference":"Not defined by any standard: the operator's booking plan is the right source.","basis":"Three generic hour-by-hour schedules (share of players, seated spectators and garden visitors present); the author's."},
    {"key":"comfort_limit_walking","label":"Comfort limit, walking","shortLabel":"walking limit","kind":"number","status":"assumed","unit":"g","analyses":"dynamic","defaultText":"0.02 g","default":0.02,"min":0.001,"max":0.5,"reference":"No DIN table. Published guidance (SCI P354, CCIP-016, ISO 10137) ranges from about 0.5% g for offices upward with the use.","basis":"0.02 g (2% g) is the lenient end, meant for an open roof deck where people walk about; a quiet space would need a lower limit."},
    {"key":"comfort_limit_rhythmic","label":"Comfort limit, rhythmic activity","shortLabel":"rhythmic limit","kind":"number","status":"assumed","unit":"g","analyses":"dynamic","defaultText":"0.05 g","default":0.05,"min":0.001,"max":0.5,"reference":"SCI P354 gives about 3% g for gymnasia; ISO 10137 and CCIP-016 give the framework. No DIN table.","basis":"0.05 g (5% g) for court play and a jumping crowd, the author's choice within the published range."},
    {"key":"site_latitude","label":"Site latitude","shortLabel":"latitude","kind":"number","status":"assumed","unit":"deg N","analyses":"sun","defaultText":"51.0 deg N (Germany's middle)","default":51,"min":-66,"max":66,"reference":"Where the roof is: the height of the sun depends on it. Set by the Site tab's map; Germany spans about 47.3 to 55.1 deg N.","basis":"51 deg N is a stand-in for a site with no location set. Only the latitude matters (the analysis works in solar time), but it moves the noon sun by about one degree for every degree."},
    {"key":"roof_north","label":"Roof orientation","shortLabel":"orientation","kind":"number","status":"assumed","unit":"deg","analyses":"sun","defaultText":"0 deg (the top of the plan is north)","default":0,"min":0,"max":359.99,"reference":"The compass bearing of the top of the plan, clockwise from north (the Site tab's Roof orientation).","basis":"0 deg puts north at the top of the plan. It decides which side the shade falls on, so a wrong orientation moves every shadow."},
    {"key":"shade_target","label":"Shade target for people zones","shortLabel":"shade target","kind":"number","status":"assumed","unit":"%","analyses":"sun","defaultText":"50% of the zone in shade","default":50,"min":1,"max":100,"reference":"No standard fixes it for a roof. DIN 5034-1 sets sunshine duration for dwellings, not for outdoor areas; sun-protection guidance asks for shade wherever people stay for long around midday.","basis":"Half of every play area and spectator zone in shade between 11:00 and 16:00 solar time on 21 June: the author's choice, for the team to argue with."},
    {"key":"garden_min_sun","label":"Sun the gardens need","shortLabel":"garden sun","kind":"number","status":"assumed","unit":"h","analyses":"sun","defaultText":"4 h of direct sun on 21 June","default":4,"min":0.5,"max":16,"reference":"Plant need: sedum and lawn want 6 h or more, half-shade planting 3 to 6 h (rule of thumb, not verified against the FLL guideline or the species data).","basis":"4 h is a middle value for a mixed planting. Shade equipment is not allowed to take a garden below it."},
    {"key":"shade_equipment","label":"Shading equipment that may be recommended","shortLabel":"equipment","kind":"choice","status":"assumed","unit":"","analyses":"sun","defaultText":"all kinds","defaultKey":"all","choices":[{"key":"all","label":"All kinds"},{"key":"light","label":"Light only (sails and parasols)"},{"key":"fixed","label":"Fixed only (pergolas and canopies)"}],"reference":"A choice for the project: fixed structures need the roof's approval and a deck check; light ones (sails, parasols) need anchoring and wind checks.","basis":"All kinds are considered by default; the heavy ones (a tree in a deep bed) are weighed against the deck like everything else."}
  ],
  fixed: [
    {"key":"court_live","label":"Imposed load, sports court","shortLabel":"imposed load, sports court","kind":"fixed","status":"standard","unit":"","analyses":"structural","defaultText":"5.0 kN/m2","reference":"DIN EN 1991-1-1/NA Table 6.1DE, category C4 (sport and dance floors)","basis":""},
    {"key":"activity_live","label":"Imposed load, play and assembly area","shortLabel":"imposed load, play and assembly area","kind":"fixed","status":"assumed","unit":"","analyses":"structural","defaultText":"4.0 kN/m2","reference":"Within the C3 range of DIN EN 1991-1-1/NA (3 to 5 kN/m2): the value is the author's pick","basis":""},
    {"key":"accessible_live","label":"Imposed load, accessible garden and walkway","shortLabel":"imposed load, accessible garden and walkway","kind":"fixed","status":"assumed","unit":"","analyses":"structural","defaultText":"3.0 kN/m2","reference":"Author's pick: check the roof-terrace category of DIN EN 1991-1-1/NA Table 6.1DE","basis":""},
    {"key":"roof_live","label":"Imposed load, roof not accessible","shortLabel":"imposed load, roof not accessible","kind":"fixed","status":"assumed","unit":"","analyses":"structural","defaultText":"0.75 kN/m2","reference":"Category H: the National Annex value is NOT verified","basis":""},
    {"key":"finishes","label":"Roof finishes and court floor build-up","shortLabel":"roof finishes and court floor build-up","kind":"fixed","status":"assumed","unit":"","analyses":"structural","defaultText":"0.5 + 0.5 kN/m2","reference":"Author's pick for waterproofing, insulation and a sports surface","basis":""},
    {"key":"person_mass","label":"Weight of a person","shortLabel":"weight of a person","kind":"fixed","status":"assumed","unit":"","analyses":"structural dynamic","defaultText":"90 kg","reference":"The Sportify reference value (as in the Live Loads analysis)","basis":""},
    {"key":"psi","label":"Combination factors, crowd and snow","shortLabel":"combination factors, crowd and snow","kind":"fixed","status":"standard","unit":"","analyses":"dynamic","defaultText":"0.7 and 0.5","reference":"DIN EN 1990/NA Table A.1.1: category C (assembly) 0.7, snow below NN+1000 m 0.5 (cross-checked in secondary sources, not the standard's text)","basis":""},
    {"key":"snow_shape","label":"Snow shape coefficient, flat roof","shortLabel":"snow shape coefficient, flat roof","kind":"fixed","status":"standard","unit":"","analyses":"dynamic","defaultText":"0.8","reference":"DIN EN 1991-1-3 (mu1 for a flat roof); no drift, exposure and thermal coefficients taken as 1.0","basis":""},
    {"key":"cloudburst","label":"Cloudburst","shortLabel":"cloudburst","kind":"fixed","status":"assumed","unit":"","analyses":"dynamic","defaultText":"108 mm/h for 10 min","reference":"The rain analysis's design storm; no KOSTRA lookup for the site","basis":""},
    {"key":"event_density","label":"Jumping crowd density","shortLabel":"jumping crowd density","kind":"fixed","status":"literature","unit":"","analyses":"dynamic","defaultText":"0.25 people/m2 on courts and play areas","reference":"Bachmann and Ammann, Vibrations in Structures (crowd density for rhythmic activity)","basis":""},
    {"key":"harmonics","label":"Dynamic load factors of jumping and walking","shortLabel":"dynamic load factors of jumping and walking","kind":"fixed","status":"literature","unit":"","analyses":"dynamic","defaultText":"1.8, 1.29, 0.67 (jumping); 0.4, 0.1, 0.1 (walking)","reference":"Half-sine pulse train (Bachmann and Ammann); ISO 10137 for walking","basis":""},
    {"key":"sync","label":"Synchronisation of the crowd","shortLabel":"synchronisation of the crowd","kind":"fixed","status":"assumed","unit":"","analyses":"dynamic","defaultText":"0 walking, 0.2 court play, 0.6 jumping event","reference":"Author's choice: N people add as sync x N + (1 - sync) x sqrt(N)","basis":""},
    {"key":"sun_days","label":"Design days","shortLabel":"design days","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"21 June, 21 March, 21 December","reference":"The summer solstice decides the heat, the equinox and the winter solstice show what shade costs the gardens in the other seasons","basis":""},
    {"key":"sun_window","label":"Heat window","shortLabel":"heat window","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"11:00 to 16:00 solar time","reference":"The hours around solar noon when the sun is highest and people are on the roof: the shade target is judged here","basis":""},
    {"key":"sun_sky","label":"Sun and sky","shortLabel":"sun and sky","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"direct sun only, solar time, sun counted above 2 deg","reference":"Sun position by Spencer's series (declination) and the hour angle: good to a fraction of a degree. Diffuse light, clouds, reflections and neighbouring buildings are not modelled","basis":""},
    {"key":"sun_trees","label":"Tree canopies","shortLabel":"tree canopies","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"sphere of the crown, lets 25% of the sun through in summer, 50% in March, 70% bare in December","reference":"The author's leaf-density figures; only plants 2 m or taller cast shade","basis":""},
    {"key":"sun_spectators","label":"Spectator zone","shortLabel":"spectator zone","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"a 2 m band around a court that has seats","reference":"Where people watch: the court's play area itself is never covered","basis":""},
    {"key":"sun_catalogue","label":"Shading equipment","shortLabel":"shading equipment","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"louvre pergola 2.6 m high (lets 15% through), solid canopy 3.0 m (0%), shade sail 3.5 m (10%), parasol 2.8 m (10%), tree in a deep bed 6 m","reference":"Typical sizes, heights and weights, not a product catalogue: pergola 0.35, canopy 0.5, sail 0.03, parasol 0.05 kN/m2, a tree bed 13.5 kN/m2 over 3 x 3 m","basis":""},
    {"key":"sun_wind","label":"Wind on the equipment","shortLabel":"wind on the equipment","kind":"fixed","status":"assumed","unit":"","analyses":"sun","defaultText":"peak pressure of the wind analysis x 1.2 to 1.5","reference":"A flat plate or sail in the roof's peak wind: the uplift the anchors must carry, an estimate to hand to the structural engineer","basis":""},
    {"key":"deck_model","label":"Deck stiffness and damping","shortLabel":"deck stiffness and damping","kind":"fixed","status":"assumed","unit":"","analyses":"dynamic","defaultText":"concrete, E 30 GPa, depth = the slab's structural thickness from the Revit model (else span/25), damping 3%","reference":"Reinforced-concrete slab strip; 3% is a usual value for a finished floor. The thickness is the layers whose function is structure in the pushed slab; beams under it are not added to the depth","basis":""}
  ]
};

/** Which combineState field holds the designer's value for each key (null / "" = not entered). */
const ASSUMPTION_FIELDS = {
  deck_capacity: "deckCapacityKnM2",
  natural_frequency: "naturalFrequencyHz",
  snow_zone: "snowZone",
  altitude: "altitudeM",
  day_schedule: "daySchedule",
  comfort_limit_walking: "comfortWalkingG",
  comfort_limit_rhythmic: "comfortRhythmicG",
  site_latitude: "siteLatitudeDeg",                      // the map's latitude stands in until the designer types their own (see assumptionValue)
  roof_north: null,                                      // lives in the Site tab (siteState.northDeg, the slider): see assumptionValue / setAssumptionValue
  shade_target: "shadeTargetPercent",
  garden_min_sun: "gardenMinSunHours",
  shade_equipment: "shadeEquipment"
};

/**
 * Which tab shows which input, and which fixed constants are listed with it. Every key of ANALYSIS_ASSUMPTIONS is in exactly one group
 * (Tools/StructuralCheck/assumptions-parity.js checks that, so a new input cannot be forgotten by both tabs).
 */
const ASSUMPTION_GROUPS = {
  structure: {
    hostId: "assumptions-panel-structure",
    tab: "Structure",
    sections: [
      { title: "Deck", keys: ["deck_capacity", "natural_frequency"] },
      { title: "Comfort", keys: ["comfort_limit_walking", "comfort_limit_rhythmic"] }
    ],
    fixed: ["court_live", "activity_live", "accessible_live", "roof_live", "finishes", "person_mass", "event_density", "harmonics", "sync", "deck_model"]
  },
  conditions: {
    hostId: "assumptions-panel-conditions",
    tab: "Site conditions",
    sections: [
      { title: "Snow", keys: ["snow_zone", "altitude"] },
      { title: "Use over the day", keys: ["day_schedule"] },
      { title: "Sun and shade", keys: ["site_latitude", "roof_north", "shade_target", "garden_min_sun", "shade_equipment"] }
    ],
    fixed: ["psi", "snow_shape", "cloudburst", "sun_days", "sun_window", "sun_sky", "sun_trees", "sun_spectators", "sun_catalogue", "sun_wind"]
  }
};

function assumptionGroupKeys(group) {
  return group.sections.flatMap(sec => sec.keys);
}

const ASSUMPTION_STATUS_TEXT = {
  standard: "From a standard",
  literature: "Published guidance",
  assumed: "Assumption",
  placeholder: "Placeholder",
  estimated: "Estimated"
};

function assumptionDef(key) {
  return ANALYSIS_ASSUMPTIONS.editable.find(d => d.key === key) || ANALYSIS_ASSUMPTIONS.fixed.find(d => d.key === key) || null;
}

/** Text for a person: "m2" as "m²". */
function assumptionText(s) {
  return String(s == null ? "" : s).replace(/m2\b/g, "m²");
}

function assumptionEscape(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function assumptionValue(key) {
  const site = typeof siteState !== "undefined" ? siteState : null;
  if (key === "site_latitude") {
    if (Number.isFinite(combineState.siteLatitudeDeg)) return combineState.siteLatitudeDeg;
    return site && site.lat != null ? site.lat : null;                   // the Site tab's map gave the location: that is the designer's value
  }
  if (key === "roof_north") return site && site.northSet ? site.northDeg : null;
  const f = ASSUMPTION_FIELDS[key];
  return f ? combineState[f] : null;
}

/** The Site tab's orientation slider and label follow a value typed in the assumptions panel (null puts the plan's top back to north, unset). */
function setRoofNorthFromAssumption(value) {
  if (typeof siteState === "undefined") return;
  siteState.northSet = value !== null;
  siteState.northDeg = value !== null ? value : 0;
  const slider = document.getElementById("siteNorthDeg");
  if (slider) slider.value = siteState.northDeg;
  const label = document.getElementById("site-north-val");
  if (label) label.textContent = `${siteState.northDeg}°`;
  if (typeof updateSiteUI === "function") updateSiteUI();
}

/** Whether the designer has entered a value of their own for this key. */
function assumptionEntered(key) {
  const def = assumptionDef(key);
  const v = assumptionValue(key);
  if (!def) return false;
  if (def.kind === "choice") return typeof v === "string" && v !== "";
  return typeof v === "number" && Number.isFinite(v);
}

/** "entered" (their own value), "accepted" (the built-in one, knowingly) or "unconfirmed" (neither yet). */
function assumptionState(key) {
  if (assumptionEntered(key)) return "entered";
  return (combineState.assumptionsAccepted || []).includes(key) ? "accepted" : "unconfirmed";
}

/** Parses what was typed for a number input: null when empty, undefined when it is not a number in the input's range. */
function parseAssumptionNumber(def, raw) {
  const text = String(raw).trim().replace(",", ".");
  if (text === "") return null;
  const v = Number(text);
  if (!Number.isFinite(v) || v < def.min || v > def.max) return undefined;
  return v;
}

function setAssumptionValue(key, value) {
  if (key === "roof_north") setRoofNorthFromAssumption(typeof value === "number" ? value : null);
  else {
    const f = ASSUMPTION_FIELDS[key];
    if (!f) return;
    combineState[f] = value;
  }
  if (value !== null && value !== "") setAssumptionAccepted(key, false);   // an entered value is not a "built-in accepted" one
}

function setAssumptionAccepted(key, on) {
  const list = (combineState.assumptionsAccepted || []).filter(k => k !== key);
  if (on) list.push(key);
  combineState.assumptionsAccepted = list;
}

/** Accepts the built-in value of every input not entered yet: of one group's inputs, or of all when no keys are given. */
function acceptAllAssumptions(keys) {
  ANALYSIS_ASSUMPTIONS.editable.forEach(d => { if ((!keys || keys.includes(d.key)) && !assumptionEntered(d.key)) setAssumptionAccepted(d.key, true); });
}

function assumptionsOpen(keys) {
  return ANALYSIS_ASSUMPTIONS.editable.filter(d => (!keys || keys.includes(d.key)) && assumptionState(d.key) === "unconfirmed");
}

/** The export's "analysis_assumptions" block, or null when the designer has decided nothing. */
function analysisAssumptionsPayload() {
  const accepted = ANALYSIS_ASSUMPTIONS.editable.map(d => d.key).filter(k => assumptionState(k) === "accepted");
  const walking = combineState.comfortWalkingG;
  const rhythmic = combineState.comfortRhythmicG;
  const target = combineState.shadeTargetPercent;
  const gardenSun = combineState.gardenMinSunHours;
  const equipment = combineState.shadeEquipment;
  const latitude = combineState.siteLatitudeDeg;
  if (!accepted.length && !(walking > 0) && !(rhythmic > 0) && !(target > 0) && !(gardenSun > 0) && !equipment && !Number.isFinite(latitude)) return null;
  return {
    accepted,
    comfort_limit_walking_g: walking > 0 ? walking : null,
    comfort_limit_rhythmic_g: rhythmic > 0 ? rhythmic : null,
    shade_target_percent: target > 0 ? target : null,
    garden_min_sun_hours: gardenSun > 0 ? gardenSun : null,
    shade_equipment: equipment || null,
    site_latitude_deg: Number.isFinite(latitude) ? latitude : null      // only the designer's own; the map's latitude travels in site_location
  };
}

/** Reads the block back from a saved session (and forgets the acceptance of anything the file now gives a value for). */
function applyAnalysisAssumptions(payload) {
  const a = (payload && payload.analysis_assumptions) || {};
  combineState.assumptionsAccepted = Array.isArray(a.accepted) ? a.accepted.filter(k => assumptionDef(k)) : [];
  combineState.comfortWalkingG = a.comfort_limit_walking_g > 0 ? a.comfort_limit_walking_g : null;
  combineState.comfortRhythmicG = a.comfort_limit_rhythmic_g > 0 ? a.comfort_limit_rhythmic_g : null;
  combineState.shadeTargetPercent = a.shade_target_percent > 0 ? a.shade_target_percent : null;
  combineState.gardenMinSunHours = a.garden_min_sun_hours > 0 ? a.garden_min_sun_hours : null;
  combineState.shadeEquipment = typeof a.shade_equipment === "string" ? a.shade_equipment : "";
  combineState.siteLatitudeDeg = Number.isFinite(a.site_latitude_deg) ? a.site_latitude_deg : null;
}

// ---------------------------------------------------------------------------------------------------- the panel

const ASSUMPTION_STATE_TEXT = {
  entered: "Entered by you",
  accepted: "Built-in value accepted",
  unconfirmed: "Built-in value, not confirmed"
};

function assumptionControlHtml(def) {
  const id = `assump-input-${def.key}`;
  if (def.kind === "choice") {
    const options = [`<option value="">Built-in: ${assumptionEscape(assumptionText(def.defaultText))}</option>`]
      .concat(def.choices.map(c => `<option value="${assumptionEscape(c.key)}">${assumptionEscape(c.label)}</option>`));
    return `<select id="${id}" data-key="${def.key}">${options.join("")}</select>`;
  }
  const placeholder = def.default == null ? assumptionText(def.defaultText) : `Built-in: ${assumptionText(def.defaultText)}`;
  const unit = def.unit ? `<span class="assump-unit">${assumptionEscape(assumptionText(def.unit))}</span>` : "";
  const step = def.max <= 1 ? "0.005" : def.max <= 50 ? "0.1" : "10";
  return `<div class="assump-number"><input type="number" id="${id}" data-key="${def.key}" min="${def.min}" max="${def.max}" step="${step}" placeholder="${assumptionEscape(placeholder)}" />${unit}</div>`;
}

function assumptionRowHtml(def) {
  return `
    <div class="assump-row" data-key="${def.key}">
      <div class="assump-head">
        <span class="assump-label">${assumptionEscape(def.label)}</span>
        <span class="assump-status status-${def.status}" title="Where the built-in value comes from">${ASSUMPTION_STATUS_TEXT[def.status] || def.status}</span>
      </div>
      ${assumptionControlHtml(def)}
      <div class="assump-state">
        <span class="assump-badge" data-role="badge"></span>
        <button type="button" class="assump-accept" data-key="${def.key}" data-role="accept"></button>
      </div>
      <p class="hint" data-role="hint"></p>
    </div>`;
}

/** Builds one group's panel (once): its rows under their headings, its summary, its "accept all" button and the constants listed with it. */
function buildAssumptionsPanel(name) {
  const group = ASSUMPTION_GROUPS[name];
  const host = group && document.getElementById(group.hostId);
  if (!host || host.dataset.built) return;
  host.dataset.built = "1";

  const rows = group.sections.map(sec => `
    <div class="assump-section">
      <div class="assump-section-title">${assumptionEscape(sec.title)}</div>
      ${sec.keys.map(k => assumptionDef(k)).filter(Boolean).map(assumptionRowHtml).join("")}
    </div>`).join("");

  const fixedDefs = group.fixed.map(k => assumptionDef(k)).filter(Boolean);
  const fixed = fixedDefs.map(def => `
    <li><span class="assump-fixed-name">${assumptionEscape(def.label)}</span>
      <span class="assump-status status-${def.status}">${ASSUMPTION_STATUS_TEXT[def.status] || def.status}</span>
      <div class="assump-fixed-value">${assumptionEscape(assumptionText(def.defaultText))}</div>
      <div class="hint">${assumptionEscape(assumptionText(def.reference))}</div></li>`).join("");

  host.innerHTML = `
    <p class="hint" data-role="summary"></p>
    <button type="button" class="btn-export" data-role="accept-all"><i class="ti ti-checks" aria-hidden="true"></i> Accept all built-in values</button>
    ${rows}
    <details class="assump-fixed">
      <summary>Built-in constants of the model (${fixedDefs.length})</summary>
      <p class="hint">Fixed in the analyses, listed so their source is visible. Changing one is a change to the model, not to this project.</p>
      <ul>${fixed}</ul>
    </details>`;

  host.addEventListener("input", e => {
    const el = e.target;
    const key = el && el.dataset && el.dataset.key;
    const def = key && assumptionDef(key);
    if (!def) return;
    if (def.kind === "choice") {
      setAssumptionValue(key, el.value);
    } else {
      const v = parseAssumptionNumber(def, el.value);
      el.classList.toggle("invalid", v === undefined);
      if (v === undefined) return;                       // out of range: keep what was there until it is fixed
      setAssumptionValue(key, v);
    }
    updateAssumptionsUI();
  });
  host.addEventListener("change", e => {
    const el = e.target;
    if (el && el.tagName === "SELECT" && el.dataset.key) { setAssumptionValue(el.dataset.key, el.value); updateAssumptionsUI(); }
  });
  host.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.role === "accept-all") { acceptAllAssumptions(assumptionGroupKeys(group)); updateAssumptionsUI(); return; }
    if (btn.dataset.role === "accept") {
      const key = btn.dataset.key;
      setAssumptionAccepted(key, assumptionState(key) !== "accepted");
      updateAssumptionsUI();
    }
  });
}

/** The value a card or a row shows for an input: what was entered (with its unit), else the built-in one, and which of the two it is. */
function assumptionDisplay(key) {
  const def = assumptionDef(key);
  const state = assumptionState(key);
  if (!def) return { text: "", state, def: null };
  if (state === "entered") {
    const v = assumptionValue(key);
    if (def.kind === "choice") {
      const c = def.choices.find(x => x.key === v);
      return { text: c ? c.label : String(v), state, def };
    }
    return { text: `${Math.round(v * 1e5) / 1e5}${def.unit ? " " + assumptionText(def.unit) : ""}`, state, def };
  }
  return { text: assumptionText(def.defaultText), state, def };
}

/** Refreshes every group's panel from combineState: the value in each field, the badge, the button, the summary. Safe before the panels exist. */
function updateAssumptionsUI() {
  Object.keys(ASSUMPTION_GROUPS).forEach(name => {
    const group = ASSUMPTION_GROUPS[name];
    const host = document.getElementById(group.hostId);
    if (!host) return;
    buildAssumptionsPanel(name);
    const keys = assumptionGroupKeys(group);

    keys.map(k => assumptionDef(k)).filter(Boolean).forEach(def => {
      const row = host.querySelector(`.assump-row[data-key="${def.key}"]`);
      if (!row) return;
      const state = assumptionState(def.key);
      const input = row.querySelector("[data-key]");
      const v = assumptionValue(def.key);
      if (input && document.activeElement !== input && !input.classList.contains("invalid")) input.value = state === "entered" ? (typeof v === "number" ? String(Math.round(v * 1e5) / 1e5) : String(v)) : "";
      const badge = row.querySelector('[data-role="badge"]');
      badge.textContent = ASSUMPTION_STATE_TEXT[state];
      badge.className = `assump-badge state-${state}`;
      const button = row.querySelector('[data-role="accept"]');
      button.style.display = state === "entered" ? "none" : "";
      button.textContent = state === "accepted" ? "Accepted — undo" : "Accept built-in value";
      row.className = `assump-row state-${state}`;
      const hint = row.querySelector('[data-role="hint"]');
      hint.textContent = assumptionText(`${def.basis} ${def.reference}`);
    });

    const open = assumptionsOpen(keys);
    const summary = host.querySelector('[data-role="summary"]');
    if (summary) {
      summary.textContent = open.length === 0
        ? `All ${keys.length} inputs here are confirmed: entered by you or built-in values you accepted. The analyses list which is which.`
        : `${keys.length - open.length} of ${keys.length} inputs here confirmed. Until the rest are entered or accepted, the results that use them carry a PRELIMINARY warning naming ${open.map(d => d.shortLabel).join(", ")}.`;
      summary.classList.toggle("assump-open", open.length > 0);
    }
    const all = host.querySelector('[data-role="accept-all"]');
    if (all) all.style.display = open.length > 0 ? "" : "none";
  });
  if (typeof updateStructureStatus === "function") updateStructureStatus();   // the grid section's line says what the deck capacity is
  if (typeof updateSiteTabsUI === "function") updateSiteTabsUI();     // the cards beside the panels (siteTabs.js) show the same values
}
