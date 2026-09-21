/* Runs before the stylesheet paints so the saved/system theme applies
   immediately — no flash of the wrong mode. A saved choice always wins;
   first-ever visit falls back to the OS preference, then to dark
   (this app's original default). */
(function () {
  try {
    var saved = localStorage.getItem("sportify-theme");
    var mode = (saved === "light" || saved === "dark")
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.mode = mode;
  } catch (e) {
    document.documentElement.dataset.mode = "dark";
  }
})();
