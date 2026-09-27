/**
 * quizCore.js — the start-up quiz: four short questions and what they set. Pure (no DOM, no network), so tools/quiz-test.js runs it as it is; quiz.js draws it and applies it.
 *
 * The quiz only ever sets DEFAULTS, and every one of them can be changed in the Profile tab or by taking the quiz again:
 *   view      Simple, unless the person says they know Sportify well (then Advanced, which shows everything);
 *   extras    what is added to the Simple view because the person cares about it (an analysis they chose brings back its tab and its buttons in Revit);
 *   landing   where Sportify opens: Site, Combine, Results or Documents, by what the person wants to do and what they already have;
 *   next step one sentence and one button on the Overview: what to do first.
 * Which tools this computer has is not asked: the Revit add-in looks (SportifyCapabilities), so there is no fifth question.
 *
 * The answers are kept in the profile (profile.quiz: goal, analyses, site_data, experience, taken), so the person sees them again and can change one.
 */

const QUIZ_WORLD = typeof PROFILE_MODES !== "undefined"
  ? { modes: PROFILE_MODES, views: PROFILE_VIEWS, extras: PROFILE_EXTRAS }
  : (() => { const c = require("./profileCore.js"); return { modes: c.PROFILE_MODES, views: c.PROFILE_VIEWS, extras: c.PROFILE_EXTRAS }; })();

const QUIZ_QUESTIONS = [
  {
    id: "goal", kind: "single", title: "What do you want to do with Sportify?",
    hint: "Sportify opens where that starts.",
    options: [
      { value: "design", label: "Design a new roof layout", hint: "Place sports and garden on a roof and see what the rules say." },
      { value: "check", label: "Check a design I already have", hint: "Take the roof from Revit and look at the analyses." },
      { value: "documents", label: "Make drawings and documents from a design", hint: "The analysis report, schedules and diagrams." }
    ]
  },
  {
    id: "analyses", kind: "multi", title: "Which analyses matter to you?",
    hint: "Pick any, or none. What you pick is shown; everything else is one click away in Advanced.",
    options: [
      { value: "structure", label: "Structure", hint: "Loads on the roof, the bays, how the deck vibrates." },
      { value: "sun", label: "Sun and shade", hint: "How much direct sun the roof gets, and what shades it." },
      { value: "wind", label: "Wind and erosion", hint: "Wind on the roof and whether trees and soil stay." },
      { value: "rain", label: "Rain and soil", hint: "Water in the soil layers, cloudbursts, drainage." },
      { value: "kinetics", label: "Moving shading", hint: "Louvres, sails and fences that move." },
      { value: "safety", label: "Safety", hint: "Fire escape distances, accessibility, stray balls." },
      { value: "carbon", label: "Carbon and materials", hint: "Embodied carbon and life-cycle of the build-up." }
    ]
  },
  {
    id: "site_data", kind: "multi", title: "What do you already have about the site?",
    hint: "Tick what you have. For where it is and which way it faces you can type it right here, and it goes to the Site tab.",
    options: [
      { value: "location", label: "Where it is", hint: "An address or coordinates." },
      { value: "orientation", label: "Which way it faces", hint: "The angle of the roof to north." },
      { value: "roof_outline", label: "The roof in a model", hint: "In Revit or an IFC: its outline and height." },
      { value: "structure_grid", label: "The structural grid", hint: "Columns, grid lines and beams in the model." },
      { value: "wind_snow", label: "Wind and snow values", hint: "From the standards or the engineer." },
      { value: "none", label: "None of these yet", hint: "That is fine: Sportify starts with the site.", exclusive: true }
    ]
  },
  {
    id: "experience", kind: "single", title: "How well do you know Sportify?",
    hint: "This decides how much is shown at first.",
    options: [
      { value: "first", label: "This is my first time", hint: "Show me the main path only." },
      { value: "some", label: "I have used it a little", hint: "The main path, and I will add what I need." },
      { value: "expert", label: "I know it well", hint: "Show me everything." }
    ]
  }
];

/** What an analysis the person chose brings back (keys of PROFILE_EXTRAS). */
const QUIZ_ANALYSIS_EXTRA = { structure: "structure", sun: "conditions", wind: "conditions", rain: "conditions", kinetics: "postAnalysis", safety: "safety", carbon: "carbon" };

function quizQuestion(id) { return QUIZ_QUESTIONS.find(q => q.id === id) || null; }

/** Answers in, answers out that only hold what the questions offer: one value for a single question, a list (in the order offered, each once) for a multi one. */
function quizNormalizeAnswers(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const single = id => { const q = quizQuestion(id); return q && q.options.some(x => x.value === o[id]) ? o[id] : null; };
  const multi = id => {
    const q = quizQuestion(id);
    const wanted = Array.isArray(o[id]) ? o[id] : [];
    let chosen = q.options.filter(x => wanted.includes(x.value)).map(x => x.value);
    const exclusive = q.options.filter(x => x.exclusive).map(x => x.value);
    if (chosen.some(v => !exclusive.includes(v))) chosen = chosen.filter(v => !exclusive.includes(v));      // "none of these" next to something else is the something else
    return chosen;
  };
  return { goal: single("goal"), analyses: multi("analyses"), site_data: multi("site_data"), experience: single("experience") };
}

/** Is the quiz answered enough to set anything: what the person wants to do, and how well they know Sportify. (The two lists may be empty: "none" is an answer.) */
function quizComplete(answers) {
  const a = quizNormalizeAnswers(answers);
  return !!(a.goal && a.experience);
}

/** The label of an option, for the summary. */
function quizLabel(questionId, value) {
  const q = quizQuestion(questionId);
  const o = q && q.options.find(x => x.value === value);
  return o ? o.label : "";
}

/**
 * What the answers set: { view, extras, landing, next: { text, goto }, summary: [sentences] }. Defaults only; the same answers always give the same outcome.
 */
function quizOutcome(answers) {
  const a = quizNormalizeAnswers(answers);
  const view = a.experience === "expert" ? "advanced" : "simple";
  const extras = Object.keys(QUIZ_WORLD.extras).filter(k => a.analyses.some(x => QUIZ_ANALYSIS_EXTRA[x] === k));
  const has = v => a.site_data.includes(v);

  let landing, next;
  if (a.goal === "check") {
    landing = has("roof_outline") ? "analysis" : "site";      // a Results tab with no roof behind it is empty: start where the roof comes in
    next = has("roof_outline")
      ? { text: "Open Results" + (a.analyses.length ? " for the checks you chose (" + a.analyses.map(x => quizLabel("analyses", x).toLowerCase()).join(", ") + ")" : "") + ": the quick estimates are there at once, and Revit sends the full analyses.", goto: "analysis" }
      : { text: "Bring the roof you want to check into Sportify: in Revit select it and use Push to Sportify. Then open Results.", goto: "site" };
  } else if (a.goal === "documents") {
    landing = "deliverables";
    next = { text: "Open Documents: the analysis report, the schedules and the diagrams are made from there.", goto: "deliverables" };
  } else {
    // design (also when nothing was answered: the main path starts with the site)
    if (has("roof_outline") && has("location")) {
      landing = "combine";
      next = { text: "Place your sports and garden on the roof in Combine.", goto: "combine" };
    } else if (!has("roof_outline")) {
      landing = "site";
      next = { text: "Bring the roof into Sportify: in Revit select it and use Push to Sportify, or enter its length and breadth on the Site tab.", goto: "site" };
    } else {
      landing = "site";
      next = { text: "Say where the roof is on the Site tab, so the sun and the wind can be worked out.", goto: "site" };
    }
  }

  const modes = QUIZ_WORLD.modes;
  const summary = [];
  summary.push(QUIZ_WORLD.views[view].title + " view" + (view === "simple" && extras.length ? ", with " + extras.map(k => QUIZ_WORLD.extras[k].label.toLowerCase()).join(", ") + " added" : "") + ".");
  summary.push("Sportify opens on " + modes[landing].label + ".");
  summary.push("First: " + next.text);
  return { view, extras, landing, next, summary };
}

/** The answers as one line each, for the Profile tab: "What you want to do: Design a new roof layout". */
function quizAnswerLines(answers) {
  const a = quizNormalizeAnswers(answers);
  const join = (id, list) => (list.length ? list.map(v => quizLabel(id, v)).join(", ") : "none");
  return [
    { id: "goal", title: "What you want to do", text: a.goal ? quizLabel("goal", a.goal) : "not answered" },
    { id: "analyses", title: "Analyses that matter", text: join("analyses", a.analyses) },
    { id: "site_data", title: "What you have about the site", text: join("site_data", a.site_data) },
    { id: "experience", title: "How well you know Sportify", text: a.experience ? quizLabel("experience", a.experience) : "not answered" }
  ];
}

/** Should the quiz open by itself: the person has never been through it, never skipped it, and never changed their profile by hand (a person who did knows their way). */
function quizShouldOpen(profile) {
  const p = profile || {};
  return !p.onboarded && !p.updated && !p.quiz;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { QUIZ_QUESTIONS, QUIZ_ANALYSIS_EXTRA, quizQuestion, quizNormalizeAnswers, quizComplete, quizLabel, quizOutcome, quizAnswerLines, quizShouldOpen };
}
