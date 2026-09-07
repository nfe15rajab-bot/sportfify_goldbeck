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
};
let combineItemCounter = 0;

/**
 * ── Combine wizard: step-by-step panel navigation ──
 * The DOM itself is the source of truth for which step is showing (each
 * step's hidden attribute), so nothing needs to re-sync this on mode
 * switches — the panel is left exactly as the user left it.
 */
const WIZARD_STEPS = 4;
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

function addCombineItem({ kind, label, length_m, width_m, sourceJson }) {
  const index = combineItemCounter++;
  const item = {
    id: `item_${Date.now()}_${index}`, kind, label, length_m: Number(length_m), width_m: Number(width_m), rotation: 0,
    x_m: 0.5 + (index % 5) * 1.2, y_m: 0.5 + Math.floor(index / 5) * 1.2, sourceJson,
  };
  combineState.items.push(item);
  combineState.selectedId = item.id;
  combineState.selectedKind = "item";
  return item;
}

function updateCombineUI() {
  document.getElementById("field-label").textContent = "Combine — roof layout";
  document.getElementById("norm-badge").textContent  = "Prototype";
  if(typeof initSiteMap === "function") initSiteMap();
  if(typeof drawCombineCanvas === "function") drawCombineCanvas();
  if(typeof refreshSuggestions === "function") refreshSuggestions();
}

/** Recomputes suggested spots for whichever item is currently selected (none selected → empty list), then redraws. */
function refreshSuggestions() {
  const item = combineState.selectedKind === "item" ? combineState.items.find(i => i.id === combineState.selectedId) : null;
  combineState.suggestions = item && typeof suggestPositionsForItem === "function" ? suggestPositionsForItem(item, combineState, DESIGN_RULES) : [];
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
document.getElementById("btn-remove-selected").addEventListener("click", () => {
  if (!combineState.selectedId) return;
  if (combineState.selectedKind === "entry") {
    combineState.entryPoints = combineState.entryPoints.filter(e => e.id !== combineState.selectedId);
  } else {
    combineState.items = combineState.items.filter(i => i.id !== combineState.selectedId);
  }
  combineState.selectedId = null;
  combineState.selectedKind = null;
  if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas();
});
document.getElementById("btn-clear-all").addEventListener("click", () => { combineState.items = []; combineState.selectedId = null; combineState.selectedKind = null; if(typeof refreshSuggestions === "function") refreshSuggestions(); else if(typeof drawCombineCanvas === "function") drawCombineCanvas(); });

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

/* ── Combined JSON export (Revit Optimized) ── */
document.getElementById("btn-combine-json").addEventListener("click", () => {
  if (combineState.items.length === 0) return;

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
    // The four planner-tunable thresholds, so a Revit import can draw the
    // same setback inset the canvas shows (as a simple rectangle inset,
    // same approximation setbackGuideSvg already uses for a polygon roof).
    design_rules: {
      clearance_m: DESIGN_RULES.clearance_m,
      boundary_setback_m: DESIGN_RULES.boundarySetback_m,
      circulation_width_m: DESIGN_RULES.circulationWidth_m,
      min_entry_points: DESIGN_RULES.minEntryPoints
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
});
