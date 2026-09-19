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
 * ANALYSIS_ASSUMPTIONS below is the SAME list as Sportify.Simulation/Assets/Scripts/Simulation/Structure/AnalysisAssumptions.cs
 * (same keys, texts, defaults, references). Tools/StructuralCheck/assumptions-parity.js compares the two: change both together.
 */

const ANALYSIS_ASSUMPTIONS = {
  editable: [
    {"key":"deck_capacity","label":"Deck capacity","shortLabel":"deck capacity","kind":"number","status":"placeholder","unit":"kN/m2","analyses":"structural dynamic","defaultText":"8.0 kN/m2","default":8,"min":0.5,"max":30,"reference":"No code value: it is the structural engineer's figure for the deck (characteristic permanent + imposed load per m2).","basis":"A stand-in, not the engineer's figure: 5.0 for sports use (DIN EN 1991-1-1/NA Table 6.1DE, category C4) plus 3.0 permanent. Every over-capacity result depends on it."},
    {"key":"natural_frequency","label":"Deck's first natural frequency","shortLabel":"natural frequency","kind":"number","status":"estimated","unit":"Hz","analyses":"dynamic","defaultText":"estimated from the spans","default":null,"min":0.5,"max":40,"reference":"The first vertical mode from the engineer's structural model (DIN EN 1990/NA, vibration serviceability).","basis":"Each bay as a simply supported strip along its long span, depth span/25, E 30 GPa, 3% damping. Good to about 25%, and the response is taken over that band."},
    {"key":"snow_zone","label":"Snow load zone","shortLabel":"snow zone","kind":"choice","status":"assumed","unit":"","analyses":"dynamic","defaultText":"zone 2","defaultKey":"2","choices":[{"key":"1","label":"Zone 1"},{"key":"1a","label":"Zone 1a"},{"key":"2","label":"Zone 2"},{"key":"2a","label":"Zone 2a"},{"key":"3","label":"Zone 3"}],"reference":"DIN EN 1991-1-3/NA: the German snow load zone map (zones 1, 1a, 2, 2a, 3).","basis":"Zone 2 is a mid-range stand-in: there is no lookup by address, so the site's zone must be read off the map."},
    {"key":"altitude","label":"Site altitude","shortLabel":"altitude","kind":"number","status":"assumed","unit":"m","analyses":"dynamic","defaultText":"100 m above sea level","default":100,"min":-10,"max":2500,"reference":"DIN EN 1991-1-3/NA: the ground snow load rises with the altitude above sea level in every zone.","basis":"100 m is a lowland stand-in. Altitude matters most in zones 2, 2a and 3."},
    {"key":"day_schedule","label":"Use over the day","shortLabel":"day schedule","kind":"choice","status":"assumed","unit":"","analyses":"dynamic","defaultText":"school and club sports day","defaultKey":"sports_day","choices":[{"key":"sports_day","label":"School and club sports day"},{"key":"event_day","label":"Evening event with full stands"},{"key":"community_day","label":"Community garden day"}],"reference":"Not defined by any standard: the operator's booking plan is the right source.","basis":"Three generic hour-by-hour schedules (share of players, seated spectators and garden visitors present); the author's."},
    {"key":"comfort_limit_walking","label":"Comfort limit, walking","shortLabel":"walking limit","kind":"number","status":"assumed","unit":"g","analyses":"dynamic","defaultText":"0.02 g","default":0.02,"min":0.001,"max":0.5,"reference":"No DIN table. Published guidance (SCI P354, CCIP-016, ISO 10137) ranges from about 0.5% g for offices upward with the use.","basis":"0.02 g (2% g) is the lenient end, meant for an open roof deck where people walk about; a quiet space would need a lower limit."},
    {"key":"comfort_limit_rhythmic","label":"Comfort limit, rhythmic activity","shortLabel":"rhythmic limit","kind":"number","status":"assumed","unit":"g","analyses":"dynamic","defaultText":"0.05 g","default":0.05,"min":0.001,"max":0.5,"reference":"SCI P354 gives about 3% g for gymnasia; ISO 10137 and CCIP-016 give the framework. No DIN table.","basis":"0.05 g (5% g) for court play and a jumping crowd, the author's choice within the published range."}
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
    {"key":"deck_model","label":"Deck stiffness and damping","shortLabel":"deck stiffness and damping","kind":"fixed","status":"assumed","unit":"","analyses":"dynamic","defaultText":"concrete, E 30 GPa, depth span/25, damping 3%","reference":"Reinforced-concrete slab strip; 3% is a usual value for a finished floor","basis":""}
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
  comfort_limit_rhythmic: "comfortRhythmicG"
};

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
  const f = ASSUMPTION_FIELDS[key];
  return f ? combineState[f] : null;
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
  const f = ASSUMPTION_FIELDS[key];
  if (!f) return;
  combineState[f] = value;
  if (value !== null && value !== "") setAssumptionAccepted(key, false);   // an entered value is not a "built-in accepted" one
}

function setAssumptionAccepted(key, on) {
  const list = (combineState.assumptionsAccepted || []).filter(k => k !== key);
  if (on) list.push(key);
  combineState.assumptionsAccepted = list;
}

function acceptAllAssumptions() {
  ANALYSIS_ASSUMPTIONS.editable.forEach(d => { if (!assumptionEntered(d.key)) setAssumptionAccepted(d.key, true); });
}

function assumptionsOpen() {
  return ANALYSIS_ASSUMPTIONS.editable.filter(d => assumptionState(d.key) === "unconfirmed");
}

/** The export's "analysis_assumptions" block, or null when the designer has decided nothing. */
function analysisAssumptionsPayload() {
  const accepted = ANALYSIS_ASSUMPTIONS.editable.map(d => d.key).filter(k => assumptionState(k) === "accepted");
  const walking = combineState.comfortWalkingG;
  const rhythmic = combineState.comfortRhythmicG;
  if (!accepted.length && !(walking > 0) && !(rhythmic > 0)) return null;
  return {
    accepted,
    comfort_limit_walking_g: walking > 0 ? walking : null,
    comfort_limit_rhythmic_g: rhythmic > 0 ? rhythmic : null
  };
}

/** Reads the block back from a saved session (and forgets the acceptance of anything the file now gives a value for). */
function applyAnalysisAssumptions(payload) {
  const a = (payload && payload.analysis_assumptions) || {};
  combineState.assumptionsAccepted = Array.isArray(a.accepted) ? a.accepted.filter(k => ASSUMPTION_FIELDS[k]) : [];
  combineState.comfortWalkingG = a.comfort_limit_walking_g > 0 ? a.comfort_limit_walking_g : null;
  combineState.comfortRhythmicG = a.comfort_limit_rhythmic_g > 0 ? a.comfort_limit_rhythmic_g : null;
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

function buildAssumptionsPanel() {
  const host = document.getElementById("assumptions-panel");
  if (!host || host.dataset.built) return;
  host.dataset.built = "1";

  const rows = ANALYSIS_ASSUMPTIONS.editable.map(def => `
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
    </div>`).join("");

  const fixed = ANALYSIS_ASSUMPTIONS.fixed.map(def => `
    <li><span class="assump-fixed-name">${assumptionEscape(def.label)}</span>
      <span class="assump-status status-${def.status}">${ASSUMPTION_STATUS_TEXT[def.status] || def.status}</span>
      <div class="assump-fixed-value">${assumptionEscape(assumptionText(def.defaultText))}</div>
      <div class="hint">${assumptionEscape(assumptionText(def.reference))}</div></li>`).join("");

  host.innerHTML = `
    <p class="hint" id="assump-summary"></p>
    <button type="button" class="btn-export" id="btn-accept-all-assumptions"><i class="ti ti-checks" aria-hidden="true"></i> Accept all built-in values</button>
    ${rows}
    <details class="assump-fixed">
      <summary>Built-in constants of the model (${ANALYSIS_ASSUMPTIONS.fixed.length})</summary>
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
    if (btn.id === "btn-accept-all-assumptions") { acceptAllAssumptions(); updateAssumptionsUI(); return; }
    if (btn.dataset.role === "accept") {
      const key = btn.dataset.key;
      setAssumptionAccepted(key, assumptionState(key) !== "accepted");
      updateAssumptionsUI();
    }
  });
}

/** Refreshes the panel from combineState: the value in each field, the badge, the button, the summary. Safe before the panel exists. */
function updateAssumptionsUI() {
  const host = document.getElementById("assumptions-panel");
  if (!host) return;
  buildAssumptionsPanel();

  ANALYSIS_ASSUMPTIONS.editable.forEach(def => {
    const row = host.querySelector(`.assump-row[data-key="${def.key}"]`);
    if (!row) return;
    const state = assumptionState(def.key);
    const input = row.querySelector("[data-key]");
    const v = assumptionValue(def.key);
    if (input && document.activeElement !== input && !input.classList.contains("invalid")) input.value = state === "entered" ? String(v) : "";
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

  const open = assumptionsOpen();
  const total = ANALYSIS_ASSUMPTIONS.editable.length;
  const summary = document.getElementById("assump-summary");
  if (summary) {
    summary.textContent = open.length === 0
      ? `All ${total} inputs are confirmed: entered by you or built-in values you accepted. The analyses list which is which.`
      : `${total - open.length} of ${total} inputs confirmed. Until the rest are entered or accepted, every structural result carries a PRELIMINARY warning naming ${open.map(d => d.shortLabel).join(", ")}.`;
    summary.classList.toggle("assump-open", open.length > 0);
  }
  const all = document.getElementById("btn-accept-all-assumptions");
  if (all) all.style.display = open.length > 0 ? "" : "none";
}
