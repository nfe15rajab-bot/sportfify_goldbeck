/**
 * combineController.js — Combine mode controller
 * The board itself: item state, wizard steps, suggestions, design-rule
 * bindings, auto-arrange, manual Revit import, and the Combined JSON
 * export that feeds the Revit add-in. Split out of main.js since Combine
 * mode is the largest single mode by far.
 */

const combineState = {
  roof: { length: 15, width: 10, boundary: null, originXm: 0, originYm: 0 },
  items: [], entryPoints: [], selectedId: null, selectedKind: null, tool: null,
  suggestions: [],
  // Pushed-but-not-yet-placed pieces — a "Push to Combine" click lands here
  // first (mini-game inventory tray, rendered beside the roof canvas), not
  // directly on the roof. Dragging a thumbnail out onto the canvas is what
  // actually adds it to `items`. See placeTrayItemAt() below and
  // initTrayDragInteractions() (combineField.js).
  tray: [],
};
let combineItemCounter = 0;

/**
 * Set only by loading one of the Goldbeck IFC roof prebuilt sessions
 * (sessionGate.js), cleared by any other load or Clear All — lets
 * compareController.js show Compare results for this session's actual
 * roof/layout variants instead of its generic 25x20m demo configs.
 */
let activeGoldbeckPresetId = null;

function updateGoldbeckShuffleVisibility() {
  const section = document.getElementById("goldbeck-shuffle-section");
  if (section) section.style.display = activeGoldbeckPresetId ? "block" : "none";
}

/**
 * Regenerates the currently active Goldbeck pattern (fresh boundary depth
 * + item variety, re-validated against the app's own real engine inside
 * generate() itself — see prebuiltSessions.js) and applies it live, same
 * path a gate-picker load takes. Only meaningful while a Goldbeck preset
 * is active; the button that calls this is hidden otherwise.
 */
function shuffleGoldbeckBoundary() {
  if (!activeGoldbeckPresetId || typeof GOLDBECK_PREBUILT_SESSIONS !== "object") return;
  const preset = GOLDBECK_PREBUILT_SESSIONS[activeGoldbeckPresetId];
  if (!preset) return;
  const payload = preset.generate();
  applySessionSnapshot(payload, { goldbeckPresetId: activeGoldbeckPresetId });
  showToast("Boundary shuffled", `${payload.placements.length} piece(s) — re-checked against every rule.`);
}
document.getElementById("btn-shuffle-boundary")?.addEventListener("click", shuffleGoldbeckBoundary);

/**
 * ── Combine wizard: step-by-step panel navigation ──
 * The DOM itself is the source of truth for which step is showing (each
 * step's hidden attribute), so nothing needs to re-sync this on mode
 * switches — the panel is left exactly as the user left it.
 */
const WIZARD_STEPS = 3; // Site moved out to its own top-level mode (see index.html/main.js) — wizard is now Rules/Arrange/Review
let combineWizardStep = 1;
const wizardStepsVisited = new Set([1]);

function setWizardStep(n) {
  combineWizardStep = Math.max(1, Math.min(WIZARD_STEPS, n));
  wizardStepsVisited.add(combineWizardStep);
  document.querySelectorAll(".wizard-step-content").forEach(el => {
    const isCurrent = Number(el.dataset.stepContent) === combineWizardStep;
    el.hidden = !isCurrent;
    if (isCurrent) {
      // Restart the fade-in on every step change, not just first reveal —
      // same reflow trick used for the rules panel / score badge pops.
      el.classList.remove("step-enter");
      void el.offsetWidth;
      el.classList.add("step-enter");
    }
  });
  document.querySelectorAll(".wizard-step-btn").forEach(btn => {
    const step = Number(btn.dataset.step);
    btn.classList.toggle("active", step === combineWizardStep);
    btn.classList.toggle("visited", wizardStepsVisited.has(step) && step !== combineWizardStep);
  });
  document.getElementById("wizard-back").style.display = combineWizardStep === 1 ? "none" : "flex";
  document.getElementById("wizard-next").style.display = combineWizardStep === WIZARD_STEPS ? "none" : "flex";
}

document.getElementById("wizard-nav").addEventListener("click", e => {
  const btn = e.target.closest(".wizard-step-btn");
  if (btn) setWizardStep(Number(btn.dataset.step));
});
document.getElementById("wizard-back").addEventListener("click", () => setWizardStep(combineWizardStep - 1));
document.getElementById("wizard-next").addEventListener("click", () => setWizardStep(combineWizardStep + 1));
setWizardStep(1);

/** Pushed pieces land in the tray, not on the roof — see combineState.tray above. */
function addCombineItem({ kind, label, length_m, width_m, sourceJson }) {
  const index = combineItemCounter++;
  const item = {
    id: `item_${Date.now()}_${index}`, kind, label, length_m: Number(length_m), width_m: Number(width_m), rotation: 0,
    sourceJson,
  };
  combineState.tray.push(item);
  if (typeof renderCombineTray === "function") renderCombineTray();
  return item;
}

function removeFromTray(id) {
  combineState.tray = combineState.tray.filter(it => it.id !== id);
  if (typeof renderCombineTray === "function") renderCombineTray();
}

/** Moves one tray item onto the roof at (x_m, y_m) — the drop side of drag-from-tray (initTrayDragInteractions, combineField.js). */
function placeTrayItemAt(id, x_m, y_m) {
  const idx = combineState.tray.findIndex(it => it.id === id);
  if (idx === -1) return;
  const [item] = combineState.tray.splice(idx, 1);
  item.x_m = x_m;
  item.y_m = y_m;
  combineState.items.push(item);
  combineState.selectedId = item.id;
  combineState.selectedKind = "item";
  if (typeof renderCombineTray === "function") renderCombineTray();
  if (typeof refreshSuggestions === "function") refreshSuggestions(); else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
}

function updateCombineUI() {
  document.getElementById("field-label").textContent = "Combine — roof layout";
  document.getElementById("norm-badge").textContent  = "Prototype";
  // Site (map/orientation/sun) moved out to its own top-level mode — see
  // main.js's isSite branch — so this no longer touches initSiteMap().
  if(typeof drawCombineCanvas === "function") drawCombineCanvas();
  if(typeof refreshSuggestions === "function") refreshSuggestions();
  if(typeof renderIterationsPanels === "function") renderIterationsPanels();
}

/** Recomputes suggested spots for whichever item is currently selected (none selected → empty list), then redraws. */
function refreshSuggestions() {
  const item = combineState.selectedKind === "item" ? combineState.items.find(i => i.id === combineState.selectedId) : null;
  combineState.suggestions = item && typeof suggestPositionsForItem === "function" ? suggestPositionsForItem(item, combineState, DESIGN_RULES, 1) : [];
  if (typeof drawCombineCanvas === "function") drawCombineCanvas();
}

function applySuggestion(index) {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  const cand = combineState.suggestions[index];
  if (!item || !cand) return;
  // Rotation swaps the rendered footprint immediately (animateItemsTo only
  // tweens x/y), then the move itself eases into place — same tween used
  // for auto-arrange, so applying a suggestion reads as a deliberate slide
  // rather than a jump-cut.
  item.rotation = cand.rotation;
  animateItemsTo(new Map([[item.id, { x: cand.x_m, y: cand.y_m }]]), () => {
    refreshSuggestions();
    showToast("Suggestion applied", cand.reason);
  });
}

/**
 * Raises DESIGN_RULES to at least the area-aware recommendation (never
 * lowers a value the planner already set higher) and reflects the new
 * values in the rule inputs immediately — same pattern as any other
 * DESIGN_RULES mutation in this file.
 */
function applySmartRuleRecommendation(rec) {
  DESIGN_RULES.minEntryPoints = Math.max(DESIGN_RULES.minEntryPoints, rec.minEntryPoints);
  DESIGN_RULES.circulationWidth_m = Math.max(DESIGN_RULES.circulationWidth_m, rec.circulationWidth_m);
  document.getElementById("ruleMinEntries").value = DESIGN_RULES.minEntryPoints;
  document.getElementById("ruleCirculationWidth").value = DESIGN_RULES.circulationWidth_m;
  if (typeof refreshSuggestions === "function") refreshSuggestions();
  else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  showToast("Smart rules applied", `Circulation width and minimum entries raised for ~${rec.totalAreaM2} m² programmed.`);
}

document.getElementById("roofLength").addEventListener("input", e => { combineState.roof.length = Number(e.target.value) || 1; combineState.roof.boundary = null; combineState.roof.originXm = 0; combineState.roof.originYm = 0; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });
document.getElementById("roofWidth").addEventListener("input", e => { combineState.roof.width = Number(e.target.value) || 1; combineState.roof.boundary = null; combineState.roof.originXm = 0; combineState.roof.originYm = 0; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });

// Manual Revit Import
document.getElementById("btn-import-revit").addEventListener("click", () => { document.getElementById("import-revit-file").click(); });

document.getElementById("import-revit-file").addEventListener("change", e => {
  const file = e.target.files[0];
  const statusEl = document.getElementById("import-revit-status");
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      const roof = data.roof;
      combineState.roof.length = roof.length_m;
      combineState.roof.width  = roof.width_m;
      combineState.roof.boundary = roof.boundary_m || null;
      combineState.roof.originXm = roof.origin_x_m ?? 0;
      combineState.roof.originYm = roof.origin_y_m ?? 0;
      document.getElementById("roofLength").value = roof.length_m;
      document.getElementById("roofWidth").value  = roof.width_m;

      if(statusEl) statusEl.textContent = `Imported ${roof.length_m}m × ${roof.width_m}m from Revit.`;
      if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas();
    } catch (err) {
      if(statusEl) statusEl.textContent = `Import failed: ${err.message}`;
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // Fix: allows re-importing the same file
});

document.getElementById("btn-rotate").addEventListener("click", () => {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  if (item) { item.rotation = (item.rotation + 90) % 180; if(typeof drawCombineCanvas === "function") drawCombineCanvas(); }
});
function deleteSelectedEntity() {
  if (!combineState.selectedId) return;
  if (combineState.selectedKind === "entry") {
    combineState.entryPoints = combineState.entryPoints.filter(e => e.id !== combineState.selectedId);
  } else {
    combineState.items = combineState.items.filter(i => i.id !== combineState.selectedId);
  }
  combineState.selectedId = null;
  combineState.selectedKind = null;
  if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas();
}
document.getElementById("btn-remove-selected").addEventListener("click", deleteSelectedEntity);

/**
 * Delete/Backspace removes whatever's currently selected on the Combine
 * canvas — only while actually in Combine mode and not while the user is
 * typing in some other field (a text input's own Backspace must keep
 * editing text, not delete a piece three tabs away).
 */
document.addEventListener("keydown", e => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (typeof activeMode !== "undefined" && activeMode !== "combine") return;
  if (!combineState.selectedId) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
  e.preventDefault();
  deleteSelectedEntity();
});
document.getElementById("btn-clear-all").addEventListener("click", () => { combineState.items = []; combineState.tray = []; combineState.selectedId = null; combineState.selectedKind = null; activeGoldbeckPresetId = null; updateGoldbeckShuffleVisibility(); if(typeof resetCombineView === "function") resetCombineView(); if(typeof renderCombineTray === "function") renderCombineTray(); if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });

function autoPlace(direction) {
  if (combineState.selectedKind !== "item") return;
  const item = combineState.items.find(i => i.id === combineState.selectedId);
  if (!item) return;
  const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };
  switch (direction) {
    case "left":   item.x_m = 0; break;
    case "right":  item.x_m = Math.max(0, combineState.roof.length - fp.w); break;
    case "front":  item.y_m = Math.max(0, combineState.roof.width - fp.h); break;
    case "behind": item.y_m = 0; break;
  }
  if(typeof drawCombineCanvas === "function") drawCombineCanvas();
}
document.getElementById("btn-auto-left").addEventListener("click", () => autoPlace("left"));
document.getElementById("btn-auto-right").addEventListener("click", () => autoPlace("right"));
document.getElementById("btn-auto-front").addEventListener("click", () => autoPlace("front"));
document.getElementById("btn-auto-behind").addEventListener("click", () => autoPlace("behind"));

/* ── Entry point tool ── */
document.getElementById("btn-add-entry").addEventListener("click", () => {
  combineState.tool = combineState.tool === "addEntry" ? null : "addEntry";
  syncAddEntryTool();
});

/* ── Design rules panel — planner tunes the thresholds, client sees them applied (inputs disabled via setRole) ── */
function bindRuleInput(id, key, parse) {
  document.getElementById(id).addEventListener("input", e => {
    const v = (parse || Number)(e.target.value);
    if (!Number.isFinite(v) || v < 0) return;
    DESIGN_RULES[key] = v;
    if (activeMode !== "combine") return;
    if (typeof refreshSuggestions === "function") refreshSuggestions();
    else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  });
}
bindRuleInput("ruleClearance", "clearance_m");
bindRuleInput("ruleSetback", "boundarySetback_m");
bindRuleInput("ruleCirculationWidth", "circulationWidth_m");
bindRuleInput("ruleMinEntries", "minEntryPoints", v => Math.max(1, Math.round(Number(v))));
bindRuleInput("ruleQuietBuffer", "quietBufferM");

/* ── Generate Layout: rule-based auto-arrange, tweened into place ── */
function animateItemsTo(placements, onDone) {
  const items = combineState.items.filter(it => placements.has(it.id));
  if (items.length === 0) { if (onDone) onDone(); return; }
  const from = new Map(items.map(it => [it.id, { x: it.x_m, y: it.y_m }]));
  const duration = 500;
  const start = performance.now();
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    items.forEach(it => {
      const f = from.get(it.id), to = placements.get(it.id);
      it.x_m = Math.round((f.x + (to.x - f.x) * k) * 10) / 10;
      it.y_m = Math.round((f.y + (to.y - f.y) * k) * 10) / 10;
    });
    if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    if (t < 1) requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

document.getElementById("btn-auto-arrange").addEventListener("click", () => {
  // Auto-arrange is a "place everything the smart way" action, so it also
  // drains the tray — otherwise a full tray would make this button useless
  // the moment the tray/drag workflow is in play. Placeholder (0,0) is
  // immediately overwritten by ruleBasedArrange's own placement below.
  if (combineState.tray.length > 0) {
    combineState.tray.forEach(it => { it.x_m = 0; it.y_m = 0; combineState.items.push(it); });
    combineState.tray = [];
    if (typeof renderCombineTray === "function") renderCombineTray();
  }
  if (combineState.items.length === 0) { showToast("Nothing to arrange", "Push a sport, activity, or garden piece first."); return; }

  const { placements, unplaced } = ruleBasedArrange(combineState, DESIGN_RULES);

  animateItemsTo(placements, () => {
    // animateItemsTo's own frame loop already redraws every tick, but it
    // never recomputes combineState.suggestions — refresh once here so a
    // stale candidate list doesn't linger after positions moved.
    if (typeof refreshSuggestions === "function") refreshSuggestions();
    if (unplaced.length > 0) {
      showToast("Layout generated", `${unplaced.length} piece(s) didn't fit their zone — try a larger site or fewer pieces.`);
      return;
    }
    const overlaps = findOverlappingIds(combineState.items, DESIGN_RULES.clearance_m);
    const circulation = computeCirculation(combineState, DESIGN_RULES);
    const allGood = overlaps.size === 0 && circulation.unreachable.size === 0 && combineState.entryPoints.length >= DESIGN_RULES.minEntryPoints;
    if (allGood) {
      showToast("Layout generated 🎉", "All rules satisfied — sports and gardens arranged with clear circulation.");
      if (typeof spawnConfetti === "function") spawnConfetti();
    } else if (combineState.entryPoints.length < DESIGN_RULES.minEntryPoints) {
      showToast("Layout generated", "Add an entry point so circulation can be checked.");
    } else {
      showToast("Layout generated", "Some rules still need attention — check the checklist below.");
    }
  });
});

/**
 * Builds the exact same payload the Combine JSON export downloads —
 * pulled into its own function so the manual export button and the
 * localStorage autosave below share one construction, rather than two
 * copies that could drift apart. This is also, deliberately, the one and
 * only "session save" format: it already carries the roof, design rules,
 * entry points, site location and every placement's full parameters, so
 * loading it back in via applySessionSnapshot() needs no separate save
 * format of its own.
 */
function buildCombinedPayload() {
  const placements = combineState.items.map(item => {
    const fp = typeof getFootprint === "function" ? getFootprint(item) : { w: item.length_m, h: item.width_m };

    return {
      id: item.id,
      category: item.kind, // "field", "activity", or "garden"
      label: item.label,

      // Revit Family placement is usually easiest via the Center Point
      insertion_point: {
        center_x_m: item.x_m + (fp.w / 2),
        center_y_m: item.y_m + (fp.h / 2)
      },

      // Bounding box (Top-Left origin, Web Canvas space)
      bounding_box: {
        top_left_x_m: item.x_m,
        top_left_y_m: item.y_m,
        width_m: fp.w,
        height_m: fp.h
      },

      transform: {
        rotation_deg: item.rotation
      },

      // Deep parameters mapped from the sidebars
      parameters: item.sourceJson
    };
  });

  // Same grid+BFS pass the canvas already draws from (computeCirculation is
  // pure/cheap to call again here) — so the exported paths are exactly what
  // the marching-ants show, not a re-derived approximation.
  const circulation = computeCirculation(combineState, DESIGN_RULES);

  const payload = {
    version: "1.3",
    generator: "Sportify-Combine",
    roof_context: {
      length_m: combineState.roof.length,
      width_m: combineState.roof.width,
      source_boundary_polygon: combineState.roof.boundary || null,
      // World-space position (meters) of this roof's real origin in the
      // Revit project — lets an import command translate placements onto
      // the actual pushed element instead of world (0,0). Both 0 if the
      // roof was set manually rather than pushed from Revit.
      world_origin_x_m: combineState.roof.originXm || 0,
      world_origin_y_m: combineState.roof.originYm || 0
    },
    // The five planner-tunable thresholds, so a Revit import can draw the
    // same setback inset the canvas shows (as a simple rectangle inset,
    // same approximation setbackGuideSvg already uses for a polygon roof).
    design_rules: {
      clearance_m: DESIGN_RULES.clearance_m,
      boundary_setback_m: DESIGN_RULES.boundarySetback_m,
      circulation_width_m: DESIGN_RULES.circulationWidth_m,
      min_entry_points: DESIGN_RULES.minEntryPoints,
      quiet_buffer_m: DESIGN_RULES.quietBufferM
    },
    entry_points: combineState.entryPoints.map(ep => ({
      x_m: ep.x_m, y_m: ep.y_m, edge: ep.edge
    })),
    circulation_paths: circulation.paths.map(p => ({
      item_id: p.itemId,
      points_m: p.points.map(pt => ({ x_m: pt.x, y_m: pt.y }))
    })),
    // Same lat/lon/date/time the Site tab's sun compass already uses (v.
    // siteState in siteController.js, fed by siteField.js's address
    // search/browser geolocation) — lets a Revit import set the project's
    // real-world location and sun date/time instead of Revit's generic
    // defaults.
    site_location: (siteState.lat != null && siteState.lng != null) ? {
      latitude_deg: siteState.lat,
      longitude_deg: siteState.lng,
      place_name: siteState.address || null,
      date: siteState.date,
      time: siteState.time
    } : null,
    placements
  };

  return payload;
}

/**
 * Shared by the Combine wizard's own "Export Combined JSON" button and the
 * always-visible top-bar save button (added so saving doesn't require
 * navigating to Combine's last step first) — one download path, not two
 * that could drift apart.
 */
function downloadCombinedSession() {
  if (combineState.items.length === 0) {
    showToast("Nothing to save yet", "Push a sport, activity, or garden piece to Combine first.");
    return;
  }
  const payload = buildCombinedPayload();

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sportify_combined_revit.json`;
  a.click();
  URL.revokeObjectURL(a.href);

  // Best-effort live push to Revit's Auto Import toggle — same
  // fire-and-forget style as the rest of the Revit bridge in this file.
  // Revit not running (or the add-in not loaded) just means this silently
  // fails; the local download above already succeeded either way.
  fetch(REVIT_COMBINED_LAYOUT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});

  showToast("Session saved", "Downloaded — load it back in anytime to pick up exactly where you left off.");
}

document.getElementById("btn-combine-json").addEventListener("click", downloadCombinedSession);

/**
 * Rasterizes the current #combine-canvas SVG to a PNG — a real graphic
 * deliverable (Overview's Deliverables section links here), not just the
 * JSON/DXF data exports. Safe to canvas.toBlob() because the SVG is fully
 * self-contained (no external <image>/<use> references that would taint
 * the canvas). Doubles the 600x400 viewBox for a crisper download than a
 * 1:1 screenshot would give.
 */
function downloadCombineRoofPng() {
  if (combineState.items.length === 0) {
    showToast("Nothing to export yet", "Place at least one piece on the roof first.");
    return;
  }
  const svg = document.getElementById("combine-canvas");
  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = typeof isDarkMode === "function" && isDarkMode() ? "#12131c" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sportify_combine_roof.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  img.onerror = () => { URL.revokeObjectURL(url); showToast("PNG export failed", "Couldn't rasterize the roof canvas."); };
  img.src = url;
}
document.getElementById("btn-combine-png")?.addEventListener("click", downloadCombineRoofPng);

// Overview's own "Save Session" tab twin of the above — same action,
// reachable without navigating to Combine's last wizard step first.
document.getElementById("btn-overview-save")?.addEventListener("click", downloadCombinedSession);

/**
 * Pushes the current layout into Compare's rolling 3-slot buffer
 * (saveConfigToCompare, compareController.js) and jumps straight to
 * Compare so the save is immediately visible — "auto pushed to compare".
 */
document.getElementById("btn-save-compare")?.addEventListener("click", () => {
  if (combineState.items.length === 0) {
    showToast("Nothing to save yet", "Push a sport, activity, or garden piece to Combine first.");
    return;
  }
  if (typeof saveConfigToCompare !== "function") return;
  const payload = buildCombinedPayload();
  saveConfigToCompare(payload);
  showToast("Saved for Compare", "This layout is now in Compare — up to 3 saved configs at a time, oldest replaced first.");
  setMode("compare");
});

/**
 * Reverses buildCombinedPayload() back into combineState/DESIGN_RULES/
 * siteState — the export already carries everything needed:
 * bounding_box + transform.rotation_deg fully determine the original
 * pre-rotation length_m/width_m the same way getFootprint() derives the
 * opposite direction, so "load progress" needs no separate save format,
 * just this function plus a file input.
 */
function applySessionSnapshot(payload, opts = {}) {
  if (!payload || !Array.isArray(payload.placements)) {
    throw new Error('Not a Sportify Combine export — no "placements" array found.');
  }
  activeGoldbeckPresetId = opts.goldbeckPresetId || null;
  updateGoldbeckShuffleVisibility();
  combineState.tray = []; // a loaded session only ever describes placed pieces — any leftover tray items wouldn't belong to this session
  if (typeof resetCombineView === "function") resetCombineView();

  const rc = payload.roof_context || {};
  combineState.roof.length = rc.length_m ?? combineState.roof.length;
  combineState.roof.width = rc.width_m ?? combineState.roof.width;
  combineState.roof.boundary = rc.source_boundary_polygon || null;
  combineState.roof.originXm = rc.world_origin_x_m || 0;
  combineState.roof.originYm = rc.world_origin_y_m || 0;

  if (payload.design_rules) {
    DESIGN_RULES.clearance_m = payload.design_rules.clearance_m ?? DESIGN_RULES.clearance_m;
    DESIGN_RULES.boundarySetback_m = payload.design_rules.boundary_setback_m ?? DESIGN_RULES.boundarySetback_m;
    DESIGN_RULES.circulationWidth_m = payload.design_rules.circulation_width_m ?? DESIGN_RULES.circulationWidth_m;
    DESIGN_RULES.minEntryPoints = payload.design_rules.min_entry_points ?? DESIGN_RULES.minEntryPoints;
    DESIGN_RULES.quietBufferM = payload.design_rules.quiet_buffer_m ?? DESIGN_RULES.quietBufferM;
  }

  combineState.entryPoints = (payload.entry_points || []).map((ep, i) => ({
    id: `entry_${Date.now()}_${i}`, x_m: ep.x_m, y_m: ep.y_m, edge: ep.edge,
  }));

  combineState.items = payload.placements.map((p, i) => {
    const rotation = p.transform?.rotation_deg || 0;
    const rotated = (rotation % 180) !== 0;
    const bb = p.bounding_box || {};
    // bounding_box.width_m/height_m are the POST-rotation footprint (see
    // getFootprint() in combineField.js) — undo that same swap to recover
    // the pre-rotation length_m/width_m getFootprint expects from here on.
    const length_m = rotated ? bb.height_m : bb.width_m;
    const width_m = rotated ? bb.width_m : bb.height_m;
    return {
      id: p.id || `item_${Date.now()}_${i}`,
      kind: p.category, label: p.label,
      length_m, width_m, rotation,
      x_m: bb.top_left_x_m ?? 0, y_m: bb.top_left_y_m ?? 0,
      sourceJson: p.parameters || {},
    };
  });
  combineState.selectedId = null;
  combineState.selectedKind = null;

  if (payload.site_location) {
    siteState.lat = payload.site_location.latitude_deg ?? siteState.lat;
    siteState.lng = payload.site_location.longitude_deg ?? siteState.lng;
    siteState.address = payload.site_location.place_name || siteState.address;
    siteState.date = payload.site_location.date || siteState.date;
    siteState.time = payload.site_location.time || siteState.time;
  }

  document.getElementById("roofLength").value = combineState.roof.length;
  document.getElementById("roofWidth").value = combineState.roof.width;
  document.getElementById("ruleClearance").value = DESIGN_RULES.clearance_m;
  document.getElementById("ruleSetback").value = DESIGN_RULES.boundarySetback_m;
  document.getElementById("ruleCirculationWidth").value = DESIGN_RULES.circulationWidth_m;
  document.getElementById("ruleMinEntries").value = DESIGN_RULES.minEntryPoints;
  document.getElementById("ruleQuietBuffer").value = DESIGN_RULES.quietBufferM;
  if (payload.site_location) {
    document.getElementById("siteDate").value = siteState.date;
    document.getElementById("siteTime").value = siteState.time;
  }

  if (typeof refreshSuggestions === "function") refreshSuggestions();
  else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
  if (typeof updateSiteUI === "function") updateSiteUI();
}

/**
 * Shared by the Combine wizard's own "Load Progress" file input and the
 * always-visible top-bar load input — jumps to Combine on success so a
 * load triggered from any other tab actually shows what just loaded,
 * rather than restoring state invisibly behind whatever tab you were on.
 */
function loadSessionFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      applySessionSnapshot(JSON.parse(evt.target.result));
      showToast("Progress loaded", `${combineState.items.length} piece(s) restored.`);
      setMode("combine");
    } catch (err) {
      showToast("Load failed", err.message);
    }
  };
  reader.readAsText(file);
}

document.getElementById("btn-load-session").addEventListener("click", () => { document.getElementById("load-session-file").click(); });

document.getElementById("load-session-file").addEventListener("change", e => {
  loadSessionFromFile(e.target.files[0]);
  e.target.value = ""; // otherwise re-selecting the same file next time fires no change event
});

// Overview's "Save Session" tab twin of the above — same action, reachable from any tab.
document.getElementById("btn-overview-load")?.addEventListener("click", () => { document.getElementById("load-session-file-global").click(); });
document.getElementById("load-session-file-global").addEventListener("change", e => {
  loadSessionFromFile(e.target.files[0]);
  e.target.value = "";
});

/**
 * ── Autosave to localStorage ──
 * Belt-and-suspenders alongside the explicit JSON save/load above:
 * protects against an accidentally closed tab without needing every
 * mutation call site in this file to remember to save. Polls on an
 * interval rather than hooking every mutation, and skips the write when
 * nothing actually changed, so this stays cheap.
 */
const AUTOSAVE_KEY = "sportify-autosave";
let lastAutosaveJson = null;

function autosaveTick() {
  if (combineState.items.length === 0) return;
  const json = JSON.stringify(buildCombinedPayload());
  if (json === lastAutosaveJson) return;
  lastAutosaveJson = json;
  try { localStorage.setItem(AUTOSAVE_KEY, json); } catch (e) { /* private mode / quota — silently skip */ }
}
setInterval(autosaveTick, 4000);

/**
 * Restores the last autosave on a fresh page load, before anything's been
 * pushed this session — Clear All is the existing "no, start fresh"
 * escape hatch, so this doesn't need its own confirmation prompt. Called
 * from main.js's init block (not run here directly): this file loads
 * before main.js, which is where showToast is defined.
 */
function restoreAutosaveIfAny() {
  let saved;
  try { saved = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
  if (!saved || combineState.items.length > 0) return;
  try {
    const payload = JSON.parse(saved);
    applySessionSnapshot(payload);
    lastAutosaveJson = saved;
    showToast("Welcome back", `Restored your last session (${combineState.items.length} piece(s)). Clear All to start fresh instead.`);
  } catch (e) { /* corrupt autosave — ignore, start fresh */ }
}
