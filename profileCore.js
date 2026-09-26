/**
 * profileCore.js — the PROFILE: what a person chose about how Sportify looks and behaves for them, as a plain object that can be saved, reloaded, sent to Revit and
 * carried to another machine. No DOM and no network in this file (profile.js does those), so tools/profile-test.js can run it as it is.
 *
 *   view    "simple" or "advanced". A VIEW, not a lock: Simple hides the tabs of the deeper work (structure inputs, site conditions, compare, improve, catalogue, revit families) and
 *           leaves the main path (Overview, Site, Sport, Combine, Results, Documents); Advanced shows everything. Switching is one click in the Profile tab.
 *   role    "planner" or "client": the existing role of the app (the top right switch).
 *   theme   "dark", "light", or null (follow the operating system).
 *   quiz    what the start-up quiz learned (goal, analyses wanted, site data at hand, experience), or null until it has been taken. It only ever sets defaults.
 *   person  who this is: a name and a photo (a small JPEG, PNG or WebP as a data URL, made by profile.js from whatever picture the person chose). Both optional.
 *   extras  what the person added to the Simple view (PROFILE_EXTRAS); landing: the workspace to start in (or null: the Overview); onboarded: the start-up quiz was taken or skipped,
 *           so it is not asked again.
 *
 * The file the Revit add-in keeps (settings.json, key "profile") holds the same object, so the ribbon and the web app agree. Whatever arrives from a file, from the
 * add-in or from the browser's storage goes through normalizeProfile(): it never throws and always returns something the app can apply.
 */

const PROFILE_SCHEMA = 1;
const PROFILE_NAME = "PROFILE";
const PROFILE_FILE_KIND = "sportify-profile";
const PROFILE_STORAGE_KEY = "sportify-profile";

/**
 * Every workspace of the app, by the name main.js's setMode() uses (these ids stay: code, saved profiles and the add-in know them), with the button that opens it, the words a person knows it by
 * (`label`: on the button and everywhere the app names the tab) and what it is for (`title`: the button's tooltip). tools/names-test.js checks the page against this table, and that no
 * text of the app still calls a tab by an older name.
 */
const PROFILE_MODES = {
  guide:        { button: "modeGuide",        label: "Overview",        title: "" },
  site:         { button: "modeSite",         label: "Site",            title: "Site" },
  structure:    { button: "modeStructure",    label: "Structure inputs", title: "Structure inputs — grid, columns, deck capacity, natural frequency" },
  conditions:   { button: "modeConditions",   label: "Site conditions", title: "Site conditions — wind, snow, use over the day, sun and shade (inputs of the analyses)" },
  sport:        { button: "modeSport",        label: "Sport",           title: "Sport" },
  combine:      { button: "modeCombine",      label: "Combine",         title: "Combine" },
  analysis:     { button: "modeAnalysis",     label: "Results",         title: "Results — every analysis for this layout: Revit's full analysis, or this app's quick estimate" },
  compare:      { button: "modeCompare",      label: "Compare",         title: "Compare" },
  postAnalysis: { button: "modePostAnalysis", label: "Improve",         title: "Improve — what to change first, ranked, and the moving parts that answer the analysis" },
  data:         { button: "modeData",         label: "Catalogue",       title: "Catalogue — the reference data the app and Revit read: sports, materials, analysis figures" },
  families:     { button: "modeFamilies",     label: "Revit families",  title: "Revit families — what your Revit project has loaded, to place in Combine" },
  deliverables: { button: "modeDeliverables", label: "Documents",       title: "Documents & files — layouts, charts, reports and schedules, kept in your Sportify folder" },
  session:      { button: "modeSession",      label: "Save Session",    title: "" },
  profile:      { button: "modeProfile",      label: "Profile",         title: "Your PROFILE — Simple or Advanced view, role and theme; saved and reloaded every time" }
};

/**
 * What each view shows. The Simple list is the main path the Overview lays out (Site, Sport/Garden, Combine, Analysis) plus the tabs that are always there
 * (Overview, Documents, Save Session, Profile). It is the ONE place to change what Simple means; tools/profile-test.js checks it against the page.
 */
const PROFILE_VIEWS = {
  simple: {
    title: "Simple",
    tagline: "The main path: set the site, choose the sports and the garden, place them on the roof, check the layout, and take your documents.",
    modes: ["guide", "site", "sport", "combine", "analysis", "deliverables", "session", "profile"]
  },
  advanced: {
    title: "Advanced",
    tagline: "Everything: also the structure inputs and site conditions, comparing variants, Improve (what to change first, the moving shading), the Catalogue and the Revit families.",
    modes: Object.keys(PROFILE_MODES)
  }
};

/**
 * What a person can ADD to the Simple view (the start-up quiz picks them from the analyses the person cares about): each brings back the tab(s) of the web app it names and, in the Revit
 * add-in, its buttons (RibbonVisibility.ExtraButtons, the same keys; tools/ReleaseCheck compares the two lists). Safety and carbon have no tab of their own: their results are in the
 * Results tab, only their Revit buttons come back.
 */
const PROFILE_EXTRAS = {
  structure:    { label: "Structure inputs",                modes: ["structure"] },
  conditions:   { label: "Site conditions",                 modes: ["conditions"] },
  compare:      { label: "Comparing variants",              modes: ["compare"] },
  postAnalysis: { label: "Improve (recommendations, moving shading)", modes: ["postAnalysis"] },
  safety:       { label: "Safety checks",                   modes: [] },
  carbon:       { label: "Carbon and materials",            modes: [] }
};

/** The workspaces a person can start in. */
const PROFILE_LANDINGS = ["guide", "site", "sport", "combine", "analysis", "deliverables"];

const PROFILE_ROLES = ["planner", "client"];
const PROFILE_THEMES = ["dark", "light"];

const PROFILE_PERSON_NAME_MAX = 60;
/** About 90 KB of picture: a 256-pixel JPEG is 20-40 KB. The add-in enforces the same limit (SportifyProfile.cs). */
const PROFILE_PHOTO_MAX_CHARS = 120000;
const PROFILE_PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function profileDefaults() {
  // Advanced is the default until the start-up quiz has said otherwise: nothing a person already knew disappears by itself.
  return { schema: PROFILE_SCHEMA, name: PROFILE_NAME, updated: null, view: "advanced", role: "planner", theme: null, quiz: null, extras: [], landing: null, onboarded: false, person: { name: "", photo: null } };
}

/**
 * Is this workspace shown in this view? An unknown view counts as Advanced; an unknown workspace is never hidden (it is not one of ours to judge). The Simple view also shows the
 * workspaces of the extras the person added (PROFILE_EXTRAS); Advanced shows everything anyway.
 */
function profileModeVisible(view, mode, extras) {
  if (!PROFILE_MODES[mode]) return true;
  const v = PROFILE_VIEWS[view] || PROFILE_VIEWS.advanced;
  if (v.modes.includes(mode)) return true;
  return view === "simple" && Array.isArray(extras) && extras.some(e => PROFILE_EXTRAS[e] && PROFILE_EXTRAS[e].modes.includes(mode));
}

/** The workspaces a view (with the person's extras) hides, in the order of the tabs: what the Profile tab tells the person before they switch. */
function profileHiddenModes(view, extras) {
  return Object.keys(PROFILE_MODES).filter(m => !profileModeVisible(view, m, extras));
}

/** The extras, cleaned: only the ones that exist, each once, in the order of PROFILE_EXTRAS. */
function normalizeExtras(v) {
  const wanted = Array.isArray(v) ? v : [];
  return Object.keys(PROFILE_EXTRAS).filter(k => wanted.includes(k));
}

/**
 * Which separators of a rail stay visible when some of its buttons are hidden. `items` is the rail in order: { divider: false, visible } for a button,
 * { divider: true } for a separator. A separator stays only when a visible button sits before it and a visible button after it, and never two in a row.
 * Returns one boolean per item (the visibility to apply; a button keeps its own).
 */
function profileRailLayout(items) {
  const shown = items.map(it => (it.divider ? false : !!it.visible));
  let lastVisibleButton = -1, lastShownDivider = -1;
  const out = shown.slice();
  for (let i = 0; i < items.length; i++) {
    if (!items[i].divider) { if (shown[i]) lastVisibleButton = i; continue; }
    // a separator needs a visible button since the previous shown separator, and one somewhere after it
    const buttonBefore = lastVisibleButton > lastShownDivider;
    const buttonAfter = items.slice(i + 1).some(it => !it.divider && it.visible);
    out[i] = buttonBefore && buttonAfter;
    if (out[i]) lastShownDivider = i;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ what a profile may hold

const PROFILE_QUIZ_MAX_LIST = 24, PROFILE_QUIZ_MAX_TEXT = 60;

function profileText(v) { return typeof v === "string" && v.trim() ? v.trim().slice(0, PROFILE_QUIZ_MAX_TEXT) : null; }
function profileList(v) { return Array.isArray(v) ? v.map(profileText).filter(Boolean).slice(0, PROFILE_QUIZ_MAX_LIST) : []; }

/** The quiz answers, cleaned: short texts and short lists only. null when there is nothing (or nothing that looks like answers). */
function normalizeQuiz(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const q = { goal: profileText(raw.goal), analyses: profileList(raw.analyses), site_data: profileList(raw.site_data), experience: profileText(raw.experience), taken: null };
  if (typeof raw.taken === "string" && Number.isFinite(Date.parse(raw.taken))) q.taken = new Date(raw.taken).toISOString();
  return q.goal || q.experience || q.analyses.length || q.site_data.length ? q : null;
}

/** A photo that is what it says it is (a small image as a data URL), else null. Nothing else is ever kept: the string ends up in a file and in an <img src>. */
function normalizePhoto(v) {
  return typeof v === "string" && v.length <= PROFILE_PHOTO_MAX_CHARS && PROFILE_PHOTO_PATTERN.test(v) ? v : null;
}

/** The person: a name (no control characters, at most 60) and a photo. Always an object. */
function normalizePerson(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const name = typeof o.name === "string" ? o.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PROFILE_PERSON_NAME_MAX) : "";
  return { name, photo: normalizePhoto(o.photo) };
}

/** Anything in, a valid profile out. Never throws. Unknown fields are dropped; a newer schema is read as far as it is understood. */
function normalizeProfile(raw) {
  const d = profileDefaults();
  let o = raw;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { o = null; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) return d;
  if (o.profile && typeof o.profile === "object" && !Array.isArray(o.profile)) o = o.profile;      // a file wraps the profile in its envelope, the add-in's answer in { profile }
  const p = profileDefaults();
  if (PROFILE_VIEWS[o.view]) p.view = o.view;
  if (PROFILE_ROLES.includes(o.role)) p.role = o.role;
  if (PROFILE_THEMES.includes(o.theme)) p.theme = o.theme;
  if (typeof o.name === "string" && o.name.trim()) p.name = o.name.trim().slice(0, 40);
  if (typeof o.updated === "string" && Number.isFinite(Date.parse(o.updated))) p.updated = new Date(o.updated).toISOString();
  p.quiz = normalizeQuiz(o.quiz);
  p.extras = normalizeExtras(o.extras);
  if (PROFILE_LANDINGS.includes(o.landing)) p.landing = o.landing;
  p.onboarded = o.onboarded === true;
  p.person = normalizePerson(o.person);
  return p;
}

/** The same profile, stamped as changed now (what "newer" is judged by when the browser and Revit both have one). */
function profileStamped(p, now) {
  return Object.assign({}, normalizeProfile(p), { updated: (now instanceof Date ? now : new Date()).toISOString() });
}

/** Is `a` newer than `b`? A profile that was never stamped is older than any that was. */
function profileIsNewer(a, b) {
  const ta = a && a.updated ? Date.parse(a.updated) : -Infinity;
  const tb = b && b.updated ? Date.parse(b.updated) : -Infinity;
  return ta > tb;
}

/** Do two profiles say the same thing (the time stamp aside)? */
function profileSame(a, b) {
  const strip = p => JSON.stringify(Object.assign({}, normalizeProfile(p), { updated: null }));
  return strip(a) === strip(b);
}

// ------------------------------------------------------------------------------------------------------------------------ this computer

/**
 * What the Profile tab says about this computer, from the Revit add-in's GET /capabilities answer (null when the add-in is not reachable: nothing can be known without it).
 * One row per thing: { key, label, state: "ok" | "missing" | "unknown", text (the add-in's own sentence), affects (what it means for the person) }. Nobody is asked whether they
 * have Unity or SOLIDWORKS: the add-in looks.
 */
function profileMachineRows(caps) {
  if (!caps || typeof caps !== "object" || Array.isArray(caps)) {
    return [{ key: "revit", label: "Revit add-in", state: "unknown", text: "Revit not open. Open a project in Revit with the Sportify add-in and this page can tell what this computer has. The web app works without it.", affects: "" }];
  }
  const sentence = t => (t && typeof t.note === "string" ? t.note.slice(0, 300) : "");
  const found = t => !!(t && t.found === true);
  const unity = caps.unity, sw = caps.solidworks, chrome = caps.chrome;
  return [
    { key: "revit", label: "Revit add-in", state: "ok", text: "Connected.", affects: "" },
    {
      key: "unity", label: "Unity", state: found(unity) ? "ok" : "missing", text: sentence(unity),
      affects: found(unity) ? "3D videos of the analyses, Ball Trajectory Simulation and Record Isolated Video are available."
        : "No 3D videos here: the analyses give their charts as a PDF instead, and the buttons that need Unity are hidden in Revit."
    },
    {
      key: "solidworks", label: "SOLIDWORKS", state: found(sw) ? "ok" : "missing", text: sentence(sw),
      affects: found(sw) ? "Simulate (SOLIDWORKS) can build a dynamic unit as a mechanical assembly." : "Simulate (SOLIDWORKS) is hidden in Revit: the dynamic units are still placed, only not built as an assembly."
    },
    {
      key: "chrome", label: "Chrome", state: found(chrome) ? "ok" : "missing", text: sentence(chrome),
      affects: found(chrome) ? "The Sportify web app opens in Chrome." : "The Sportify web app opens in your default browser instead."
    }
  ];
}

/** The words of the buttons the Sportify tab in Revit hides at the moment (from the same answer), as short texts; [] when none or unknown. */
function profileHiddenButtons(caps) {
  const list = caps && Array.isArray(caps.ribbon_hidden) ? caps.ribbon_hidden : [];
  return list.map(h => (h && typeof h.text === "string" ? h.text.trim().slice(0, 60) : "")).filter(Boolean).slice(0, 60);
}

// ------------------------------------------------------------------------------------------------------------------------ the file

/** The text of a profile file (Sportify-PROFILE.json): the profile in an envelope that says what it is, so a session file is not mistaken for it. */
function profileToFileText(p) {
  return JSON.stringify({ kind: PROFILE_FILE_KIND, profile: normalizeProfile(p) }, null, 2);
}

/** { ok, profile } for a profile file, { ok: false, error } for anything else (a session file, a broken file, an empty one). */
function profileFromFileText(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { ok: false, error: "This is not a Sportify profile file (it is not valid JSON)." }; }
  if (!o || typeof o !== "object" || o.kind !== PROFILE_FILE_KIND || !o.profile || typeof o.profile !== "object") {
    return { ok: false, error: Array.isArray(o && o.placements) || (o && o.roof) ? "This is a session file, not a profile. Load it with Load Session." : "This is not a Sportify profile file." };
  }
  return { ok: true, profile: normalizeProfile(o.profile) };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PROFILE_SCHEMA, PROFILE_NAME, PROFILE_FILE_KIND, PROFILE_STORAGE_KEY, PROFILE_MODES, PROFILE_VIEWS, PROFILE_ROLES, PROFILE_THEMES,
    PROFILE_EXTRAS, PROFILE_LANDINGS, normalizeExtras,
    PROFILE_PHOTO_MAX_CHARS, PROFILE_PERSON_NAME_MAX, normalizePhoto, normalizePerson,
    profileDefaults, profileModeVisible, profileHiddenModes, profileRailLayout, normalizeQuiz, normalizeProfile, profileStamped, profileIsNewer, profileSame,
    profileToFileText, profileFromFileText, profileMachineRows, profileHiddenButtons
  };
}
