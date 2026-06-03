// paywall.jsx — Pro/Free visible UX layer.
//
// Loaded after license.jsx, before app.jsx. Exposes three things globally:
//
//   PAYWALL_ENABLED     boolean feature flag. While false, every gate is
//                       a no-op so internal testers can use Pro features
//                       without paywalls. Currently true — gates enforce
//                       Free vs. Pro for all users. Lives here so a single
//                       edit toggles freemium for everyone.
//
//   <Paywall>           the modal that opens when a free user tries a Pro
//                       feature. Headline, feature list, Upgrade CTA,
//                       "I already have Pro" magic-link form. Auto-closes
//                       when the user becomes Pro (so the post-purchase
//                       clipdeck:// callback dismisses it cleanly).
//
//   <PlanBadge>         small pill in the sidebar. Free → "FREE · Upgrade"
//                       opens checkout. Pro → "PRO" opens a Sign-out menu.

(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const useLicense = window.useLicense;

  // Launch-status persisted cache. The paywall reads this synchronously on
  // first render so the founders-pricing UI (strike-through $99 + $59 +
  // counter) paints with the rest of the modal instead of flashing a
  // loading skeleton for ~1s while the live fetch resolves. The live fetch
  // (now served from main.js's warm cache) still runs on mount to refresh
  // the counter and write the latest value back here.
  const LAUNCH_CACHE_KEY = "clipdeck.launchStatus.v1";
  function readLaunchCache() {
    try {
      const raw = localStorage.getItem(LAUNCH_CACHE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v && typeof v === "object" && v.ok ? v : null;
    } catch (e) { return null; }
  }
  function writeLaunchCache(v) {
    try {
      if (v && typeof v === "object" && v.ok) localStorage.setItem(LAUNCH_CACHE_KEY, JSON.stringify(v));
    } catch (e) { /* localStorage unavailable — non-fatal */ }
  }

  // FEATURE FLAG. Set to `false` to disable all gates for internal
  // testing; `true` enforces Free vs. Pro for all users.
  const PAYWALL_ENABLED = true;

  // BETA SILENT FLAG. When true, the paywall modal NEVER renders even
  // when a Pro feature is clicked, and the FREE pill becomes a static
  // indicator instead of a clickable upgrade button. Beta testers see
  // the locked features as locked, with NO mention of upgrade or
  // pricing. The gates still fire (so the user remains Free), but
  // there's no popup or call to action.
  //
  // Default `false` for production builds. The beta-channel build
  // script (installer/scripts/build-beta-pkg.sh) flips this to `true`
  // before running electron-builder, then reverts.
  const BETA_NO_PAYWALL = false;

  // What the paywall lists as Pro perks. Each entry carries:
  //   keys  — gate triggers that should highlight this tile (e.g. "tools"
  //           highlights all three INTHEZONE Tools tiles at once)
  //   title — always-visible label
  //   desc  — tooltip body shown on hover / keyboard focus
  //   icon  — inline SVG markup rendered inside the tile's icon square
  // The tile layout follows the 3×3 grid from the design bundle.
  const FEATURES = [
    {
      keys: ["deck"],
      title: "Unlimited Decks",
      desc: "Create as many custom decks as you need for different projects, clients, or editing styles.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>',
    },
    {
      keys: ["library"],
      title: "Unlimited Libraries",
      desc: "Organize your clips, sound effects, overlays, transitions, memes, and assets without limits.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><circle cx="7" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>',
    },
    {
      keys: ["hotkeys"],
      title: "Hotkey Navigation",
      desc: "Switch between decks and libraries instantly using hotkeys. Summon Clip Deck directly to your favorite Library or Deck.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.4"/><path d="M7 10h.01"/><path d="M11 10h.01"/><path d="M15 10h.01"/><path d="M7 14h10"/></svg>',
    },
    {
      keys: ["tools", "pixabay"],
      title: "Pixabay Browser",
      desc: "Search and add free stock assets directly to the timeline from inside Clip Deck.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5l-4.2-4.2"/></svg>',
    },
    {
      keys: ["tools", "youtube"],
      title: "YouTube Browser",
      desc: "Quickly browse YouTube references without leaving your workflow.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10.5 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none"/></svg>',
    },
    {
      keys: ["tools", "utility"],
      title: "2 Bonus Utility Plugins",
      desc: "Get access to 2 additional INTHEZONE editing tools included with Pro — Smart Anchor & Smart Paste.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-4V4a1.5 1.5 0 0 0-3 0v3H9V4a1.5 1.5 0 0 0-3 0v3H4v5a4 4 0 0 0 4 4h1v4h6v-4h1a4 4 0 0 0 4-4z"/></svg>',
    },
    {
      keys: ["devices"],
      title: "Use on 2 Devices",
      desc: "Activate Clip Deck Pro on up to 2 computers.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="13" height="9" rx="1.6"/><rect x="13" y="11" width="9" height="9" rx="1.6"/><path d="M6 16.5h6"/></svg>',
    },
    {
      keys: ["import"],
      title: "Export & Import Libraries",
      desc: "Back up your setup or move your libraries between devices.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    },
    {
      keys: ["refund"],
      title: "30-Day Refund Policy",
      desc: "Try it risk-free. No questions asked.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3.2-6.9"/><path d="M3 4v5h5"/></svg>',
    },
  ];

  // ── Paywall modal ────────────────────────────────────────────────────
  function Paywall({ feature, initialView, onClose }) {
    const lic = useLicense();
    // initialView lets callers open the modal straight on the
    // license-key paste view. Defaults to the standard offer.
    const [view, setView] = useState(initialView || "offer"); // offer | license-key
    // After the user clicks Get Pro we open Gumroad in their browser AND
    // jump straight to the license-key view so when they switch back to
    // Clip Deck with the key in their clipboard, the input is ready.
    // This flag lets the license-key view show a "buying it now" hint
    // above the input vs. the simpler "already have one" intro.
    const [arrivedFromGetPro, setArrivedFromGetPro] = useState(false);

    // Launch-pricing state, fetched once on mount from /launch/status.
    // null while loading; { launchActive, discountCode, launchPriceCents,
    // regularPriceCents, launchRemaining, launchTotal } once resolved.
    // We silently fall back to regular pricing on null / launchActive=false
    // so a backend hiccup never breaks the paywall.
    // Seed from the persisted cache so the correct price UI is on screen
    // from the very first frame; the mount fetch below refreshes it.
    const [launch, setLaunch] = useState(readLaunchCache);
    useEffect(() => {
      let alive = true;
      (async () => {
        if (!window.clipDeck || !window.clipDeck.fetchLaunchStatus) return;
        try {
          const res = await window.clipDeck.fetchLaunchStatus();
          if (alive && res && res.ok) { setLaunch(res); writeLaunchCache(res); }
        } catch (e) { /* silent fallback to regular pricing */ }
      })();
      return () => { alive = false; };
    }, []);

    // Auto-dismiss the moment the user actually flips to Pro — covers both
    // the post-activate-key path and any future post-purchase callback.
    useEffect(() => {
      if (lic.isPro) onClose();
    }, [lic.isPro, onClose]);

    // Esc to close.
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    // Get Pro → open Gumroad in the default browser AND immediately
    // pivot the modal to the license-key input view. When the user
    // returns to Clip Deck post-purchase, the field is already focused
    // and ready for paste. If launch pricing is active we pre-apply
    // the discount code so checkout shows the founders price.
    const onUpgrade = () => {
      const code = launch && launch.launchActive ? launch.discountCode : null;
      lic.openCheckout(code ? { code } : undefined);
      setArrivedFromGetPro(true);
      setView("license-key");
    };

    // Convenience: which price + label to show on the price block + CTA.
    const launchActive = !!(launch && launch.launchActive);
    const regularPriceDollars = launchActive
      ? Math.round((launch.regularPriceCents || 9900) / 100)
      : 99;
    const launchPriceDollars = launchActive
      ? Math.round((launch.launchPriceCents || 5900) / 100)
      : null;
    const displayPriceDollars = launchPriceDollars != null ? launchPriceDollars : regularPriceDollars;

    return (
      <>
        <div className="cd-paywall-scrim" onMouseDown={onClose}/>
        <div className={`cd-paywall-modal cd-paywall-modal--${view}`} onMouseDown={(e) => e.stopPropagation()}>
          {view === "offer" && (
            <>
              <div className="cdp-eyebrow"><span className="cdp-dot"/>Clip Deck Pro · Lifetime</div>
              <h1 className="cdp-head">
                Ready to expand your <span className="cdp-accent">Clip Deck?</span>
              </h1>
              <p className="cdp-lede">Build faster in Premiere Pro with unlimited access, lifetime updates, and activation on up to 2 devices. One payment. No subscription.</p>

              <div className="cdp-features">
                {FEATURES.map((f) => (
                  <div key={f.keys[0]}
                       className={`cdp-feature${f.keys.indexOf(feature) >= 0 ? " is-highlight" : ""}`}
                       tabIndex={0}
                       aria-describedby={`cdp-tip-${f.keys[0]}`}>
                    <div className="cdp-ficon" dangerouslySetInnerHTML={{ __html: f.icon }}/>
                    <div className="cdp-flabel">{f.title}</div>
                    <div className="cdp-tip" id={`cdp-tip-${f.keys[0]}`} role="tooltip">
                      <span className="cdp-tip-title">{f.title}</span>
                      {f.desc}
                    </div>
                  </div>
                ))}
              </div>

              {launch === null ? (
                // Launch status hasn't resolved yet — render a placeholder
                // matching the eventual row height so the modal layout
                // doesn't shift when the price/CTA pops in. The brief
                // "$99 flash" before flipping to the launch UI happened
                // because we used to render the non-launch branch as the
                // default; this skeleton avoids any wrong-state flash.
                <div className="cdp-cta-row cdp-cta-row--loading" aria-hidden="true"/>
              ) : (
                <div className="cdp-cta-row">
                  <div className="cdp-price-block">
                    {launchActive ? (
                      <div className="cdp-price-launch-tag">
                        <div className="cdp-price-launch-hero">One-time Launch Price</div>
                        <div className="cdp-price-launch-row">
                          <span className="cdp-price-launch-old">${regularPriceDollars}</span>
                          <span className="cdp-price-launch-amount">${launchPriceDollars}</span>
                        </div>
                        <div className="cdp-price-launch-context">for the first {launch.launchTotal} pro users</div>
                      </div>
                    ) : (
                      <>
                        <div className="cdp-price">
                          <span className="cdp-dollar">$</span>{displayPriceDollars}
                        </div>
                        <div className="cdp-price-note">
                          <div>one-time payment</div>
                          <div>lifetime updates included</div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="cdp-cta-side">
                    <button className="cdp-btn" onClick={onUpgrade}>
                      Upgrade to Pro
                      <span className="cdp-price-tag">${displayPriceDollars} one-time</span>
                      <svg className="cdp-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>
                      </svg>
                    </button>
                    {launchActive && (
                      <div className="cdp-launch-counter">
                        <span className="cdp-launch-dot"/>
                        <span className="cdp-launch-count">{launch.launchRemaining}</span>
                        <span className="cdp-launch-label">founder license{launch.launchRemaining === 1 ? "" : "s"} left</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="cdp-trust cdp-trust--bare">
                <button className="cdp-already" onClick={() => { setArrivedFromGetPro(false); setView("license-key"); }}>I already have a license key →</button>
              </div>
            </>
          )}
          {view === "license-key" && (
            <>
              <div className="cdp-eyebrow">
                <span className="cdp-dot"/>
                Clip Deck Pro · {arrivedFromGetPro ? "Almost there" : "Activate"}
              </div>
              <h1 className="cdp-head">
                {arrivedFromGetPro ? (
                  <>Finish in your <span className="cdp-accent">browser</span></>
                ) : (
                  <>Enter your <span className="cdp-accent">license key</span></>
                )}
              </h1>
              <p className="cdp-lede">
                {arrivedFromGetPro
                  ? "Gumroad is open in your browser. After payment, your license key arrives by email — paste it below and you're in."
                  : "Paste the license key from your Gumroad receipt email."}
              </p>
              <EnterLicenseKeyForm
                onActivated={onClose}
                onBack={() => setView("offer")}/>
            </>
          )}
        </div>
      </>
    );
  }

  // ── Enter License Key form ───────────────────────────────────────────
  //
  // Reusable form body used both as a Paywall view (embedded, no scrim)
  // and as a standalone modal opened from Preferences. Owns the input,
  // validation, error mapping, and the 409 too_many_devices device
  // picker. `onActivated` fires after a successful activate-key call —
  // the parent closes the surrounding modal at that point. `onBack` is
  // shown as a "← Back" link only when supplied (Paywall embed uses it
  // to return to the offer view; the Preferences standalone modal
  // closes outright instead).
  function EnterLicenseKeyForm({ onActivated, onBack }) {
    const lic = useLicense();
    const [key, setKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // When the backend returns 409 too_many_devices it includes the
    // device list. We render a picker so the user can sign one out
    // and retry (the backend's replaceActivationId path does the swap
    // atomically with the activation).
    const [tooManyDevices, setTooManyDevices] = useState(null); // null | array

    const errorCopy = (code, detail) => {
      switch (code) {
        case "missing_fields":      return "Paste your license key.";
        case "invalid_key":
          // Surface Gumroad's own message when available — it's usually
          // more specific than our generic copy (e.g. "That license has
          // expired", "test purchase").
          return detail
            ? `We couldn't activate this key: ${detail}`
            : "We couldn't find a license matching that key. Check your Gumroad receipt and try again.";
        case "refunded":            return "This license was refunded and is no longer valid.";
        case "disabled":            return "This license has been disabled. If you believe this is wrong, reply to your Gumroad receipt.";
        case "gumroad_unreachable": return "Couldn't reach the licensing server. Try again in a moment.";
        case "network":             return "Network error. Check your connection and try again.";
        default:                    return "Something went wrong. Try again, or contact support if it keeps happening.";
      }
    };

    const submit = async (replaceActivationId) => {
      const trimmed = key.trim();
      if (!trimmed) {
        setError("Paste your license key.");
        return;
      }
      setBusy(true); setError(null);
      const res = await lic.activateLicenseKey(trimmed, replaceActivationId || null);
      setBusy(false);
      if (res && res.ok) {
        // license.jsx applied the fresh state synchronously; parent
        // closes us out.
        onActivated && onActivated();
        return;
      }
      if (res && res.error === "too_many_devices" && Array.isArray(res.devices)) {
        setTooManyDevices(res.devices);
        return;
      }
      setError(errorCopy(res && res.error, res && res.message));
    };

    // Enter to submit (when not on the picker view).
    const onKeyDown = (e) => {
      if (e.key === "Enter" && !busy && !tooManyDevices) {
        e.preventDefault();
        submit();
      }
    };

    if (tooManyDevices) {
      return (
        <div className="cdp-form">
          <p className="cdp-mini-sub">
            This license is already activated on 2 Macs. Pick one to sign out and replace with this Mac.
          </p>
          <ul className="cd-devices-list" style={{ marginTop: 12 }}>
            {tooManyDevices.map((d) => (
              <li key={d.id} className="cd-devices-row">
                <div className="cd-devices-meta">
                  <div className="cd-devices-label">{d.label || "Unknown Mac"}</div>
                  <div className="cd-devices-seen">Last active {formatRelative(d.lastSeenAt)}</div>
                </div>
                <button
                  className="cd-devices-signout"
                  disabled={busy}
                  onClick={() => submit(d.id)}>
                  {busy ? "Swapping…" : "Sign out & use this Mac"}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="cdp-error" style={{ marginTop: 12 }}>{error}</p>}
          <button
            type="button"
            className="cdp-back"
            onClick={() => { setTooManyDevices(null); setError(null); }}>
            ← Back
          </button>
        </div>
      );
    }

    return (
      <div className="cdp-form">
        <input
          type="text"
          className="cdp-input"
          placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          disabled={busy}
          spellCheck={false}
          autoCapitalize="characters"
        />
        {error && <p className="cdp-error">{error}</p>}
        <button
          type="button"
          className="cdp-btn cdp-btn--full"
          disabled={busy}
          onClick={() => submit()}>
          {busy ? "Activating…" : "Activate Pro"}
        </button>
        {onBack && (
          <button className="cdp-back" onClick={onBack}>← Back</button>
        )}
      </div>
    );
  }

  // Standalone modal-wrapped EnterLicenseKey, opened from Preferences
  // → "Enter License Key". Owns its own scrim + Esc handler. The
  // embedded variant inside Paywall reuses EnterLicenseKeyForm directly
  // and inherits Paywall's scrim/dismiss.
  //
  // Inline zIndex bumps the scrim + card above the Preferences modal
  // (cd-prefs-modal sits at a higher z-index than the default
  // cd-paywall-modal, so re-using that base class would render the
  // input *behind* the prefs surface — visible but unclickable). Same
  // pattern DeviceSignOutConfirm uses.
  function EnterLicenseKey({ onClose }) {
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);
    return (
      <>
        <div
          className="cd-paywall-scrim cd-paywall-scrim--devices"
          onMouseDown={onClose}
          style={{ zIndex: 1000 }}/>
        <div
          className="cd-paywall-modal cd-paywall-modal--license-key"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ zIndex: 1001 }}>
          <div className="cdp-eyebrow">
            <span className="cdp-dot"/>
            Clip Deck Pro · Activate
          </div>
          <h1 className="cdp-head">
            Enter your <span className="cdp-accent">license key</span>
          </h1>
          <p className="cdp-lede">Paste the license key from your Gumroad receipt email.</p>
          <EnterLicenseKeyForm onActivated={onClose}/>
        </div>
      </>
    );
  }

  // ── Pro Onboarding ───────────────────────────────────────────────────
  // First-run celebration shown after a user's license flips to Pro.
  // Built from the "Pro Onboarding" design bundle: success badge, two-line
  // welcome headline, the 9-feature grid (reusing FEATURES), a CTA row,
  // and a confetti burst. Shown exactly once — the caller (App) gates it
  // on the first Free→Pro flip (with a 2s delay so it lands while the
  // user is looking at Clip Deck) and persists a `proOnboardingSeen`
  // config flag on dismiss so it never re-appears.
  //
  // The confetti is CSS/DOM-based — absolutely-positioned particle spans
  // driven by a single keyframe — rather than the design's <canvas>
  // prototype. Canvas rendering proved unreliable inside the Electron
  // overlay; CSS transforms are GPU-composited and animate dependably.
  // The bundle README explicitly sanctions recreating the visual in
  // whatever tech fits the target.
  function ProOnboarding({ onDismiss, quickStartUrl }) {
    const lic = useLicense();
    const [deviceLine, setDeviceLine] = useState(null);

    // Confetti particle descriptors — generated once. Each span carries
    // randomized drift / arc-peak / fall / rotation / size / colour /
    // duration / delay, handed to the CSS keyframe via custom props.
    const confetti = React.useMemo(() => {
      const COLORS = ["#00e58e", "#5cf2b6", "#00b370", "#ffffff", "#9af9d3"];
      const bits = [];
      // 260 particles — dense enough to read unmistakably as a
      // celebratory burst (matches the design handoff's primary count).
      for (let i = 0; i < 260; i++) {
        // Two origin clusters left/right of centre — mirrors the
        // design's multi-origin burst for a wider spray.
        const originX = (i % 2 === 0 ? 39 : 61) + (Math.random() * 16 - 8);
        bits.push({
          id: i,
          left: originX,
          dx: (Math.random() * 2 - 1) * (200 + Math.random() * 300),
          peak: -(120 + Math.random() * 260),
          dy: 340 + Math.random() * 440,
          dr: (Math.random() * 2 - 1) * (300 + Math.random() * 760),
          size: 6 + Math.random() * 8,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.5,
          // dur 2–3.5s + delay 0–0.7s → the burst stays visibly active
          // for ~4s, a comfortable window to catch.
          dur: 2 + Math.random() * 1.5,
          delay: Math.random() * 0.7,
        });
      }
      return bits;
    }, []);

    // NOTE: this panel is deliberately dismissable ONLY via its two
    // explicit buttons — no Esc handler, no click-the-backdrop. It's a
    // once-ever celebration and an accidental keypress / stray click
    // (the panel pops in suddenly after the 2s focus delay, often while
    // the user is mid-interaction) was silently dismissing it before
    // the user even registered it, then latching `proOnboardingSeen`.

    // Best-effort device count for the CTA meta line ("N of 2 device
    // activations used"). Falls back to a generic line if the lookup
    // fails or hasn't resolved.
    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          const res = await lic.listDevices();
          if (alive && res && res.ok && Array.isArray(res.devices)) {
            const n = res.devices.length;
            setDeviceLine(`${n} of 2 device activation${n === 1 ? "" : "s"} used`);
          }
        } catch (e) { /* keep fallback */ }
      })();
      return () => { alive = false; };
    }, []);

    return (
      <div className="cd-proonb-scrim">
        <div className="cd-proonb-confetti" aria-hidden="true">
          {confetti.map((p) => (
            <span key={p.id}
                  className={`cd-proonb-bit${p.round ? " is-round" : ""}`}
                  style={{
                    left: p.left + "%",
                    width: p.size + "px",
                    height: (p.round ? p.size : p.size * 0.62) + "px",
                    background: p.color,
                    animationDuration: p.dur + "s",
                    animationDelay: p.delay + "s",
                    "--cd-bit-dx": p.dx + "px",
                    "--cd-bit-peak": p.peak + "px",
                    "--cd-bit-dy": p.dy + "px",
                    "--cd-bit-dr": p.dr + "deg",
                  }}/>
          ))}
        </div>
        <section className="cd-proonb-card"
                 onMouseDown={(e) => e.stopPropagation()}
                 aria-labelledby="cd-proonb-head">
          <div className="cd-proonb-headrow">
            <div className="cd-proonb-success" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div className="cd-proonb-eyebrow">
              <span className="cd-proonb-dot"/>License Activated · Pro Unlocked
            </div>
          </div>

          <h1 id="cd-proonb-head" className="cd-proonb-head">
            <span className="cd-proonb-line">Welcome to</span>
            <span className="cd-proonb-line cd-proonb-accent">Clip Deck Pro</span>
          </h1>
          <p className="cd-proonb-lede">
            Your license is active and every Pro feature is now unlocked. Hover any
            tile to see what's new — then jump back into Premiere Pro and start building.
          </p>

          <div className="cd-proonb-features">
            {FEATURES.map((f) => (
              <div key={f.keys[0]}
                   className="cd-proonb-feature"
                   tabIndex={0}
                   aria-describedby={`cd-proonb-tip-${f.keys[0]}`}>
                <div className="cd-proonb-ficon" dangerouslySetInnerHTML={{ __html: f.icon }}/>
                <div className="cd-proonb-flabel">{f.title}</div>
                <svg className="cd-proonb-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <div className="cd-proonb-tip" id={`cd-proonb-tip-${f.keys[0]}`} role="tooltip">
                  <span className="cd-proonb-tip-title">{f.title}</span>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>

          <div className="cd-proonb-ctarow">
            <div className="cd-proonb-meta">
              <div className="cd-proonb-meta-top">Lifetime · Activated on this device</div>
              <div className="cd-proonb-meta-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                {deviceLine || "Pro license active"}
              </div>
            </div>
            <div className="cd-proonb-actions">
              <button
                className="cd-proonb-btn-ghost"
                type="button"
                onClick={() => {
                  // Open the same YouTube tutorial as the Preferences
                  // "Watch Demo Tutorial" button — URL is sourced from
                  // app.jsx's ONBOARDING_TUTORIAL_URL and passed down
                  // so there's a single source of truth. Falls back to
                  // dismissing if the bridge isn't available (e.g.
                  // running in a non-Electron preview).
                  if (quickStartUrl && window.clipDeck && window.clipDeck.openExternal) {
                    window.clipDeck.openExternal(quickStartUrl);
                  }
                  onDismiss();
                }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                View Quick‑Start Guide
              </button>
              <button className="cd-proonb-btn" type="button" onClick={onDismiss}>
                Open Clip Deck
                <svg className="cd-proonb-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Plan badge ───────────────────────────────────────────────────────
  // Pro: non-interactive indicator (just a pill, no menu). Account
  // actions (Manage devices, Sign out) live elsewhere — currently in
  // the Preferences modal's Settings list.
  // Free: clickable button that opens the paywall modal via the
  // onUpgradeClick callback the caller passes in.
  //
  // Pro: clickable button when `onProClick` is supplied (re-opens the
  // ProOnboarding modal — confetti + welcome card). Falls back to the
  // legacy static <span> when no handler is passed, so other call
  // sites that just want a display badge keep their current behaviour.
  function PlanBadge({ onUpgradeClick, onProClick }) {
    const lic = useLicense();
    // Hide entirely while we're still resolving the cache (avoids the badge
    // flickering Free → Pro on plugin start for returning Pro users).
    if (lic.loading) return null;
    if (!lic.isPro) {
      // Beta silent mode — render a static, non-clickable TESTING pill.
      // Pro features stay locked but no upgrade prompt or price is
      // exposed anywhere in the UI.
      if (BETA_NO_PAYWALL) {
        return (
          <span className="cd-plan-badge cd-plan-badge--testing cd-plan-badge--static">
            TESTING
          </span>
        );
      }
      return (
        <button className="cd-plan-badge cd-plan-badge--free" onClick={onUpgradeClick} title="Upgrade to Clip Deck Pro">
          FREE
        </button>
      );
    }
    if (onProClick) {
      return (
        <button
          className="cd-plan-badge cd-plan-badge--pro"
          onClick={onProClick}
          title="Open Clip Deck Pro welcome">
          PRO
        </button>
      );
    }
    return (
      <span
        className="cd-plan-badge cd-plan-badge--pro cd-plan-badge--static"
        title={lic.email || "Clip Deck Pro"}>
        PRO
      </span>
    );
  }

  // ── Manage devices modal ─────────────────────────────────────────────
  // Adobe-style device manager: lists every Mac on the user's account
  // with a Sign-out button next to each. The current Mac is highlighted
  // and tagged "This Mac" but is fully sign-out-able from here too —
  // signing yourself out wipes the local license cache and flips the
  // renderer to Free immediately (no /validate round-trip flicker).
  function DevicesModal({ onClose }) {
    const lic = useLicense();
    const [list, setList] = useState(null);    // null = loading
    const [busyId, setBusyId] = useState(null); // activation id mid-deactivate
    const [error, setError] = useState(null);
    // Sign-out confirmation. Holds the device being signed out so the
    // confirm card can show device-specific copy. null = no confirm
    // active. The current-device sign-out warning calls out that the
    // user will be reverted to Free with their extra libraries / decks
    // archived (still on disk, just locked) — important enough that we
    // can't rely on a single "Sign out" click.
    const [pendingSignOut, setPendingSignOut] = useState(null);

    const load = useCallback(async () => {
      setError(null);
      const res = await lic.listDevices();
      if (res && res.ok) setList(res.devices || []);
      else setError((res && res.error) || "Couldn't load devices.");
    }, [lic]);

    useEffect(() => { load(); }, [load]);

    // Esc to close — matches the Paywall modal pattern. When a confirm
    // card is up Esc dismisses the confirm instead of the whole modal.
    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault(); e.stopPropagation();
        if (pendingSignOut) setPendingSignOut(null);
        else onClose();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose, pendingSignOut]);

    const doSignOut = async (device) => {
      setBusyId(device.id);
      setPendingSignOut(null);
      const res = await lic.deactivateDevice(device.id);
      setBusyId(null);
      if (res && res.ok) {
        if (res.removedSelf) {
          // We just signed ourselves out — license context already
          // flipped to Free; close the modal.
          onClose();
          return;
        }
        setList(res.devices || []);
      } else {
        setError((res && res.error) || "Couldn't sign out that device.");
      }
    };

    return (
      <>
        <div className="cd-paywall-scrim cd-paywall-scrim--devices" onMouseDown={onClose}/>
        <div className="cd-devices-modal" onMouseDown={(e) => e.stopPropagation()}>
          <h2 className="cd-paywall-headline">Your devices</h2>
          <p className="cd-paywall-sub">Clip Deck Pro is active on up to 2 Macs at a time. Sign out of a Mac you no longer use to free a slot.</p>
          {list === null && !error && <div className="cd-devices-loading">Loading…</div>}
          {error && <div className="cd-devices-error">{error}</div>}
          {list && list.length === 0 && <div className="cd-devices-empty">No devices on file.</div>}
          {list && list.length > 0 && (
            <ul className="cd-devices-list">
              {list.map((d) => (
                <li key={d.id} className={`cd-devices-row${d.isThisDevice ? " cd-devices-row--current" : ""}`}>
                  <div className="cd-devices-meta">
                    <div className="cd-devices-label">
                      {d.label || "Unknown Mac"}
                      {d.isThisDevice && <span className="cd-devices-this"> · This Mac</span>}
                    </div>
                    <div className="cd-devices-seen">Last active {formatRelative(d.lastSeenAt)}</div>
                  </div>
                  <button
                    className="cd-devices-signout"
                    disabled={busyId === d.id}
                    onClick={() => setPendingSignOut(d)}>
                    {busyId === d.id ? "Signing out…" : "Sign out"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {pendingSignOut && (
          <DeviceSignOutConfirm
            device={pendingSignOut}
            onConfirm={() => doSignOut(pendingSignOut)}
            onCancel={() => setPendingSignOut(null)}/>
        )}
      </>
    );
  }

  // Confirmation card shown before deactivating a device. Stacks above
  // the Devices modal scrim with its own scrim so it reads as a hard
  // gate rather than a casual click. Two copy variants: the current
  // device warns about the Free downgrade ("libraries and cards stay
  // archived, unlock on returning to Pro"); other devices get a lighter
  // confirm since this Mac stays Pro.
  function DeviceSignOutConfirm({ device, onConfirm, onCancel }) {
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onConfirm(); }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onConfirm]);
    const isCurrent = !!device.isThisDevice;
    const label = device.label || (isCurrent ? "this Mac" : "this device");
    return (
      <div className="cd-confirm-scrim" onMouseDown={onCancel} style={{ zIndex: 1000 }}>
        <div className="cd-confirm" onMouseDown={(e) => e.stopPropagation()}>
          <div className="cd-confirm-title">
            {isCurrent ? "Sign out of this Mac?" : `Sign out of ${label}?`}
          </div>
          <div className="cd-confirm-msg">
            {isCurrent
              ? "You'll be reverted to Clip Deck Free immediately. You'll only be able to access your first library and its first deck — your other libraries and cards stay archived on this Mac and unlock again the moment you upgrade back to Pro."
              : `This Mac stays signed in to Clip Deck Pro. ${label} will be reverted to Free the next time it launches; its libraries and cards stay archived on that Mac and unlock again if it signs back in.`}
          </div>
          <div className="cd-confirm-actions">
            <button className="cd-confirm-btn" onClick={onCancel}>Cancel</button>
            <button autoFocus className="cd-confirm-btn danger" onClick={onConfirm}>
              {isCurrent ? "Sign out & revert to Free" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tiny relative-time formatter — "3m ago", "yesterday", or a date for
  // anything older than a week. Self-contained; no Intl polyfill needed.
  function formatRelative(ms) {
    if (!ms) return "never";
    const diff = Date.now() - ms;
    if (diff < 0) return "just now";
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
    if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d ago";
    return new Date(ms).toLocaleDateString();
  }

  // Silent-mode stub used by the beta build — same prop signature, just
  // renders nothing. Avoids fragile rules-of-hooks gymnastics inside the
  // real component.
  function SilentPaywall() { return null; }

  window.PAYWALL_ENABLED = PAYWALL_ENABLED;
  window.BETA_NO_PAYWALL = BETA_NO_PAYWALL;
  // Post-refund feedback modal ("Help us improve Clip Deck"). The App
  // mounts this once after a successful refund (license flipped to Free
  // + hasRefunded=true + refundFeedbackSeen not yet set). One reason
  // chip + optional free-text. Submit + Skip both close the modal and
  // persist refundFeedbackSeen, so it never reappears.
  //
  // Reason keys MUST match the backend's ALLOWED_REASON_KEYS set
  // (src/refund.js); anything else 400s.
  function RefundFeedback({ onSubmit, onSkip }) {
    const REASONS = [
      { key: "too-expensive",       label: "Too expensive" },
      { key: "missing-features",    label: "Missing features" },
      { key: "bugs-stability",      label: "Bugs or stability issues" },
      { key: "not-what-expected",   label: "Not what I expected" },
      { key: "switched-to-another", label: "Switched to another tool" },
      { key: "other",               label: "Other" },
    ];
    const [reasonKey, setReasonKey]   = useState(null);
    const [reasonText, setReasonText] = useState("");
    const [busy, setBusy]             = useState(false);

    // Esc dismisses → Skip path (same as the Skip button). The user has
    // already received their refund; we just lose the feedback signal.
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onSkip(); }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onSkip]);

    const submit = async () => {
      if (!reasonKey || busy) return;
      setBusy(true);
      try {
        await onSubmit({ reasonKey, reasonText: reasonText.trim() });
      } finally {
        setBusy(false);
      }
    };

    return (
      <>
        {/* No scrim-click-to-dismiss — the user has to explicitly Skip
            or Send. Prevents accidental dismissal from a stray click. */}
        <div className="cd-paywall-scrim cd-paywall-scrim--devices"/>
        <div className="cd-refund-modal" onMouseDown={(e) => e.stopPropagation()}>
          <h2 className="cd-paywall-headline">Help us improve Clip Deck</h2>
          <p className="cd-paywall-sub">Your refund went through. Mind sharing why you decided to refund? It really helps us understand what to focus on.</p>
          <div className="cd-refund-reasons">
            {REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`cd-refund-reason${reasonKey === r.key ? " on" : ""}`}
                onClick={() => setReasonKey(r.key)}
                disabled={busy}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="cd-refund-text-label">
            Anything else? <span className="cd-refund-text-optional">(optional)</span>
          </label>
          <textarea
            className="cd-refund-textarea"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="A few words help more than you'd think."
            rows={4}
            maxLength={4000}
            disabled={busy}/>
          <div className="cd-refund-actions">
            <button
              type="button"
              className="cd-refund-btn"
              onClick={onSkip}
              disabled={busy}>
              Skip
            </button>
            <button
              type="button"
              className="cd-refund-btn cd-refund-btn--primary"
              onClick={submit}
              disabled={!reasonKey || busy}>
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      </>
    );
  }

  window.Paywall  = BETA_NO_PAYWALL ? SilentPaywall : Paywall;
  window.PlanBadge = PlanBadge;
  // ProOnboarding is a post-purchase celebration, not a gate — it ships
  // even in the beta/silent build (a Pro user there still earned the
  // welcome). The App gates it on the first Free→Pro transition.
  window.ProOnboarding = ProOnboarding;
  window.DevicesModal = DevicesModal;
  window.EnterLicenseKey = EnterLicenseKey;
  window.RefundFeedback = RefundFeedback;
})();