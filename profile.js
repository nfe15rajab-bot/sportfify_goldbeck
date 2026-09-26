/**
 * profile.js — the Profile tab (next to New Session in the top bar) and everything that keeps the profile: applying it to the page, saving it in this browser and in Revit's
 * settings file, reloading it, and the file (Sportify-PROFILE.json) that carries it to another machine. What a profile is, and what Simple and Advanced show, is in
 * profileCore.js.
 *
 *   applying    the view hides the tabs it does not show (a class, view-hidden, on the rail's buttons, the Overview's steps and the separators between them); the role and
 *               the theme go through the app's own setRole() and setTheme(), so there is one switch for each
 *   saving      every change is kept at once: in this browser (localStorage) and, when the Revit add-in is open, in its settings file (POST /profile), which the Sportify
 *               tab in Revit reads too. Nothing to press: the tab's buttons Reload, Export and Import are for moving a profile, not for keeping it
 *   reloading   at start-up the browser's copy is applied; when the add-in answers (it is polled every few seconds by workspaceBridge.js) the NEWER of the two wins, so a
 *               change made in Revit shows up here and a change made here reaches Revit
 *
 * The profile also says who the person is (a name and a photo). It is written to the Profile folder of the Sportify folder by the add-in (Sportify-PROFILE.json, and the
 * photo as a picture file), so it is one of the deliverables; the Export button saves a dated copy there too.
 *
 * A view is not a lock: everything a view hides is one click away in the Profile tab.
 */

const profileState = {
  profile: profileDefaults(),
  source: "default",      // where the profile in force came from: "default", "browser", "file" or "revit"
  shared: null,           // null = not asked yet; true = Revit has this profile; false = Revit is not open (it gets the profile when both are); "error" = Revit refused it
  file: "",               // where the add-in wrote Sportify-PROFILE.json in the Sportify folder (its answer to the last POST /profile), "" until it has
  machine: null,          // the add-in's answer to GET /capabilities (what this computer has, what its ribbon hides), null while Revit is not reachable
  note: ""                // the last thing that happened, in words (shown in the tab)
};
let profileApplying = false;
let profileSyncing = false;
let profileMachineLoading = false;
let profileNameTimer = null;

// ------------------------------------------------------------------------------------------------ the browser's copy

function profileReadBrowser() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? normalizeProfile(raw) : null;
  } catch (e) { return null; }      // private mode or blocked storage: no browser copy, the app still works
}

function profileWriteBrowser(p) {
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
}

// ------------------------------------------------------------------------------------------------ applying a profile to the page

/** Shows or hides the separators (or arrows) of a row of buttons so that none is left standing between hidden buttons. */
function profileTidy(container, separatorSelector) {
  const kids = Array.from(container.children);
  const items = kids.map(el => (el.matches(separatorSelector) ? { divider: true } : { divider: false, visible: !el.classList.contains("view-hidden") }));
  const shown = profileRailLayout(items);
  kids.forEach((el, i) => { if (items[i].divider) el.classList.toggle("view-hidden", !shown[i]); });
}

/** Is this workspace part of the view in force? (main.js asks before it opens one.) */
function profileModeAllowed(mode) { return profileModeVisible(profileState.profile.view, mode, profileState.profile.extras); }

/** Where Sportify opens: the workspace the person's answers chose (the quiz), when the view shows it; else the Overview. main.js asks after the welcome screen. */
function profileLandingMode() {
  const p = profileState.profile;
  return p.landing && profileModeVisible(p.view, p.landing, p.extras) ? p.landing : "guide";
}

function profileApplyView(view, extras) {
  Object.keys(PROFILE_MODES).forEach(mode => {
    const el = document.getElementById(PROFILE_MODES[mode].button);
    if (el) el.classList.toggle("view-hidden", !profileModeVisible(view, mode, extras));
  });
  const rail = document.getElementById("modeRail");
  if (rail) profileTidy(rail, ".activity-bar-divider");
  const row = document.getElementById("overviewWorkflow");
  if (row) {
    row.querySelectorAll(".workflow-step[data-goto]").forEach(step => step.classList.toggle("view-hidden", !profileModeVisible(view, step.dataset.goto, extras)));
    let n = 0;
    row.querySelectorAll(".workflow-step:not(.view-hidden) .workflow-num").forEach(num => { num.textContent = String(++n); });
    profileTidy(row, ".workflow-arrow");
  }
  document.documentElement.dataset.view = view;
  // a workspace the new view hides must not stay open
  if (typeof activeMode !== "undefined" && !profileModeVisible(view, activeMode, extras) && typeof setMode === "function") setMode("guide");
}

/** Puts a profile in force: the view, the role, the theme, and what the Profile tab and the welcome screen say. Does not save (see profileChange). */
function profileApply(p, source) {
  const prof = normalizeProfile(p);
  profileState.profile = prof;
  if (source) profileState.source = source;
  profileApplying = true;
  try {
    profileApplyView(prof.view, prof.extras);
    if (document.documentElement.dataset.role !== prof.role && typeof setRole === "function") setRole(prof.role, true);
    if (prof.theme && document.documentElement.dataset.mode !== prof.theme && typeof setTheme === "function") setTheme(prof.theme);
  } finally {
    profileApplying = false;
  }
  profileRender();
}

/** A change the person made (in this tab, or with the role or theme switch): stamped, applied, kept in the browser and sent to Revit. */
function profileChange(patch, note) {
  const next = profileStamped(Object.assign({}, profileState.profile, patch));
  profileState.note = note || "";
  profileApply(next, "browser");
  profileWriteBrowser(next);
  profilePushToRevit(next);
}

/** main.js calls this after the role or theme switch was used, so the profile follows what the person did. Ignored while a profile is being applied. */
function profileOnUiChange() {
  if (profileApplying) return;
  const role = document.documentElement.dataset.role, theme = document.documentElement.dataset.mode;
  const p = profileState.profile;
  if (p.role === role && p.theme === theme) return;
  profileChange({ role, theme });
}

// ------------------------------------------------------------------------------------------------ Revit's copy (the add-in's settings file)

async function profilePushToRevit(p) {
  if (typeof localApi !== "function") return;
  const r = await localApi("/profile", { method: "POST", contentType: "application/json", body: JSON.stringify(p) });
  profileState.shared = r.ok ? true : r.status === 0 ? false : "error";
  if (r.ok && r.json && typeof r.json.file === "string") profileState.file = r.json.file;
  if (profileState.shared === "error") profileState.note = "Revit did not take the profile: " + (r.error || "no reason given");
  profileRenderStatus();
  if (r.ok) profileLoadMachine(false);      // the ribbon follows the view, so what it hides has changed
}

/** What this computer has, and what the Sportify tab in Revit hides because of it and of the view: asked of the add-in (which looks; nobody is asked). */
async function profileLoadMachine(refresh) {
  if (typeof localApi !== "function" || (profileMachineLoading && !refresh)) return;      // one plain question at a time; an explicit refresh always goes through
  profileMachineLoading = true;
  try {
    const r = await localApi("/capabilities" + (refresh ? "?refresh=1" : ""));
    profileState.machine = r.ok && r.json ? r.json : null;
  } finally {
    profileMachineLoading = false;
  }
  profileRenderMachine();
  if (typeof whereRender === "function") whereRender();      // Unity and SOLIDWORKS in the Overview's card and on the badges
}

/** main.js: the Profile tab was opened. Look at the computer again (Unity may have been installed since Revit started). */
function profileOnTabOpen() {
  if (profileState.shared !== false) profileLoadMachine(true);
}

/** Called by workspaceBridge.js on every answer of the add-in: whichever copy is newer wins, and a copy the other lacks is sent to it. */
async function profileSyncWithRevit() {
  if (typeof localApi !== "function" || profileSyncing) return;
  profileSyncing = true;
  try {
    const r = await localApi("/profile");
    if (!r.ok) { if (r.status === 0 && profileState.shared !== false) { profileState.shared = false; profileRenderStatus(); } return; }
    const remote = r.json && r.json.profile ? normalizeProfile(r.json.profile) : null;
    const local = profileState.profile;
    if (remote && profileIsNewer(remote, local)) {
      profileState.note = "Your profile was changed in Revit and is loaded here.";
      profileWriteBrowser(remote);
      profileApply(remote, "revit");
      if (typeof showToast === "function") showToast("Profile", "Loaded from Revit: " + PROFILE_VIEWS[remote.view].title + " view.");
    } else if (local.updated && (!remote || profileIsNewer(local, remote))) {
      await profilePushToRevit(local);
    }
    if (profileState.shared !== "error") profileState.shared = true;
    if (!profileState.machine) profileLoadMachine(false);      // first contact with the add-in: what this computer has
  } finally {
    profileSyncing = false;
  }
  profileRenderStatus();
}

/** workspaceBridge.js: the add-in stopped answering. */
function profileRevitClosed() {
  if (profileState.shared === false) return;
  profileState.shared = false;
  profileState.machine = null;
  profileRenderStatus();
  profileRenderMachine();
  if (typeof whereRender === "function") whereRender();
}

// ------------------------------------------------------------------------------------------------ the buttons of the tab

/** Reload: read the saved copy again (Revit's when it is open and has one, else the browser's) and put it in force. */
async function profileReload() {
  let saved = null, from = "";
  if (typeof localApi === "function") {
    const r = await localApi("/profile");
    if (r.ok && r.json && r.json.profile) { saved = normalizeProfile(r.json.profile); from = "Revit"; }
  }
  if (!saved) { saved = profileReadBrowser(); from = "this browser"; }
  if (!saved) { profileState.note = "Nothing has been saved yet: these are the defaults. Change something and it is saved."; profileRenderStatus(); return; }
  profileWriteBrowser(saved);
  profileState.note = "Reloaded from " + from + ".";
  profileApply(saved, from === "Revit" ? "revit" : "browser");
}

/** Export: a dated copy in the Profile folder of the Sportify folder when Revit's add-in is open (like every other deliverable), else the browser's download. */
async function profileExportFile() {
  const blob = new Blob([profileToFileText(profileState.profile)], { type: "application/json" });
  if (typeof deliverFile === "function") {
    const r = await deliverFile("profile", "Sportify-PROFILE.json", blob);
    profileState.note = r.kept
      ? "A copy was saved in the Profile folder of your Sportify folder (" + r.name + "). Import it on another computer to have the same profile there."
      : "The profile was downloaded as Sportify-PROFILE.json. Import it on another computer to have the same profile there.";
  } else {
    triggerDownload(blob, "Sportify-PROFILE.json");
    profileState.note = "The profile was downloaded as Sportify-PROFILE.json.";
  }
  profileRenderStatus();
}

// ------------------------------------------------------------------------------------------------ the person: a name and a photo

/**
 * A picture the person chose, as a small square JPEG data URL (256 px, centred crop, white behind any transparency): what the profile keeps, so it stays light enough to
 * travel in the settings file and the profile file. Rejects, with words for the person, when the file is not a picture or will not shrink enough.
 */
function profileMakePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("That file is not a picture.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
        if (!side) throw new Error("empty");
        for (const [size, quality] of [[256, 0.85], [256, 0.65], [192, 0.6], [128, 0.6]]) {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const g = c.getContext("2d");
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, size, size);
          g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
          const data = c.toDataURL("image/jpeg", quality);
          if (normalizePhoto(data)) { resolve(data); return; }
        }
        reject(new Error("That picture is too large to keep."));
      } catch (e) {
        reject(new Error("The picture could not be read."));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The picture could not be opened.")); };
    img.src = url;
  });
}

async function profileChoosePhoto(file) {
  try {
    const photo = await profileMakePhoto(file);
    profileChange({ person: Object.assign({}, profileState.profile.person, { photo }) }, "Photo saved.");
  } catch (e) {
    profileState.note = e.message;
    profileRenderStatus();
    if (typeof showToast === "function") showToast("Photo not saved", e.message);
  }
}

function profileRemovePhoto() {
  profileChange({ person: Object.assign({}, profileState.profile.person, { photo: null }) }, "Photo removed.");
}

/** The name field: saved when the person pauses typing or leaves the field. */
function profileSaveName(value) {
  clearTimeout(profileNameTimer);
  const name = normalizePerson({ name: value }).name;
  if (name === profileState.profile.person.name) return;
  profileChange({ person: Object.assign({}, profileState.profile.person, { name }) }, "");
}

function profileNameTyped(value) {
  clearTimeout(profileNameTimer);
  profileNameTimer = setTimeout(() => profileSaveName(value), 700);
}

function profileImportFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    const parsed = profileFromFileText(String(evt.target.result || ""));
    if (!parsed.ok) { profileState.note = parsed.error; profileRenderStatus(); if (typeof showToast === "function") showToast("Profile not loaded", parsed.error); return; }
    profileChange(parsed.profile, "Loaded from the file " + file.name + ".");
    if (typeof showToast === "function") showToast("Profile loaded", PROFILE_VIEWS[parsed.profile.view].title + " view, " + parsed.profile.role + ".");
  };
  reader.onerror = () => { profileState.note = "The file could not be read."; profileRenderStatus(); };
  reader.readAsText(file);
}

function profileReset() {
  const d = profileDefaults();
  profileChange({ view: d.view, role: d.role, quiz: null, extras: [], landing: null }, "Back to the defaults: Advanced view, planner, no quiz answers. Your name, photo and the theme stay as they are.");
}

// ------------------------------------------------------------------------------------------------ what the tab and the welcome screen say

function profileRenderChoices() {
  const p = profileState.profile;
  const viewEl = document.getElementById("profile-view");
  if (viewEl) {
    viewEl.innerHTML = Object.keys(PROFILE_VIEWS).map(key => {
      const v = PROFILE_VIEWS[key], on = key === p.view;
      return `<button type="button" class="profile-card${on ? " active" : ""}" data-profile-view="${escapeHtml(key)}" aria-pressed="${on}">
        <span class="profile-card-title"><i class="ti ${key === "simple" ? "ti-route" : "ti-adjustments-horizontal"}" aria-hidden="true"></i>${escapeHtml(v.title)}</span>
        <span class="profile-card-tag">${escapeHtml(v.tagline)}</span>
      </button>`;
    }).join("");
  }
  const noteEl = document.getElementById("profile-view-note");
  if (noteEl) {
    const hidden = profileHiddenModes(p.view, p.extras).map(m => PROFILE_MODES[m].label);
    const added = p.view === "simple" && p.extras.length ? "Added to it because of your answers: " + p.extras.map(k => PROFILE_EXTRAS[k].label).join(", ") + ". " : "";
    noteEl.textContent = added + (hidden.length
      ? "Hidden in the " + PROFILE_VIEWS[p.view].title + " view: " + hidden.join(", ") + ". They are one click away in Advanced; nothing is deleted."
      : "Nothing is hidden: every tab is shown.");
  }
  document.querySelectorAll("[data-profile-role]").forEach(b => b.classList.toggle("active", b.dataset.profileRole === p.role));
  document.querySelectorAll("[data-profile-theme]").forEach(b => b.classList.toggle("active", b.dataset.profileTheme === (p.theme || document.documentElement.dataset.mode)));
}

/** The name and photo, on the tab and on the welcome screen. Built with DOM calls, never markup: the name is typed by a person and the photo is a data URL from a file. */
function profileRenderPerson() {
  const person = profileState.profile.person;
  const nameEl = document.getElementById("profile-person-name");
  if (nameEl && document.activeElement !== nameEl) nameEl.value = person.name;
  const avatar = document.getElementById("profile-avatar");
  if (avatar) {
    avatar.textContent = "";
    if (person.photo) {
      const img = document.createElement("img");
      img.src = person.photo;
      img.alt = person.name ? "Photo of " + person.name : "Your photo";
      avatar.appendChild(img);
    } else {
      const icon = document.createElement("i");
      icon.className = "ti ti-user";
      icon.setAttribute("aria-hidden", "true");
      avatar.appendChild(icon);
    }
  }
  const remove = document.getElementById("btn-profile-photo-remove");
  if (remove) remove.style.display = person.photo ? "" : "none";
  const add = document.getElementById("btn-profile-photo-label");
  if (add) add.textContent = person.photo ? "Change photo" : "Add a photo";
  const gatePhoto = document.getElementById("sessionGatePhoto");
  if (gatePhoto) {
    if (person.photo) { gatePhoto.src = person.photo; gatePhoto.alt = person.name ? "Photo of " + person.name : "Your photo"; gatePhoto.style.display = "block"; }
    else { gatePhoto.removeAttribute("src"); gatePhoto.style.display = "none"; }
  }
}

function profileStatusText() {
  const p = profileState.profile;
  if (!p.updated) return "Nothing has been saved yet: these are the defaults. Change anything and it is saved at once, on this computer and in Revit.";
  const stamp = new Date(p.updated).toLocaleString();
  if (profileState.shared === true) return "Saved " + stamp + " in this browser, in Revit's settings file and as Sportify-PROFILE.json in the Profile folder of your Sportify folder" + (profileState.file ? " (" + profileState.file + ")" : "") + ", so the Sportify tab in Revit and this page agree.";
  if (profileState.shared === "error") return "Saved " + stamp + " in this browser. Revit did not take it.";
  return "Saved " + stamp + " in this browser. Revit is not open: it gets the profile the next time both are open.";
}

function profileRenderStatus() {
  const el = document.getElementById("profile-status");
  if (el) el.textContent = profileStatusText() + (profileState.note ? " " + profileState.note : "");
}

/** The line on the welcome screen: which profile is in force, so a person who reaches Sportify by the gate knows it was loaded. */
function profileRenderGateLine() {
  const el = document.getElementById("sessionGateProfile");
  if (!el) return;
  const p = profileState.profile;
  el.textContent = (p.person.name ? "Welcome back, " + p.person.name + ". " : "") + "PROFILE: " + PROFILE_VIEWS[p.view].title + " view, " + p.role + (p.updated ? "" : " (defaults)") + ". Change it in the Profile tab.";
}

/** "This computer": what the add-in found (Unity, SOLIDWORKS, Chrome), what that means, and which Revit buttons are hidden. Every word from the add-in goes through escapeHtml. */
function profileRenderMachine() {
  const el = document.getElementById("profile-machine");
  if (el) {
    const words = { ok: "found", missing: "not found", unknown: "unknown" };
    const icons = { ok: "ti-circle-check", missing: "ti-circle-x", unknown: "ti-help-circle" };
    el.innerHTML = profileMachineRows(profileState.machine).map(row => `
      <div class="profile-machine-row profile-machine-${escapeHtml(row.state)}">
        <i class="ti ${icons[row.state] || icons.unknown}" aria-hidden="true"></i>
        <div class="profile-machine-body">
          <div class="profile-machine-title"><strong>${escapeHtml(row.label)}</strong><span class="profile-machine-state">${escapeHtml(words[row.state] || words.unknown)}</span></div>
          ${row.text ? `<div class="profile-machine-text">${escapeHtml(row.text)}</div>` : ""}
          ${row.affects ? `<div class="profile-machine-affects">${escapeHtml(row.affects)}</div>` : ""}
        </div>
      </div>`).join("");
  }
  const hiddenEl = document.getElementById("profile-machine-hidden");
  if (hiddenEl) {
    const hidden = profileHiddenButtons(profileState.machine);
    hiddenEl.textContent = !profileState.machine ? ""
      : hidden.length ? "Hidden in the Sportify tab of Revit (because of your view and this computer): " + hidden.join(", ") + ". Choose Advanced to show what your view hides; what needs a tool that is not installed comes back once the tool is."
      : "Nothing is hidden in the Sportify tab of Revit.";
  }
}

function profileRender() {
  profileRenderPerson();
  profileRenderMachine();
  if (typeof quizRenderProfileSection === "function") quizRenderProfileSection();      // quiz.js: the answers and the buttons to take the quiz again
  if (typeof quizRenderNextStep === "function") quizRenderNextStep();                  // quiz.js: "Your next step" on the Overview
  profileRenderChoices();
  profileRenderStatus();
  profileRenderGateLine();
}

// ------------------------------------------------------------------------------------------------ start

function profileInit() {
  const tab = document.getElementById("profile-content");
  if (tab) {
    tab.addEventListener("click", e => {
      const view = e.target.closest("[data-profile-view]");
      if (view) return profileChange({ view: view.dataset.profileView }, "");
      const role = e.target.closest("[data-profile-role]");
      if (role) return profileChange({ role: role.dataset.profileRole }, "");
      const theme = e.target.closest("[data-profile-theme]");
      if (theme) return profileChange({ theme: theme.dataset.profileTheme }, "");
    });
    document.getElementById("btn-profile-reload")?.addEventListener("click", profileReload);
    document.getElementById("btn-profile-export")?.addEventListener("click", profileExportFile);
    document.getElementById("btn-profile-reset")?.addEventListener("click", profileReset);
    const nameEl = document.getElementById("profile-person-name");
    nameEl?.addEventListener("input", () => profileNameTyped(nameEl.value));
    nameEl?.addEventListener("change", () => profileSaveName(nameEl.value));
    const photoInput = document.getElementById("profile-photo-file");
    document.getElementById("btn-profile-photo")?.addEventListener("click", () => photoInput && photoInput.click());
    photoInput?.addEventListener("change", e => { const f = e.target.files[0]; if (f) profileChoosePhoto(f); e.target.value = ""; });
    document.getElementById("btn-profile-photo-remove")?.addEventListener("click", profileRemovePhoto);
    const fileInput = document.getElementById("profile-import-file");
    document.getElementById("btn-profile-import")?.addEventListener("click", () => fileInput && fileInput.click());
    fileInput?.addEventListener("change", e => { const f = e.target.files[0]; if (f) profileImportFile(f); e.target.value = ""; });
  }
  const saved = profileReadBrowser();
  profileApply(saved || profileDefaults(), saved ? "browser" : "default");
}
