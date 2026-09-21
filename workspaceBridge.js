/**
 * workspaceBridge.js — the web app and the Sportify folder on the user's machine, both ways, with nothing to import or export by hand.
 *
 * The installer makes the folder (default Documents\Sportify Workspace, or one the user chose) with a subfolder for every kind of deliverable, and the Revit add-in
 * serves it on localhost:5679 beside the roof, the results and the recordings. This file is the web app's side of that:
 *
 *   connection      polls the add-in (GET /workspace, /deliverables): connected or not, which folder, what is in it
 *   layout          sends the layout to the add-in as a draft (POST /combined-layout?draft=1) whenever it changes, so the add-in's analyses, PDFs and schedule
 *                   always work on what is on screen. A draft never triggers Revit's own auto-import: that stays with the explicit "Export Combined JSON"
 *   exports         when connected, the app's own exports (layout JSON, roof PNG, field JSON/DXF, garden JSON) are saved in the folder instead of the browser's
 *                   Downloads; offline they download as before
 *   commands        run the physical analyses, make the charts PDF, the analysis report and the schedule, ask Revit for the functional diagrams,
 *                   open the folder in Explorer (the Deliverables tab, and the Analysis tab's Run analysis button)
 *   charts          the analyses' charts as SVG (GET /charts), shown in the Analysis groups and written to the charts PDF
 *
 * Nothing is computed here. Not connected is a normal state (the app works alone); every action says so plainly instead of failing quietly.
 */

const SPORTIFY_LOCAL_URL = "http://localhost:5679";
const WORKSPACE_POLL_MS = 4000;
const DRAFT_SYNC_MS = 3000;

const workspaceState = {
  connected: null,            // null until the first answer, then true / false
  folder: "", defaultFolder: "", settingsFile: "",
  kinds: [],                  // [{ key, folder, title, hint, count }]
  files: [],                  // [{ kind, name, size, modified_utc, url }], newest first
  busy: {},                   // action name → true while it runs
  message: null,              // the last thing an action said: { tone: "ok" | "bad", html }
  charts: null,               // GET /charts answer: { sections: [...], skipped: [...] }
  chartsError: "",
  chartsLoading: false,
  chartsFor: null,            // the draft the charts were made from
  draftSent: null,            // the last draft the add-in has (its JSON text)
  layoutId: null,             // the id the add-in gave that draft (POST /combined-layout answers it)
  layoutIdNow: null,          // the id of the layout on screen, computed here the same way (null: nothing placed)
  lastRun: null,              // what POST /run-analysis answered
  stamp: 0                    // bumped on every change that views should redraw for
};

// ------------------------------------------------------------------------------------------------ talking to the add-in

/** One call to the add-in's local server. Never throws: { ok, status, json, error }; status 0 = the add-in is not reachable. */
async function localApi(path, opts) {
  const o = opts || {};
  try {
    const res = await fetch(SPORTIFY_LOCAL_URL + path, {
      method: o.method || "GET",
      headers: o.contentType ? { "Content-Type": o.contentType } : undefined,
      body: o.body,
      cache: "no-store"
    });
    let json = null;
    if ((res.headers.get("Content-Type") || "").includes("json")) {
      try { json = await res.json(); } catch (e) { /* not JSON after all */ }
    }
    return { ok: res.ok, status: res.status, json, error: json && json.error ? json.error : res.ok ? "" : "The add-in answered " + res.status + "." };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: "Revit is not reachable: open a project in Revit with the Sportify add-in loaded." };
  }
}

function workspaceChanged() {
  workspaceState.stamp++;
  if (typeof activeMode !== "undefined" && activeMode === "deliverables") renderDeliverables();
  if (typeof renderAnalysisIfShowingResults === "function") renderAnalysisIfShowingResults();
  if (typeof updateRevitLayersUI === "function") updateRevitLayersUI();
}

async function workspaceRefresh() {
  const ws = await localApi("/workspace");
  const files = ws.ok ? await localApi("/deliverables") : { ok: false, json: null };      // not connected: one quiet question, not three
  const was = workspaceState.connected;
  workspaceState.connected = ws.ok;
  if (ws.ok && ws.json) {
    workspaceState.folder = ws.json.folder || "";
    workspaceState.defaultFolder = ws.json.default_folder || "";
    workspaceState.settingsFile = ws.json.settings_file || "";
    workspaceState.kinds = ws.json.kinds || [];
  }
  const nextFiles = files.ok && files.json ? files.json.files || [] : [];
  if (ws.ok) pullRevitConfig();
  const changed = was !== ws.ok || JSON.stringify(nextFiles) !== JSON.stringify(workspaceState.files) || JSON.stringify(ws.json && ws.json.kinds) !== JSON.stringify(workspaceState.kinds);
  workspaceState.files = nextFiles;
  if (was !== true && ws.ok) { workspaceState.draftSent = null; workspaceState.layoutId = null; }      // Revit was (re)started: it has lost the draft, send it again
  if (changed) workspaceChanged();
  if (was !== ws.ok && ws.ok) syncDraftLayout(true);
}

// ------------------------------------------------------------------------------------------------ what was decided in Revit

let lastConfigKey = "";

/**
 * The inputs the designer entered or accepted in Revit's assumptions window come into the app's own (Structure and Site conditions tabs), so nothing is typed twice.
 * Only where the app has no decision of its own yet: what was entered here is never overwritten.
 */
async function pullRevitConfig() {
  const r = await localApi("/analysis-config");
  if (!r.ok || !r.json || typeof assumptionDef !== "function") return;
  const decisions = r.json.decisions || [];
  const key = JSON.stringify(decisions);
  if (key === lastConfigKey) return;
  lastConfigKey = key;
  let applied = 0;
  decisions.forEach(d => {
    const def = assumptionDef(d.key);
    if (!def || assumptionState(d.key) !== "unconfirmed") return;
    if (d.state === "accepted") { setAssumptionAccepted(d.key, true); applied++; }
    else if (d.state === "entered") {
      const value = def.kind === "choice" ? d.value : parseAssumptionNumber(def, d.value);
      if (value === undefined || value === null || value === "") return;
      setAssumptionValue(d.key, value);
      applied++;
    }
  });
  if (!applied) return;
  if (typeof updateAssumptionsUI === "function") updateAssumptionsUI();
  if (typeof updateStructureStatus === "function") updateStructureStatus();
  if (typeof showToast === "function") showToast("Settings from Revit", `${applied} input${applied === 1 ? "" : "s"} you set in Revit's assumptions window ${applied === 1 ? "is" : "are"} now in the app.`);
}

// ------------------------------------------------------------------------------------------------ the layout, kept up to date

let draftSyncing = false;

/**
 * A layout's identity: the first 16 hex characters of the SHA-256 of the JSON text that is sent to the add-in. The add-in computes the same from the
 * bytes it receives (LayoutIdentity.cs) and stamps every analysis result with it, so a result can be told to belong to this layout or to an earlier one.
 * null where the browser has no crypto.subtle (it is there on localhost and https).
 */
async function layoutIdOf(text) {
  if (typeof crypto === "undefined" || !crypto.subtle || typeof TextEncoder === "undefined") return null;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(hash.slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

/** The JSON text of the layout on screen, as it is sent to the add-in; null when nothing is placed. */
function currentDraftBody() {
  if (typeof buildCombinedPayload !== "function" || typeof combineState === "undefined" || !combineState.items.length) return null;
  try { return JSON.stringify(buildCombinedPayload()); } catch (e) { return null; }
}

let lastIdentifiedBody;      // undefined until the first look

/** Keeps workspaceState.layoutIdNow the id of what is on screen, so the results that are about something else can be badged. Cheap when nothing changed. */
async function refreshLayoutIdNow() {
  const body = currentDraftBody();
  if (body === lastIdentifiedBody) return;
  lastIdentifiedBody = body;
  const id = body ? await layoutIdOf(body) : null;
  if (lastIdentifiedBody !== body || id === workspaceState.layoutIdNow) return;      // it changed again while hashing, or nothing new
  workspaceState.layoutIdNow = id;
  workspaceChanged();
}

/** Sends the layout to the add-in when it changed since the last time (or always when `force`). Silent when not connected or nothing is placed yet. */
async function syncDraftLayout(force) {
  if (draftSyncing || workspaceState.connected !== true) return false;
  const body = currentDraftBody();
  if (body === null) return false;
  if (!force && body === workspaceState.draftSent) return false;
  draftSyncing = true;
  try {
    const r = await localApi("/combined-layout?draft=1", { method: "POST", body, contentType: "application/json" });
    if (r.ok) {
      workspaceState.draftSent = body;
      workspaceState.layoutId = r.json && r.json.layout_id ? r.json.layout_id : await layoutIdOf(body);
    }
    return r.ok;
  } finally {
    draftSyncing = false;
  }
}

// ------------------------------------------------------------------------------------------------ the app's own exports

function triggerDownload(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "sportify_x.json" → "sportify_x_20260920_1432.json": in the folder every export is kept, so each gets its own name. */
function stampedName(name) {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}_${stamp}${name.slice(dot)}` : `${name}_${stamp}`;
}

function workspaceKindTitle(key) {
  const k = workspaceState.kinds.find(x => x.key === key);
  return k ? k.folder : key;
}

/**
 * Where an export goes: into the Sportify folder (its subfolder for `kind`) when the add-in is there, else the browser's download, as before.
 * Resolves to { kept, name, path }. `kept` is false when it was downloaded instead.
 */
async function deliverFile(kind, name, blob) {
  if (workspaceState.connected === true) {
    const saved = stampedName(name);
    const r = await localApi(`/deliverable?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(saved)}`, { method: "POST", body: blob, contentType: "application/octet-stream" });
    if (r.ok && r.json) {
      workspaceRefresh();
      if (typeof showToast === "function") showToast("Saved in your Sportify folder", `${workspaceKindTitle(kind)} → ${r.json.name}`);
      return { kept: true, name: r.json.name, path: r.json.path };
    }
    if (typeof showToast === "function") showToast("Not saved in the Sportify folder", (r.error || "The add-in refused the file.") + " Downloaded instead.");
  }
  triggerDownload(blob, name);
  return { kept: false, name, path: "" };
}

// ------------------------------------------------------------------------------------------------ commands

const WS_ACTIONS = {
  run: {
    label: "Run all physical analyses", done: "Analyses run", needsLayout: true,
    go: async () => {
      const r = await localApi("/run-analysis", { method: "POST" });
      if (!r.ok) return { ok: false, text: r.error };
      workspaceState.lastRun = r.json;
      if (typeof pollAnalysisResults === "function") await pollAnalysisResults();
      await loadCharts(true);
      const list = r.json.analyses || [];
      const failed = list.filter(a => !a.sent);
      const text = `${r.json.sent} of ${list.length} analyses ran and their results are on the Analysis tab.` + (failed.length ? " Not run: " + failed.map(a => `${a.title} (${a.problem || "no reason given"})`).join("; ") + "." : "");
      return { ok: failed.length === 0, text };
    }
  },
  pdf: {
    label: "Charts as PDF", needsLayout: true,
    go: async () => {
      const r = await localApi("/analysis-pdf", { method: "POST" });
      if (!r.ok) return { ok: false, text: r.error };
      await workspaceRefresh();
      return { ok: true, text: `Charts of ${(r.json.drawn || []).length} analyses saved.`, file: r.json };
    }
  },
  report: {
    label: "Analysis report (PDF)",
    go: async () => {
      const r = await localApi("/analysis-report", { method: "POST" });
      if (!r.ok) return { ok: false, text: r.error };
      await workspaceRefresh();
      return { ok: true, text: "Report saved" + (r.json.has_results ? "" : " (no analysis has been run yet, so it holds the layout only)") + ".", file: r.json };
    }
  },
  schedule: {
    label: "Schedule (CSV)", needsLayout: true,
    go: async () => {
      const r = await localApi("/schedule", { method: "POST" });
      if (!r.ok) return { ok: false, text: r.error };
      await workspaceRefresh();
      return { ok: true, text: `Schedule of ${r.json.rows} components saved.`, file: r.json };
    }
  },
  diagrams: {
    label: "Functional diagrams",
    go: async () => {
      const r = await localApi("/revit-command?name=diagrams", { method: "POST" });
      if (!r.ok) return { ok: false, text: r.error };
      setTimeout(workspaceRefresh, 6000);
      return { ok: true, text: "Revit is drawing the diagrams from its views; they appear in the Diagrams folder in a moment." };
    }
  },
  openFolder: {
    label: "Open folder", quiet: true,
    go: async btn => {
      const r = await localApi("/open-folder" + (btn && btn.dataset.kind ? "?kind=" + encodeURIComponent(btn.dataset.kind) : ""), { method: "POST" });
      return r.ok ? { ok: true, text: "" } : { ok: false, text: r.error };
    }
  }
};

function workspaceHasLayout() {
  return typeof combineState !== "undefined" && combineState.items.length > 0;
}

async function workspaceAction(name, btn) {
  const action = WS_ACTIONS[name];
  if (!action || workspaceState.busy[name]) return;
  if (workspaceState.connected !== true) {
    workspaceState.message = { tone: "bad", html: "Revit is not connected: open a project in Revit with the Sportify add-in loaded, then try again." };
    workspaceChanged();
    return;
  }
  if (action.needsLayout && !workspaceHasLayout()) {
    workspaceState.message = { tone: "bad", html: "Nothing is placed yet: put a sport, an activity or a garden piece on the roof in Combine first." };
    workspaceChanged();
    return;
  }
  workspaceState.busy[name] = true;
  workspaceState.message = null;
  workspaceChanged();
  let out;
  try {
    if (action.needsLayout) await syncDraftLayout(true);      // the add-in works on what is on screen right now
    out = await action.go(btn);
  } catch (e) {
    out = { ok: false, text: "Something went wrong: " + (e && e.message ? e.message : e) };
  }
  workspaceState.busy[name] = false;
  if (!action.quiet || !out.ok) {
    const link = out.file && out.file.url ? ` <a href="${wsEsc(SPORTIFY_LOCAL_URL + out.file.url)}" target="_blank" rel="noopener">${wsEsc(out.file.name)}</a>` : "";
    workspaceState.message = { tone: out.ok ? "ok" : "bad", html: `<strong>${wsEsc(action.label)}:</strong> ${wsEsc(out.text)}${link}` };
    if (typeof showToast === "function") showToast(out.ok ? (action.done || action.label) : action.label + " did not finish", out.text);
  }
  workspaceChanged();
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-ws-action]");
  if (btn) workspaceAction(btn.dataset.wsAction, btn);
});

// ------------------------------------------------------------------------------------------------ charts

/** Fetches the analyses' charts for the layout the add-in has. Skipped when they are current, unless forced. */
async function loadCharts(force) {
  if (workspaceState.chartsLoading || workspaceState.connected !== true || !workspaceHasLayout()) return;
  if (!force && workspaceState.chartsFor === workspaceState.draftSent && workspaceState.charts) return;
  workspaceState.chartsLoading = true;
  workspaceChanged();
  const r = await localApi("/charts");
  workspaceState.chartsLoading = false;
  workspaceState.chartsFor = workspaceState.draftSent;
  if (r.ok && r.json) { workspaceState.charts = r.json; workspaceState.chartsError = ""; }
  else workspaceState.chartsError = r.error;
  workspaceChanged();
}

/** Called by the Analysis groups when they open or redraw: loads the charts when the layout has changed since they were made. */
function ensureCharts() {
  if (workspaceState.connected === true && workspaceHasLayout() && !workspaceState.chartsLoading && workspaceState.chartsFor !== workspaceState.draftSent) loadCharts(false);
}

/** The charts for the analyses of one Analysis group (their result keys), as cards. Empty when there is nothing to say. */
function wsChartsHtml(keys) {
  if (workspaceState.connected !== true) return "";
  if (!workspaceHasLayout()) return "";
  if (workspaceState.chartsLoading && !workspaceState.charts) return `<p class="hint res-status"><span class="res-dot"></span> Drawing the charts...</p>`;
  if (workspaceState.chartsError && !workspaceState.charts) return `<p class="hint res-status"><span class="res-dot off"></span> The charts could not be drawn: ${wsEsc(workspaceState.chartsError)}</p>`;
  const charts = workspaceState.charts;
  if (!charts) return "";
  const wanted = (charts.sections || []).filter(s => keys.includes(s.key) && (s.charts || []).length);
  const skipped = (charts.skipped || []).filter(s => keys.some(k => (s.title || "").toLowerCase().replace(/[^a-z]/g, "") === (WS_TITLES[k] || "").toLowerCase().replace(/[^a-z]/g, "")));
  if (!wanted.length && !skipped.length) return "";
  const cards = wanted.map(s => `<section class="res-card tone-${s.preliminary ? "prelim" : "neutral"} ws-charts">
      <header class="res-head"><div><h3 class="res-title">${wsEsc(s.title)}: charts</h3>${s.headline ? `<div class="res-sub">${wsEsc(s.headline)}</div>` : ""}</div>
        <span class="res-chip tone-${s.preliminary ? "prelim" : "neutral"}">${s.preliminary ? "PRELIMINARY" : "charts"}</span></header>
      <div class="ws-chart-grid">${s.charts.map(c => `<figure class="ws-chart"><div class="ws-chart-svg" style="aspect-ratio:${c.aspect > 0 ? c.aspect : 2.5}">${c.svg}</div><figcaption>${wsEsc(c.caption)}</figcaption></figure>`).join("")}</div>
    </section>`).join("");
  const notes = skipped.map(s => `<p class="hint">${wsEsc(s.title)}: no charts, ${wsEsc(s.reason)}</p>`).join("");
  const redrawing = workspaceState.chartsLoading ? `<p class="hint res-status"><span class="res-dot"></span> Redrawing the charts for your latest changes...</p>` : "";
  const outOfDate = !workspaceState.chartsLoading && charts.layout_id && workspaceState.layoutIdNow && charts.layout_id !== workspaceState.layoutIdNow
    ? `<p class="hint res-status"><span class="res-dot stale"></span> These charts were drawn for an earlier layout than the one on screen; they are being redrawn.</p>` : "";
  return redrawing + outOfDate + cards + notes;
}

const WS_TITLES = { structural_loads: "Structural loads", dynamic_analysis: "Dynamic analysis", wind_erosion: "Wind and erosion", soil_percolation: "Rain and soil percolation", sun_and_shading: "Sun and shade" };

/** The Analysis tab's left-panel block: connection, the Run analysis button and what the last action said. */
function wsRunPanelHtml() {
  const on = workspaceState.connected === true;
  const running = !!workspaceState.busy.run;
  const noLayout = !workspaceHasLayout();
  const note = !on ? "Revit is not connected: the analysis runs inside the Revit add-in."
    : noLayout ? "Place something on the roof in Combine first: the analysis runs on the layout."
    : "Runs the physical analyses on the layout as it is now (your Structure and Site conditions inputs included) and brings the results and charts here.";
  return `<label>Run</label>
    <button class="btn-export primary ws-run-btn" data-ws-action="run" ${!on || noLayout || running ? "disabled" : ""}><i class="ti ${running ? "ti-loader-2 ws-spin" : "ti-player-play"}" aria-hidden="true"></i>${running ? "Running..." : "Run analysis"}</button>
    <p class="hint">${wsEsc(note)}</p>
    ${workspaceState.message ? `<p class="ws-message tone-${workspaceState.message.tone}">${workspaceState.message.html}</p>` : ""}`;
}

// ------------------------------------------------------------------------------------------------ the Deliverables tab

function wsEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function wsSize(bytes) {
  if (!(bytes >= 0)) return "";
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : bytes + " B";
}

function wsTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function wsActionButton(name, icon, title, sub, needsLayout) {
  const on = workspaceState.connected === true;
  const busy = !!workspaceState.busy[name];
  const disabled = !on || busy || (needsLayout && !workspaceHasLayout());
  const why = !on ? "Needs Revit open with the Sportify add-in." : needsLayout && !workspaceHasLayout() ? "Place something in Combine first." : "";
  return `<button class="deliverable-item" data-ws-action="${name}" ${disabled ? "disabled" : ""} ${why ? `title="${wsEsc(why)}"` : ""}>
    <i class="ti ${busy ? "ti-loader-2 ws-spin" : icon}" aria-hidden="true"></i><span>${wsEsc(title)}<small>${wsEsc(busy ? "Working..." : sub)}</small></span></button>`;
}

function renderDeliverables() {
  const status = document.getElementById("dl-status");
  if (!status) return;
  const on = workspaceState.connected === true;
  status.innerHTML = on
    ? `<span class="res-dot live"></span> Connected to Revit. Everything you export here is kept in <code>${wsEsc(workspaceState.folder)}</code>
        <button class="btn-export ws-inline-btn" data-ws-action="openFolder"><i class="ti ti-folder-open" aria-hidden="true"></i>Open folder</button>`
    : workspaceState.connected === false
      ? `<span class="res-dot off"></span> Revit is not connected. Exports download through the browser, and the analysis, PDF and schedule buttons wait for Revit (open a project with the Sportify add-in loaded). Your folder is created by the installer, by default <em>Documents\\Sportify Workspace</em>.`
      : `<span class="res-dot"></span> Looking for Revit...`;

  const actions = document.getElementById("dl-actions");
  if (actions) {
    actions.innerHTML = wsActionButton("run", "ti-player-play", "Run all physical analyses", "Structure, dynamics, wind, rain, sun", true)
      + wsActionButton("pdf", "ti-file-type-pdf", "Charts as PDF", "Every analysis's charts", true)
      + wsActionButton("report", "ti-report", "Analysis report", "All results, schedule, diagrams (PDF)", false)
      + wsActionButton("schedule", "ti-table", "Schedule", "Components and quantities (CSV)", true)
      + wsActionButton("diagrams", "ti-route", "Functional diagrams", "Circulation and axonometric, from Revit's views", false);
  }
  const message = document.getElementById("dl-message");
  if (message) message.innerHTML = workspaceState.message ? `<p class="ws-message tone-${workspaceState.message.tone}">${workspaceState.message.html}</p>` : "";

  const folders = document.getElementById("dl-folders");
  if (!folders) return;
  if (!on) {
    folders.innerHTML = `<p class="hint">The files Sportify has made appear here, one section per kind of deliverable, as soon as Revit is connected.</p>`;
    return;
  }
  folders.innerHTML = workspaceState.kinds.map(k => {
    const files = workspaceState.files.filter(f => f.kind === k.key);
    return `<section class="dl-folder">
      <header><div><h3>${wsEsc(k.title)}</h3><div class="hint">${wsEsc(k.hint)}</div></div>
        <button class="btn-export ws-inline-btn" data-ws-action="openFolder" data-kind="${wsEsc(k.key)}" title="Open ${wsEsc(k.folder)} in Explorer"><i class="ti ti-folder" aria-hidden="true"></i></button></header>
      ${files.length ? `<ul class="dl-files">${files.slice(0, 12).map(f => `<li><a href="${wsEsc(SPORTIFY_LOCAL_URL + f.url)}" target="_blank" rel="noopener">${wsEsc(f.name)}</a><span>${wsEsc(wsSize(f.size))} · ${wsEsc(wsTime(f.modified_utc))}</span></li>`).join("")}${files.length > 12 ? `<li class="hint">and ${files.length - 12} more in the folder</li>` : ""}</ul>` : `<p class="hint dl-empty">Nothing here yet.</p>`}
    </section>`;
  }).join("");
}

// ------------------------------------------------------------------------------------------------ start

workspaceRefresh();
setInterval(workspaceRefresh, WORKSPACE_POLL_MS);
refreshLayoutIdNow();
setInterval(() => { refreshLayoutIdNow(); syncDraftLayout(false); }, DRAFT_SYNC_MS);
