// Tests for sessionGate.js: the landing's three steps (preview / split / returning actions), the sample video
// (autoplay, its title-card skip, the play/pause toggle staying in sync with the real video), and "Link a Revit
// file" (browsing remembers a name only; picking the newest export fetches/filters/sorts/loads it).
// Run: node tools/session-gate-test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const web = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(web, f), "utf8");
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); };

function fakeElement() {
  const e = {
    innerHTML: "", textContent: "", value: "", title: "", hidden: true, style: {}, dataset: {}, handlers: {}, classes: new Set(), files: [],
    classList: null, setAttribute(k, v) { this[`attr_${k}`] = v; }, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, click() { (this.handlers.click || []).forEach(fn => fn()); }, getBoundingClientRect() { return {}; },
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
  };
  e.classList = { add: c => e.classes.add(c), remove: c => e.classes.delete(c), contains: c => e.classes.has(c), toggle(c, on) { if (on === undefined ? !e.classes.has(c) : on) e.classes.add(c); else e.classes.delete(c); } };
  return e;
}

/** A stand-in <video>: play()/pause() actually flip .paused and fire the same "play"/"pause" events a real one would, so gateSetVideoToggleIcon's own listeners (not just its two direct callers) are exercised the same way a browser would. The `once` option is not modelled — every test that needs loadedmetadata to fire only once already only fires it once itself. */
function fakeVideo(readyState) {
  const v = {
    _paused: true, currentTime: 0, duration: 24.5, readyState: readyState, handlers: {},
    addEventListener(t, fn) { (v.handlers[t] = v.handlers[t] || []).push(fn); },
    play() { v._paused = false; (v.handlers.play || []).slice().forEach(fn => fn()); return Promise.resolve(); },
    pause() { v._paused = true; (v.handlers.pause || []).slice().forEach(fn => fn()); },
    fireTimeupdate() { (v.handlers.timeupdate || []).slice().forEach(fn => fn()); },
    fireLoadedMetadata() { (v.handlers.loadedmetadata || []).slice().forEach(fn => fn()); },
  };
  Object.defineProperty(v, "paused", { get() { return v._paused; } });
  return v;
}

function page({ autosave = null, profile = null, reducedMotion = false, videoReadyState = 4, fetchImpl = null } = {}) {
  const els = {};
  // gateRevitBrowseMode's real markup carries no `hidden` attribute (it is the default panel) — gateSetRevitMode only
  // ever runs from a click, so this element's starting visibility is not sessionGate.js's own doing to fake here.
  els.gateRevitBrowseMode = fakeElement(); els.gateRevitBrowseMode.hidden = false;
  const video = fakeVideo(videoReadyState);
  const store = new Map();
  if (autosave) store.set("sportify-autosave", JSON.stringify(autosave));
  const goldbeck = { demo: { id: "demo", title: "Demo", tagline: "A stand-in preset for the test.", generate: () => ({ placements: [], entry_points: [] }) } };
  const calls = { applySessionSnapshot: [], showToast: [], setMode: [], localApi: [] };
  const idOf = { landingVideo: video };
  const sandbox = {
    console, JSON, Date, Number, Object, Array, Math, String, Promise, Map, Set, RegExp, Error, setTimeout, clearTimeout,
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    document: {
      getElementById: id => idOf[id] || (els[id] = els[id] || fakeElement()),
      querySelector: sel => (sel === ".session-gate-card" ? (els.__card = els.__card || fakeElement()) : null),
    },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    profileState: { profile },
    GOLDBECK_PREBUILT_SESSIONS: goldbeck,
    localApi: async (...a) => { calls.localApi.push(a[0]); return fetchImpl ? fetchImpl(...a) : { ok: false, status: 0, json: null, error: "not open" }; },
    applySessionSnapshot: (...a) => calls.applySessionSnapshot.push(a),
    showToast: (...a) => calls.showToast.push(a),
    setMode: (...a) => calls.setMode.push(a),
    combineState: { items: [1, 2] },
    profileLandingMode: () => "guide",
  };
  vm.createContext(sandbox);
  vm.runInContext(read("sessionGate.js"), sandbox, { filename: "sessionGate.js" });
  return { run: e => vm.runInContext(e, sandbox), els, video, calls, card: els.__card };
}

(async () => {
  // ---------------------------------------------------------------------------------------------------------------- the three steps
  {
    const p = page();
    check("a genuinely first visit opens on the preview step (not the split, not the actions), widened for it", p.els.landingPreviewStep.hidden === false && p.els.landingSplit.hidden === true && p.els.sessionGateMainActions.hidden === true && p.card.classes.has("session-gate-landing"));
    p.els["btn-gate-next"].click();
    check("'Next' moves to the split, hiding the preview", p.els.landingPreviewStep.hidden === true && p.els.landingSplit.hidden === false);
    p.els["btn-gate-split-back"].click();
    check("the split's 'Back' returns to the preview", p.els.landingPreviewStep.hidden === false && p.els.landingSplit.hidden === true);
    p.els["btn-gate-next"].click();
    p.els["btn-gate-returning"].click();
    check("'I've used Sportify before' opens the actions, narrowed back down, and pauses the video (nothing to lose, it has no audio)", p.els.landingSplit.hidden === true && p.els.sessionGateMainActions.hidden === false && !p.card.classes.has("session-gate-landing") && p.video.paused === true);
    p.els["btn-gate-returning-back"].click();
    check("the actions' 'Back' returns to the split (one step, not all the way to the preview)", p.els.landingSplit.hidden === false && p.els.landingPreviewStep.hidden === true);
  }
  {
    const p = page({ autosave: { placements: [1] } });
    check("a browser with an autosave skips straight to the actions — the marketing preview is never shown first", p.els.sessionGateMainActions.hidden === false && p.els.landingPreviewStep.hidden === true);
  }
  {
    const p = page({ profile: { onboarded: true, extras: [] } });
    check("...and so does one whose profile the quiz already set up, even with no autosave at all", p.els.sessionGateMainActions.hidden === false);
  }
  {
    const p = page();
    p.run("reopenSessionGate()");
    check("reopenSessionGate() (the top bar's 'New Session', mid-session) also goes straight to the actions, never the marketing preview a returning session does not need", p.els.sessionGateMainActions.hidden === false && p.els.landingPreviewStep.hidden === true);
  }
  {
    // the inline-style conflict this file itself warns about: Goldbeck presets toggles gateMainActionsEl.style.display directly
    const p = page();
    p.els["btn-gate-next"].click(); p.els["btn-gate-returning"].click();
    p.els["btn-gate-presets"].click();          // sets style.display = "none" directly
    p.els["btn-gate-presets-back"].click();     // sets style.display = "flex" directly — actions.hidden is still false throughout, unaffected
    p.els["btn-gate-returning-back"].click();   // back to the split: must actually hide, despite that leftover inline style
    check("a later step-change still hides the actions even after the Goldbeck-presets sub-panel has set its own inline style.display on it", p.els.sessionGateMainActions.hidden === true);
  }
  {
    const p = page();
    p.run('leaveSessionGate = () => { leftGate = true; }; quizOpen = () => { quizOpened = true; };');
    p.els["btn-gate-onboard"].click();
    await new Promise(r => setTimeout(r, 320));
    check("'New to Sportify' leaves the gate and opens the quiz directly (not the conditional quizMaybeOpen) — an explicit ask, so it opens even for a profile the quiz has already met", p.run("leftGate") === true && p.run("quizOpened") === true);
  }

  // ---------------------------------------------------------------------------------------------------------------- the sample video
  {
    const p = page({ videoReadyState: 4 });   // metadata already there (HAVE_METADATA) before the script even runs
    check("with metadata already loaded, the title card is skipped immediately (no need to wait for loadedmetadata)", p.video.currentTime === 2);
    check("autoplay is attempted (no prefers-reduced-motion) and the toggle icon reflects it playing", p.video.paused === false && p.els["btn-landing-video-toggle"].innerHTML.includes("pause-filled"));
  }
  {
    const p = page({ videoReadyState: 0 });   // metadata not loaded yet — the listener path
    check("nothing seeked yet — still waiting for loadedmetadata", p.video.currentTime === 0);
    p.video.fireLoadedMetadata();
    check("once metadata arrives, the title card is skipped the same way", p.video.currentTime === 2);
  }
  {
    const p = page({ reducedMotion: true });
    check("prefers-reduced-motion: the video is paused, not autoplayed, and the toggle says so", p.video.paused === true && p.els["btn-landing-video-toggle"].innerHTML.includes("play-filled"));
    p.els["btn-landing-video-toggle"].click();
    check("the toggle button still starts it on request", p.video.paused === false);
  }
  {
    const p = page();
    // simulate the native `loop` attribute restarting playback at 0 partway through
    p.video.currentTime = 10; p.video.fireTimeupdate();
    p.video.currentTime = 0; p.video.fireTimeupdate();      // a loop just restarted
    check("a loop restart (currentTime jumping backwards) skips the title card again, not just on the very first play", p.video.currentTime === 2);
  }
  {
    const p = page();
    p.video.pause();      // simulate the browser silently blocking/stopping autoplay on its own, not through the toggle button
    check("the toggle reflects a pause that did not come from either of its own two triggers (the video's own event, not a stale assumption)", p.els["btn-landing-video-toggle"].innerHTML.includes("play-filled"));
    p.video.play();
    check("...and a resume the same way", p.els["btn-landing-video-toggle"].innerHTML.includes("pause-filled"));
  }

  // ---------------------------------------------------------------------------------------------------------------- Link a Revit file
  {
    const p = page();
    check("starts on 'Browse', nothing linked yet: the button invites linking, no status line", p.els.gateRevitBrowseMode.hidden === false && p.els.gateRevitNewestMode.hidden === true && p.els["btn-gate-link-revit"].innerHTML.includes("Link a Revit file") && p.els.sessionGateRevitLinkStatus.hidden === true);
    p.els["btn-gate-revit-mode-newest"].click();
    check("the toggle switches panels and marks the active tab", p.els.gateRevitBrowseMode.hidden === true && p.els.gateRevitNewestMode.hidden === false && p.els["btn-gate-revit-mode-newest"].classes.has("active") && !p.els["btn-gate-revit-mode-browse"].classes.has("active"));
    p.els["btn-gate-revit-mode-browse"].click();
    check("...and back", p.els.gateRevitBrowseMode.hidden === false && p.els["btn-gate-revit-mode-browse"].classes.has("active"));
  }
  {
    const p = page();
    p.els["gate-revit-file"].files = [{ name: "GoldbeckRoof.rvt", size: 58 * 1048576 }];
    p.els["gate-revit-file"].handlers.change.forEach(fn => fn({ target: p.els["gate-revit-file"] }));
    check("picking a file remembers its name and size only — never a path (no browser gives a page one)", JSON.parse(p.run('localStorage.getItem("sportify-linked-revit-file")')).name === "GoldbeckRoof.rvt" && !/[a-zA-Z]:\\|\/home\/|\/Users\//.test(p.els.sessionGateRevitLinkStatus.textContent));
    check("the status line names the file, its size in MB, and says plainly why that is all it can ever be", p.els.sessionGateRevitLinkStatus.textContent === "Linked: GoldbeckRoof.rvt (58.0 MB) — remembered by name only; browsers never give a page a file's real location." && p.els.sessionGateRevitLinkStatus.hidden === false);
    check("the button now offers to change it, not link one for the first time", p.els["btn-gate-link-revit"].innerHTML.includes("Change the linked Revit file"));
  }
  {
    const p = page();
    p.els["gate-revit-file"].files = [];      // the picker was cancelled — no file chosen
    p.els["gate-revit-file"].handlers.change.forEach(fn => fn({ target: p.els["gate-revit-file"] }));
    check("cancelling the picker leaves nothing linked", p.els.sessionGateRevitLinkStatus.hidden === true);
  }
  {
    const p = page({ profile: { onboarded: true } });
    p.run('localStorage.setItem("sportify-linked-revit-file", "not json at all")');
    check("a corrupted stored value is read as 'nothing linked', never thrown", p.run("gateLinkedRevitFile()") === null);
  }

  // ---------------------------------------------------------------------------------------------------------------- Pick the newest export
  {
    const files = [
      { kind: "layouts", name: "sportify_combined_revit.json", modified_utc: "2026-01-01T00:00:00Z", url: "/deliverable?kind=layouts&name=sportify_combined_revit.json" },
      { kind: "layouts", name: "sportify_combined_revit_20260115.json", modified_utc: "2026-01-15T00:00:00Z", url: "/deliverable?kind=layouts&name=sportify_combined_revit_20260115.json" },
      { kind: "layouts", name: "not_a_layout.json", modified_utc: "2026-02-01T00:00:00Z", url: "/x" },
      { kind: "sport", name: "sportify_combined_revit_ignored.json", modified_utc: "2026-03-01T00:00:00Z", url: "/x" },
    ];
    const p = page({
      fetchImpl: async pathArg => {
        if (pathArg === "/deliverables") return { ok: true, status: 200, json: { files } };
        if (pathArg === files[1].url) return { ok: true, status: 200, json: { version: "1.0", placements: [1, 2, 3] } };
        return { ok: false, status: 404, json: null, error: "not found" };
      }
    });
    const found = await p.run("gateNewestExport()");
    check("finds only real layout exports (not another kind, not a differently-named .json), and picks the newest by modified_utc, not by name", found.file.name === "sportify_combined_revit_20260115.json");
    p.els["btn-gate-load-newest-export"].click();
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    check("loads it through the same applySessionSnapshot every other load path uses, and tells the person", p.calls.applySessionSnapshot.length === 1 && p.calls.applySessionSnapshot[0][0].placements.length === 3 && p.calls.showToast.length === 1);
  }
  {
    const p = page({ fetchImpl: async () => ({ ok: false, status: 0, json: null, error: "" }) });
    p.els["btn-gate-load-newest-export"].click();
    await new Promise(r => setImmediate(r));
    check("Revit not reachable: a plain 'Revit not open' message, not a stack trace", /Revit not open/.test(p.els.sessionGateNewestExportStatus.textContent));
  }
  {
    const p = page({ fetchImpl: async pathArg => (pathArg === "/deliverables" ? { ok: true, status: 200, json: { files: [] } } : { ok: false }) });
    p.els["btn-gate-load-newest-export"].click();
    await new Promise(r => setImmediate(r));
    check("connected, but nothing in the Layouts folder yet: says so, names Export Combined JSON", /No export in the Layouts folder/.test(p.els.sessionGateNewestExportStatus.textContent));
  }
  {
    const files = [{ kind: "layouts", name: "sportify_combined_revit.json", modified_utc: "2026-01-01T00:00:00Z", url: "/x" }];
    const p = page({ fetchImpl: async pathArg => (pathArg === "/deliverables" ? { ok: true, status: 200, json: { files } } : { ok: false, status: 500, json: null, error: "server error" }) });
    p.els["btn-gate-load-newest-export"].click();
    await new Promise(r => setImmediate(r));
    check("found it, but couldn't actually read it: says which file and why, does not pretend to have loaded it", /Couldn.t read sportify_combined_revit\.json.*server error/.test(p.els.sessionGateNewestExportStatus.textContent) && p.calls.applySessionSnapshot.length === 0);
  }
  {
    const files = [{ kind: "layouts", name: "sportify_combined_revit.json", modified_utc: "2026-01-01T00:00:00Z", url: "/x" }];
    const p = page({ fetchImpl: async pathArg => (pathArg === "/deliverables" ? { ok: true, status: 200, json: { files } } : { ok: true, status: 200, json: { not_a_real: "layout" } }) });
    p.run('applySessionSnapshot = () => { throw new Error("bad layout shape"); };');
    p.els["btn-gate-load-newest-export"].click();
    await new Promise(r => setImmediate(r));
    check("a reply that parses as JSON but is not a session applySessionSnapshot can use: the load failure is shown, not silently swallowed", /Load failed: bad layout shape/.test(p.els.sessionGateNewestExportStatus.textContent));
  }

  console.log(fails === 0 ? "\nSESSION GATE OK" : `\n${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
})();
