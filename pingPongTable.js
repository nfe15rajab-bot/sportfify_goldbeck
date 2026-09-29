/**
 * pingPongTable.js — table tennis, where the table is not the variable
 *
 * Every other sport here offers a size. This one cannot: the ITTF fixes the
 * table at 2.74 x 1.525 m, 0.76 m above the floor, and no roof changes that.
 * Offering a length box would invite a table that does not exist.
 *
 * What IS a choice, and the only one that decides whether a table fits on a
 * roof, is the PLAYING SPACE around it — 7.6 x 4.6 m for casual play against
 * 14 x 7 m for the Olympics, which is nearly four times the area for the same
 * table. So that is what the panel offers, and the footprint follows from it.
 *
 * ── Sources ──
 * ITTF Handbook, Laws of Table Tennis 2.1-2.2 (the table) and the Technical
 * Leaflet's playing space per table:
 *   table 2.74 x 1.525 m, upper surface 76 cm above the floor
 *   net 15.25 cm high, extending 15.25 cm beyond each side line
 *   white side and end lines 2 cm wide; centre line 3 mm, for doubles only
 *   playing space 14 x 7 m (Olympic/World), 12 x 6 (international),
 *   10 x 5 (national)
 */

const PING_PONG = {
  table: { length_m: 2.74, width_m: 1.525, height_m: 0.76 },
  /** The top is 22-25 mm; the figure only matters for what the deck carries. */
  topThickness_m: 0.025,
  net: { height_m: 0.1525, overhang_m: 0.1525 },
  lineWidth_m: 0.02,
  centreLineWidth_m: 0.003,
};

/** The playing space per table. The table is the same in every one of them. */
const PING_PONG_SPACES = {
  recreational:  { length_m: 7.6,  width_m: 4.6, norm: "Casual play — below any ITTF minimum" },
  national:      { length_m: 10.0, width_m: 5.0, norm: "ITTF — national competition" },
  international: { length_m: 12.0, width_m: 6.0, norm: "ITTF — international events" },
  world:         { length_m: 14.0, width_m: 7.0, norm: "ITTF — Olympic Games and World Championships" },
};

const PING_PONG_OPTIONS_API = "http://localhost:5107/api/SportOptions?sport=ping_pong";

let PING_PONG_OPTIONS = {};
let pingPongOptionsLoaded = false;

const PING_PONG_GROUPS = [
  ["playing_space", "playingSpace", "Playing space"],
  ["table",         "table",        "Table"],
  ["net",           "net",          "Net"],
  ["surface",       "surface",      "Surface under it"],
];

async function loadPingPongOptions() {
  const res = await fetch(PING_PONG_OPTIONS_API, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sport options API returned ${res.status}`);
  const rows = await res.json();

  PING_PONG_OPTIONS = {};
  PING_PONG_GROUPS.forEach(([apiGroup, stateKey, label]) => {
    const values = {};
    rows.filter(r => r.optionGroup === apiGroup)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .forEach(r => {
          values[r.key] = {
            label: r.label, note: r.note || "",
            hex: r.colourHex || null, texture: r.textureHint || null,
            kg_m2: r.weightKgM2 ?? null, kgEach: r.weightKgEach ?? null,
            price: r.priceValue ?? null, price_unit: r.priceUnit || null,
            price_quoted: !!r.priceIsQuoted, cost_group: r.costGroupDin276 || null,
          };
        });
    if (Object.keys(values).length) PING_PONG_OPTIONS[stateKey] = { label, values };
  });

  pingPongOptionsLoaded = true;
  Object.entries(PING_PONG_OPTIONS).forEach(([key, group]) => {
    if (!group.values[pingPongState[key]]) pingPongState[key] = Object.keys(group.values)[0];
  });
  return PING_PONG_OPTIONS;
}

const pingPongState = {
  playingSpace: "recreational",
  table: "steel_composite",
  net: "permanent",
  surface: "existing",
};

/* ── Dimensions ──────────────────────────────────────────────────────────── */

function pingPongSpace(state = pingPongState) {
  return PING_PONG_SPACES[state.playingSpace] || PING_PONG_SPACES.recreational;
}

/** The footprint IS the playing space: the table sits in the middle of it. */
function pingPongFootprint(state = pingPongState) {
  const s = pingPongSpace(state);
  return { length_m: s.length_m, width_m: s.width_m };
}

/** How much room is left at each end and side once the table is in. */
function pingPongClearance(state = pingPongState) {
  const s = pingPongSpace(state);
  return {
    end_m: Math.round(((s.length_m - PING_PONG.table.length_m) / 2) * 100) / 100,
    side_m: Math.round(((s.width_m - PING_PONG.table.width_m) / 2) * 100) / 100,
  };
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

function pingPongWeight(state = pingPongState) {
  const fp = pingPongFootprint(state);
  const area = fp.length_m * fp.width_m;
  const perM2 = PING_PONG_OPTIONS.surface?.values?.[state.surface]?.kg_m2 ?? 0;
  const tableKg = PING_PONG_OPTIONS.table?.values?.[state.table]?.kgEach ?? 0;
  const netKg = PING_PONG_OPTIONS.net?.values?.[state.net]?.kgEach ?? 0;

  const parts = [
    { what: "Table", kg: tableKg },
    { what: "Net", kg: netKg },
  ];
  if (perM2 > 0) parts.unshift({ what: "Playing surface", kg: area * perM2 });

  const total_kg = parts.reduce((s, p) => s + p.kg, 0);
  return { parts, total_kg, area_m2: area, perM2_kg: total_kg / area, tableKg };
}

function pingPongAppearance(state = pingPongState) {
  const sh = (hex, t) => (typeof shade === "function" ? shade(hex, t) : hex);
  // The table is the dark one; the space around it takes the surface's colour.
  const surface = state.surface === "existing" ? null : "#3f6f9c";
  switch (PING_PONG_OPTIONS.surface?.values?.[state.surface]?.texture || state.surface) {
    case "tiles": return { base: surface, texture: "tiles", accent: sh(surface || "#3f6f9c", -0.2) };
    case "sheen": return { base: surface, texture: "sheen", accent: sh(surface || "#3f6f9c", 0.1) };
    default:      return { base: surface, texture: "flat", accent: sh(surface || "#3f6f9c", -0.14) };
  }
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/**
 * The playing space with the table in the middle of it.
 *
 * Drawn to ONE scale, so what you see at a glance is how much of the space is
 * table and how much is room to move — which is the whole question this panel
 * exists to answer.
 */
function pingPongCourtSvg(x, y, w, h, state = pingPongState, detail = "full", isDark = false) {
  const sp = pingPongSpace(state), a = pingPongAppearance(state);
  const t = PING_PONG.table;
  const s = w / sp.length_m;                  // one scale, both ways
  const M = m => m * s;

  const ink = isDark ? "#c9cbe0" : "#3a3f4b";
  const line = "#ffffff";
  const deck = isDark ? "#2f3350" : "#e6e9f2";
  // ITTF tables are dark — blue or green, matt.
  const top = isDark ? "#1e4a72" : "#2f6fb5";

  let out = "";
  // The playing space. When the table just stands on the roof finish there is
  // no surface of its own, so it is outlined rather than filled: the space is
  // still real, it is just not a different material.
  out += a.base
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a.base}" fill-opacity="0.55" stroke="${ink}" stroke-width="1"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${deck}" fill-opacity="0.5" stroke="${ink}" stroke-width="1" stroke-dasharray="6 4"/>`;

  // The table, centred.
  const tw = M(t.length_m), th = M(t.width_m);
  const tx = x + (w - tw) / 2, ty = y + (h - th) / 2;
  out += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="${top}" stroke="${ink}" stroke-width="1"/>`;

  if (detail === "full") {
    const lw = Math.max(0.6, M(PING_PONG.lineWidth_m));
    // Side and end lines, 2 cm, and the centre line that only doubles uses.
    out += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;
    out += `<line x1="${tx}" y1="${ty + th / 2}" x2="${tx + tw}" y2="${ty + th / 2}" stroke="${line}" stroke-width="${Math.max(0.4, lw / 3)}"/>`;
  }

  // The net, across the middle and overhanging both sides. The overhang is in
  // the Laws, and it is what stops a ball going round the side.
  const over = M(PING_PONG.net.overhang_m);
  out += `<line x1="${tx + tw / 2}" y1="${ty - over}" x2="${tx + tw / 2}" y2="${ty + th + over}"
                stroke="${isDark ? "#e8e8e8" : "#2a2a2a"}" stroke-width="${Math.max(1, M(0.02))}"/>`;

  return out;
}

/** A placed table's own settings (what its Push carried), over the panel's, so a setting added later still has a value. */
function pingPongStateForItem(item) {
  const p = item?.sourceJson?.ping_pong;
  if (!p) return pingPongState;
  return Object.assign({}, pingPongState, {
    playingSpace: p.playing_space || pingPongState.playingSpace,
    table: p.table || pingPongState.table,
    net: p.net || pingPongState.net,
    surface: p.surface || pingPongState.surface,
  });
}

/** The Sport tab preview: the space, the table in it, and what is left over. */
function drawPingPongPreview(svg, isDark) {
  if (!svg) return;
  const fp = pingPongFootprint(), c = pingPongClearance();
  const PADDING = 46, vw = 420, vh = 260;
  const aspect = fp.length_m / fp.width_m;
  let w = vw - PADDING * 2, h = w / aspect;
  if (h > vh - PADDING * 2) { h = vh - PADDING * 2; w = h * aspect; }
  const x = (vw - w) / 2, y = (vh - h) / 2;
  const dim = isDark ? "#a0a3c9" : "#62658a";
  const font = `font-family="'Titillium Web', Arial, sans-serif"`;

  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  svg.innerHTML = `
    ${pingPongCourtSvg(x, y, w, h, pingPongState, "full", isDark)}
    <text x="${x + w / 2}" y="${y - 16}" text-anchor="middle" font-size="11" fill="${dim}" ${font}>${fp.length_m} m</text>
    <text x="${x - 16}" y="${y + h / 2}" text-anchor="middle" font-size="11" fill="${dim}" ${font}
          transform="rotate(-90, ${x - 16}, ${y + h / 2})">${fp.width_m} m</text>
    <text x="${vw / 2}" y="${vh - 10}" text-anchor="middle" font-size="9.5" fill="${dim}" ${font}>Table 2.74 × 1.525 m (ITTF, fixed) · ${c.end_m} m behind each end, ${c.side_m} m each side</text>`;
}

/* ── The panel ───────────────────────────────────────────────────────────── */

function pingPongPanelHtml() {
  const sp = pingPongSpace(), fp = pingPongFootprint(), c = pingPongClearance(), w = pingPongWeight();
  const kg = n => Math.round(n).toLocaleString("en-US");

  const picker = ([, stateKey]) => {
    const group = PING_PONG_OPTIONS[stateKey];
    if (!group) return "";
    const keys = Object.keys(group.values);
    if (keys.length < 2) return "";
    const chosen = group.values[pingPongState[stateKey]];
    return `
      <div class="section">
        <label>${escapeHtml(group.label)}</label>
        <select data-pingpong="${escapeHtml(stateKey)}">
          ${keys.map(k => `<option value="${escapeHtml(k)}"${k === pingPongState[stateKey] ? " selected" : ""}>${escapeHtml(group.values[k].label)}</option>`).join("")}
        </select>
        ${chosen && chosen.note ? `<p class="hint">${escapeHtml(chosen.note)}</p>` : ""}
      </div>`;
  };

  const surface = PING_PONG_OPTIONS.surface && PING_PONG_OPTIONS.surface.values[pingPongState.surface];
  const table = PING_PONG_OPTIONS.table && PING_PONG_OPTIONS.table.values[pingPongState.table];
  const net = PING_PONG_OPTIONS.net && PING_PONG_OPTIONS.net.values[pingPongState.net];
  const cost = ((surface && surface.price) || 0) * w.area_m2 + ((table && table.price) || 0) + ((net && net.price) || 0);

  return `
    ${PING_PONG_GROUPS.map(picker).join("")}

    <div class="section">
      <label>The table is fixed</label>
      <div class="dims">
        <div class="dim-card"><div class="val">2.74 × 1.525 m</div><div class="lbl">ITTF table</div></div>
        <div class="dim-card"><div class="val">0.76 m</div><div class="lbl">Height</div></div>
      </div>
      <p class="hint">The ITTF fixes the table, so there is nothing to set here. What changes is the room around it.</p>
    </div>

    <div class="section">
      <label>${escapeHtml(sp.norm)}</label>
      <div class="dims">
        <div class="dim-card"><div class="val">${fp.length_m} × ${fp.width_m} m</div><div class="lbl">Playing space</div></div>
        <div class="dim-card"><div class="val">${c.end_m} m</div><div class="lbl">Behind each end</div></div>
        <div class="dim-card"><div class="val">${c.side_m} m</div><div class="lbl">Each side</div></div>
        <div class="dim-card"><div class="val">${Math.round(w.area_m2)} m²</div><div class="lbl">Roof taken, per table</div></div>
      </div>
    </div>

    <div class="section">
      <label>On the deck</label>
      <table class="planter-table">
        <tbody>
          ${w.parts.map(p => `<tr><td>${escapeHtml(p.what)}</td><td>${kg(p.kg)} kg</td></tr>`).join("")}
          <tr class="planter-group"><td>Total</td><td>${kg(w.total_kg)} kg</td></tr>
        </tbody>
      </table>
      <p class="hint">Estimated, from the parts. The structural check reads the total.</p>
    </div>

    <div class="section">
      <label>Cost, per table</label>
      <p class="hint">€ ${kg(cost)}${surface && surface.price ? ` — including ${surface.price} €/m² of surface` : " — the table and net only; it stands on the roof finish"}</p>
      <p class="hint">Estimated, not quoted.</p>
    </div>`;
}

function syncPingPongPanel(activityId) {
  const host = document.getElementById("activity-spec-panel");
  if (!host) return false;
  if (activityId !== "ping_pong") return false;

  if (!pingPongOptionsLoaded) {
    host.innerHTML = `<div class="section"><p class="hint">Loading table options…</p></div>`;
    loadPingPongOptions()
      .then(() => {
        syncPingPongPanel(activityId);
        if (typeof drawPingPongPreview === "function") drawPingPongPreview(document.getElementById("field"), isDarkMode());
      })
      .catch(err => {
        host.innerHTML = `
          <div class="section">
            <label>Reference database unavailable</label>
            <p class="hint">Table options live in the Sportify API, and it is not answering (${escapeHtml(err.message)}).</p>
            <button class="btn-export accent" id="btn-pingpong-retry">Retry</button>
          </div>`;
        const b = document.getElementById("btn-pingpong-retry");
        if (b) b.addEventListener("click", () => syncPingPongPanel(activityId));
      });
    return true;
  }

  host.innerHTML = pingPongPanelHtml();
  host.querySelectorAll("[data-pingpong]").forEach(sel => {
    sel.addEventListener("change", e => {
      pingPongState[e.target.dataset.pingpong] = e.target.value;
      pingPongApplyFootprint();
      syncPingPongPanel(activityId);
      if (typeof drawPingPongPreview === "function") drawPingPongPreview(document.getElementById("field"), isDarkMode());
    });
  });
  return true;
}

/** The playing space decides the size, not the generic boxes. */
function pingPongApplyFootprint() {
  if (typeof state === "undefined" || state.activityId !== "ping_pong") return;
  const fp = pingPongFootprint();
  state.activityLength = fp.length_m;
  state.activityWidth = fp.width_m;
  const l = document.getElementById("activityLength"), w = document.getElementById("activityWidth");
  if (l) l.value = fp.length_m;
  if (w) w.value = fp.width_m;
}

/* ── What a placed table carries ─────────────────────────────────────────── */

function pingPongPlacementPayload(state = pingPongState) {
  const sp = pingPongSpace(state), fp = pingPongFootprint(state);
  const c = pingPongClearance(state), w = pingPongWeight(state), a = pingPongAppearance(state);
  return {
    playing_space: state.playingSpace,
    table: state.table,
    net: state.net,
    surface: state.surface,
    appearance_hex: a.base,
    texture: a.texture,

    length_m: fp.length_m,
    width_m: fp.width_m,
    table_length_m: PING_PONG.table.length_m,
    table_width_m: PING_PONG.table.width_m,
    table_height_m: PING_PONG.table.height_m,
    table_top_thickness_m: PING_PONG.topThickness_m,
    net_height_m: PING_PONG.net.height_m,
    net_overhang_m: PING_PONG.net.overhang_m,
    line_width_m: PING_PONG.lineWidth_m,
    centre_line_width_m: PING_PONG.centreLineWidth_m,

    clearance_end_m: c.end_m,
    clearance_side_m: c.side_m,
    clear_height_min_m: 5.0,           // the ITTF asks 5 m over the playing space
    weight_kg: Math.round(w.total_kg),
    weight_kg_m2: Math.round(w.perM2_kg * 10) / 10,
    // The space's own note already names its authority, so it is not prefixed
    // again — "ITTF — ITTF — national competition" is nobody's idea of a source.
    source: sp.norm,
  };
}
