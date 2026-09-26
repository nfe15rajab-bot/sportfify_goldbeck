/**
 * sessionNames.js — the name of the session and of the iteration, for the files Sportify makes.
 *
 * Every report, schedule, diagram, charts PDF and film starts with them ("DIGITAL TOOLS AND METHODS 2 - Roof and Sports - Algorithmic - Sportify_Analysis_Report_....pdf"), so that
 * the files of the two iterations of one session, or of several sessions, can be told apart in one folder. The two fields are in the Documents tab. What is typed is kept in the browser,
 * travels in a saved session (the Combined JSON's "session") and is told to the Revit add-in (POST /session-names), which puts them in front of the file names it makes.
 *
 * The names are NOT part of the layout the app sends the add-in as it changes (workspaceBridge.js currentDraftBody leaves them out): a layout's identity is a hash of that text, and naming a
 * session must not make every result "about an earlier layout". They go in their own small request.
 *
 * sessionNameClean and sessionNamePrefix are the add-in's DeliverableNaming.Clean and .Prefix (tools/session-names-test.js and Tools/AddinCheck pin the same examples).
 */

const SESSION_NAME_MAX = 60, SESSION_ITERATION_MAX = 40, SESSION_NAME_KEY = "sportify-session-names";

/** A name as a part of a file name: characters Windows refuses and control characters become spaces, spaces collapse, dots and spaces at the ends go, cut to `max`. */
function sessionNameClean(name, max) {
  const limit = max || SESSION_NAME_MAX;
  let s = String(name == null ? "" : name).replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, " ").split(" ").filter(Boolean).join(" ");
  if (s.length > limit) s = s.slice(0, limit).replace(/ +$/, "");
  return s.replace(/^[ .]+|[ .]+$/g, "");
}

/** "Session - Iteration - " (one of them alone with its " - ", nothing when neither is given). */
function sessionNamePrefix(session, iteration) {
  const parts = [sessionNameClean(session, SESSION_NAME_MAX), sessionNameClean(iteration, SESSION_ITERATION_MAX)].filter(Boolean);
  return parts.length ? parts.join(" - ") + " - " : "";
}

const sessionNames = { name: "", iteration: "", sent: null };

/** What goes into a saved session and to the add-in: { name, iteration } cleaned, or null when both are empty. */
function sessionNamesPayload() {
  const name = sessionNameClean(sessionNames.name, SESSION_NAME_MAX), iteration = sessionNameClean(sessionNames.iteration, SESSION_ITERATION_MAX);
  return name || iteration ? { name, iteration } : null;
}

/** Takes the names of a loaded session ({ name, iteration }); a session without any leaves the fields as they are. */
function sessionNamesApply(saved) {
  if (!saved || typeof saved !== "object") return;      // a session saved before this, or without names: what is typed stays
  const s = saved;
  sessionNames.name = typeof s.name === "string" ? sessionNameClean(s.name, SESSION_NAME_MAX) : "";
  sessionNames.iteration = typeof s.iteration === "string" ? sessionNameClean(s.iteration, SESSION_ITERATION_MAX) : "";
  sessionNames.sent = null;
  sessionNamesRemember();
  sessionNamesShow();
  sessionNamesSync(true);
}

function sessionNamesRemember() {
  try { localStorage.setItem(SESSION_NAME_KEY, JSON.stringify({ name: sessionNames.name, iteration: sessionNames.iteration })); } catch (e) { /* private window: not kept */ }
}

function sessionNamesRecall() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_NAME_KEY) || "null");
    if (saved && typeof saved === "object") {
      sessionNames.name = typeof saved.name === "string" ? sessionNameClean(saved.name, SESSION_NAME_MAX) : "";
      sessionNames.iteration = typeof saved.iteration === "string" ? sessionNameClean(saved.iteration, SESSION_ITERATION_MAX) : "";
    }
  } catch (e) { /* nothing kept, or not readable */ }
}

/** The fields and the line under them show what is held. */
function sessionNamesShow() {
  const name = document.getElementById("session-name"), iteration = document.getElementById("session-iteration"), preview = document.getElementById("session-names-preview");
  if (name && document.activeElement !== name) name.value = sessionNames.name;
  if (iteration && document.activeElement !== iteration) iteration.value = sessionNames.iteration;
  if (preview) {
    const prefix = sessionNamePrefix(sessionNames.name, sessionNames.iteration);
    preview.textContent = prefix ? "Files start with: " + prefix + "Sportify_Analysis_Report_..." : "Nothing typed: the files keep their plain names (Sportify_Analysis_Report_...).";
  }
}

/** Tells the add-in the names when they changed since it last heard them (or always when `force`). Silent when it is not connected: it is told when it is. */
async function sessionNamesSync(force) {
  if (typeof workspaceState === "undefined" || workspaceState.connected !== true || typeof localApi !== "function") return false;
  const body = JSON.stringify(sessionNamesPayload() || { name: "", iteration: "" });
  if (!force && body === sessionNames.sent) return false;
  const r = await localApi("/session-names", { method: "POST", body, contentType: "application/json" });
  if (r.ok) sessionNames.sent = body;
  return r.ok;
}

function sessionNamesInit() {
  sessionNamesRecall();
  const name = document.getElementById("session-name"), iteration = document.getElementById("session-iteration");
  if (!name || !iteration) return;
  const changed = () => {
    sessionNames.name = name.value;
    sessionNames.iteration = iteration.value;
    sessionNamesRemember();
    sessionNamesShow();
    sessionNamesSync(false);
  };
  name.addEventListener("input", changed);
  iteration.addEventListener("input", changed);
  sessionNamesShow();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { sessionNameClean, sessionNamePrefix, SESSION_NAME_MAX, SESSION_ITERATION_MAX };
} else {
  sessionNamesInit();
}
