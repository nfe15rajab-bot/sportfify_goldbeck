/**
 * where.js — "what is done where" on the screen: the status of Revit in the top bar, the badge that marks an action which needs Revit (or Unity, or SOLIDWORKS), and the
 * "What runs where" card on the Overview. The rule and the words are in whereCore.js (pure, tested); the state comes from what the app already knows: workspaceBridge.js (is the
 * add-in answering, which Revit) and profile.js (what this computer has, from GET /capabilities). Nothing here asks anything of Revit.
 *
 * Not being in Revit is a normal state (2D work goes on), so it is grey, not red. A badge on an action says where it happens; when what it needs is missing the badge turns grey and
 * its tooltip says what is needed. The buttons keep their own logic for being disabled: this only says why.
 */

let whereLastKey = "";

/** What the app knows now: is Revit connected (true, false, or null before the first answer), which Revit, and what this computer has. */
function whereContext() {
  const ws = typeof workspaceState !== "undefined" ? workspaceState : null;
  return {
    connected: ws ? ws.connected : null,
    version: ws && typeof ws.revitVersion === "string" ? ws.revitVersion : "",
    machine: typeof profileState !== "undefined" ? profileState.machine : null
  };
}

/** The badge for an action that needs `need` ("revit", "unity", "solidworks"), as markup for the places that draw their buttons themselves (the Documents tab, the Run panel). */
function whereChipHtml(need) {
  const n = whereNeed(need, whereContext());
  if (!n.name) return "";
  return `<span class="where-chip${n.ok ? "" : " where-chip-off"}" data-where-need="${escapeHtml(need)}" title="${escapeHtml(n.ok ? "This happens in " + n.name + "." : n.reason)}">${escapeHtml(n.name)}</span>`;
}

function whereRenderPill(ctx) {
  const pill = document.getElementById("whereRevit");
  if (!pill) return;
  const s = whereRevitState(ctx.connected, ctx.version);
  pill.className = "where-pill where-" + s.key;
  pill.title = s.title;
  const label = document.getElementById("whereRevitLabel");
  if (label) label.textContent = s.label;
}

function whereStatusChip(key, label, extraClass) {
  return `<span class="where-status-chip where-status-${escapeHtml(key)}"><span class="where-dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

/** The Overview's card: the rule, the three columns, and the status of Revit, Unity and SOLIDWORKS right now. Drawn again only when something in it changed. */
function whereRenderCard(ctx) {
  const el = document.getElementById("overviewWhere");
  if (!el) return;
  const revit = whereRevitState(ctx.connected, ctx.version);
  const unity = whereToolState("Unity", ctx.machine && ctx.machine.unity, ctx.connected);
  const sw = whereToolState("SOLIDWORKS", ctx.machine && ctx.machine.solidworks, ctx.connected);
  const key = [revit.key, revit.label, unity.key, sw.key].join("|");
  if (key === whereLastKey && el.innerHTML) return;
  whereLastKey = key;
  el.innerHTML = `
    <p class="where-rule">${escapeHtml(WHERE_RULE)}</p>
    <div class="where-cols">${WHERE_COLUMNS.map(col => `
      <div class="where-col where-col-${escapeHtml(col.key)}">
        <div class="where-col-head"><i class="ti ${escapeHtml(col.icon)}" aria-hidden="true"></i><span class="where-col-title">${escapeHtml(col.title)}</span><span class="where-col-tag">${escapeHtml(col.tagline)}</span></div>
        <ul>${col.points.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
      </div>`).join("")}</div>
    <div class="where-status">${whereStatusChip(revit.key, revit.label)}${whereStatusChip(unity.key, unity.label)}${whereStatusChip(sw.key, sw.label)}</div>
    <p class="hint where-same">${escapeHtml(WHERE_SAME_NUMBERS)}</p>`;
}

/** A badge on every element that says what it needs (data-needs="revit"), once, kept up to date. */
function whereDecorate(ctx) {
  document.querySelectorAll("[data-needs]").forEach(el => {
    const n = whereNeed(el.dataset.needs, ctx);
    if (!n.name) return;
    let chip = el.querySelector(".where-chip");
    if (!chip) {
      chip = document.createElement("span");
      chip.className = "where-chip";
      chip.dataset.whereNeed = el.dataset.needs;
      chip.textContent = n.name;
      el.appendChild(chip);
    }
    chip.classList.toggle("where-chip-off", !n.ok);
    chip.title = n.ok ? "This happens in " + n.name + "." : n.reason;
  });
}

/** Everything that shows the state of Revit and the tools, drawn again. Called when the connection changes, when the add-in says what this computer has, and at start. */
function whereRender() {
  const ctx = whereContext();
  whereRenderPill(ctx);
  whereRenderCard(ctx);
  whereDecorate(ctx);
}

function whereInit() {
  // the pill leads to the explanation: the Overview's card
  document.getElementById("whereRevit")?.addEventListener("click", () => {
    if (typeof setMode === "function") setMode("guide");
    setTimeout(() => { const card = document.getElementById("overviewWhere"); if (card && card.scrollIntoView) card.scrollIntoView({ block: "center", behavior: "smooth" }); }, 150);
  });
  whereRender();
}
