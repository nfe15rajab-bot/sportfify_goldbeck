/**
 * pushTray.js — the "Pushed to Combine" tray in the Sport and Facilities tabs (user, 2026-09-28).
 *
 * Push to Combine no longer jumps to the Combine tab: the piece goes into Combine's own tray (combineState.tray, the same list Combine's
 * "Pushed pieces" strip shows, so nothing is kept twice) and this panel, on the right above the floating "Next" button, lists it. Identical
 * pieces are one line with "× n". Below the list, where to go next, by the roof type chosen in the first step:
 *   Sports Core                 Proceed to Combine
 *   Mixed / Garden Core         Proceed to Garden Components · Proceed to Combine
 * "Proceed to Garden Components" opens Combine with the Garden Components panel open (canvasFlyouts.js).
 */

const PUSH_TRAY_MODES = ["sport", "facilities"];

/** The tray's pieces grouped: identical label and size (and kind) are one line, with how many and the ids (the last is removed first). */
function pushTrayGroups() {
  const groups = new Map();
  (combineState.tray || []).forEach(it => {
    const key = [it.kind, it.label, Number(it.length_m).toFixed(2), Number(it.width_m).toFixed(2)].join("|");
    if (!groups.has(key)) groups.set(key, { key, label: it.label, kind: it.kind, l: Number(it.length_m), w: Number(it.width_m), ids: [] });
    groups.get(key).ids.push(it.id);
  });
  return [...groups.values()];
}

function pushTrayEl() {
  let el = document.getElementById("push-tray");
  if (!el) {
    el = document.createElement("aside");
    el.id = "push-tray";
    el.className = "push-tray";
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

/** Draws the tray; shown only in the Sport and Facilities tabs. `flashKey` briefly highlights the line just pushed. */
function renderPushTray(flashKey) {
  const el = pushTrayEl();
  const mode = typeof activeMode !== "undefined" ? activeMode : "";
  el.hidden = !PUSH_TRAY_MODES.includes(mode);
  if (el.hidden) return;
  const groups = pushTrayGroups(), total = (combineState.tray || []).length;
  const fmt = n => String(Math.round(n * 100) / 100);
  const rows = groups.length ? groups.map(g => {
    const name = g.label;
    return `<div class="push-tray-row${g.key === flashKey ? " flash" : ""}">
        <span class="push-tray-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="push-tray-size">${fmt(g.l)} × ${fmt(g.w)} m</span>
        <span class="push-tray-count">× ${g.ids.length}</span>
        <button type="button" class="push-tray-remove" data-push-tray-remove="${escapeHtml(g.key)}" title="Remove one">×</button>
      </div>`;
  }).join("") : `<p class="push-tray-empty">Nothing pushed yet. Push to Combine adds pieces here; you stay in this tab.</p>`;
  const program = typeof getRoofProgram === "function" ? getRoofProgram() : null;
  const sportsCore = !!(program && program.key === "sports");
  const buttons = (sportsCore ? "" : `<button type="button" class="btn-export" data-push-tray-go="components"><i class="ti ti-components" aria-hidden="true"></i>Proceed to Garden Components</button>`)
    + `<button type="button" class="btn-export accent" data-push-tray-go="combine"><i class="ti ti-arrow-bar-to-right" aria-hidden="true"></i>Proceed to Combine</button>`;
  el.innerHTML = `<div class="push-tray-head"><i class="ti ti-package" aria-hidden="true"></i> Pushed to Combine <span class="push-tray-total">${total}</span></div>
    <div class="push-tray-list">${rows}</div>
    <div class="push-tray-actions">${buttons}</div>`;
}

/** A piece was just pushed: redraw the tray with that line highlighted. */
function pushTrayAdded(item) {
  if (!item) { renderPushTray(); return; }
  renderPushTray([item.kind, item.label, Number(item.length_m).toFixed(2), Number(item.width_m).toFixed(2)].join("|"));
}

// wired once, at load (the panel's contents are redrawn, the listener is not)
document.addEventListener("click", e => {
  const rm = e.target.closest && e.target.closest("[data-push-tray-remove]");
  if (rm) {
    const g = pushTrayGroups().find(x => x.key === rm.dataset.pushTrayRemove);
    if (g && typeof removeFromTray === "function") removeFromTray(g.ids[g.ids.length - 1]);
    renderPushTray();
    return;
  }
  const go = e.target.closest && e.target.closest("[data-push-tray-go]");
  if (go) {
    if (go.dataset.pushTrayGo === "components" && typeof setCanvasFlyout === "function") setCanvasFlyout("furniture-flyout", true);
    else if (typeof setMode === "function") setMode("combine");
  }
});
