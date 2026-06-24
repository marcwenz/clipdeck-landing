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

// ----- Windows waitlist modal --------------------------------
// The Windows build isn't out yet. The hero's Windows button
// ([data-win-trigger]) opens a branded modal with an email signup instead of
// a download. Submissions POST to the same Apps Script Web App as the pageview
// ping, tagged type:"waitlist" so they land in the waitlist sheet.
(function windowsWaitlistModal() {
  const modal = document.getElementById("win-modal");
  const triggers = document.querySelectorAll("[data-win-trigger]");
  if (!modal || !triggers.length) return;

  const form    = modal.querySelector("[data-wl-form]");
  const success = modal.querySelector("[data-wl-success]");
  const input   = modal.querySelector("#wl-email");
  const errorEl = modal.querySelector("#wl-error");
  const submit  = modal.querySelector(".wl-submit");

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isLocal  = ["localhost", "127.0.0.1", ""].includes(location.hostname);

  let lastFocus = null;
  // Background elements made inert while the modal is open — keeps focus and
  // screen-reader navigation contained to the dialog (and the JS focus trap
  // below cleanly cycles Tab for browsers that lack inert support).
  const background = Array.prototype.filter.call(
    document.body.children,
    (el) => el !== modal && el.tagName !== "SCRIPT"
  );

  function getFocusable() {
    return Array.prototype.filter.call(
      modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      (el) => el.offsetParent !== null
    );
  }

  function resetForm() {
    if (form)    form.hidden = false;
    if (success) success.hidden = true;
    if (errorEl) errorEl.textContent = "";
    if (input)   { input.value = ""; input.classList.remove("is-invalid"); }
    if (submit)  submit.disabled = false;
  }

  function open(triggerEl) {
    lastFocus = triggerEl;
    resetForm();
    modal.hidden = false;
    document.body.classList.add("win-modal-open");
    background.forEach((el) => { el.inert = true; });
    if (input) input.focus();
    document.removeEventListener("keydown", onKeydown); // guard against duplicates
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("win-modal-open");
    background.forEach((el) => { el.inert = false; });
    document.removeEventListener("keydown", onKeydown);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      const f = getFocusable();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function showError(msg) {
    // role="alert" on #wl-error announces the text; .wl-error:empty hides it
    // when cleared, so setting/clearing textContent is all that's needed.
    if (errorEl) errorEl.textContent = msg;
    if (input)   { input.classList.add("is-invalid"); input.focus(); }
  }

  // Best-effort, no-cors (the response can't be read). Skip the network call
  // on localhost so dev testing doesn't add rows to the live sheet.
  function send(email) {
    if (isLocal || !APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("REPLACE_WITH")) return;
    const payload = JSON.stringify({
      type: "waitlist",
      email: email,
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
      ref: document.referrer || ""
    });
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    // sendBeacon returns false if it couldn't queue the request — fall back to fetch.
    if (navigator.sendBeacon && navigator.sendBeacon(APPS_SCRIPT_URL, blob)) return;
    fetch(APPS_SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload, keepalive: true
    }).catch(() => {});
  }

  triggers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      open(btn);
    });
  });

  // Close on backdrop / X — anything tagged [data-win-close].
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-win-close]")) close();
  });

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = ((input && input.value) || "").trim();
      if (!EMAIL_RE.test(email)) {
        showError("Please enter a valid email address.");
        return;
      }
      if (errorEl) errorEl.textContent = "";
      if (input)   input.classList.remove("is-invalid");
      if (submit)  submit.disabled = true;
      send(email);
      // Optimistic success — the no-cors POST can't be confirmed client-side.
      // Move focus to the success block (role="status") so it's announced.
      if (form)    form.hidden = true;
      if (success) { success.hidden = false; success.focus(); }
    });
  }

  // Clear the invalid state as the user corrects their email.
  if (input) {
    input.addEventListener("input", () => {
      input.classList.remove("is-invalid");
      if (errorEl) errorEl.textContent = "";
    });
  }
})();
