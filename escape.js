/**
 * escape.js — the one way text goes into markup.
 *
 * The app builds its screens by joining HTML strings and assigning them to innerHTML. Text that reaches such a string unescaped IS markup: a plant, a build-up or a
 * piece of furniture whose name was typed in the Catalogue tab (or came from the API, or a saved session file, or a family in someone's Revit) could carry a <script>-like
 * payload or break out of an attribute. Every ${...} that puts a name, a label, a description, a note, a source, a provider or an error message into a template goes
 * through escapeHtml; a link's address through safeUrl. tools/escape-audit-test.js reads every script and fails when one does not.
 *
 * escapeHtml escapes & < > " ' and the backtick, so it is right for text between tags and inside a quoted attribute (double or single).
 */

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"'`]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[ch]));
}

/**
 * An address for an href or a src: a link with no scheme (a relative path) or with http, https or mailto passes, and so does an inline image (data:image/png|jpeg|gif|webp);
 * anything else (javascript:, vbscript:, data:text/html, ...) becomes "#". Returned escaped, so it can go straight into a quoted attribute.
 */
function safeUrl(u) {
  const t = String(u == null ? "" : u).trim();
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(t.replace(/[\u0000-\u0020]/g, ""));
  if (!scheme) return escapeHtml(t);
  const s = scheme[1].toLowerCase();
  if (s === "http" || s === "https" || s === "mailto") return escapeHtml(t);
  if (s === "data" && /^data:image\/(png|jpe?g|gif|webp);/i.test(t)) return escapeHtml(t);
  return "#";
}
