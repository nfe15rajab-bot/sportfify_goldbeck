// Tests for the PROFILE (profileCore.js, profile.js) and what the page does with it. Run: node tools/profile-test.js
//
// A profile is what a person chose about how Sportify looks and behaves (view Simple/Advanced, role, theme, later the quiz). This pins: what a profile may hold and how anything
// that arrives is cleaned; what each view shows against the tabs the page really has (so a new tab cannot slip in unclassified, and no view can hide the way back); that the
// Profile tab sits next to New Session; the profile file; and, with the real profile.js run against a stand-in page and a stand-in Revit add-in, which copy wins and what is sent.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

const core = require(path.join(web, "profileCore.js"));
const { PROFILE_MODES, PROFILE_VIEWS } = core;
const html = read("index.html");
const mainJs = read("main.js");

// ---------------------------------------------------------------------------------------------------------------- what a profile may hold
const d = core.profileDefaults();
check("the defaults are the Advanced view, planner, no theme of its own, no quiz, nobody's name or photo, never saved", d.view === "advanced" && d.role === "planner" && d.theme === null && d.quiz === null && d.updated === null && d.name === "PROFILE" && d.schema === 1 && d.person.name === "" && d.person.photo === null);

const garbage = [null, undefined, "", "not json", "{", 42, true, [], [1, 2], {}, { view: 7 }, { view: "expert", role: "boss", theme: "blue", updated: "yesterday", quiz: "x" }, { profile: 5 }];
check("anything that arrives becomes a valid profile, without throwing", garbage.every(g => {
  try {
    const p = core.normalizeProfile(g);
    return PROFILE_VIEWS[p.view] && core.PROFILE_ROLES.includes(p.role) && (p.theme === null || core.PROFILE_THEMES.includes(p.theme)) && p.schema === 1 && p.name.length > 0;
  } catch (e) { return false; }
}));
check("garbage falls back to the defaults, field by field", (() => { const p = core.normalizeProfile({ view: "expert", role: "boss", theme: "blue", updated: "yesterday" }); return p.view === "advanced" && p.role === "planner" && p.theme === null && p.updated === null; })());
const full = { schema: 1, name: "PROFILE", updated: "2026-09-25T20:00:00.000Z", view: "simple", role: "client", theme: "light", quiz: { goal: "design", analyses: ["structure", "sun"], site_data: ["location"], experience: "beginner", taken: "2026-09-25T19:00:00Z" } };
check("a good profile passes through unchanged (the time normalised)", (() => { const p = core.normalizeProfile(full); return p.view === "simple" && p.role === "client" && p.theme === "light" && p.updated === "2026-09-25T20:00:00.000Z" && p.quiz.goal === "design" && p.quiz.analyses.length === 2 && p.quiz.taken === "2026-09-25T19:00:00.000Z"; })());
check("normalising twice changes nothing", JSON.stringify(core.normalizeProfile(core.normalizeProfile(full))) === JSON.stringify(core.normalizeProfile(full)));
check("a profile as JSON text, or wrapped as Revit answers it ({ profile }), is understood", core.normalizeProfile(JSON.stringify(full)).view === "simple" && core.normalizeProfile({ profile: full }).role === "client");
check("unknown fields are dropped, so nothing else can ride along into the settings file", !("evil" in core.normalizeProfile({ view: "simple", evil: "<script>" })) && Object.keys(core.normalizeProfile(full)).sort().join() === "extras,landing,name,onboarded,person,quiz,role,schema,theme,updated,view" && Object.keys(core.normalizeProfile(full).person).sort().join() === "name,photo");

// ---------------------------------------------------------------------------------------------------------------- the person: a name and a photo
const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
check("the person's name is one clean line: control characters and runs of blanks become one space, at most 60 characters", (() => {
  const n = core.normalizePerson({ name: "  Nada\u0000\n\t Al-Rajab  " }).name;
  return n === "Nada Al-Rajab" && core.normalizePerson({ name: "x".repeat(200) }).name.length === 60 && core.normalizePerson({ name: 42 }).name === "" && core.normalizePerson(null).name === "";
})());
check("a name is kept as typed, markup and all (it is only ever shown as text)", core.normalizePerson({ name: "<b>Ali</b> & co" }).name === "<b>Ali</b> & co");
check("a photo that is a small JPEG, PNG or WebP data URL is kept", ["jpeg", "png", "webp"].every(t => core.normalizePhoto(tinyJpeg.replace("image/jpeg", "image/" + t)) !== null));
check("anything else is refused as a photo: SVG (can carry script), HTML, an address, a bare string, bad base64, another type", [
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:text/html;base64,PGgxPmhpPC9oMT4=", "javascript:alert(1)", "https://example.com/me.jpg", "http://localhost/x.png",
  "data:image/jpeg;base64,not base64!", "data:image/jpeg;base64,", "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "data:image/jpeg;utf8,abc", tinyJpeg + "\"onerror=\"alert(1)", "  " + tinyJpeg, 42, {}, null
].every(v => core.normalizePhoto(v) === null));
check("a photo is limited to " + core.PROFILE_PHOTO_MAX_CHARS + " characters", core.normalizePhoto("data:image/jpeg;base64," + "A".repeat(core.PROFILE_PHOTO_MAX_CHARS)) === null && core.normalizePhoto("data:image/jpeg;base64," + "A".repeat(1000)) !== null);
check("the person goes through a profile and its file: name and photo come back", (() => {
  const p = core.normalizeProfile({ view: "simple", person: { name: "Nada", photo: tinyJpeg } });
  const back = core.profileFromFileText(core.profileToFileText(p));
  return p.person.name === "Nada" && p.person.photo === tinyJpeg && back.ok && back.profile.person.name === "Nada" && back.profile.person.photo === tinyJpeg;
})());
check("a hostile person in a file is cleaned: no script photo, the name is text", (() => {
  const r = core.profileFromFileText(JSON.stringify({ kind: "sportify-profile", profile: { person: { name: "A\u0007B", photo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", extra: 1 } } }));
  return r.ok && r.profile.person.name === "A B" && r.profile.person.photo === null && !("extra" in r.profile.person);
})());
check("two profiles that differ only in the photo are not the same", !core.profileSame({ person: { photo: tinyJpeg } }, { person: { photo: null } }));
const huge = core.normalizeProfile({ quiz: { goal: "x".repeat(500), analyses: Array.from({ length: 200 }, (_, i) => "a" + i), site_data: [1, {}, null, "ok"], experience: "  " } });
check("the quiz is kept short: texts to 60 characters, lists to 24, only strings", huge.quiz.goal.length === 60 && huge.quiz.analyses.length === 24 && huge.quiz.site_data.join() === "ok" && huge.quiz.experience === null);
check("a quiz with no answers is null, not an empty shell", core.normalizeProfile({ quiz: { goal: "", analyses: [] } }).quiz === null);

// ---------------------------------------------------------------------------------------------------------------- time stamps and which copy is newer
const t0 = new Date("2026-09-25T10:00:00Z"), t1 = new Date("2026-09-25T11:00:00Z");
const a = core.profileStamped({ view: "simple" }, t0), b = core.profileStamped({ view: "simple" }, t1);
check("a stamped profile carries the time of the change", a.updated === "2026-09-25T10:00:00.000Z");
check("newer is judged by the stamp; a never-stamped profile is older than any stamped one", core.profileIsNewer(b, a) && !core.profileIsNewer(a, b) && !core.profileIsNewer(a, a) && core.profileIsNewer(a, core.profileDefaults()) && !core.profileIsNewer(core.profileDefaults(), a));
check("two profiles are the same when they say the same, the stamp aside", core.profileSame(a, b) && !core.profileSame(a, Object.assign({}, b, { role: "client" })));

// ---------------------------------------------------------------------------------------------------------------- what each view shows
const railHtml = (/<nav class="mode-rail" id="modeRail"[\s\S]*?<\/nav>/.exec(html) || [""])[0];
const railItems = [...railHtml.matchAll(/<button id="([\w-]+)" class="activity-icon"|<div class="activity-bar-divider"><\/div>/g)].map(m => (m[1] ? { id: m[1] } : { divider: true }));
const topIds = [...(/<div class="mode-toggle">[\s\S]*?<\/div>/.exec(html) || [""])[0].matchAll(/<button id="(\w+)"/g)].map(m => m[1]);
const modeButtons = new Set(Object.values(PROFILE_MODES).map(m => m.button));
const pageModeButtons = [...railItems.filter(i => i.id).map(i => i.id), ...topIds].filter(id => /^mode[A-Z]/.test(id));
check("every workspace button the page has is classified by the profile (a new tab cannot slip in unclassified)", pageModeButtons.every(id => modeButtons.has(id)), pageModeButtons.filter(id => !modeButtons.has(id)).join(","));
check("every workspace the profile names has its button on the page, and main.js opens it", Object.entries(PROFILE_MODES).every(([mode, m]) => new RegExp('id="' + m.button + '"').test(html) && new RegExp('setMode\\("' + mode + '"\\)').test(mainJs)));
check("no view hides Overview or the Profile tab: there is always a way back", Object.keys(PROFILE_VIEWS).every(v => core.profileModeVisible(v, "guide") && core.profileModeVisible(v, "profile")));
check("every workspace a view lists exists", Object.values(PROFILE_VIEWS).every(v => v.modes.every(m => PROFILE_MODES[m])));
check("Advanced shows everything, and hides nothing", core.profileHiddenModes("advanced").length === 0);
check("an unknown view counts as Advanced; an unknown workspace is never hidden", core.profileModeVisible("expert", "data") && core.profileModeVisible("simple", "somethingNew"));
check("Simple keeps the main path and the always-there tabs", ["guide", "site", "sport", "combine", "analysis", "deliverables", "session", "profile"].every(m => core.profileModeVisible("simple", m)));
check("Simple hides exactly: Structure, Conditions, Compare, Post Analysis, Data, Families", core.profileHiddenModes("simple").join() === "structure,conditions,compare,postAnalysis,data,families", core.profileHiddenModes("simple").join());

// the rail as the page draws it: which separators stay
const layout = view => core.profileRailLayout(railItems.map(i => (i.divider ? { divider: true } : { divider: false, visible: core.profileModeVisible(view, Object.keys(PROFILE_MODES).find(k => PROFILE_MODES[k].button === i.id) || "") || !/^mode[A-Z]/.test(i.id) })));
const drawn = view => railItems.map((it, i) => (it.divider ? (layout(view)[i] ? "|" : "") : (core.profileModeVisible(view, Object.keys(PROFILE_MODES).find(k => PROFILE_MODES[k].button === it.id) || "") || !/^mode[A-Z]/.test(it.id) ? it.id : ""))).filter(Boolean).join(" ");
check("Advanced draws the whole rail, every separator included", railItems.length > 0 && layout("advanced").every((v, i) => railItems[i].divider ? v : true) && drawn("advanced").split(" ").length === railItems.length, drawn("advanced"));
const simpleRail = drawn("simple");
check("Simple draws the rail as Site | Sport Zones Plants Furniture Combine | Analysis (no separator at an end or twice in a row)", simpleRail === "modeSite | modeSport btn-zone-toggle btn-vegetation-toggle btn-furniture-toggle modeCombine | modeAnalysis", simpleRail);

// the Overview's steps: each leads to a workspace the profile knows, and Simple hides only the last
const steps = [...html.matchAll(/class="workflow-step" data-goto="(\w+)"/g)].map(m => m[1]);
check("every step of the Overview leads to a workspace the profile knows", steps.length >= 4 && steps.every(s => PROFILE_MODES[s]), steps.join(","));
check("Simple keeps the first four steps of the Overview and hides Compare", steps.filter(s => !core.profileModeVisible("simple", s)).join() === "compare");

// ---------------------------------------------------------------------------------------------------------------- the page
check("the Profile tab sits right after New Session in the top bar", /id="btn-new-session"[^>]*>New Session<\/button>\s*<button id="modeProfile"/.test(html));
check("the tab's content, its buttons, the name and photo fields and the welcome screen's line exist", ["profile-content", "profile-view", "profile-view-note", "profile-status", "btn-profile-reload", "btn-profile-export", "btn-profile-import", "btn-profile-reset", "profile-import-file", "sessionGateProfile", "sessionGatePhoto", "profile-avatar", "profile-person-name", "btn-profile-photo", "btn-profile-photo-remove", "profile-photo-file", "profile-machine", "profile-machine-hidden"].every(id => html.includes('id="' + id + '"')));
check("the photo is picked with an image-only file input, and the name is limited to 60 characters", /id="profile-photo-file" accept="image\/\*"/.test(html) && /id="profile-person-name" maxlength="60"/.test(html));
const renderPerson = (/function profileRenderPerson\(\)[\s\S]*?\n}\n/.exec(read("profile.js")) || [""])[0];
check("the name and the photo are put on the page with DOM calls (textContent, img.src), never as markup", renderPerson.length > 200 && !/innerHTML/.test(renderPerson) && /img\.src = person\.photo/.test(renderPerson));
check("the page's policy lets a data: photo and a blob: picture be drawn (img-src has data: and blob:)", /img-src[^;]*data:[^;]*blob:|img-src[^;]*blob:[^;]*data:/.test(html));
const scriptOrder = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
check("profileCore.js is loaded before profile.js, both before the welcome screen and main.js", scriptOrder.indexOf("profileCore.js") >= 0 && scriptOrder.indexOf("profileCore.js") < scriptOrder.indexOf("profile.js") && scriptOrder.indexOf("profile.js") < scriptOrder.indexOf("sessionGate.js") && scriptOrder.indexOf("sessionGate.js") < scriptOrder.indexOf("main.js"));
check("main.js starts the profile, asks it before it opens a workspace, and the role and theme switches feed it", /profileInit\(\)/.test(mainJs) && /profileModeAllowed\(mode\)/.test(mainJs) && (mainJs.match(/profileOnUiChange\(\)/g) || []).length >= 2 && /function setRole\(role, quiet\)/.test(mainJs));
check("workspaceBridge.js hands each answer of the add-in to the profile", /profileSyncWithRevit\(\)/.test(read("workspaceBridge.js")) && /profileRevitClosed\(\)/.test(read("workspaceBridge.js")));
check("the view's class hides with !important (a rule of the rail cannot win against it)", /\.view-hidden\s*\{\s*display:\s*none\s*!important/.test(read("style.css")));
check("the profile scripts never talk to the add-in except through localApi (no bare fetch, no address)", !/fetch\(/.test(read("profile.js")) && !/localhost:5679/.test(read("profile.js")) && !/fetch\(/.test(read("profileCore.js")));

// ---------------------------------------------------------------------------------------------------------------- this computer (what the add-in found)
const capsAll = { unity: { found: true, note: "Unity was found." }, solidworks: { found: true, note: "SOLIDWORKS is there." }, chrome: { found: true, note: "Chrome was found." }, ribbon_hidden: [] };
const capsNone = { unity: { found: false, note: "Unity was not found on this computer." }, solidworks: { found: false, note: "SOLIDWORKS is not installed on this computer." }, chrome: { found: false, note: "Chrome was not found." }, ribbon_hidden: [{ text: "Ball Trajectory Simulation" }, { text: "Simulate (SOLIDWORKS)" }] };
const rowsAll = core.profileMachineRows(capsAll), rowsNone = core.profileMachineRows(capsNone);
check("with every tool found the rows say so: Revit, Unity, SOLIDWORKS and Chrome, each found", rowsAll.map(r => r.key + ":" + r.state).join() === "revit:ok,unity:ok,solidworks:ok,chrome:ok");
check("with none found, the tools are 'missing' and each row says what that means for the person (videos, the hidden Simulate button, the default browser)", rowsNone.map(r => r.key + ":" + r.state).join() === "revit:ok,unity:missing,solidworks:missing,chrome:missing"
  && /No 3D videos here/.test(rowsNone[1].affects) && /Simulate \(SOLIDWORKS\) is hidden/.test(rowsNone[2].affects) && /default browser/.test(rowsNone[3].affects) && rowsNone[1].text === "Unity was not found on this computer.");
check("no answer (Revit not reachable) is one 'unknown' row that says the web app works without it, never a guess", (() => { const r = core.profileMachineRows(null); return r.length === 1 && r[0].state === "unknown" && /works without it/.test(r[0].text); })());
check("a broken answer never throws and never claims a tool is found", [undefined, "x", 5, [], {}, { unity: 5, solidworks: "yes", chrome: [] }, { unity: { found: "true" } }].every(c => { const rows = core.profileMachineRows(c); return rows.every(r => r.key === "revit" || r.state === "missing" || r.state === "unknown"); }));
check("a note is kept to 300 characters", core.profileMachineRows({ unity: { found: false, note: "n".repeat(1000) } })[1].text.length === 300);
check("the hidden buttons are short texts from the answer, junk and empty entries dropped, at most 60", core.profileHiddenButtons(capsNone).join("|") === "Ball Trajectory Simulation|Simulate (SOLIDWORKS)" && core.profileHiddenButtons(null).length === 0 && core.profileHiddenButtons({ ribbon_hidden: [1, null, {}, { text: "  " }, { text: "x".repeat(200) }] })[0].length === 60 && core.profileHiddenButtons({ ribbon_hidden: Array.from({ length: 200 }, (_, i) => ({ text: "b" + i })) }).length === 60);

// ---------------------------------------------------------------------------------------------------------------- the file
const fileText = core.profileToFileText(full);
const back = core.profileFromFileText(fileText);
check("a profile file says what it is and reads back the same profile", JSON.parse(fileText).kind === "sportify-profile" && back.ok && core.profileSame(back.profile, full) && back.profile.updated === "2026-09-25T20:00:00.000Z");
check("a session file is refused with a plain message, not read as a profile", (() => { const r = core.profileFromFileText(JSON.stringify({ placements: [], roof: {} })); return !r.ok && /session file/.test(r.error); })());
check("broken, empty and foreign files are refused", ["", "{", "[]", "null", JSON.stringify({ kind: "something-else", profile: {} }), JSON.stringify({ kind: "sportify-profile" })].every(t => !core.profileFromFileText(t).ok));
check("a file with junk inside is cleaned on the way in", (() => { const r = core.profileFromFileText(JSON.stringify({ kind: "sportify-profile", profile: { view: "expert", role: "client", evil: 1 } })); return r.ok && r.profile.view === "advanced" && r.profile.role === "client" && !("evil" in r.profile); })());

// ---------------------------------------------------------------------------------------------------------------- profile.js against a stand-in page and a stand-in Revit
function harness({ stored = null, elements = {} } = {}) {
  const store = new Map(stored ? [["sportify-profile", JSON.stringify(stored)]] : []);
  const rev = {
    up: true, profile: null, posts: [], gets: 0, refuse: false, capsCalls: [],
    caps: {
      unity: { found: true, path: "C:\\Unity\\Unity.exe", note: "Unity was found: the 3D videos can be rendered." }, unity_project_free: true,
      solidworks: { found: false, path: null, note: "SOLIDWORKS is not installed on this computer." }, chrome: { found: true, path: "C:\\Chrome\\chrome.exe", note: "Chrome was found." },
      view: "advanced", ribbon_hidden: [{ name: "SimulateKinetics", text: "Simulate (SOLIDWORKS)", reason: "SOLIDWORKS is not installed on this computer." }]
    }
  };
  const calls = { setRole: [], setTheme: [], setMode: [], toasts: [], downloads: [], delivered: [] };
  const dataset = { role: "planner", mode: "dark", view: undefined };
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, Blob, RegExp, Error, setTimeout, clearTimeout,
    document: { documentElement: { dataset }, getElementById: id => elements[id] || null, querySelectorAll: () => [] },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), showToast: (t, m) => calls.toasts.push(t + ": " + m), triggerDownload: (blob, name) => calls.downloads.push(name),
    deliverFile: async (kind, name, blob) => { calls.delivered.push({ kind, name, text: await blob.text() }); return rev.up ? { kept: true, name: "Sportify-PROFILE_20260926_0630.json", path: "C:\\Sportify\\Profile\\x.json" } : { kept: false, name, path: "" }; },
    activeMode: "sport",
    setRole: (r, quiet) => { calls.setRole.push([r, !!quiet]); dataset.role = r; },
    setTheme: m => { calls.setTheme.push(m); dataset.mode = m; },
    setMode: m => { calls.setMode.push(m); },
    localApi: async (p, opts) => {
      if (!rev.up) return { ok: false, status: 0, json: null, error: "Revit is not reachable" };
      if (p.startsWith("/capabilities")) { rev.capsCalls.push(p); return { ok: true, status: 200, json: rev.caps, error: "" }; }
      if (p !== "/profile") return { ok: false, status: 404, json: null, error: "no such path" };
      if (opts && opts.method === "POST") {
        rev.posts.push(JSON.parse(opts.body));
        if (rev.refuse) return { ok: false, status: 400, json: { error: "too big" }, error: "too big" };
        rev.profile = JSON.parse(opts.body);
        return { ok: true, status: 200, json: { profile: rev.profile, file: "C:\\Sportify\\Profile\\Sportify-PROFILE.json" }, error: "" };
      }
      rev.gets++;
      return { ok: true, status: 200, json: { profile: rev.profile }, error: "" };
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["profileCore.js", "profile.js"]) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, store, rev, calls, dataset, get: e => vm.runInContext(e, ctx), run: e => vm.runInContext(e, ctx) };
}

(async () => {
  {
    const h = harness();
    h.run("profileInit()");
    check("start-up with nothing saved applies the defaults and saves nothing (until the person changes something)", h.get("profileState.profile.view") === "advanced" && h.get("profileState.source") === "default" && !h.store.has("sportify-profile"));
    h.run('profileChange({ view: "simple" }, "")');
    const saved = JSON.parse(h.store.get("sportify-profile"));
    check("a change is applied, stamped and kept in the browser at once", saved.view === "simple" && !!saved.updated && h.get("document.documentElement.dataset.view") === "simple" && h.get("profileState.source") === "browser");
    await new Promise(r => setTimeout(r, 10));
    check("a change is sent to Revit when it is open, and the tab says it is shared", h.rev.posts.length === 1 && h.rev.posts[0].view === "simple" && h.get("profileState.shared") === true);
  }
  {
    const h = harness({ stored: { view: "simple", role: "client", theme: "light", updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    check("start-up applies the saved profile: the view, the role (quietly) and the theme", h.get("profileState.profile.view") === "simple" && h.calls.setRole.length === 1 && h.calls.setRole[0][0] === "client" && h.calls.setRole[0][1] === true && h.calls.setTheme.join() === "light");
    check("a change of role or theme made while a profile is applied does not save it again", h.store.size === 1 && JSON.parse(h.store.get("sportify-profile")).updated === "2026-09-25T10:00:00.000Z");
    h.dataset.role = "planner"; h.run("profileOnUiChange()");
    check("the role switch is followed: the profile takes the new role and is stamped", JSON.parse(h.store.get("sportify-profile")).role === "planner" && JSON.parse(h.store.get("sportify-profile")).updated !== "2026-09-25T10:00:00.000Z");
  }
  {
    const h = harness({ stored: { view: "simple", role: "planner", updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    h.rev.profile = { view: "advanced", role: "client", theme: null, updated: "2026-09-25T12:00:00.000Z" };
    await h.run("profileSyncWithRevit()");
    check("Revit's copy is newer: it is loaded here, kept in the browser, and the person is told", h.get("profileState.profile.view") === "advanced" && h.get("profileState.source") === "revit" && JSON.parse(h.store.get("sportify-profile")).updated === "2026-09-25T12:00:00.000Z" && h.calls.toasts.some(t => /Loaded from Revit/.test(t)) && h.rev.posts.length === 0);
    await h.run("profileSyncWithRevit()");
    check("...and then nothing more is sent or loaded (no ping-pong)", h.rev.posts.length === 0 && h.calls.toasts.length === 1);
  }
  {
    const h = harness({ stored: { view: "simple", role: "planner", updated: "2026-09-25T12:00:00.000Z" } });
    h.run("profileInit()");
    h.rev.profile = { view: "advanced", role: "planner", updated: "2026-09-25T10:00:00.000Z" };
    await h.run("profileSyncWithRevit()");
    check("this page's copy is newer: it is sent to Revit, and Revit's old one is not applied", h.rev.posts.length === 1 && h.rev.posts[0].view === "simple" && h.get("profileState.profile.view") === "simple");
  }
  {
    const h = harness({ stored: { view: "simple", role: "planner", updated: "2026-09-25T12:00:00.000Z" } });
    h.run("profileInit()");
    await h.run("profileSyncWithRevit()");
    check("Revit has none: the saved profile is sent to it", h.rev.posts.length === 1 && h.get("profileState.shared") === true);
  }
  {
    const h = harness();
    h.run("profileInit()");
    await h.run("profileSyncWithRevit()");
    check("nothing saved anywhere: nothing is sent (the defaults are not 'a profile' yet)", h.rev.posts.length === 0);
    h.rev.profile = { view: "simple", role: "client", updated: "2026-09-25T09:00:00.000Z" };
    await h.run("profileSyncWithRevit()");
    check("a profile that exists only in Revit is adopted by a page that has none", h.get("profileState.profile.view") === "simple" && h.get("profileState.profile.role") === "client");
  }
  {
    const h = harness({ stored: { view: "simple", updated: "2026-09-25T12:00:00.000Z" } });
    h.run("profileInit()");
    h.rev.up = false;
    await h.run("profileSyncWithRevit()");
    check("Revit not reachable: the profile stays as it is and the tab says Revit is not open", h.get("profileState.shared") === false && /Revit is not open/.test(h.run("profileStatusText()")) && h.get("profileState.profile.view") === "simple");
    h.rev.up = true; h.rev.refuse = true;
    h.run('profileChange({ view: "advanced" }, "")');
    await new Promise(r => setTimeout(r, 10));
    check("Revit refuses the profile: the browser copy is kept and the tab says so", h.get("profileState.shared") === "error" && /did not take/.test(h.get("profileState.note")) && JSON.parse(h.store.get("sportify-profile")).view === "advanced");
  }
  {
    const h = harness({ stored: { view: "advanced", updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    h.rev.profile = { view: "simple", role: "planner", updated: "2026-09-25T11:00:00.000Z" };
    await h.run("profileReload()");
    check("Reload reads Revit's saved copy and puts it in force", h.get("profileState.profile.view") === "simple" && /Reloaded from Revit/.test(h.get("profileState.note")));
    h.rev.up = false;
    h.run('profileChange({ view: "advanced" }, "")');
    await h.run("profileReload()");
    check("Reload without Revit reads the browser's copy", /Reloaded from this browser/.test(h.get("profileState.note")) && h.get("profileState.profile.view") === "advanced");
  }
  {
    const h = harness({ stored: { view: "simple", role: "client", updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    h.run("profileReset()");
    const p = JSON.parse(h.store.get("sportify-profile"));
    check("Reset goes back to Advanced and planner, keeps the theme, and is saved", p.view === "advanced" && p.role === "planner" && h.get("profileState.profile.quiz") === null);
  }
  {
    const h = harness({ stored: { view: "simple", updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    check("a workspace the Simple view hides is refused by profileModeAllowed, one it shows is not", h.run('profileModeAllowed("structure")') === false && h.run('profileModeAllowed("combine")') === true);
    h.run('profileChange({ view: "advanced" }, "")');
    check("...and Advanced allows every one", Object.keys(PROFILE_MODES).every(m => h.run('profileModeAllowed("' + m + '")') === true));
  }
  {
    const h = harness({ stored: { view: "advanced" } });
    h.run("profileInit()"); h.run("activeMode = 'structure'");
    h.run('profileChange({ view: "simple" }, "")');
    check("switching to Simple while a hidden workspace is open sends the person to the Overview", h.calls.setMode.includes("guide"));
  }
  {
    const gate = { textContent: "" };
    const h = harness({ stored: { view: "simple", updated: "2026-09-25T10:00:00.000Z" }, elements: { sessionGateProfile: gate } });
    h.run("profileInit()");
    check("nobody's name: the welcome line has no greeting", /^PROFILE: Simple view, planner\./.test(gate.textContent));
    h.run('profileSaveName("  Nada  ")');
    await new Promise(r => setTimeout(r, 10));
    const saved = JSON.parse(h.store.get("sportify-profile"));
    check("the name is saved trimmed and stamped in the browser, and sent to Revit", saved.person.name === "Nada" && saved.updated !== "2026-09-25T10:00:00.000Z" && h.rev.posts.at(-1).person.name === "Nada");
    check("the welcome screen greets the person by name", /^Welcome back, Nada\. PROFILE: Simple view/.test(gate.textContent));
    const posts = h.rev.posts.length;
    h.run('profileSaveName("Nada")');
    await new Promise(r => setTimeout(r, 10));
    check("saving the same name again changes nothing and sends nothing", h.rev.posts.length === posts);
    h.run('profileChange({ person: Object.assign({}, profileState.profile.person, { photo: "' + tinyJpeg + '" }) }, "")');
    await new Promise(r => setTimeout(r, 10));
    check("a photo is kept in the browser and sent to Revit with the name", JSON.parse(h.store.get("sportify-profile")).person.photo === tinyJpeg && h.rev.posts.at(-1).person.photo === tinyJpeg && h.rev.posts.at(-1).person.name === "Nada");
    h.run("profileRemovePhoto()");
    check("removing the photo keeps the name", JSON.parse(h.store.get("sportify-profile")).person.photo === null && JSON.parse(h.store.get("sportify-profile")).person.name === "Nada");
    h.run("profileReset()");
    check("Reset keeps the person: name and photo are not 'settings'", h.get("profileState.profile.person.name") === "Nada");
    const before = h.store.get("sportify-profile");
    await h.run('profileChoosePhoto({ type: "text/plain", name: "notes.txt" })');
    check("a file that is not a picture is refused with words, and the profile is untouched", /not a picture/.test(h.get("profileState.note")) && h.store.get("sportify-profile") === before && h.calls.toasts.some(t => /Photo not saved/.test(t)));
  }
  {
    const h = harness({ stored: { view: "simple", person: { name: "Ali" }, updated: "2026-09-25T10:00:00.000Z" } });
    h.run("profileInit()");
    await h.run("profileExportFile()");
    check("Export with the add-in open saves a copy in the Profile folder of the Sportify folder (kind 'profile'), with the name inside", h.calls.delivered.length === 1 && h.calls.delivered[0].kind === "profile" && h.calls.delivered[0].name === "Sportify-PROFILE.json" && JSON.parse(h.calls.delivered[0].text).profile.person.name === "Ali" && /saved in the Profile folder/.test(h.get("profileState.note")));
    h.rev.up = false;
    await h.run("profileExportFile()");
    check("Export without the add-in says it was downloaded instead", /downloaded/.test(h.get("profileState.note")));
    h.run('profileChange({ view: "advanced" }, "")');
    h.rev.up = true;
    await h.run('profilePushToRevit(profileState.profile)');
    check("Revit's answer says where the file is: the tab can name it", /Profile\\Sportify-PROFILE\.json/.test(h.get("profileState.file")) && /Profile folder of your Sportify folder/.test(h.run("profileStatusText()")));
  }
  {
    // this computer: what the add-in found, asked of it, never of the person
    const el = { innerHTML: "" }, hiddenEl = { textContent: "" };
    const h = harness({ stored: { view: "simple", updated: "2026-09-25T10:00:00.000Z" }, elements: { "profile-machine": el, "profile-machine-hidden": hiddenEl } });
    h.run("profileInit()");
    check("before Revit answers, the tab says it cannot tell what this computer has (and that the web app works without)", /Not connected/.test(el.innerHTML) && /works without it/.test(el.innerHTML) && hiddenEl.textContent === "");
    await h.run("profileSyncWithRevit()");
    await new Promise(r => setTimeout(r, 10));
    check("the first contact with the add-in asks what this computer has, once", h.rev.capsCalls.length === 1 && h.rev.capsCalls[0] === "/capabilities");
    await h.run("profileSyncWithRevit()");
    await new Promise(r => setTimeout(r, 10));
    check("...and the poll does not ask again (only a change of the profile, or opening the tab, does)", h.rev.capsCalls.length === 1);
    check("the tab shows Unity found, SOLIDWORKS not found, Chrome found, each with the add-in's sentence and what it means", /Unity<\/strong><span class="profile-machine-state">found/.test(el.innerHTML) && /SOLIDWORKS<\/strong><span class="profile-machine-state">not found/.test(el.innerHTML) && /Chrome<\/strong><span class="profile-machine-state">found/.test(el.innerHTML)
      && /SOLIDWORKS is not installed on this computer\./.test(el.innerHTML) && /Simulate \(SOLIDWORKS\) is hidden in Revit/.test(el.innerHTML) && /3D videos of the analyses/.test(el.innerHTML));
    check("it lists the Revit buttons that are hidden, by their words", /Hidden in the Sportify tab of Revit[^:]*: Simulate \(SOLIDWORKS\)\./.test(hiddenEl.textContent));
    h.run('profileChange({ view: "advanced" }, "")');
    await new Promise(r => setTimeout(r, 20));
    check("changing the view asks again (the ribbon follows it, so what it hides changed), without forcing a new look at the computer", h.rev.capsCalls.length === 2 && h.rev.capsCalls[1] === "/capabilities");
    h.run("profileOnTabOpen()");
    await new Promise(r => setTimeout(r, 10));
    check("opening the tab looks at the computer again (?refresh=1): Unity may have been installed since", h.rev.capsCalls.length === 3 && h.rev.capsCalls[2] === "/capabilities?refresh=1");
    h.rev.caps = Object.assign({}, h.rev.caps, { ribbon_hidden: [] });
    await h.run("profileLoadMachine(false)");
    check("with nothing hidden the tab says so", /Nothing is hidden in the Sportify tab of Revit/.test(hiddenEl.textContent));
    h.rev.up = false;
    h.run("profileRevitClosed()");
    check("Revit closing forgets the answer: the tab says it cannot tell again", h.get("profileState.machine") === null && /Not connected/.test(el.innerHTML) && hiddenEl.textContent === "");
    const calls = h.rev.capsCalls.length;
    h.run("profileOnTabOpen()");
    await new Promise(r => setTimeout(r, 10));
    check("with Revit closed, opening the tab asks nothing", h.rev.capsCalls.length === calls);
  }
  {
    // what the add-in says is text, whatever it says
    const el = { innerHTML: "" }, hiddenEl = { textContent: "" };
    const h = harness({ elements: { "profile-machine": el, "profile-machine-hidden": hiddenEl } });
    h.run("profileInit()");
    h.rev.caps = { unity: { found: false, note: '<img src=x onerror="alert(1)">' }, solidworks: { found: true, note: "<b>ok</b>" }, chrome: null, ribbon_hidden: [{ text: "<script>x</script>" }] };
    await h.run("profileLoadMachine(true)");
    check("notes from the add-in are put on the page escaped, never as markup", !/<img|<b>|<script/.test(el.innerHTML) && /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/.test(el.innerHTML) && /&lt;b&gt;ok&lt;\/b&gt;/.test(el.innerHTML));
    check("button names from the add-in go through textContent (inert text), not innerHTML", hiddenEl.textContent.includes("<script>x</script>") && /hiddenEl\.textContent = /.test(read("profile.js")) && !/hiddenEl\.innerHTML/.test(read("profile.js")));
  }
  {
    // storage that throws (a private window): the page still works
    const h = harness();
    h.ctx.localStorage.getItem = () => { throw new Error("blocked"); };
    h.ctx.localStorage.setItem = () => { throw new Error("blocked"); };
    let ok = true;
    try { h.run("profileInit()"); h.run('profileChange({ view: "simple" }, "")'); } catch (e) { ok = false; }
    check("blocked browser storage does not break the page; the profile still applies for this visit", ok && h.get("profileState.profile.view") === "simple");
  }

  console.log(fails === 0 ? "\nPROFILE OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
