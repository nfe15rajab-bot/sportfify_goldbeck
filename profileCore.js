/**
 * profileCore.js — the PROFILE: what a person chose about how Sportify looks and behaves for them, as a plain object that can be saved, reloaded, sent to Revit and
 * carried to another machine. No DOM and no network in this file (profile.js does those), so tools/profile-test.js can run it as it is.
 *
 *   view    "simple" or "advanced". A VIEW, not a lock: Simple hides the tabs of the deeper work (structure, site conditions, compare, post analysis, data, families) and
 *           leaves the main path (Overview, Site, Sport, Combine, Analysis, Deliverables); Advanced shows everything. Switching is one click in the Profile tab.
 *   role    "planner" or "client": the existing role of the app (the top right switch).
 *   theme   "dark", "light", or null (follow the operating system).
 *   quiz    what the start-up quiz learned (goal, analyses wanted, site data at hand, experience), or null until it has been taken. It only ever sets defaults.
 *   person  who this is: a name and a photo (a small JPEG, PNG or WebP as a data URL, made by profile.js from whatever picture the person chose). Both optional.
 *
 * The file the Revit add-in keeps (settings.json, key "profile") holds the same object, so the ribbon and the web app agree. Whatever arrives from a file, from the
 * add-in or from the browser's storage goes through normalizeProfile(): it never throws and always returns something the app can apply.
 */

const PROFILE_SCHEMA = 1;
const PROFILE_NAME = "PROFILE";
const PROFILE_FILE_KIND = "sportify-profile";
const PROFILE_STORAGE_KEY = "sportify-profile";

/** Every workspace of the app, by the name main.js's setMode() uses, with the button that opens it and the words a person knows it by. */
const PROFILE_MODES = {
  guide:        { button: "modeGuide",        label: "Overview" },
  site:         { button: "modeSite",         label: "Site" },
  structure:    { button: "modeStructure",    label: "Structure" },
  conditions:   { button: "modeConditions",   label: "Conditions" },
  sport:        { button: "modeSport",        label: "Sport" },
  gardenBlocks: { button: "modeGardenBlocks", label: "Garden" },
  combine:      { button: "modeCombine",      label: "Combine" },
  analysis:     { button: "modeAnalysis",     label: "Analysis" },
  compare:      { button: "modeCompare",      label: "Compare" },
  postAnalysis: { button: "modePostAnalysis", label: "Post Analysis" },
  data:         { button: "modeData",         label: "Data" },
  families:     { button: "modeFamilies",     label: "Families" },
  deliverables: { button: "modeDeliverables", label: "Deliverables" },
  session:      { button: "modeSession",      label: "Save Session" },
  profile:      { button: "modeProfile",      label: "Profile" }
};

/**
 * What each view shows. The Simple list is the main path the Overview lays out (Site, Sport/Garden, Combine, Analysis) plus the tabs that are always there
 * (Overview, Deliverables, Save Session, Profile). It is the ONE place to change what Simple means; tools/profile-test.js checks it against the page.
 */
const PROFILE_VIEWS = {
  simple: {
    title: "Simple",
    tagline: "The main path: set the site, choose the sports and the garden, place them on the roof, check the layout, and take the deliverables.",
    modes: ["guide", "site", "sport", "gardenBlocks", "combine", "analysis", "deliverables", "session", "profile"]
  },
  advanced: {
    title: "Advanced",
    tagline: "Everything: also the structure and site-condition inputs, comparing variants, the post-analysis of the dynamic families, the data tables and the Revit families.",
    modes: Object.keys(PROFILE_MODES)
  }
};

const PROFILE_ROLES = ["planner", "client"];
const PROFILE_THEMES = ["dark", "light"];

const PROFILE_PERSON_NAME_MAX = 60;
/** About 90 KB of picture: a 256-pixel JPEG is 20-40 KB. The add-in enforces the same limit (SportifyProfile.cs). */
const PROFILE_PHOTO_MAX_CHARS = 120000;
const PROFILE_PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function profileDefaults() {
  // Advanced is the default until the start-up quiz has said otherwise: nothing a person already knew disappears by itself.
  return { schema: PROFILE_SCHEMA, name: PROFILE_NAME, updated: null, view: "advanced", role: "planner", theme: null, quiz: null, person: { name: "", photo: null } };
}

/** Is this workspace shown in this view? An unknown view counts as Advanced; an unknown workspace is never hidden (it is not one of ours to judge). */
function profileModeVisible(view, mode) {
  if (!PROFILE_MODES[mode]) return true;
  const v = PROFILE_VIEWS[view] || PROFILE_VIEWS.advanced;
  return v.modes.includes(mode);
}

/** The workspaces a view hides, in the order of the tabs: what the Profile tab tells the person before they switch. */
function profileHiddenModes(view) {
  return Object.keys(PROFILE_MODES).filter(m => !profileModeVisible(view, m));
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
    PROFILE_PHOTO_MAX_CHARS, PROFILE_PERSON_NAME_MAX, normalizePhoto, normalizePerson,
    profileDefaults, profileModeVisible, profileHiddenModes, profileRailLayout, normalizeQuiz, normalizeProfile, profileStamped, profileIsNewer, profileSame,
    profileToFileText, profileFromFileText
  };
}
