// client.js — DEMO STUB for the Clip Deck landing-page panel.
//
// The real client.js POSTs to the in-Premiere CEP backend over HTTP. There's
// no backend in the browser, so this stub exposes the SAME method surface
// (window.ClipDeckClient) with benign no-ops. Crucially isConnected() returns
// true and startWatchdog() reports connected once, so the renderer's
// "Premiere not connected" banner never shows in the demo.
//
// Card-fire / import actions are ALSO guarded at the call site in app.jsx
// (the `if (window.CLIPDECK_DEMO) return;` no-ops), so these methods should
// never actually be reached during normal demo use — they exist only to keep
// the interface complete and crash-free.

(function (global) {
  function resolveNull() { return Promise.resolve(null); }

  async function tryFetch() { return null; }
  async function health() { return { ok: true, demo: true }; }
  async function importAsset() { return null; }              // would return a nodeId
  async function overwriteAt() { return { ok: true, demo: true }; }
  async function smartOverwriteAt() { return { ok: true, demo: true }; }
  async function selectAtTime() { return { ok: true, demo: true }; }
  async function getState() { return { ok: true, demo: true }; }
  async function getProjectPath() { return { path: null, directory: null, saved: false }; }

  // Always "connected" so the ConnectBanner stays hidden in the demo.
  function isConnected() { return true; }

  // Report connected once, then stop. Returns a falsy timer id (no interval).
  function startWatchdog(onChange) {
    if (typeof onChange === "function") { try { onChange(true); } catch (e) {} }
    return 0;
  }

  global.ClipDeckClient = {
    health: health,
    importAsset: importAsset,
    overwriteAt: overwriteAt,
    smartOverwriteAt: smartOverwriteAt,
    selectAtTime: selectAtTime,
    getState: getState,
    getProjectPath: getProjectPath,
    isConnected: isConnected,
    startWatchdog: startWatchdog,
    tryFetch: tryFetch,
  };
})(this);
