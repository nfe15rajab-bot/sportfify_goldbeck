/**
 * kineticsPostAnalysis.js — the Post Analysis tab.
 *
 * The professor's note: the Analysis tab's results rail got "what happens where" flat and confusing, and she wants the
 * design's own response to the analysis in a closed loop, not just numbers. This tab is that loop's visible half:
 *
 *   Graphic recommendations   areas of improvement, ranked by priority (Sun / Wind & Erosion / Structural) — reads
 *                              whatever analysis-results Revit already published (analysisResults.js's resultsState),
 *                              nothing computed here.
 *   Dynamic families           what Revit's Kinetics panel (Choose / Generate / Import Analysis Adaptation) placed and
 *                              actuated FROM that analysis's own numbers — v1: the louvre pergola the Sun & Shade
 *                              analysis recommends, opened to the sun's own elevation (LouvreActuationModel, add-in
 *                              side) — plus the isolated video when Kinetics' "Record Isolated Video" has run.
 *
 * Reuses analysisResults.js's helpers (resSection, resTile, resVideo, resPrelim, resEsc, resNum, resText) and its
 * polling (resultsState/pollAnalysisResults) rather than duplicating either — this tab reads the exact same
 * /analysis-results payload the Analysis tab does, just interprets it differently.
 */

let postAnalysisPriority = "sun"; // "sun" | "wind_erosion" | "structural"

const POST_ANALYSIS_PRIORITY_LABEL = { sun: "Sun", wind_erosion: "Wind & Erosion", structural: "Structural" };

/** The rail (reuses #activity-bar, same as Analysis's own sub-rail): one tab per component, room to grow as more dynamic-family types (fences, erosion) arrive. */
const POST_ANALYSIS_SUBTABS = [
  { id: "families", label: "Dynamic Families", icon: "ti-wind", title: "What Kinetics placed and actuated from the analysis" },
  { id: "recommendations", label: "Recommendations", icon: "ti-target-arrow", title: "Areas of improvement, ranked by priority" },
];
let postAnalysisSub = "families";

document.querySelectorAll("#postAnalysisPriorityBtns .q-btn").forEach(btn => {
  btn.addEventListener("click", () => setPostAnalysisPriority(btn.dataset.priority));
});

function setPostAnalysisPriority(key) {
  if (!POST_ANALYSIS_PRIORITY_LABEL[key]) return;
  postAnalysisPriority = key;
  document.querySelectorAll("#postAnalysisPriorityBtns .q-btn").forEach(b => b.classList.toggle("active", b.dataset.priority === key));
  renderPostAnalysisView();
}

/** Fills the second rail (the one Sport/Analysis reuse for their own sub-tabs) with Post Analysis's two components. Called from main.js's setMode, same spot buildAnalysisRail() is. */
function buildPostAnalysisRail() {
  const bar = document.getElementById("activity-bar");
  if (!bar) return;
  bar.innerHTML = POST_ANALYSIS_SUBTABS.map(t => `
    <button class="activity-icon${t.id === postAnalysisSub ? " active" : ""}" data-sub="${escapeHtml(t.id)}" title="${resEsc(t.title)}">
      <i class="ti ${t.icon}"></i><span class="activity-icon-label">${resEsc(t.label)}</span>
    </button>`).join("");
  bar.querySelectorAll(".activity-icon").forEach(btn => btn.addEventListener("click", () => setPostAnalysisSub(btn.dataset.sub)));
}

function setPostAnalysisSub(id) {
  if (!POST_ANALYSIS_SUBTABS.some(t => t.id === id)) return;
  postAnalysisSub = id;
  document.querySelectorAll("#activity-bar .activity-icon").forEach(b => b.classList.toggle("active", b.dataset.sub === id));
  renderPostAnalysisView();
}

/** Called from main.js's setMode when Post Analysis is (re)entered. */
function updatePostAnalysisUI() {
  renderPostAnalysisView();
}

/** Called from analysisResults.js's poll loop, the same way it refreshes the Analysis tab. */
function renderPostAnalysisIfShowing() {
  if (typeof activeMode !== "undefined" && activeMode === "postAnalysis") renderPostAnalysisView();
}

function renderPostAnalysisView() {
  const root = document.getElementById("postAnalysis-content");
  if (!root) return;
  root.innerHTML = `<div class="res-wrap">${postAnalysisSub === "recommendations" ? renderGraphicRecommendations() : renderDynamicFamilies()}</div>`;
}

// ---------------------------------------------------------------------------------------------------- graphic recommendations

function renderGraphicRecommendations() {
  const label = POST_ANALYSIS_PRIORITY_LABEL[postAnalysisPriority];
  const items = recommendationsFor(postAnalysisPriority);
  return `<div class="section">
    <label><i class="ti ti-target-arrow" aria-hidden="true"></i> Graphic recommendations — ${resEsc(label)}</label>
    <p class="hint">Areas of improvement from the last Revit analysis results, ranked for this priority — nothing is computed here, this reads what Revit already published.</p>
    ${items.length ? `<div class="res-tiles">${items.map(it => resTile(it.label, it.value, it.sub, it.tone)).join("")}</div>`
                    : `<p class="hint">No ${resEsc(label.toLowerCase())} result published yet. Run it from Revit (or the Analysis tab's own early checks).</p>`}
  </div>`;
}

function recommendationsFor(priority) {
  if (priority === "sun") return sunRecommendations();
  if (priority === "wind_erosion") return windRecommendations();
  if (priority === "structural") return structuralRecommendations();
  return [];
}

function sunRecommendations() {
  const s = resSection("sun_and_shading");
  if (!s) return [];
  const items = [];
  if (s.people_zones_too_sunny_after > 0)
    items.push({ label: "Still too sunny", value: String(s.people_zones_too_sunny_after), sub: "of " + s.people_zones + " people zones, even with the recommended equipment", tone: "bad" });
  else if (s.people_zones_too_sunny > 0)
    items.push({ label: "Too-sunny zones resolved", value: String(s.people_zones_too_sunny), sub: "by the recommended shading equipment", tone: "ok" });
  if (s.garden_zones_too_shaded_after > 0)
    items.push({ label: "Gardens short of sun", value: String(s.garden_zones_too_shaded_after), sub: "of " + s.garden_zones + ", even after placing the equipment", tone: "warn" });
  if (Array.isArray(s.equipment) && s.equipment.length) {
    const fixed = s.equipment.filter(e => e.key === "pergola" || e.key === "canopy").length;
    const sails = s.equipment.filter(e => e.key === "sail").length;
    const parts = [];
    if (fixed) parts.push(fixed + " louvre pergola(s) or solid canopy(ies), which Kinetics makes operable (a canopy becoming a louvre pergola)");
    if (sails) parts.push(sails + " shade sail(s), which Kinetics can put on movable pillars that slide on ground rails to grow or shrink the shade");
    items.push({
      label: "Shading equipment recommended", value: String(s.equipment.length),
      sub: parts.length ? parts.join("; ") + " (Revit: Kinetics panel)" : "none Kinetics can make dynamic — it works on louvre pergolas, canopies and sails, and on any railing or wall you select (slat and fin screens); parasols and trees stay as they are",
      tone: parts.length ? "" : "warn",
    });
  }
  // what Kinetics found about the louvre pergolas' mechanics (Revit's Kinetics panel, LouvreMechanics): a blade that bends too far, a pergola that must stow in wind
  const k = resSection("kinetics");
  if (k && Array.isArray(k.pieces)) k.pieces.forEach(p => {
    const m = p.mechanics;
    if (!m) return;
    const name = p.equipment_name || "Louvre pergola";
    if (m.deflection_ok === false) items.push({ label: "Louvre blades bend too far", value: m.deflection_ratio ? "span/" + resNum(m.deflection_ratio, 0) : "—", sub: name + ": support them at mid-span or deepen the profile (" + resNum(m.allowed_span_m, 1) + " m allowed unsupported)", tone: "bad" });
    if (m.stow_required) items.push({ label: "Louvre pergola needs wind stow", value: resNum(m.actuator_torque_nm, 0) + " N·m", sub: name + ": anemometer, closed-and-latched storm position, actuator sized for it", tone: "warn" });
  });
  if (!items.length) items.push({ label: "Sun and shade balance holds", value: "0", sub: "no shading equipment was needed", tone: "ok" });
  return items;
}

function windRecommendations() {
  const s = resSection("wind_erosion");
  if (!s) return [];
  const items = [];
  if (s.trees_failing > 0) items.push({ label: "Trees at risk of blowing over", value: String(s.trees_failing), sub: "of " + s.trees_checked + " checked", tone: "bad" });
  else if (s.trees_marginal > 0) items.push({ label: "Trees marginal", value: String(s.trees_marginal), sub: "of " + s.trees_checked + " checked", tone: "warn" });
  if (s.zones_uplift_flagged > 0) items.push({ label: "Build-ups flagged for uplift", value: String(s.zones_uplift_flagged), sub: resNum(s.percent_planted_area_uplift_flagged, 0) + "% of the planted area", tone: "bad" });
  if (s.percent_planted_area_erosion_flagged > 0) items.push({ label: "Erosion risk", value: resNum(s.percent_planted_area_erosion_flagged, 0) + "%", sub: "of the planted area; growing medium could blow away", tone: "warn" });
  if (!items.length) items.push({ label: "No wind or erosion risk flagged", value: "0", sub: "", tone: "ok" });
  return items;
}

function structuralRecommendations() {
  const s = resSection("structural_loads");
  if (!s) return [];
  const items = [];
  if (s.bays_over_capacity > 0) items.push({ label: "Bays over capacity", value: String(s.bays_over_capacity), sub: s.worst_bay ? "worst: " + s.worst_bay + ", " + resNum(s.peak_utilisation_percent, 0) + "%" : "", tone: "bad" });
  if (s.bays_marginal > 0) items.push({ label: "Bays marginal", value: String(s.bays_marginal), sub: "", tone: "warn" });
  if (s.balance_status && s.balance_status !== "balanced" && s.balance_status !== "ok" && s.heavy_side)
    items.push({ label: "Load unbalanced", value: resEsc(s.heavy_side), sub: "sits toward this side of the grid", tone: "warn" });
  if (!items.length) items.push({ label: "Structural check holds", value: "0", sub: "no bay over capacity", tone: "ok" });
  return items;
}

// ---------------------------------------------------------------------------------------------------- dynamic families

function renderDynamicFamilies() {
  const k = resSection("kinetics");
  return `<div class="section">
    <label><i class="ti ti-wind" aria-hidden="true"></i> Dynamic families</label>
    <p class="hint">Placed and actuated straight from an analysis's own numbers — from Revit's Kinetics panel (Choose / Generate / Import Analysis Adaptation). Each unit is built from adaptive components: overhead louvres, slat and fin screens on a railing or wall, sails on movable pillars, roller fences.</p>
    ${k ? renderKineticsBody(k) : `<p class="hint">Nothing placed yet. In Revit: Sportify ribbon → Kinetics → Choose/Generate/Import Analysis Adaptation.</p>`}
  </div>`;
}

function renderKineticsBody(k) {
  const pieces = Array.isArray(k.pieces) ? k.pieces : [];
  const priorityLabel = POST_ANALYSIS_PRIORITY_LABEL[k.priority] || k.priority || "?";
  if (!pieces.length && !k.video_path && !k.simulation_video_path) return `<p class="hint">Nothing placed yet for priority "${resEsc(priorityLabel)}".</p>`;
  let out = "";
  if (k.preliminary) out += resPrelim(k.preliminary_note);
  if (Array.isArray(k.placement_notes) && k.placement_notes.length)
    out += `<ul class="res-list small">${k.placement_notes.map(n => `<li>${resText(n)}</li>`).join("")}</ul>`;
  out += pieces.map(renderKineticPiece).join("");
  out += renderMechanicalInputs(k.mechanical_inputs);
  if (k.video_path) out += `<div class="res-block"><label>Isolated video (Unity)</label>${resVideo(k.video_path)}</div>`;
  if (k.simulation_video_path) out += `<div class="res-block"><label>Motion study (SOLIDWORKS)</label><p class="hint">The mechanism as a mechanical assembly: the posts, the rod and its crank hooks, the blades turning on their pivots — recorded behind the scenes from the model the mechanical engineer can open.</p>${resVideo(k.simulation_video_path)}</div>`;
  return out;
}

/** The inputs every mechanical number rests on: which the mechanical engineer entered, and which are still the built-in value to be replaced. */
function renderMechanicalInputs(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) return "";
  const how = { entered: "entered by the mechanical engineer", accepted: "built-in, accepted", unconfirmed: "built-in, to be replaced" };
  return `<details class="res-details" open><summary>Mechanical inputs (${inputs.length}) — enter yours in SportifyKineticsInputs.json, in Revit's Addins folder</summary>
    <table class="res-table"><tbody>${inputs.map(i => `<tr><td>${resEsc(i.label)}</td><td>${resText(i.value)}</td><td class="hint">${resText(i.reference)}</td><td><span class="res-pill state-${resEsc(i.state)}">${how[i.state] || resEsc(i.state)}</span></td></tr>`).join("")}</tbody></table></details>`;
}

/** What the blades, the wind and the actuator come to (LouvreMechanics, add-in side): the numbers for the mechanical engineer to check and improve. */
function renderKineticMechanics(p, m) {
  const tiles = `<div class="res-tiles">
    ${resTile("Blades", resNum(p.blade_count, 0), resNum(m.chord_mm, 0) + " × " + resNum(m.thickness_mm, 0) + " mm at a " + resNum(m.pitch_mm, 0) + " mm pitch, " + resNum(m.blade_mass_kg, 1) + " kg each, " + resNum(m.total_mass_kg, 0) + " kg in all")}
    ${resTile("Actuator torque", resNum(m.actuator_torque_nm, 1) + " N·m", resNum(m.actuator_force_n, 0) + " N at the crank; moves every blade in wind up to " + resNum(m.operating_wind_ms, 0) + " m/s")}
    ${resTile("Holding torque in a gust", resNum(m.holding_torque_nm, 1) + " N·m", "if the blades are caught open in the design peak (" + resNum(m.design_pressure_pa, 0) + " Pa, " + resNum(m.design_wind_ms, 0) + " m/s): a self-locking drive or a brake")}
    ${resTile("Wind torque per blade", resNum(m.peak_torque_operating_nm, 2) + " N·m", "peak at " + resNum(m.peak_torque_angle_deg, 0) + "° open at the wind limit; " + resNum(m.peak_torque_gust_nm, 1) + " N·m in the design peak")}
    ${resTile("Blade deflection", m.deflection_ratio ? "span/" + resNum(m.deflection_ratio, 0) : "—", resNum(m.deflection_mm, 1) + " mm face-on to the design peak" + (m.deflection_ok ? "" : "; " + resNum(m.allowed_span_m, 1) + " m of unsupported span allowed"), m.deflection_ok ? "ok" : "bad")}
    ${resTile("Wind stow", m.stow_required ? "required" : "not needed", "the blades go to their storm position and latch above " + resNum(m.operating_wind_ms, 0) + " m/s", m.stow_required ? "warn" : "ok")}
    ${resTile("Motion", resNum(m.actuator_power_w, 1) + " W", "a full swing takes " + resNum(m.swing_seconds, 0) + " s; " + resNum(m.energy_wh_per_day, 3) + " Wh a day")}
  </div>`;
  const findings = Array.isArray(m.findings) && m.findings.length ? `<ul class="res-list">${m.findings.map(f => `<li>${resText(f)}</li>`).join("")}</ul>` : "";
  return `<div class="res-block"><label>Mechanics</label>${tiles}${findings}</div>`;
}

/** The kinds Kinetics makes (KineticKinds, add-in side): what each one's moving part and state are called. */
const KINETIC_KIND_TEXT = {
  overhead: { part: "Blades", open: "Louvre open angle" },
  slats: { part: "Slats", open: "Slat tip angle" },
  fins: { part: "Fins", open: "Fin turn angle" },
  sail: { part: "Masts", open: "Size run to (× analysed)" },
  fence: { part: "Guide rails", open: "" },
};

function renderKineticPiece(p) {
  const states = Array.isArray(p.states) ? p.states : [];
  const kind = KINETIC_KIND_TEXT[p.kind] ? p.kind : "overhead";
  const text = KINETIC_KIND_TEXT[kind];
  const isFence = kind === "fence";
  const size = isFence ? resNum(p.length_m, 1) + " m × " + resNum(p.height_m, 1) + " m" : (kind === "slats" || kind === "fins") ? resNum(p.length_m, 1) + " m × " + resNum(p.height_m, 1) + " m" : resNum(p.width_m, 1) + " × " + resNum(p.depth_m, 1) + " m";
  return `<div class="res-block">
    <label>${resEsc(p.equipment_name || "Dynamic unit")} <span class="res-pill state-entered">${resEsc(p.kind_label || "Overhead louvre")}</span>${p.phase ? ` <span class="res-pill state-accepted">${resEsc(p.phase)}</span>` : ""}</label>
    ${p.host ? `<p class="hint">On ${resText(p.host)}.</p>` : ""}
    <div class="dims">
      <div class="dim-card"><div class="val">${size}</div><div class="lbl">Size</div></div>
      <div class="dim-card"><div class="val">${p.blade_count != null ? p.blade_count : "—"}</div><div class="lbl">${resEsc(text.part)}</div></div>
      <div class="dim-card"><div class="val">${p.parts_placed != null && p.parts_placed ? p.parts_placed + (p.moving_parts ? " (" + p.moving_parts + " moving)" : "") : "—"}</div><div class="lbl">Adaptive parts</div></div>
    </div>
    ${p.spacing ? renderKineticSpacing(p.spacing, p.supports, text.part) : ""}
    ${states.length && !isFence ? `<table class="res-table"><thead><tr><th>State</th><th>Solar time</th><th>Sun elevation</th><th>${resEsc(text.open)}</th><th>${kind === "sail" ? "Shade held (masts tracking)" : "Direct sun stopped"}</th>${kind === "sail" ? "" : "<th>Wind torque / blade</th>"}</tr></thead><tbody>
      ${states.map(s => `<tr><td>${resEsc(s.label)}</td><td>${resNum(s.solar_time_h, 1)} h</td><td>${resNum(s.sun_elevation_deg, 0)}°</td><td>${kind === "sail" ? "× " + resNum(s.louvre_open_angle_deg, 2) : resNum(s.louvre_open_angle_deg, 0) + "°"}</td><td>${resNum(s.sun_stopped_percent, 0)}%</td>${kind === "sail" ? "" : `<td>${resNum(s.wind_torque_operating_nm, 2)} N·m</td>`}</tr>`).join("")}
    </tbody></table>` : ""}
    ${p.mechanics ? renderKineticMechanics(p, p.mechanics) : ""}
    ${p.sail ? renderSailMechanics(p.sail) : ""}
    ${p.fence ? renderFenceMechanics(p.fence) : ""}
  </div>`;
}

/** How many blades, how far apart and why, and what carries them: the recommendation the analysis makes for the mechanical design. */
function renderKineticSpacing(sp, su, part) {
  const tiles = `<div class="res-tiles">
    ${resTile(part + ", how many", resNum(sp.count, 0), "at a " + resNum(sp.pitch_mm, 0) + " mm pitch across " + resNum(sp.stack_length_m, 2) + " m")}
    ${resTile("Stops in the hardest sun", resNum(sp.stopped_at_binding_percent, 0) + "%", "of the direct sun (" + resEsc(sp.binding_state || "") + ", " + resNum(sp.binding_profile_deg, 0) + "° profile), against the " + resNum(sp.target_stopped_percent, 0) + "% asked for" + (sp.capped_at_max_pitch ? "; the widest pitch allowed already gives more" : ""), sp.stopped_at_binding_percent + 0.5 >= sp.target_stopped_percent ? "ok" : "warn")}
    ${resTile("Closed", resNum(sp.closed_stopped_percent, 0) + "%", sp.closed_stopped_percent >= 99.5 ? "a roof when closed" : "leaves gaps when closed: not a roof in the storm position", sp.closed_stopped_percent >= 99.5 ? "ok" : "")}
    ${su ? resTile("Posts", resNum(su.bays + 1, 0) + " lines", resNum(su.bays, 0) + " bay(s) of " + resNum(su.bay_length_m, 2) + " m; a blade may span " + resNum(su.allowed_span_m, 2) + " m in the design gust, " + resNum(su.deflection_mm, 1) + " mm at the bay", su.bays > 1 ? "warn" : "ok") : ""}
  </div>`;
  return `<div class="res-block"><label>Recommendation</label>${sp.reason ? `<p class="hint">${resText(sp.reason)}</p>` : ""}${tiles}</div>`;
}

function renderSailMechanics(s) {
  const tiles = `<div class="res-tiles">
    ${resTile("Sail", resNum(s.area_m2, 1) + " m²", resNum(s.width_m, 1) + " × " + resNum(s.depth_m, 1) + " m on four masts " + resNum(s.mast_height_m, 1) + " m high; " + resNum(s.fabric_mass_kg, 0) + " kg of fabric")}
    ${resTile("Mast", resNum(s.mast_diameter_mm, 0) + " mm", s.mast_ok ? "passes at " + resNum(s.mast_utilisation_percent, 0) + "% of the yield" : "too light: " + resNum(s.recommended_mast_diameter_mm, 0) + " mm passes", s.mast_ok ? "ok" : "bad")}
    ${resTile("Base moment", resNum(s.mast_base_moment_kn_m, 1) + " kN·m", "the pretension pulls " + resNum(s.pretension_pull_kn_per_corner, 1) + " kN on each top; uplift " + resNum(s.uplift_kn_per_mast, 1) + " kN per mast")}
    ${resTile("Size range", resNum(s.min_scale, 2) + " – " + resNum(s.max_scale, 2), resNum(s.area_min_m2, 1) + " m² run in, " + resNum(s.area_m2, 1) + " m² as analysed, " + resNum(s.area_max_m2, 1) + " m² run out: running in frees " + resNum(s.garden_freed_m2, 1) + " m² for a garden nearby")}
    ${resTile("Ground tracks", resNum(s.tracks, 0) + " × " + resNum(s.rail_length_m, 1) + " m", (s.shape === "triangle" ? "an L: one along x, one along y; " : "two parallel; ") + "a carriage runs " + resNum(s.travel_m, 1) + " m, in " + resNum(s.travel_seconds, 0) + " s at " + resNum(s.drive_speed_cm_s, 1) + " cm/s")}
    ${resTile("Carriage drive", resNum(s.carriage_force_kn, 2) + " kN", "about " + resNum(s.drive_power_w, 0) + " W a motor (the fabric's pull, the wind, rolling friction, with the safety factor)")}
    ${resTile("Shade with the masts running", resNum(s.shade_tracked_min_percent, 0) + "%", "at worst, against " + resNum(s.shade_fixed_min_percent, 0) + "% for a sail that stays put (means " + resNum(s.shade_tracked_mean_percent, 0) + "% and " + resNum(s.shade_fixed_mean_percent, 0) + "%)", s.shade_tracked_min_percent > s.shade_fixed_min_percent ? "ok" : "")}
    ${resTile("Storm", resNum(s.storm_height_m, 1) + " m", "the masts run in, then telescope down" + (s.mast_stages > 1 ? " (" + s.mast_stages + " stages of " + resNum(s.mast_stage_m, 2) + " m: the lowest they can go)" : "") + " and the fabric is slack")}
  </div>`;
  const findings = Array.isArray(s.findings) && s.findings.length ? `<ul class="res-list">${s.findings.map(f => `<li>${resText(f)}</li>`).join("")}</ul>` : "";
  return `<div class="res-block"><label>Sail on movable pillars</label>${tiles}${findings}</div>`;
}

function renderFenceMechanics(f) {
  const tiles = `<div class="res-tiles">
    ${resTile("Fence", resNum(f.length_m, 1) + " m", resEsc(f.edge || "") + " edge, " + resNum(f.height_m, 1) + " m high; it stops " + resNum(f.stops_percent_of_exits, 0) + "% of the shots that leave the roof there")}
    ${resTile("Guide rails", resNum(f.rails, 0), resNum(f.bay_spacing_m, 1) + " m apart, " + resNum(f.rail_size_mm, 0) + " mm square tube", f.rail_ok ? "ok" : "bad")}
    ${resTile("Rail stress", resNum(f.rail_utilisation_percent, 0) + "%", "of the yield with the safety factor; " + resNum(f.rail_deflection_mm, 0) + " mm at the top against " + resNum(f.rail_deflection_limit_mm, 0) + " mm allowed" + (f.rail_ok ? "" : "; " + resNum(f.recommended_rail_size_mm, 0) + " mm passes"), f.rail_ok ? "ok" : "bad")}
    ${resTile("A ball hits it", resNum(f.impact_energy_j, 0) + " J", resNum(f.impact_force_kn, 1) + " kN over the give of the net; " + resNum(f.impact_moment_kn_m, 1) + " kN·m at the foot of a rail")}
    ${resTile("Wind on the net", resNum(f.wind_moment_kn_m, 1) + " kN·m", "at the foot of a rail, up to the operating wind limit")}
    ${resTile("Roller motor", resNum(f.motor_torque_nm, 1) + " N·m", resNum(f.motor_force_n, 0) + " N to lift the bar and the curtain; about " + resNum(f.motor_power_w, 0) + " W, " + resNum(f.deploy_seconds, 0) + " s to deploy")}
    ${resTile("Storm", f.storm_retract ? "stow it" : "holds", f.storm_retract ? "the deployed net would be a sail on its rails in the design peak: an anemometer overrides the switch" : "no wind rule beyond the operating limit", f.storm_retract ? "warn" : "ok")}
  </div>`;
  const findings = Array.isArray(f.findings) && f.findings.length ? `<ul class="res-list">${f.findings.map(x => `<li>${resText(x)}</li>`).join("")}</ul>` : "";
  return `<div class="res-block"><label>Roller fence — turned on only when it is needed</label>${tiles}${findings}</div>`;
}
