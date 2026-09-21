/**
 * combineHistory.js — undo and redo on the Combine canvas
 *
 * ── Why this watches instead of being told ──
 * The obvious design is a pushUndo() call before every mutating action. That
 * needs finding and editing every call site — adding a piece, removing one,
 * moving one, drawing a zone, dragging a corner, adding a corner, changing the
 * roof finish, clearing everything — and the failure mode is silent: one site
 * missed and that action simply cannot be undone, which is worse than no undo
 * because you only discover it when you need it.
 *
 * So this watches the state instead. After every redraw it compares a snapshot
 * against the top of the stack and pushes if they differ. Anything that
 * changes the design gets recorded, including code written later that never
 * heard of this file.
 *
 * ── The one thing that has to be guarded ──
 * A drag redraws on every pointermove. Recording each frame would fill the
 * stack with a hundred identical-looking steps and make one Ctrl+Z move a
 * bench by a pixel. So nothing is recorded while a drag is in progress — the
 * whole drag lands as a single step when the pointer comes up.
 */

const UNDO_LIMIT = 40;
const undoStack = [];
const redoStack = [];

/** Set while restoring, so the restore's own redraw is not recorded as a step. */
let restoringHistory = false;

/**
 * Everything that makes a design a design. The roof itself is included because
 * resizing it is an edit too, and undoing a piece without undoing the roof it
 * was placed on would restore a layout that never existed.
 */
function captureCombineState() {
  if (typeof combineState === "undefined") return null;
  return JSON.stringify({
    roof: combineState.roof,
    items: combineState.items,
    zones: combineState.zones,
    entryPoints: combineState.entryPoints,
    finish: typeof roofFinishKey !== "undefined" ? roofFinishKey : null,
  });
}

/**
 * A short description of what changed, worked out by comparing the two
 * snapshots. "Undid something" is useless; "Undid: added a bench" tells you
 * whether to press it again.
 */
function describeChange(before, after) {
  try {
    const a = JSON.parse(before), b = JSON.parse(after);
    const ai = a.items?.length ?? 0, bi = b.items?.length ?? 0;
    const az = a.zones?.length ?? 0, bz = b.zones?.length ?? 0;
    const ae = a.entryPoints?.length ?? 0, be = b.entryPoints?.length ?? 0;

    // A label for the thing that changed, named by what it is rather than by
    // its internal kind — nobody thinks of a bench as a "furniture item".
    const named = list => {
      const last = list?.[list.length - 1];
      return last?.label || "a piece";
    };

    if (bi > ai) return `added ${named(b.items)}`;
    if (bi < ai) return `removed ${named(a.items)}`;
    if (bz > az) return "drew a zone";
    if (bz < az) return "removed a zone";
    if (be > ae) return "added an entrance";
    if (be < ae) return "removed an entrance";
    if (a.finish !== b.finish) return "changed the roof finish";
    if (JSON.stringify(a.roof) !== JSON.stringify(b.roof)) return "changed the roof";
    if (JSON.stringify(a.zones) !== JSON.stringify(b.zones)) return "reshaped a zone";
    return "moved a piece";
  } catch (e) {
    return "a change";
  }
}

/**
 * Called after every redraw. Cheap when nothing changed — a string compare —
 * which is why it can afford to run this often.
 */
function recordCombineHistory() {
  if (restoringHistory) return;
  // Mid-drag the state changes on every frame; the step is the whole drag.
  if (typeof dragState !== "undefined" && dragState) return;

  const snap = captureCombineState();
  if (snap == null) return;

  if (undoStack.length === 0) { undoStack.push(snap); return; }
  if (undoStack[undoStack.length - 1] === snap) return;

  undoStack.push(snap);
  // A new action makes the redo branch unreachable, which is what every editor
  // does and what people expect.
  redoStack.length = 0;
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function restoreCombineState(snapshot) {
  const s = JSON.parse(snapshot);
  restoringHistory = true;
  try {
    combineState.roof = s.roof;
    combineState.items = s.items || [];
    combineState.zones = s.zones || [];
    combineState.entryPoints = s.entryPoints || [];
    if (typeof roofFinishKey !== "undefined" && s.finish) roofFinishKey = s.finish;

    // A selection pointing at something that no longer exists leaves handles
    // drawn around nothing.
    const stillThere = combineState.items.some(i => i.id === combineState.selectedId)
                    || combineState.zones.some(z => z.id === combineState.selectedId);
    if (!stillThere) { combineState.selectedId = null; combineState.selectedKind = null; }

    if (typeof refreshSuggestions === "function") refreshSuggestions();
    else if (typeof drawCombineCanvas === "function") drawCombineCanvas();
    if (typeof renderZonePanel === "function" && !document.getElementById("zone-flyout")?.hidden) renderZonePanel();
    if (typeof renderFurniturePanel === "function" && !document.getElementById("furniture-flyout")?.hidden) renderFurniturePanel();
  } finally {
    restoringHistory = false;
  }
}

function undoCombine() {
  if (undoStack.length < 2) {
    if (typeof showToast === "function") showToast("Nothing to undo", "This is as far back as it goes.");
    return;
  }
  const current = undoStack.pop();
  const previous = undoStack[undoStack.length - 1];
  redoStack.push(current);
  const what = describeChange(previous, current);
  restoreCombineState(previous);
  if (typeof showToast === "function") showToast("Undone", `${what.charAt(0).toUpperCase()}${what.slice(1)} — Ctrl+Shift+Z to put it back.`);
}

function redoCombine() {
  if (!redoStack.length) {
    if (typeof showToast === "function") showToast("Nothing to redo", "Nothing has been undone.");
    return;
  }
  const next = redoStack.pop();
  const what = describeChange(undoStack[undoStack.length - 1], next);
  undoStack.push(next);
  restoreCombineState(next);
  if (typeof showToast === "function") showToast("Redone", `${what.charAt(0).toUpperCase()}${what.slice(1)}.`);
}

/* ── Keyboard ────────────────────────────────────────────────────────────── */

document.addEventListener("keydown", e => {
  // Not while typing: Ctrl+Z in a text box belongs to the text box.
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (typeof activeMode !== "undefined" && activeMode !== "combine") return;
  if (!(e.ctrlKey || e.metaKey)) return;

  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) { e.preventDefault(); undoCombine(); }
  else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redoCombine(); }
});
