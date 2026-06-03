// =============================================================
// Clip Deck — Waitlist form + page view tracking
//
// Both the form submit and a one-shot pageview ping POST to the
// same Google Apps Script Web App. The Apps Script dispatches by
// the `type` field in the payload:
//   - type "waitlist" → waitlist sheet
//   - type "pageview" → page_views sheet (auto-created)
// Setup is in apps-script.gs at the project root.
// =============================================================

// Replace this with the deployment URL from the Google Apps Script setup.
// After replacing, submit a test email and CHECK THE SPREADSHEET — the
// form uses no-cors and will show success even if the URL is wrong.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbfXdbK7F_xIRZBK9EMqGKA9rREBaK8xfR4JZcnHaiGalSjNyUooNGmf9Tqi8kY9BP/exec";

// ----- Page view ping ----------------------------------------
// Fires once on page load. Uses sendBeacon so it doesn't block the
// page render and survives navigation away. Skips localhost so dev
// pageloads don't pollute the sheet.

function trackPageView() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return;
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("REPLACE_WITH")) return;

  const payload = JSON.stringify({
    type: "pageview",
    ts: new Date().toISOString(),
    path: location.pathname + location.search,
    ref: document.referrer || "",
    ua: navigator.userAgent,
    lang: navigator.language || "",
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`
  });

  const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(APPS_SCRIPT_URL, blob);
  } else {
    // Fallback for older browsers that lack sendBeacon
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }
}

trackPageView();

// ----- Smooth scrolling over the interactive panel preview -------
// The hero's interactive panel is a same-origin <iframe>. When the cursor is
// over it, the browser delivers wheel events to the iframe instead of the
// page, so scrolling there loses its native momentum and feels choppy compared
// with the rest of the page. Fix: while the user is actively scrolling, make
// the iframe click-through so the wheel reaches the page (native inertia
// kicks back in); restore full interactivity a beat after scrolling settles.
// Parent-only — the embedded panel itself is left untouched.
(function smoothScrollOverPanel() {
  const frame = document.querySelector(".mockup--interactive iframe");
  if (!frame) return;

  const IDLE_MS = 220; // how long after the last wheel tick to re-enable clicks
  let idleTimer = null;
  let passing = false;

  function engage() {
    if (!passing) {
      frame.style.pointerEvents = "none";
      passing = true;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(release, IDLE_MS);
  }
  function release() {
    frame.style.pointerEvents = "";
    passing = false;
  }

  // Wheel over the parent page — and over the iframe once it's click-through.
  window.addEventListener("wheel", engage, { passive: true });

  // Same-origin: also catch a wheel that *starts* while the cursor is over the
  // live, interactive panel, before passthrough has had a chance to engage.
  function hookPanel() {
    try {
      frame.contentWindow.addEventListener("wheel", engage, { passive: true });
    } catch (_) {
      // Cross-origin fallback (shouldn't happen here): the window listener
      // still covers scrolling once the pointer leaves the iframe.
    }
  }
  frame.addEventListener("load", hookPanel);
  hookPanel();
})();

// ----- Windows (beta) install-guide modal --------------------
// The Windows .exe isn't code-signed yet, so SmartScreen throws a "Windows
// protected your PC" warning on first run. To set expectations, any link with
// [data-win-trigger] opens a branded modal that walks the user through
// "More info → Run anyway" before the download fires.
//
// The hero Windows button is still a real download anchor pointing at the
// GitHub Release URL, so if this script fails to load the click just starts
// the download directly (progressive enhancement — no broken state).
(function windowsBetaModal() {
  const modal = document.getElementById("win-modal");
  const triggers = document.querySelectorAll("[data-win-trigger]");
  if (!modal || !triggers.length) return;

  let lastFocus = null;

  function open(triggerEl) {
    lastFocus = triggerEl;
    modal.hidden = false;
    document.body.classList.add("win-modal-open");
    // Hand focus to the first interactive element inside the panel so keyboard
    // users land somewhere sensible. We pick the panel itself first so screen
    // readers announce the dialog before reading the trigger button label.
    const focusables = modal.querySelectorAll(
      'button, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) focusables[0].focus();
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("win-modal-open");
    document.removeEventListener("keydown", onKeydown);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  triggers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      open(btn);
    });
  });

  // Close on backdrop / X / Cancel — anything tagged [data-win-close].
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-win-close]")) close();
  });

  // Confirm button is the real download link; let the browser handle the
  // navigation, then quietly close the modal a beat later.
  const confirmBtn = modal.querySelector("[data-win-confirm]");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      setTimeout(close, 250);
    });
  }
})();
