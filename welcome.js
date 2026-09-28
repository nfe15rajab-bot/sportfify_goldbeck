/**
 * welcome.js — the welcome screen (user, 2026-09-28)
 * A full-screen court photo shown first on every start, over the start card (sessionGate.js): "Welcome to" (Jura), SPORTIFY written letter by letter
 * (Bruno Ace), and a black Continue button (Jura). The animation itself is CSS (style.css, .welcome-*); this file only takes the screen away:
 * Continue (or Enter / Space / Escape) fades it out and removes it, leaving the start card exactly as it was.
 */

(function () {
  const screen = document.getElementById("welcomeScreen");
  const btn = document.getElementById("btn-welcome-continue");
  if (!screen || !btn) return;

  let leaving = false;
  function leaveWelcome() {
    if (leaving) return;
    leaving = true;
    screen.classList.add("welcome-leaving");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => screen.remove(), 450);
  }
  function onKey(e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); leaveWelcome(); }
  }

  btn.addEventListener("click", leaveWelcome);
  document.addEventListener("keydown", onKey);
  // the button fades in after the word is written: it takes the focus once it is there, so Enter works and a keyboard user lands on it
  setTimeout(() => { if (!leaving) btn.focus({ preventScroll: true }); }, 2600);
})();
