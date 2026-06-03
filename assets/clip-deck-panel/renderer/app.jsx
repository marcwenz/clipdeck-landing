// Clip Deck — overlay renderer.
// Talks to the invisible CEP backend over localhost; persists config via
// Electron preload (clipDeck.readConfig/writeConfig).

const { KEYMAP } = ClipDeckStore;
const Client = ClipDeckClient;

const ACCENTS = {
  blue:   { hex: "#4DA3FF", soft: "rgba(77,163,255,.14)", glow: "rgba(77,163,255,.35)" },
  amber:  { hex: "#F5B547", soft: "rgba(245,181,71,.14)", glow: "rgba(245,181,71,.40)" },
  violet: { hex: "#A98BFF", soft: "rgba(169,139,255,.14)", glow: "rgba(169,139,255,.40)" },
};

const PALETTES = {
  graphite: { bg:"#0E0F12", panel:"#15171C", panel2:"#1B1E25", line:"rgba(255,255,255,.06)", line2:"rgba(255,255,255,.10)", text:"#E7E9EE", muted:"#8A8F9C", dim:"#5C616E" },
  ink:      { bg:"#0A0B10", panel:"#11131A", panel2:"#171A23", line:"rgba(255,255,255,.05)", line2:"rgba(255,255,255,.09)", text:"#E4E6EE", muted:"#858A98", dim:"#565B69" },
  warm:     { bg:"#121110", panel:"#1A1816", panel2:"#211E1B", line:"rgba(255,240,220,.06)", line2:"rgba(255,240,220,.10)", text:"#EDE8E1", muted:"#9A9388", dim:"#6A645A" },
};

// Curated Premiere Pro effects shipped under INTHEZONE Tools > Effects.
// Order matters: index N maps to KEYMAP[N], so the user gets a stable
// "Effect 1 = key 1, Effect 11 = key Q" mapping. Bare effects only — no
// param overrides. The backend's applyEffectRecipe falls back to
// getVideoEffectByName(displayName) when matchName is absent, which
// resolves the built-in for every effect in this list. Add matchNames
// here later if a Premiere build returns the wrong variant for any name.
const EFFECT_PRESETS_DECK_1 = [
  "Lumetri Color", "Crop", "Transform", "Gaussian Blur", "Warp Stabilizer",
  "Brightness & Contrast", "Ultra Key", "Horizontal Flip", "Drop Shadow", "Mosaic",
  "Track Matte Key", "Tint", "Sharpen", "Unsharp Mask", "Noise",
  "Vignette", "Black & White", "Offset", "Directional Blur", "Camera Shake",
  "Lens Distortion", "Vertical Flip", "Auto Reframe", "Basic 3D", "4-Color Gradient",
  "Gradient", "Posterize Time", "Video Limiter", "Levels", "ProcAmp",
  "Color Key", "Luma Key", "Invert", "Mirror", "RGB Split",
  "Light Leaks", "Bokeh Blur", "Rounded Crop", "Color Replace", "Color Pass",
];

const EFFECT_PRESETS_DECK_2 = [
  "Gamma Correction", "Corner Pin", "Gradient Wipe", "Lens Flare", "Lightning",
  "Ramp", "Channel Blur", "Channel Mix", "Rolling Shutter Repair", "Magnify",
  "Alpha Adjust", "Wave Warp", "Turbulent Displace", "Twirl", "Spherize",
  "Edge Feather", "Reduce Interlace Flicker", "Camera Blur", "Linear Wipe", "Block Dissolve",
  "Echo", "Posterize", "Alpha Glow", "Brush Strokes", "Find Edges",
  "Replicate", "Roughen Edges", "Strobe Light", "Color Emboss", "Extract",
  "Lighting Effects", "ASC CDL", "Cineon Converter", "Metadata & Timecode Burn-in", "SDR Conform",
  "Simple Text", "Long Shadow", "Stroke", "3D Rotate", "Move",
];

const EFFECT_PRESETS_DECK_3 = [
  "Grow", "Shrink", "Spin", "Wiggle", "Spacer",
  "Auto Align", "Clone", "Compound Blur", "Focus Blur", "Glint",
  "Edge Glow", "Echo Glow", "Wonder Glow", "Volumetric Rays", "Logo Cutout",
  "VR Rotate Sphere", "VR Blur", "VR De-Noise", "VR Projection", "VR Plane to Sphere",
  "VR Sharpen", "VR Color Gradients", "VR Glow", "VR Chromatic Aberrations", "VR Digital Glitch",
  "VR Fractal Noise",
];

const AUDIO_PRESETS_DECK_1 = [
  "DeNoise", "Parametric Equalizer", "Hard Limiter", "Multiband Compressor", "DeReverb",
  "Dynamics", "DeEsser", "Single-band Compressor", "Vocal Enhancer", "Highpass",
  "Loudness Radar", "Mastering", "Amplify", "Channel Volume", "Notch Filter",
  "DeHummer", "Graphic Equalizer", "Studio Reverb", "Bass", "Treble",
  "Lowpass", "Delay", "Pitch Shifter", "Fill Left with Right", "Fill Right with Left",
  "Dynamics Processing", "Tube-modeled Compressor", "Channel Mixer", "Automatic Click Remover", "Analog Delay",
  "Stereo Expander", "Swap Channels", "Invert", "Distortion", "Bandpass",
  "Chorus/Flanger", "Flanger", "Phaser", "Multitap Delay", "FFT Filter",
];

const AUDIO_PRESETS_DECK_2 = [
  "Scientific Filter", "Convolution Reverb", "Surround Reverb", "Guitar Suite",
];

// INTHEZONE Tools > Transitions. Cards are numbered into Video
// Transitions 1 / 2 / 3 decks of 40 each (matches the KEYMAP size).
//
// Native Premiere cards can rely on host-side known-name mapping. Film
// Impact / AE Impacts cards must pass exact pref values; Premiere will
// silently ignore display-name guesses for many third-party transitions.
// Source of truth for these matchNames:
//   /Library/Application Support/Adobe/CEP/extensions/Film Impact Dashboard/data/filmimpact_CEP.json.js
// Stored pref value is "AE." + Film Impact's MATCH_NAME. Confirmed by
// diagnostic: Pop Motion -> AE.AE_Impact_Pop.
const VIDEO_TRANSITIONS_DECK_1 = [
  // Film Impact — Distortions / Smart Tools.
  { displayName: "Text Animator",     matchName: "AE.AE_Impact_Text_Animator" },
  { displayName: "Typewriter",        matchName: "AE.AE_Impact_Typewriter" },
  { displayName: "Chaos",             matchName: "AE.AE_Impact_Chaos" },
  { displayName: "Earthquake",        matchName: "AE.AE_Impact_Earthquake" },
  { displayName: "Flicker",           matchName: "AE.AE_Impact_Flicker" },
  { displayName: "Glass",             matchName: "AE.AE_Impact_Glass" },
  { displayName: "Glitch",            matchName: "AE.AE_Impact_Glitch" },
  { displayName: "Grunge",            matchName: "AE.AE_Impact_Grunge" },
  { displayName: "Kaleidoscope",      matchName: "AE.AE_Impact_Kaleido" },
  { displayName: "Liquid Distortion", matchName: "AE.AE_Impact_Liquid_Distortion" },
  { displayName: "TV Power",          matchName: "AE.AE_Impact_TV_Power" },
  { displayName: "VHS Damage",        matchName: "AE.AE_Impact_VHS_Damage" },
  // Dissolve family — natives are recognised by the host map; Film
  // Impact cards use exact dashboard-derived pref values.
  { displayName: "Additive Dissolve" },
  { displayName: "Blur Dissolve",     matchName: "AE.AE_Impact_Blur_dissolve" },
  { displayName: "Burn Alpha",        matchName: "AE.AE_Impact_Burn_Alpha" },
  { displayName: "Cross Dissolve" },
  { displayName: "Dip to Black" },
  { displayName: "Blur to Color",     matchName: "AE.AE_Impact_Blur_To_Color" },
  { displayName: "Dip to White" },
  { displayName: "Film Dissolve" },
  { displayName: "Luma Fade",         matchName: "AE.AE_Impact_Luma_Fade" },
  { displayName: "Morph Cut" },
  { displayName: "Dissolve",          matchName: "AE.AE_Impact_Dissolve" },
  { displayName: "Burn Chroma",       matchName: "AE.AE_Impact_Burn_White" },
  { displayName: "Chroma Leak",       matchName: "AE.AE_Impact_Chroma_Leaks" },
  { displayName: "Directional Blur",  matchName: "AE.AE_Impact_Directional_Blur" },
  { displayName: "Flare",             matchName: "AE.AE_Impact_Flare" },
  { displayName: "Flash",             matchName: "AE.AE_Impact_Flash" },
  { displayName: "Glow",              matchName: "AE.AE_Impact_Glow" },
  { displayName: "Lens Blur",         matchName: "AE.AE_Impact_Lens_Blur" },
  { displayName: "Light Leak",        matchName: "AE.AE_Impact_Light_Leaks" },
  // Film Impact — Lights & Blurs (filling Deck 1 to 40 before overflow).
  { displayName: "Light Sweep",       matchName: "AE.AE_Impact_Light_Sweep" },
  { displayName: "Phosphor",          matchName: "AE.AE_Impact_Phosphore" },
  { displayName: "Radial Blur",       matchName: "AE.AE_Impact_Radial_Blur" },
  { displayName: "Ray",               matchName: "AE.AE_Impact_Rays" },
  { displayName: "Solarize",          matchName: "AE.AE_Impact_Solarize" },
  { displayName: "Stripe",            matchName: "AE.AE_Impact_Stripes" },
  { displayName: "Zoom Blur",         matchName: "AE.AE_Impact_Zoom_Blur" },
  // Film Impact — Transformers (first two, finishing Deck 1's 40 slots).
  { displayName: "3D Roll",           matchName: "AE.AE_Impact_3D_Roll" },
  { displayName: "Film Roll",         matchName: "AE.AE_Impact_Film_Roll" },
];

const VIDEO_TRANSITIONS_DECK_2 = [
  // Film Impact — Transformers (cont.) / Animation / Wipes. Deck 2 starts
  // where Deck 1 leaves off; 10 trailing slots intentionally left empty.
  { displayName: "Push",         matchName: "AE.AE_Impact_Push" },
  { displayName: "Roll",         matchName: "AE.AE_Impact_Roll" },
  { displayName: "Split",        matchName: "AE.AE_Impact_Split" },
  { displayName: "Stretch",      matchName: "AE.AE_Impact_Stretch" },
  { displayName: "3D Spin",      matchName: "AE.AE_Impact_3D_Rotate" },
  { displayName: "Frame",        matchName: "AE.AE_Impact_Frame" },
  { displayName: "Louver",       matchName: "AE.AE_Impact_3D_Blinds" },
  { displayName: "Mirror",       matchName: "AE.AE_Impact_Mirror" },
  { displayName: "Page Peel",    matchName: "AE.AE_Impact_Page_Peel" },
  { displayName: "Slice",        matchName: "AE.AE_Impact_Slice" },
  { displayName: "Wave",         matchName: "AE.AE_Impact_Wave" },
  { displayName: "Block Motion",  matchName: "AE.AE_Impact_3D_Block" },
  { displayName: "Flip Motion",   matchName: "AE.AE_Impact_3D_Flip" },
  { displayName: "Fold Motion",   matchName: "AE.AE_Impact_Fold" },
  { displayName: "Pop Motion",    matchName: "AE.AE_Impact_Pop" },
  { displayName: "Pull Motion",   matchName: "AE.AE_Impact_Pull" },
  { displayName: "Spin Motion",   matchName: "AE.AE_Impact_Spin" },
  { displayName: "Spring Motion", matchName: "AE.AE_Impact_Spring" },
  { displayName: "Travel Motion", matchName: "AE.AE_Impact_C-Push" },
  { displayName: "Motion Camera", matchName: "AE.AE_Impact_Warp" },
  { displayName: "Motion Tween",  matchName: "AE.AE_Impact_Animate" },
  { displayName: "Shape Flow",    matchName: "AE.AE_Impact_Shape_Flow" },
  { displayName: "Clock Wipe",   matchName: "AE.AE_Impact_Clock_Wipe" },
  { displayName: "Linear Wipe",  matchName: "AE.AE_Impact_Linear_Wipe" },
  { displayName: "Neon Wipe",    matchName: "AE.AE_Impact_Copy_Machine" },
  { displayName: "Panel Wipe",   matchName: "AE.AE_Impact_PanelWipe" },
  { displayName: "Plateau Wipe", matchName: "AE.AE_Impact_Plateau_Wipe" },
  { displayName: "Soft Wipe",    matchName: "AE.AE_Impact_Wipe" },
  { displayName: "Star Wipe",    matchName: "AE.AE_Impact_Star_Wipe" },
  { displayName: "Stretch Wipe", matchName: "AE.AE_Impact_Stretch_Wipe" },
  // Audio crossfades — tagged `audio: true` so the tile renders with
  // the lime audio-transition skin and the host routes the apply call
  // through Premiere's audio-transition preference + the
  // "Apply Audio Transition" menu item. No matchName: Premiere's
  // `BE.Prefs.DefaultAudioTransition` pref accepts the display name
  // directly for the built-in crossfades (verified by
  // qe.project.getAudioTransitionByName).
  { displayName: "Constant Gain",    audio: true },
  { displayName: "Constant Power",   audio: true },
  { displayName: "Exponential Fade", audio: true },
];

// Names that should NOT render their title as the tile thumbnail
// (i.e. fall back to the generic sparkles glyph). Empty today — every
// curated INTHEZONE Tools > Effects card uses the title-as-icon
// treatment. List a name here to opt it out of text-thumb mode later
// (e.g. if a future card needs a true graphical icon instead).
const EFFECT_TEXT_THUMB_OPT_OUT = new Set([]);

// Build a 40-slot effect deck from a list of Premiere effect display
// names. Shorter lists are padded out to the full KEYMAP length with
// empty placeholder slots so the 4×10 grid stays visually consistent
// regardless of how many effects a deck carries. hueOffset shifts the
// whole hue ring so each deck gets a different palette — Deck 1 starts
// at 0°, Deck 2 at 180° (complementary half), Deck 3 at 90° (quarter
// turn), so jumping between decks reads as a visible colour change at
// every tile position.
function buildEffectSlotsFromNames(names, hueOffset = 0, opts = {}) {
  const TOTAL = KEYMAP.length;
  // audio=true tags the recipe component with audio:true so the backend
  // can route to addAudioEffect / getAudioEffectByName instead of the
  // video equivalents once that path is wired. The UI treatment is
  // identical to video effect cards.
  const isAudio = !!opts.audio;
  return Array.from({ length: TOTAL }, (_, i) => {
    const displayName = names[i] || null;
    const hue = (((i * 47) + hueOffset) % 360 + 360) % 360;
    if (!displayName) {
      // Empty placeholder — same shape as ClipDeckStore.emptySlots().
      return {
        key: KEYMAP[i],
        path: null, name: null, tag: null,
        hue, peak: 0.5,
        nodeId: null, kind: null,
        clipboardFile: null, capturedAt: null, captureBytes: null,
        thumb: null, customThumb: false,
        audioOnly: false, captureSubtype: null,
      };
    }
    const recipeComponent = {
      kind: "effect",
      displayName: displayName,
      params: [],
    };
    if (isAudio) recipeComponent.audio = true;
    return {
      key: KEYMAP[i],
      path: null,
      name: displayName,
      tag: null,
      hue, peak: 0.5,
      nodeId: null,
      kind: "effect",
      clipboardFile: null,
      capturedAt: null,
      captureBytes: null,
      thumb: null,
      customThumb: false,
      audioOnly: false,
      captureSubtype: null,
      useTextThumb: !EFFECT_TEXT_THUMB_OPT_OUT.has(displayName),
      effectRecipe: {
        components: [recipeComponent],
      },
    };
  });
}

// Same shape as buildEffectSlotsFromNames, but the recipe components
// carry kind: "transition" — main.js routes those through the
// pref-based set-default + Sequence > Apply Video Transition menu
// flow (see /set-default-transition + clickPremiereMenuItem).
//
// Accepts either a flat string array (legacy: just display names) OR
// an array of { displayName, matchName } objects. matchName, when
// provided, is forwarded into the recipe so the host can write the
// exact Premiere preference value (e.g. "AE.ADBE Cross Dissolve New")
// rather than guessing from the display name.
function buildTransitionSlotsFromNames(names, hueOffset = 0, opts = {}) {
  const TOTAL = KEYMAP.length;
  const deckIsAudio = !!opts.audio;
  return Array.from({ length: TOTAL }, (_, i) => {
    const entry = names[i];
    const displayName = entry
      ? (typeof entry === "string" ? entry : entry.displayName)
      : null;
    const matchName = (entry && typeof entry === "object" && entry.matchName) ? entry.matchName : null;
    // Per-entry `audio: true` overrides the deck-level flag so a single
    // deck can mix video + audio transitions (e.g. tacking a few audio
    // crossfades onto the end of Video Transitions deck 2).
    const isAudio = (entry && typeof entry === "object" && entry.audio === true) || deckIsAudio;
    const hue = (((i * 47) + hueOffset) % 360 + 360) % 360;
    if (!displayName) {
      return {
        key: KEYMAP[i],
        path: null, name: null, tag: null,
        hue, peak: 0.5,
        nodeId: null, kind: null,
        clipboardFile: null, capturedAt: null, captureBytes: null,
        thumb: null, customThumb: false,
        audioOnly: false, captureSubtype: null,
      };
    }
    const recipeComponent = {
      kind: "transition",
      displayName: displayName,
      matchName: matchName,
      audio: isAudio,
    };
    return {
      key: KEYMAP[i],
      path: null,
      name: displayName,
      tag: null,
      hue, peak: 0.5,
      nodeId: null,
      kind: "effect", // tile renders the same way as effect cards
      clipboardFile: null,
      capturedAt: null,
      captureBytes: null,
      thumb: null,
      customThumb: false,
      audioOnly: false,
      captureSubtype: null,
      useTextThumb: !EFFECT_TEXT_THUMB_OPT_OUT.has(displayName),
      effectRecipe: {
        components: [recipeComponent],
      },
    };
  });
}

const I = {
  clock:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.6"/></svg>,
  search: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13 13"/></svg>,
  play:   (p) => <svg {...p} viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5v9l8-4.5z"/></svg>,
  pause:  (p) => <svg {...p} viewBox="0 0 16 16" fill="currentColor"><rect x="4.5" y="3.5" width="2.5" height="9" rx="0.6"/><rect x="9" y="3.5" width="2.5" height="9" rx="0.6"/></svg>,
  cmd:    (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 5h6v6H5z"/><circle cx="3.5" cy="3.5" r="1.5"/><circle cx="12.5" cy="3.5" r="1.5"/><circle cx="3.5" cy="12.5" r="1.5"/><circle cx="12.5" cy="12.5" r="1.5"/></svg>,
  lock:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>,
  // Video camera silhouette — rectangle body + viewfinder notch on the right.
  video:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="9" height="8" rx="1.5"/><path d="M11 6.5l3-1.5v6l-3-1.5z"/></svg>,
  // Photo icon — frame with sun + mountain silhouette.
  image:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1"/><path d="M2.5 11.5l3.5-3 3 2 4.5-4"/></svg>,
  // Layers icon — three stacked diamonds, signals a captured nested sequence.
  stack:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 2.5L2.5 5.2 8 8l5.5-2.8L8 2.5z"/><path d="M2.5 8L8 10.8 13.5 8M2.5 10.8L8 13.5l5.5-2.7"/></svg>,
  // Clip Deck mark — brand-green square hosting four smaller "cards", one
  // per accent. Used as the "captured-from-timeline" placeholder thumbnail
  // so the slot reads as "this is a Clip Deck capture" at a glance.
  // Clapperboard — generic placeholder for timeline-captured slots that have
  // no real frame thumbnail. Uses currentColor so it picks up the slot's
  // overlay color (semi-transparent white over the gradient).
  clip:   (p) => <svg {...p} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="12" width="24" height="14" rx="2"/><path d="M4 12l3-5 4 5M11 7l4 5M15 7l4 5M19 7l4 5"/></svg>,
  // Two horizontal arrows pointing in opposite directions — "swap" indicator.
  swap:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h14M14 5l3 3-3 3"/><path d="M21 16H7M10 19l-3-3 3-3"/></svg>,
  // Sliders / preferences — three horizontal tracks with knobs at varying
  // positions. Reads as "preferences/settings" more clearly than a gear at
  // the small sizes we use in the brand row.
  settings: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h8M13 4h1M2 8h3M8 8h6M2 12h7M12 12h2"/><circle cx="11.5" cy="4" r="1.5" fill="currentColor" stroke="none"/><circle cx="6.5" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="10.5" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>,
  // Caret pointing down — used by the Insert Options select indicator.
  caret:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5l4 4 4-4"/></svg>,
  // Text-tool placeholder — square frame with two side-handle dots and
  // a bold serif "T" inside. Mirrors Premiere's Essential Graphics text
  // tool icon. Monochrome (currentColor) so it picks up the slot's
  // overlay white. The frame is a stroke (not a fill) so it doesn't
  // mask out the slot's background gradient.
  // Design notes for the T path:
  //   • cap (x 10→22, width 12) clearly wider than base (x 12→20, width 8)
  //     so it reads as a T not an I
  //   • inset from frame edges (frame inner is ~7→25) for breathing room
  //   • centered: T spans y 9.5→22.5, center y=16 = frame center
  text:   (p) => <svg {...p} viewBox="0 0 32 32" fill="currentColor">
    <rect x="6" y="6" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="5" cy="16" r="2"/>
    <circle cx="27" cy="16" r="2"/>
    <path d="M10 9.5 H22 V12 H17.5 V20 H20 V22.5 H12 V20 H14.5 V12 H10 Z"/>
  </svg>,
  // MOGRT — Premiere-style Motion Graphics Template silhouette.
  // Rounded square frame with a stylized "M" + arc above to convey
  // "motion graphic". Monochrome (currentColor) to stay consistent
  // with the rest of the icon set.
  mogrt:  (p) => <svg {...p} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="24" height="24" rx="4"/><path d="M9 22V11l4 7 4-7v11" strokeWidth="2.4"/><path d="M19 22v-7a3 3 0 013-3h2" strokeWidth="2.4"/><circle cx="24" cy="22" r="1.4" fill="currentColor" stroke="none"/></svg>,
  // Nested folder — placeholder for "mixed" captures (selection had
  // 2+ distinct clip kinds, e.g. text + video). Folder tab with two
  // smaller folder/sheet shapes peeking out, conveying "this thing
  // contains multiple kinds of stuff".
  nested: (p) => <svg {...p} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V25a2 2 0 002 2h22a2 2 0 002-2V12a2 2 0 00-2-2H15l-3-3H5a2 2 0 00-2 2z"/><rect x="9" y="14" width="14" height="9" rx="1.2"/><path d="M12 14v9M16 14v9M20 14v9"/></svg>,
  // Effect / FX — sparkles glyph. Conveys "this slot holds an effect
  // preset, not a media clip". Used for kind: "effect" captures from
  // Premiere's Effects panel.
  fx: (p) => <svg {...p} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 5 L17.5 11 L23.5 12 L17.5 13 L16 19 L14.5 13 L8.5 12 L14.5 11 Z" fill="currentColor"/>
    <path d="M24 19 L24.8 21.5 L27.3 22 L24.8 22.5 L24 25 L23.2 22.5 L20.7 22 L23.2 21.5 Z" fill="currentColor"/>
    <path d="M8 21 L8.6 22.8 L10.4 23.2 L8.6 23.6 L8 25.4 L7.4 23.6 L5.6 23.2 L7.4 22.8 Z" fill="currentColor"/>
  </svg>,
  // Transition — two overlapping clips with a diagonal "crossfade"
  // wedge between them. Reads as "this fires a transition between
  // two clips" rather than the sparkles glyph used for effects.
  transition: (p) => <svg {...p} viewBox="0 0 32 32" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    {/* Left clip — solid rectangle, opacity full */}
    <rect x="4"  y="10" width="14" height="12" rx="1.5" fill="currentColor" fillOpacity=".95" stroke="none"/>
    {/* Right clip — solid rectangle, sits behind the wedge */}
    <rect x="14" y="10" width="14" height="12" rx="1.5" fill="currentColor" fillOpacity=".55" stroke="none"/>
    {/* Diagonal "crossfade" wedge between them, picked out by a hairline */}
    <path d="M14 22 L20 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeOpacity=".9"/>
  </svg>,
};

// Repeatable gradient backdrop for a slot tile (audio/empty/letterbox cases).
function tileGradient(hue) {
  return `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 80% 60% / .55), transparent 55%),
          radial-gradient(120% 100% at 90% 95%, hsl(${(hue+34)%360} 70% 40% / .55), transparent 55%),
          linear-gradient(135deg, hsl(${hue} 35% 14%), hsl(${(hue+20)%360} 30% 8%))`;
}

// Fuzzy match score for search. Higher = closer match. 0 = no match.
// Strategy (highest priority first):
//   1. Exact match
//   2. Whole-string prefix
//   3. Word-boundary exact / prefix (split on space _ - . / , ; :)
//   4. Substring contained anywhere
//   5. Character-by-character subsequence fallback (tighter spread = higher)
function searchScore(needle, haystack) {
  if (!haystack) return 0;
  const q = String(needle).toLowerCase();
  const t = String(haystack).toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 850 - (t.length - q.length);
  const words = t.split(/[\s_\-./,;:]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === q) return 750 - i * 5;
    if (w.startsWith(q)) return 650 - (w.length - q.length) - i * 5;
  }
  if (t.includes(q)) return 450;
  // Subsequence fuzzy: every char of q appears in t in order. Score
  // penalises gaps so "imp" matches "Impact" tighter than "I-am-positive".
  let qi = 0, lastIdx = -1, gap = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (lastIdx !== -1) gap += i - lastIdx - 1;
      lastIdx = i;
      qi++;
    }
  }
  if (qi === q.length) return Math.max(50, 220 - gap * 4);
  return 0;
}

// ── File-type classification + thumbnail helpers ─────────────────────────
const AUDIO_EXTS = ["wav","mp3","aif","aiff","m4a","flac","ogg","oga","aac","wma","opus","ac3","amr"];
const IMAGE_EXTS = ["jpg","jpeg","jpe","jfif","png","gif","webp","tiff","tif","bmp","heic","heif","avif","svg","ico"];
const VIDEO_EXTS = ["mp4","m4v","mov","qt","avi","mkv","webm","mxf","mpg","mpeg","mpe","mp2","m2v","m2ts","mts","ts","3gp","3g2","ogv","wmv","flv","f4v","divx","vob"];

function fileKind(path) {
  if (!path) return "other";
  const ext = String(path).split(".").pop().toLowerCase();
  if (AUDIO_EXTS.indexOf(ext) >= 0) return "audio";
  if (IMAGE_EXTS.indexOf(ext) >= 0) return "image";
  if (VIDEO_EXTS.indexOf(ext) >= 0) return "video";
  return "other";
}

// Convert an absolute path to a `file://` URL safe for use in CSS background:
// url(...) and the <video src> attribute. encodeURI handles spaces and most
// special characters; we additionally escape `#`, `?`, `(`, `)` because they
// have special meaning in URIs / CSS.
function pathToFileUrl(p) {
  if (!p) return "";
  return "file://" + encodeURI(p)
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

// Hidden <video> seeks to the first frame, draws it onto a canvas, returns
// a JPEG data URL. Resolves null on any failure (corrupt file, unsupported
// codec, etc.) so the caller can fall back to the gradient placeholder.
function extractVideoFirstFrame(filePath) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    let done = false;
    const finish = (result) => { if (done) return; done = true; try { video.src = ""; } catch (e) {} resolve(result); };
    video.onloadedmetadata = () => {
      // Seek slightly past 0 — some codecs return a black frame at exactly 0.
      try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); }
      catch (e) { finish(null); }
    };
    video.onseeked = () => {
      try {
        const maxW = 320;
        const w = video.videoWidth || 1;
        const h = video.videoHeight || 1;
        const scale = Math.min(1, maxW / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.78));
      } catch (e) { finish(null); }
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000); // hard cap — corrupt files shouldn't hang us forever
    try { video.src = pathToFileUrl(filePath); }
    catch (e) { finish(null); }
  });
}

// Right-click context menu: 10 V2-design-aligned colours rendered as a
// 2×5 grid. Each entry carries an explicit top/bot/border triple so
// the swatch matches the tile body exactly when the user picks it.
// Selecting a colour writes the triple onto the slot's `customColor`
// field, which SlotTile applies as an inline gradient overriding the
// per-type V2 gradient. `hue` is kept for backward compat with any
// legacy code that still reads slot.hue.
const COLOR_OPTIONS = [
  // ── Row 1 — Claude Design palette ────────────────────────────
  { name: "Blue",    hue: 245, top: "oklch(0.44 0.13 245)", bot: "oklch(0.31 0.12 248)", border: "oklch(0.22 0.10 250)", text: "#eaf1ff" },
  { name: "Cyan",    hue: 215, top: "oklch(0.62 0.13 215)", bot: "oklch(0.48 0.13 218)", border: "oklch(0.32 0.11 218)", text: "#eaf5fb" },
  { name: "Lime",    hue: 125, top: "oklch(0.78 0.18 125)", bot: "oklch(0.66 0.18 122)", border: "oklch(0.52 0.16 122)", text: "#0f2b00" },
  { name: "Yellow",  hue:  92, top: "oklch(0.78 0.15 92)",  bot: "oklch(0.66 0.16 88)",  border: "oklch(0.55 0.14 85)",  text: "#2b1f02" },
  { name: "Orange",  hue:  55, top: "#d56a18",              bot: "#a4470a",              border: "#5d2603",              text: "#fff1e3" },
  // ── Row 2 — extras to round out the palette ──────────────────
  { name: "Red",     hue:  22, top: "#7a1f15",              bot: "#4d0c05",              border: "#2d0500",              text: "#ffe6df" },
  { name: "Magenta", hue: 340, top: "oklch(0.50 0.19 340)", bot: "oklch(0.38 0.19 340)", border: "oklch(0.26 0.16 340)", text: "#ffe3f4" },
  { name: "Purple",  hue: 295, top: "oklch(0.46 0.16 295)", bot: "oklch(0.34 0.15 298)", border: "oklch(0.26 0.12 298)", text: "#f0e8ff" },
  { name: "Teal",    hue: 185, top: "oklch(0.50 0.10 195)", bot: "oklch(0.36 0.10 195)", border: "oklch(0.24 0.08 195)", text: "#e6f7f5" },
  { name: "Slate",   hue: 250, top: "oklch(0.42 0.04 250)", bot: "oklch(0.30 0.04 250)", border: "oklch(0.20 0.03 250)", text: "#e8ebef" },
];

// Mini gradient that matches the tile's full gradient style for swatches.
function gradientFor(hue) {
  return `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 85% 62%), transparent 60%),
          radial-gradient(120% 100% at 90% 95%, hsl(${(hue+34)%360} 70% 38%), transparent 60%),
          linear-gradient(135deg, hsl(${hue} 50% 22%), hsl(${(hue+20)%360} 50% 12%))`;
}
// V2-style flat gradient for swatches + tile overrides — matches the
// two-stop linear gradient the type-themed tiles already use.
function swatchGradientFor(opt) {
  return `linear-gradient(180deg, ${opt.top} 0%, ${opt.bot} 100%)`;
}

// Lightweight, reusable context menu — just a vertical list of actions.
// Used by libraries (sidebar) and decks (topbar). The slot tile uses its own
// richer ContextMenu below because it needs the colour swatch grid.
function SimpleContextMenu({ x, y, items, onClose }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ left: x, top: y });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top:  Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);
  return (
    <>
      <div className="cd-ctx-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}/>
      <div ref={ref} className="cd-ctx" style={{ left: pos.left, top: pos.top }}
           onMouseDown={(e) => e.stopPropagation()}
           onContextMenu={(e) => e.preventDefault()}>
        {items.map((it, i) => (
          <button key={i}
            className={`cd-ctx-item${it.danger ? " danger" : ""}`}
            disabled={!!it.disabled}
            onClick={it.onClick}>
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

// Context menu with an inline hotkey-recorder row above the regular
// action list. Used by the library right-click menu + the INTHEZONE
// tool right-click menu so users can assign a quick-jump shortcut to
// each surface without leaving the menu.
//
// Recording flow:
//   1. User clicks the hotkey row → record mode → "Press a key…" appears.
//   2. Next non-modifier keydown is captured + converted to an Electron
//      Accelerator string via keyEventToAccelerator(). onSetHotkey is
//      called with that string. The menu stays open so the user can
//      verify the binding rendered correctly.
//   3. Esc during recording cancels (leaves the existing binding alone).
//
// The recorder uses a window-level capture-phase keydown listener so it
// beats the App's global handlers (deck jump, slot fire, etc.) — the
// user can record any combo they want, including ones that conflict
// with existing bindings. Conflicts are the user's problem to resolve;
// we don't enforce reserved-key rules.
function HotkeyContextMenu({ x, y, label, currentHotkey, onSetHotkey, onClearHotkey, items, onClose, proLocked, onProLocked }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ left: x, top: y });
  const [recording, setRecording] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top:  Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);
  React.useEffect(() => {
    if (!recording) return;
    const onKey = (e) => {
      // Swallow the event up front — both modifier-only presses and
      // the resolved combo. Without this, the App's global keydown
      // handler races ahead and fires a slot for things like Shift+A,
      // and on some Shift combos the OS injects its own behaviour
      // (e.g. text selection / focus shift) before our handler runs.
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); return; }
      const accel = keyEventToAccelerator(e);
      if (!accel) return; // pure modifier (Shift / Cmd / Alt) — keep listening
      onSetHotkey(accel);
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onSetHotkey]);
  return (
    <>
      <div className="cd-ctx-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}/>
      <div ref={ref} className="cd-ctx" style={{ left: pos.left, top: pos.top }}
           onMouseDown={(e) => e.stopPropagation()}
           onContextMenu={(e) => e.preventDefault()}>
        <div className="cd-ctx-hotkey-row">
          <button
            type="button"
            className={`cd-ctx-hotkey-btn${recording ? " recording" : ""}${proLocked ? " pro-locked" : ""}`}
            onClick={() => {
              if (proLocked) { onProLocked && onProLocked(); return; }
              setRecording((r) => !r);
            }}
            title={proLocked ? "Pro feature — click to upgrade" : (recording ? "Press any key combo (Esc to cancel)" : "Click to set a hotkey")}>
            {proLocked
              ? <><span>Set hotkey</span><span className="cd-ctx-pro-lock" aria-hidden="true">🔒</span></>
              : (recording ? "Press…" : (currentHotkey ? hotkeyLabel(currentHotkey) : "Set hotkey"))}
          </button>
          {currentHotkey && !recording && (
            <button
              type="button"
              className="cd-ctx-hotkey-clear"
              onClick={() => { onClearHotkey(); }}
              title="Remove this hotkey">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
        {(items && items.length > 0) && <div className="cd-ctx-divider"/>}
        {(items || []).map((it, i) => (
          <button key={i}
            className={`cd-ctx-item${it.danger ? " danger" : ""}`}
            disabled={!!it.disabled}
            onClick={it.onClick}>
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

// Confirmation dialog — two buttons (Cancel + a custom-labelled action).
// Esc cancels, Enter confirms.
function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onConfirm(); }
    };
    // Capture-phase so we beat the overlay's global key handler.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm, onCancel]);
  return (
    <div className="cd-confirm-scrim" onMouseDown={onCancel}>
      <div className="cd-confirm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cd-confirm-title">{title}</div>
        {message && <div className="cd-confirm-msg">{message}</div>}
        <div className="cd-confirm-actions">
          <button className="cd-confirm-btn" onClick={onCancel}>{cancelLabel || "Cancel"}</button>
          <button autoFocus className={`cd-confirm-btn${danger ? " danger" : " primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ContextMenu({ x, y, slotIndex, slot, onRename, onClear, onSetHue, onCapture, onCaptureEffect, onCaptureTransition, onPickThumb, onResetThumb, onClose }) {
  const ref = React.useRef(null);
  // Clamp into viewport so the menu never overflows.
  const [pos, setPos] = React.useState({ left: x, top: y });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - r.width - 8);
    const top  = Math.min(y, window.innerHeight - r.height - 8);
    setPos({ left, top });
  }, [x, y]);

  // A slot is "populated" if it has *any* source: a disk file, an imported
  // project nodeId, or a saved Premiere clipboard capture. Mirrors the
  // SlotTile.isEmpty check so timeline-captured cards can be renamed/cleared.
  const hasContent = !!(slot && (slot.path || slot.clipboardFile || slot.nodeId || slot.effectRecipe));

  // Copied effect cards (dragged in from the Effects tool) are locked: the
  // effect recipe + thumbnail + name are canonical, so Save Clips, Save
  // Attributes, Rename, and thumbnail edits are all disabled. Clear stays
  // open so the user can free the slot.
  const isPreset = !!(slot && slot.preset);

  return (
    <>
      <div className="cd-ctx-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}/>
      <div ref={ref} className="cd-ctx" style={{ left: pos.left, top: pos.top }}
           onMouseDown={(e) => e.stopPropagation()}
           onContextMenu={(e) => e.preventDefault()}>
        <div className="cd-ctx-h">Save Preset</div>
        <button className="cd-ctx-item"
                disabled={isPreset}
                onClick={() => onCapture(slotIndex)}>
          Save Clips
        </button>
        <button className="cd-ctx-item"
                disabled={isPreset}
                onClick={() => onCaptureEffect(slotIndex)}>
          Save Attributes
        </button>
        <button className="cd-ctx-item"
                disabled={isPreset}
                onClick={() => onCaptureTransition(slotIndex)}>
          Save Transition
        </button>
        <div className="cd-ctx-divider"/>
        <button className="cd-ctx-item"
                disabled={!hasContent || isPreset}
                onClick={() => onRename(slotIndex)}>
          Rename
        </button>
        <button className="cd-ctx-item"
                disabled={!hasContent || isPreset}
                onClick={() => onPickThumb(slotIndex)}>
          Choose thumbnail…
        </button>
        {slot && slot.customThumb && !isPreset && (
          <button className="cd-ctx-item"
                  onClick={() => onResetThumb(slotIndex)}>
            Reset thumbnail
          </button>
        )}
        <button className="cd-ctx-item danger"
                disabled={!hasContent}
                onClick={() => onClear(slotIndex)}>
          Clear
        </button>
        <div className="cd-ctx-divider"/>
        <div className="cd-ctx-h">Color</div>
        <div className="cd-ctx-colors">
          {COLOR_OPTIONS.map((c) => {
            const active = !!(slot && slot.customColor && slot.customColor.name === c.name);
            return (
              <button key={c.name}
                title={active ? `${c.name} (click to clear)` : c.name}
                className={`cd-ctx-color${active ? " active" : ""}`}
                style={{ background: swatchGradientFor(c) }}
                onClick={() => onSetHue(slotIndex, active ? null : c)}/>
            );
          })}
        </div>
      </div>
    </>
  );
}

function hotkeyLabel(code) {
  if (!code) return "—";
  if (code === "Backquote") return "`";
  // Pretty-print an Electron Accelerator string ("Command+Shift+K") with mac glyphs.
  const SYMS = {
    Command: "⌘", Cmd: "⌘", CommandOrControl: "⌘", CmdOrCtrl: "⌘",
    Control: "⌃", Ctrl: "⌃",
    Alt: "⌥", Option: "⌥",
    Shift: "⇧",
    Return: "↵", Enter: "↵",
    Backspace: "⌫", Delete: "⌦",
    Tab: "⇥", Escape: "⎋",
    Space: "Space",
    Up: "↑", Down: "↓", Left: "←", Right: "→"
  };
  return code.split("+").map((p) => SYMS[p] || p).join("");
}

// Convert a browser KeyboardEvent into an Electron Accelerator string
// (e.g. "Command+Shift+K"). Returns null for modifier-only presses.
function keyEventToAccelerator(e) {
  if (["Meta","Control","Alt","Shift","OS","Hyper","Super"].indexOf(e.key) !== -1) return null;
  const parts = [];
  if (e.metaKey)  parts.push("Command");
  if (e.ctrlKey)  parts.push("Control");
  if (e.altKey)   parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = mapCodeToAccelerator(e);
  if (!k) return null;
  parts.push(k);
  return parts.join("+");
}

function mapCodeToAccelerator(e) {
  const code = e.code || "";
  if (/^Key[A-Z]$/.test(code))   return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const SPECIAL = {
    Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'",
    Comma: ",", Period: ".", Slash: "/",
    Space: "Space", Enter: "Return", Tab: "Tab",
    Backspace: "Backspace", Delete: "Delete",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown"
  };
  if (code in SPECIAL) return SPECIAL[code];
  if (e.key && e.key.length === 1) return e.key.toUpperCase();
  return null;
}

function normaliseAcceleratorKey(key) {
  const k = String(key || "");
  const ALIASES = {
    Enter: "Return",
    Esc: "Escape",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right"
  };
  return (ALIASES[k] || k).toUpperCase();
}

function eventMatchesAccelerator(e, accel) {
  if (!accel) return false;
  const parts = String(accel).split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  let wantMeta = false;
  let wantCtrl = false;
  let wantAlt = false;
  let wantShift = false;
  let wantCmdOrCtrl = false;
  let key = "";
  parts.forEach((part) => {
    if (part === "Command" || part === "Cmd") wantMeta = true;
    else if (part === "Control" || part === "Ctrl") wantCtrl = true;
    else if (part === "Alt" || part === "Option") wantAlt = true;
    else if (part === "Shift") wantShift = true;
    else if (part === "CommandOrControl" || part === "CmdOrCtrl") wantCmdOrCtrl = true;
    else key = part;
  });
  if (!key) return false;
  if (wantCmdOrCtrl) {
    if (!e.metaKey && !e.ctrlKey) return false;
  } else {
    if (!!e.metaKey !== wantMeta) return false;
    if (!!e.ctrlKey !== wantCtrl) return false;
  }
  if (!!e.altKey !== wantAlt) return false;
  if (!!e.shiftKey !== wantShift) return false;
  return normaliseAcceleratorKey(key) === normaliseAcceleratorKey(mapCodeToAccelerator(e));
}

function waveSamples(seed, n, peak) {
  const out = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const t = i / (n - 1);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(t, .55)), 1.4);
    const noise = .25 + r * .75;
    out.push(Math.max(.04, env * noise * peak));
  }
  return out;
}

function Waveform({ seed, peak, color, height = 56, bars = 64, accent }) {
  const samples = React.useMemo(() => waveSamples(seed, bars, peak), [seed, bars, peak]);
  return (
    <div className="cd-wave" style={{ height }}>
      {samples.map((v, i) => (
        <span key={i} style={{
          height: `${Math.round(v * 100)}%`,
          background: i === Math.floor(bars * .18) ? accent : color,
        }}/>
      ))}
    </div>
  );
}

function LibraryRow({ library, index, active, isEditing, onPick, onStartRename, onFinishRename, onRename, onContextMenu, accent, dragActive, onDwellSwitch, locked, onLockedClick }) {
  const [draft, setDraft] = React.useState("");
  React.useEffect(() => { if (isEditing) setDraft(library.name || ""); }, [isEditing]);
  // Dwell-to-switch: while a slot drag is in flight, hovering this row for
  // ~700ms switches the active library so the user can drop into one of its
  // slots in the same drag gesture.
  const [dwellActive, setDwellActive] = React.useState(false);
  const dwellTimerRef = React.useRef(null);
  React.useEffect(() => {
    if (!dragActive) {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
      if (dwellActive) setDwellActive(false);
    }
  }, [dragActive]);

  const finish = (commit) => {
    if (commit) {
      const next = draft.trim();
      if (next && next !== library.name) onRename(index, next);
    }
    onFinishRename();
  };
  const onContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(index, e);
  };
  const onDragOver = (e) => {
    if (!dragActive) return;
    // Locked-on-Free libraries can't be dwelled into either — dragging a
    // slot in mid-air shouldn't bypass the access-time paywall.
    if (locked) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (active) return; // already on this library, no need to dwell
    if (!dwellActive) setDwellActive(true);
    if (!dwellTimerRef.current) {
      dwellTimerRef.current = setTimeout(() => {
        if (onDwellSwitch) onDwellSwitch(index);
        dwellTimerRef.current = null;
      }, 700);
    }
  };
  const onDragLeave = () => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    if (dwellActive) setDwellActive(false);
  };
  const cls = `cd-side-item no-ico${active ? " on" : ""}${dwellActive && !active ? " dwell-active" : ""}${locked ? " locked" : ""}`;
  return (
    <button className={cls}
      onClick={() => { if (locked) { onLockedClick && onLockedClick(index); return; } onPick(index); }}
      onContextMenu={onContext}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}>
      <span className="cd-side-rail" style={{ background: active ? accent.hex : "transparent" }}/>
      {isEditing ? (
        <input
          className="cd-side-label-edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="cd-side-label" onDoubleClick={(e) => { if (locked) return; e.stopPropagation(); onStartRename(index); }}>
          {library.name}
        </span>
      )}
      {locked && <span className="cd-side-item-lock" aria-hidden="true">🔒</span>}
    </button>
  );
}

// Modal shown when an osascript keystroke / menu-click hits the macOS
// 1002 error ("not allowed to send keystrokes"). The user needs to grant
// Accessibility permission in System Settings — there's no programmatic
// way to do this for them, so we explain it as plainly as possible and
// hand them a button that deep-links to the right pane.
function AccessibilityDeniedModal({ onClose }) {
  // Esc to dismiss — matches the rest of our modals.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const openSettings = async () => {
    if (window.clipDeck && window.clipDeck.openAccessibilitySettings) {
      await window.clipDeck.openAccessibilitySettings();
    }
  };

  return (
    <>
      <div className="cd-paywall-scrim" onMouseDown={onClose}/>
      <div className="cd-access-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="cd-access-headline">Permission needed</h2>
        <p className="cd-access-sub">
          Clip Deck needs your permission to control Premiere Pro. Without
          it, capturing and firing clips will not work.
        </p>
        <ol className="cd-access-steps">
          <li>Click <b>Open Settings</b> below.</li>
          <li>Find <b>Clip Deck</b> in the list and turn the switch <b>on</b>.</li>
          <li>Quit and reopen Clip Deck.</li>
        </ol>
        <div className="cd-access-actions">
          <button className="cd-access-cta" onClick={openSettings}>
            Open Settings
          </button>
          <button className="cd-access-link" onClick={onClose}>
            I'll do this later
          </button>
        </div>
      </div>
    </>
  );
}

// First-launch welcome / onboarding modal. Shown exactly once per
// install — gated on `config.onboardingShown`. Surfaces the three-step
// mental model (add assets → open with backtick → fire onto timeline)
// before the user lands in an empty overlay. Dismiss via the bottom
// CTA, the corner X, or Escape; any of those persist the flag.
//
// "Watch Quick Tutorial" opens the demo video in the user's default
// browser. TUTORIAL_URL is hot-swappable here — update the constant
// when the production tutorial video is published.
const ONBOARDING_TUTORIAL_URL = "https://www.youtube.com/watch?v=vU3Du4H56g0";

function OnboardingModal({ onDismiss }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDismiss(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDismiss]);

  const watchTutorial = () => {
    if (window.clipDeck && window.clipDeck.openExternal) {
      window.clipDeck.openExternal(ONBOARDING_TUTORIAL_URL);
    }
    onDismiss();
  };

  return (
    <>
      <div className="cd-onboarding-scrim"/>
      <div className="cd-onboarding-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="cd-onboarding-close" aria-label="Close" onClick={onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <img className="cd-onboarding-art" src="assets/onboarding.png" alt="Welcome to Clip Deck"/>
        <button className="cd-onboarding-cta" onClick={watchTutorial}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Watch Quick Tutorial
        </button>
      </div>
    </>
  );
}

// Update banner — fixed-position pill at the top of the overlay,
// visible whenever main fires `update:available`. Click "Install"
// to start the download → verify → install flow.
function UpdateBanner({ manifest, onInstall, onSnooze }) {
  return (
    <div className="cd-update-banner" role="alert">
      <div className="cd-update-banner-text">
        <span className="cd-update-banner-label">Update available</span>
        <span className="cd-update-banner-version">v{manifest.version}</span>
        {manifest.releaseNotes ? (
          <span className="cd-update-banner-notes">{manifest.releaseNotes}</span>
        ) : null}
      </div>
      <div className="cd-update-banner-actions">
        <button type="button" className="cd-update-banner-snooze" onClick={onSnooze}>
          Remind me later
        </button>
        <button type="button" className="cd-update-banner-cta" onClick={onInstall}>
          Install
        </button>
      </div>
    </div>
  );
}

// Update progress modal — shown while the .pkg downloads + verifies.
// Phases: "downloading" (with byte progress) → "verifying" → "opening"
// → (handed off to macOS Installer, app quits, modal goes away with it).
function UpdateModal({ phase, progress, error, onClose }) {
  const pct = progress && progress.total
    ? Math.min(99, Math.round((progress.received / progress.total) * 100))
    : null;
  const phaseLabel = ({
    downloading: pct != null ? `Downloading… ${pct}%` : "Downloading…",
    verifying:   "Verifying download…",
    opening:     "Opening installer…",
    error:       "Update failed",
  })[phase] || "Updating…";
  return (
    <>
      <div className="cd-paywall-scrim"/>
      <div className="cd-update-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="cd-update-modal-title">{phaseLabel}</h2>
        <div className="cd-update-modal-bar">
          <div className="cd-update-modal-bar-fill"
               style={{ width: phase === "error" ? "100%" : (pct != null ? `${pct}%` : "30%") }}/>
        </div>
        {error ? (
          <>
            <p className="cd-update-modal-error">{error}</p>
            <button className="cd-update-modal-close" onClick={onClose}>Close</button>
          </>
        ) : phase === "opening" ? (
          <p className="cd-update-modal-hint">
            macOS will prompt for your password to complete the install.
          </p>
        ) : (
          <p className="cd-update-modal-hint">
            Don't quit Clip Deck while the update downloads.
          </p>
        )}
      </div>
    </>
  );
}

// Preferences modal — full-window scrim + centered dialog, matching the
// Paywall's visual language. Hosts settings that used to live in their
// own sidebar slot (Panel Hotkey) plus newer preferences (Insert Options).
// Esc-to-close is handled centrally by the global keydown handler in App
// via prefsOpenRef.
function PrefsMenu({ panelHotkey, recordingHotkey, onClickHotkey, insertMode, onInsertModeChange, onUpgradeClick, onProBadgeClick, onClose, onCheckForUpdates, autoUpdate, onToggleAutoUpdate, onExportTransitionIndex, onReadDefaultTransition }) {
  const [insertOpen, setInsertOpen] = React.useState(false);
  const [devicesOpen, setDevicesOpen] = React.useState(false);
  // Free users see an "Enter License Key" row that opens the
  // EnterLicenseKey modal (paywall.jsx). Pro users don't need it on
  // their primary Mac, so the row is hidden once isPro flips true.
  const [licenseKeyOpen, setLicenseKeyOpen] = React.useState(false);
  // Pull license state inline so we can gate the Manage devices button —
  // only Pro accounts have any device list to manage. The badge in the
  // corner does this too via PlanBadge, but it's a separate render.
  const lic = window.useLicense ? window.useLicense() : { isPro: false, eligibleForRefund: false };
  // 30-day refund — confirmation modal + in-flight + error state.
  // The link is hidden by `lic.eligibleForRefund` (Pro + within 30 days
  // of pro_since + has_refunded=false) so the click handler only ever
  // runs when the backend will accept the request.
  const [refundConfirmOpen, setRefundConfirmOpen] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);
  const [refundError, setRefundError] = React.useState(null);
  // Translate the backend's machine-code error into a user-friendly
  // sentence. refund_api_failed surfaces Gumroad's own message verbatim
  // (e.g. "The sale was unable to be modified" for free / test sales)
  // so support can debug without round-tripping the user.
  const refundErrorCopy = (code, detail) => {
    switch (code) {
      case "not_activated":
      case "device_not_registered":
        return "This Mac isn't currently activated on a Pro license.";
      case "not_pro":
        return "Your Pro license is already inactive.";
      case "already_refunded":
        return "You've already used your one-time in-app refund. For another refund, please email hello@inthezone.studio.";
      case "no_order_on_record":
        return "We can't find a Gumroad order tied to this license. Please email hello@inthezone.studio for help.";
      case "outside_window":
        return "Your 30-day refund window has closed. For a manual refund, please email hello@inthezone.studio.";
      case "refund_api_failed":
        return detail
          ? `Gumroad couldn't process this refund: "${detail}". Please email hello@inthezone.studio for help.`
          : "Gumroad couldn't process this refund. Please email hello@inthezone.studio for help.";
      default:
        return "Refund failed — please try again, or email hello@inthezone.studio for help.";
    }
  };
  const onConfirmRefund = async () => {
    setRefunding(true);
    setRefundError(null);
    const res = await lic.requestRefund();
    setRefunding(false);
    if (res && res.ok) {
      // Server flipped pro=0 + has_refunded=1; license.jsx already
      // applied the same state synchronously. Close both modals so the
      // App-level RefundFeedback mount can take over.
      setRefundConfirmOpen(false);
      onClose();
    } else {
      setRefundError(refundErrorCopy(res && res.error, res && res.detail));
    }
  };
  const INSERT_OPTIONS = [
    { value: "smart", label: "Smart Insert" },
    { value: "track", label: "Track Target" },
  ];
  const currentInsert = INSERT_OPTIONS.find((o) => o.value === (insertMode || "smart")) || INSERT_OPTIONS[0];
  // Mock news items — placeholders for the eventual /news.json feed from
  // api.inthezone.studio. The render shape here is the one the real feed
  // will follow (kind, title, subtitle, date, optional CTA), so wiring up
  // live data later is just swapping this array for a fetched list.
  const NEWS_ITEMS = [
    { id: "update-0.4.0", kind: "update",  title: "Clip Deck v0.4.0 is available", subtitle: "Decks rename, paywall, news feed", date: "May 7", cta: "Update" },
    { id: "pro-launch",   kind: "release", title: "Clip Deck Pro is here",         subtitle: "Unlimited libraries, search, and more", date: "May 5" },
    { id: "tutorial-1",   kind: "tutorial",title: "Capturing timeline selections", subtitle: "A 90-second tour of the new flow",      date: "Apr 28" },
    { id: "spotlight-1",  kind: "news",    title: "Behind the scenes at INTHEZONE",subtitle: "How we test before every release",     date: "Apr 22" },
  ];
  return (
    <>
      <div className="cd-paywall-scrim" onMouseDown={onClose}/>
      <div className="cd-prefs-modal cd-prefs-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
        {/* Top-right cluster — PRO/FREE badge plus "Watch Demo Tutorial"
            shortcut so users can re-open the onboarding video later. */}
        <div className="cd-prefs-badge-wrap">
          <button
            type="button"
            className="cd-prefs-tutorial-btn"
            onClick={() => {
              if (window.clipDeck && window.clipDeck.openExternal) {
                window.clipDeck.openExternal(ONBOARDING_TUTORIAL_URL);
              }
            }}
            title="Open the Clip Deck demo tutorial on YouTube">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Watch Demo Tutorial
          </button>
          {window.PlanBadge && (
            <window.PlanBadge
              onUpgradeClick={onUpgradeClick}
              onProClick={onProBadgeClick}/>
          )}
        </div>
        <h2 className="cd-paywall-headline">Preferences</h2>
        <div className="cd-prefs-cols">
          {/* Left column — actual settings. */}
          <div className="cd-prefs-col">
            <div className="cd-prefs-col-h">Settings</div>
            <div className="cd-prefs-list">
              <div className="cd-prefs-row">
                <div className="cd-prefs-label">Panel hotkey</div>
                <button
                  className={`cd-prefs-hotkey${recordingHotkey ? " recording" : ""}`}
                  onClick={onClickHotkey}
                  title={recordingHotkey ? "Press a key (Esc to cancel)" : "Click to change panel hotkey"}>
                  {recordingHotkey ? "Press…" : hotkeyLabel(panelHotkey)}
                </button>
              </div>
              <div className="cd-prefs-row">
                <div className="cd-prefs-label">Insert mode</div>
                <div className="cd-prefs-select-wrap">
                  {/* Custom (non-native) dropdown so opening the picker doesn't
                      steal window focus and trigger the overlay's blur-to-hide. */}
                  <button
                    type="button"
                    className="cd-prefs-select"
                    onClick={() => setInsertOpen((v) => !v)}>
                    <span>{currentInsert.label}</span>
                    <I.caret className="cd-prefs-select-caret"/>
                  </button>
                  {insertOpen && (
                    <div className="cd-prefs-options">
                      {INSERT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`cd-prefs-option${opt.value === currentInsert.value ? " active" : ""}`}
                          onClick={() => {
                            onInsertModeChange && onInsertModeChange(opt.value);
                            setInsertOpen(false);
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Updates — manual check + auto-check toggle on the same row. */}
              <div className="cd-prefs-row">
                <div className="cd-prefs-label">Updates</div>
                <div className="cd-prefs-row-actions">
                  <label className="cd-prefs-toggle">
                    <input
                      type="checkbox"
                      checked={autoUpdate !== false}
                      onChange={(e) => onToggleAutoUpdate && onToggleAutoUpdate(e.target.checked)}/>
                    <span className="cd-prefs-toggle-track" aria-hidden="true"/>
                    <span className="cd-prefs-toggle-label">
                      {autoUpdate !== false ? "Auto" : "Manual"}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="cd-prefs-action"
                    onClick={onCheckForUpdates}>
                    Check for Updates
                  </button>
                </div>
              </div>
              {/* Device manager entry point — Pro only AND hidden in
                  beta-silent mode (the testing variant doesn't expose
                  device management since testers don't have a real
                  Pro account). */}
              {lic.isPro && !window.BETA_NO_PAYWALL && (
                <div className="cd-prefs-row">
                  <div className="cd-prefs-label">Devices</div>
                  <button
                    type="button"
                    className="cd-prefs-action"
                    onClick={() => setDevicesOpen(true)}>
                    Manage devices
                  </button>
                </div>
              )}
              {/* Enter License Key — Free users only. Opens the
                  EnterLicenseKey modal from paywall.jsx. The modal
                  closes itself when activation succeeds; license.jsx
                  flips to Pro synchronously so the rest of Preferences
                  re-renders (the row disappears, Manage devices
                  appears). Hidden in beta-silent mode for parity with
                  the rest of the licensing surface. */}
              {!lic.isPro && !window.BETA_NO_PAYWALL && (
                <div className="cd-prefs-row">
                  <div className="cd-prefs-label">License key</div>
                  <button
                    type="button"
                    className="cd-prefs-action"
                    onClick={() => setLicenseKeyOpen(true)}>
                    Enter License Key
                  </button>
                </div>
              )}
            </div>
            {/* 30-day in-app refund link — plain text, right-aligned at
                the bottom of the SETTINGS column (intentionally not in
                the right-hand graphic column, where the welcome panel
                lives). Visible only when the user is Pro, within the
                30-day window, and hasn't already used their
                once-in-a-lifetime in-app refund. After the window
                closes (or after a previous refund) it silently
                disappears — no countdown, no warning. */}
            {lic.eligibleForRefund && !window.BETA_NO_PAYWALL && (
              <div className="cd-prefs-refund-footer">
                <button
                  type="button"
                  className="cd-prefs-refund-link"
                  onClick={() => setRefundConfirmOpen(true)}>
                  Request Refund
                </button>
              </div>
            )}
          </div>
          {/* Right column — same welcome graphic shown during onboarding,
              repurposed here as a visual aside next to the settings list. */}
          <div className="cd-prefs-col cd-prefs-col--art">
            <img className="cd-prefs-art" src="assets/onboarding.png" alt="Clip Deck"/>
          </div>
        </div>
      </div>
      {/* Devices modal — rendered as a sibling to the prefs modal so it
          can stack on top via its own scrim + z-index. Closing the
          modal returns the user to Preferences (Prefs stays open). */}
      {devicesOpen && window.DevicesModal && (
        <window.DevicesModal onClose={() => setDevicesOpen(false)}/>
      )}
      {/* Enter License Key modal — same stacking pattern. On success it
          closes itself; the surrounding Preferences re-renders
          automatically since license.jsx applies the new Pro state
          synchronously. */}
      {licenseKeyOpen && window.EnterLicenseKey && (
        <window.EnterLicenseKey onClose={() => setLicenseKeyOpen(false)}/>
      )}
      {/* Refund confirmation dialog. Reuses the existing ConfirmDialog
          component (danger button styling, Esc/Enter handled centrally).
          Closing during an in-flight request is blocked so the user
          can't double-fire the Gumroad refund API. refundErrorCopy()
          above produces a self-contained sentence (no need to wrap
          it in extra prefix/suffix here). */}
      {refundConfirmOpen && (
        <ConfirmDialog
          title="Refund your Clip Deck Pro purchase?"
          message={
            refundError
              ? refundError
              : refunding
              ? "Processing refund…"
              : "You'll be reverted to Free immediately. Refunds typically appear on your card in 5–10 business days.\n\nThis can only be done once — re-purchasing Pro later won't restore refund eligibility."
          }
          confirmLabel={refunding ? "Refunding…" : "Refund my purchase"}
          cancelLabel="Cancel"
          danger
          onConfirm={refunding ? () => {} : onConfirmRefund}
          onCancel={() => { if (!refunding) { setRefundConfirmOpen(false); setRefundError(null); } }}/>
      )}
    </>
  );
}

function Sidebar({
  libraries, activeLibraryIndex, onPickLibrary, onAddLibrary,
  onAddLibraryContextMenu,
  editingLibIndex, onStartRenameLib, onFinishRenameLib, onRenameLib,
  onLibraryContextMenu, onLockedLibraryClick,
  accent, density, query, onQuery, onFocusSearch,
  searchHotkey, recordingSearchHotkey, onClickSearchHotkey,
  dragActive, onLibraryDwellSwitch,
  onUpgradeClick, onLockedToolClick, onOpenTool, onToolContextMenu, activeTool, isPro,
  // NOTE: onOpenCgfy is intentionally removed while VFX Engine is locked.
  // When re-enabling, add it back here and at the App-level callsite.
  searchLocked, onLockedSearchClick,
  prefsOpen, onTogglePrefs, onClosePrefs,
  insertMode, onInsertModeChange,
  onSearchKeyDown
}) {
  // Tiny gear lives in the lower-right of the brand row. Absolutely
  // positioned so it doesn't push the title or icon around — same
  // visual layout as before the gear existed.
  return (
    <aside className="cd-side" data-density={density}>
      <div className="cd-side-brand">
        <div className="cd-brand-mark" style={{ background: "#00ff95" }}>
          <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
            <rect x="6"  y="6"  width="8" height="8" rx="1.5" fill="#000000"/>
            <rect x="16" y="6"  width="8" height="8" rx="1.5" fill="#000000"/>
            <rect x="6"  y="16" width="8" height="8" rx="1.5" fill="#000000"/>
            <rect x="16" y="16" width="8" height="8" rx="1.5" fill="#0a4d2a"/>
          </svg>
        </div>
        <div className="cd-brand-text">
          <div className="cd-brand-name">Clip Deck</div>
          <div className="cd-brand-sub">INTHEZONE</div>
        </div>
        <button
          className="cd-prefs-trigger"
          onClick={onTogglePrefs}
          title="Preferences"
          aria-label="Preferences">
          <I.settings className="cd-prefs-trigger-ico"/>
        </button>
      </div>

      <div className={`cd-search${searchLocked ? " locked" : ""}`}
           onClick={searchLocked ? onLockedSearchClick : undefined}>
        <I.search className="cd-search-ico"/>
        <input className="cd-search-input" placeholder={searchLocked ? "Search" : "Search…"} value={query}
          disabled={searchLocked || undefined}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            // Esc with text → clear search (don't bubble up to the global
            // Esc handler which hides the panel). Esc with no text → bubble.
            if (e.key === "Escape" && query) {
              e.preventDefault();
              e.stopPropagation();
              onQuery("");
              return;
            }
            // Arrow keys + Enter → navigate / fire the search-result
            // grid. Handled at the App level so the highlight state
            // and fire helpers are in scope; the handler returns true
            // when it consumed the key so we don't fall through to
            // the input's default behaviour (which would move the
            // text cursor).
            if (onSearchKeyDown && onSearchKeyDown(e)) return;
          }}/>
        {searchLocked
          ? <I.lock className="cd-search-lock"/>
          : <button
              className={`cd-search-cmd${recordingSearchHotkey ? " recording" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onClickSearchHotkey) onClickSearchHotkey();
                else if (onFocusSearch) onFocusSearch();
              }}
              title={recordingSearchHotkey ? "Press a key combo (Esc to cancel)" : "Click to change search hotkey"}>
              <span>{recordingSearchHotkey ? "Press…" : hotkeyLabel(searchHotkey || "CommandOrControl+`")}</span>
            </button>
        }
      </div>

      <nav className="cd-side-nav">
        <div className="cd-side-h">User Libraries</div>
        {libraries.map((lib, i) => {
          // Free tier: only the first library (index 0) is accessible.
          // Libraries 2+ stay visible but read-only — clicking opens the
          // paywall. Mirrors the addLibrary creation gate (~L5490) so the
          // access-time check and the create-time check use the same flag
          // pair (PAYWALL_ENABLED && !isPro).
          const locked = !!window.PAYWALL_ENABLED && !isPro && i > 0;
          return (
            <LibraryRow key={i}
              library={lib} index={i}
              active={!activeTool && i === activeLibraryIndex}
              isEditing={editingLibIndex === i}
              onPick={onPickLibrary}
              onStartRename={onStartRenameLib}
              onFinishRename={onFinishRenameLib}
              onRename={onRenameLib}
              onContextMenu={onLibraryContextMenu}
              accent={accent}
              dragActive={dragActive}
              onDwellSwitch={onLibraryDwellSwitch}
              locked={locked}
              onLockedClick={onLockedLibraryClick}/>
          );
        })}
        <button className="cd-side-add" onClick={onAddLibrary} onContextMenu={onAddLibraryContextMenu}>
          <span className="cd-side-add-plus">+</span>
          <span>Add library</span>
        </button>
      </nav>

      <div className="cd-side-tools">
        <div className="cd-side-h">INTHEZONE Tools</div>
        {/* VFX Engine + Auto Cut moved into Utility Plugins as
            marketplace cards (per 2026-05-17 redesign). The CGfy view
            code + IPC handlers are still wired; the entry point is now
            inside the Utility Plugins panel. See memory/project_vfx_engine.md
            for the full architectural state. */}
        <div className="cd-side-tools-list">
          {["Effects","Transitions","Pixabay","Utility Plugins","Youtube"].map((label) => {
            const on = activeTool === label;
            // Free tier gets Effects + Transitions only; the other three
            // are Pro-gated. Click on a locked tool surfaces the paywall
            // (with the "tools" feature highlighted) instead of opening
            // an empty/half-broken view.
            const FREE_TOOLS = new Set(["Effects", "Transitions"]);
            const locked = !isPro && !FREE_TOOLS.has(label);
            return (
              <div key={label}
                   className={`cd-side-tool-item${on ? " on" : ""}${locked ? " locked" : ""}`}
                   onClick={() => {
                     if (locked) { onLockedToolClick && onLockedToolClick(label); return; }
                     onOpenTool && onOpenTool(label);
                   }}
                   onContextMenu={(e) => {
                     e.preventDefault();
                     if (onToolContextMenu) onToolContextMenu(label, e);
                   }}
                   style={{ cursor: "pointer" }}>
                <span className="cd-side-rail" style={{ background: on ? accent.hex : "transparent" }}/>
                <span className="cd-side-label">{label}</span>
                {locked && <span className="cd-side-tool-lock" aria-hidden="true">🔒</span>}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function DeckTab({ deck, index, active, isEditing, onPick, onStartRename, onFinishRename, onRename, onContextMenu, accent, dragActive, onDwellSwitch, locked, onLockedClick }) {
  const [draft, setDraft] = React.useState("");
  React.useEffect(() => { if (isEditing) setDraft(deck.name || ""); }, [isEditing]);
  // Dwell-to-switch: while a slot drag is in flight, hovering this tab for
  // ~700ms switches the active deck so the user can drop into one of its
  // slots in the same drag gesture. Mirrors LibraryRow's pattern.
  const [dwellActive, setDwellActive] = React.useState(false);
  const dwellTimerRef = React.useRef(null);
  React.useEffect(() => {
    if (!dragActive) {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
      if (dwellActive) setDwellActive(false);
    }
  }, [dragActive]);

  const finish = (commit) => {
    if (commit) {
      const next = draft.trim();
      if (next && next !== deck.name) onRename(index, next);
    }
    onFinishRename();
  };
  const onContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(index, e);
  };
  const onDragOver = (e) => {
    if (!dragActive) return;
    // Locked-on-Free decks reject dwell-switching for the same reason
    // LibraryRow does — drag shouldn't bypass the access-time paywall.
    if (locked) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (active) return; // already on this deck, no need to dwell
    if (!dwellActive) setDwellActive(true);
    if (!dwellTimerRef.current) {
      dwellTimerRef.current = setTimeout(() => {
        if (onDwellSwitch) onDwellSwitch(index);
        dwellTimerRef.current = null;
      }, 700);
    }
  };
  const onDragLeave = () => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    if (dwellActive) setDwellActive(false);
  };
  const baseStyle = active
    ? { color: accent.hex, borderColor: accent.glow, background: accent.soft }
    : null;
  if (isEditing) {
    return (
      <span className={`cd-tag on`} style={baseStyle}>
        <input
          className="cd-tag-edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          size={Math.max(4, draft.length || 1)}
        />
      </span>
    );
  }
  return (
    <button className={`cd-tag${active ? " on" : ""}${dwellActive && !active ? " dwell-active" : ""}${locked ? " locked" : ""}`}
      style={baseStyle}
      onClick={() => { if (locked) { onLockedClick && onLockedClick(index); return; } onPick(index); }}
      onDoubleClick={onStartRename && !locked ? () => onStartRename(index) : undefined}
      onContextMenu={onContext}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}>
      {deck.name}
      {locked && <span className="cd-tag-lock" aria-hidden="true">🔒</span>}
    </button>
  );
}

function Topbar({
  decks, activeDeckIndex, onPickDeck, onAddDeck,
  editingDeckIndex, onStartRenameDeck, onFinishRenameDeck, onRenameDeck,
  onDeckContextMenu,
  accent,
  dragActive, onDeckDwellSwitch,
  isPro, onLockedDeckClick
}) {
  return (
    <header className="cd-top">
      <div className="cd-decks">
        {decks.map((deck, i) => {
          // Free-tier deck lock: only triggers when the caller passes an
          // onLockedDeckClick (i.e. we're in the user-library view; tool
          // decks pass undefined since Effects + Transitions are free).
          // Mirrors addDeck's gate at ~L5592 (PAYWALL_ENABLED && !isPro).
          const locked = !!onLockedDeckClick && !!window.PAYWALL_ENABLED && !isPro && i > 0;
          return (
            <DeckTab key={i}
              deck={deck} index={i}
              active={i === activeDeckIndex}
              isEditing={editingDeckIndex === i}
              onPick={onPickDeck}
              onStartRename={onStartRenameDeck}
              onFinishRename={onFinishRenameDeck}
              onRename={onRenameDeck}
              onContextMenu={onDeckContextMenu}
              accent={accent}
              dragActive={dragActive}
              onDwellSwitch={onDeckDwellSwitch}
              locked={locked}
              onLockedClick={onLockedDeckClick}/>
          );
        })}
      </div>
      <div className="cd-top-actions">
        {onAddDeck && (
          <button className="cd-adddeck" onClick={onAddDeck}>
            <span className="cd-adddeck-plus">+</span>
            <span>Add deck</span>
          </button>
        )}
      </div>
    </header>
  );
}

// "1:23" / "0:08" — minutes:seconds with zero-padded seconds. Returns
// null for non-finite values so callers can suppress the duration chip
// entirely when there's no real duration to show (e.g. before the
// metadata load resolves). Named `formatDurationLabel` to avoid
// colliding with `formatDuration` further down in the file (used by
// the Pixabay SFX browser with a different "?:??" fallback shape).
function formatDurationLabel(seconds) {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return null;
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ":" + String(secs).padStart(2, "0");
}

// Lazy-load media duration via a hidden <video> / <audio> element.
// Mirrors how extractVideoFirstFrame works elsewhere — only fires for
// disk-backed clips (path required); captured clipboard / sequence
// slots return null. Cached per (path, kind) tuple via the cache map
// so re-renders don't reload the metadata.
const __mediaDurationCache = (typeof window !== "undefined")
  ? (window.__cdMediaDurationCache = window.__cdMediaDurationCache || new Map())
  : new Map();
// Per-URL cache for "does this image have transparent edges?" probes.
// Detecting alpha purely by file extension misses webp/gif/tiff/etc
// that legitimately carry alpha, so we sample the actual decoded
// pixels. Stored on window so HMR / hot-rerender keeps the cache warm
// across component remounts — probing the same image multiple times
// is wasteful when nothing changed.
const __alphaEdgeCache = (typeof window !== "undefined")
  ? (window.__cdAlphaEdgeCache = window.__cdAlphaEdgeCache || new Map())
  : new Map();

function probeImageAlphaEdge(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const SIZE = 64;
          const w = Math.min(img.naturalWidth || SIZE, SIZE);
          const h = Math.min(img.naturalHeight || SIZE, SIZE);
          if (!w || !h) { resolve(false); return; }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          // Threshold ~94% opaque — anything less counts as transparent.
          // Photo JPEGs sometimes carry trace alpha through encoders, so
          // we don't trip on the absolute top of the 0-255 range.
          const ALPHA_THRESH = 240;
          // Sample a 2-pixel-wide ring around the image edge. Most logos
          // / icons / cutouts show transparency along the entire border;
          // checking just the outermost row would miss images that left
          // a 1px opaque feather. We bail out the moment any sampled
          // pixel is below the threshold.
          const RING = 2;
          const idx = (x, y) => (y * w + x) * 4 + 3;
          for (let r = 0; r < RING; r++) {
            for (let x = r; x < w - r; x++) {
              if (data[idx(x, r)] < ALPHA_THRESH) { resolve(true); return; }
              if (data[idx(x, h - 1 - r)] < ALPHA_THRESH) { resolve(true); return; }
            }
            for (let y = r; y < h - r; y++) {
              if (data[idx(r, y)] < ALPHA_THRESH) { resolve(true); return; }
              if (data[idx(w - 1 - r, y)] < ALPHA_THRESH) { resolve(true); return; }
            }
          }
          resolve(false);
        } catch (e) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = url;
    } catch (e) { resolve(false); }
  });
}

// Hook — returns true if the image at `imageUrl` has transparency along
// its edges (logo / cutout / sticker). Used to pick contain-vs-cover
// rendering on the V2 tile thumb. While the probe is in flight, falls
// back to a file-extension hint (PNG and many webp/gif typically carry
// alpha) so the first paint isn't catastrophically wrong.
function useImageHasAlphaEdge(imageUrl) {
  const extGuess = React.useMemo(() => {
    if (!imageUrl) return false;
    // Treat PNG as likely-transparent for the initial guess. webp/gif/
    // avif/tiff may or may not — the actual probe corrects either way.
    return /\.png(?:$|\?|#)/i.test(imageUrl);
  }, [imageUrl]);

  const cached = imageUrl ? __alphaEdgeCache.get(imageUrl) : undefined;
  const [hasAlpha, setHasAlpha] = React.useState(
    typeof cached === "boolean" ? cached : extGuess
  );

  React.useEffect(() => {
    if (!imageUrl) { setHasAlpha(false); return; }
    const hit = __alphaEdgeCache.get(imageUrl);
    if (typeof hit === "boolean") { setHasAlpha(hit); return; }
    let alive = true;
    probeImageAlphaEdge(imageUrl).then((result) => {
      __alphaEdgeCache.set(imageUrl, result);
      if (alive) setHasAlpha(result);
    });
    return () => { alive = false; };
  }, [imageUrl]);

  return hasAlpha;
}

function useMediaDuration(path, kind) {
  const isMedia = (kind === "video" || kind === "audio");
  const cached = (isMedia && path) ? __mediaDurationCache.get(path) : null;
  const [seconds, setSeconds] = React.useState(cached || null);
  React.useEffect(() => {
    if (!isMedia || !path) { setSeconds(null); return; }
    const hit = __mediaDurationCache.get(path);
    if (hit) { setSeconds(hit); return; }
    let alive = true;
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.muted = true;
    const onMeta = () => {
      if (!alive) return;
      if (el.duration && isFinite(el.duration)) {
        __mediaDurationCache.set(path, el.duration);
        setSeconds(el.duration);
      }
    };
    el.addEventListener("loadedmetadata", onMeta, { once: true });
    try { el.src = pathToFileUrl(path); } catch (e) {}
    return () => {
      alive = false;
      try { el.removeEventListener("loadedmetadata", onMeta); } catch (e) {}
      try { el.src = ""; el.load && el.load(); } catch (e) {}
    };
  }, [path, kind, isMedia]);
  return seconds;
}

// V2 tactile-skin SVG waveform. Deterministic bar pattern keyed by a
// seed string so the same slot draws the same shape across renders.
// Centerline-symmetric (low at edges, high in middle) — matches the
// design's makeWaveform helper verbatim.
function V2Waveform({ seed, bars = 38 }) {
  const heights = React.useMemo(() => {
    let s = 2166136261;
    const str = String(seed || "v2-wave");
    for (let i = 0; i < str.length; i++) {
      s ^= str.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
    const out = [];
    for (let i = 0; i < bars; i++) {
      s = Math.imul(s, 1103515245) + 12345;
      s = s & 0x7fffffff;
      const t = i / (bars - 1);
      const env = 0.35 + 0.65 * Math.sin(t * Math.PI);
      const noise = (s % 1000) / 1000;
      out.push(0.16 + noise * 0.78 * env);
    }
    return out;
  }, [seed, bars]);
  const total = heights.length;
  return (
    <svg className="v2-waveform" viewBox={`0 0 ${total * 4} 40`} preserveAspectRatio="none" aria-hidden="true">
      {heights.map((h, i) => {
        const barH = h * 40;
        return (
          <rect key={i} x={i * 4 + 0.5} y={(40 - barH) / 2}
                width={2} height={barH} rx={1} fill="currentColor"/>
        );
      })}
    </svg>
  );
}

// V2 card-title renderer. Single line always — anything past the right
// edge clips and only reveals on hover via the .v2-name-text marquee
// (translateX animation). The inner span exists so translateX has
// something inline-block to pivot off of, since transforms on the
// absolutely-positioned `.v2-name` outer don't shift content the way
// marquees need.
//
// Measures inner vs outer width on mount + on tile resize, then
// publishes the exact overflow distance as `--marquee-end` (negative
// px). The hover CSS animates translateX from 0 to that value and
// stops there (animation-fill-mode: forwards, iteration-count: 1) so
// the end of the title sits flush against the right edge instead of
// looping back.
function V2Name({ media, text }) {
  const outerRef = React.useRef(null);
  const innerRef = React.useRef(null);
  React.useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const compute = () => {
      const outerW = outer.clientWidth;
      const innerW = inner.scrollWidth;
      const overflow = innerW - outerW;
      const end = overflow > 0 ? -overflow : 0;
      inner.style.setProperty("--marquee-end", end + "px");
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={outerRef} className={`v2-name${media ? " v2-name--media" : ""}`}>
      <span ref={innerRef} className="v2-name-text">{text}</span>
    </span>
  );
}

function SlotTile({ slot, index, hovered, onHover, onActivate, onAssignFile, onDropFile, onContextMenu, onRenameSlot, onSetThumb, isEditingName, onFinishRename, accent, showShortcuts, onMoveSlot, onArmSwap, onCancelSwap, onCommitSwap, isPreviewSrc, isPreviewDst, isCapturing, draggingIndex, crossDeckSwapOk, onDragStartSlot, onDragEndSlot, libIdx, deckIdx }) {
  const [dragOver, setDragOver] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  // Dwell-to-swap timer. While the user holds a dragged slot over this
  // populated tile, a 700ms timer triggers a *visual* swap preview. The
  // underlying data only changes if the user drops on this tile.
  const dwellTimerRef = React.useRef(null);
  // A captured sequence has no `path` but does carry a `nodeId` — it's still
  // a populated slot, just sourced from the project bin instead of disk.
  // A populated slot has at least one of: a disk path, a project nodeId,
  // or a saved Premiere clipboard capture file (the latter covers both
  // clipboard-kind cards and effect-kind cards — both store
  // slot.clipboardFile).
  const isEmpty = !slot.path && !slot.nodeId && !slot.clipboardFile && !slot.effectRecipe;
  const isOn = hovered;
  const hotkey = slot.key;
  const editingName = isEditingName;
  // Derive `kind` from path if it wasn't stored (handles legacy slots).
  const kind = slot.kind || fileKind(slot.path);
  // Media duration hook — MUST run unconditionally on every render
  // (Rules of Hooks), so it sits above the isEmpty early return below.
  // When the slot becomes empty after a move/swap the hook still runs;
  // it just returns null because path is falsy.
  const durationSeconds = useMediaDuration(slot.path, kind);
  const durationLabel = formatDurationLabel(durationSeconds);

  // Alpha-edge probe hook — same Rules-of-Hooks rule applies. We need
  // to call it on every render regardless of whether the slot is empty
  // (otherwise saving a clip into an empty slot changes the hook count
  // between renders → React tears down the renderer). For empty slots
  // imageUrl resolves to null and the hook returns false instantly.
  const earlyImageUrl =
    (slot.customThumb && slot.thumb) ? slot.thumb :
    (slot.kind || fileKind(slot.path)) === "image" ? (slot.path ? pathToFileUrl(slot.path) : null) :
    (((slot.kind || fileKind(slot.path)) === "video") && slot.thumb) ? slot.thumb :
    null;
  const thumbFitContainHoisted = useImageHasAlphaEdge(earlyImageUrl);

  // Lazy-extract a video first-frame for any slot that's a video without a
  // stored thumb. Runs once per (path, thumb) change and only for video kind.
  React.useEffect(() => {
    if (kind !== "video" || !slot.path || slot.thumb) return;
    let cancelled = false;
    extractVideoFirstFrame(slot.path).then((dataUrl) => {
      if (!cancelled && dataUrl) onSetThumb(index, dataUrl);
    });
    return () => { cancelled = true; };
  }, [kind, slot.path, slot.thumb]);

  // Seed the typing buffer when the parent flips this tile into edit mode.
  React.useEffect(() => {
    if (editingName) setNameDraft(slot.name || "");
  }, [editingName]);

  const finishEditName = (commit) => {
    if (commit) {
      const next = nameDraft.trim();
      if (next && next !== slot.name) onRenameSlot(index, next);
    }
    onFinishRename();
  };
  const onContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(index, e);
  };

  // True when this tile is being dragged FROM (the lifted card).
  const isBeingDragged = draggingIndex === index;
  // True when *another* slot is being dragged. Used so the cursor on this
  // tile says "you can drop here" (move) instead of "+ copy" (file drop).
  // crossDeckSwapOk fires the same signal when a tool drag arrived from
  // a different deck — in that case draggingIndex is null (source not in
  // this grid) yet the tile should still accept the swap drop.
  const isInternalSrc = (draggingIndex != null && draggingIndex !== index)
    || (libIdx < 0 && crossDeckSwapOk);

  // Cancel any pending dwell when the drag context goes away.
  React.useEffect(() => {
    if (!isInternalSrc || !dragOver || isEmpty) {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    }
  }, [isInternalSrc, dragOver, isEmpty]);

  const onDragOver = (e) => {
    // Tool slots (libIdx < 0) accept drops ONLY from another internal
    // slot drag — that's how curated Effects / Transitions cards are
    // reordered. File drops + drags from a populated user-library
    // slot do nothing here (the tool deck's content is locked).
    if (libIdx < 0 && !isInternalSrc) return;
    e.preventDefault();
    if (isInternalSrc && e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
    // Arm the dwell timer the first time we hover a populated tile during a
    // slot drag. The timer is idempotent — only the first dragOver after
    // entering this tile starts it. When it fires, the parent flips on a
    // visual preview swap (this tile's content slides into the source's slot
    // and wiggles; nothing is committed until a drop here).
    if (isInternalSrc && !isEmpty && !isPreviewDst && !dwellTimerRef.current) {
      dwellTimerRef.current = setTimeout(() => {
        if (onArmSwap) onArmSwap(index);
        dwellTimerRef.current = null;
      }, 700);
    }
  };
  const onDragLeave = () => {
    setDragOver(false);
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    // Leaving the destination of an active preview cancels it — the user is
    // no longer aiming for the swap, and the tiles should snap back.
    if (isPreviewDst && onCancelSwap) onCancelSwap();
  };

  // Internal slot-to-slot drag. Populated tiles only — empty tiles have
  // nothing to move. Carries the slot's full coords (lib/deck/slot) via the
  // App-level dragSource state (set in onDragStartSlot) so the drop can
  // resolve correctly even if the user dwells over a different library row
  // mid-drag and the active library/deck changes before they release.
  const onSlotDragStart = (e) => {
    if (isEmpty || editingName) { e.preventDefault(); return; }
    if (e.dataTransfer) {
      try { e.dataTransfer.setData("application/x-clipdeck-slot", String(index)); } catch (err) {}
      // Some browsers require text/plain too for the drag to be recognized.
      try { e.dataTransfer.setData("text/plain", "clipdeck-slot:" + index); } catch (err) {}
      e.dataTransfer.effectAllowed = "move";
    }
    if (onDragStartSlot) onDragStartSlot({ libIdx, deckIdx, slotIdx: index });
  };
  const onSlotDragEnd = () => { if (onDragEndSlot) onDragEndSlot(); };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }

    // Internal slot move beats every other interpretation of the drop. The
    // payload is just a sentinel; the real source coords live in App state
    // (so cross-library moves still resolve correctly).
    const internal = e.dataTransfer && e.dataTransfer.getData &&
      e.dataTransfer.getData("application/x-clipdeck-slot");
    if (internal !== "" && internal != null) {
      // Tool slots only ever swap — no move/replace allowed since the
      // deck's content is locked. If the 700ms dwell-arm preview has
      // already fired, commit it; otherwise fall straight through to
      // onMoveSlot for an INSTANT swap (no dwell required) — mirrors
      // the user-library drop path below so tool decks feel just as
      // snappy as the main panel.
      if (libIdx < 0) {
        if (isPreviewDst && onCommitSwap) onCommitSwap();
        else if (onMoveSlot) onMoveSlot(index);
        return;
      }
      // Dropping on the destination of an active dwell preview commits
      // the swap. Otherwise we hand off to onMoveSlot, which now decides:
      // populated destination → swap, empty destination → move. The
      // replace/overwrite path was retired (see App.onTileMove).
      if (isPreviewDst && onCommitSwap) onCommitSwap();
      else if (onMoveSlot) onMoveSlot(index);
      return;
    }

    // Tool slots reject file drops — nothing below this point applies.
    if (libIdx < 0) return;

    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];

    // Try every viable path source in order of reliability:
    //  1. webUtils.getPathForFile — recommended by Electron 32+
    //  2. file.path — legacy, removed in Electron 32 but harmless to try
    //  3. text/uri-list — Finder always sets this on macOS
    let p = null;

    if (f && window.clipDeck && window.clipDeck.getPathForFile) {
      try { p = window.clipDeck.getPathForFile(f); } catch (err) {}
    }
    if (!p && f && f.path) p = f.path;

    if (!p && e.dataTransfer && e.dataTransfer.getData) {
      const uriList = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uriList) {
        // Finder may pass multiple URIs separated by \r\n; take the first.
        const firstUri = uriList.split(/\r?\n/).find((line) => line && !line.startsWith("#"));
        if (firstUri && firstUri.indexOf("file://") === 0) {
          p = decodeURIComponent(firstUri.slice(7));
          // file://localhost/... → /...
          if (p.indexOf("localhost") === 0) p = p.slice(9);
        }
      }
    }

    if (!p) {
      // No file path resolved. Two possibilities:
      //  1. Drag came from Premiere's timeline (no file on the pasteboard)
      //     → forward as fromPremiere so the slot triggers a capture.
      //  2. Genuinely empty drop (rare) → toast.
      // We can't always tell them apart, so we let the parent decide based
      // on whether ANY drag data came across at all.
      const hasAnyData = e.dataTransfer &&
        ((e.dataTransfer.types && e.dataTransfer.types.length > 0) ||
         (e.dataTransfer.items && e.dataTransfer.items.length > 0));
      onDropFile(index, { path: null, name: f ? f.name : "drop", fromPremiere: hasAnyData });
      return;
    }
    onDropFile(index, { path: p, name: (f && f.name) || p.split("/").pop() });
  };

  const isPreviewing = isPreviewSrc || isPreviewDst;
  const dwellPending = isInternalSrc && dragOver && !isEmpty && !isPreviewDst;
  // While previewing, suppress the lifted-card "dragging" look on the source
  // tile — visually it now hosts the destination's content and should look
  // like a regular tile (with the preview wiggle on top).
  const showDraggingClass = isBeingDragged && !isPreviewSrc;
  // useTextThumb has to be derived BEFORE cls — cls references it. (The
  // showImage flag is computed further down for media kinds; for effect
  // kinds it's always false so we can short-circuit here.)
  //
  // Two slot shapes use title-as-thumb:
  //   - Curated tool cards (kind: "effect", flag set when built).
  //   - User-saved transition captures (kind: "clipboard" + captureSubtype:
  //     "transition"). We render the transition NAME as the thumb so it
  //     reads the same way as the curated transition cards instead of the
  //     generic clapperboard that other clipboard captures get.
  const useTextThumb = !!slot.useTextThumb && (
    (slot.kind || fileKind(slot.path)) === "effect" ||
    slot.captureSubtype === "transition"
  );
  const cls = `cd-tile${isOn ? " on" : ""}${isEmpty ? " empty" : ""}${dragOver ? " drag-over" : ""}${showDraggingClass ? " dragging" : ""}${dwellPending ? " dwell-active" : ""}${isPreviewing ? " previewing" : ""}${isCapturing ? " capturing" : ""}${useTextThumb ? " text-mode" : ""}`;
  const style = isOn && !isEmpty
    ? { borderColor: accent.glow, boxShadow: `0 0 0 1px ${accent.glow}, 0 8px 30px -10px ${accent.glow}` }
    : null;

  if (isEmpty) {
    return (
      <div className={`${cls} v2-tile v2-tile--empty`} style={style}
        data-slot-index={index}
        data-tile-type="empty"
        onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onContextMenu={onContext}
        onClick={() => onAssignFile(index)}>
        {showShortcuts && hotkey && (
          <span className="v2-chip v2-chip--ghost">{hotkey}</span>
        )}
        <span className="v2-empty-hint">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M11 5v12M5 11h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <span>Empty</span>
        </span>
        <span className="v2-empty-drop">Drag clip or effect</span>
        {isCapturing && (
          <div className="cd-tile-capturing" aria-label="Capturing from timeline">
            <span className="cd-tile-capturing-spinner"/>
            <span className="cd-tile-capturing-label">Capturing…</span>
          </div>
        )}
      </div>
    );
  }

  const seed = (index + 1) * 17 + 3;
  // User-picked thumbnails (slot.customThumb) win over every kind-specific
  // visual. Otherwise we fall back to the existing per-kind logic.
  const imageUrl =
    (slot.customThumb && slot.thumb) ? slot.thumb :
    kind === "image" ? pathToFileUrl(slot.path) :
    (kind === "video" && slot.thumb) ? slot.thumb :
    null;
  const showImage = !!imageUrl;
  // Subtype-aware classification for clipboard captures:
  //   "audio" → waveform (or legacy audioOnly flag for pre-subtype captures)
  //   "text"  → big T glyph
  //   "mogrt" → Premiere-style MOGRT glyph
  //   "mixed" → nested folder glyph
  //   default / "video" → existing clapperboard icon
  const sub = (kind === "clipboard") ? slot.captureSubtype : null;
  const isAudioCapture = kind === "clipboard" && (sub === "audio" || (!sub && !!slot.audioOnly));
  const isTextCapture  = sub === "text";
  const isMogrtCapture = sub === "mogrt";
  const isMixedCapture = sub === "mixed";
  const showWaveform   = !showImage && (kind === "audio" || kind === "other" || isAudioCapture);
  const showTextIcon   = !showImage && isTextCapture;
  const showMogrtIcon  = !showImage && isMogrtCapture;
  const showNestedIcon = !showImage && isMixedCapture;
  const showClipIcon   = (kind === "clipboard" || kind === "sequence")
                         && !showImage && !isAudioCapture
                         && !isTextCapture && !isMogrtCapture && !isMixedCapture
                         && !useTextThumb;
  // Effect cards: holds a Premiere effect preset, not a media clip.
  // Renders the sparkles glyph as the body icon AND surfaces the
  // preset name as the card label. Cards flagged useTextThumb (computed
  // above where it's needed by `cls`) skip the sparkles entirely —
  // the body shows the preset title as the icon, which is more
  // recognisable for curated tools like INTHEZONE Tools > Effects
  // where every card is unique.
  const showFxIcon     = kind === "effect" && !showImage && !useTextThumb;
  // Transition cards live under kind: "effect" but their effectRecipe
  // components are tagged kind: "transition". Surface that distinction
  // in the corner badge so the user can tell at a glance whether a
  // card fires an effect or a transition.
  //
  // Curated transitions vs user-saved transitions are kept as separate
  // tile types so each can carry its own icon + body color. A `transition`
  // is the yellow curated card (kind:"effect" + transition recipe); a
  // `saved-transition` is the orange user-captured card (clipboard with
  // captureSubtype:"transition"). Curated transitions whose recipe is
  // tagged `audio: true` route to the lime `audio-transition` skin
  // (Constant Power, Exponential Fade, etc.).
  const isCuratedTransition = !!(slot && slot.effectRecipe && slot.effectRecipe.components
    && slot.effectRecipe.components[0] && slot.effectRecipe.components[0].kind === "transition");
  const isAudioTransition = isCuratedTransition
    && slot.effectRecipe.components.some((c) => c && c.audio);
  const isSavedTransition = !!(slot && slot.captureSubtype === "transition");
  const isTransitionCard = isCuratedTransition || isSavedTransition;
  // Badge stays visible at all times — it never conflicts with the play
  // button because the play button now lives at the centre of the thumb.
  const showKindBadge = (kind === "image" || kind === "video" || kind === "sequence" || kind === "clipboard" || kind === "effect");
  // V2 tactile-skin tile-type classification. Drives per-type accent
  // colors, body gradient, hover ring, and corner badge styling. The
  // CSS keys off `data-tile-type`. New types map cleanly onto existing
  // Clip Deck slot kinds — no functional change.
  const isAudioFx = (kind === "effect"
    && slot.effectRecipe && Array.isArray(slot.effectRecipe.components)
    && slot.effectRecipe.components.some((c) => c && c.audio));
  // True when the user has explicitly picked a thumbnail for this card.
  // Drives a full-bleed picture render across every tile type — the
  // type icon / waveform is hidden underneath and the chip + badge
  // stay legible thanks to the scrim.
  const useCustomThumb = !!(slot.customThumb && slot.thumb);
  // (Media duration + alpha-edge probe hooks live at the top of
  // SlotTile, above the isEmpty early return, so the hook count stays
  // stable across empty ↔ populated transitions.)
  // Pick the right object-fit-equivalent for the thumbnail:
  //   - Images with transparent edges (logos, icons, brand marks,
  //     stickers — regardless of extension: png, webp, gif, avif,
  //     etc.) → centered + `contain` so the whole graphic shows
  //     with the tile's accent body gradient around it.
  //   - Solid-edge images (photos, video first-frames, etc) →
  //     `cover` so they fill the card vertically + horizontally.
  const thumbFitContain = thumbFitContainHoisted;
  // "Saved Attributes" captures land in the same kind:"effect" bucket
  // as curated Effects deck cards, so we need a separate signal:
  //   - New captures carry `capturedAttributes: true` (set in
  //     captureEffectToSlot).
  //   - Older slots created before that flag existed are detected via
  //     the "Effect · …" / "Saved Attributes …" name prefix the capture
  //     step writes, combined with the absence of `useTextThumb`
  //     (curated cards always set useTextThumb true).
  const looksLikeAttrCapture = (
    kind === "effect"
    && slot.effectRecipe
    && !slot.useTextThumb
    && !isTransitionCard
    && typeof slot.name === "string"
    && slot.name.indexOf("Effect · ") === 0
  );
  const isSavedAttributes = !!slot.attributeSelection
    || !!slot.capturedAttributes
    || slot.captureSubtype === "attributes"
    || looksLikeAttrCapture;
  const tileType = isSavedAttributes ? "saved-attributes"
    : isSavedTransition ? "saved-transition"
    : isAudioTransition ? "audio-transition"
    : isCuratedTransition ? "transition"
    : (kind === "effect" && isAudioFx) ? "audio-fx"
    : (kind === "effect") ? "fx"
    : (kind === "image") ? "image"
    : (kind === "video") ? "video"
    : (kind === "audio" || isAudioCapture) ? "audio"
    : (kind === "clipboard" || kind === "sequence") ? "timeline-clip"
    : null;
  // PNG icon for the V2 tactile-skin tile body. Each type has its own
  // asset under overlay/assets/v2/. Copied verbatim from the Claude
  // Design bundle (clip-deck-redesign/project/assets/).
  const V2_ICON = {
    "fx":               "assets/v2/effect-icon.png",
    "transition":       "assets/v2/transition-icon.png",
    "audio-fx":         "assets/v2/audio-effect-icon.png",
    "audio-transition": "assets/v2/audio-transition-icon.png",
    "timeline-clip":    "assets/v2/timeline-clip-icon.png",
    "saved-attributes": "assets/v2/saved-attributes-icon.png",
    "saved-transition": "assets/v2/saved-transition-icon.png",
  }[tileType];
  // Custom-color override — applies the user's right-click color
  // choice as an inline gradient on top of the per-type V2 gradient.
  // The `style` object already carries the legacy on-hover override,
  // so we merge into a fresh object here.
  const colorOverride = slot.customColor && slot.customColor.top ? slot.customColor : null;
  const tileInlineStyle = colorOverride
    ? Object.assign({}, style || {}, {
        background: `linear-gradient(180deg, ${colorOverride.top} 0%, ${colorOverride.bot} 100%)`,
        borderColor: colorOverride.border,
        color: colorOverride.text,
        // Surface the custom-color stops as CSS vars so the thumb tint
        // overlay (in styles.css) can paint a matching gradient over
        // image/video thumbs — otherwise a full-bleed photo hides the
        // tile body entirely and only the border shows the color.
        "--cd-tile-custom-top": colorOverride.top,
        "--cd-tile-custom-bot": colorOverride.bot,
      })
    : style;
  return (
    <div className={`${cls} v2-tile v2-tile--${tileType || "empty"}${colorOverride ? " v2-tile--custom-color" : ""}`} style={tileInlineStyle}
      data-slot-index={index}
      data-tile-type={tileType || undefined}
      draggable={!editingName}
      onDragStart={onSlotDragStart}
      onDragEnd={onSlotDragEnd}
      onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onContextMenu={onContext}
      onClick={() => { if (!editingName) onActivate(index); }}>

      {/* Full-bleed thumbnail. Image/video tiles get this by default
          (from their auto-extracted first frame). ANY card type also
          gets it when the user has explicitly picked a custom thumb
          via right-click → Choose thumbnail — the picture takes over
          the body, hides the type icon / waveform, and the type's
          accent stays visible via the border, chip, and badge.
          `background-size: cover` (see .v2-thumb in CSS) makes the
          image fill the card vertically and horizontally. */}
      {(useCustomThumb || tileType === "image" || tileType === "video") && (
        <span className={`v2-thumb${thumbFitContain ? " v2-thumb--contain" : ""}`}
              style={(useCustomThumb || showImage) ? { backgroundImage: `url("${imageUrl}")` } : null}
              aria-hidden="true"/>
      )}
      {(useCustomThumb || tileType === "image" || tileType === "video") && !thumbFitContain && (
        <span className="v2-thumb-scrim" aria-hidden="true"/>
      )}

      {/* Audio waveform — deterministic SVG bars tinted with the audio
          accent color via the per-type --accent CSS var. Hidden when
          the user has set a custom thumb (the thumb replaces it). */}
      {!useCustomThumb && tileType === "audio" && (
        <span className="v2-wave-wrap" aria-hidden="true">
          <V2Waveform seed={`${hotkey || ""}::${slot.name || index}`}/>
        </span>
      )}

      {/* Designated PNG icon — centred prism/A↔B/etc. asset for fx,
          transition, audio-fx, audio-transition, timeline-clip,
          saved-attributes. Hidden when a custom thumb is set so the
          full-bleed picture above can show through. */}
      {!useCustomThumb && tileType === "fx" && (
        <span className="v2-effect-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-effect-glyph" draggable={false}/>
        </span>
      )}
      {!useCustomThumb && (tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition"
        || tileType === "timeline-clip") && (
        <span className="v2-transition-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-transition-glyph" draggable={false}/>
        </span>
      )}

      {/* Top-right type badge / play button. Video swaps the badge for
          a centred play glyph (the type itself reads from the duration
          chip + thumb). */}
      {tileType === "fx" && (
        <span className="v2-typebadge" aria-hidden="true" title="Effect">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" stroke="currentColor" strokeWidth="1"/>
            <rect x="7" y="7" width="4" height="4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {(tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition") && (
        <span className="v2-typebadge" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="6" height="11" rx="0.75" fill="currentColor" opacity="0.5"/>
            <rect x="6" y="1" width="6" height="11" rx="0.75" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "timeline-clip" && (
        <span className="v2-typebadge" aria-hidden="true" title="Timeline saved clip">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="1.5" y="3.5" width="6" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="6" y="6.5" width="5.5" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="2" y="9.5" width="7.5" height="1.6" rx="0.4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "image" && (
        <span className="v2-typebadge" aria-hidden="true" title="Image">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1.5" width="10" height="9" rx="1.25" stroke="currentColor" strokeWidth="1"/>
            <circle cx="3.75" cy="4.25" r="0.9" fill="currentColor"/>
            <path d="M1.5 9l2.75-2.75 2 2L9.25 5.25l1.25 1.25v3a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5V9z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "video" && (
        <span className="v2-play" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 2.5v9l8-4.5-8-4.5z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {/* Duration chip — top-right on video + audio tiles. Replaces the
          typebadge slot per the Claude Design. */}
      {(tileType === "video" || tileType === "audio") && durationLabel && (
        <span className="v2-duration">{durationLabel}</span>
      )}

      {/* Shortcut chip — top-left, mono pill matching the design verbatim. */}
      {showShortcuts && hotkey && (
        <span className="v2-chip">{hotkey}</span>
      )}

      {/* Name overlay — absolute-positioned at the bottom of the tile
          body. Editing mode swaps the static span for an input. */}
      {editingName ? (
        <input
          className="cd-tile-name-edit v2-name-edit"
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onFocus={(e) => { try { e.target.select(); } catch (err) {} }}
          onBlur={() => finishEditName(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); finishEditName(true); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishEditName(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <V2Name media={(useCustomThumb && !thumbFitContain) || tileType === "image" || tileType === "video"} text={slot.name || "Unnamed"}/>
      )}

      {/* Capturing-from-timeline overlay (preserved from prior render). */}
      {isCapturing && (
        <div className="cd-tile-capturing" aria-label="Capturing from timeline">
          <span className="cd-tile-capturing-spinner"/>
          <span className="cd-tile-capturing-label">Capturing…</span>
        </div>
      )}
      {/* Legacy DOM removed: cd-tile-thumb wrapper, cd-tile-bg, cd-tile-clip-ico,
          cd-tile-kind, cd-kbd-hint, cd-tile-foot, cd-tile-text-thumb. The V2
          tactile skin owns the entire visual now. Handlers + state are
          unchanged so drag/drop, swap, capture, rename, and fire all work
          exactly as before. */}
    </div>
  );
}

function SlotGrid({ slots, accent, showShortcuts, onActivate, onAssignFile, onDropFile, onContextMenu, onRenameSlot, onSetThumb, editingNameIndex, onFinishRename, onMoveSlot, swapPreview, onArmSwap, onCancelSwap, onCommitSwap, capturingIndex, libIdx, deckIdx, dstDeckKey, onDragStartCoords, onDragEndCoords, dragSource }) {
  const [hover, setHover] = React.useState(null);
  // Cross-deck tool swap: a tool drag is in flight from a deck other
  // than the one currently rendered. The lifted-card visual stays on
  // the source deck (which the user has left mid-drag); the current
  // deck's tiles accept the drop as swap targets.
  const isCrossDeckToolDrag = !!(dragSource && dragSource.kind === "tool"
    && dragSource.srcDeckKey && dstDeckKey
    && dragSource.srcDeckKey !== dstDeckKey);
  // Index of the tile currently being dragged (for the lifted-card visual).
  // Only set when the dragged source belongs to *this* library/deck — a tile
  // dragged out of another library shouldn't affect this grid's lifted look.
  // For tool decks libIdx/deckIdx are both -1, so we additionally guard on
  // the source deck key so a Transitions:1 drag doesn't ghost-light a tile
  // in Transitions:2.
  const draggingIndex = (dragSource
    && dragSource.libIdx === libIdx && dragSource.deckIdx === deckIdx
    && !isCrossDeckToolDrag)
    ? dragSource.slotIdx
    : null;

  // While a preview is active the destination tile shows the source's
  // content (with a wiggle). Source side: if it lives in this library/deck,
  // show the destination's content; otherwise its tile isn't visible here.
  const CONTENT_FIELDS = ["path","name","tag","hue","peak","nodeId","kind","clipboardFile","capturedAt","captureBytes","thumb","customThumb","audioOnly","captureSubtype"];
  const isInThisGrid = (c) => c && c.libIdx === libIdx && c.deckIdx === deckIdx;
  const overlay = (i) => {
    if (!swapPreview) return slots[i];
    const dstHere = isInThisGrid(swapPreview.dstCoords);
    const srcHere = isInThisGrid(swapPreview.srcCoords);
    if (dstHere && i === swapPreview.dstCoords.slotIdx) {
      const merged = Object.assign({}, slots[i]);
      // Pull source content from snapshot (works for cross-library) or from
      // the live src tile if both live in this grid.
      const otherFields = swapPreview.srcSnapshot || (srcHere ? slots[swapPreview.srcCoords.slotIdx] : null);
      if (otherFields) CONTENT_FIELDS.forEach((f) => { merged[f] = otherFields[f]; });
      return merged;
    }
    if (srcHere && dstHere && i === swapPreview.srcCoords.slotIdx) {
      const merged = Object.assign({}, slots[i]);
      const other = slots[swapPreview.dstCoords.slotIdx];
      CONTENT_FIELDS.forEach((f) => { merged[f] = other[f]; });
      return merged;
    }
    return slots[i];
  };

  return (
    <div className={`cd-grid${draggingIndex != null ? " is-dragging" : ""}`}>
      {slots.map((_, i) => {
        const slot = overlay(i);
        const isPreviewSrc = swapPreview && isInThisGrid(swapPreview.srcCoords) && i === swapPreview.srcCoords.slotIdx;
        const isPreviewDst = swapPreview && isInThisGrid(swapPreview.dstCoords) && i === swapPreview.dstCoords.slotIdx;
        return (
          <SlotTile key={slots[i].key + ":" + i}
            slot={slot} index={i}
            libIdx={libIdx} deckIdx={deckIdx}
            hovered={hover === i} onHover={setHover}
            onActivate={onActivate} onAssignFile={onAssignFile} onDropFile={onDropFile}
            onContextMenu={onContextMenu} onRenameSlot={onRenameSlot} onSetThumb={onSetThumb}
            isEditingName={editingNameIndex === i} onFinishRename={onFinishRename}
            accent={accent} showShortcuts={showShortcuts}
            onMoveSlot={onMoveSlot}
            onArmSwap={onArmSwap}
            onCancelSwap={onCancelSwap}
            onCommitSwap={onCommitSwap}
            isCapturing={capturingIndex === i}
            isPreviewSrc={isPreviewSrc}
            isPreviewDst={isPreviewDst}
            draggingIndex={draggingIndex}
            crossDeckSwapOk={isCrossDeckToolDrag}
            onDragStartSlot={(coords) => { if (onDragStartCoords) onDragStartCoords(coords); }}
            onDragEndSlot={() => { if (onDragEndCoords) onDragEndCoords(); }}/>
        );
      })}
    </div>
  );
}

// Placeholder view for the unlocked INTHEZONE Tools entries (Effects,
// SFX, Utility Plugins, Youtube). Renders an empty 40-slot grid that
// looks like a fresh deck so the user has somewhere to land while the
// real tool is being built out. Inert: tiles do not respond to clicks,
// drops, capture, or hotkeys. Selecting a library or deck in the
// sidebar / topbar exits this view via setMainView("slots").
function ToolPlaceholder({ toolName, deckName, slots, accent, showShortcuts, onActivate, dragSource, onDragStartCoords, onDragEndCoords, toolSwapPreview, onToolArmSwap, onToolCancelSwap, onToolCommitSwap, onToolMoveSlot }) {
  // Slug the tool name so CSS can target individual tools (e.g. Effects
  // gets a blue gradient; other tools can pick up their own treatment
  // here later without touching the JSX).
  const slug = String(toolName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  // The slot grid here is read-only — write actions (capture, drag-move,
  // rename, set-thumb) are intentionally no-op so the curated tool deck
  // stays canonical. Only click-to-fire is wired.
  //
  // Drag-OUT is allowed, however: populated tool tiles (e.g. Effects
  // cards) can be dragged into user libraries to create a COPY. We
  // intercept onDragStartCoords here to enrich the dragSource with
  // kind:"tool" and a snapshot of the source slot — the App's
  // onTileMove branches on that to take the copy path instead of move.
  const handleDragStart = (coords) => {
    if (!onDragStartCoords || !coords) return;
    const src = slots && slots[coords.slotIdx];
    if (!src) return;
    // Carry the source deck's composite key so cross-deck swaps within
    // the same tool (e.g. Transitions:1 → Transitions:2) can resolve
    // both endpoints when the drop commits.
    onDragStartCoords({ ...coords, kind: "tool", srcDeckKey: deckName, slotSnapshot: src });
  };
  return (
    <div className={`cd-tool-view${slug ? " cd-tool-view--" + slug : ""}`}>
      <SlotGrid
        slots={slots}
        accent={accent}
        showShortcuts={showShortcuts}
        onActivate={onActivate || (() => {})}
        onAssignFile={() => {}}
        onDropFile={() => {}}
        onContextMenu={() => {}}
        onRenameSlot={() => {}}
        onSetThumb={() => {}}
        editingNameIndex={null}
        onFinishRename={() => {}}
        onMoveSlot={onToolMoveSlot
          ? (dstIdx) => onToolMoveSlot(deckName, (slots || []).length, dstIdx)
          : (() => {})}
        swapPreview={toolSwapPreview || null}
        onArmSwap={onToolArmSwap ? (dstIdx) => onToolArmSwap(deckName, (slots || []).length, dstIdx) : (() => {})}
        onCancelSwap={onToolCancelSwap || (() => {})}
        onCommitSwap={onToolCommitSwap || (() => {})}
        capturingIndex={null}
        libIdx={-1}
        deckIdx={-1}
        dstDeckKey={deckName}
        dragSource={dragSource || null}
        onDragStartCoords={handleDragStart}
        onDragEndCoords={onDragEndCoords || (() => {})}/>
    </div>
  );
}

// (Kept for reference / future re-enable: API-based browser. Pixabay
// doesn't ship a public audio API so this is unreachable today. The
// active SFX surface is SfxWebview below.)
function SfxBrowserApi({ accent, apiKey, onSaveApiKey, connected, insertMode, onImported, onError, onToast }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [searchedQuery, setSearchedQuery] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState(null);
  const [playingId, setPlayingId] = React.useState(null);
  const [importingId, setImportingId] = React.useState(null);
  const [keyDraft, setKeyDraft] = React.useState("");
  const audioRef = React.useRef(null);

  // Stop any preview audio when the panel unmounts (user switches tool).
  React.useEffect(() => {
    return () => {
      if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} }
    };
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || !apiKey) return;
    setLoading(true);
    setErrorMsg(null);
    setSearchedQuery(q);
    try {
      // Pixabay's music API — same key, q, per_page, page parameters as
      // the image/video endpoints. Returns JSON with a `hits` array.
      const url = `https://pixabay.com/api/music/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&per_page=30&page=1`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setErrorMsg(`Pixabay HTTP ${res.status}${text ? " — " + text.slice(0, 140) : ""}`);
        setResults([]);
        return;
      }
      const json = await res.json();
      const hits = Array.isArray(json && json.hits) ? json.hits : [];
      setResults(hits);
    } catch (e) {
      setErrorMsg(String(e && e.message || e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const onPlayToggle = (hit) => {
    const audioUrl = hit.audio || hit.previewURL || hit.audio_url || hit.preview || null;
    if (!audioUrl) {
      if (onToast) onToast("This result has no playable audio URL.");
      return;
    }
    const aud = audioRef.current;
    if (!aud) return;
    if (playingId === hit.id) {
      aud.pause();
      setPlayingId(null);
      return;
    }
    aud.src = audioUrl;
    aud.currentTime = 0;
    aud.play().then(() => setPlayingId(hit.id)).catch((e) => {
      if (onToast) onToast("Preview failed: " + (e && e.message || e));
    });
  };

  const onImport = async (hit) => {
    if (!connected) {
      if (onToast) onToast("Premiere not connected — can't import yet.");
      return;
    }
    const audioUrl = hit.audio || hit.previewURL || hit.audio_url || hit.preview || null;
    if (!audioUrl) {
      if (onToast) onToast("This result has no downloadable audio URL.");
      return;
    }
    setImportingId(hit.id);
    try {
      // Stop any active preview before importing — the audio file is
      // about to land on the timeline; don't keep blasting it from the
      // overlay too.
      if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} }
      setPlayingId(null);

      // Derive an extension from the URL so the cached file has the
      // right suffix (Premiere uses it for kind detection).
      const extMatch = /\.([a-zA-Z0-9]{1,5})(?:$|\?)/.exec(audioUrl);
      const ext = (extMatch && extMatch[1]) ? extMatch[1].toLowerCase() : "mp3";

      const dl = await window.clipDeck.downloadSfx(hit.id, audioUrl, ext);
      if (!dl || !dl.ok) {
        if (onToast) onToast("Download failed: " + ((dl && dl.error) || "no detail"));
        return;
      }
      // Hand off to the standard audio import-and-insert pipeline.
      // onImported owns importAsset + overwriteAt so we don't duplicate
      // insert-mode dispatch logic here.
      await onImported({ localPath: dl.localPath, hit });
    } catch (e) {
      if (onError) onError(e);
    } finally {
      setImportingId(null);
    }
  };

  // No key yet — gate everything behind a small entry form so the
  // browser is usable on first run without a settings dive.
  if (!apiKey) {
    return (
      <div className="cd-sfx-browser cd-sfx-browser--gate">
        <div className="cd-sfx-gate">
          <div className="cd-sfx-gate-title">Connect Pixabay</div>
          <p className="cd-sfx-gate-body">
            INTHEZONE&nbsp;Tools&nbsp;&gt;&nbsp;SFX browses Pixabay's royalty-free
            sound effect library. Paste your free API key from
            <span className="cd-sfx-gate-link"> pixabay.com/api/docs/</span> to get started.
          </p>
          <div className="cd-sfx-gate-row">
            <input
              className="cd-sfx-gate-input"
              type="text"
              placeholder="Pixabay API key"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (keyDraft.trim()) onSaveApiKey(keyDraft.trim()); } }}
              autoFocus
            />
            <button
              className="cd-sfx-gate-save"
              style={{ background: accent.hex, borderColor: accent.glow }}
              disabled={!keyDraft.trim()}
              onClick={() => onSaveApiKey(keyDraft.trim())}>
              Save key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cd-sfx-browser">
      <audio ref={audioRef}
             onEnded={() => setPlayingId(null)}
             onPause={() => { if (audioRef.current && audioRef.current.paused) setPlayingId(null); }}
             style={{ display: "none" }}/>
      <div className="cd-sfx-searchbar">
        <input
          className="cd-sfx-searchinput"
          type="text"
          placeholder="Search Pixabay sound effects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
          autoFocus
        />
        <button
          className="cd-sfx-searchbtn"
          style={{ background: accent.hex, borderColor: accent.glow }}
          onClick={runSearch}
          disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {errorMsg && (
        <div className="cd-sfx-error">{errorMsg}</div>
      )}

      {!errorMsg && !loading && results.length === 0 && searchedQuery && (
        <div className="cd-sfx-empty">
          No results for "{searchedQuery}".
        </div>
      )}

      {!errorMsg && !loading && results.length === 0 && !searchedQuery && (
        <div className="cd-sfx-empty">
          Type a search term to browse Pixabay's sound effects.
        </div>
      )}

      <div className="cd-sfx-results">
        {results.map((hit) => {
          const dur = formatDuration(hit.duration);
          const title = hit.title || hit.name || hit.tags || `SFX #${hit.id}`;
          const isPlaying = playingId === hit.id;
          const isImporting = importingId === hit.id;
          return (
            <div key={hit.id} className="cd-sfx-row">
              <button
                className={`cd-sfx-play${isPlaying ? " on" : ""}`}
                onClick={() => onPlayToggle(hit)}
                style={isPlaying ? { color: accent.hex, borderColor: accent.glow } : null}
                aria-label={isPlaying ? "Pause" : "Play preview"}>
                {isPlaying ? <I.pause/> : <I.play/>}
              </button>
              <div className="cd-sfx-meta">
                <div className="cd-sfx-title">{title}</div>
                <div className="cd-sfx-sub">{dur}{hit.user ? ` · ${hit.user}` : ""}{hit.tags ? ` · ${hit.tags}` : ""}</div>
              </div>
              <button
                className="cd-sfx-import"
                onClick={() => onImport(hit)}
                disabled={isImporting || !connected}
                style={{ background: accent.hex, borderColor: accent.glow }}>
                {isImporting ? "Importing…" : "Import"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pixabay-embedded sound-effects browser. The user navigates pixabay.com
// inside the panel like a regular browser; whenever they click Download
// on a SFX, main.js intercepts the file via session.will-download,
// caches it in sfx-cache/, and emits clipDeck:sfxDownloaded with the
// local path. The renderer pipes that path into onImported, which is
// the existing audio import+insert pipeline (fireSfxImport).
// Inline paywall shown over a blurred + dimmed SfxBrowser when a free
// user navigates into INTHEZONE Tools > Pixabay. The Pixabay browser
// is a Pro feature; this overlay teases the look of the browser while
// presenting the upgrade CTA. Clicking Upgrade opens the standard
// Paywall modal (which owns the actual checkout flow).
function PixabayPaywall({ onCheckout, onAlreadyPro }) {
  return (
    <div className="cd-pixabay-paywall">
      <img className="cd-pixabay-paywall-art"
           src="assets/paywall-pixabay.png"
           alt="Unlock Pixabay Browser"/>
      <div className="cd-pixabay-paywall-actions">
        <button className="cd-pixabay-paywall-cta" onClick={onCheckout}>
          Upgrade to Pro — $99 one-time
        </button>
        <button className="cd-pixabay-paywall-link" onClick={onAlreadyPro}>
          I already have Pro
        </button>
      </div>
    </div>
  );
}

// Inline paywall for INTHEZONE Tools > Youtube. Same layout as the
// Pixabay paywall. The link text sits below the image on the blurred
// dark panel — use the --youtube modifier to flip it to white so it's
// legible against that background.
function YoutubePaywall({ onCheckout, onAlreadyPro }) {
  return (
    <div className="cd-pixabay-paywall cd-pixabay-paywall--youtube">
      <img className="cd-pixabay-paywall-art"
           src="assets/paywall-youtube.png"
           alt="Unlock Youtube Browser"/>
      <div className="cd-pixabay-paywall-actions">
        <button className="cd-pixabay-paywall-cta" onClick={onCheckout}>
          Upgrade to Pro — $99 one-time
        </button>
        <button className="cd-pixabay-paywall-link" onClick={onAlreadyPro}>
          I already have Pro
        </button>
      </div>
    </div>
  );
}

// Inline paywall for INTHEZONE Tools > Utility Plugins. Same layout as
// the Pixabay paywall (blurred panel behind, graphic centred, CTA pill
// + secondary link). The --utility modifier flips the "I already have
// Pro" link to white since the new marketing graphic has a dark
// background where black text would disappear into the blur.
function UtilityPluginsPaywall({ onCheckout, onAlreadyPro }) {
  return (
    <div className="cd-pixabay-paywall cd-pixabay-paywall--utility">
      <img className="cd-pixabay-paywall-art"
           src="assets/paywall-utility-plugins.png"
           alt="Unlock 2 Utility Plugins"/>
      <div className="cd-pixabay-paywall-actions">
        <button className="cd-pixabay-paywall-cta" onClick={onCheckout}>
          Upgrade to Pro — $99 one-time
        </button>
        <button className="cd-pixabay-paywall-link" onClick={onAlreadyPro}>
          I already have Pro
        </button>
      </div>
    </div>
  );
}

function SfxBrowser({ accent, connected, onImported, onError, onToast, refreshSignal }) {
  // DEMO (landing-page panel): the Pixabay <webview> cannot run in a browser.
  // Show the existing marketing graphic instead (CTA/link hidden via demo.css).
  if (window.CLIPDECK_DEMO) return <PixabayPaywall onCheckout={() => {}} onAlreadyPro={() => {}}/>;
  const webviewRef = React.useRef(null);
  // True while a download is in flight OR the just-downloaded file is
  // being relocated + imported into Premiere. Cleared on success and
  // failure so the modal never gets stuck.
  const [importing, setImporting] = React.useState(false);
  // Absolute file:// URL for the webview's content-side preload. Set
  // asynchronously from the main process; until it arrives we render
  // the webview without a preload (download-intent detection silently
  // disabled — the Electron will-download fallback still works).
  const [preloadUrl, setPreloadUrl] = React.useState(null);
  // Two timers, two jobs:
  //  • intentTimeoutRef — SHORT false-fire safety. The click-intent
  //    heuristic can misfire on a non-download click; if no real
  //    download confirms shortly after, drop the cover.
  //  • activeTimeoutRef — LONG backstop. Once a real download is
  //    confirmed the cover stays for the WHOLE transfer (no short
  //    timeout); this only guards against a genuinely stuck download.
  const intentTimeoutRef = React.useRef(null);
  const activeTimeoutRef = React.useRef(null);
  const HOME_URL = "https://pixabay.com/sound-effects/";

  // Single teardown path: clear cover state, kill every timer, and
  // tell the webview to drop its in-page cover.
  const endImport = React.useCallback(() => {
    setImporting(false);
    if (intentTimeoutRef.current) { clearTimeout(intentTimeoutRef.current); intentTimeoutRef.current = null; }
    if (activeTimeoutRef.current) { clearTimeout(activeTimeoutRef.current); activeTimeoutRef.current = null; }
    try {
      const wv = webviewRef.current;
      if (wv && typeof wv.send === "function") wv.send("sfx-import-done");
    } catch (e) {}
  }, []);
  // Click-intent heuristic fired — show the cover + arm the short
  // false-fire timer (8s). Cancelled by markDownloadActive once a real
  // download confirms.
  const beginImport = React.useCallback(() => {
    setImporting(true);
    if (intentTimeoutRef.current) clearTimeout(intentTimeoutRef.current);
    intentTimeoutRef.current = setTimeout(() => {
      intentTimeoutRef.current = null;
      endImport();
    }, 8000);
  }, [endImport]);
  // will-download confirmed a REAL transfer. Cancel the false-fire
  // timer so the cover now waits for the download to actually finish —
  // no short timeout. The 3-minute backstop is pure insurance.
  const markDownloadActive = React.useCallback(() => {
    setImporting(true);
    if (intentTimeoutRef.current) { clearTimeout(intentTimeoutRef.current); intentTimeoutRef.current = null; }
    if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
    activeTimeoutRef.current = setTimeout(() => {
      activeTimeoutRef.current = null;
      endImport();
    }, 180000);
  }, [endImport]);

  // Resolve the webview preload URL once.
  React.useEffect(() => {
    if (window.clipDeck && window.clipDeck.getSfxPreloadUrl) {
      window.clipDeck.getSfxPreloadUrl().then((u) => setPreloadUrl(u || null)).catch(() => {});
    }
  }, []);

  // External "Refresh" trigger — App-level state increments on the
  // sidebar's right-click → Refresh menu item. Skips the first-mount
  // tick (the webview's own src=HOME_URL already lands on the home
  // page) and only navigates when the signal actually changes.
  const refreshSeenRef = React.useRef(refreshSignal);
  React.useEffect(() => {
    if (refreshSeenRef.current === refreshSignal) return;
    refreshSeenRef.current = refreshSignal;
    const wv = webviewRef.current;
    if (!wv) return;
    try { if (typeof wv.loadURL === "function") wv.loadURL(HOME_URL); } catch (e) {}
  }, [refreshSignal]);

  // Push the current Premiere project directory to main.js so its
  // will-download SFX interceptor can dedup against the project's
  // `Clip Deck/` folder. Refreshed on panel mount AND on every
  // download intent — a Pixabay click triggers will-download within
  // milliseconds, so the renderer's HTTP round-trip to fetch the
  // project path can lose the race; the panel-mount push covers that
  // by warming the cache ahead of time.
  const pushSfxProjectContext = React.useCallback(async () => {
    if (!window.clipDeck || !window.clipDeck.setSfxProjectContext) return;
    try {
      const pp = await Client.getProjectPath();
      const projDir = pp && pp.saved ? pp.directory : "";
      await window.clipDeck.setSfxProjectContext(projDir);
    } catch (e) { /* best-effort — cache miss just means the file downloads as before */ }
  }, []);

  React.useEffect(() => {
    pushSfxProjectContext();
    // Wipe context on unmount so a stale project dir from a previous
    // mount doesn't bleed across project switches if the user opens
    // Pixabay before connecting Premiere.
    return () => {
      if (window.clipDeck && window.clipDeck.setSfxProjectContext) {
        window.clipDeck.setSfxProjectContext("").catch(() => {});
      }
    };
  }, [pushSfxProjectContext]);

  // Webview ipc-message listener — the content preload posts
  // "sfx-download-intent" on every mousedown (paints the in-webview
  // cover synchronously) and "sfx-cover-timeout" when its own 5s
  // safety net fires so the host modal clears alongside.
  React.useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const handler = (e) => {
      if (!e) return;
      if (e.channel === "sfx-download-intent") {
        beginImport();
        // Best-effort refresh of the cached project dir — if the user
        // switched projects in Premiere mid-session, this catches it
        // before the download lands. Fire-and-forget; the panel-mount
        // push is the primary warm path.
        pushSfxProjectContext();
      }
      else if (e.channel === "sfx-cover-timeout") endImport();
    };
    wv.addEventListener("ipc-message", handler);
    return () => wv.removeEventListener("ipc-message", handler);
  }, [beginImport, endImport, pushSfxProjectContext]);

  // Main-process download IPC → drives the actual import. The "started"
  // event is now belt-and-suspenders alongside the click-intent path:
  // even if our heuristic misses, the real will-download event still
  // flips the modal on. After import completes, we also tell the
  // webview to dismiss Pixabay's "Say Thanks" overlay so the user can
  // immediately download another SFX without manual cleanup.
  React.useEffect(() => {
    if (!window.clipDeck) return;
    const offStart = window.clipDeck.onSfxDownloadStarted
      ? window.clipDeck.onSfxDownloadStarted(() => markDownloadActive())
      : null;
    const offDone = window.clipDeck.onSfxDownloaded
      ? window.clipDeck.onSfxDownloaded(async (payload) => {
          try {
            await onImported({ localPath: payload.localPath, hit: { title: payload.filename } });
          } catch (e) {
            if (onError) onError(e);
          } finally {
            endImport();
            // Auto-dismiss Pixabay's "Say Thanks to the author"
            // overlay so the user is back on the SFX list and can
            // grab another download immediately.
            try {
              const wv = webviewRef.current;
              if (wv && typeof wv.send === "function") {
                wv.send("sfx-after-import");
              }
            } catch (e) {}
          }
        })
      : null;
    const offFail = window.clipDeck.onSfxDownloadFailed
      ? window.clipDeck.onSfxDownloadFailed((payload) => {
          endImport();
          if (onToast) onToast(`SFX download failed: ${payload.state || "unknown"}`);
        })
      : null;
    return () => { offStart && offStart(); offDone && offDone(); offFail && offFail(); };
  }, [onImported, onError, onToast, beginImport, endImport, markDownloadActive]);

  // No toolbar — the webview fills the entire SFX panel and Pixabay's
  // own page chrome handles navigation. The "Importing to timeline…"
  // modal pops over the webview with a blurred backdrop during fires.
  // Gate the webview render on preloadUrl being resolved so the
  // content-side preload (sfx-preload.js) actually loads at navigation
  // time — without it, the click-intent fast-path doesn't fire and the
  // modal pop is gated on Electron's slower will-download event.
  return (
    <div className="cd-sfx-browser cd-sfx-browser--wv">
      {preloadUrl && (
        <webview
          ref={webviewRef}
          src={HOME_URL}
          partition="persist:sfx-browser"
          allowpopups="true"
          nodeintegration="true"
          preload={preloadUrl}
          className="cd-sfx-wv-frame"
        />
      )}
      {/* The "Importing to timeline" indicator is rendered inside the
          webview by sfx-preload.js — that's the only layer that
          reliably paints on top of the Electron webview compositing
          surface AND lands in the same paint tick as the click. No
          host-side modal here. */}
    </div>
  );
}

// Embedded YouTube browser for INTHEZONE Tools > Youtube. Stripped
// down compared to SfxBrowser — no toolbar, no download interception,
// no import-to-timeline flow (per product call: this is a reference
// browser only). YouTube's persistent partition keeps the user's
// login across launches the same way Pixabay's does.
//
// Behavioural contract:
//   - Always-mounted at App level. Visibility is toggled via the
//     isActive prop so the webview process survives view switches
//     and playback state (current video, playback position) is
//     preserved across library/deck/tool changes.
//   - Going inactive (switching away) or the overlay window
//     being hidden pauses any playing <video> via executeJavaScript.
//     Pause only — never reload — so coming back picks up where the
//     user left off.
//   - After 10 minutes of inactivity (window hidden OR tab not
//     selected) the next time the view becomes active again, the
//     webview is reloaded. Keeps long-stale sessions fresh without
//     trashing a paused video the user is about to come back to.
//   - Lazy first-load: the webview only mounts after the FIRST time
//     the user selects the Youtube tab, so app startup doesn't pull
//     YouTube unprompted.
function YoutubeBrowser({ accent, isActive, isLocked, refreshSignal }) {
  // DEMO: replace the YouTube <webview> with the marketing graphic. This
  // component is always mounted, so honor isActive — only paint when the
  // YouTube tab is open, otherwise render nothing.
  if (window.CLIPDECK_DEMO) return isActive ? <YoutubePaywall onCheckout={() => {}} onAlreadyPro={() => {}}/> : null;
  const webviewRef = React.useRef(null);
  const YT_HOME_URL = "https://www.youtube.com/";
  // Once true, stays true — the webview stays mounted forever after
  // the first activation. Visibility toggles via CSS thereafter.
  const [shouldRender, setShouldRender] = React.useState(isActive);
  React.useEffect(() => {
    if (isActive && !shouldRender) setShouldRender(true);
  }, [isActive, shouldRender]);

  // External "Refresh" trigger — App-level state increments on the
  // sidebar's right-click → Refresh menu item. Skips the first-mount
  // tick; only loadURL when the signal actually changes.
  const refreshSeenRef = React.useRef(refreshSignal);
  React.useEffect(() => {
    if (refreshSeenRef.current === refreshSignal) return;
    refreshSeenRef.current = refreshSignal;
    const wv = webviewRef.current;
    if (!wv) return;
    try { if (typeof wv.loadURL === "function") wv.loadURL(YT_HOME_URL); } catch (e) {}
  }, [refreshSignal]);

  // Two independent "went inactive" timestamps:
  //   inactiveAt — set when the Youtube tab is switched away from
  //   hiddenAt   — set when the overlay window becomes hidden
  // Whichever is older drives the staleness check the next time the
  // panel is reactivated/revealed.
  const inactiveAtRef = React.useRef(null);
  const hiddenAtRef   = React.useRef(null);
  const REFRESH_MS = 10 * 60 * 1000; // 10 minutes

  const pauseVideos = React.useCallback(() => {
    const wv = webviewRef.current;
    if (!wv || typeof wv.executeJavaScript !== "function") return;
    try {
      wv.executeJavaScript(
        "document.querySelectorAll('video').forEach(function(v){ try{ v.pause(); }catch(e){} });"
      );
    } catch (e) {}
  }, []);

  const reloadIfStale = React.useCallback((sinceTs) => {
    if (!sinceTs) return;
    const elapsed = Date.now() - sinceTs;
    if (elapsed < REFRESH_MS) return;
    const wv = webviewRef.current;
    if (wv && typeof wv.reload === "function") {
      try { wv.reload(); } catch (e) {}
    }
  }, [REFRESH_MS]);

  // Tab activate/deactivate effect — drives the inactive-since clock
  // and refreshes on come-back if 10+ minutes stale.
  React.useEffect(() => {
    if (!isActive) {
      pauseVideos();
      inactiveAtRef.current = Date.now();
      return;
    }
    // Just became active — check freshness, then clear the stamp.
    reloadIfStale(inactiveAtRef.current);
    inactiveAtRef.current = null;
  }, [isActive, pauseVideos, reloadIfStale]);

  // Window hide/show via Page Visibility API. Fires when the overlay
  // is toggled away via the global hotkey or focus-lost. Only matters
  // while the Youtube tab is the active view (otherwise the regular
  // isActive transition already paused things).
  React.useEffect(() => {
    const onVisChange = () => {
      if (document.hidden) {
        if (isActive) {
          pauseVideos();
          hiddenAtRef.current = Date.now();
        }
      } else {
        if (isActive) {
          reloadIfStale(hiddenAtRef.current);
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [isActive, pauseVideos, reloadIfStale]);

  return (
    <div className={`cd-yt-browser${isActive ? "" : " cd-yt-browser--hidden"}${isLocked ? " cd-yt-browser--locked" : ""}`}>
      {shouldRender && (
        <webview
          ref={webviewRef}
          src="https://www.youtube.com/"
          partition="persist:yt-browser"
          allowpopups="true"
          className="cd-yt-frame"
        />
      )}
    </div>
  );
}

// ── INTHEZONE Tools > Utility Plugins marketplace ─────────────────
// Two-section product layout. "My Plugins" surfaces plugins the user
// already owns (or that ship free with their Pro tier). "INTHEZONE
// Plugins" is the storefront for paid add-ons + Coming Soon items.
//
// The plugin catalogue is data-driven via PLUGIN_CATALOGUE — adding
// a new plugin = pushing one entry to the list, no UI changes
// needed. State per plugin is one of:
//   - "owned"       → click to open (in-app panel)
//   - "pro"         → bundled with Pro tier; gated on license.isPro
//   - "available"   → showroom item with a price + Buy CTA
//   - "coming-soon" → placeholder, no action
//
// The card images live in overlay/assets/plugins/<id>.png (the
// component falls back to a CSS gradient if the image is missing).
const PLUGIN_CATALOGUE = [
  {
    id: "smart-paste",
    name: "Smart Paste",
    tagline: "Paste with intelligence — keep your timeline tidy.",
    image: "assets/plugins/smart-paste.png",
    section: "my",
    requires: "pro",
    price: "Free",
    // Path (relative to overlay/index.html) to the bundled CEP panel
    // entry point. The modal loads this in a webview when opened.
    entry: "plugins/smart-paste/index.html",
    bgEntry: "plugins/smart-paste/background.html",
    cepBundleId: "com.marcwenz.smartpaste",
    demoUrl: "https://www.youtube.com/watch?v=CEzKX2ntw98",
  },
  {
    id: "smart-anchor",
    name: "Smart Anchor",
    tagline: "Recompute anchor points without breaking your animations.",
    image: "assets/plugins/smart-anchor.png",
    section: "my",
    requires: "pro",
    price: "Free",
    entry: "plugins/smart-anchor/index.html",
    bgEntry: "plugins/smart-anchor/background.html",
    cepBundleId: "com.marcwenz.smartanchor",
    demoUrl: "https://youtu.be/Lfj6frPC8co",
  },
  {
    id: "vfx-engine",
    name: "VFX Engine",
    tagline: "AI-driven effects on top of your footage.",
    image: "assets/plugins/vfx-engine.png",
    section: "store",
    requires: null,
    price: "Coming Soon",
    comingSoon: true,
  },
  {
    id: "auto-cut",
    name: "Auto Cut",
    tagline: "Cut silences and dead air in one pass.",
    image: "assets/plugins/auto-cut.png",
    section: "store",
    requires: null,
    price: "Coming Soon",
    comingSoon: true,
  },
];

function UtilityPluginsPanel({ accent, isPro, onPaywall, onToast, autoTest }) {
  // DEMO: plugin webviews cannot run in a browser — show the marketing graphic.
  if (window.CLIPDECK_DEMO) return <UtilityPluginsPaywall onCheckout={() => {}} onAlreadyPro={() => {}}/>;
  // Live plugin discovery — pull the backend registry and the userland
  // install dir on mount, then merge with the bundled catalogue. The
  // merged list is the source of truth for what cards render and which
  // CTA each card surfaces.
  //
  // Sources, in priority order:
  //   1. PLUGIN_CATALOGUE (bundled) — Smart Paste / Smart Anchor.
  //      Always present, always installable, ship as part of the .pkg.
  //   2. listInstalledPlugins() — plugin folders under ~/Library/.../plugins/
  //      Each one was previously installed from the registry. Treated
  //      as "owned" — opens the panel, shows Uninstall affordance.
  //   3. fetchPluginRegistry() — the live backend list. Anything here
  //      that ISN'T already installed becomes a marketplace card with
  //      Install / Coming Soon / Pro-gated based on its `status`.
  const [installedFromDisk, setInstalledFromDisk] = React.useState([]);
  const [registry, setRegistry] = React.useState([]);
  const [installingId, setInstallingId] = React.useState(null);
  const [installProgress, setInstallProgress] = React.useState(0);

  const refreshPluginSources = React.useCallback(async () => {
    if (window.clipDeck && window.clipDeck.listInstalledPlugins) {
      try {
        const r = await window.clipDeck.listInstalledPlugins();
        if (r && r.ok) setInstalledFromDisk(r.plugins || []);
      } catch (e) {}
    }
    if (window.clipDeck && window.clipDeck.fetchPluginRegistry) {
      try {
        const r = await window.clipDeck.fetchPluginRegistry();
        if (r && r.ok) setRegistry(r.plugins || []);
      } catch (e) {}
    }
  }, []);
  React.useEffect(() => { refreshPluginSources(); }, [refreshPluginSources]);

  // Merge bundled + installed + registry into a single render list with
  // a normalised `state` per plugin so PluginCard doesn't have to do the
  // plumbing. State values:
  //   "owned"        — installed (bundled or from registry); click to open
  //   "available"    — in registry, not installed yet; click to install
  //   "installing"   — install in flight; progress overlay
  //   "coming-soon"  — registry status="coming-soon"; disabled
  //   "pro-gated"    — registry requiresPro && !isPro; click → paywall
  const installedIds = React.useMemo(
    () => new Set([
      ...PLUGIN_CATALOGUE.filter((p) => p.entry).map((p) => p.id),
      ...installedFromDisk.map((p) => p.id),
    ]),
    [installedFromDisk]
  );

  const myPlugins = React.useMemo(() => {
    const bundled = PLUGIN_CATALOGUE.filter((p) => p.section === "my");
    // Wrap each installed-from-disk plugin into a catalogue-shaped entry.
    const installed = installedFromDisk
      .filter((p) => !PLUGIN_CATALOGUE.find((bp) => bp.id === p.id))
      .map((p) => ({
        id: p.id,
        name: p.name || p.id,
        tagline: p.tagline || "",
        image: p.image || null,
        section: "my",
        requires: p.requiresPro ? "pro" : null,
        price: p.requiresPro ? "Pro" : "Free",
        // The on-disk entry points live under installPath/<file>. Treat
        // installPath as a file:// base so the webview can find them.
        entry: p.installPath ? `file://${p.installPath}/${p.entry || "index.html"}` : null,
        bgEntry: p.installPath ? `file://${p.installPath}/${p.bgEntry || "background.html"}` : null,
        cepBundleId: p.cepBundleId || ("com.inthezone." + p.id),
        demoUrl: p.demoUrl || null,
        installedFromRegistry: true,
      }));
    return [...bundled, ...installed];
  }, [installedFromDisk]);

  const storePlugins = React.useMemo(() => {
    // Anything in the registry that's NOT already installed shows as a
    // marketplace card. Fall back to the static catalogue entries when
    // the registry isn't reachable (offline / backend not deployed).
    const registryStore = registry
      .filter((r) => !installedIds.has(r.id))
      .map((r) => {
        // The backend registry can omit fields for bundled "coming
        // soon" plugins — vfx-engine / auto-cut ship their box art
        // inside the .pkg and the registry lists them with no `image`.
        // Fall back to the matching PLUGIN_CATALOGUE entry so the card
        // art (and copy) still render instead of the bare fallback.
        const cat = PLUGIN_CATALOGUE.find((p) => p.id === r.id) || {};
        return {
          id: r.id,
          name: r.name || cat.name,
          tagline: r.tagline || cat.tagline,
          image: r.image || cat.image || null,
          section: "store",
          requires: r.requiresPro ? "pro" : null,
          price: r.requiresPro ? "Pro" : (r.status === "coming-soon" ? "Coming Soon" : "Free"),
          comingSoon: r.status === "coming-soon",
          registryDescriptor: r, // keep the full descriptor for install IPC
        };
      });
    // If the registry returned nothing usable, fall back to the static
    // "coming soon" catalogue entries so the marketplace doesn't look
    // empty on first install.
    if (registryStore.length > 0) return registryStore;
    return PLUGIN_CATALOGUE.filter((p) => p.section === "store" && !installedIds.has(p.id));
  }, [registry, installedIds]);

  const [selectedPlugin, setSelectedPlugin] = React.useState(null);
  // Auto-test driver: when the App boots with the autotest flag set,
  // auto-open the matching plugin so the harness can probe it.
  React.useEffect(() => {
    if (!autoTest) return;
    const target = myPlugins.find((p) => p.id === autoTest);
    if (target && target.entry) setSelectedPlugin(target);
  }, [autoTest, myPlugins]);

  const cardState = (plugin) => {
    if (installingId === plugin.id) return "installing";
    if (plugin.comingSoon || (plugin.registryDescriptor && plugin.registryDescriptor.status === "coming-soon")) {
      return "coming-soon";
    }
    // Marketplace card with no installer = registry placeholder. Treat as
    // pro-gated when applicable so the paywall surfaces.
    if (plugin.section === "store") {
      if (plugin.requires === "pro" && !isPro) return "pro-gated";
      return "available";
    }
    // My-section plugin: owned. (Bundled or installed-from-registry —
    // both behave identically beyond this point.)
    if (plugin.requires === "pro") return isPro ? "owned" : "pro-gated";
    return "owned";
  };

  // Install a marketplace plugin: download → verify → extract. Refreshes
  // the disk-installed list so the card immediately flips to "owned".
  const installFromRegistry = React.useCallback(async (descriptor) => {
    if (!descriptor || !descriptor.downloadUrl) {
      if (onToast) onToast(`${descriptor && descriptor.name || "Plugin"} isn't downloadable yet.`);
      return;
    }
    setInstallingId(descriptor.id);
    setInstallProgress(0);
    let unsub = null;
    if (window.clipDeck && window.clipDeck.onPluginInstallProgress) {
      unsub = window.clipDeck.onPluginInstallProgress(descriptor.id, ({ received, total }) => {
        setInstallProgress(total ? received / total : 0);
      });
    }
    try {
      const res = await window.clipDeck.installPlugin(descriptor);
      if (!res || !res.ok) {
        if (onToast) onToast("Install failed: " + ((res && res.error) || "unknown"));
        return;
      }
      await refreshPluginSources();
      if (onToast) onToast(`${descriptor.name} installed.`);
    } catch (e) {
      if (onToast) onToast("Install failed: " + (e && e.message || e));
    } finally {
      if (unsub) unsub();
      setInstallingId(null);
      setInstallProgress(0);
    }
  }, [refreshPluginSources, onToast]);

  const uninstallInstalled = React.useCallback(async (plugin) => {
    if (!window.clipDeck || !window.clipDeck.uninstallPlugin) return;
    if (!confirm(`Uninstall ${plugin.name}?`)) return;
    const res = await window.clipDeck.uninstallPlugin(plugin.id);
    if (!res || !res.ok) {
      if (onToast) onToast("Uninstall failed: " + ((res && res.error) || "unknown"));
      return;
    }
    setSelectedPlugin((s) => (s && s.id === plugin.id ? null : s));
    await refreshPluginSources();
    if (onToast) onToast(`${plugin.name} uninstalled.`);
  }, [refreshPluginSources, onToast]);

  const handleOpen = (plugin) => {
    const state = cardState(plugin);
    if (state === "coming-soon") {
      if (onToast) onToast(`${plugin.name} is coming soon.`);
      return;
    }
    if (state === "pro-gated") {
      if (onPaywall) onPaywall({ feature: "plugins" });
      return;
    }
    if (state === "available") {
      installFromRegistry(plugin.registryDescriptor);
      return;
    }
    if (state === "installing") return; // ignore clicks during install
    if (!plugin.entry) {
      if (onToast) onToast(`${plugin.name} integration in progress.`);
      return;
    }
    setSelectedPlugin(plugin);
  };

  return (
    <div className="cd-plugins-panel">
      <div className="cd-plugins-left">
        <PluginSection
          title="My Plugins"
          plugins={myPlugins}
          accent={accent}
          cardState={cardState}
          selectedId={selectedPlugin && selectedPlugin.id}
          onCardClick={handleOpen}
          installProgress={installProgress}
          onUninstall={uninstallInstalled}
        />
        <PluginSection
          title="INTHEZONE Plugins"
          plugins={storePlugins}
          accent={accent}
          cardState={cardState}
          selectedId={selectedPlugin && selectedPlugin.id}
          onCardClick={handleOpen}
          installProgress={installProgress}
          onUninstall={uninstallInstalled}
        />
      </div>
      <div className="cd-plugins-right">
        {selectedPlugin ? (
          <PluginPanel
            key={selectedPlugin.id}
            plugin={selectedPlugin}
            accent={accent}
            autoTest={autoTest === selectedPlugin.id ? autoTest : null}/>
        ) : (
          <div className="cd-plugins-empty">
            <div className="cd-plugins-empty-title">Select a plugin</div>
            <div className="cd-plugins-empty-sub">
              Click any plugin on the left to open it here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Right-pane host for a selected plugin. Mounts the bundled CEP panel
// AND its hidden background extension as twin webviews so the
// existing plugin architecture (panel UI ↔ background ExtendScript
// runner via CSEvents) keeps working. Both webviews:
//   - have nodeintegration enabled (plugins require Node APIs:
//     child_process, fs, http, os, path)
//   - receive plugin-shim.js as a content-side preload that installs
//     window.__adobe_cep__ with evalScript / addEventListener /
//     dispatchEvent / requestOpenExtension / getHostEnvironment /
//     getExtensionId stubs
//   - URL-encode their CEP extension id + the Clip Deck CEP bridge
//     port via query params (cdExtensionId, cdPort) so the shim has
//     per-instance config
// CEP cross-extension events fired in one webview are routed to the
// other via the host's ipc-message / webview.send pump.
// ── INTHEZONE plugin event bus ───────────────────────────────────
// Routes CEP events between a plugin's panel + background webviews.
// Both webviews can mount/unmount independently — the panel only
// exists while the user is viewing the plugin in the marketplace;
// the background lives at App level and stays alive forever so the
// helper-binary HTTP bridge keeps responding even when Clip Deck
// itself is hidden or the user is on a different tab.
const pluginBus = (function () {
  // pluginId → { panel: [webview, …], background: [webview, …] }
  //
  // Stacks (not single slots) so a hidden always-mounted panel webview
  // can stay registered as a fallback while a visible panel webview
  // (mounted when the user navigates to Utility Plugins) takes over on
  // top of it. Lookup uses the latest entry — last-registered wins —
  // so events route to the visible panel when one is open, and fall
  // back to the persistent hidden panel when not. This is what makes
  // Smart Anchor / Smart Paste apply hotkeys work without the user
  // having to open the Utility Plugins panel first; the hidden panel
  // is what fires smartAnchorRun in response to capturedPoint events.
  const registry = new Map();
  // webview → ipc-message handler (so we can remove on unregister)
  const handlers = new WeakMap();
  function ensureSlot(id) {
    if (!registry.has(id)) registry.set(id, { panel: [], background: [] });
    return registry.get(id);
  }
  function currentOther(slot, role) {
    const list = role === "panel" ? slot.background : slot.panel;
    return list && list.length ? list[list.length - 1] : null;
  }
  function register(pluginId, role, webview) {
    if (!webview) return;
    const slot = ensureSlot(pluginId);
    if (!slot[role]) slot[role] = [];
    slot[role].push(webview);
    try { window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(`[bus] register ${pluginId}/${role} (stack: panel=${slot.panel.length} bg=${slot.background.length})`); } catch (e) {}
    const handler = (e) => {
      if (!e) return;
      try { window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(`[bus/${pluginId}/${role}] rx ipc-message channel=${e.channel} type=${(e.args && e.args[0] && e.args[0].type) || "?"}`); } catch (err) {}
      if (e.channel !== "cep-dispatch") return;
      const event = e.args && e.args[0];
      const other = currentOther(slot, role);
      try { window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(`[bus/${pluginId}/${role}] forward to other=${!!other} sendFn=${other && typeof other.send}`); } catch (err) {}
      if (other && typeof other.send === "function") {
        try {
          other.send("cep-event", event);
          window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(`[bus/${pluginId}/${role}] sent cep-event ${(event && event.type)}`);
        } catch (err) {
          try { window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(`[bus/${pluginId}/${role}] send threw ${err && err.message || err}`); } catch (e2) {}
        }
      }
    };
    webview.addEventListener("ipc-message", handler);
    handlers.set(webview, handler);
  }
  function unregister(pluginId, role, webview) {
    const slot = registry.get(pluginId);
    if (slot && Array.isArray(slot[role])) {
      slot[role] = slot[role].filter((w) => w !== webview);
    }
    const h = webview && handlers.get(webview);
    if (h && webview) {
      try { webview.removeEventListener("ipc-message", h); } catch (e) {}
      handlers.delete(webview);
    }
  }
  return { register, unregister };
})();

// Always-mounted hidden background + panel webviews for owned plugins.
// Lives at App level so the bridge survives ALL UI navigation —
// switching libraries / decks / tools, hiding the overlay via global
// hotkey, closing devtools, etc.
//
// Two webview kinds per plugin:
//   - Background frame: the bridge server + helper-binary client; talks
//     to the OS-level helper process that listens for the hotkey.
//   - Panel frame: the plugin's UI script context. Some plugins (Smart
//     Anchor) route their compute + apply logic through the panel
//     webview rather than the background — without an always-mounted
//     panel, those apply calls never fire when the user hasn't opened
//     the Utility Plugins panel. Mounting it hidden here keeps the bus
//     end-to-end whether the user has navigated to the panel or not.
//
// The visible PluginPanel in UtilityPluginsPanel still mounts its own
// panel webview when the user opens it; pluginBus is stack-based so
// that visible webview takes priority while it's mounted, and the
// hidden one resumes as the fallback when it unmounts.
function PluginBackgroundHost({ plugins, shimUrl, cepPort }) {
  // DEMO: no hidden plugin webviews / HTTP bridge in the browser panel.
  if (window.CLIPDECK_DEMO) return null;
  if (!shimUrl || !cepPort) return null;
  return (
    <div className="cd-plugin-bg-host">
      {plugins.map((p) => (
        <React.Fragment key={p.id}>
          {p.bgEntry ? <PluginBgFrame plugin={p} shimUrl={shimUrl} cepPort={cepPort}/> : null}
          {p.entry   ? <PluginPanelFrameHidden plugin={p} shimUrl={shimUrl} cepPort={cepPort}/> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function PluginBgFrame({ plugin, shimUrl, cepPort }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    pluginBus.register(plugin.id, "background", wv);
    // Mirror console output to Clip Deck's host console for visibility.
    const onCM = (e) => {
      const lvl = ["LOG", "WARN", "ERROR", "INFO"][e.level] || "LOG";
      try { console.log(`[${plugin.id}:bg/${lvl}] ${e.message}`); } catch (err) {}
    };
    wv.addEventListener("console-message", onCM);
    return () => {
      pluginBus.unregister(plugin.id, "background", wv);
      try { wv.removeEventListener("console-message", onCM); } catch (e) {}
    };
  }, [plugin.id]);
  const extId = (plugin.cepBundleId || "com.unknown." + plugin.id) + ".background";
  const src = `${plugin.bgEntry}?cdExtensionId=${encodeURIComponent(extId)}&cdPort=${cepPort}`;
  return (
    <webview
      ref={ref}
      src={src}
      preload={shimUrl}
      nodeintegration="true"
      webpreferences="contextIsolation=false, nodeIntegration=true, sandbox=false, webSecurity=false"
      disablewebsecurity="true"
      partition={`persist:plugin-${plugin.id}`}
      allowpopups="true"
      className="cd-plugin-bg-host-frame"
    />
  );
}

// Hidden panel webview mirroring the visible one in UtilityPluginsPanel.
// Same src + preload + partition so the plugin's panel JS runs and the
// session storage (settings, calibration) is shared. Registered with
// the bus under role "panel" — when the user opens the visible panel,
// its registration stacks on top and takes priority; this hidden one
// resumes when they navigate away.
function PluginPanelFrameHidden({ plugin, shimUrl, cepPort }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    pluginBus.register(plugin.id, "panel", wv);
    const onCM = (e) => {
      const lvl = ["LOG", "WARN", "ERROR", "INFO"][e.level] || "LOG";
      try { console.log(`[${plugin.id}:panel(hidden)/${lvl}] ${e.message}`); } catch (err) {}
    };
    wv.addEventListener("console-message", onCM);
    return () => {
      pluginBus.unregister(plugin.id, "panel", wv);
      try { wv.removeEventListener("console-message", onCM); } catch (e) {}
    };
  }, [plugin.id]);
  const extId = (plugin.cepBundleId || "com.unknown." + plugin.id) + ".panel";
  const src = `${plugin.entry}?cdExtensionId=${encodeURIComponent(extId)}&cdPort=${cepPort}`;
  return (
    <webview
      ref={ref}
      src={src}
      preload={shimUrl}
      nodeintegration="true"
      webpreferences="contextIsolation=false, nodeIntegration=true, sandbox=false, webSecurity=false"
      disablewebsecurity="true"
      partition={`persist:plugin-${plugin.id}`}
      allowpopups="true"
      className="cd-plugin-bg-host-frame"
    />
  );
}

function PluginPanel({ plugin, accent, autoTest }) {
  const panelRef = React.useRef(null);
  const [shimUrl, setShimUrl] = React.useState(null);
  const [cepPort, setCepPort] = React.useState(null);

  // Resolve shim URL + backend port asynchronously. Gate the
  // webview render on both being ready so the preload + cdPort
  // are present at first navigation.
  React.useEffect(() => {
    if (!window.clipDeck) return;
    const pUrl  = window.clipDeck.getPluginShimUrl ? window.clipDeck.getPluginShimUrl() : Promise.resolve(null);
    const pPort = window.clipDeck.backendPort ? window.clipDeck.backendPort() : Promise.resolve(47291);
    Promise.all([pUrl, pPort]).then(([url, port]) => {
      setShimUrl(url || null);
      setCepPort(port || 47291);
    }).catch(() => {});
  }, []);

  // Register the visible panel webview with the App-level plugin bus
  // so its dispatchEvent calls are routed to the always-mounted
  // background. The background is owned by PluginBackgroundHost at
  // App level (so the bridge survives view switches + overlay hide).
  // Deps include shimUrl + cepPort because the webview render is
  // gated on those being resolved — without them in deps, this
  // effect fires once with panelRef.current === null and never again.
  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    pluginBus.register(plugin.id, "panel", panel);
    // Mirror console messages to the host console.
    const onCM = (e) => {
      const lvl = ["LOG", "WARN", "ERROR", "INFO"][e.level] || "LOG";
      try { console.log(`[${plugin.id}:panel/${lvl}] ${e.message}`); } catch (err) {}
    };
    panel.addEventListener("console-message", onCM);
    return () => {
      pluginBus.unregister(plugin.id, "panel", panel);
      try { panel.removeEventListener("console-message", onCM); } catch (e) {}
    };
  }, [plugin.id, shimUrl, cepPort]);

  // Autotest harness (run only in debug mode when autotest flag set).
  // Deps include shimUrl + cepPort because the webview render is
  // gated on those being resolved.
  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !autoTest || !shimUrl || !cepPort) return;
    const writeLog = (msg) => {
      try { window.clipDeck && window.clipDeck.debugLog && window.clipDeck.debugLog(msg); } catch (e) {}
      try { console.log(msg); } catch (e) {}
    };
    let timer = null;
    const runAutoTest = async () => {
      writeLog(`[autotest/${plugin.id}] running…`);
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const clicked = await panel.executeJavaScript(`
          (function(){
            var t = document.getElementById("use-default-shortcuts");
            if (!t) return "no-toggle";
            if (!t.checked) { t.click(); return "clicked-to-enable, now=" + t.checked; }
            return "already-enabled, now=" + t.checked;
          })();
        `);
        writeLog(`[autotest/${plugin.id}] click result: ${clicked}`);
      } catch (e) { writeLog(`[autotest/${plugin.id}] click failed: ${e}`); }
    };
    const onReady = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runAutoTest, 300);
    };
    panel.addEventListener("dom-ready", onReady);
    return () => {
      if (timer) clearTimeout(timer);
      panel.removeEventListener("dom-ready", onReady);
    };
  }, [autoTest, plugin.id, shimUrl, cepPort]);

  if (!shimUrl || !cepPort) {
    return (
      <div className="cd-plugin-panel" style={{ borderColor: accent.glow }}>
        <div className="cd-plugins-empty">
          <div className="cd-plugins-empty-title">Loading {plugin.name}…</div>
        </div>
      </div>
    );
  }

  const panelExtId = (plugin.cepBundleId || ("com.unknown." + plugin.id)) + ".panel";
  const panelSrc = `${plugin.entry}?cdExtensionId=${encodeURIComponent(panelExtId)}&cdPort=${cepPort}`;

  const openDemo = () => {
    if (!plugin.demoUrl) return;
    if (window.clipDeck && window.clipDeck.openExternal) {
      window.clipDeck.openExternal(plugin.demoUrl);
    }
  };

  return (
    <div className="cd-plugin-panel" style={{ borderColor: accent.glow }}>
      {plugin.demoUrl && (
        <button
          type="button"
          className="cd-plugin-demo-btn"
          onClick={openDemo}
          title={`Watch the ${plugin.name} demo on YouTube`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Watch Demo Tutorial
        </button>
      )}
      <webview
        ref={panelRef}
        src={panelSrc}
        preload={shimUrl}
        nodeintegration="true"
        webpreferences="contextIsolation=false, nodeIntegration=true, sandbox=false, webSecurity=false"
        disablewebsecurity="true"
        className="cd-plugin-panel-frame"
        partition={`persist:plugin-${plugin.id}`}
        allowpopups="true"
      />
    </div>
  );
}

function PluginSection({ title, plugins, accent, cardState, selectedId, onCardClick, installProgress, onUninstall }) {
  return (
    <section className="cd-plugins-section">
      <div className="cd-plugins-section-title">{title}</div>
      {plugins.length > 0 && (
        <div className="cd-plugins-grid">
          {plugins.map((p) => (
            <PluginCard
              installProgress={installProgress}
              onUninstall={onUninstall}
              key={p.id}
              plugin={p}
              accent={accent}
              state={cardState(p)}
              isSelected={selectedId === p.id}
              onClick={() => onCardClick(p)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PluginCard({ plugin, accent, state, isSelected, onClick, installProgress, onUninstall }) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const ctaLabel =
      isSelected               ? "Opened"
    : state === "owned"        ? "Open"
    : state === "available"    ? "Install"
    : state === "installing"   ? `Installing… ${Math.round((installProgress || 0) * 100)}%`
    : state === "pro-gated"    ? "Upgrade to unlock"
    : state === "coming-soon"  ? "Coming Soon"
    : "Get it";
  const ctaDisabled = state === "coming-soon" || state === "installing";
  return (
    <div className={`cd-plugin-card-wrap${plugin.installedFromRegistry ? " has-uninstall" : ""}`}>
      <button
        className={`cd-plugin-card cd-plugin-card--${state}${isSelected ? " is-selected" : ""}`}
        onClick={onClick}
        disabled={ctaDisabled}
        style={(state === "owned" || isSelected)
          ? { borderColor: accent.glow, boxShadow: isSelected ? `0 12px 40px -12px ${accent.glow}` : `0 10px 36px -14px ${accent.glow}` }
          : null}>
        <div className="cd-plugin-card-art">
          {plugin.image && !imgFailed
            ? <img src={plugin.image} alt={plugin.name} onError={() => setImgFailed(true)}/>
            : <div className="cd-plugin-card-fallback">
                <div className="cd-plugin-card-fallback-mark" style={{ background: accent.hex }}/>
                <div className="cd-plugin-card-fallback-name">{plugin.name}</div>
              </div>}
          {state === "installing" && (
            <div className="cd-plugin-card-progress">
              <div className="cd-plugin-card-progress-fill"
                   style={{ width: `${Math.round((installProgress || 0) * 100)}%` }}/>
            </div>
          )}
        </div>
        <div className="cd-plugin-card-body">
          <div className="cd-plugin-card-name">{plugin.name}</div>
          <div className="cd-plugin-card-tag">{plugin.tagline}</div>
          <div className="cd-plugin-card-foot">
            <span className="cd-plugin-card-price">{plugin.price}</span>
            <span className={`cd-plugin-card-cta${(state === "owned" || isSelected) ? " on" : ""}`}
                  style={(state === "owned" || isSelected) ? { color: accent.hex } : null}>
              {ctaLabel}
            </span>
          </div>
        </div>
      </button>
      {plugin.installedFromRegistry && state !== "installing" && (
        <button
          type="button"
          className="cd-plugin-card-uninstall"
          title={`Uninstall ${plugin.name}`}
          onClick={(e) => { e.stopPropagation(); onUninstall && onUninstall(plugin); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function formatDuration(seconds) {
  const s = Number(seconds);
  if (!isFinite(s) || s < 0) return "?:??";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

function RecentTile({ item, idx, hovered, onHover, onActivate, accent, showHotkey }) {
  const kind = item.kind || fileKind(item.path);
  // For videos that didn't have a cached thumb at fire time (extraction was
  // still pending), pull the first frame on demand here too.
  const [localThumb, setLocalThumb] = React.useState(item.thumb || null);
  React.useEffect(() => {
    if (kind !== "video" || !item.path || localThumb) return;
    let alive = true;
    extractVideoFirstFrame(item.path).then((dataUrl) => {
      if (alive && dataUrl) setLocalThumb(dataUrl);
    });
    return () => { alive = false; };
  }, [kind, item.path, localThumb]);

  const imageUrl =
    (item.customThumb && item.thumb) ? item.thumb :
    kind === "image" ? pathToFileUrl(item.path) :
    (kind === "video" && localThumb) ? localThumb :
    null;
  const showImage = !!imageUrl;
  const sub = (kind === "clipboard") ? item.captureSubtype : null;
  const isAudioCapture = kind === "clipboard" && (sub === "audio" || (!sub && !!item.audioOnly));
  // Split curated transitions (yellow) from user-saved transitions
  // (orange) — same rationale as SlotTile. Curated transitions whose
  // recipe is tagged audio:true route to the lime audio-transition
  // skin.
  const isCuratedTransition = !!(item.effectRecipe && item.effectRecipe.components
    && item.effectRecipe.components[0] && item.effectRecipe.components[0].kind === "transition");
  const isAudioTransition = isCuratedTransition
    && item.effectRecipe.components.some((c) => c && c.audio);
  const isSavedTransition = !!(item.captureSubtype === "transition");
  const isTransitionCard = isCuratedTransition || isSavedTransition;
  // V2 tile-type classification — mirror SlotTile so the recent strip
  // renders identical card faces to the main grid.
  const isAudioFx = (kind === "effect"
    && item.effectRecipe && Array.isArray(item.effectRecipe.components)
    && item.effectRecipe.components.some((c) => c && c.audio));
  // Saved-attributes detection — see SlotTile for the full rationale.
  const looksLikeAttrCapture = (
    kind === "effect"
    && item.effectRecipe
    && !item.useTextThumb
    && !isTransitionCard
    && typeof item.name === "string"
    && item.name.indexOf("Effect · ") === 0
  );
  const isSavedAttributes = !!item.attributeSelection
    || !!item.capturedAttributes
    || item.captureSubtype === "attributes"
    || looksLikeAttrCapture;
  const tileType = isSavedAttributes ? "saved-attributes"
    : isSavedTransition ? "saved-transition"
    : isAudioTransition ? "audio-transition"
    : isCuratedTransition ? "transition"
    : (kind === "effect" && isAudioFx) ? "audio-fx"
    : (kind === "effect") ? "fx"
    : (kind === "image") ? "image"
    : (kind === "video") ? "video"
    : (kind === "audio" || isAudioCapture) ? "audio"
    : (kind === "clipboard" || kind === "sequence") ? "timeline-clip"
    : "empty";
  const V2_ICON = {
    "fx":               "assets/v2/effect-icon.png",
    "transition":       "assets/v2/transition-icon.png",
    "audio-fx":         "assets/v2/audio-effect-icon.png",
    "audio-transition": "assets/v2/audio-transition-icon.png",
    "timeline-clip":    "assets/v2/timeline-clip-icon.png",
    "saved-attributes": "assets/v2/saved-attributes-icon.png",
    "saved-transition": "assets/v2/saved-transition-icon.png",
  }[tileType];
  const hotkey = showHotkey ? item.slotKey : null;
  const useCustomThumb = !!(item.customThumb && item.thumb);
  // Images with alpha edges (logos, cutouts — any extension) → contain.
  // Solid-edge images (photos, video frames) → cover. See SlotTile.
  const thumbFitContain = useImageHasAlphaEdge(imageUrl);
  // Duration chip — async-loaded for disk-backed video / audio.
  const durationSeconds = useMediaDuration(item.path, kind);
  const durationLabel = formatDurationLabel(durationSeconds);
  const colorOverride = item.customColor && item.customColor.top ? item.customColor : null;
  // Match SlotTile's hover treatment: the active panel accent drives
  // the ring/glow, while the V2 tile skin keeps its lift/brightness.
  const hoverStyle = hovered
    ? { borderColor: accent.glow, boxShadow: `0 0 0 1px ${accent.glow}, 0 8px 30px -10px ${accent.glow}` }
    : null;
  const tileInlineStyle = colorOverride
    ? Object.assign({ cursor: "pointer" }, {
        background: `linear-gradient(180deg, ${colorOverride.top} 0%, ${colorOverride.bot} 100%)`,
        borderColor: colorOverride.border,
        color: colorOverride.text,
        "--cd-tile-custom-top": colorOverride.top,
        "--cd-tile-custom-bot": colorOverride.bot,
      }, hoverStyle || {})
    : Object.assign({ cursor: "pointer" }, hoverStyle || {});

  return (
    <div className={`cd-rtile v2-tile v2-tile--${tileType}${hovered ? " on" : ""}${colorOverride ? " v2-tile--custom-color" : ""}`}
      data-tile-type={tileType}
      onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)}
      onClick={() => onActivate && onActivate(item)}
      style={tileInlineStyle}>

      {/* Full-bleed thumbnail — auto for image/video, also used for any
          tile type when the user has set a custom thumb. */}
      {(useCustomThumb || tileType === "image" || tileType === "video") && (
        <span className={`v2-thumb${thumbFitContain ? " v2-thumb--contain" : ""}`}
              style={(useCustomThumb || showImage) ? { backgroundImage: `url("${imageUrl}")` } : null}
              aria-hidden="true"/>
      )}
      {(useCustomThumb || tileType === "image" || tileType === "video") && !thumbFitContain && (
        <span className="v2-thumb-scrim" aria-hidden="true"/>
      )}

      {/* Audio waveform — hidden when a custom thumb is set. */}
      {!useCustomThumb && tileType === "audio" && (
        <span className="v2-wave-wrap" aria-hidden="true">
          <V2Waveform seed={`${hotkey || ""}::${item.name || idx}`}/>
        </span>
      )}

      {/* Designated PNG icons — hidden when a custom thumb is set. */}
      {!useCustomThumb && tileType === "fx" && V2_ICON && (
        <span className="v2-effect-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-effect-glyph" draggable={false}/>
        </span>
      )}
      {!useCustomThumb && (tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition"
        || tileType === "timeline-clip") && V2_ICON && (
        <span className="v2-transition-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-transition-glyph" draggable={false}/>
        </span>
      )}

      {/* Top-right type badge / play button. */}
      {tileType === "fx" && (
        <span className="v2-typebadge" aria-hidden="true" title="Effect">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" stroke="currentColor" strokeWidth="1"/>
            <rect x="7" y="7" width="4" height="4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {(tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition") && (
        <span className="v2-typebadge" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="6" height="11" rx="0.75" fill="currentColor" opacity="0.5"/>
            <rect x="6" y="1" width="6" height="11" rx="0.75" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "timeline-clip" && (
        <span className="v2-typebadge" aria-hidden="true" title="Timeline saved clip">
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
            <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="1.5" y="3.5" width="6" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="6" y="6.5" width="5.5" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="2" y="9.5" width="7.5" height="1.6" rx="0.4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "image" && (
        <span className="v2-typebadge" aria-hidden="true" title="Image">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1.5" width="10" height="9" rx="1.25" stroke="currentColor" strokeWidth="1"/>
            <circle cx="3.75" cy="4.25" r="0.9" fill="currentColor"/>
            <path d="M1.5 9l2.75-2.75 2 2L9.25 5.25l1.25 1.25v3a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5V9z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "video" && (
        <span className="v2-play" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 2.5v9l8-4.5-8-4.5z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {/* Duration chip — top-right on video + audio. */}
      {(tileType === "video" || tileType === "audio") && durationLabel && (
        <span className="v2-duration">{durationLabel}</span>
      )}

      {/* Shortcut chip — top-left mono pill. */}
      {hotkey && <span className="v2-chip">{hotkey}</span>}

      {/* Name overlay — bottom. */}
      <V2Name media={(useCustomThumb && !thumbFitContain) || tileType === "image" || tileType === "video"} text={item.name || "Unnamed"}/>

      {/* Most Used badge — fire-count in the top-right of the tile.
          Only present when an item carries useCount (Most Used view). */}
      {item.useCount > 0 && (
        <div className="cd-rtile-count" title={`Fired ${item.useCount} time${item.useCount === 1 ? "" : "s"}`}>
          ×{item.useCount}
        </div>
      )}
    </div>
  );
}

function RecentStrip({ items, accent, onActivate, locked, isPro, onUpgrade, onProClick, mode, onModeChange }) {
  const [hover, setHover] = React.useState(null);
  // Two views: "recent" (session-scoped fire log) and "mostused" (top
  // 10 by persistent useCount across the active library). Mode is
  // owned by App so the right items list can be fed in.
  const STRIP_MODES = [
    { value: "recent",   label: "Recently Used" },
    { value: "mostused", label: "Most Used" },
  ];
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  // Close the mode menu whenever the panel loses focus, matching the
  // top-level reset in App so the next show is always a clean cards view.
  React.useEffect(() => {
    const onBlur = () => setMenuOpen(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);
  const currentMode = STRIP_MODES.find((m) => m.value === mode) || STRIP_MODES[0];
  // When locked (Free user, paywall on), we keep the section's full
  // physical dimensions — same header, same row of 10 placeholder tiles —
  // and surface a small Pro chip + Upgrade affordance instead of cards.
  // This avoids a layout shift between Free and Pro and lets the user
  // see the feature exists without minimizing the panel.
  const list = locked ? [] : items;
  return (
    <section className={`cd-recent${locked ? " cd-recent--locked" : ""}`}
      onClick={locked ? onUpgrade : undefined}
      role={locked ? "button" : undefined}
      tabIndex={locked ? 0 : undefined}
      onKeyDown={locked ? ((e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onUpgrade && onUpgrade(); } }) : undefined}
      title={locked ? "Recently Used is a Pro feature — click to upgrade" : undefined}>
      <div className="cd-recent-head">
        <div className="cd-recent-title" ref={menuRef}>
          <button
            type="button"
            className={`cd-recent-title-btn${menuOpen ? " open" : ""}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            title="Switch list">
            <I.clock className="cd-recent-ico"/>
            <span>{currentMode.label}</span>
            <I.caret className="cd-recent-title-caret"/>
          </button>
          {!locked && <span className="cd-recent-count">{list.length}</span>}
          {menuOpen && (
            <div className="cd-recent-modes" onMouseDown={(e) => e.stopPropagation()}>
              {STRIP_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`cd-recent-mode${m.value === mode ? " active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onModeChange) onModeChange(m.value);
                    setMenuOpen(false);
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {isPro
          ? <button className="cd-plan-badge cd-plan-badge--pro"
              onClick={(e) => { e.stopPropagation(); if (onProClick) onProClick(); }}
              title="Open Clip Deck Pro welcome">
              PRO
            </button>
          : <button className="cd-plan-badge cd-plan-badge--free"
              onClick={(e) => { e.stopPropagation(); onUpgrade && onUpgrade(); }}
              title="Upgrade to Clip Deck Pro">
              FREE
            </button>
        }
      </div>
      <div className="cd-recent-row">
        {list.map((it, idx) => (
          <RecentTile key={it.id}
            item={it} idx={idx}
            hovered={hover === it.id}
            onHover={setHover}
            onActivate={onActivate}
            accent={accent}
            showHotkey={mode !== "recent"}/>
        ))}
        {Array.from({ length: Math.max(0, 10 - list.length) }).map((_, i) => (
          <div key={"ph" + i} className="cd-rtile" style={{ opacity: .12, pointerEvents: "none" }}/>
        ))}
      </div>
    </section>
  );
}

function Palette({ open, onClose, accent }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const groups = [
    { label: "Insert", items: [
      { name: "Insert at playhead", hint: "↵", tag: "Action" },
      { name: "Replace selected clip", hint: "⇧↵", tag: "Action" },
      { name: "Pin to Favorites", hint: "F", tag: "Action" },
    ]},
    { label: "Jump to", items: [
      { name: "Recently Used", hint: "⌘1", tag: "Section" },
      { name: "Favorites",     hint: "⌘2", tag: "Section" },
      { name: "Transitions",   hint: "⌘3", tag: "Section" },
      { name: "SFX",           hint: "⌘4", tag: "Section" },
      { name: "Templates",     hint: "⌘5", tag: "Section" },
    ]},
  ];

  if (!open) return null;
  return (
    <div className="cd-pal-scrim" onMouseDown={onClose}>
      <div className="cd-pal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cd-pal-head">
          <I.search className="cd-pal-ico"/>
          <input ref={inputRef} className="cd-pal-input" placeholder="Type a command, or search anything…" value={q} onChange={(e) => setQ(e.target.value)}/>
          <span className="cd-pal-esc">esc</span>
        </div>
        <div className="cd-pal-body">
          {groups.map((g, gi) => (
            <div key={g.label} className="cd-pal-group">
              <div className="cd-pal-group-h">{g.label}</div>
              {g.items.map((it, i) => {
                const sel = gi === 0 && i === 0;
                return (
                  <div key={it.name} className={`cd-pal-row${sel ? " on" : ""}`}
                    style={ sel ? { background: accent.soft } : null }>
                    <div className="cd-pal-thumb dim"><I.cmd/></div>
                    <div className="cd-pal-row-text">
                      <div className="cd-pal-row-name" style={ sel ? { color: accent.hex } : null }>{it.name}</div>
                      <div className="cd-pal-row-tag">{it.tag}</div>
                    </div>
                    <div className="cd-pal-kbd"><kbd>{it.hint}</kbd></div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cd-pal-foot">
          <div className="cd-pal-foot-l">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> insert</span>
            <span><kbd>tab</kbd> preview</span>
          </div>
          <div className="cd-pal-foot-r">
            <span style={{ color: accent.hex }}>●</span> Clip Deck
          </div>
        </div>
      </div>
    </div>
  );
}

// Read-only tile that mirrors SlotTile's visuals but only fires on click —
// used for search results, where the underlying slot may live in a different
// library/deck than the active one.
function SearchResultTile({ result, accent, onActivate, positionKey, isSelected }) {
  const { slot } = result;
  const kind = slot.kind || fileKind(slot.path);
  // Lazy video thumbnail: when the slot's library/deck hasn't been visited
  // this session, slot.thumb is null. Extract the first frame on demand
  // and cache it locally. We don't write back to config — when the user
  // eventually opens that deck, SlotTile's own effect will persist it.
  const [localThumb, setLocalThumb] = React.useState(slot.thumb || null);
  React.useEffect(() => {
    if (kind !== "video" || !slot.path || localThumb) return;
    let alive = true;
    extractVideoFirstFrame(slot.path).then((dataUrl) => {
      if (alive && dataUrl) setLocalThumb(dataUrl);
    });
    return () => { alive = false; };
  }, [kind, slot.path, localThumb]);
  // Async duration for video/audio (top-right chip).
  const durationSeconds = useMediaDuration(slot.path, kind);
  const durationLabel = formatDurationLabel(durationSeconds);
  // ── V2 tile-type classification — mirrors SlotTile + RecentTile so
  // a card looks identical wherever it shows up.
  const isCuratedTransition = !!(slot.effectRecipe && slot.effectRecipe.components
    && slot.effectRecipe.components[0] && slot.effectRecipe.components[0].kind === "transition");
  const isAudioTransition = isCuratedTransition
    && slot.effectRecipe.components.some((c) => c && c.audio);
  const isSavedTransition = !!(slot.captureSubtype === "transition");
  const isAudioFx = (kind === "effect"
    && slot.effectRecipe && Array.isArray(slot.effectRecipe.components)
    && slot.effectRecipe.components.some((c) => c && c.audio));
  const looksLikeAttrCapture = (
    kind === "effect"
    && slot.effectRecipe
    && !slot.useTextThumb
    && !isCuratedTransition && !isSavedTransition
    && typeof slot.name === "string"
    && slot.name.indexOf("Effect · ") === 0
  );
  const isSavedAttributes = !!slot.attributeSelection
    || !!slot.capturedAttributes
    || slot.captureSubtype === "attributes"
    || looksLikeAttrCapture;
  const sub = (kind === "clipboard") ? slot.captureSubtype : null;
  const isAudioCapture = kind === "clipboard" && (sub === "audio" || (!sub && !!slot.audioOnly));
  const tileType = isSavedAttributes ? "saved-attributes"
    : isSavedTransition ? "saved-transition"
    : isAudioTransition ? "audio-transition"
    : isCuratedTransition ? "transition"
    : (kind === "effect" && isAudioFx) ? "audio-fx"
    : (kind === "effect") ? "fx"
    : (kind === "image") ? "image"
    : (kind === "video") ? "video"
    : (kind === "audio" || isAudioCapture) ? "audio"
    : (kind === "clipboard" || kind === "sequence") ? "timeline-clip"
    : null;
  const V2_ICON = {
    "fx":               "assets/v2/effect-icon.png",
    "transition":       "assets/v2/transition-icon.png",
    "audio-fx":         "assets/v2/audio-effect-icon.png",
    "audio-transition": "assets/v2/audio-transition-icon.png",
    "timeline-clip":    "assets/v2/timeline-clip-icon.png",
    "saved-attributes": "assets/v2/saved-attributes-icon.png",
    "saved-transition": "assets/v2/saved-transition-icon.png",
  }[tileType];
  const useCustomThumb = !!(slot.customThumb && slot.thumb);
  const imageUrl =
    (slot.customThumb && slot.thumb) ? slot.thumb :
    kind === "image" ? pathToFileUrl(slot.path) :
    ((kind === "video" || kind === "clipboard") && (slot.thumb || localThumb)) ? (slot.thumb || localThumb) :
    null;
  const showImage = !!imageUrl;
  // Images with alpha edges (logos, cutouts — any extension) → contain.
  // Solid-edge images (photos, video frames) → cover. See SlotTile.
  const thumbFitContain = useImageHasAlphaEdge(imageUrl);
  const colorOverride = slot.customColor && slot.customColor.top ? slot.customColor : null;
  const tileInlineStyle = colorOverride
    ? {
        background: `linear-gradient(180deg, ${colorOverride.top} 0%, ${colorOverride.bot} 100%)`,
        borderColor: colorOverride.border,
        color: colorOverride.text,
        "--cd-tile-custom-top": colorOverride.top,
        "--cd-tile-custom-bot": colorOverride.bot,
      }
    : null;
  // Hotkey on a search result reflects the result's position in the
  // result grid (1-0 / Q-P / A-; / Z-/), NOT the slot's home-deck key.
  // Pressing that key while results are visible fires that result.
  const hotkey = positionKey || slot.key;
  return (
    <div className={`cd-tile cd-result-tile v2-tile v2-tile--${tileType || "empty"}${colorOverride ? " v2-tile--custom-color" : ""}${isSelected ? " cd-result-tile--selected" : ""}`}
      data-tile-type={tileType || undefined}
      role="button" tabIndex={0}
      style={tileInlineStyle}
      onClick={() => onActivate(result)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(result); } }}>

      {/* Full-bleed thumbnail — auto for image/video/timeline-clip with
          a stored thumb; also full-bleed for any tile that has a custom
          thumb set. PNG-shaped sources letterbox via .v2-thumb--contain. */}
      {(useCustomThumb || tileType === "image" || tileType === "video") && (
        <span className={`v2-thumb${thumbFitContain ? " v2-thumb--contain" : ""}`}
              style={(useCustomThumb || showImage) ? { backgroundImage: `url("${imageUrl}")` } : null}
              aria-hidden="true"/>
      )}
      {(useCustomThumb || tileType === "image" || tileType === "video") && !thumbFitContain && (
        <span className="v2-thumb-scrim" aria-hidden="true"/>
      )}

      {/* Audio waveform — hidden when a custom thumb is set. */}
      {!useCustomThumb && tileType === "audio" && (
        <span className="v2-wave-wrap" aria-hidden="true">
          <V2Waveform seed={`${hotkey || ""}::${slot.name || result.slotIdx}`}/>
        </span>
      )}

      {/* Designated PNG icon for the solid-body card types. */}
      {!useCustomThumb && tileType === "fx" && (
        <span className="v2-effect-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-effect-glyph" draggable={false}/>
        </span>
      )}
      {!useCustomThumb && (tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition"
        || tileType === "timeline-clip") && (
        <span className="v2-transition-vis" aria-hidden="true">
          <img src={V2_ICON} alt="" className="v2-transition-glyph" draggable={false}/>
        </span>
      )}

      {/* Top-right badges / overlays. */}
      {tileType === "fx" && (
        <span className="v2-typebadge" aria-hidden="true" title="Effect">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" stroke="currentColor" strokeWidth="1"/>
            <rect x="7" y="7" width="4" height="4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {(tileType === "transition" || tileType === "audio-transition"
        || tileType === "audio-fx" || tileType === "saved-attributes"
        || tileType === "saved-transition") && (
        <span className="v2-typebadge" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="6" height="11" rx="0.75" fill="currentColor" opacity="0.5"/>
            <rect x="6" y="1" width="6" height="11" rx="0.75" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "timeline-clip" && (
        <span className="v2-typebadge" aria-hidden="true" title="Timeline saved clip">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="1.5" y="3.5" width="6" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="6" y="6.5" width="5.5" height="1.6" rx="0.4" fill="currentColor"/>
            <rect x="2" y="9.5" width="7.5" height="1.6" rx="0.4" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "image" && (
        <span className="v2-typebadge" aria-hidden="true" title="Image">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1.5" width="10" height="9" rx="1.25" stroke="currentColor" strokeWidth="1"/>
            <circle cx="3.75" cy="4.25" r="0.9" fill="currentColor"/>
            <path d="M1.5 9l2.75-2.75 2 2L9.25 5.25l1.25 1.25v3a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5V9z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {tileType === "video" && (
        <span className="v2-play" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 2.5v9l8-4.5-8-4.5z" fill="currentColor"/>
          </svg>
        </span>
      )}
      {(tileType === "video" || tileType === "audio") && durationLabel && (
        <span className="v2-duration">{durationLabel}</span>
      )}

      {/* Shortcut chip + name overlay. */}
      {hotkey && <span className="v2-chip">{hotkey}</span>}
      <V2Name media={(useCustomThumb && !thumbFitContain) || tileType === "image" || tileType === "video"} text={slot.name || "Unnamed"}/>
    </div>
  );
}

function SearchResults({ results, accent, onActivate, query, selectedIndex }) {
  if (results.length === 0) {
    return <div className="cd-search-empty">No matches for "{query}"</div>;
  }
  // Cap the visible result set at the deck grid's 40 cells so cards
  // keep their natural deck-tile dimensions. Anything past the cap is
  // silently dropped — adding a footer hint made the grid recompute
  // its row heights and compressed the visible tiles.
  const MAX = 40;
  const visible = results.slice(0, MAX);
  return (
    <div className="cd-grid cd-grid--results">
      {visible.map((r, idx) => (
        <SearchResultTile
          key={`${r.libIdx}-${r.toolName || ""}-${r.deckIdx}-${r.slotIdx}`}
          result={r} accent={accent} onActivate={onActivate}
          positionKey={KEYMAP[idx]}
          isSelected={idx === selectedIndex}/>
      ))}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="cd-toast">{msg}</div>;
}

function ConnectBanner({ visible }) {
  if (!visible) return null;
  return (
    <div className="cd-connect-banner">
      <i/>
      <span>Premiere not connected — open a project to enable inserts.</span>
    </div>
  );
}

const KEY_CODE_TO_INDEX = (() => {
  const codes = [
    "Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0",
    "KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP",
    "KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","Semicolon",
    "KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period","Slash",
  ];
  const map = {};
  for (let i = 0; i < codes.length; i++) map[codes[i]] = i;
  return map;
})();

// ── EffectPresetPicker ────────────────────────────────────────────────
// Modal that opens when the user picks "Capture effect preset" from a
// slot's context menu. Lists every user-saved preset parsed out of
// Premiere's .prfpset file. Has a search box and groups results by
// video/audio. Clicking a preset row resolves the picker with that
// preset's full payload, which the caller saves to the slot card.
//
// We deliberately don't try to reconstruct Premiere's folder hierarchy
// here — the .prfpset stores presets as a flat list of user-named
// bins. Each bin can hold 1+ effects, and that's what we render.
function App() {
  const [config, setConfig] = React.useState(null);
  const [query, setQuery] = React.useState("");
  // Highlighted index inside the search-results grid. Driven by arrow
  // keys from the search input. Resets to 0 on every query change so a
  // bare Enter always fires the top result. Wraps inside the grid.
  const [searchSelectedIdx, setSearchSelectedIdx] = React.useState(0);
  const [palOpen, setPalOpen] = React.useState(false);
  // Search focus path: renderer-side hotkey + main-process global
  // shortcut both converge here. The earlier behaviour opened a
  // command-palette modal which has been retired — the search shortcut
  // now just focuses the sidebar search input so the user can start
  // typing immediately.
  const focusSearchInput = React.useCallback(() => {
    const el = document.querySelector(".cd-search-input");
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.select(); } catch (e) {}
  }, []);
  // Listen for the configured main-process global search shortcut. When
  // the panel is summoned from outside Clip Deck, main shows it and then
  // fires "search:focus" so the renderer puts the cursor in the search
  // input ready for the user to start typing.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onFocusSearch) return;
    return window.clipDeck.onFocusSearch(() => {
      // Defer one frame so the show()-driven re-render commits before we
      // grab focus — otherwise the input may not be mounted yet.
      requestAnimationFrame(() => focusSearchInput());
    });
  }, [focusSearchInput]);

  // Reset the search query every time the overlay is re-shown. Once the
  // user has fired a search hit (or simply hides the panel), the next
  // time it pops up they should land back on the regular deck view —
  // no need to clear the search bar manually before using hotkeys
  // again. Selection index also clears so a fresh search starts clean.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onOpened) return;
    return window.clipDeck.onOpened(() => {
      setQuery("");
      setSearchSelectedIdx(0);
    });
  }, []);

  // New query → snap highlight back to the top. So Enter without any
  // arrow-key navigation always fires the best-ranked result.
  React.useEffect(() => { setSearchSelectedIdx(0); }, [query]);
  const [toast, setToast] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  // Which strip view is showing: "recent" | "mostused" | "clipboard".
  // Lifted out of RecentStrip so the App can choose which item list to
  // pass down — keeps RecentStrip a dumb presenter.
  const [stripMode, setStripMode] = React.useState("mostused");
  const [connected, setConnected] = React.useState(false);
  // Main panel view mode. "slots" (default) shows SearchResults/SlotGrid;
  // "cgfy" swaps in the CGfy AI tool; "tool" shows an empty placeholder
  // deck for an unlocked INTHEZONE Tools entry (Effects / SFX / Utility
  // Plugins / Youtube). Picking any library or deck returns to "slots".
  const [mainView, setMainView] = React.useState("slots");
  const [activeTool, setActiveTool] = React.useState(null);
  // Route rendered specifically for a global library/deck/tool hotkey.
  // It sits above the persisted config while the hotkey open is being
  // prepared, so the hidden window can draw the target deck before main
  // reveals it. Once the persisted state matches, the route is cleared
  // and the regular config-driven view carries on at the same target.
  const [instantRoute, setInstantRoute] = React.useState(null);
  const [instantNavActive, setInstantNavActive] = React.useState(false);
  const instantNavTimerRef = React.useRef(null);
  const instantRouteRef = React.useRef(null);
  instantRouteRef.current = instantRoute;
  React.useEffect(() => () => {
    if (instantNavTimerRef.current) clearTimeout(instantNavTimerRef.current);
  }, []);
  // Auto-test driver — when the flag file at STATE_DIR/_autotest.flag
  // is present at boot, main.js reads + consumes it and exposes the
  // value via clipDeck.getAutoTest(). We use it to drive Smart Paste /
  // Smart Anchor through their full flow from Bash without simulating
  // clicks. The flag is a plugin id ("smart-paste" / "smart-anchor").
  const [autoTest, setAutoTest] = React.useState(null);
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.getAutoTest) return;
    window.clipDeck.getAutoTest().then((v) => {
      if (!v) return;
      setAutoTest(v);
      setMainView("tool");
      setActiveTool("Utility Plugins");
    }).catch(() => {});
  }, []);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [editingNameIndex, setEditingNameIndex] = React.useState(null);
  // Inline-rename state for the sidebar libraries and topbar deck tabs.
  const [editingLibIndex, setEditingLibIndex] = React.useState(null);
  const [editingDeckIndex, setEditingDeckIndex] = React.useState(null);
  // Right-click context menus for libraries (sidebar) and decks (topbar).
  const [libContextMenu, setLibContextMenu]  = React.useState(null);
  const [deckContextMenu, setDeckContextMenu] = React.useState(null);
  // Right-click on an INTHEZONE Tool sidebar row — surfaces the
  // HotkeyContextMenu so the user can bind a shortcut to that tool.
  // Shape: { x, y, toolName } | null
  const [toolContextMenu, setToolContextMenu] = React.useState(null);
  // Refresh signals for embedded webview tools — incremented by the
  // sidebar's right-click → "Refresh" menu item. SfxBrowser /
  // YoutubeBrowser watch their respective counter and call
  // webviewRef.current.loadURL(HOME_URL) when it changes, taking the
  // user back to the tool's home page without dropping the webview's
  // mount (preserves cookies, partition state, etc.).
  const [pixabayRefreshSignal, setPixabayRefreshSignal] = React.useState(0);
  const [youtubeRefreshSignal, setYoutubeRefreshSignal] = React.useState(0);
  // Generic confirm dialog state — used today only for library deletion.
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  // Paywall modal state. `null` when closed; `{ feature }` to open. The
  // feature string ("library" | "deck" | "search" | "recents" | "tools" |
  // "hotkeys" | "import") highlights the matching row in the modal so the
  // user sees exactly which Pro perk they bumped into.
  const [paywall, setPaywall] = React.useState(null);
  // Attribute Picker modal state. `null` when closed.
  // Open shape: { targetIndex, available, selection }
  //   available = { isVideo, isAudio, video?:{motion,opacity,...,effectNames}, audio?:{...} }
  //   selection = same key set as the picker checkboxes, all true by default
  // Accessibility-denied modal — main fires "accessibility:denied" when
  // osascript hits a 1002 error (no Accessibility permission). The modal
  // explains the fix in plain English and offers an "Open Settings" CTA
  // that deep-links to System Settings → Privacy & Security → Accessibility.
  const [accessDenied, setAccessDenied] = React.useState(false);
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onAccessibilityDenied) return;
    return window.clipDeck.onAccessibilityDenied(() => setAccessDenied(true));
  }, []);

  // ── App update state ─────────────────────────────────────────────
  // updateManifest: the JSON returned by /updates/latest when a new
  // version is available. Drives the UpdateBanner at the top of the
  // overlay.
  // updateState.phase: idle | downloading | verifying | opening | error
  // updateState.progress: { received, total } during downloading
  const [updateManifest, setUpdateManifest] = React.useState(null);
  const [updateState, setUpdateState] = React.useState({ phase: "idle", progress: null, error: null });

  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onUpdateAvailable) return;
    return window.clipDeck.onUpdateAvailable((manifest) => {
      setUpdateManifest(manifest);
    });
  }, []);

  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onUpdateProgress) return;
    return window.clipDeck.onUpdateProgress((payload) => {
      setUpdateState((s) => ({ ...s, progress: payload }));
    });
  }, []);

  const startUpdate = React.useCallback(async () => {
    if (!updateManifest) return;
    setUpdateState({ phase: "downloading", progress: null, error: null });
    try {
      const dl = await window.clipDeck.downloadUpdate(updateManifest);
      if (!dl || !dl.ok) {
        setUpdateState({ phase: "error", progress: null,
          error: (dl && dl.error) || "Download failed." });
        return;
      }
      setUpdateState({ phase: "verifying", progress: null, error: null });
      // Brief verifying-state pause for the user to see the step name.
      await new Promise((r) => setTimeout(r, 250));
      setUpdateState({ phase: "opening", progress: null, error: null });
      await window.clipDeck.installUpdate(dl.pkgPath);
      // Main will quit ~1.5s after this resolves; the modal stays up
      // until the renderer dies with the app, which is fine.
    } catch (e) {
      setUpdateState({ phase: "error", progress: null,
        error: String(e && e.message || e) });
    }
  }, [updateManifest]);

  const snoozeUpdate = React.useCallback(() => {
    // Hide the banner for 7 days. State only — the next update-check
    // poll will surface a fresh banner if there's a newer version,
    // since the manifest comparison is against app.getVersion().
    setUpdateManifest(null);
    setConfig((prev) => ({
      ...prev,
      tweaks: { ...prev.tweaks, updateSnoozeUntil: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    }));
  }, []);

  // Auto-import a .cdk file opened externally (Finder double-click,
  // Explorer double-click, drag onto app icon, command-line path on
  // launch). Main has already read + parsed the file and restored
  // inlined clipboard captures into the local captures dir; we just
  // append the library to config and switch to it.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onCdkImported) return;
    return window.clipDeck.onCdkImported((payload) => {
      if (!payload || !payload.ok) {
        setToast("Import failed: " + ((payload && payload.error) || "no detail"));
        return;
      }
      const lib = payload.value && payload.value.library;
      if (!lib) { setToast("Import failed: empty file"); return; }
      setConfig((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        next.libraries = next.libraries || [];
        next.libraries.push(lib);
        next.activeLibraryIndex = next.libraries.length - 1;
        next.activeDeckIndex = 0;
        return next;
      });
      const restored = (payload.value && payload.value.capturesRestored) || 0;
      setToast(`Imported "${lib.name}" ✓` + (restored > 0 ? ` · ${restored} clipboard capture${restored === 1 ? "" : "s"} restored` : ""));
    });
  }, []);
  // Preferences popover (gear icon in the brand row). `insertMode` is
  // persisted in `tweaks.insertMode` (DEFAULT = "smart"). It controls
  // both file/sequence and clipboard-capture fires:
  //
  // File / sequence slots (call into the CEP backend's overwriteClip):
  //   "smart" → Client.smartOverwriteAt — finds the lowest empty track
  //             at the playhead with collision detection, auto-adds a
  //             new track if everything's full.
  //   "track" → Client.overwriteAt — overwrites at the user's currently
  //             targeted track (the arrow icon on each track header).
  //
  // Clipboard slots (call into Electron main → main.js does the paste):
  //   "smart" → wake → set V+A targets exclusively → Edit > Paste menu
  //             (which honors Track Target in PPro 26) → restore targets.
  //   "track" → wake → no target manipulation → Edit > Paste menu. Lands
  //             on whatever the user has the arrow-target on.
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  // Migrate legacy "source" → "track" so users who picked Source Patching
  // before we removed it don't get a phantom selection.
  const rawInsertMode = (config && config.tweaks && config.tweaks.insertMode) || "smart";
  const insertMode = (rawInsertMode === "source") ? "track" : rawInsertMode;
  const setInsertMode = (mode) => {
    setConfig((prev) => prev ? ({
      ...prev,
      tweaks: { ...(prev.tweaks || {}), insertMode: mode }
    }) : prev);
  };
  // License state — populated by <LicenseProvider> wrapper on the React
  // root. We pull `isPro` to drive gating decisions; `openCheckout` runs
  // when the badge's "Upgrade" CTA fires. window.useLicense is set by
  // license.jsx (loaded before this file in index.html).
  const license = window.useLicense ? window.useLicense() : { isPro: false, openCheckout: () => {} };

  // Resolve plugin-shim URL + CEP bridge port once at App level so
  // PluginBackgroundHost can mount immediately. The backgrounds need
  // to live as long as Clip Deck is running so the helper-binary HTTP
  // bridge keeps responding even when the user is on a different tab
  // or has the overlay hidden.
  const [pluginShimUrl, setPluginShimUrl] = React.useState(null);
  const [pluginCepPort, setPluginCepPort] = React.useState(null);
  React.useEffect(() => {
    if (!window.clipDeck) return;
    const a = window.clipDeck.getPluginShimUrl ? window.clipDeck.getPluginShimUrl() : Promise.resolve(null);
    const b = window.clipDeck.backendPort ? window.clipDeck.backendPort() : Promise.resolve(47291);
    Promise.all([a, b]).then(([url, port]) => {
      setPluginShimUrl(url || null);
      setPluginCepPort(port || 47291);
    }).catch(() => {});
  }, []);

  // The set of plugins whose backgrounds should be mounted at App
  // level. Today: every owned plugin in "my" section with a bgEntry.
  // Gating on isPro keeps the backgrounds off for Free users (they
  // can't toggle anything that would use them anyway).
  const ownedPlugins = React.useMemo(() =>
    PLUGIN_CATALOGUE.filter((p) => p.section === "my" && p.bgEntry && (license && license.isPro)),
    [license && license.isPro]
  );
  // Hotkey-rebinder record modes — when true, the next non-modifier
  // keypress becomes the matching global hotkey (Esc cancels).
  const [recordingHotkey, setRecordingHotkey] = React.useState(false);
  const [recordingSearchHotkey, setRecordingSearchHotkey] = React.useState(false);
  // Index of the slot currently being captured from the timeline. Drives the
  // loading-shimmer overlay on that tile so the user knows the capture is
  // in progress (the panel intentionally stays open during capture).
  const [capturingIndex, setCapturingIndex] = React.useState(null);
  // Full coords of the slot the user is currently dragging. Captured at
  // drag-start so we can support cross-library drops (the active library
  // can change mid-drag via the dwell-to-switch behaviour on sidebar rows).
  // Shape: { libIdx, deckIdx, slotIdx, srcSnapshot } or null. srcSnapshot
  // is a copy of the slot's content fields, used for the swap preview when
  // the destination is in a different library and the source tile isn't
  // visible to clone its DOM.
  const [dragSource, setDragSource] = React.useState(null);

  // Initial load.
  React.useEffect(() => {
    (async () => {
      const c = await ClipDeckStore.load();
      setConfig(c);
    })();
  }, []);

  // Persist whenever config changes.
  React.useEffect(() => {
    if (!config) return;
    ClipDeckStore.save(config);
  }, [config]);

  // Connection watchdog.
  React.useEffect(() => {
    const id = Client.startWatchdog((isUp) => setConnected(isUp));
    return () => clearInterval(id);
  }, []);

  // Toast auto-dismiss.
  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // Pre-warm the browser image cache for every thumbnail in every library +
  // deck. Without this, switching to a populated library makes 40 tiles fetch
  // + decode their image at once, and each tile flashes empty for a frame or
  // two. With this, those URLs are already decoded in the browser cache, so
  // setting an <img src=…> on a tile renders instantly.
  //
  // Each unique URL is preloaded once per session (tracked via ref). Calling
  // .decode() after .src forces the browser to actually decode (not just
  // download) the bytes, which is what makes the later render free.
  const preloadedThumbsRef = React.useRef(new Set());
  React.useEffect(() => {
    if (!config) return;
    const urls = [];
    (config.libraries || []).forEach((lib) => {
      (lib.decks || []).forEach((deck) => {
        (deck.slots || []).forEach((slot) => {
          if (slot.customThumb && slot.thumb) urls.push(slot.thumb);
          else if ((slot.kind === "image" || fileKind(slot.path) === "image") && slot.path) urls.push(pathToFileUrl(slot.path));
          else if ((slot.kind === "video" || slot.kind === "clipboard") && slot.thumb) urls.push(slot.thumb);
        });
      });
    });
    urls.forEach((url) => {
      if (!url || preloadedThumbsRef.current.has(url)) return;
      preloadedThumbsRef.current.add(url);
      const img = new Image();
      img.src = url;
      // .decode() resolves when the image is both fetched and decoded; we
      // don't await it (fire-and-forget) and swallow errors silently —
      // missing thumbnails just fall through to the on-demand path.
      if (typeof img.decode === "function") img.decode().catch(() => {});
    });
  }, [config]);

  // Drag-end safety net. When the user dwells over a different library row
  // mid-drag, the active library switches and the source SlotTile unmounts —
  // its local onDragEnd handler is gone with it, so HTML5's dragend has no
  // listener to dispatch on. Without this, dragSource never clears and the
  // original slot stays stuck in the .dragging visual after the drop.
  React.useEffect(() => {
    if (!dragSource) return;
    const reset = () => { setDragSource(null); cancelSwapPreview(); };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [dragSource]);

  // Re-focus the window when Electron tells us we just opened.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onOpened) return;
    return window.clipDeck.onOpened(() => {
      // The window already has focus by the time this fires; this is a hook
      // for future "play a fade animation" or "reset selection."
    });
  }, []);

  // Reset every transient piece of UI the moment the BrowserWindow loses
  // focus — modals, menus, hotkey-recording mode, focused inputs. Goal:
  // the very next show always returns the user to a clean cards view, not
  // whatever popup or focus state they left behind.
  //
  // Why `window.blur` and not an IPC "overlay:hidden" event from main.js:
  // IPC delivery is async, so a fast hide → show round trip can re-display
  // the window before the renderer has processed the reset, leaving the
  // old modal visible for one frame. `blur` is a synchronous DOM event
  // that fires the instant the window loses focus (which always happens
  // before / coincident with hide), so the state is already reset by the
  // time any subsequent paint runs.
  //
  // Search *query* is intentionally preserved (only focus is dropped) —
  // clearing it on every blur would discard a deliberate filter the user
  // briefly tabbed away from.
  React.useEffect(() => {
    const onWindowBlur = () => {
      setPaywall(null);
      setPrefsOpen(false);
      setPalOpen(false);
      setContextMenu(null);
      setLibContextMenu(null);
      setDeckContextMenu(null);
      setConfirmDialog(null);
      setRecordingHotkey(false);
      const a = document.activeElement;
      if (a && a !== document.body && typeof a.blur === "function") a.blur();
    };
    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  // Derived view (safe with null config — UI guards below).
  const accent = ACCENTS[(config && config.tweaks.accent) || "blue"];
  const palette = PALETTES[(config && config.tweaks.palette) || "graphite"];
  const libraries = config ? (config.libraries || []) : [];
  const clampRouteIndex = (value, length) => {
    const n = Number(value);
    if (!length || isNaN(n) || n < 0) return 0;
    if (n >= length) return length - 1;
    return Math.floor(n);
  };
  const canonicalActiveLibraryIndex = config ? clampRouteIndex(config.activeLibraryIndex || 0, libraries.length) : 0;
  const displayMainView = instantRoute ? instantRoute.mainView : mainView;
  const displayActiveTool = instantRoute ? instantRoute.activeTool : activeTool;
  const activeLibraryIndex = instantRoute && instantRoute.libIdx != null
    ? clampRouteIndex(instantRoute.libIdx, libraries.length)
    : canonicalActiveLibraryIndex;
  const activeLibrary = libraries[activeLibraryIndex] || libraries[0] || null;
  const decks = activeLibrary ? (activeLibrary.decks || []) : [];
  const canonicalActiveDeckIndex = config ? clampRouteIndex(config.activeDeckIndex || 0, decks.length) : 0;
  const activeDeckIndex = instantRoute && instantRoute.deckIdx != null
    ? clampRouteIndex(instantRoute.deckIdx, decks.length)
    : canonicalActiveDeckIndex;
  const activeDeck = decks[activeDeckIndex] || decks[0] || null;
  const slots = activeDeck ? activeDeck.slots : [];

  // Curated INTHEZONE Tools deck registry. Each tool has its OWN list
  // of decks, independent from the user's library decks. Reading from
  // here in tool view keeps the Topbar deck tabs + Add Deck control +
  // pickDeck routing scoped to the tool — picking or adding a deck in
  // tool view does NOT mutate any user library. Slot arrays are
  // memoised so React doesn't churn tiles on view switches.
  const effectsDeck1Slots = React.useMemo(() => buildEffectSlotsFromNames(EFFECT_PRESETS_DECK_1, 0),   []);
  const effectsDeck2Slots = React.useMemo(() => buildEffectSlotsFromNames(EFFECT_PRESETS_DECK_2, 180), []);
  const effectsDeck3Slots = React.useMemo(() => buildEffectSlotsFromNames(EFFECT_PRESETS_DECK_3, 90),  []);
  const audioDeck1Slots   = React.useMemo(() => buildEffectSlotsFromNames(AUDIO_PRESETS_DECK_1,  45,  { audio: true }), []);
  const audioDeck2Slots   = React.useMemo(() => buildEffectSlotsFromNames(AUDIO_PRESETS_DECK_2,  225, { audio: true }), []);
  // Transition decks — start each at hueOffset 156 (close to INTHEZONE
  // mint) so the first cards land in green territory and trail through
  // the colour wheel. Built via buildTransitionSlotsFromNames so the
  // recipe components are tagged kind: "transition" and route through
  // the pref-based apply flow in main.js.
  const videoTransDeck1Slots = React.useMemo(() => buildTransitionSlotsFromNames(VIDEO_TRANSITIONS_DECK_1, 156), []);
  const videoTransDeck2Slots = React.useMemo(() => buildTransitionSlotsFromNames(VIDEO_TRANSITIONS_DECK_2, 156), []);
  const emptyToolSlots = React.useMemo(() => ClipDeckStore.emptySlots(), []);
  // Apply user-customized order (config.toolDeckOrder[deckKey]) on top
  // of a curated deck's original slot array. Tool decks are read-only
  // by content but reorderable — users can swap two slots and the new
  // order persists across launches.
  //
  // Order entries are either:
  //   - a number: original index into THIS deck's slot pool
  //   - { deck, idx }: cross-deck reference — used when the user swaps
  //     a card from a different deck within the same tool (Transitions
  //     deck 1 ↔ Transitions deck 2). The cross-ref carries the source
  //     deck key + original index so applyToolOrder can look it up in
  //     `toolPools` regardless of which deck is currently rendering.
  // Missing or stale entries fall back to identity, so adding/removing
  // curated cards never breaks an old saved order.
  const toolPools = React.useMemo(() => ({
    "Effects:1": effectsDeck1Slots,
    "Effects:2": effectsDeck2Slots,
    "Effects:3": effectsDeck3Slots,
    "Effects:4": audioDeck1Slots,
    "Effects:5": audioDeck2Slots,
    "Transitions:1": videoTransDeck1Slots,
    "Transitions:2": videoTransDeck2Slots,
  }), [effectsDeck1Slots, effectsDeck2Slots, effectsDeck3Slots, audioDeck1Slots, audioDeck2Slots, videoTransDeck1Slots, videoTransDeck2Slots]);
  const toolDeckOrders = (config && config.toolDeckOrder) || {};
  const applyToolOrder = React.useCallback((deckKey, origSlots) => {
    const order = toolDeckOrders[deckKey];
    if (!Array.isArray(order) || order.length !== origSlots.length) return origSlots;
    return order.map((entry, i) => {
      let resolved;
      if (typeof entry === "number") resolved = origSlots[entry] || origSlots[i];
      else if (entry && typeof entry === "object" && entry.deck && typeof entry.idx === "number") {
        const pool = toolPools[entry.deck];
        resolved = (pool && pool[entry.idx]) || origSlots[i];
      } else resolved = origSlots[i];
      // Hotkey labels stay tied to grid POSITION, not to the card itself.
      // The curated source slot had its `key` baked in at the original
      // index; rebind it to position i so muscle memory stays intact
      // after swaps + cross-deck reorders. origSlots[i].key === KEYMAP[i]
      // by construction so we can pull it from there without importing
      // KEYMAP directly into this scope.
      const positionalKey = origSlots[i] && origSlots[i].key;
      if (resolved && positionalKey && resolved.key !== positionalKey) {
        return Object.assign({}, resolved, { key: positionalKey });
      }
      return resolved;
    });
  }, [toolDeckOrders, toolPools]);
  const toolDecksByName = React.useMemo(() => ({
    // `name` is the short display label shown in the deck-tab strip.
    // `key` is the stable swap-order identifier (scoped by tool so the
    // numeric names don't collide across Effects + Transitions).
    "Effects": [
      { name: "1", key: "Effects:1", slots: applyToolOrder("Effects:1", effectsDeck1Slots) },
      { name: "2", key: "Effects:2", slots: applyToolOrder("Effects:2", effectsDeck2Slots) },
      { name: "3", key: "Effects:3", slots: applyToolOrder("Effects:3", effectsDeck3Slots) },
      { name: "4", key: "Effects:4", slots: applyToolOrder("Effects:4", audioDeck1Slots) },
      { name: "5", key: "Effects:5", slots: applyToolOrder("Effects:5", audioDeck2Slots) },
    ],
    // Transitions — same architecture as Effects (curated, read-only,
    // 40-slot decks; cards drag-copy out to user libraries).
    // CSS slug picks up the green gradient on .cd-tool-view--transitions.
    "Transitions": [
      { name: "1", key: "Transitions:1", slots: applyToolOrder("Transitions:1", videoTransDeck1Slots) },
      { name: "2", key: "Transitions:2", slots: applyToolOrder("Transitions:2", videoTransDeck2Slots) },
    ],
    // Pixabay uses the embedded sound-effects browser instead of a
    // slot grid — no decks register here, so the Topbar shows no
    // deck tabs for it.
    "Pixabay":         [],
    // Utility Plugins and Youtube are single-page panels — no decks
    // are registered so the Topbar shows no deck tabs for them.
    "Utility Plugins": [],
    "Youtube":         [],
  }), [effectsDeck1Slots, effectsDeck2Slots, effectsDeck3Slots, audioDeck1Slots, audioDeck2Slots, videoTransDeck1Slots, videoTransDeck2Slots, emptyToolSlots, applyToolOrder]);

  // Active deck inside the current tool. Tracked separately from the
  // user-library deck index. Reset to 0 when the user hops between
  // tools so e.g. "Effects deck 2" doesn't carry over to SFX.
  const [toolDeckIndex, setToolDeckIndex] = React.useState(0);
  React.useEffect(() => {
    if (mainView === "tool") setToolDeckIndex(0);
  }, [activeTool, mainView]);

  // Topbar input. In tool view the deck tabs/active index come from
  // the tool's own deck registry — adding/picking/renaming a deck in
  // tool view never touches a user library.
  const toolDecks   = (displayActiveTool && toolDecksByName[displayActiveTool]) || [];
  const toolActiveDeck = toolDecks[toolDeckIndex] || toolDecks[0] || null;
  const toolActiveSlots = toolActiveDeck ? toolActiveDeck.slots : emptyToolSlots;
  const topbarDecks            = displayMainView === "tool" ? toolDecks       : decks;
  const topbarActiveDeckIndex  = displayMainView === "tool" ? toolDeckIndex   : activeDeckIndex;

  // Most Used list — top 10 slots across EVERY library + deck, ranked
  // by persistent useCount. Global scope so the strip surfaces the
  // user's most-fired cards regardless of which library/deck is
  // active. Re-derived from config on every change so it stays in
  // sync as the user fires cards.
  const mostUsedItems = React.useMemo(() => {
    if (!libraries || !libraries.length) return [];
    // Free-tier: only library 0 / deck 0 is accessible. Cards in locked
    // decks must not surface in the strip — firing them via the strip's
    // click handler would bypass the access-time paywall.
    const freeLocked = !!window.PAYWALL_ENABLED && !(license && license.isPro);
    const out = [];
    libraries.forEach((lib, lIdx) => {
      if (!lib || !lib.decks) return;
      if (freeLocked && lIdx > 0) return;
      lib.decks.forEach((deck, dIdx) => {
        if (!deck || !deck.slots) return;
        if (freeLocked && dIdx > 0) return;
        deck.slots.forEach((s, sIdx) => {
          if (!s) return;
          const populated = s.path || s.nodeId || s.clipboardFile || s.effectRecipe;
          const count = s.useCount || 0;
          if (!populated || count <= 0) return;
          out.push({
            // Globally-unique id keyed by full coords so React keeps
            // the same tile mounted across re-derivations.
            id: "mu-" + lIdx + "-" + dIdx + "-" + sIdx,
            libIdx: lIdx,
            deckIdx: dIdx,
            slotIdx: sIdx,
            name: s.name || "Unnamed",
            tag: s.tag,
            hue: s.hue,
            peak: s.peak,
            path: s.path,
            nodeId: s.nodeId,
            kind: s.kind,
            thumb: s.thumb,
            customThumb: s.customThumb,
            customColor: s.customColor,
            clipboardFile: s.clipboardFile,
            effectRecipe: s.effectRecipe,
            attributeSelection: s.attributeSelection,
            capturedAttributes: s.capturedAttributes,
            preset: s.preset,
            audioOnly: s.audioOnly,
            captureSubtype: s.captureSubtype,
            // Carry useTextThumb so RecentTile can render the title-as-
            // thumb for curated Effect / Transition cards instead of
            // the generic FX sparkles glyph.
            useTextThumb: !!s.useTextThumb,
            useCount: count,
            lastUsedAt: s.lastUsedAt || 0
          });
        });
      });
    });
    out.sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      // Tiebreak: more recently used wins.
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
    });
    return out.slice(0, 10);
  }, [libraries, license && license.isPro]);

  // Recently Used is stored as a fire-time snapshot so it can still
  // re-fire cards after the user changes views. For library-backed
  // cards, rehydrate the visible face from the current source slot so
  // color/default-skin changes (especially Effect + Transition cards)
  // stay identical between the main grid, Recently Used, and Most Used.
  const recentDisplayItems = React.useMemo(() => {
    if (!recent || !recent.length) return [];
    // Free-tier: drop fires that came from locked user-library/deck
    // coords. Tool-deck fires carry libIdx < 0 (Effects + Transitions
    // are free) and pass through.
    const freeLocked = !!window.PAYWALL_ENABLED && !(license && license.isPro);
    const visible = freeLocked
      ? recent.filter((r) => !r || r.libIdx == null || r.libIdx < 0 || (r.libIdx === 0 && (r.deckIdx || 0) === 0))
      : recent;
    return visible.map((r) => {
      if (!r || r.libIdx == null || r.libIdx < 0) return r;
      const lib = libraries && libraries[r.libIdx];
      const deck = lib && lib.decks && lib.decks[r.deckIdx];
      const s = deck && deck.slots && deck.slots[r.slotIdx];
      if (!s) return r;
      return Object.assign({}, r, {
        slotKey: s.key || r.slotKey,
        name: s.name || r.name || "Unnamed",
        tag: s.tag,
        hue: s.hue,
        peak: s.peak,
        path: s.path,
        nodeId: s.nodeId,
        kind: s.kind,
        thumb: s.thumb,
        customThumb: s.customThumb,
        customColor: s.customColor,
        clipboardFile: s.clipboardFile,
        effectRecipe: s.effectRecipe,
        attributeSelection: s.attributeSelection,
        capturedAttributes: s.capturedAttributes,
        preset: s.preset,
        audioOnly: s.audioOnly,
        captureSubtype: s.captureSubtype,
        useTextThumb: !!s.useTextThumb
      });
    });
  }, [recent, libraries, license && license.isPro]);

  const updateSlot = (index, patch) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const li = next.activeLibraryIndex || 0;
      const pi = next.activeDeckIndex || 0;
      const s = next.libraries[li].decks[pi].slots[index];
      Object.assign(s, patch);
      return next;
    });
  };

  // Reset all type/content-discriminator fields on a slot. Capture paths
  // spread this first, then layer their own fields on top, so overwriting
  // a filled card (e.g. Save Clip onto a saved-attributes tile) cleanly
  // drops the prior tile's effectRecipe / capturedAttributes / useTextThumb
  // / thumb / etc. — preventing the tile from inheriting the old skin.
  // User decorations (tag, hue, customColor) are NOT cleared since those
  // feel like deck-position customizations, not per-clip metadata.
  const blankSlotContent = () => ({
    path: null,
    name: "",
    nodeId: null,
    kind: null,
    clipboardFile: null,
    capturedAt: null,
    captureBytes: null,
    thumb: null,
    customThumb: false,
    audioOnly: false,
    peak: null,
    captureSubtype: null,
    useTextThumb: false,
    effectRecipe: null,
    attributeSelection: null,
    capturedAttributes: false,
    preset: null,
  });

  // Bump the persistent fire-count on a slot. Called from fireSlot +
  // fireRecent after a successful apply/insert. Drives the Most Used
  // strip — slots are ranked by useCount across the active library.
  // Stored in config (on disk) so the count survives relaunches.
  const bumpUseCount = (libIdx, deckIdx, slotIdx) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const lib = next.libraries && next.libraries[libIdx];
      const deck = lib && lib.decks && lib.decks[deckIdx];
      const s = deck && deck.slots && deck.slots[slotIdx];
      if (!s) return prev;
      s.useCount = (s.useCount || 0) + 1;
      s.lastUsedAt = Date.now();
      return next;
    });
  };


  // ── Slot move + swap (works intra-library AND across libraries) ──────
  // All three operations (move, swap-preview arm, swap commit) take *full*
  // coords ({ libIdx, deckIdx, slotIdx }) so the user can drag a card from
  // one library, dwell over a different library row in the sidebar to
  // switch active libraries mid-drag, then drop into a slot in the new one.
  // Fields copied when a slot is dragged / moved / swapped in memory.
  // MUST stay in sync with store.js's applySavedSlot whitelist —
  // anything user-visible here also needs to persist on relaunch.
  // Adding a field here without adding it there silently wipes the
  // field on the next quit→reopen (which is exactly how customColor
  // + effectRecipe + useCount kept getting reset before 2026-05-26).
  const TRANSFER_FIELDS = ["path","name","tag","hue","peak","nodeId","kind","clipboardFile","capturedAt","captureBytes","thumb","customThumb","customColor","audioOnly","captureSubtype","effectRecipe","attributeSelection","capturedAttributes","useCount","lastUsedAt","preset","useTextThumb"];

  const sameCoords = (a, b) => a && b && a.libIdx === b.libIdx && a.deckIdx === b.deckIdx && a.slotIdx === b.slotIdx;

  const slotAt = (cfg, c) => {
    if (!cfg || !c) return null;
    const lib = cfg.libraries && cfg.libraries[c.libIdx];
    if (!lib) return null;
    const deck = lib.decks && lib.decks[c.deckIdx];
    if (!deck) return null;
    return deck.slots && deck.slots[c.slotIdx];
  };

  // Live swap-preview state. While set, the SlotGrid visually swaps the
  // displayed contents of the dest tile so the user sees what would happen
  // before committing. Data only changes on drop. Now coord-based to support
  // cross-library swaps; if srcCoords is in a different library than the
  // active one, the source tile isn't visible — `srcSnapshot` carries the
  // source slot's content fields so the destination preview can still render.
  const [swapPreview, setSwapPreview] = React.useState(null);

  const armSwapPreview = (srcCoords, dstCoords) => {
    if (sameCoords(srcCoords, dstCoords)) return;
    if (!srcCoords || !dstCoords) return;
    const srcSlot = slotAt(config, srcCoords);
    if (!srcSlot) return;
    const srcSnapshot = {};
    TRANSFER_FIELDS.forEach((f) => { srcSnapshot[f] = srcSlot[f]; });
    setSwapPreview({ srcCoords, dstCoords, srcSnapshot });
  };
  const cancelSwapPreview = () => setSwapPreview(null);

  // Swap two slots' content in place — works across libraries / decks.
  // Used both by the dwell-arm preview's commit AND by drop-on-populated
  // (immediate swap, no overwrite). Also rewrites Recently Used entries
  // for either endpoint so the recent strip keeps tracking the right
  // physical slot after the swap.
  const swapSlotsByCoords = (srcCoords, dstCoords) => {
    if (sameCoords(srcCoords, dstCoords)) return;
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const a = slotAt(next, srcCoords), b = slotAt(next, dstCoords);
      if (!a || !b) return prev;
      TRANSFER_FIELDS.forEach((f) => {
        const tmp = a[f]; a[f] = (b[f] !== undefined ? b[f] : null); b[f] = (tmp !== undefined ? tmp : null);
      });
      return next;
    });
    setRecent((prev) => prev.map((r) => {
      if (r.libIdx === srcCoords.libIdx && r.deckIdx === srcCoords.deckIdx && r.slotIdx === srcCoords.slotIdx) {
        return {
          ...r,
          id: "rc-" + dstCoords.libIdx + "-" + dstCoords.deckIdx + "-" + dstCoords.slotIdx,
          libIdx: dstCoords.libIdx, deckIdx: dstCoords.deckIdx, slotIdx: dstCoords.slotIdx,
        };
      }
      if (r.libIdx === dstCoords.libIdx && r.deckIdx === dstCoords.deckIdx && r.slotIdx === dstCoords.slotIdx) {
        return {
          ...r,
          id: "rc-" + srcCoords.libIdx + "-" + srcCoords.deckIdx + "-" + srcCoords.slotIdx,
          libIdx: srcCoords.libIdx, deckIdx: srcCoords.deckIdx, slotIdx: srcCoords.slotIdx,
        };
      }
      return r;
    }));
  };
  const commitSwapPreview = () => {
    if (!swapPreview) return;
    const { srcCoords, dstCoords } = swapPreview;
    setSwapPreview(null);
    swapSlotsByCoords(srcCoords, dstCoords);
  };

  // Move = source content goes into destination, destination's prior content
  // (incl. on-disk capture/thumb files) is destroyed. Source becomes empty.
  // Works across libraries.
  const moveSlotByCoords = (srcCoords, dstCoords) => {
    if (sameCoords(srcCoords, dstCoords)) return;
    // Dispose of destination's existing capture/thumb files outside the
    // reducer (their paths come from live state, not the next snapshot).
    const dstNow = slotAt(config, dstCoords);
    if (dstNow && dstNow.clipboardFile && window.clipDeck && window.clipDeck.deleteCapture) {
      try { window.clipDeck.deleteCapture(dstNow.clipboardFile).catch(() => {}); } catch (e) {}
    }
    if (dstNow && dstNow.thumbFile && window.clipDeck && window.clipDeck.deleteCapture) {
      try { window.clipDeck.deleteCapture(dstNow.thumbFile).catch(() => {}); } catch (e) {}
    }
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const src = slotAt(next, srcCoords);
      const dst = slotAt(next, dstCoords);
      if (!src || !dst) return prev;
      TRANSFER_FIELDS.forEach((k) => { dst[k] = (src[k] !== undefined ? src[k] : null); });
      // Reset source: clear content + restore default hue for the position.
      src.path = null; src.name = null; src.tag = null;
      src.nodeId = null; src.kind = null;
      src.clipboardFile = null; src.capturedAt = null; src.captureBytes = null;
      src.thumb = null; src.customThumb = false;
      // Effect-card fields — must also clear so the source slot fully
      // empties after a move-and-drop. Without these, the source still
      // has the recipe attached and renders as a half-empty card.
      src.effectRecipe = null; src.attributeSelection = null;
      // Preset / text-thumb markers travel with the card via TRANSFER_FIELDS;
      // strip them off the source too, otherwise the now-empty slot keeps
      // its locked right-click menu (Save Clips / Rename / etc. all greyed).
      src.preset = false;
      src.useTextThumb = false;
      // useCount + lastUsedAt move WITH the card (transferred above),
      // so reset src's so it doesn't double-count toward Most Used.
      src.useCount = 0;
      src.lastUsedAt = null;
      src.hue = (srcCoords.slotIdx * 47) % 360;
      src.peak = 0.5;
      return next;
    });
    // Rewrite any Recently Used entries pointing at the source coords
    // so they follow the card to its new home. Re-firing from the
    // recent strip then bumps the correct slot's useCount.
    setRecent((prev) => prev.map((r) => {
      if (r.libIdx === srcCoords.libIdx && r.deckIdx === srcCoords.deckIdx && r.slotIdx === srcCoords.slotIdx) {
        return {
          ...r,
          id: "rc-" + dstCoords.libIdx + "-" + dstCoords.deckIdx + "-" + dstCoords.slotIdx,
          libIdx: dstCoords.libIdx,
          deckIdx: dstCoords.deckIdx,
          slotIdx: dstCoords.slotIdx,
        };
      }
      return r;
    }));
  };

  // Drop a tool-source slot snapshot into a user library coord. Unlike
  // moveSlotByCoords this is a COPY — the tool deck (a curated read-only
  // registry) never mutates. The destination always wins (overwrites
  // whatever was there). The "preset" + "useTextThumb" markers travel
  // with the copy so the rendered tile keeps the text-thumbnail look and
  // the right-click menu can suppress Rename / Save Clips / Save
  // Attributes / Choose thumbnail for these cards.
  const copyToolSlotToCoords = (srcSnapshot, dstCoords) => {
    if (!srcSnapshot || !dstCoords) return;
    // Dispose of destination's existing files first (their paths come
    // from the live state, not the next snapshot).
    const dstNow = slotAt(config, dstCoords);
    if (dstNow && dstNow.clipboardFile && window.clipDeck && window.clipDeck.deleteCapture) {
      try { window.clipDeck.deleteCapture(dstNow.clipboardFile).catch(() => {}); } catch (e) {}
    }
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const dst = slotAt(next, dstCoords);
      if (!dst) return prev;
      TRANSFER_FIELDS.forEach((k) => {
        dst[k] = (srcSnapshot[k] !== undefined ? srcSnapshot[k] : null);
      });
      dst.useCount = 0;
      dst.lastUsedAt = null;
      dst.preset = true;
      return next;
    });
  };

  // The current active-deck coords (computed once for use in the tile drop
  // callbacks below). Re-derived per render so they stay current after the
  // user dwells over a library row to switch active library mid-drag.
  const activeCoords = (slotIdx) => ({
    libIdx: activeLibraryIndex,
    deckIdx: activeDeckIndex,
    slotIdx
  });

  // SlotTile-friendly handlers — they only know their own slot index, so we
  // pair it with the active-deck coords for dst, and with the dragSource
  // coords (set at drag start) for src.
  //
  // The overwrite/replace path is gone: dropping on a populated slot
  // always swaps the two slots' contents. Dropping on an empty slot
  // still moves (there's nothing to swap with). Tool-sourced drags
  // are unchanged — those copy into the destination because the tool
  // deck is read-only.
  const onTileMove = (dstSlotIdx) => {
    if (!dragSource) return;
    if (dragSource.kind === "tool") {
      copyToolSlotToCoords(dragSource.slotSnapshot, activeCoords(dstSlotIdx));
      return;
    }
    const srcCoords = { libIdx: dragSource.libIdx, deckIdx: dragSource.deckIdx, slotIdx: dragSource.slotIdx };
    const dstCoords = activeCoords(dstSlotIdx);
    const dst = slotAt(config, dstCoords);
    const dstIsEmpty = !dst || (!dst.path && !dst.nodeId && !dst.clipboardFile && !dst.effectRecipe);
    if (dstIsEmpty) {
      moveSlotByCoords(srcCoords, dstCoords);
    } else {
      swapSlotsByCoords(srcCoords, dstCoords);
    }
  };
  const onTileArmSwap = (dstSlotIdx) => {
    if (!dragSource) return;
    // Tool sources DO swap when the destination is another slot in the
    // same tool deck — that's how users reorder curated Effects /
    // Transitions cards. The tool-deck swap path lives separately on
    // ToolPlaceholder (it persists to config.toolDeckOrder); the regular
    // library swap path below is for cross-library / same-library
    // swaps only.
    if (dragSource.kind === "tool") return;
    armSwapPreview(
      { libIdx: dragSource.libIdx, deckIdx: dragSource.deckIdx, slotIdx: dragSource.slotIdx },
      activeCoords(dstSlotIdx)
    );
  };

  // ── Tool-deck reordering ─────────────────────────────────────────────
  // Curated Effects + Transitions cards are content-locked but the user
  // can rearrange them — including cross-deck swaps within the same
  // tool (e.g. drag a Transitions:1 card into Transitions:2 via the
  // dwell-switch tab hover). Permutations persist under
  // config.toolDeckOrder[deckKey] as arrays of either numeric indices
  // (identity refs into the deck's own pool) or { deck, idx } refs to
  // another deck's pool. applyToolOrder above resolves both shapes.
  const [toolSwapPreview, setToolSwapPreview] = React.useState(null);
  const onToolArmSwap = React.useCallback((dstDeckKey, deckLen, dstSlotIdx) => {
    if (!dragSource || dragSource.kind !== "tool") return;
    const srcDeckKey = dragSource.srcDeckKey || dstDeckKey;
    const crossDeck = srcDeckKey !== dstDeckKey;
    // Same-slot in same deck = no-op. Same-slot across decks is fine
    // (you can swap Transitions:1 slot 5 into Transitions:2 slot 5).
    if (!crossDeck && dragSource.slotIdx === dstSlotIdx) return;
    setToolSwapPreview({
      srcDeckKey,
      dstDeckKey,
      srcSlotIdx: dragSource.slotIdx,
      dstSlotIdx,
      deckLen,
      // srcCoords.deckIdx flips to -2 for cross-deck so SlotGrid's
      // overlay logic doesn't draw the source ghost in the destination
      // deck's view (it'd point at a tile that isn't actually the
      // source). dstCoords stays on -1/-1 so the destination tile gets
      // the standard wiggle + content preview from srcSnapshot.
      srcCoords: { libIdx: -1, deckIdx: crossDeck ? -2 : -1, slotIdx: dragSource.slotIdx },
      dstCoords: { libIdx: -1, deckIdx: -1, slotIdx: dstSlotIdx },
      srcSnapshot: dragSource.slotSnapshot
    });
  }, [dragSource]);
  const onToolCancelSwap = React.useCallback(() => setToolSwapPreview(null), []);

  // Shared swap-write — used by both the preview-commit path (when the
  // user lingers on a destination tile and the dwell-arm preview fires
  // first) and the instant-drop path (the user-library-parity move
  // handler below). Single source of truth so the same-deck reorder +
  // cross-deck wrap-as-{deck,idx} logic only lives in one place.
  const writeToolSwap = React.useCallback((srcDeckKey, dstDeckKey, srcSlotIdx, dstSlotIdx, deckLen) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.toolDeckOrder) next.toolDeckOrder = {};
      const readOrder = (key) => (
        Array.isArray(next.toolDeckOrder[key]) && next.toolDeckOrder[key].length === deckLen
          ? next.toolDeckOrder[key].slice()
          : Array.from({ length: deckLen }, (_, i) => i)
      );
      if (srcDeckKey === dstDeckKey) {
        const order = readOrder(srcDeckKey);
        [order[srcSlotIdx], order[dstSlotIdx]] = [order[dstSlotIdx], order[srcSlotIdx]];
        next.toolDeckOrder[srcDeckKey] = order;
      } else {
        // Cross-deck: wrap any bare numeric entry as a { deck, idx } ref
        // so applyToolOrder can resolve which pool the slot came from
        // after the swap has crossed deck boundaries.
        const wrap = (entry, originKey) => (
          typeof entry === "number" ? { deck: originKey, idx: entry } : entry
        );
        const srcOrder = readOrder(srcDeckKey);
        const dstOrder = readOrder(dstDeckKey);
        const a = wrap(srcOrder[srcSlotIdx], srcDeckKey);
        const b = wrap(dstOrder[dstSlotIdx], dstDeckKey);
        srcOrder[srcSlotIdx] = b;
        dstOrder[dstSlotIdx] = a;
        next.toolDeckOrder[srcDeckKey] = srcOrder;
        next.toolDeckOrder[dstDeckKey] = dstOrder;
      }
      return next;
    });
  }, []);

  const onToolCommitSwap = React.useCallback(() => {
    if (!toolSwapPreview) return;
    const { srcDeckKey, dstDeckKey, srcSlotIdx, dstSlotIdx, deckLen } = toolSwapPreview;
    setToolSwapPreview(null);
    writeToolSwap(srcDeckKey, dstDeckKey, srcSlotIdx, dstSlotIdx, deckLen);
  }, [toolSwapPreview, writeToolSwap]);

  // Instant cross-deck swap — wired as SlotGrid's `onMoveSlot` for tool
  // decks. SlotTile.onDrop calls this when the user drops on a tool
  // tile WITHOUT waiting for the 700 ms dwell preview to arm, so drops
  // always commit instantly. The dwell preview becomes a pure visual
  // cue (no longer a swap prerequisite), matching the main panel.
  const onToolMoveSlot = React.useCallback((dstDeckKey, deckLen, dstSlotIdx) => {
    if (!dragSource || dragSource.kind !== "tool") return;
    const srcDeckKey = dragSource.srcDeckKey || dstDeckKey;
    const srcSlotIdx = dragSource.slotIdx;
    if (srcDeckKey === dstDeckKey && srcSlotIdx === dstSlotIdx) return;
    setToolSwapPreview(null);
    writeToolSwap(srcDeckKey, dstDeckKey, srcSlotIdx, dstSlotIdx, deckLen);
  }, [dragSource, writeToolSwap]);

  // ── Library actions ──────────────────────────────────────────────────
  const pickLibrary = (i) => {
    // Picking a library exits VFX Engine / Tool placeholder — there's no
    // top bar in those, so this (plus picking a deck) is how the user
    // gets back to the slots view.
    setMainView("slots");
    setActiveTool(null);
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.activeLibraryIndex = i;
      // Reset to deck 0 when switching libraries.
      next.activeDeckIndex = 0;
      return next;
    });
  };
  const addLibrary = () => {
    // Free tier is capped at 1 library. The paywall opens instead of
    // adding a 2nd if PAYWALL_ENABLED is on AND the user is Free.
    if (window.PAYWALL_ENABLED && !license.isPro && (config.libraries || []).length >= 1) {
      setPaywall({ feature: "library" });
      return;
    }
    setMainView("slots");
    setActiveTool(null);
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const n = next.libraries.length + 1;
      next.libraries.push(ClipDeckStore.emptyLibrary("User Library " + n));
      next.activeLibraryIndex = next.libraries.length - 1;
      next.activeDeckIndex = 0;
      return next;
    });
  };
  const renameLibrary = (i, name) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.libraries[i].name = name;
      return next;
    });
  };

  // Assign / clear a per-library hotkey. Stored alongside the library's
  // other fields so it persists across launches and travels with the
  // library on .cdk export/import. Passing null clears the binding.
  const setLibraryHotkey = (i, accel) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.libraries[i]) return prev;
      next.libraries[i].hotkey = accel || null;
      return next;
    });
  };

  // Assign / clear a per-deck hotkey on the active library. Stored
  // alongside other deck fields so it persists across launches and
  // travels with the deck on library export/import. Passing null
  // clears the binding.
  const setDeckHotkey = (deckIdx, accel) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const li = next.activeLibraryIndex || 0;
      const decks = next.libraries && next.libraries[li] && next.libraries[li].decks;
      if (!decks || !decks[deckIdx]) return prev;
      decks[deckIdx].hotkey = accel || null;
      return next;
    });
  };

  // Assign / clear an INTHEZONE tool hotkey. toolHotkeys lives at the
  // config root rather than per-library because tools are global —
  // they aren't part of any user library. Passing null clears the
  // binding.
  const setToolHotkey = (toolName, accel) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.toolHotkeys || typeof next.toolHotkeys !== "object") next.toolHotkeys = {};
      if (accel) next.toolHotkeys[toolName] = accel;
      else delete next.toolHotkeys[toolName];
      return next;
    });
  };

  // Assign the global search hotkey shown in the right side of the
  // search bar. This is separate from the panel toggle hotkey: it opens
  // Clip Deck directly with the search input focused.
  const setSearchHotkey = (accel) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.searchHotkey = accel || "CommandOrControl+`";
      return next;
    });
  };

  // ── Deck actions ─────────────────────────────────────────────────────
  const pickDeck = (i) => {
    // In tool view, picking a deck tab switches inside the tool's own
    // deck list — we don't touch config.activeDeckIndex (which belongs
    // to the user libraries) or exit the tool view.
    if (mainView === "tool") {
      setToolDeckIndex(i);
      return;
    }
    // Otherwise picking a deck exits VFX Engine and mutates the active
    // user library, as before.
    setMainView("slots");
    setActiveTool(null);
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.activeDeckIndex = i;
      return next;
    });
  };
  const addDeck = () => {
    // Tool decks are curated — the Add Deck control is hidden in tool
    // view but defensively no-op here too so any stray callsite can't
    // accidentally mutate User Library 1.
    if (mainView === "tool") return;
    // Free tier is capped at 1 deck per library. Paywall replaces the add.
    const activeLib = (config.libraries || [])[config.activeLibraryIndex || 0];
    const deckCount = activeLib && activeLib.decks ? activeLib.decks.length : 0;
    if (window.PAYWALL_ENABLED && !license.isPro && deckCount >= 1) {
      setPaywall({ feature: "deck" });
      return;
    }
    setMainView("slots");
    setActiveTool(null);
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const li = next.activeLibraryIndex || 0;
      const n = next.libraries[li].decks.length + 1;
      next.libraries[li].decks.push(ClipDeckStore.emptyDeck("Deck " + n));
      next.activeDeckIndex = next.libraries[li].decks.length - 1;
      return next;
    });
  };
  const renameDeck = (i, name) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const li = next.activeLibraryIndex || 0;
      next.libraries[li].decks[i].name = name;
      return next;
    });
  };

  // ── Context-menu actions for libraries / decks ───────────────────────
  const openLibContextMenu = (index, e) => {
    setLibContextMenu({ x: e.clientX, y: e.clientY, libIndex: index });
  };
  // Right-click on the "+ Add library" button opens this menu (Import
  // Library). Keeping it as its own state lets us anchor the menu at
  // the click point exactly the same way as the per-library menu.
  const [addLibContextMenu, setAddLibContextMenu] = React.useState(null);
  const openAddLibContextMenu = (e) => {
    e.preventDefault();
    setAddLibContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Export the named library to a user-chosen file. Walks its slots
  // collecting every clipboardFile path so main can base64-inline
  // them for portability.
  const exportLibrary = async (libIndex) => {
    setLibContextMenu(null);
    if (!window.clipDeck || !window.clipDeck.exportLibrary) {
      setToast("Export not available — relaunch the overlay.");
      return;
    }
    const lib = libraries[libIndex];
    if (!lib) return;
    const paths = [];
    for (const deck of (lib.decks || [])) {
      for (const s of (deck.slots || [])) {
        if (s && s.clipboardFile) paths.push(s.clipboardFile);
      }
    }
    const result = await window.clipDeck.exportLibrary(lib, paths);
    if (!result || !result.ok) {
      if (result && result.error === "cancelled") return;
      setToast("Export failed: " + ((result && result.error) || "no detail"));
      return;
    }
    // The exported file's library.name is set to the user-chosen
    // filename (so the import side picks it up correctly), but we do
    // NOT rename the source library in the user's config — exporting
    // is a read-only snapshot operation.
    setToast(`Exported "${result.newName || lib.name}" ✓`);
  };

  // Import a library file (user picks one via the open dialog). The
  // imported library is appended to config.libraries and becomes the
  // active library.
  const importLibrary = async () => {
    setAddLibContextMenu(null);
    if (!window.clipDeck || !window.clipDeck.importLibrary) {
      setToast("Import not available — relaunch the overlay.");
      return;
    }
    const result = await window.clipDeck.importLibrary();
    if (!result || !result.ok) {
      if (result && result.error === "cancelled") return;
      setToast("Import failed: " + ((result && result.error) || "no detail"));
      return;
    }
    const lib = result.value && result.value.library;
    if (!lib) {
      setToast("Import failed: no library in file");
      return;
    }
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.libraries = next.libraries || [];
      next.libraries.push(lib);
      next.activeLibraryIndex = next.libraries.length - 1;
      next.activeDeckIndex = 0;
      return next;
    });
    const restored = result.value.capturesRestored || 0;
    setToast(`Imported "${lib.name}" ✓` + (restored > 0 ? ` · ${restored} clipboard capture${restored === 1 ? "" : "s"} restored` : ""));
  };
  const requestDeleteLibrary = (index) => {
    setLibContextMenu(null);
    const lib = libraries[index];
    setConfirmDialog({
      title: "Delete library?",
      message: `"${lib ? lib.name : "Library"}" and all of its decks will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        const deletedIdx = index;
        setConfig((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          next.libraries.splice(index, 1);
          // Always keep at least one library so the deck can never end up with no slots.
          if (next.libraries.length === 0) {
            next.libraries = [ClipDeckStore.emptyLibrary("User Library 1")];
          }
          if (next.activeLibraryIndex >= next.libraries.length) {
            next.activeLibraryIndex = next.libraries.length - 1;
          }
          if (next.activeLibraryIndex < 0) next.activeLibraryIndex = 0;
          const lib2 = next.libraries[next.activeLibraryIndex];
          if (next.activeDeckIndex >= lib2.decks.length) {
            next.activeDeckIndex = lib2.decks.length - 1;
          }
          if (next.activeDeckIndex < 0) next.activeDeckIndex = 0;
          return next;
        });
        // Drop recents in the deleted library + shift any recents in
        // later libraries (libraries above were renumbered by splice).
        setRecent((prev) => prev
          .filter((r) => r.libIdx !== deletedIdx)
          .map((r) => r.libIdx > deletedIdx
            ? { ...r, libIdx: r.libIdx - 1, id: "rc-" + (r.libIdx - 1) + "-" + r.deckIdx + "-" + r.slotIdx }
            : r
          )
        );
        setConfirmDialog(null);
      },
    });
  };

  const openDeckContextMenu = (index, e) => {
    setDeckContextMenu({ x: e.clientX, y: e.clientY, deckIndex: index });
  };
  const clearDeck = (deckIdx) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const li = next.activeLibraryIndex || 0;
      next.libraries[li].decks[deckIdx].slots = ClipDeckStore.emptySlots();
      return next;
    });
    // Drop every recent entry that pointed into this (active-library)
    // deck — the slots themselves are gone, so the recent strip
    // entries are orphaned and should disappear.
    setRecent((prev) => prev.filter((r) =>
      !(r.libIdx === activeLibraryIndex && r.deckIdx === deckIdx)
    ));
    setDeckContextMenu(null);
  };
  const requestDeleteDeck = (index) => {
    setDeckContextMenu(null);
    const deck = decks[index];
    setConfirmDialog({
      title: "Delete deck?",
      message: `"${deck ? deck.name : "Deck"}" and all of its slots will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        const deletedLibIdx = activeLibraryIndex;
        setConfig((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          const li = next.activeLibraryIndex || 0;
          next.libraries[li].decks.splice(index, 1);
          // Always keep at least one deck in a library so the deck never goes empty.
          if (next.libraries[li].decks.length === 0) {
            next.libraries[li].decks = [ClipDeckStore.emptyDeck("Deck 1")];
          }
          if (next.activeDeckIndex >= next.libraries[li].decks.length) {
            next.activeDeckIndex = next.libraries[li].decks.length - 1;
          }
          if (next.activeDeckIndex < 0) next.activeDeckIndex = 0;
          return next;
        });
        // Drop recents in the deleted deck + shift any recents in
        // later decks (decks above were renumbered by splice).
        setRecent((prev) => prev
          .filter((r) => !(r.libIdx === deletedLibIdx && r.deckIdx === index))
          .map((r) => (r.libIdx === deletedLibIdx && r.deckIdx > index)
            ? { ...r, deckIdx: r.deckIdx - 1, id: "rc-" + r.libIdx + "-" + (r.deckIdx - 1) + "-" + r.slotIdx }
            : r
          )
        );
        setConfirmDialog(null);
      },
    });
  };

  // Right-click → menu actions.
  const openContextMenu = (index, e) => {
    setContextMenu({ x: e.clientX, y: e.clientY, slotIndex: index });
  };
  const clearSlot = (index) => {
    const s = slots[index];
    // Delete the captured-clipboard file from disk if there is one — it can
    // be 5MB+ and would otherwise leak in the captures dir.
    if (s && s.clipboardFile && window.clipDeck && window.clipDeck.deleteCapture) {
      window.clipDeck.deleteCapture(s.clipboardFile).catch(() => {});
    }
    updateSlot(index, {
      path: null,
      name: null,
      nodeId: null,
      kind: null,
      clipboardFile: null,
      capturedAt: null,
      captureBytes: null,
      thumb: null,
      customThumb: false,
      audioOnly: false,
      captureSubtype: null,
      // Effect-card fields — must be nulled too, otherwise the slot
      // still has an effectRecipe attached and renders as a half-empty
      // "unnamed" card with the audio-waveform fallback thumbnail.
      effectRecipe: null,
      attributeSelection: null,
      // Drop the preset/text-thumb markers too — otherwise a cleared
      // copy of an effect card keeps its "locked" right-click menu and
      // the user can't Save Clips / Save Attributes into the empty slot.
      preset: false,
      useTextThumb: false,
      // Wipe persistent usage stats — the card is gone, so it should
      // also drop out of Most Used (which filters by useCount > 0).
      useCount: 0,
      lastUsedAt: null
    });
    // Drop the matching Recently Used entry too — explicit clear is
    // the only path that removes a card from the recent strip.
    setRecent((prev) => prev.filter((r) =>
      !(r.libIdx === activeLibraryIndex && r.deckIdx === activeDeckIndex && r.slotIdx === index)
    ));
    setContextMenu(null);
  };
  const setSlotHue = (index, choice) => {
    // Accept either a legacy bare hue number OR a full COLOR_OPTIONS
    // entry { name, hue, top, bot, border, text }. The full entry
    // lands on slot.customColor so SlotTile can apply it as an inline
    // override on top of the V2 type gradient.
    //
    // choice === null → clear the override (toggle off). The tile
    // reverts to its per-type V2 default color. Hue is also reset so
    // any legacy code reading slot.hue gets a clean slate.
    const patch = {};
    if (choice === null) {
      patch.customColor = null;
      patch.hue = 0;
    } else if (typeof choice === "number") {
      patch.hue = choice;
    } else if (choice && typeof choice === "object") {
      patch.hue = (typeof choice.hue === "number") ? choice.hue : 0;
      patch.customColor = {
        name: choice.name || null,
        top: choice.top, bot: choice.bot, border: choice.border, text: choice.text
      };
    }
    updateSlot(index, patch);
    setContextMenu(null);
  };
  const startRename = (index) => {
    setContextMenu(null);
    setEditingNameIndex(index);
  };
  const finishRename = () => setEditingNameIndex(null);
  const renameSlot = (index, name) => {
    updateSlot(index, { name });
  };

  // Right-click → "Choose thumbnail…". Pops the image-only OS picker and
  // stores the chosen file's URL on the slot so it overrides any auto
  // visual (gradient, clapperboard, video first-frame).
  const pickSlotThumbnail = async (index) => {
    setContextMenu(null);
    if (!window.clipDeck || !window.clipDeck.pickImage) return;
    let picked;
    try { picked = await window.clipDeck.pickImage(); } catch (e) { picked = null; }
    if (!picked || !picked.path) return;
    updateSlot(index, { thumb: pathToFileUrl(picked.path), customThumb: true });
  };
  const resetSlotThumbnail = (index) => {
    setContextMenu(null);
    updateSlot(index, { thumb: null, customThumb: false });
  };

  const pushRecent = (slot, slotIdx, coords) => {
    // Optional coords lets search-fire (and any other off-active fire
    // site) target the correct library/deck rather than defaulting to
    // whatever the user happens to be looking at. Tool decks (libIdx<0)
    // are read-only and skip the useCount bump.
    const libIdx  = (coords && typeof coords.libIdx  === "number") ? coords.libIdx  : activeLibraryIndex;
    const deckIdx = (coords && typeof coords.deckIdx === "number") ? coords.deckIdx : activeDeckIndex;
    // Bump persistent useCount on the underlying config slot so the
    // Most Used strip ranks correctly. Done here because pushRecent is
    // called from every fire site (fireSlot's various branches).
    if (slotIdx != null && libIdx >= 0) {
      bumpUseCount(libIdx, deckIdx, slotIdx);
    }
    // Globally-unique id keyed by full coords. slot.key alone (e.g.
    // "1") collides across decks/libraries — firing slot "1" in
    // Library A then slot "1" in Library B would dedupe to a single
    // entry. Coord-based id keeps them as distinct recents.
    const recentId = "rc-" + libIdx + "-" + deckIdx + "-" + slotIdx;
    setRecent((prev) => {
      const without = prev.filter((r) => r.id !== recentId);
      return [{
        id: recentId,
        // Coords so fireRecent can bump the right slot's useCount
        // (recents may persist across deck/library switches).
        libIdx: libIdx,
        deckIdx: deckIdx,
        slotIdx: slotIdx,
        slotKey: slot.key,    // retained for any UI that wants the human hotkey label
        name: slot.name || "Unnamed",
        tag: slot.tag,
        hue: slot.hue,
        peak: slot.peak,
        path: slot.path,
        nodeId: slot.nodeId,
        // Carry kind + thumb + clipboardFile + effectRecipe so the
        // recent strip can render the same glyph the main tile shows
        // AND so clipboard- and effect-recipe-based slots can be
        // re-fired from recents (they have no disk path).
        kind: slot.kind,
        thumb: slot.thumb,
        customThumb: slot.customThumb,
        clipboardFile: slot.clipboardFile,
        effectRecipe: slot.effectRecipe,
        attributeSelection: slot.attributeSelection,
        capturedAttributes: slot.capturedAttributes,
        customColor: slot.customColor,
        audioOnly: slot.audioOnly,
        captureSubtype: slot.captureSubtype,
        // Carry useTextThumb so the Recently Used strip can render
        // the title-as-thumb for curated Effect / Transition cards
        // instead of the generic FX sparkles glyph.
        useTextThumb: !!slot.useTextThumb
      }, ...without].slice(0, 10);
    });
  };

  const recipeHasTransitionComponent = (recipe) => {
    const comps = recipe && recipe.components;
    return !!(comps && comps.length && comps[0] && comps[0].kind === "transition");
  };

  const summarizeEffectRecipe = (recipe) => {
    const comps = (recipe && recipe.components) || [];
    return {
      schemaVersion: recipe && recipe.schemaVersion,
      mediaType: recipe && recipe.mediaType,
      capturedAt: recipe && recipe.capturedAt,
      components: comps.map((c) => ({
        captureIndex: c.captureIndex,
        kind: c.kind,
        displayName: c.displayName,
        matchName: c.matchName,
        audio: !!c.audio,
        paramCount: (c.params && c.params.length) || 0
      }))
    };
  };

  // Save Attributes debugging hook. The host already returns a detailed
  // per-param diagnostics array; this keeps it visible in DevTools and
  // durable on disk for LaunchServices-launched builds where stdout is
  // otherwise hard to reach.
  const logEffectRecipeDiagnostics = async (event, details = {}) => {
    const recipe = details.recipe || null;
    if (!recipe || recipeHasTransitionComponent(recipe)) return;
    const result = details.result || null;
    const value = (result && result.value) || details.value || {};
    const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : [];
    const payload = {
      event,
      source: details.source || "",
      cardName: details.cardName || "",
      slotKey: details.slotKey || "",
      ok: result ? !!result.ok : true,
      error: result && result.error ? result.error : null,
      applied: value.applied,
      skipped: value.skipped,
      errors: value.errors || [],
      diagnostics,
      recipeSummary: summarizeEffectRecipe(recipe),
      recipe
    };
    try {
      const title = `[Clip Deck] Save Attributes ${event}` +
        (payload.cardName ? ` · ${payload.cardName}` : "") +
        (diagnostics.length ? ` · ${diagnostics.length} diagnostics` : "");
      if (console.groupCollapsed) console.groupCollapsed(title);
      else console.log(title);
      console.log(payload);
      if (diagnostics.length) console.log(diagnostics.join("\n"));
      if (console.groupEnd) console.groupEnd();
    } catch (e) {}
    try {
      if (window.clipDeck && window.clipDeck.logRecipeDiagnostics) {
        await window.clipDeck.logRecipeDiagnostics(payload);
      }
    } catch (e) {}
  };

  const fireRecent = async (item) => {
    if (window.CLIPDECK_DEMO) return; // demo: Premiere insert is a silent no-op
    if (!item) return;
    // A recent item is fireable if it has any of: a disk path, a project
    // nodeId, a captured clipboard file, or a saved effect recipe.
    if (!item.path && !item.nodeId && !item.clipboardFile && !item.effectRecipe) return;
    if (!connected) {
      setToast("Premiere not connected — can't insert yet.");
      return;
    }
    // Bump the underlying slot's useCount so re-fires from the strip
    // count toward Most Used ranking. Item coords were captured at
    // pushRecent time; legacy entries without coords just skip.
    if (item.libIdx != null && item.deckIdx != null && item.slotIdx != null) {
      bumpUseCount(item.libIdx, item.deckIdx, item.slotIdx);
    }
    try {
      // Effect-recipe recent items: walk the JSON recipe via QE +
      // setValue. No clipboard, no Paste Attributes dialog.
      if (item.kind === "effect") {
        if (item.effectRecipe && window.clipDeck && window.clipDeck.applyEffectRecipe) {
          const fired = await window.clipDeck.applyEffectRecipe(item.effectRecipe);
          await logEffectRecipeDiagnostics("apply", {
            source: "recent",
            cardName: item.name,
            slotKey: item.slotKey,
            recipe: item.effectRecipe,
            result: fired
          });
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          const v = fired.value || {};
          const errCount = (v.errors && v.errors.length) || 0;
          setToast(errCount
            ? "Effect applied · " + v.applied + " set, " + v.skipped + " skipped, " + errCount + " errors"
            : "Effect applied ✓");
        } else if (item.clipboardFile && window.clipDeck && window.clipDeck.fireEffectAttributes) {
          // Legacy effect card captured before the recipe model — fall
          // back to the clipboard + Paste Attributes path.
          const fired = await window.clipDeck.fireEffectAttributes(item.clipboardFile, item.attributeSelection || null);
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          setToast("Effect applied ✓");
        } else {
          setToast("This effect card is empty.");
          return;
        }
        // Bump to the top of the recents list.
        setRecent((prev) => {
          const without = prev.filter((r) => r.id !== item.id);
          return [item, ...without].slice(0, 10);
        });
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        return;
      }
      // Captured-clipboard recent items: same fast path as fireSlot.
      // Smart Insert applies here too: main.js bracket the wake/paste with
      // backend calls that smart-target the lowest empty track (collision
      // detection + auto-add-track) and restore the user's track targets
      // afterward.
      if (item.kind === "clipboard" && item.clipboardFile) {
        // Save Attributes recent → Cmd+Opt+V (Paste Attributes).
        if (item.captureSubtype === "attributes") {
          const fired = await window.clipDeck.fireEffectAttributes(item.clipboardFile, item.attributeSelection || null);
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          setToast("Attributes applied ✓");
          setRecent((prev) => {
            const without = prev.filter((r) => r.id !== item.id);
            return [item, ...without].slice(0, 10);
          });
          if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
          return;
        }
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        await new Promise((r) => setTimeout(r, 50));
        const fired = await window.clipDeck.fireClipboard(item.clipboardFile, { insertMode });
        if (!fired || !fired.ok) {
          setToast("Fire failed: " + ((fired && fired.error) || "no detail"));
          return;
        }
        // Bump to the top of the recents list.
        setRecent((prev) => {
          const without = prev.filter((r) => r.id !== item.id);
          return [item, ...without].slice(0, 10);
        });
        return;
      }
      // Disk-backed / sequence recents: overwriteAt path. Switch between
      // Smart Insert (lowest empty track + collision detection) and the
      // legacy targeted-track behaviour based on Preferences > Insert mode.
      let nodeId = item.nodeId;
      if (!nodeId && item.path) {
        nodeId = await Client.importAsset(item.path);
        setRecent((prev) => prev.map((r) => r.id === item.id ? { ...r, nodeId } : r));
      }
      const overwriteFn = (insertMode === "smart") ? Client.smartOverwriteAt : Client.overwriteAt;
      let result;
      try {
        result = await overwriteFn(nodeId, item.path);
      } catch (err) {
        // Recent entries can also carry a stale nodeId after the user
        // switches Premiere projects. Re-import once and retry, same as
        // fireSlot. Sequence recents (no path) can't be recovered.
        if (item.path && isStaleNodeError(err)) {
          nodeId = await Client.importAsset(item.path);
          setRecent((prev) => prev.map((r) => r.id === item.id ? { ...r, nodeId } : r));
          result = await overwriteFn(nodeId, item.path);
        } else {
          throw err;
        }
      }
      // Bump this entry to the top of the recents list.
      setRecent((prev) => {
        const without = prev.filter((r) => r.id !== item.id);
        return [{ ...item, nodeId }, ...without].slice(0, 10);
      });
      finishFireWithSelect(
        result && result.startTicks,
        result && result.warning,
        result && result.method === "smart" ? { trackIndex: result.trackIndex, isAudio: result.isAudio } : undefined
      );
    } catch (err) {
      // Don't blow away nodeId for clipboard items (they don't have a path
      // to re-import from — clearing nodeId would brick re-fires).
      if (item.path) {
        setRecent((prev) => prev.map((r) => r.id === item.id ? { ...r, nodeId: null } : r));
      }
      setToast("Couldn't insert: " + (err.message || err));
    }
  };

  // Sequence the post-overwrite UX:
  //   1. hide overlay → macOS swaps focus to Premiere
  //   2. small wait so macOS finishes the swap before we touch ExtendScript
  //   3. selectAtTime → clip highlights; this side-effect briefly bounces
  //      panel focus to Effects Controls / Source Monitor
  //   4. wait for the selection-induced focus bounce to settle, THEN run
  //      focusTimeline. Without this gap the menu-click + coord-click ran
  //      while Premiere was still mid-bounce and the click landed on the
  //      wrong panel — leaving the user with selected clip but no
  //      timeline keyboard control until they clicked manually.
  const finishFireWithSelect = async (startTicks, warning, opts) => {
    if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
    if (warning) setToast(warning);
    await new Promise((r) => setTimeout(r, 60));
    if (startTicks != null) {
      try {
        // For Smart Insert results, opts carries trackIndex+isAudio so the
        // host scopes the selection to ONLY the just-inserted clip rather
        // than every clip starting at the same time across all tracks.
        // For Track Target / legacy inserts, opts is undefined and the
        // host falls back to its all-tracks scan.
        const trackIndex = opts && opts.trackIndex;
        const isAudio = opts && opts.isAudio;
        await Client.selectAtTime(startTicks, trackIndex, isAudio);
      } catch (e) {}
    }
    await new Promise((r) => setTimeout(r, 90));
    if (window.clipDeck && window.clipDeck.focusTimeline) {
      window.clipDeck.focusTimeline();
    }
  };

  // ── INTHEZONE Tools > SFX → import + insert from Pixabay ─────────────
  // Takes a downloaded local audio path and runs it through the same
  // import + overwrite pipeline a user-library audio file uses. Smart
  // Insert mode picks the lowest empty audio track; Track Target mode
  // uses whatever's targeted right now.
  const fireSfxImport = async ({ localPath, hit }) => {
    if (!localPath) {
      setToast("SFX import failed: no local path");
      return;
    }
    if (!connected) {
      setToast("Premiere not connected — can't insert SFX yet.");
      return;
    }
    try {
      // Move the downloaded file into a `Clip Deck` subfolder of the
      // active Premiere project's directory so the audio travels with
      // the .prproj AND the user can find every SFX we've fetched in
      // one obvious place. main.js's relocateSfx handles mkdir-recursive
      // so the subfolder is auto-created on first download. If no
      // project is open / unsaved, the file stays in sfx-cache and we
      // import from there. NOTE: Client.tryFetch already unwraps the
      // backend's {ok,value} envelope, so the response here is the bare
      // {path, directory, saved} object — do NOT check pp.ok.
      let finalPath = localPath;
      let placedIn = "cache";
      try {
        const pp = await Client.getProjectPath();
        const projDir = pp && pp.saved ? pp.directory : "";
        if (projDir && window.clipDeck && window.clipDeck.relocateSfx) {
          const targetDir = projDir + "/Clip Deck";
          const moved = await window.clipDeck.relocateSfx(localPath, targetDir);
          if (moved && moved.ok && moved.localPath) {
            finalPath = moved.localPath;
            placedIn = "project";
          }
        }
      } catch (e) { /* relocation is best-effort; fall through to cache path */ }

      const nodeId = await Client.importAsset(finalPath);
      const overwriteFn = (insertMode === "smart") ? Client.smartOverwriteAt : Client.overwriteAt;
      let result;
      try {
        result = await overwriteFn(nodeId, finalPath);
      } catch (err) {
        if (isStaleNodeError(err)) {
          const fresh = await Client.importAsset(finalPath);
          result = await overwriteFn(fresh, finalPath);
        } else {
          throw err;
        }
      }
      const title = (hit && (hit.title || hit.name)) || "SFX";
      const where = placedIn === "project" ? " → project/Clip Deck" : " (cached)";
      setToast(`Inserted "${title}"${where} ✓`);
      finishFireWithSelect(
        result && result.startTicks,
        result && result.warning,
        result ? { trackIndex: result.trackIndex, isAudio: true } : undefined,
      );
    } catch (err) {
      setToast("SFX insert failed: " + (err && err.message || err));
    }
  };

  // ── Search ───────────────────────────────────────────────────────────
  // Walks every populated slot across every library/deck and scores by
  // name. Returns null when there's no active query so the UI keeps the
  // normal grid; returns an array (possibly empty) when searching.
  const searchResults = React.useMemo(() => {
    const q = (query || "").trim();
    if (!q || !config) return null;
    // Free-tier access gate: slots in locked libraries / decks (anything
    // outside library 0 / deck 0) drop from results so the search grid
    // can't expose a cards-grid hotkey fire path that bypasses the lock.
    // INTHEZONE tool decks (Effects + Transitions) are free anyway and
    // walk through their own loop below.
    const freeLocked = !!window.PAYWALL_ENABLED && !(license && license.isPro);
    const out = [];
    (config.libraries || []).forEach((lib, libIdx) => {
      if (freeLocked && libIdx > 0) return;
      (lib.decks || []).forEach((deck, deckIdx) => {
        if (freeLocked && deckIdx > 0) return;
        (deck.slots || []).forEach((slot, slotIdx) => {
          if (!slot.path && !slot.nodeId && !slot.clipboardFile && !slot.effectRecipe) return;
          const score = searchScore(q, slot.name || "");
          if (score > 0) {
            out.push({
              slot, score,
              libIdx, deckIdx, slotIdx,
              libName: lib.name || ("Library " + (libIdx + 1)),
              deckName: deck.name || ("Deck " + (deckIdx + 1))
            });
          }
        });
      });
    });
    // Also search INTHEZONE Tools > Effects + Transitions decks. These
    // are curated read-only slot lists carrying effectRecipe payloads
    // rather than file/nodeId. libIdx is -1 as a sentinel so the fire
    // path knows to apply the recipe instead of updating user-library
    // state.
    ["Effects", "Transitions"].forEach((toolName) => {
      const decks = (toolDecksByName || {})[toolName] || [];
      decks.forEach((deck, deckIdx) => {
        (deck.slots || []).forEach((slot, slotIdx) => {
          if (!slot.effectRecipe) return;
          const score = searchScore(q, slot.name || "");
          if (score > 0) {
            out.push({
              slot, score,
              libIdx: -1, toolName, deckIdx, slotIdx,
              libName: "INTHEZONE",
              deckName: deck.name || toolName
            });
          }
        });
      });
    });
    out.sort((a, b) =>
      b.score - a.score ||
      a.libIdx - b.libIdx ||
      a.deckIdx - b.deckIdx ||
      a.slotIdx - b.slotIdx
    );
    // Dedup duplicates across libraries / tool decks. Identity key is
    // (name + content) per user spec 2026-05-26: a copy that's been
    // renamed stays as its own result (e.g. "Crop" vs "My Quick Crop"
    // pointing to the same effect both show up), but two
    // same-name + same-content copies in different libraries collapse
    // to one row. Walks the sort-ordered list and keeps the
    // highest-ranked occurrence of each identity; later duplicates
    // drop. INTHEZONE Tools cards (Effects / Transitions) participate
    // — if you dragged a tool card into a user library and didn't
    // rename it, the user-library copy and the canonical tool-deck
    // copy collapse into one search hit.
    //
    // Content key precedence: file path → bin nodeId → clipboard file →
    // effectRecipe JSON. Slots with none of these never entered `out`
    // (filtered at push time), so contentKey is always derivable here.
    const seen = new Set();
    const deduped = out.filter((r) => {
      const slot = r.slot || {};
      let contentKey = null;
      if (slot.path) contentKey = "file:" + slot.path;
      else if (slot.nodeId) contentKey = "node:" + slot.nodeId;
      else if (slot.clipboardFile) contentKey = "clip:" + slot.clipboardFile;
      else if (slot.effectRecipe) {
        try { contentKey = "rec:" + JSON.stringify(slot.effectRecipe); } catch (e) {}
      }
      // Unidentifiable content — let it through rather than collapse
      // unrelated rows by name alone.
      if (!contentKey) return true;
      const key = String(slot.name || "") + " " + contentKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped;
  }, [query, config, toolDecksByName, license && license.isPro]);

  // Coord-aware fire — search results may live on a different library/deck
  // than the active one, so we fire by full coords without disturbing the
  // active context. Mirrors fireSlot's branches (clipboard / disk / nodeId).
  const fireSearchResult = async (result) => {
    if (window.CLIPDECK_DEMO) return; // demo: Premiere insert is a silent no-op
    if (!result || !result.slot) return;
    const slot = result.slot;
    if (!slot.path && !slot.nodeId && !slot.clipboardFile && !slot.effectRecipe) return;
    if (slot.path && slot.path.indexOf("/") === -1) {
      setToast(`That card has a stale path. Open its library and click the tile to reassign.`);
      return;
    }
    if (!connected) {
      setToast("Premiere not connected — can't insert yet.");
      return;
    }
    try {
      // INTHEZONE Tools cards (Effects + Transitions) carry an
      // effectRecipe and live in tool decks, not user libraries. Apply
      // the recipe directly via the same IPC path that fireSlot uses
      // for kind:"effect" slots. No state mutation — tool decks are
      // read-only constants.
      if (slot.effectRecipe && window.clipDeck && window.clipDeck.applyEffectRecipe) {
        const fired = await window.clipDeck.applyEffectRecipe(slot.effectRecipe);
        await logEffectRecipeDiagnostics("apply", {
          source: "search",
          cardName: slot.name,
          slotKey: slot.key,
          recipe: slot.effectRecipe,
          result: fired
        });
        if (!fired || !fired.ok) {
          setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
          return;
        }
        const v = fired.value || {};
        const errCount = (v.errors && v.errors.length) || 0;
        setToast(errCount
          ? `${slot.name || "Effect"} · ${v.applied || 0} set, ${errCount} errors`
          : `${slot.name || "Effect"} ✓`);
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        return;
      }
      if (slot.kind === "clipboard" && slot.clipboardFile) {
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        await new Promise((r) => setTimeout(r, 50));
        const fired = await window.clipDeck.fireClipboard(slot.clipboardFile, { insertMode });
        if (!fired || !fired.ok) {
          setToast("Fire failed: " + ((fired && fired.error) || "no detail"));
          return;
        }
        pushRecent(slot, result.slotIdx, { libIdx: result.libIdx, deckIdx: result.deckIdx });
        return;
      }
      let nodeId = slot.nodeId;
      if (!nodeId && slot.path) {
        nodeId = await Client.importAsset(slot.path);
        // Cache the nodeId on the slot at its actual coords (not active deck).
        setConfig((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          const lib = next.libraries && next.libraries[result.libIdx];
          const deck = lib && lib.decks && lib.decks[result.deckIdx];
          const s = deck && deck.slots && deck.slots[result.slotIdx];
          if (s) s.nodeId = nodeId;
          return next;
        });
      }
      // Insert mode dispatch — "smart" goes through smartOverwriteAt
      // (lowest empty track + collision detection); "track" and "source"
      // both go through overwriteAt (CEP/QE SDK doesn't expose source-
      // patch state for files, so they share the targeted-track path).
      const overwriteFn = (insertMode === "smart") ? Client.smartOverwriteAt : Client.overwriteAt;
      let opResult;
      try {
        opResult = await overwriteFn(nodeId, slot.path);
      } catch (err) {
        // Search-fired tile may have a nodeId from a prior Premiere
        // project too — re-import once into the current project and
        // retry, then cache the fresh nodeId at the slot's real coords.
        if (slot.path && isStaleNodeError(err)) {
          const fresh = await Client.importAsset(slot.path);
          setConfig((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const lib = next.libraries && next.libraries[result.libIdx];
            const deck = lib && lib.decks && lib.decks[result.deckIdx];
            const s = deck && deck.slots && deck.slots[result.slotIdx];
            if (s) s.nodeId = fresh;
            return next;
          });
          opResult = await overwriteFn(fresh, slot.path);
        } else {
          throw err;
        }
      }
      pushRecent(slot, result.slotIdx, { libIdx: result.libIdx, deckIdx: result.deckIdx });
      finishFireWithSelect(
        opResult && opResult.startTicks,
        opResult && opResult.warning,
        opResult && opResult.method === "smart" ? { trackIndex: opResult.trackIndex, isAudio: opResult.isAudio } : undefined
      );
    } catch (err) {
      setToast("Couldn't insert: " + (err.message || err));
    }
  };

  // Arrow-key navigation + Enter inside the sidebar search input.
  // Grid is 10 columns × up to 4 rows (capped at 40 results), so
  // ArrowDown/Up step by 10 to move one row at a time and Left/Right
  // step by 1. Enter fires the currently-highlighted result; with no
  // navigation done yet that's the top result (idx 0) — exactly what
  // the user expects from a "type and hit Enter" search flow.
  const onSearchKeyDown = (e) => {
    if (!searchResults || searchResults.length === 0) return false;
    const COLS = 10;
    const total = Math.min(searchResults.length, 40);
    const k = e.key;
    if (k === "Enter") {
      e.preventDefault(); e.stopPropagation();
      const safeIdx = Math.min(searchSelectedIdx, total - 1);
      const r = searchResults[safeIdx];
      if (r) {
        fireSearchResult(r);
        // Close the panel immediately rather than waiting for the
        // import+insert round-trip to finish. The fire continues
        // asynchronously; its own internal hideOverlay calls become
        // no-ops once the window is already hidden.
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
      }
      return true;
    }
    if (k === "ArrowRight") { e.preventDefault(); setSearchSelectedIdx((i) => Math.min(total - 1, i + 1));    return true; }
    if (k === "ArrowLeft")  { e.preventDefault(); setSearchSelectedIdx((i) => Math.max(0, i - 1));            return true; }
    if (k === "ArrowDown")  { e.preventDefault(); setSearchSelectedIdx((i) => Math.min(total - 1, i + COLS)); return true; }
    if (k === "ArrowUp")    { e.preventDefault(); setSearchSelectedIdx((i) => Math.max(0, i - COLS));         return true; }
    return false;
  };

  // Premiere's project tree is a different tree per project, so a nodeId
  // we cached against project A is meaningless once the user opens project
  // B. Detect that "no such item" failure mode so we can transparently
  // re-import on a fresh project instead of surfacing the error.
  const isStaleNodeError = (err) => {
    const msg = String((err && (err.message || err)) || "").toLowerCase();
    return msg.indexOf("project item not found") !== -1
        || msg.indexOf("no projectitem") !== -1
        || msg.indexOf("invalid nodeid") !== -1;
  };

  // Fire a card from an INTHEZONE Tool deck (Effects only for now).
  // The recipe is read from the curated preset list, not from config
  // (these decks aren't user-editable), so we don't bump useCount or
  // push to Recently Used — tool fires intentionally stay out of the
  // library-scoped usage tracking until that integration is designed.
  const fireToolSlot = async (index) => {
    if (window.CLIPDECK_DEMO) return; // demo: Premiere insert is a silent no-op
    const toolDecks = (activeTool && toolDecksByName[activeTool]) || [];
    const toolDeck = toolDecks[toolDeckIndex] || toolDecks[0] || null;
    const toolSlots = toolDeck ? toolDeck.slots : [];
    const s = toolSlots[index];
    if (!s || !s.effectRecipe) {
      setToast(`Slot ${KEYMAP[index]} is empty.`);
      return;
    }
    if (!connected) {
      setToast("Premiere not connected — can't insert yet.");
      return;
    }
    if (!window.clipDeck || !window.clipDeck.applyEffectRecipe) {
      setToast("Effect apply not available — relaunch the overlay.");
      return;
    }
    try {
      const fired = await window.clipDeck.applyEffectRecipe(s.effectRecipe);
      await logEffectRecipeDiagnostics("apply", {
        source: "tool",
        cardName: s.name,
        slotKey: s.key,
        recipe: s.effectRecipe,
        result: fired
      });
      if (!fired || !fired.ok) {
        setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
        return;
      }
      const v = fired.value || {};
      const errCount = (v.errors && v.errors.length) || 0;
      const msg = errCount
        ? `${s.name} · ${v.applied} set, ${v.skipped} skipped, ${errCount} errors`
        : `${s.name} applied ✓`;
      setToast(msg);
      if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
    } catch (err) {
      setToast("Apply failed: " + (err.message || err));
    }
  };

  const fireSlot = async (index) => {
    if (window.CLIPDECK_DEMO) return; // demo: Premiere insert is a silent no-op
    // Tool views (Effects / SFX / Utility Plugins / Youtube) have their
    // own curated slot list. Route there before reading the active
    // library/deck's slots — otherwise hotkeys/clicks would read the
    // wrong source while a tool is open.
    if (mainView === "tool") {
      return fireToolSlot(index);
    }
    const s = slots[index];
    // Empty slot = no source path, no nodeId, no clipboard capture,
    // AND no effect payload. Effect cards have only `kind: "effect"`
    // + a stored payload, so the empty-check has to include them.
    // Effect cards store clipboard bytes the same way clipboard cards
    // do — the only difference is the fire path (paste-attributes vs
    // regular paste). Both kinds use slot.clipboardFile.
    const isEmpty = !s || (!s.path && !s.nodeId && !s.clipboardFile && !s.effectRecipe);
    if (isEmpty) {
      setToast(`Slot ${KEYMAP[index]} is empty — drop a file or click to assign.`);
      return;
    }
    // Guard against corrupt paths from older drag-drop attempts (filename only,
    // no absolute path). Captured slots have no path, so skip this check.
    if (s.path && s.path.indexOf("/") === -1) {
      setToast(`Slot ${KEYMAP[index]} has a stale path. Click the tile to reassign.`);
      updateSlot(index, { path: null, nodeId: null });
      return;
    }
    if (!connected) {
      setToast("Premiere not connected — can't insert yet.");
      return;
    }
    try {
      // Captured-clipboard slots: hide the overlay FIRST so the user sees
      // the paste happen on the timeline (instead of the panel covering
      // it), then restore Premiere's pasteboard and Cmd+V.
      // Order matters for perceived speed:
      //   1. hideOverlay → Premiere foregrounds, timeline visible
      //   2. ~50ms settle so the focus swap completes
      //   3. fireClipboard → restore + Cmd+V (skips re-activate; hide already did)
      // Smart Insert applies here too: when insertMode === "smart", main.js
      // calls /smart-target-for-paste before the wake/paste (untargets
      // every track of the relevant kind except the smart-chosen one,
      // adding a new track if all existing ones collide) and /restore-targets
      // afterward.
      if (s.kind === "clipboard" && s.clipboardFile) {
        // Save Attributes capture → Paste Attributes (Cmd+Opt+V), not
        // a plain paste. Stay on top of Premiere so the brief dialog
        // hides behind the overlay; once the apply returns we reveal.
        if (s.captureSubtype === "attributes") {
          const fired = await window.clipDeck.fireEffectAttributes(s.clipboardFile, s.attributeSelection || null);
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          setToast("Attributes applied ✓");
          pushRecent(s, index);
          if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
          return;
        }
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        await new Promise((r) => setTimeout(r, 50));
        const fired = await window.clipDeck.fireClipboard(s.clipboardFile, { insertMode });
        if (!fired || !fired.ok) {
          setToast("Fire failed: " + ((fired && fired.error) || "no detail"));
          return;
        }
        pushRecent(s, index);
        return;
      }
      // Effect cards: restore the saved clipboard bytes (the same
      // bytes Cmd+C produced when capture happened) onto Premiere's
      // clipboard, then click Edit > Paste Attributes + Enter to apply
      // them to the user's selected clip.
      //
      // Crucially we DON'T hide the overlay before firing — Clip Deck
      // stays on top of everything during the paste-attributes flow,
      // visually covering the brief Paste Attributes dialog that
      // Premiere pops up behind it. Once the apply returns success
      // we hide, revealing Premiere with the effect already landed.
      if (s.kind === "effect") {
        // Prefer the JSON recipe path — no clipboard, no Paste
        // Attributes dialog. Falls back to the legacy clipboard path
        // for cards captured before the recipe model.
        if (s.effectRecipe && window.clipDeck.applyEffectRecipe) {
          const fired = await window.clipDeck.applyEffectRecipe(s.effectRecipe);
          await logEffectRecipeDiagnostics("apply", {
            source: "slot",
            cardName: s.name,
            slotKey: s.key,
            recipe: s.effectRecipe,
            result: fired
          });
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          const v = fired.value || {};
          const errCount = (v.errors && v.errors.length) || 0;
          const msg = errCount
            ? "Effect applied · " + v.applied + " set, " + v.skipped + " skipped, " + errCount + " errors"
            : "Effect applied ✓";
          setToast(msg);
          pushRecent(s, index);
          if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
          return;
        }
        if (s.clipboardFile) {
          const fired = await window.clipDeck.fireEffectAttributes(s.clipboardFile, s.attributeSelection || null);
          if (!fired || !fired.ok) {
            setToast("Apply failed: " + ((fired && fired.error) || "no detail"));
            return;
          }
          setToast("Effect applied ✓");
          pushRecent(s, index);
          if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
          return;
        }
        setToast("This effect card is empty.");
        return;
      }
      let nodeId = s.nodeId;
      if (!nodeId && s.path) {
        // Disk-backed slot with no cached nodeId yet — import on demand.
        nodeId = await Client.importAsset(s.path);
        updateSlot(index, { nodeId: nodeId });
      }
      // Insert mode dispatch — "smart" goes through smartOverwriteAt
      // (lowest empty track + collision detection); "track" and "source"
      // both go through overwriteAt (CEP/QE SDK doesn't expose source-
      // patch state for files, so they share the targeted-track path).
      const overwriteFn = (insertMode === "smart") ? Client.smartOverwriteAt : Client.overwriteAt;
      let result;
      try {
        result = await overwriteFn(nodeId, s.path);
      } catch (err) {
        // First fire after switching Premiere projects: the cached nodeId
        // points at a projectItem in the OLD project. Re-import once into
        // the current project and retry transparently. Captured sequences
        // (no path) can't be re-imported, so we let the error bubble.
        if (s.path && isStaleNodeError(err)) {
          const fresh = await Client.importAsset(s.path);
          updateSlot(index, { nodeId: fresh });
          result = await overwriteFn(fresh, s.path);
        } else {
          throw err;
        }
      }
      pushRecent(s, index);
      finishFireWithSelect(
        result && result.startTicks,
        result && result.warning,
        result && result.method === "smart" ? { trackIndex: result.trackIndex, isAudio: result.isAudio } : undefined
      );
    } catch (err) {
      // Keep the panel open on failure so the user sees what went wrong.
      // Don't blow away nodeId for captured sequences (they have no path
      // to re-import from — clearing nodeId would brick the slot).
      if (s.nodeId && s.path) updateSlot(index, { nodeId: null });
      setToast("Couldn't insert: " + (err.message || err));
    }
  };

  const setSlotThumb = (index, thumb) => updateSlot(index, { thumb });

  const assignFile = async (index) => {
    if (!window.clipDeck || !window.clipDeck.pickFile) return;
    const picked = await window.clipDeck.pickFile();
    if (!picked) return;
    updateSlot(index, {
      path: picked.path,
      name: picked.name.replace(/\.[^.]+$/, ""),
      nodeId: null,
      kind: fileKind(picked.path),
      thumb: null
    });
  };

  // Capture via Premiere's macOS pasteboard. Premiere puts its clip-exchange
  // XML on the system pasteboard when the user Cmd+Cs a timeline selection;
  // we snapshot those bytes to a per-slot file. On fire, we restore the
  // exact pasteboard state and trigger Cmd+V — Premiere pastes natively
  // with full fidelity (effects, in/out, positions, linked audio, etc).
  // Zero timeline modification, zero flicker.
  const captureToSlot = async (index) => {
    if (!connected) {
      setToast("Premiere not connected — can't capture.");
      return;
    }
    if (!window.clipDeck || !window.clipDeck.captureClipboard) {
      setToast("Capture not available.");
      return;
    }
    setToast("Capturing timeline selection…");
    setCapturingIndex(index);
    try {
      const slot = slots[index];
      const slotKey = (slot && slot.key) || String(index);
      const result = await window.clipDeck.captureClipboard(slotKey);
      if (!result || !result.ok) {
        setToast("Capture failed: " + ((result && result.error) || "no detail"));
        return;
      }
      // If this slot already had a capture file, delete the old one so we
      // don't accumulate stale 5MB+ snapshots in the captures dir.
      if (slot && slot.clipboardFile && window.clipDeck.deleteCapture) {
        try { await window.clipDeck.deleteCapture(slot.clipboardFile); } catch (e) {}
      }
      updateSlot(index, {
        ...blankSlotContent(),
        name: "Captured · " + new Date().toLocaleTimeString().slice(0, 5),
        kind: "clipboard",
        clipboardFile: result.filePath,
        capturedAt: Date.now(),
        captureBytes: result.totalBytes,
        audioOnly: !!result.audioOnly,
        captureSubtype: result.captureSubtype || null,
      });
      setToast("Captured ✓ · " + Math.round(result.totalBytes / 1024) + " KB");
    } catch (err) {
      setToast("Capture failed: " + (err.message || err));
    } finally {
      setCapturingIndex(null);
    }
  };

  // Capture an effect preset onto this slot. Opens the EffectPresetPicker
  // Capture an effect by riding Premiere's native paste-attributes
  // workflow:
  //   1. User has a clip selected in their Timeline that already has
  //      the effects they want (typically an adjustment layer they've
  //      prepped with effects, but any clip works)
  //   2. User right-clicks a slot and picks "Capture effect preset"
  //   3. Clip Deck does the same Cmd+C-and-save-bytes dance as
  //      "Capture from timeline" — restoring those bytes back onto
  //      the clipboard later lets Premiere paste the SAME attributes
  //      via Cmd+Option+V
  //   4. Card is marked `kind: "effect"` so fireSlot routes it to the
  //      paste-attributes path instead of the regular paste path
  //
  // No effects panel reading, no QE, no UXP — just leveraging
  // Premiere's clipboard. The user picks effects with Premiere's
  // native UI (much faster than anything we could build) and we just
  // store the clipboard snapshot.
  // Save Attributes — clipboard-based capture for full Cmd+C / Paste
  // Attributes parity. Premiere's own clipboard payload carries every
  // effect and every parameter verbatim (including encoded colors,
  // keyframes, color management state — things the SDK enumeration
  // approach couldn't always round-trip). We snapshot those bytes to
  // a per-slot file and fire via fireEffectAttributes → Cmd+Opt+V,
  // which is exactly what Premiere itself does when the user pastes
  // attributes. No SDK enumeration, no per-component picker; the user
  // gets the same all-or-nothing accuracy as a hand-driven Cmd+C +
  // Paste Attributes flow.
  //
  // Legacy SDK-recipe slots (existing effectRecipe + capturedAttributes
  // captures) still fire via applyEffectRecipe in fireSlot — only new
  // captures use the clipboard path.
  // Save Attributes — JSON-recipe path, no picker.
  //
  // Calls captureEffectRecipe(null) to capture EVERY component on the
  // selected source clip in one round-trip: Motion / Opacity / Time
  // Remapping / Unassigned Masks (intrinsics) AND every applied video +
  // audio effect. The backend serialises matchName + displayName + every
  // param value for each component into a JSON recipe stored directly on
  // the slot. No clipboard payload, no Paste Attributes dialog, no
  // checkbox picker — just an atomic "snapshot everything on this clip"
  // capture.
  //
  // Fire path: existing `applyEffectRecipe` walker (fireSlot routes
  // kind:"effect" + effectRecipe straight to it) — adds each effect via
  // QE.addVideoEffect / addAudioEffect and sets every saved param on
  // the destination clip. No clipboard race, no dialog flash.
  const captureEffectToSlot = async (index) => {
    if (!connected) {
      setToast("Premiere not connected — can't capture.");
      return;
    }
    if (!window.clipDeck || !window.clipDeck.captureEffectRecipe) {
      setToast("Save Attributes not available — relaunch the overlay.");
      return;
    }
    setToast("Saving attributes…");
    setCapturingIndex(index);
    try {
      // Null includeIndices = "every component on the source clip".
      // Backend returns { schemaVersion, capturedAt, mediaType, components: [...] }.
      const result = await window.clipDeck.captureEffectRecipe(null);
      if (!result || !result.ok) {
        const raw = (result && result.error) || "no detail";
        // Backend uses "Please select clips" for empty-selection failures.
        const msg = (raw === "Please select clips") ? "Please select a clip to save attributes" : raw;
        setToast(msg);
        return;
      }
      const recipe = result.value;
      await logEffectRecipeDiagnostics("capture", {
        source: "save-attributes",
        cardName: "slot " + KEYMAP[index],
        slotKey: KEYMAP[index],
        recipe,
        result: { ok: true, value: { diagnostics: [] } }
      });
      const slot = slots[index];
      // Best-effort cleanup of any old clipboard-payload capture left
      // behind by an earlier Save Attributes (pre-recipe model).
      if (slot && slot.clipboardFile && window.clipDeck.deleteCapture) {
        try { await window.clipDeck.deleteCapture(slot.clipboardFile); } catch (e) {}
      }
      const compCount = (recipe.components && recipe.components.length) || 0;
      const fxNames = (recipe.components || [])
        .filter((c) => c.kind === "effect")
        .map((c) => c.displayName)
        .slice(0, 3)
        .join(", ");
      const label = fxNames ? ("Saved Attributes · " + fxNames) : "Saved Attributes";
      updateSlot(index, {
        ...blankSlotContent(),
        name: label,
        kind: "effect",
        effectRecipe: recipe,
        capturedAt: Date.now(),
        capturedAttributes: true,       // keeps the saved-attributes V2 tile skin
      });
      setToast("Saved attributes ✓ · " + compCount + " component" + (compCount === 1 ? "" : "s"));
    } catch (err) {
      setToast("Save attributes failed: " + (err.message || err));
    } finally {
      setCapturingIndex(null);
    }
  };

  // Save Transition — user selects a transition on Premiere's timeline,
  // right-clicks an empty Clip Deck slot, picks Save Transition.
  // Clip Deck sends Cmd+C itself (so the user only needs to select),
  // snapshots the pasteboard payload to a slot file, then stores the
  // slot as a regular clipboard capture (kind: "clipboard"). Fire goes
  // through the existing fireClipboard path — restores the saved bytes
  // back onto the pasteboard, wakes Premiere's clipboard listener via
  // Edit > Paste Attributes (clickPasteAttributesMenu), then Cmd+Vs.
  const captureTransitionToSlot = async (index) => {
    if (!connected) {
      setToast("Premiere not connected — can't save transition.");
      return;
    }
    if (!window.clipDeck || !window.clipDeck.captureTransitionFromClipboard) {
      setToast("Save Transition not available — relaunch the overlay.");
      return;
    }
    setToast("Saving transition…");
    setCapturingIndex(index);
    try {
      const slot = slots[index];
      const slotKey = (slot && slot.key) || String(index);
      const result = await window.clipDeck.captureTransitionFromClipboard(slotKey);
      if (!result || !result.ok) {
        setToast(result && result.error ? result.error : "Save Transition failed.");
        return;
      }
      // Clear any previous capture file on this slot to avoid leaking.
      if (slot && slot.clipboardFile && window.clipDeck.deleteCapture) {
        try { await window.clipDeck.deleteCapture(slot.clipboardFile); } catch (e) {}
      }
      // Prefer the parsed display name; fall back to matchName, then a
      // generic label. The user can rename via the existing context menu.
      const displayName = result.displayName || result.matchName || "Saved Transition";
      updateSlot(index, {
        ...blankSlotContent(),
        name: displayName,
        kind: "clipboard",
        clipboardFile: result.filePath,
        capturedAt: Date.now(),
        captureBytes: result.totalBytes,
        captureSubtype: "transition",
        useTextThumb: true,
      });
      const durLabel = (result.durationFrames != null) ? ` · ${result.durationFrames}f` : "";
      setToast(`Transition saved · ${displayName}${durLabel}`);
    } catch (err) {
      setToast("Save Transition failed: " + (err.message || err));
    } finally {
      setCapturingIndex(null);
    }
  };

  const dropFile = (index, info) => {
    // Drop with no resolvable file path → almost certainly a drag from
    // Premiere's timeline. Trigger a selection capture instead.
    if (!info || !info.path) {
      if (info && info.fromPremiere) {
        captureToSlot(index);
      } else {
        setToast("Couldn't read the dropped file's path.");
      }
      return;
    }
    updateSlot(index, {
      path: info.path,
      name: (info.name || "Unnamed").replace(/\.[^.]+$/, ""),
      nodeId: null,
      kind: fileKind(info.path),
      thumb: null
    });
  };

  // Keyboard fire path. When the search bar has results visible, a
  // layout key (1-0 / Q-P / A-; / Z-/) fires the result at that grid
  // position instead of the underlying deck slot — the visible grid is
  // search results, so the user expects their hotkey to match what
  // they're looking at. If the position has no result (typed key past
  // the end of the result list), do nothing rather than falling
  // through to the now-hidden deck.
  const fireFromKeyboard = (index) => {
    if (window.CLIPDECK_DEMO) return; // demo: Premiere insert is a silent no-op
    if (searchResults) {
      const r = searchResults[index];
      if (r) fireSearchResult(r);
      return;
    }
    return fireSlot(index);
  };

  // Key capture — Electron renderer owns every key while window is visible.
  // Held in a ref so the listener isn't re-attached on every state tick.
  const fireRef = React.useRef(fireFromKeyboard);
  fireRef.current = fireFromKeyboard;
  const configRef = React.useRef(config);
  configRef.current = config;
  // Library + deck cycling state, behind refs so the keydown listener
  // doesn't get re-attached on every state tick.
  const activeLibIdxRef = React.useRef(activeLibraryIndex);
  activeLibIdxRef.current = activeLibraryIndex;
  const libCountRef = React.useRef(libraries.length);
  libCountRef.current = libraries.length;
  const pickLibraryRef = React.useRef(pickLibrary);
  pickLibraryRef.current = pickLibrary;
  const deckCountRef = React.useRef(decks.length);
  deckCountRef.current = decks.length;
  const pickDeckRef = React.useRef(pickDeck);
  pickDeckRef.current = pickDeck;
  const palOpenRef = React.useRef(palOpen);
  palOpenRef.current = palOpen;
  const prefsOpenRef = React.useRef(prefsOpen);
  prefsOpenRef.current = prefsOpen;
  const ctxOpenRef = React.useRef(contextMenu);
  ctxOpenRef.current = contextMenu;
  const libCtxRef = React.useRef(libContextMenu);
  libCtxRef.current = libContextMenu;
  const addLibCtxRef = React.useRef(addLibContextMenu);
  addLibCtxRef.current = addLibContextMenu;
  const deckCtxRef = React.useRef(deckContextMenu);
  deckCtxRef.current = deckContextMenu;
  const confirmRef = React.useRef(confirmDialog);
  confirmRef.current = confirmDialog;
  const recordingHotkeyRef = React.useRef(recordingHotkey);
  recordingHotkeyRef.current = recordingHotkey;
  const recordingSearchHotkeyRef = React.useRef(recordingSearchHotkey);
  recordingSearchHotkeyRef.current = recordingSearchHotkey;
  // Tool context-menu ref so the global keydown bail-out covers it the
  // same way it covers the library / deck context menus.
  const toolCtxRef = React.useRef(toolContextMenu);
  toolCtxRef.current = toolContextMenu;

  // Refs for the wheel-navigation effect (set up once with [] deps).
  // mainView / activeTool / per-view deck count / search & paywall gates
  // all read through refs so the listener doesn't re-bind every tick.
  const mainViewRef = React.useRef(mainView);
  mainViewRef.current = mainView;
  const activeToolRef = React.useRef(activeTool);
  activeToolRef.current = activeTool;
  const activeDeckIdxRef = React.useRef(activeDeckIndex);
  activeDeckIdxRef.current = activeDeckIndex;
  const toolDeckIdxRef = React.useRef(toolDeckIndex);
  toolDeckIdxRef.current = toolDeckIndex;
  const toolDeckCountRef = React.useRef(toolDecks.length);
  toolDeckCountRef.current = toolDecks.length;
  const searchActiveRef = React.useRef(!!searchResults);
  searchActiveRef.current = !!searchResults;
  const paywallOpenRef = React.useRef(!!paywall);
  paywallOpenRef.current = !!paywall;
  const isProRef = React.useRef(!!(license && license.isPro));
  isProRef.current = !!(license && license.isPro);

  // Free-tier snap-back. Whenever the user is on Free (whether from a
  // Pro→Free remote sign-out, a refund, or a cold start with a
  // persisted activeLibraryIndex > 0 from a prior Pro session),
  // collapse the active coords to library 0 / deck 0 — anything else
  // points at a now-locked location. Gated on PAYWALL_ENABLED so dev
  // builds with the paywall disabled don't auto-collapse, and on
  // !license.loading so the snap doesn't fire on the brief
  // initial-render window where isPro is still false from FREE_STATE.
  React.useEffect(() => {
    if (!window.PAYWALL_ENABLED) return;
    if (!license || license.loading) return;
    if (license.isPro) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const li = prev.activeLibraryIndex || 0;
      const di = prev.activeDeckIndex || 0;
      if (li === 0 && di === 0) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      next.activeLibraryIndex = 0;
      next.activeDeckIndex = 0;
      return next;
    });
  }, [license && license.isPro, license && license.loading]);

  // Pro Onboarding — gate: the first Free→Pro flip, not yet seen.
  // Resolved (non-loading) Pro license AND the persisted
  // `proOnboardingSeen` config flag still unset.
  const proOnboardingGate = !!(
    license && !license.loading && license.isPro
    && config && !config.proOnboardingSeen
    && window.ProOnboarding
  );
  // Fire the panel + confetti immediately the moment the gate opens.
  // The previous design held the celebration behind a 2-second
  // frontmost-focus countdown because the LemonSqueezy magic-link path
  // flipped Pro WHILE the user was still in their browser — they'd have
  // missed the burst. The Gumroad activate-key path happens INSIDE
  // Clip Deck (user pastes their key and clicks Activate Pro), so the
  // user is already looking at the app; the delay was just dead air.
  const proOnboardingReady = proOnboardingGate;
  // Manual-open path — any Pro badge in the app (Preferences top-right,
  // Recently Used header) can call setManualProOnboardingOpen(true) to
  // pop the modal instantly, no first-flip gating.
  const [manualProOnboardingOpen, setManualProOnboardingOpen] = React.useState(false);
  const onOpenProOnboarding = React.useCallback(() => setManualProOnboardingOpen(true), []);
  // Every successful license-key activation re-fires the onboarding,
  // even if proOnboardingSeen is already true on this Mac. Triggers:
  // first-ever Pro activation, re-activation after sign-out, re-
  // activation after a 30-day refund. main.js fires "license:activated"
  // exclusively from the activate-key success path (NOT from the
  // periodic heartbeat refresh), so this listener only sees genuine
  // user-driven activations. The manual-open flag OR's into
  // proOnboardingOpen, so the gate's `!proOnboardingSeen` check is
  // bypassed and the celebration plays every time.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onLicenseActivated) return;
    return window.clipDeck.onLicenseActivated(() => {
      setManualProOnboardingOpen(true);
    });
  }, []);
  // Panel is actually up when EITHER the manual-open flag is set OR the
  // auto-gate fired. The ref lets the keyboard + wheel handlers bail
  // out while the modal covers the panel.
  const proOnboardingOpen = manualProOnboardingOpen || proOnboardingReady;
  const proOnboardingOpenRef = React.useRef(proOnboardingOpen);
  proOnboardingOpenRef.current = proOnboardingOpen;
  // Post-refund "Help us improve Clip Deck" modal — opens once after a
  // successful refund (license flipped to Free + hasRefunded=true).
  // `refundFeedbackSeen` persists in config so the modal never re-pops,
  // even if the user closes the app before submitting.
  const refundFeedbackOpen = !!(
    license && !license.loading && !license.isPro && license.hasRefunded
    && config && !config.refundFeedbackSeen
    && window.RefundFeedback
  );
  const refundFeedbackOpenRef = React.useRef(refundFeedbackOpen);
  refundFeedbackOpenRef.current = refundFeedbackOpen;
  const setToolDeckIndexRef = React.useRef(setToolDeckIndex);
  setToolDeckIndexRef.current = setToolDeckIndex;
  const setActiveToolRef = React.useRef(setActiveTool);
  setActiveToolRef.current = setActiveTool;
  const setMainViewRef = React.useRef(setMainView);
  setMainViewRef.current = setMainView;

  // Sync library + tool hotkeys to Electron's globalShortcut whenever
  // the underlying hotkey set changes. Bindings registered through main
  // fire regardless of which app is foreground — so the user can be in
  // Premiere, hit (say) Alt+1, and Clip Deck pops up directly on the
  // Pixabay tool. The renderer handles the in-app activation when the
  // panel is already visible via the onNavActivate subscription below.
  //
  // Dep is the stringified hotkey set so library renames / deck adds /
  // slot edits don't trigger spurious re-registrations.
  const navHotkeyPayload = React.useMemo(() => {
    if (!config) return null;
    const libraries = (config.libraries || [])
      .map((lib, idx) => (lib && lib.hotkey) ? { accel: lib.hotkey, libIdx: idx } : null)
      .filter(Boolean);
    // Deck hotkeys carry both libIdx + deckIdx so the trigger can
    // switch to the right library AND the right deck within it.
    const decks = [];
    (config.libraries || []).forEach((lib, libIdx) => {
      (lib && lib.decks || []).forEach((deck, deckIdx) => {
        if (deck && deck.hotkey) decks.push({ accel: deck.hotkey, libIdx, deckIdx });
      });
    });
    const tools = Object.entries(config.toolHotkeys || {})
      .filter(([_, accel]) => !!accel)
      .map(([toolName, accel]) => ({ accel, toolName }));
    return { libraries, decks, tools };
  }, [config]);
  const navHotkeySig = React.useMemo(
    () => navHotkeyPayload ? JSON.stringify(navHotkeyPayload) : "",
    [navHotkeyPayload]
  );
  React.useEffect(() => {
    if (!navHotkeyPayload || !window.clipDeck || !window.clipDeck.registerNavHotkeys) return;
    (async () => {
      try {
        const failed = await window.clipDeck.registerNavHotkeys(navHotkeyPayload);
        if (failed && failed.length) {
          // A combo can be refused if another app already grabbed it
          // (or if it's malformed). Show a single toast with the first
          // failure so the user knows to pick a different combo.
          const first = failed[0];
          setToast(`Couldn't bind ${hotkeyLabel(first.accel)} — try a different combo`);
        }
      } catch (e) { /* non-fatal */ }
    })();
  }, [navHotkeySig]);

  // Global nav hotkeys can fire while the overlay is hidden. We render
  // those through `instantRoute`, a display-only route that sits above
  // config while the target deck is preparing. That lets main keep the
  // BrowserWindow hidden until this renderer has already drawn the
  // requested route, instead of revealing the previous deck and then
  // switching visually.
  const navReadySeqRef = React.useRef(0);
  const navReadySentRef = React.useRef(null);
  const sendNavReady = (requestId) => {
    if (!window.clipDeck || !window.clipDeck.notifyNavReady) return;
    try { window.clipDeck.notifyNavReady(requestId); } catch (e) {}
  };
  const withFlushSync = (fn) => {
    if (typeof ReactDOM !== "undefined" && ReactDOM.flushSync) {
      ReactDOM.flushSync(fn);
    } else {
      fn();
    }
  };
  const afterRoutePaint = (route, cb) => {
    if (!route || route.openMode !== "hidden") {
      cb();
      return () => {};
    }
    let cancelled = false;
    let raf1 = null;
    let raf2 = null;
    const fallback = setTimeout(() => {
      if (!cancelled) cb();
    }, 120);
    const done = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(fallback);
      cb();
    };
    if (typeof requestAnimationFrame === "function") {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(done);
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      if (raf1 != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf1);
      if (raf2 != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf2);
    };
  };
  const buildRouteFromAction = (action) => {
    const c = configRef.current;
    if (!action || !c || !Array.isArray(c.libraries) || !c.libraries.length) return null;
    if (action.kind === "library" && typeof action.libIdx === "number") {
      const libIdx = clampRouteIndex(action.libIdx, c.libraries.length);
      return {
        id: ++navReadySeqRef.current,
        requestId: action.requestId,
        openMode: action.openMode || "visible",
        kind: "library",
        mainView: "slots",
        activeTool: null,
        libIdx,
        deckIdx: 0,
        persistOnOpen: action.openMode === "hidden"
      };
    }
    if (action.kind === "deck" && typeof action.libIdx === "number" && typeof action.deckIdx === "number") {
      const libIdx = clampRouteIndex(action.libIdx, c.libraries.length);
      const lib = c.libraries[libIdx] || c.libraries[0];
      const deckCount = lib && Array.isArray(lib.decks) ? lib.decks.length : 0;
      const deckIdx = clampRouteIndex(action.deckIdx, deckCount);
      return {
        id: ++navReadySeqRef.current,
        requestId: action.requestId,
        openMode: action.openMode || "visible",
        kind: "deck",
        mainView: "slots",
        activeTool: null,
        libIdx,
        deckIdx,
        persistOnOpen: action.openMode === "hidden"
      };
    }
    if (action.kind === "tool" && action.toolName) {
      return {
        id: ++navReadySeqRef.current,
        requestId: action.requestId,
        openMode: action.openMode || "visible",
        kind: "tool",
        mainView: "tool",
        activeTool: action.toolName,
        libIdx: null,
        deckIdx: null,
        persistOnOpen: false
      };
    }
    return null;
  };

  React.useLayoutEffect(() => {
    if (!instantRoute || !instantRoute.requestId) return;
    let matched = false;
    if (instantRoute.kind === "library" || instantRoute.kind === "deck") {
      matched = displayMainView === "slots"
        && displayActiveTool === null
        && activeLibraryIndex === instantRoute.libIdx
        && activeDeckIndex === instantRoute.deckIdx;
    } else if (instantRoute.kind === "tool") {
      matched = displayMainView === "tool"
        && displayActiveTool === instantRoute.activeTool;
    }
    if (!matched) return;

    let cancelReady = null;
    if (navReadySentRef.current !== instantRoute.requestId) {
      cancelReady = afterRoutePaint(instantRoute, () => {
        if (navReadySentRef.current === instantRoute.requestId) return;
        navReadySentRef.current = instantRoute.requestId;
        sendNavReady(instantRoute.requestId);
      });
    }

    if (instantNavTimerRef.current) clearTimeout(instantNavTimerRef.current);
    if (instantRoute.openMode === "hidden") {
      return () => {
        if (cancelReady) cancelReady();
      };
    }
    const routeId = instantRoute.id;
    const routeKind = instantRoute.kind;
    const routeLibIdx = instantRoute.libIdx;
    const routeDeckIdx = instantRoute.deckIdx;
    const routeToolName = instantRoute.activeTool;
    instantNavTimerRef.current = setTimeout(() => {
      setInstantNavActive(false);
      setInstantRoute((cur) => {
        if (!cur || cur.id !== routeId) return cur;
        const c = configRef.current;
        if (routeKind === "tool") {
          return mainViewRef.current === "tool" && activeToolRef.current === routeToolName ? null : cur;
        }
        if (!c) return cur;
        const cLibIdx = clampRouteIndex(c.activeLibraryIndex || 0, (c.libraries || []).length);
        const cLib = (c.libraries || [])[cLibIdx];
        const cDeckIdx = clampRouteIndex(c.activeDeckIndex || 0, cLib && cLib.decks ? cLib.decks.length : 0);
        return mainViewRef.current === "slots"
          && activeToolRef.current === null
          && cLibIdx === routeLibIdx
          && cDeckIdx === routeDeckIdx
          ? null
          : cur;
      });
    }, 160);
    return () => {
      if (cancelReady) cancelReady();
    };
  }, [instantRoute, displayMainView, displayActiveTool, activeLibraryIndex, activeDeckIndex]);

  // Hidden deck/library hotkeys should behave like the clean Pixabay
  // route: render the target first, reveal the window, then persist the
  // target as the remembered deck underneath. Keeping instantRoute alive
  // until `overlay:opened` prevents the normal config route from taking
  // over during the first visible frame.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onOpened) return;
    return window.clipDeck.onOpened(() => {
      const route = instantRouteRef.current;
      if (!route || route.openMode !== "hidden") return;
      if (instantNavTimerRef.current) clearTimeout(instantNavTimerRef.current);
      if (route.persistOnOpen && (route.kind === "library" || route.kind === "deck")) {
        withFlushSync(() => {
          setMainView("slots");
          setActiveTool(null);
          setConfig((prev) => {
            if (!prev) return prev;
            const next = JSON.parse(JSON.stringify(prev));
            next.activeLibraryIndex = route.libIdx;
            next.activeDeckIndex = route.deckIdx;
            return next;
          });
        });
      }
      const routeId = route.id;
      instantNavTimerRef.current = setTimeout(() => {
        setInstantNavActive(false);
        setInstantRoute((cur) => (cur && cur.id === routeId ? null : cur));
      }, 120);
    });
  }, []);

  // Receive navigation messages from main when a library / tool global
  // hotkey fires. Switches the active library or opens the tool view.
  // The `kind: "deck"` case explicitly batches activeLibraryIndex +
  // activeDeckIndex into ONE setConfig (replacing the old pickLibrary +
  // setTimeout pickDeck sequence), so visible hotkey switches do not
  // flash Library M Deck 0 between the library switch and deck switch.
  React.useEffect(() => {
    if (!window.clipDeck || !window.clipDeck.onNavActivate) return;
    return window.clipDeck.onNavActivate((action) => {
      if (!action) return;
      // Free-tier gate: a library hotkey targeting libIdx > 0, or a deck
      // hotkey targeting any locked (libIdx > 0 OR deckIdx > 0) location
      // pops the paywall instead of routing. sendNavReady unblocks main
      // so the overlay still shows the panel + paywall over the current
      // view rather than the requested locked one. Tool hotkeys are not
      // gated here — tool gating already happens inside the tool view.
      if (window.PAYWALL_ENABLED && !isProRef.current) {
        const locked = (action.kind === "library" && (action.libIdx || 0) > 0)
          || (action.kind === "deck" && ((action.libIdx || 0) > 0 || (action.deckIdx || 0) > 0));
        if (locked) {
          setPaywall({ feature: action.kind === "library" ? "library" : "deck" });
          sendNavReady(action.requestId);
          return;
        }
      }
      const route = buildRouteFromAction(action);
      if (!route) {
        // Hidden-window opens intentionally have no wrong-deck fallback.
        // If we cannot build a real route, let main time out and keep the
        // overlay hidden rather than revealing whatever deck was current.
        if (action.openMode === "visible") sendNavReady(action.requestId);
        return;
      }
      withFlushSync(() => {
        setInstantNavActive(true);
        setInstantRoute(route);
        if (route.kind === "tool") {
          setActiveTool(route.activeTool);
          setMainView("tool");
          return;
        }
        setMainView("slots");
        setActiveTool(null);
        if (!route.persistOnOpen) {
          setConfig((prev) => {
            if (!prev) return prev;
            const next = JSON.parse(JSON.stringify(prev));
            next.activeLibraryIndex = route.libIdx;
            next.activeDeckIndex = route.deckIdx;
            return next;
          });
        }
      });
    });
  }, []);
  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const inEditable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      // The ConfirmDialog has its own capture-phase Esc/Enter listener that
      // runs before this one — when it's open we just bow out and let it.
      if (confirmRef.current) return;

      // Pro Onboarding covers the whole panel — it owns the keyboard
      // (its own Esc-to-close listener handles dismissal). Don't let
      // slot-fire / Tab / Cmd+Digit leak through to the panel beneath.
      if (proOnboardingOpenRef.current) return;
      // Same treatment for the post-refund feedback modal.
      if (refundFeedbackOpenRef.current) return;

      // Hotkey-rebind modes own the keyboard until they capture a key
      // or Esc.
      if (recordingHotkeyRef.current || recordingSearchHotkeyRef.current) return;

      // Any context menu open → only Escape gets through (handled
      // below). Tab / Cmd+Digit / fire-keys are blocked so they don't
      // interfere with menu interaction.
      const ctxOpen = !!(ctxOpenRef.current || libCtxRef.current || addLibCtxRef.current || deckCtxRef.current || toolCtxRef.current);

      const searchHotkey = (configRef.current && configRef.current.searchHotkey) || "CommandOrControl+`";
      if (eventMatchesAccelerator(e, searchHotkey)) {
        e.preventDefault(); e.stopPropagation();
        focusSearchInput();
        return;
      }
      // Deck switching has no default keyboard shortcut. Users assign
      // their own hotkey to each deck via the deck's right-click menu
      // (HotkeyContextMenu → Set Hotkey). Those user-assigned hotkeys
      // are registered as Electron globalShortcuts in main.js and reach
      // the renderer via the `nav:activate` IPC subscription set up
      // further up in this file. Same wiring as library + tool hotkeys.
      if (e.code === "Escape") {
        if (ctxOpenRef.current)  { e.preventDefault(); e.stopPropagation(); setContextMenu(null);     return; }
        if (libCtxRef.current)   { e.preventDefault(); e.stopPropagation(); setLibContextMenu(null);  return; }
        if (addLibCtxRef.current){ e.preventDefault(); e.stopPropagation(); setAddLibContextMenu(null); return; }
        if (deckCtxRef.current)  { e.preventDefault(); e.stopPropagation(); setDeckContextMenu(null); return; }
        if (toolCtxRef.current)  { e.preventDefault(); e.stopPropagation(); setToolContextMenu(null); return; }
        if (palOpenRef.current)  { e.preventDefault(); e.stopPropagation(); setPalOpen(false);       return; }
        if (prefsOpenRef.current){ e.preventDefault(); e.stopPropagation(); setPrefsOpen(false);     return; }
        if (window.clipDeck && window.clipDeck.hideOverlay) window.clipDeck.hideOverlay();
        return;
      }
      // Tab cycles libraries (Shift+Tab reverses). Inside an editable
      // field we still swallow Tab to keep it from default-shifting
      // focus across inputs, but we don't cycle libraries while the
      // user is typing in search or renaming a deck — that would be
      // jarring. Placed BEFORE the inEditable bail because we want to
      // swallow Tab everywhere (we just only act on it outside inputs).
      if (e.code === "Tab") {
        e.preventDefault(); e.stopPropagation();
        if (inEditable || ctxOpen) return;
        // Free-tier: only library 0 is accessible. Tab is a no-op rather
        // than cycling through locked libraries.
        const proCount = libCountRef.current || 0;
        const count = (window.PAYWALL_ENABLED && !isProRef.current) ? Math.min(proCount, 1) : proCount;
        if (count <= 1) return;
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (activeLibIdxRef.current + dir + count) % count;
        pickLibraryRef.current(nextIdx);
        return;
      }
      if (inEditable) return;
      // Swallow other keys while any context menu is open — the user is
      // interacting with the menu, not firing slots. toolCtxRef included
      // so a Shift+letter pressed in the tool-hotkey recorder doesn't
      // also fire a slot in the active deck.
      if (ctxOpenRef.current || libCtxRef.current || deckCtxRef.current || toolCtxRef.current) {
        e.preventDefault(); e.stopPropagation();
        return;
      }

      e.preventDefault(); e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const idx = KEY_CODE_TO_INDEX[e.code];
      if (idx != null) fireRef.current(idx);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Scroll-wheel navigation:
  //   • plain scroll = cycle decks within the current view (1 tick = 1 deck)
  //   • shift+scroll = cycle libraries+tools (1 tick = 1 entry)
  //
  // The accumulator + gesture-reset window converts trackpad inertia
  // (many small deltaY events from one physical swipe) into discrete
  // steps the same way a notched mouse wheel produces them — so a single
  // flick produces roughly one switch, not the 5-10 a naive
  // "deltaY > threshold" check would.
  React.useEffect(() => {
    // demo: no scroll-wheel deck/library switching. Disabled so the embedded
    // landing-page panel never hijacks the visitor's page scroll.
    if (window.CLIPDECK_DEMO) return;
    let accum = 0;
    let lastEventAt = 0;
    let lastSwitchAt = 0;
    const STEP = 100;            // px of accumulated wheel = 1 switch
    const COOLDOWN_MS = 120;     // min ms between fires (rate cap)
    const GESTURE_RESET_MS = 250; // no events for this long → fresh gesture

    // Tools the user can scroll INTO via shift+scroll. Locked tools are
    // skipped on Free tier so the library cycle never lands on a paywall.
    // Pixabay/Utility/Youtube have no decks but are still valid library
    // destinations — a plain scroll on them is a no-op (deck count = 0).
    const ALL_TOOLS = ["Effects", "Transitions", "Pixabay", "Utility Plugins", "Youtube"];
    const FREE_TOOLS = ["Effects", "Transitions"];

    const findScrollableAncestor = (el, stopAt) => {
      let node = el;
      while (node && node !== stopAt && node !== document.body) {
        if (node.nodeType === 1) {
          const cs = window.getComputedStyle(node);
          const oy = cs.overflowY;
          if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 1) {
            return node;
          }
        }
        node = node.parentNode;
      }
      return null;
    };

    const accessibleTools = () => (isProRef.current ? ALL_TOOLS : FREE_TOOLS);

    const switchLibraryOrTool = (dir) => {
      const proLibs = libCountRef.current || 0;
      // Free-tier: only library 0 is in the cycle. Locked libraries are
      // skipped so wheel-cycle never parks on a paywall.
      const libs = (window.PAYWALL_ENABLED && !isProRef.current) ? Math.min(proLibs, 1) : proLibs;
      const tools = accessibleTools();
      const entries = libs + tools.length;
      if (entries <= 1) return;
      let pos;
      if (mainViewRef.current === "tool") {
        const toolIdx = tools.indexOf(activeToolRef.current);
        pos = libs + (toolIdx >= 0 ? toolIdx : 0);
      } else {
        pos = activeLibIdxRef.current || 0;
      }
      const nextPos = (pos + dir + entries) % entries;
      if (nextPos < libs) {
        if (pickLibraryRef.current) pickLibraryRef.current(nextPos);
      } else {
        const toolName = tools[nextPos - libs];
        if (setActiveToolRef.current) setActiveToolRef.current(toolName);
        if (setMainViewRef.current) setMainViewRef.current("tool");
      }
    };

    const switchDeck = (dir) => {
      if (mainViewRef.current === "tool") {
        const count = toolDeckCountRef.current || 0;
        if (count <= 1) return;
        const cur = toolDeckIdxRef.current || 0;
        const next = (cur + dir + count) % count;
        if (setToolDeckIndexRef.current) setToolDeckIndexRef.current(next);
      } else {
        // Free-tier: only deck 0 in library 0 is accessible. Wheel-deck
        // cycle is a no-op so it never lands on a locked deck. (User is
        // already on library 0 here — the library-switch path enforces
        // that via the locked treatment above.)
        const proCount = deckCountRef.current || 0;
        const count = (window.PAYWALL_ENABLED && !isProRef.current) ? Math.min(proCount, 1) : proCount;
        if (count <= 1) return;
        const cur = activeDeckIdxRef.current || 0;
        const next = (cur + dir + count) % count;
        if (pickDeckRef.current) pickDeckRef.current(next);
      }
    };

    const onWheel = (e) => {
      // Hard bail-outs — anywhere the user is interacting with an overlay
      // or has a scrollable surface that should consume its own wheel.
      if (searchActiveRef.current) return;
      if (paywallOpenRef.current) return;
      if (proOnboardingOpenRef.current) return;
      if (refundFeedbackOpenRef.current) return;
      if (prefsOpenRef.current) return;
      if (confirmRef.current) return;
      if (palOpenRef.current) return;
      if (recordingHotkeyRef.current || recordingSearchHotkeyRef.current) return;
      if (ctxOpenRef.current || libCtxRef.current || addLibCtxRef.current
          || deckCtxRef.current || toolCtxRef.current) return;

      // Let real scrollable regions (settings list, search overflow, etc)
      // keep their native wheel. Climbs up to <body> looking for an
      // ancestor with overflow:auto/scroll AND actual scrollable content.
      if (findScrollableAncestor(e.target, null)) return;

      // Chromium converts vertical wheel to deltaX when Shift is held
      // (the platform convention for "horizontal scroll"). We treat
      // whichever axis carries the dominant magnitude as the gesture
      // direction so Shift+Wheel works on both mouse wheels and trackpads.
      const dy = e.deltaY || 0;
      const dx = e.deltaX || 0;
      const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (delta === 0) return;

      const now = Date.now();
      if (now - lastEventAt > GESTURE_RESET_MS) accum = 0;
      lastEventAt = now;
      accum += delta;

      if (Math.abs(accum) < STEP) {
        // Still under threshold — consume the wheel so the page doesn't
        // do whatever default it would (we own the gesture).
        e.preventDefault();
        return;
      }
      if (now - lastSwitchAt < COOLDOWN_MS) {
        e.preventDefault();
        return;
      }

      const dir = accum > 0 ? 1 : -1;
      accum -= dir * STEP;
      lastSwitchAt = now;
      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey) switchLibraryOrTool(dir);
      else switchDeck(dir);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel, { passive: false });
  }, []);

  // Hotkey rebinder — when recording is active, capture the next non-modifier
  // press, register it via Electron's globalShortcut, and persist to config.
  // Esc cancels without changing anything.
  React.useEffect(() => {
    if (!recordingHotkey) return;
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecordingHotkey(false);
        return;
      }
      const accel = keyEventToAccelerator(e);
      if (!accel) return; // pure modifier — keep listening
      const previous = (config && config.panelHotkey) || "`";
      let ok = false;
      try { ok = await window.clipDeck.setHotkey(accel); } catch (err) { ok = false; }
      setRecordingHotkey(false);
      if (!ok) {
        setToast(`Couldn't bind ${hotkeyLabel(accel)} — try a different key`);
        try { await window.clipDeck.setHotkey(previous); } catch (err) {}
        return;
      }
      setConfig((prev) => ({ ...prev, panelHotkey: accel }));
      setToast(`Panel hotkey set to ${hotkeyLabel(accel)}`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingHotkey, config]);

  // Search-hotkey recorder — launched from the small shortcut indicator
  // inside the search bar. Same capture semantics as the panel hotkey:
  // Esc cancels, modifier-only presses keep listening, and failed
  // globalShortcut registrations roll back to the prior binding.
  React.useEffect(() => {
    if (!recordingSearchHotkey) return;
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecordingSearchHotkey(false);
        return;
      }
      const accel = keyEventToAccelerator(e);
      if (!accel) return;
      const previous = (config && config.searchHotkey) || "CommandOrControl+`";
      let ok = false;
      try { ok = await window.clipDeck.setSearchHotkey(accel); } catch (err) { ok = false; }
      setRecordingSearchHotkey(false);
      if (!ok) {
        setToast(`Couldn't bind ${hotkeyLabel(accel)} — try a different key`);
        try { await window.clipDeck.setSearchHotkey(previous); } catch (err) {}
        return;
      }
      setSearchHotkey(accel);
      setToast(`Search hotkey set to ${hotkeyLabel(accel)}`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingSearchHotkey, config]);

  // All hooks are above this line. Safe to early-return now.
  if (!config) {
    return <div className="cd-stage"><div style={{color:"#8A8F9C"}}>Loading…</div></div>;
  }

  const cssVars = {
    "--cd-bg": palette.bg,
    "--cd-panel": palette.panel,
    "--cd-panel2": palette.panel2,
    "--cd-line": palette.line,
    "--cd-line2": palette.line2,
    "--cd-text": palette.text,
    "--cd-muted": palette.muted,
    "--cd-dim": palette.dim,
    "--cd-accent": accent.hex,
    "--cd-accent-soft": accent.soft,
    "--cd-accent-glow": accent.glow,
  };

  return (
    <div className="cd-stage">
      <div className="cd-bezel" style={{ width: "100%", height: "100%" }}>
        <div className={`cd-panel${instantNavActive ? " cd-instant-nav" : ""}`} style={cssVars} data-density={config.tweaks.density}>
          <Sidebar
            libraries={libraries}
            activeLibraryIndex={activeLibraryIndex}
            onPickLibrary={pickLibrary}
            onAddLibrary={addLibrary}
            onAddLibraryContextMenu={openAddLibContextMenu}
            editingLibIndex={editingLibIndex}
            onStartRenameLib={(i) => setEditingLibIndex(i)}
            onFinishRenameLib={() => setEditingLibIndex(null)}
            onRenameLib={renameLibrary}
            onLibraryContextMenu={openLibContextMenu}
            onLockedLibraryClick={() => {
              if (window.PAYWALL_ENABLED) setPaywall({ feature: "library" });
            }}
            accent={accent} density={config.tweaks.density}
            query={query} onQuery={setQuery}
            onSearchKeyDown={onSearchKeyDown}
            onFocusSearch={focusSearchInput}
            searchHotkey={config.searchHotkey}
            recordingSearchHotkey={recordingSearchHotkey}
            onClickSearchHotkey={() => {
              setRecordingHotkey(false);
              setRecordingSearchHotkey((r) => !r);
            }}
            dragActive={dragSource != null}
            onLibraryDwellSwitch={pickLibrary}
            onUpgradeClick={() => setPaywall({ feature: null })}
            activeTool={displayMainView === "tool" ? displayActiveTool : null}
            isPro={!!(license && license.isPro)}
            onOpenTool={(toolName) => {
              setActiveTool(toolName);
              setMainView("tool");
            }}
            onToolContextMenu={(toolName, e) => {
              setToolContextMenu({ x: e.clientX, y: e.clientY, toolName });
            }}
            onLockedToolClick={(toolName) => {
              // Pixabay, Utility Plugins, and Youtube each have their
              // own inline paywall (blurred panel + custom upgrade card)
              // — navigate INTO the view so that paywall can render.
              // Other locked tools (if any are added later) still
              // surface the generic Paywall modal.
              if (toolName === "Pixabay" || toolName === "Utility Plugins" || toolName === "Youtube") {
                setActiveTool(toolName);
                setMainView("tool");
                return;
              }
              if (window.PAYWALL_ENABLED) setPaywall({ feature: "tools" });
            }}
            searchLocked={false}
            onLockedSearchClick={() => setPaywall({ feature: "search" })}
            prefsOpen={prefsOpen}
            onTogglePrefs={() => setPrefsOpen((v) => !v)}
            onClosePrefs={() => setPrefsOpen(false)}
            insertMode={insertMode}
            onInsertModeChange={setInsertMode}
          />
          <div className="cd-main">
            <Topbar
              decks={topbarDecks}
              activeDeckIndex={topbarActiveDeckIndex}
              onPickDeck={pickDeck}
              // Curated tool decks: no add / rename / context-menu mutations
              // exposed in tool view. The Topbar hides the Add Deck button
              // when onAddDeck is undefined; the DeckTab swallows dbl-click
              // rename when onStartRename is undefined.
              onAddDeck={displayMainView === "tool" ? undefined : addDeck}
              editingDeckIndex={displayMainView === "tool" ? null : editingDeckIndex}
              onStartRenameDeck={displayMainView === "tool" ? undefined : (i) => setEditingDeckIndex(i)}
              onFinishRenameDeck={() => setEditingDeckIndex(null)}
              onRenameDeck={displayMainView === "tool" ? undefined : renameDeck}
              onDeckContextMenu={displayMainView === "tool" ? undefined : openDeckContextMenu}
              accent={accent}
              dragActive={dragSource != null}
              onDeckDwellSwitch={pickDeck}
              isPro={!!(license && license.isPro)}
              onLockedDeckClick={displayMainView === "tool" ? undefined : () => {
                if (window.PAYWALL_ENABLED) setPaywall({ feature: "deck" });
              }}
            />
            <div className="cd-content">
              {/* YouTube webview is always mounted (after the first
                  activation) so playback state survives view/tool
                  switches. Visibility + pause/refresh logic lives
                  inside the component. */}
              <YoutubeBrowser
                accent={accent}
                isActive={displayMainView === "tool" && displayActiveTool === "Youtube"}
                isLocked={displayMainView === "tool" && displayActiveTool === "Youtube" && window.PAYWALL_ENABLED && !window.BETA_NO_PAYWALL && license && !license.isPro}
                refreshSignal={youtubeRefreshSignal}/>
              {/* INTHEZONE plugin backgrounds — always mounted for
                  owned plugins. The visible panel webview lives
                  inside UtilityPluginsPanel's PluginPanel and comes
                  and goes; the background here owns the HTTP bridge
                  + helper-binary coordination and stays alive
                  regardless of UI navigation. */}
              <PluginBackgroundHost
                plugins={ownedPlugins}
                shimUrl={pluginShimUrl}
                cepPort={pluginCepPort}/>
              {/* Search results take priority over every other view: when
                  the user has typed in the search bar, results render
                  here regardless of whether they were on a library, on a
                  tool deck, or inside a panel-driven tool (Pixabay /
                  Utility Plugins / Youtube). Clearing the query returns
                  them to whichever view was active before. */}
              {searchResults
                ? (
                  <SearchResults
                    results={searchResults}
                    accent={accent}
                    onActivate={fireSearchResult}
                    query={query.trim()}
                    selectedIndex={searchSelectedIdx}/>
                )
                : displayMainView === "tool" && displayActiveTool === "Youtube"
                ? (
                  (window.PAYWALL_ENABLED && !window.BETA_NO_PAYWALL && license && !license.isPro)
                    ? (
                      // Free user — the YoutubeBrowser sibling above is
                      // already blurred (via isLocked). YoutubePaywall is
                      // position:absolute and anchors to .cd-content (now
                      // position:relative), overlaying the webview cell
                      // directly. No wrapper needed — wrapping in a
                      // sibling grid item would put the paywall in its
                      // own column next to the webview instead of on
                      // top of it.
                      <YoutubePaywall
                        key="tool-youtube-paywall"
                        onCheckout={() => { if (license && license.openCheckout) license.openCheckout(); }}
                        onAlreadyPro={() => setPaywall({ feature: "tools", view: "login" })}/>
                    )
                    : null
                )
                : displayMainView === "tool" && displayActiveTool === "Pixabay"
                ? (
                  (window.PAYWALL_ENABLED && !window.BETA_NO_PAYWALL && license && !license.isPro)
                    ? (
                      // Free user — render Pixabay browser blurred + dimmed
                      // with the upgrade overlay on top. Pointer-events
                      // disabled on the blurred layer so clicks pass through
                      // to the overlay's CTA only.
                      <div className="cd-pixabay-locked" key="tool-pixabay-locked">
                        <div className="cd-pixabay-locked-bg">
                          <SfxBrowser
                            accent={accent}
                            apiKey={(config && config.pixabayApiKey) || ""}
                            onSaveApiKey={() => {}}
                            connected={connected}
                            insertMode={insertMode}
                            onToast={() => {}}
                            onError={() => {}}
                            onImported={() => {}}
                            refreshSignal={pixabayRefreshSignal}/>
                        </div>
                        <PixabayPaywall
                          onCheckout={() => { if (license && license.openCheckout) license.openCheckout(); }}
                          onAlreadyPro={() => setPaywall({ feature: "pixabay", view: "login" })}/>
                      </div>
                    )
                    : (
                      <SfxBrowser
                        key="tool-pixabay"
                        accent={accent}
                        apiKey={(config && config.pixabayApiKey) || ""}
                        onSaveApiKey={(k) => setConfig((prev) => {
                          const next = JSON.parse(JSON.stringify(prev));
                          next.pixabayApiKey = k;
                          return next;
                        })}
                        connected={connected}
                        insertMode={insertMode}
                        onToast={setToast}
                        onError={(e) => setToast("SFX error: " + (e && e.message || e))}
                        onImported={fireSfxImport}
                        refreshSignal={pixabayRefreshSignal}/>
                    )
                )
                : displayMainView === "tool" && displayActiveTool === "Utility Plugins"
                ? (
                  (window.PAYWALL_ENABLED && !window.BETA_NO_PAYWALL && license && !license.isPro)
                    ? (
                      // Free user — render Utility Plugins blurred behind
                      // the inline paywall (same pattern as Pixabay).
                      <div className="cd-pixabay-locked" key="tool-utilities-locked">
                        <div className="cd-pixabay-locked-bg">
                          <UtilityPluginsPanel
                            accent={accent}
                            isPro={false}
                            onPaywall={() => {}}
                            onToast={() => {}}
                            autoTest={autoTest}/>
                        </div>
                        <UtilityPluginsPaywall
                          onCheckout={() => { if (license && license.openCheckout) license.openCheckout(); }}
                          onAlreadyPro={() => setPaywall({ feature: "plugins", view: "login" })}/>
                      </div>
                    )
                    : (
                      <UtilityPluginsPanel
                        key="tool-utilities"
                        accent={accent}
                        isPro={!!(license && license.isPro)}
                        onPaywall={(args) => setPaywall(args)}
                        onToast={setToast}
                        autoTest={autoTest}/>
                    )
                )
                : displayMainView === "tool"
                ? (
                  <ToolPlaceholder
                    // Key intentionally omits `toolDeckIndex`. When the user
                    // drags a card and dwells over a different tool-deck tab
                    // (Effects:1 → Effects:3), the dwell-switch fires
                    // setToolDeckIndex mid-drag. If the key changed on that
                    // index, React would unmount this ToolPlaceholder + the
                    // source SlotTile, killing the in-flight drag and
                    // preventing the cross-deck swap from committing. Keying
                    // on activeTool only means the wrapper persists across
                    // deck switches; only the `slots` prop changes. SlotTile
                    // keys are position-based (KEYMAP[i] + ":" + i) and
                    // identical across decks within the same tool, so React
                    // reuses the dragged source's DOM node.
                    key={`tool-${displayActiveTool}`}
                    toolName={displayActiveTool}
                    deckName={toolActiveDeck ? (toolActiveDeck.key || toolActiveDeck.name) : ""}
                    slots={toolActiveSlots}
                    accent={accent}
                    showShortcuts={config.tweaks.showShortcuts}
                    onActivate={fireSlot}
                    dragSource={dragSource}
                    onDragStartCoords={(coords) => setDragSource(coords)}
                    onDragEndCoords={() => { setDragSource(null); cancelSwapPreview(); setToolSwapPreview(null); }}
                    toolSwapPreview={toolSwapPreview}
                    onToolArmSwap={onToolArmSwap}
                    onToolCancelSwap={onToolCancelSwap}
                    onToolCommitSwap={onToolCommitSwap}
                    onToolMoveSlot={onToolMoveSlot}/>
                )
                : displayMainView === "cgfy" && window.CGfyView
                ? (
                  <window.CGfyView
                    onClose={() => setMainView("slots")}
                    onDropOnTimeline={async (localPath) => {
                      // Stub for Phase 1 — actually wiring this to
                      // /import + /smart-overwrite comes in Phase 2.
                      console.log("[CGfy] drop on timeline (stub):", localPath);
                      setToast("CGfy result dropped (Phase 2 will actually paste it)");
                    }}/>
                )
                : (
                  <SlotGrid
                    key={`deck-${activeLibraryIndex}-${activeDeckIndex}`}
                    slots={slots} accent={accent} showShortcuts={config.tweaks.showShortcuts}
                    onActivate={fireSlot} onAssignFile={assignFile} onDropFile={dropFile}
                    onContextMenu={openContextMenu} onRenameSlot={renameSlot} onSetThumb={setSlotThumb}
                    editingNameIndex={editingNameIndex} onFinishRename={finishRename}
                    onMoveSlot={onTileMove}
                    swapPreview={swapPreview}
                    onArmSwap={onTileArmSwap}
                    onCancelSwap={cancelSwapPreview}
                    onCommitSwap={commitSwapPreview}
                    capturingIndex={capturingIndex}
                    libIdx={activeLibraryIndex}
                    deckIdx={activeDeckIndex}
                    dragSource={dragSource}
                    onDragStartCoords={(coords) => setDragSource(coords)}
                    onDragEndCoords={() => { setDragSource(null); cancelSwapPreview(); }}/>
                )}
            </div>
            {/* Pixabay, Youtube, and Utility Plugins are panel-driven
                views — the Recently Used / Most Used strip would
                compete for vertical space, so we hide it on all three.
                Everything else (libraries, decks, other tools) keeps
                the strip.
                EXCEPTION — while search is active we force the strip
                back on even from these tools. Without it, the search-
                result grid (.cd-grid is `align-content: stretch` with
                4 fixed rows) expands into the freed vertical space and
                the tiles render with the wrong proportions (the bug
                reported 2026-05-26). Keeping the strip pins the grid
                into the same vertical envelope library-view searches
                use, so tiles look identical wherever search was
                triggered from. */}
            {(searchResults || !(displayMainView === "tool" && (displayActiveTool === "Pixabay" || displayActiveTool === "Youtube" || displayActiveTool === "Utility Plugins"))) && (
              <RecentStrip
                mode={stripMode}
                onModeChange={setStripMode}
                items={stripMode === "mostused" ? mostUsedItems : recentDisplayItems}
                accent={accent}
                onActivate={fireRecent}
                locked={false}
                isPro={!!(license && license.isPro)}
                onUpgrade={() => setPaywall({ feature: "recents" })}
                onProClick={onOpenProOnboarding}
              />
            )}
          </div>
          <Palette open={palOpen} onClose={() => setPalOpen(false)} accent={accent}/>
          <Toast msg={toast}/>
          <ConnectBanner visible={!connected}/>
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x} y={contextMenu.y}
              slotIndex={contextMenu.slotIndex}
              slot={slots[contextMenu.slotIndex]}
              onRename={startRename}
              onClear={clearSlot}
              onSetHue={setSlotHue}
              onCapture={(idx) => { setContextMenu(null); captureToSlot(idx); }}
              onCaptureEffect={(idx) => { setContextMenu(null); captureEffectToSlot(idx); }}
              onCaptureTransition={(idx) => { setContextMenu(null); captureTransitionToSlot(idx); }}
              onPickThumb={pickSlotThumbnail}
              onResetThumb={resetSlotThumbnail}
              onClose={() => setContextMenu(null)}
            />
          )}
          {libContextMenu && (() => {
            const lib = config.libraries[libContextMenu.libIndex];
            const label = lib ? `${lib.name} hotkey` : "Library hotkey";
            return (
              <HotkeyContextMenu
                x={libContextMenu.x} y={libContextMenu.y}
                label={label}
                currentHotkey={lib && lib.hotkey}
                onSetHotkey={(accel) => setLibraryHotkey(libContextMenu.libIndex, accel)}
                onClearHotkey={() => setLibraryHotkey(libContextMenu.libIndex, null)}
                proLocked={window.PAYWALL_ENABLED && !license.isPro}
                onProLocked={() => { setLibContextMenu(null); setPaywall({ feature: "hotkeys" }); }}
                items={[
                  {
                    label: (window.PAYWALL_ENABLED && !license.isPro) ? "Export Library 🔒" : "Export Library",
                    onClick: () => {
                      if (window.PAYWALL_ENABLED && !license.isPro) {
                        setLibContextMenu(null);
                        setPaywall({ feature: "import" });
                        return;
                      }
                      exportLibrary(libContextMenu.libIndex);
                    }
                  },
                  { label: "Delete library", danger: true, onClick: () => requestDeleteLibrary(libContextMenu.libIndex) },
                ]}
                onClose={() => setLibContextMenu(null)}
              />
            );
          })()}
          {toolContextMenu && (
            <HotkeyContextMenu
              x={toolContextMenu.x} y={toolContextMenu.y}
              label={`${toolContextMenu.toolName} hotkey`}
              currentHotkey={(config.toolHotkeys || {})[toolContextMenu.toolName]}
              onSetHotkey={(accel) => setToolHotkey(toolContextMenu.toolName, accel)}
              onClearHotkey={() => setToolHotkey(toolContextMenu.toolName, null)}
              proLocked={window.PAYWALL_ENABLED && !license.isPro}
              onProLocked={() => { setToolContextMenu(null); setPaywall({ feature: "hotkeys" }); }}
              items={
                // "Refresh" is exposed only for the two webview-backed
                // tools — Pixabay (SfxBrowser) and Youtube
                // (YoutubeBrowser). Click increments the matching App
                // signal; the component's useEffect calls
                // webviewRef.current.loadURL(HOME_URL) to navigate
                // back to the home page without dropping the mount.
                (toolContextMenu.toolName === "Pixabay" || toolContextMenu.toolName === "Youtube")
                  ? [{
                      label: "Refresh",
                      onClick: () => {
                        if (toolContextMenu.toolName === "Pixabay") {
                          setPixabayRefreshSignal((n) => n + 1);
                        } else {
                          setYoutubeRefreshSignal((n) => n + 1);
                        }
                        setToolContextMenu(null);
                      },
                    }]
                  : []
              }
              onClose={() => setToolContextMenu(null)}
            />
          )}
          {addLibContextMenu && (
            <SimpleContextMenu
              x={addLibContextMenu.x} y={addLibContextMenu.y}
              items={[
                {
                  label: (window.PAYWALL_ENABLED && !license.isPro) ? "Import Library 🔒" : "Import Library",
                  onClick: () => {
                    if (window.PAYWALL_ENABLED && !license.isPro) {
                      setAddLibContextMenu(null);
                      setPaywall({ feature: "import" });
                      return;
                    }
                    importLibrary();
                  }
                },
              ]}
              onClose={() => setAddLibContextMenu(null)}
            />
          )}
          {deckContextMenu && (() => {
            const deck = decks[deckContextMenu.deckIndex];
            const label = deck ? `${deck.name} hotkey` : "Deck hotkey";
            return (
              <HotkeyContextMenu
                x={deckContextMenu.x} y={deckContextMenu.y}
                label={label}
                currentHotkey={deck && deck.hotkey}
                onSetHotkey={(accel) => setDeckHotkey(deckContextMenu.deckIndex, accel)}
                onClearHotkey={() => setDeckHotkey(deckContextMenu.deckIndex, null)}
                proLocked={window.PAYWALL_ENABLED && !license.isPro}
                onProLocked={() => { setDeckContextMenu(null); setPaywall({ feature: "hotkeys" }); }}
                items={[
                  { label: "Clear deck", onClick: () => clearDeck(deckContextMenu.deckIndex) },
                  { label: "Delete deck", danger: true, onClick: () => requestDeleteDeck(deckContextMenu.deckIndex) },
                ]}
                onClose={() => setDeckContextMenu(null)}
              />
            );
          })()}
          {confirmDialog && (
            <ConfirmDialog
              title={confirmDialog.title}
              message={confirmDialog.message}
              confirmLabel={confirmDialog.confirmLabel}
              cancelLabel={confirmDialog.cancelLabel}
              danger={confirmDialog.danger}
              onConfirm={confirmDialog.onConfirm}
              onCancel={() => setConfirmDialog(null)}
            />
          )}
          {paywall && window.Paywall && (
            <window.Paywall
              feature={paywall.feature}
              initialView={paywall.view}
              onClose={() => setPaywall(null)}
            />
          )}
          {/* Pro Onboarding — fires once on the first Free→Pro flip. The
              `proOnboardingOpen` flag (computed above) gates on the
              resolved Pro license + the unset config flag; dismissing
              persists `proOnboardingSeen` so it never re-shows. */}
          {proOnboardingOpen && (
            <window.ProOnboarding
              quickStartUrl={ONBOARDING_TUTORIAL_URL}
              onDismiss={() => {
                // Clear the manual flag (so the next badge click can
                // re-open) AND persist the seen flag (so the auto-fire
                // path on a future Free→Pro flip stays suppressed —
                // they've already seen it). Both are idempotent.
                setManualProOnboardingOpen(false);
                setConfig((prev) => ({ ...prev, proOnboardingSeen: true }));
              }}
            />
          )}
          {/* Post-refund feedback ("Help us improve Clip Deck"). Mounted
              when the user has just refunded (license flipped to Free
              with hasRefunded=true) and they haven't been shown the
              modal yet. The submit + skip buttons both set
              refundFeedbackSeen so it never reappears. */}
          {refundFeedbackOpen && (
            <window.RefundFeedback
              onSubmit={async (payload) => {
                if (license && license.submitRefundFeedback) {
                  try { await license.submitRefundFeedback(payload); } catch (e) {}
                }
                setConfig((prev) => ({ ...prev, refundFeedbackSeen: true }));
              }}
              onSkip={() => {
                setConfig((prev) => ({ ...prev, refundFeedbackSeen: true }));
              }}
            />
          )}
          {accessDenied && (
            <AccessibilityDeniedModal onClose={() => setAccessDenied(false)}/>
          )}
          {!config.onboardingShown && (
            <OnboardingModal onDismiss={() => {
              setConfig((prev) => ({ ...prev, onboardingShown: true }));
            }}/>
          )}
          {updateManifest && updateState.phase === "idle" && (
            <UpdateBanner
              manifest={updateManifest}
              onInstall={startUpdate}
              onSnooze={snoozeUpdate}/>
          )}
          {updateState.phase !== "idle" && (
            <UpdateModal
              phase={updateState.phase}
              progress={updateState.progress}
              error={updateState.error}
              onClose={() => setUpdateState({ phase: "idle", progress: null, error: null })}/>
          )}
          {prefsOpen && (
            <PrefsMenu
              panelHotkey={config.panelHotkey}
              recordingHotkey={recordingHotkey}
              onClickHotkey={() => {
                setRecordingSearchHotkey(false);
                setRecordingHotkey((r) => !r);
              }}
              insertMode={insertMode}
              onInsertModeChange={setInsertMode}
              onUpgradeClick={() => { setPrefsOpen(false); setPaywall({ feature: "hotkeys" }); }}
              onProBadgeClick={() => { setPrefsOpen(false); onOpenProOnboarding(); }}
              onClose={() => setPrefsOpen(false)}
              onCheckForUpdates={async () => {
                const res = await window.clipDeck.checkForUpdate();
                if (res && res.available) {
                  setUpdateManifest(res.manifest);
                  setToast("Update available — see banner");
                } else {
                  setToast("You're on the latest version.");
                }
              }}
              autoUpdate={config.tweaks && config.tweaks.autoUpdate !== false}
              onToggleAutoUpdate={(v) => setConfig((prev) => ({
                ...prev, tweaks: { ...prev.tweaks, autoUpdate: !!v }
              }))}
              onReadDefaultTransition={async () => {
                if (!window.clipDeck || !window.clipDeck.readCurrentTransitionDefaults) {
                  setToast("Read not available — relaunch the overlay.");
                  return;
                }
                try {
                  const res = await window.clipDeck.readCurrentTransitionDefaults();
                  if (res && res.ok && res.value) {
                    const v = res.value;
                    const video = v.video || "(empty)";
                    // Copy the video value to the system clipboard so
                    // it's easy to paste back into chat / recipe.
                    try {
                      if (v.video && navigator && navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(v.video);
                      }
                    } catch (e) {}
                    setToast(`Copied: ${video}`);
                  } else {
                    setToast("Read failed: " + ((res && res.error) || "no detail"));
                  }
                } catch (e) {
                  setToast("Read failed: " + (e.message || e));
                }
              }}
              onExportTransitionIndex={async () => {
                if (!window.clipDeck || !window.clipDeck.exportTransitionIndex) {
                  setToast("Export not available — relaunch the overlay.");
                  return;
                }
                // Gather every transition card we ship as candidates
                // so the host can probe each one against Premiere's
                // registry. Output tells us which cards Premiere
                // actually recognizes — the missing ones either need
                // a different matchName or aren't installed.
                const candidates = [
                  ...VIDEO_TRANSITIONS_DECK_1,
                  ...VIDEO_TRANSITIONS_DECK_2,
                ].map((entry) => {
                  const displayName = typeof entry === "string" ? entry : entry.displayName;
                  const matchName = typeof entry === "object" ? entry.matchName : null;
                  return { name: displayName, matchName, audio: false };
                });
                setToast("Probing " + candidates.length + " transitions…");
                try {
                  const res = await window.clipDeck.exportTransitionIndex(candidates);
                  if (res && res.ok) {
                    setToast(`${res.registered} registered, ${res.missing} missing — saved to Desktop`);
                  } else {
                    setToast("Export failed: " + ((res && res.error) || "no detail"));
                  }
                } catch (e) {
                  setToast("Export failed: " + (e.message || e));
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// LicenseProvider is set on window by license.jsx (loaded before app.jsx
// in index.html). Wrapping App so any descendant can call useLicense()
// to read isPro / email / etc. — gates and paywall come in Sitting B.
ReactDOM.createRoot(document.getElementById("root")).render(
  <window.LicenseProvider><App/></window.LicenseProvider>
);
