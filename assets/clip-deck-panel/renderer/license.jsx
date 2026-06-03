// license.jsx — Pro / Free license state for the renderer.
//
// Loaded BEFORE app.jsx via index.html so window.LicenseProvider and
// window.useLicense are available when App() renders.
//
// Lifecycle:
//   1. On mount, read cached state from disk (license.json) → first paint.
//   2. Validate against api.inthezone.studio in the background → second paint.
//   3. Listen for clipdeck://activated callbacks (post-purchase or post
//      magic-link) → refresh on receive so Pro flips on instantly.
//   4. Re-validate every 24 h while the plugin is running.
//
// Renderer never talks to the backend directly — every HTTP call goes
// through the preload bridge in main.js where the device token lives.

(function () {
  const { createContext, useContext, useState, useEffect, useRef, useCallback } = React;

  // DEBUG SWITCHES — both affect ONLY the renderer's view of license.
  // No network calls, no persisted state are touched. Flip back to
  // `false` and relaunch the overlay to return to your normal state.
  //
  // FORCE_FREE = true   → renderer always sees Free (paywall preview)
  // FORCE_PRO  = true   → renderer always sees Pro (gated-tool preview)
  // FORCE_PRO wins over FORCE_FREE if both are flipped.
  const FORCE_FREE = false;
  const FORCE_PRO  = true; // DEMO (landing-page panel): always Pro — unlocks tools, suppresses paywall/badges.

  const FREE_STATE = {
    pro: false,
    // Gumroad license key, set after a successful activate-key call.
    // Null until the user pastes one in Preferences → Enter License Key.
    licenseKey: null,
    email: null,
    grandfathered: false,
    proSince: null,
    // Once the user has used their once-in-a-lifetime in-app refund,
    // this stays true forever — even after a future re-purchase. The
    // "Request Refund" UI hides itself whenever this is true.
    hasRefunded: false,
    refundedAt: null,
    validUntil: null,
    lastValidatedAt: null,
    offline: false,
  };

  // Hard cap on how long after purchase the in-app refund button
  // remains visible. Backend enforces the same window — this is
  // duplicated here so the renderer can hide the link instantly
  // without an extra round-trip.
  const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  const LicenseContext = createContext(null);

  function LicenseProvider({ children }) {
    // `loading: true` on first mount lets consumers render a placeholder
    // (e.g. skeleton plan badge) until we've at least read the cache.
    const [state, setState] = useState({ ...FREE_STATE, loading: true });

    const apply = useCallback((partial) => {
      if (!partial) return;
      setState((prev) => ({ ...prev, ...partial, loading: false }));
    }, []);

    const refresh = useCallback(async () => {
      if (!window.clipDeck || !window.clipDeck.refreshLicense) return null;
      try {
        const fresh = await window.clipDeck.refreshLicense();
        if (fresh) apply(fresh);
        return fresh;
      } catch (e) { return null; }
    }, [apply]);

    const signOut = useCallback(async () => {
      if (!window.clipDeck || !window.clipDeck.signOut) return;
      try {
        const free = await window.clipDeck.signOut();
        apply(free || FREE_STATE);
      } catch (e) { /* swallow */ }
    }, [apply]);

    const openCheckout = useCallback((opts) => {
      // opts.code optionally pre-applies a Gumroad discount code (used
      // by the launch-pricing paywall to push the LAUNCH code so
      // checkout shows the founders price directly).
      if (window.clipDeck && window.clipDeck.openCheckout) window.clipDeck.openCheckout(opts || {});
    }, []);

    // Activate a Gumroad license key. Returns the backend response
    // verbatim so callers can branch on { ok, error, devices } (the 409
    // too_many_devices path needs the device list to render its picker).
    // On success we apply() the fresh license state synchronously so the
    // renderer flips to Pro without waiting for the next refresh tick.
    const activateLicenseKey = useCallback(async (key, replaceActivationId) => {
      if (!window.clipDeck || !window.clipDeck.activateLicenseKey) return { ok: false };
      try {
        const res = await window.clipDeck.activateLicenseKey(key, replaceActivationId || null);
        if (res && res.ok && res.license) apply(res.license);
        return res;
      } catch (e) { return { ok: false, error: String(e) }; }
    }, [apply]);

    const startMagicLogin = useCallback(async (email) => {
      if (!window.clipDeck || !window.clipDeck.startMagicLogin) return { ok: false };
      try { return await window.clipDeck.startMagicLogin(email); }
      catch (e) { return { ok: false, error: String(e) }; }
    }, []);

    // Device manager — list every Mac on this account, sign out a specific
    // one. Targeting uses activation `id` (not deviceToken) since the
    // backend never echoes other devices' tokens to the renderer.
    const listDevices = useCallback(async () => {
      if (!window.clipDeck || !window.clipDeck.listDevices) return { ok: false };
      try { return await window.clipDeck.listDevices(); }
      catch (e) { return { ok: false, error: String(e) }; }
    }, []);

    const deactivateDevice = useCallback(async (targetActivationId) => {
      if (!window.clipDeck || !window.clipDeck.deactivateDevice) return { ok: false };
      try {
        const res = await window.clipDeck.deactivateDevice(targetActivationId);
        if (res && res.ok && res.removedSelf) {
          // Backend dropped this Mac — main.js already wiped license.json.
          // Flip our cached state to Free synchronously so the renderer
          // doesn't show a flicker of stale Pro UI before the next refresh.
          apply({ ...FREE_STATE });
        }
        return res;
      } catch (e) { return { ok: false, error: String(e) }; }
    }, [apply]);

    // 30-day refund — user clicked "Request Refund" in Preferences.
    // Backend validates eligibility, calls LS Refunds API, marks user
    // pro=0 + has_refunded=1. On success we apply the new state
    // synchronously so the renderer flips to Free without waiting for
    // the next focus-revalidation tick.
    const requestRefund = useCallback(async () => {
      if (!window.clipDeck || !window.clipDeck.requestRefund) return { ok: false };
      try {
        const res = await window.clipDeck.requestRefund();
        if (res && res.ok) {
          apply({ pro: false, hasRefunded: true, refundedAt: res.refundedAt || Date.now() });
        }
        return res;
      } catch (e) { return { ok: false, error: String(e) }; }
    }, [apply]);

    // POST the post-refund feedback form. Reason chip + optional
    // free-text. Backend stores in refund_feedback + emails the team.
    const submitRefundFeedback = useCallback(async (payload) => {
      if (!window.clipDeck || !window.clipDeck.submitRefundFeedback) return { ok: false };
      try { return await window.clipDeck.submitRefundFeedback(payload || {}); }
      catch (e) { return { ok: false, error: String(e) }; }
    }, []);

    // Initial load — disk cache first (instant), then backend refresh.
    useEffect(() => {
      let alive = true;
      (async () => {
        if (window.clipDeck && window.clipDeck.readLicense) {
          try {
            const cached = await window.clipDeck.readLicense();
            if (alive && cached) apply(cached);
            else if (alive) apply(FREE_STATE);
          } catch (e) {
            if (alive) apply(FREE_STATE);
          }
        } else if (alive) {
          // Browser preview / no preload bridge — stay on free state.
          apply(FREE_STATE);
        }
        await refresh();
      })();
      return () => { alive = false; };
    }, [apply, refresh]);

    // Subscribe to clipdeck:// activation events (post-purchase or post-
    // magic-link). Whenever main.js fires "license:activated" we just
    // re-validate; the backend already attached the token to the user
    // server-side.
    useEffect(() => {
      if (!window.clipDeck || !window.clipDeck.onLicenseActivated) return;
      return window.clipDeck.onLicenseActivated(() => { refresh(); });
    }, [refresh]);

    // Re-validate whenever the Clip Deck window regains focus — throttled
    // so rapid app-switching doesn't hammer the backend. This is the
    // primary way a fresh purchase reflects in the plugin: the buyer
    // activates in their browser, switches back to Clip Deck, and the
    // focus event triggers a re-check that flips Pro on. No clipdeck://
    // deep-link / "Open Clip Deck?" prompt needed.
    useEffect(() => {
      let lastAt = 0;
      const onFocus = () => {
        const now = Date.now();
        if (now - lastAt < 15000) return; // throttle: at most every 15s
        lastAt = now;
        refresh();
      };
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }, [refresh]);

    // Daily background re-validation. Catches license revocations within 24h
    // even if the user keeps the plugin open for weeks.
    useEffect(() => {
      const id = setInterval(() => { refresh(); }, 24 * 60 * 60 * 1000);
      return () => clearInterval(id);
    }, [refresh]);

    // Computed: should the "Request Refund" link show?
    // Pro AND has_refunded=0 AND within 30 days of pro_since. Backend
    // re-validates the same rules on POST — this is just the cheap
    // renderer-side gate so the link disappears at the right moment.
    const effectivePro = FORCE_PRO ? true : (FORCE_FREE ? false : !!state.pro);
    const proSinceMs = Number(state.proSince || 0);
    const withinRefundWindow = !!proSinceMs && (Date.now() - proSinceMs) <= REFUND_WINDOW_MS;
    const eligibleForRefund = effectivePro && !state.hasRefunded && withinRefundWindow;

    const value = {
      ...state,
      // FORCE_PRO / FORCE_FREE win over the cached + server-validated
      // `pro` flag so the dev preview always reflects the chosen state.
      pro: effectivePro,
      isPro: effectivePro,
      eligibleForRefund,
      refresh,
      signOut,
      openCheckout,
      activateLicenseKey,
      startMagicLogin,
      listDevices,
      deactivateDevice,
      requestRefund,
      submitRefundFeedback,
    };

    return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
  }

  // Hook for consumers. Returns a safe default if the provider isn't
  // mounted (e.g. during hot reload or in a test harness) — prevents
  // crashes from feature-gate calls happening before the tree is ready.
  function useLicense() {
    const ctx = useContext(LicenseContext);
    if (ctx) return ctx;
    return {
      ...FREE_STATE,
      isPro: false,
      eligibleForRefund: false,
      loading: true,
      refresh: () => {},
      signOut: () => {},
      openCheckout: () => {},
      activateLicenseKey: () => Promise.resolve({ ok: false }),
      startMagicLogin: () => Promise.resolve({ ok: false }),
      listDevices: () => Promise.resolve({ ok: false }),
      deactivateDevice: () => Promise.resolve({ ok: false }),
      requestRefund: () => Promise.resolve({ ok: false }),
      submitRefundFeedback: () => Promise.resolve({ ok: false }),
    };
  }

  window.LicenseProvider = LicenseProvider;
  window.useLicense = useLicense;
})();