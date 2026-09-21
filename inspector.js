/**
 * inspector.js — what is this thing I just clicked?
 *
 * A bench on a 40 m roof is a small brown bar. A bin is a grey dot. You can
 * tell a court from a tree at a glance and nothing else, which means the
 * moment a roof has twenty pieces on it the drawing stops answering "what is
 * that one".
 *
 * So the outermost pane answers it. It held only the Iterations list, which is
 * empty most of the time, and it falls back to that whenever nothing is
 * selected — the space was already there, it just was not earning its keep.
 *
 * Everything here is read from the placement itself. Nothing is looked up in a
 * catalog, because a placed piece carries what it was configured with, and a
 * catalog that has moved since should not change what this says about a court
 * placed last month.
 */

function inspectorHost() {
  return document.getElementById("selection-inspector");
}

function row(label, value, note) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td>${note ? `<td class="note">${escapeHtml(note)}</td>` : "<td></td>"}</tr>`;
}

function inspectorTable(rows) {
  const body = rows.filter(Boolean).join("");
  return body ? `<table class="design-detail-table"><tbody>${body}</tbody></table>` : "";
}

/** The selected thing, whatever kind it is. */
function selectedThing() {
  if (typeof combineState === "undefined") return null;
  const { selectedKind: kind, selectedId: id } = combineState;
  if (!id) return null;
  if (kind === "zone") return { kind: "zone", obj: (combineState.zones || []).find(z => z.id === id) };
  const item = (combineState.items || []).find(i => i.id === id);
  return item ? { kind: "item", obj: item } : null;
}

/* ── One describer per kind of thing ─────────────────────────────────────── */

function describeFurniture(it) {
  const f = it.sourceJson?.furniture || {};
  return {
    title: f.product || it.label,
    subtitle: `${f.manufacturer || ""} · ${(f.category || "furniture")}`,
    // Smaller than the catalogue's, and without the 1.75 m caption — by the
    // time you are inspecting a placed bench you have already seen that once.
    figure: typeof furnitureFigureHtml === "function"
      ? furnitureFigureHtml(f, { compact: true, width: 232, height: 118 }) : "",
    rows: [
      row("Footprint", `${f.length_m} × ${f.width_m} m`, f.dimensions_published ? "published" : "typical"),
      row("Height", `${f.height_m} m`),
      row("Seats", f.seats || null),
      row("Capacity", f.capacity_l ? `${f.capacity_l} L` : null),
      row("Weight", f.weight_kg != null ? `${f.weight_kg} kg` : null, f.weight_published ? "published" : "typical"),
      row("Price", f.price != null ? `€ ${f.price}` : null, f.price_quoted ? "quoted" : "estimated"),
      row("DIN 276", f.cost_group ? `KG ${f.cost_group}` : null),
    ],
    material: f.material,
    source: f.source_url,
    sourceName: (f.manufacturer || "").split(" (")[0],
  };
}

function describePlant(it) {
  const v = it.sourceJson?.vegetation || {};
  return {
    title: v.botanical_name || it.label,
    subtitle: `${v.common_name || "plant"} · ${v.form || ""}`,
    rows: [
      row("Crown", v.crown_m ? `${v.crown_m} m` : null),
      row("Mature height", v.height_range || (v.height_m ? `${v.height_m} m` : null)),
      // The figure that decides whether it can actually live here.
      row("Needs substrate", v.min_substrate_mm ? `${v.min_substrate_mm} mm` : null, "root depth"),
      row("Price", v.price_eur != null ? `€ ${v.price_eur}` : null, v.price_quoted ? "quoted" : "estimated"),
    ],
    material: v.note,
    source: v.source_url,
    sourceName: v.source,
  };
}

function describeCourt(it) {
  const p = it.sourceJson?.padel, b = it.sourceJson?.basketball, v = it.sourceJson?.volleyball;

  if (p) return {
    title: "Padel court",
    subtitle: `${p.court_type} · ${p.wall_system} · ${p.surface}`,
    rows: [
      row("Court", `${p.length_m} × ${p.width_m} m`),
      row("Enclosure", `${p.back_wall_glass_height_m + p.back_wall_mesh_height_m} m`, "glass + mesh"),
      row("Net", `${p.net_centre_height_m} m`, "at the centre"),
      row("Clear height needed", `${p.clear_height_min_m} m`),
      row("Weight", `${Math.round(p.weight_kg).toLocaleString("en-US")} kg`, `${p.weight_kg_m2} kg/m²`),
    ],
    material: p.source, source: null,
  };

  if (b) return {
    title: "Basketball court",
    subtitle: `${b.variant} · ${b.hoops} basket${b.hoops > 1 ? "s" : ""} · ${b.surface}`,
    rows: [
      row("Playing area", `${b.play_length_m} × ${b.play_width_m} m`),
      row("Rim", `${b.rim_height_m} m`),
      row("Three-point", `${b.three_point_radius_m} m`),
      row("Clear height needed", `${b.clear_height_min_m} m`),
      row("Weight", `${Math.round(b.weight_kg).toLocaleString("en-US")} kg`, `${b.weight_kg_m2} kg/m²`),
    ],
    material: b.source, source: null,
  };

  if (v) return {
    title: `Volleyball — ${v.play_type}`,
    subtitle: `${v.court_length_m} × ${v.court_width_m} m court · ${v.surface}`,
    rows: [
      row("Court", `${v.court_length_m} × ${v.court_width_m} m`),
      // The free zone is the reason the footprint is so much bigger, so it is
      // said rather than left to be worked out from two numbers.
      row("With free zone", `${v.length_m} × ${v.width_m} m`, `${v.free_zone_sides_m} m sides`),
      row("Net", `${v.net_height_m} m`),
      row("Sand", v.sand_volume_m3 ? `${v.sand_volume_m3} m³` : null, v.sand_depth_m ? `${Math.round(v.sand_depth_m * 1000)} mm deep` : null),
      row("Clear height needed", `${v.clear_height_min_m} m`),
      row("Weight", `${Math.round(v.weight_kg).toLocaleString("en-US")} kg`, `${v.weight_kg_m2} kg/m²`),
    ],
    material: v.source, source: null,
  };

  // Any other pushed piece — a court or activity without its own describer.
  const fp = typeof getFootprint === "function" ? getFootprint(it) : { w: it.length_m, h: it.width_m };
  const m = it.sourceJson?.materials || it.sourceJson?.garden?.materials || {};
  return {
    title: it.label,
    subtitle: it.kind,
    rows: [
      row("Footprint", `${Math.round(fp.w * 10) / 10} × ${Math.round(fp.h * 10) / 10} m`),
      row("Surface", m.reference_material || m.floor_surface || m.surface || null),
      row("Quality", m.quality_level || null),
      row("Norm", it.sourceJson?.field?.norm || it.sourceJson?.activity?.norm || null),
    ],
    material: null, source: null,
  };
}

function describeZone(z) {
  const a = typeof getAssembly === "function" ? getAssembly(z.assemblyKey) : null;
  const area = typeof zoneAreaM2 === "function" ? zoneAreaM2(z) : z.length_m * z.width_m;
  return {
    title: a ? a.system_name : "Ground zone",
    subtitle: a ? `${a.provider} · ${a.category}` : "no build-up chosen",
    rows: [
      row("Area", `${Math.round(area)} m²`, `${z.points?.length || 4} corners`),
      row("Build-up", a ? `${typeof assemblyLayerTotalMm === "function" ? assemblyLayerTotalMm(a) : ""} mm` : null,
          a ? `${a.layers.length} layers` : null),
      row("Saturated", a?.saturated_kg_m2 ? `${a.saturated_kg_m2} kg/m²` : null, "what the deck carries"),
      row("Water storage", a?.water_storage_l_m2 ? `${a.water_storage_l_m2} L/m²` : null),
    ],
    material: a?.description,
    source: a?.source_url,
    sourceName: a?.provider,
  };
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

function renderInspector() {
  const host = inspectorHost();
  if (!host) return;

  const sel = selectedThing();
  const iterations = document.getElementById("iterations-fallback");

  if (!sel || !sel.obj) {
    host.hidden = true;
    if (iterations) iterations.hidden = false;
    return;
  }

  host.hidden = false;
  if (iterations) iterations.hidden = true;

  const d = sel.kind === "zone" ? describeZone(sel.obj)
          : isFurnitureItem?.(sel.obj) ? describeFurniture(sel.obj)
          : sel.obj.kind === "vegetation" ? describePlant(sel.obj)
          : describeCourt(sel.obj);

  host.innerHTML = `
    <div class="inspector-head">
      <strong>${escapeHtml(d.title)}</strong>
      <span class="hint">${escapeHtml(d.subtitle || "")}</span>
    </div>
    ${d.figure || ""}
    ${inspectorTable(d.rows)}
    ${d.material ? `<p class="hint">${escapeHtml(d.material)}</p>` : ""}
    ${d.source ? `<p class="hint"><a href="${safeUrl(d.source)}" target="_blank" rel="noopener">${escapeHtml(d.sourceName || "Source")}</a></p>` : ""}
    <p class="hint">Click an empty part of the roof to clear the selection.</p>`;
}
