// demo-bridge.js — browser stub for the Electron preload bridge.
//
// The real Clip Deck renderer talks to native macOS / Premiere code through
// two injected globals: `window.clipDeck` (the preload IPC surface, ~64
// methods) and `window.ClipDeckClient` (HTTP to the in-Premiere backend,
// stubbed separately in client.js). In the landing-page panel neither exists,
// so this file fakes `window.clipDeck` with benign no-ops that resolve the
// same shapes the renderer expects — nothing here ever touches the network,
// the disk, Premiere, or opens a window.
//
// LOAD ORDER: this must run BEFORE store.js, client.js and app.jsx so the
// globals exist on first render. index.html loads demo-config.js (which sets
// window.__CLIPDECK_DEMO_CONFIG) immediately before this file.
//
// Two flags drive the demo elsewhere in the renderer:
//   window.CLIPDECK_DEMO === true  → app.jsx early-returns marketing graphics
//                                     for the Pixabay / YouTube / Utility
//                                     webviews (which can't run in a browser)
//                                     and makes every card-fire a silent no-op.
//   license.jsx FORCE_PRO === true → the whole panel behaves as Pro.

(function () {
  // Flip the renderer into demo mode (read in app.jsx guards).
  window.CLIPDECK_DEMO = true;

  // Pro license snapshot handed to every license read/refresh. license.jsx's
  // FORCE_PRO already forces Pro regardless, but returning a Pro-shaped object
  // here keeps the cached → validated paint path consistent and badge-free.
  var PRO_LICENSE = {
    pro: true,
    isPro: true,
    licenseKey: null,
    email: null,
    grandfathered: false,
    proSince: null,        // null → "Request Refund" link never shows
    hasRefunded: false,
    refundedAt: null,
    validUntil: null,
    lastValidatedAt: Date.now(),
    offline: false,
    loading: false,
  };

  // Returns the baked, privacy-scrubbed library config. Lazy lookup so it
  // works regardless of script order. Falls back to an empty config object.
  function demoConfig() {
    return (typeof window.__CLIPDECK_DEMO_CONFIG !== "undefined" && window.__CLIPDECK_DEMO_CONFIG) || {};
  }

  // Subscriber factory: returns an unsubscribe no-op and NEVER invokes the
  // callback, so background events (Pro-onboarding, SFX-download toasts,
  // update prompts, nav-activate, etc.) can't auto-fire in the demo.
  function noopSubscribe() { return function () {}; }

  // Generic benign async resolvers.
  function resolveTrue()  { return Promise.resolve(true); }
  function resolveNull()  { return Promise.resolve(null); }
  function resolveOkFalse(){ return Promise.resolve({ ok: false }); }

  window.clipDeck = {
    // ── config ──────────────────────────────────────────────────────────
    readConfig:  function () { return Promise.resolve(demoConfig()); },
    // Session-only: edits live in React state and reset on reload. We do NOT
    // persist (avoids the ~5 MB localStorage cap once base64 thumbs are in).
    writeConfig: function () { return resolveTrue(); },
    backendPort: function () { return Promise.resolve(47291); },
    deviceState: function () { return Promise.resolve({}); },

    // ── license (always Pro) ────────────────────────────────────────────
    readLicense:        function () { return Promise.resolve(PRO_LICENSE); },
    refreshLicense:     function () { return Promise.resolve(PRO_LICENSE); },
    signOut:            function () { return Promise.resolve(PRO_LICENSE); },
    openCheckout:       function () { /* no window.open in the demo */ },
    activateLicenseKey: function () { return Promise.resolve({ ok: true, license: PRO_LICENSE }); },
    fetchLaunchStatus:  function () { return Promise.resolve({ ok: true, active: false }); },
    startMagicLogin:    function () { return Promise.resolve({ ok: true }); },
    listDevices:        function () { return Promise.resolve({ ok: true, devices: [] }); },
    deactivateDevice:   function () { return Promise.resolve({ ok: true }); },
    requestRefund:      function () { return resolveOkFalse(); },
    submitRefundFeedback: function () { return Promise.resolve({ ok: true }); },
    onLicenseActivated: noopSubscribe,

    // ── VFX (cgfy) — locked behind "Coming Soon" anyway ─────────────────
    cgfy: {
      listCredits:     function () { return Promise.resolve({ ok: true, credits: 0 }); },
      exportSelection: function () { return resolveOkFalse(); },
      submit:          function () { return resolveOkFalse(); },
      pollJob:         function () { return resolveOkFalse(); },
      downloadResult:  function () { return resolveOkFalse(); },
      openCheckout:    function () { /* no-op */ },
    },

    // ── file pickers / library import-export ────────────────────────────
    pickFile:      resolveNull,
    pickImage:     resolveNull,
    exportLibrary: function () { return resolveOkFalse(); },
    importLibrary: resolveNull,
    onCdkImported: noopSubscribe,

    // ── hotkeys / nav ───────────────────────────────────────────────────
    setHotkey:          resolveTrue,
    setSearchHotkey:    resolveTrue,
    registerNavHotkeys: function () { return Promise.resolve([]); },
    onNavActivate:      noopSubscribe,
    notifyNavReady:     function () { /* ipc send → void */ },
    hideOverlay:        function () { /* void */ },
    focusTimeline:      function () { /* void */ },

    // ── clipboard capture / fire (Premiere) ─────────────────────────────
    captureClipboard:               resolveOkFalse,
    captureTransitionFromClipboard: resolveOkFalse,
    fireClipboard:                  resolveOkFalse,
    deleteCapture:                  resolveTrue,

    // ── Pixabay SFX (webview replaced by graphic in demo) ───────────────
    downloadSfx:          resolveOkFalse,
    getSfxPreloadUrl:     resolveNull,
    relocateSfx:          resolveOkFalse,
    setSfxProjectContext: resolveTrue,
    onSfxDownloadStarted: noopSubscribe,
    onSfxDownloaded:      noopSubscribe,
    onSfxDownloadFailed:  noopSubscribe,

    // ── effects / transitions (recipe pipeline) ─────────────────────────
    listClipAttributes:           resolveOkFalse,
    captureEffectRecipe:          resolveOkFalse,
    applyEffectRecipe:            resolveOkFalse,
    logRecipeDiagnostics:         resolveTrue,
    fireTransition:               resolveOkFalse,
    exportTransitionIndex:        resolveOkFalse,
    readCurrentTransitionDefaults: resolveOkFalse,
    fireEffectAttributes:         resolveOkFalse,

    // ── plugin host (webview replaced by graphic in demo) ───────────────
    getPluginShimUrl:        resolveNull,
    fetchPluginRegistry:     function () { return Promise.resolve({ ok: true, plugins: [] }); },
    listInstalledPlugins:    function () { return Promise.resolve([]); },
    installPlugin:           resolveOkFalse,
    uninstallPlugin:         resolveOkFalse,
    onPluginInstallProgress: noopSubscribe,

    // ── auto-update (never offers an update in the demo) ────────────────
    checkForUpdate:    function () { return Promise.resolve({ ok: true, update: null }); },
    downloadUpdate:    resolveOkFalse,
    installUpdate:     resolveOkFalse,
    onUpdateAvailable: noopSubscribe,
    onUpdateProgress:  noopSubscribe,

    // ── misc / system ───────────────────────────────────────────────────
    openExternal:               function () { /* no window.open in the demo */ },
    onAccessibilityDenied:      noopSubscribe,
    onFocusSearch:              noopSubscribe,
    openAccessibilitySettings:  resolveTrue,
    debugLog:                   resolveTrue,
    getAutoTest:                function () { return Promise.resolve(false); },
    onOpened:                   noopSubscribe,

    // webUtils.getPathForFile(file) → absolute path on disk. In the browser
    // we only have the File's name; good enough for the drag-import code path
    // (which is a no-op insert in the demo anyway).
    getPathForFile: function (file) { return (file && file.name) || ""; },
  };
})();
