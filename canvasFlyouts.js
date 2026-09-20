/**
 * canvasFlyouts.js — one owner for the panels that open over the roof
 *
 * Zones, Plants, Furniture, Rules and Tools all slide out from the left of the
 * canvas. They were each opening themselves, in three different ways, and only
 * some of them knew about the others — so opening Plants while Zones was up
 * stacked one panel on another and neither was fully readable.
 *
 * They are the same thing and they occupy the same corner, so exactly one is
 * open at a time and one function decides which.
 */

/* Rules and Tools are not here: they became tabs in the right-hand panel when
   that pane stopped being a wizard, so they no longer compete for this corner. */
const CANVAS_FLYOUTS = {
  "zone-flyout":       { button: "btn-zone-toggle",       close: "btn-zone-close",       render: () => renderZonePanel?.() },
  "vegetation-flyout": { button: "btn-vegetation-toggle", close: "btn-vegetation-close", render: () => renderVegetationPanel?.() },
  "furniture-flyout":  { button: "btn-furniture-toggle",  close: "btn-furniture-close",  render: () => renderFurniturePanel?.() },
};

/**
 * Opens one and closes the rest.
 *
 * `hidden` stays the source of truth, because a dozen places already read it.
 * The sliding is done in CSS off that same attribute — see the rule that keeps
 * a hidden flyout displayed but transparent and pushed off to the left, so
 * there is something for the transition to animate between.
 */
function setCanvasFlyout(id, open) {
  const target = document.getElementById(id);
  if (!target) return;

  const wantOpen = open === undefined ? target.hidden : open;

  // The flyouts live on the Combine canvas, so opening one from the rail means
  // going there first — otherwise the button appears to do nothing from Sport.
  if (wantOpen && typeof setMode === "function"
      && typeof activeMode !== "undefined" && activeMode !== "combine") {
    setMode("combine");
  }

  Object.entries(CANVAS_FLYOUTS).forEach(([otherId, meta]) => {
    const el = document.getElementById(otherId);
    if (!el) return;
    const isTarget = otherId === id;
    const shouldShow = isTarget && wantOpen;
    el.hidden = !shouldShow;
    document.getElementById(meta.button)?.classList.toggle("active", shouldShow);
    // Rendered on open rather than kept warm: a panel nobody is looking at
    // does not need to be up to date, and several of them fetch.
    if (shouldShow && meta.render) meta.render();
  });
}

function closeCanvasFlyouts() {
  Object.keys(CANVAS_FLYOUTS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
    const btn = document.getElementById(CANVAS_FLYOUTS[id].button);
    btn?.classList.remove("active");
  });
}

/* ── The old per-panel toggles now all go through here ──────────────────── */

function toggleZoneFlyout(force)       { setCanvasFlyout("zone-flyout", force); }
function toggleVegetationFlyout(force) { setCanvasFlyout("vegetation-flyout", force); }
function toggleFurnitureFlyout(force)  { setCanvasFlyout("furniture-flyout", force); }
/* Kept because a couple of call sites still ask for a flyout by id. */
function toggleDesignFlyout(id, force) { setCanvasFlyout(id, force); }

/* One place wires all of them — the rail button opens it, the × closes it.
   They were wired in three separate files before, which is how two of them
   ended up not knowing about each other. */
Object.entries(CANVAS_FLYOUTS).forEach(([id, meta]) => {
  document.getElementById(meta.button)?.addEventListener("click", () => setCanvasFlyout(id));
  document.getElementById(meta.close)?.addEventListener("click", () => setCanvasFlyout(id, false));
});

/* Escape closes whatever is open — the panel covers the roof, and reaching for
   a small × to get back to the drawing is a poor trade. */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = Object.keys(CANVAS_FLYOUTS).find(id => !document.getElementById(id)?.hidden);
  if (open) { e.preventDefault(); closeCanvasFlyouts(); }
});
