// Persistent config — backed by Electron main's userData via preload IPC.
// Falls back to in-memory when running outside Electron (e.g. browser preview).
//
// Schema:
//   libraries[]
//     ├─ name
//     └─ decks[]
//          ├─ name
//          └─ slots[]    (40 slots per deck, positional 1234567890QWERTYUIOPASDFGHJKL;ZXCVBNM,./)
//
// activeLibraryIndex + activeDeckIndex select which deck is shown.
//
// Version gate
// ────────────
// Bump CONFIG_VERSION below whenever you ship a release that should reset
// every user to a fresh-install state. On load, if the saved config carries
// a different version, we discard it entirely and write defaults. Configs
// without a version field (i.e. ones written before this gate existed) are
// treated as legacy and migrated normally so we don't wipe today's users.

(function (global) {
  // Bump on every release that should feel like a fresh install.
  var CONFIG_VERSION = "0.4.0";

  var KEYMAP = [
    "1","2","3","4","5","6","7","8","9","0",
    "Q","W","E","R","T","Y","U","I","O","P",
    "A","S","D","F","G","H","J","K","L",";",
    "Z","X","C","V","B","N","M",",",".","/"
  ];

  function emptySlots() {
    var slots = [];
    for (var i = 0; i < KEYMAP.length; i++) {
      slots.push({
        key: KEYMAP[i],
        path: null,
        name: null,
        tag: null,
        hue: ((i * 47) % 360),
        peak: 0.5,
        nodeId: null,
        kind: null,
        clipboardFile: null,
        capturedAt: null,
        captureBytes: null,
        thumb: null,
        customThumb: false,
        audioOnly: false,
        // Subtype tag for clipboard captures, drives the thumbnail glyph:
        //   null  → unknown / pre-subtype-aware capture (uses audioOnly + clip icon)
        //   "video" / "audio" / "text" / "mogrt" → distinct icon per kind
        //   "mixed" → nested-folder icon (selection had 2+ distinct kinds)
        captureSubtype: null
      });
    }
    return slots;
  }

  function emptyDeck(name) {
    return { name: name || "Deck 1", slots: emptySlots() };
  }

  function emptyLibrary(name) {
    return { name: name || "User Library 1", decks: [emptyDeck("Deck 1")], hotkey: null };
  }

  var DEFAULTS = {
    version: CONFIG_VERSION,
    panelHotkey: "`",
    // Global shortcut that summons Clip Deck directly into the sidebar
    // search field. Stored separately from panelHotkey so users can
    // keep one combo for "show panel" and another for "search now".
    searchHotkey: "CommandOrControl+`",
    libraries: [emptyLibrary("User Library 1")],
    activeLibraryIndex: 0,
    activeDeckIndex: 0,
    // Pixabay API key for the INTHEZONE Tools > SFX panel. Empty by
    // default; the SFX panel shows an inline form for the user to paste
    // their free key from pixabay.com/api/docs/. Persists across runs.
    pixabayApiKey: "",
    // Set true after the user dismisses the first-launch welcome
    // modal. Stays false on a fresh install so the onboarding shows
    // exactly once per install.
    onboardingShown: false,
    // Set true after the user dismisses the Pro Onboarding screen
    // (the post-purchase "Welcome to Clip Deck Pro" celebration).
    // Stays false until the first Free→Pro flip so it shows exactly
    // once. Survives relaunches via the mergeDefaults carry-over below.
    proOnboardingSeen: false,
    // Set true after the user dismisses the "Help us improve Clip Deck"
    // modal that opens once after they refund. Carried across relaunches
    // so the modal never reappears (even if the user closed the app
    // before submitting).
    refundFeedbackSeen: false,
    // Per-INTHEZONE-tool hotkey bindings — keyed by tool label
    // ("Effects", "Pixabay", "Utility Plugins", "Youtube"). Stored as
    // Electron Accelerator strings (same shape as panelHotkey).
    // Empty / missing entry = no hotkey assigned for that tool.
    toolHotkeys: {},
    // User-reordered tool decks (Effects 1..5, Transitions 1..2).
    // Keyed by deckKey ("Effects:1", etc.); value is an array of slot
    // identifiers in user-chosen order. Empty / missing entry = the
    // curated default order. Persists across launches.
    toolDeckOrder: {},
    tweaks: {
      accent: "blue",
      palette: "graphite",
      density: "tight",
      showShortcuts: true,
      // Insert mode for both file/sequence and clipboard fires.
      //   "smart" — find the lowest empty video/audio track at the playhead
      //             and drop the clip there (collision-aware). Default.
      //   "track" — use Premiere's currently-targeted track (the arrow icon).
      // Clipboard fires achieve "smart" by setting exclusive track targets
      // around an Edit > Paste menu click; "track" just runs the menu
      // click without touching targets. File/sequence fires use the
      // smartOverwriteAt vs overwriteAt SDK paths.
      insertMode: "smart",
      // Auto-check for app updates on launch + every 6h. False stops the
      // background poll but the user can still hit "Check for Updates"
      // manually from Preferences.
      autoUpdate: true,
      // Stable or beta — picks which channel the /updates/latest poll
      // queries. Future-facing; only stable exists in the registry today.
      updateChannel: "stable",
      // If the user clicks "Remind me later" on an update banner, we
      // store the Unix-ms timestamp until which the banner is hidden.
      // 0 / null means no snooze active.
      updateSnoozeUntil: 0
    }
  };

  // Pull a slot's saved fields onto a fresh slot template (preserves file
  // assignments + custom hues + timeline captures + custom thumbnails
  // + custom colors + tool-card drag payloads across launches).
  //
  // CRITICAL — this list must stay in sync with TRANSFER_FIELDS in
  // app.jsx (the in-memory drag/move/swap copier). Any user-visible
  // field on a slot needs to be in BOTH places, otherwise:
  //   - missing from TRANSFER_FIELDS → drags lose data,
  //   - missing from this list → relaunches lose data.
  // The 2026-05-26 fix added customColor + effectRecipe + the
  // Save-Attributes payload + useCount/lastUsedAt + preset/useTextThumb
  // because they were silently stripped on every load, which on the
  // very next save wrote a defaults-shaped slot back to disk — i.e.
  // the user's customizations decayed away over time.
  function applySavedSlot(target, source) {
    if (!source || typeof source !== "object") return;
    [
      // Core slot identity / file payload
      "path","name","tag","hue","peak","nodeId",
      "kind","clipboardFile","capturedAt","captureBytes",
      "thumb","customThumb","audioOnly","captureSubtype",
      // User decorations — color picker choices
      "customColor",
      // Tool-card payloads — effect / save-attributes recipes that
      // arrive via drag-from-tool-deck-to-user-library, plus the
      // preset identifier for curated cards.
      "effectRecipe","attributeSelection","capturedAttributes","preset",
      // Surfacing / Most-Used tracking
      "useCount","lastUsedAt","useTextThumb"
    ].forEach(function (k) {
      if (source[k] !== undefined) target[k] = source[k];
    });
  }

  function mergeDefaults(saved) {
    if (!saved || typeof saved !== "object") return JSON.parse(JSON.stringify(DEFAULTS));

    // Version gate: if the stored config was written by a different release,
    // treat it as a fresh install (per project policy — every new version
    // wipes state). Configs with no `version` field are pre-gate legacy
    // configs, which we migrate instead of wiping.
    if (saved.version != null && saved.version !== CONFIG_VERSION) {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }

    var out = JSON.parse(JSON.stringify(DEFAULTS));

    if (saved.panelHotkey) out.panelHotkey = saved.panelHotkey;
    if (saved.searchHotkey) out.searchHotkey = saved.searchHotkey;
    if (saved.onboardingShown === true) out.onboardingShown = true;
    if (saved.proOnboardingSeen === true) out.proOnboardingSeen = true;
    if (saved.refundFeedbackSeen === true) out.refundFeedbackSeen = true;
    if (saved.toolHotkeys && typeof saved.toolHotkeys === "object") {
      out.toolHotkeys = { ...saved.toolHotkeys };
    }
    // User-reordered tool decks. Was previously NOT carried, so any
    // reordering inside Effects 1..5 / Transitions 1..2 reset on every
    // relaunch. Carry it forward verbatim.
    if (saved.toolDeckOrder && typeof saved.toolDeckOrder === "object") {
      out.toolDeckOrder = { ...saved.toolDeckOrder };
    }
    // Pixabay API key the user pasted into the SFX panel. Was
    // previously NOT carried, so the key reset on every relaunch.
    if (typeof saved.pixabayApiKey === "string") {
      out.pixabayApiKey = saved.pixabayApiKey;
    }
    if (saved.tweaks) {
      Object.keys(out.tweaks).forEach(function (k) {
        if (saved.tweaks[k] !== undefined) out.tweaks[k] = saved.tweaks[k];
      });
    }

    // Current schema: libraries[].decks[].slots[]
    if (Array.isArray(saved.libraries) && saved.libraries.length) {
      out.libraries = saved.libraries.map(function (lib, li) {
        var name = (lib && lib.name) || ("User Library " + (li + 1));
        var decks = Array.isArray(lib && lib.decks) && lib.decks.length
          ? lib.decks.map(function (dk, di) {
              var dname = (dk && dk.name) || ("Deck " + (di + 1));
              var fresh = emptyDeck(dname);
              if (dk && Array.isArray(dk.slots)) {
                dk.slots.forEach(function (s, si) {
                  if (si < fresh.slots.length) applySavedSlot(fresh.slots[si], s);
                });
              }
              return fresh;
            })
          : [emptyDeck("Deck 1")];
        // Per-library hotkey — Electron Accelerator string, e.g.
        // "Command+Shift+1". Preserved across launches alongside the
        // library's other fields.
        var hotkey = (lib && typeof lib.hotkey === "string" && lib.hotkey) ? lib.hotkey : null;
        return { name: name, decks: decks, hotkey: hotkey };
      });
      out.activeLibraryIndex = clampIndex(saved.activeLibraryIndex, out.libraries.length);
      out.activeDeckIndex = clampIndex(saved.activeDeckIndex, out.libraries[out.activeLibraryIndex].decks.length);
      return out;
    }

    // Nothing usable; fall through to defaults already in `out`.
    return out;
  }

  function clampIndex(i, length) {
    if (typeof i !== "number" || isNaN(i)) return 0;
    if (i < 0) return 0;
    if (i >= length) return length - 1;
    return i;
  }

  async function load() {
    if (global.clipDeck && typeof global.clipDeck.readConfig === "function") {
      var saved = await global.clipDeck.readConfig();
      return mergeDefaults(saved);
    }
    return mergeDefaults(null);
  }

  async function save(state) {
    if (global.clipDeck && typeof global.clipDeck.writeConfig === "function") {
      return await global.clipDeck.writeConfig(state);
    }
    return false;
  }

  global.ClipDeckStore = {
    KEYMAP: KEYMAP,
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    emptyLibrary: emptyLibrary,
    emptyDeck: emptyDeck,
    emptySlots: emptySlots
  };
})(this);
