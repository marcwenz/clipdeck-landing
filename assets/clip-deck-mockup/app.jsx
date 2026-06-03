// Clip Deck — floating asset panel for video editors
// Original design (not Premiere's UI). Codename: Clip Deck.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "blue",
  "section": "sfx",
  "palette": "graphite",
  "density": "tight",
  "showShortcuts": true,
  "showPalette": false
}/*EDITMODE-END*/;

const ACCENTS = {
  blue:   { hex: "#00ff95", soft: "rgba(0,255,149,.14)", glow: "rgba(0,255,149,.45)" },
  amber:  { hex: "#F5B547", soft: "rgba(245,181,71,.14)", glow: "rgba(245,181,71,.40)" },
  violet: { hex: "#A98BFF", soft: "rgba(169,139,255,.14)", glow: "rgba(169,139,255,.40)" },
};

const PALETTES = {
  graphite: { bg:"#0E0F12", panel:"#15171C", panel2:"#1B1E25", line:"rgba(255,255,255,.06)", line2:"rgba(255,255,255,.10)", text:"#E7E9EE", muted:"#8A8F9C", dim:"#5C616E" },
  ink:      { bg:"#0A0B10", panel:"#11131A", panel2:"#171A23", line:"rgba(255,255,255,.05)", line2:"rgba(255,255,255,.09)", text:"#E4E6EE", muted:"#858A98", dim:"#565B69" },
  warm:     { bg:"#121110", panel:"#1A1816", panel2:"#211E1B", line:"rgba(255,240,220,.06)", line2:"rgba(255,240,220,.10)", text:"#EDE8E1", muted:"#9A9388", dim:"#6A645A" },
};

// ── Icons (line-style, original) ─────────────────────────────────────────────
const I = {
  clock:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.6"/></svg>,
  star:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 2.4l1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 11.2l-3.4 1.8.7-3.8L2.5 6.5l3.8-.6L8 2.4z"/></svg>,
  trans:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 4.5h5M2.5 8h7M2.5 11.5h4"/><path d="M11.5 5.5L13.5 8l-2 2.5"/></svg>,
  wave:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 8h1M4.5 5v6M7 3v10M9.5 6v4M12 4v8M14.5 7v2"/></svg>,
  layers: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 2.5L2.5 5.2 8 8l5.5-2.8L8 2.5z"/><path d="M2.5 8L8 10.8 13.5 8M2.5 10.8L8 13.5l5.5-2.7"/></svg>,
  search: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13 13"/></svg>,
  filter: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/></svg>,
  sort:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v10M3 11l2 2 2-2"/><path d="M11 13V3M9 5l2-2 2 2"/></svg>,
  play:   (p) => <svg {...p} viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5v9l8-4.5z"/></svg>,
  cmd:    (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 5h6v6H5z"/><circle cx="3.5" cy="3.5" r="1.5"/><circle cx="12.5" cy="3.5" r="1.5"/><circle cx="3.5" cy="12.5" r="1.5"/><circle cx="12.5" cy="12.5" r="1.5"/></svg>,
  enter:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4v3a2 2 0 01-2 2H3"/><path d="M5.5 6.5L3 9l2.5 2.5"/></svg>,
  pin:    (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2.5l3 3-1.2 1.2 1.4 1.4L8 11.3l-3.1-3.2L6.3 6.7 5 5.5 8 2.5zM6 10l-2.5 3"/></svg>,
  lock:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>,
};

// ── Synthetic SFX library ───────────────────────────────────────────────────
const SFX_TAGS = ["Impact","Whoosh","Ambient","Foley","Riser","Sub","Glitch","UI","Cinematic","Designed"];
const SFX_DATA = [
  { id:"sfx-01", name:"Impact_Sub_Bloom", dur:"0:02", tag:"Impact",    bpm:"—",   key:"C", hue:212, peak:.92 },
  { id:"sfx-02", name:"Whoosh_Reverse_03", dur:"0:01", tag:"Whoosh",   bpm:"—",   key:"—", hue:198, peak:.78 },
  { id:"sfx-03", name:"Riser_Tonal_Long",  dur:"0:08", tag:"Riser",    bpm:"—",   key:"D", hue:262, peak:.85 },
  { id:"sfx-04", name:"Glitch_Stutter_2x", dur:"0:01", tag:"Glitch",   bpm:"128", key:"—", hue:330, peak:.88 },
  { id:"sfx-05", name:"Foley_Cloth_Move",  dur:"0:03", tag:"Foley",    bpm:"—",   key:"—", hue:32,  peak:.42 },
  { id:"sfx-06", name:"Ambient_Room_Air",  dur:"0:30", tag:"Ambient",  bpm:"—",   key:"A", hue:182, peak:.31 },
  { id:"sfx-07", name:"UI_Tick_Soft",      dur:"0:00", tag:"UI",       bpm:"—",   key:"—", hue:148, peak:.55 },
  { id:"sfx-08", name:"Cinematic_Boom",    dur:"0:04", tag:"Cinematic",bpm:"—",   key:"G", hue:8,   peak:.95 },
  { id:"sfx-09", name:"Designed_Drone_LP", dur:"0:24", tag:"Designed", bpm:"—",   key:"E", hue:240, peak:.62 },
  { id:"sfx-10", name:"Sub_Drop_808",      dur:"0:02", tag:"Sub",      bpm:"95",  key:"F", hue:280, peak:.97 },
  { id:"sfx-11", name:"Whoosh_Tail_Air",   dur:"0:02", tag:"Whoosh",   bpm:"—",   key:"—", hue:170, peak:.71 },
  { id:"sfx-12", name:"Impact_Hit_Tight",  dur:"0:01", tag:"Impact",   bpm:"—",   key:"—", hue:14,  peak:.89 },
  { id:"sfx-13", name:"Foley_Step_Wood",   dur:"0:00", tag:"Foley",    bpm:"—",   key:"—", hue:42,  peak:.51 },
  { id:"sfx-14", name:"Riser_Noise_Sweep", dur:"0:06", tag:"Riser",    bpm:"—",   key:"—", hue:220, peak:.74 },
  { id:"sfx-15", name:"UI_Confirm_Click",  dur:"0:00", tag:"UI",       bpm:"—",   key:"—", hue:152, peak:.48 },
  { id:"sfx-16", name:"Designed_Pulse_LFO",dur:"0:12", tag:"Designed", bpm:"100", key:"B", hue:300, peak:.66 },
  { id:"sfx-17", name:"Glitch_Bit_Crush",  dur:"0:02", tag:"Glitch",   bpm:"—",   key:"—", hue:340, peak:.83 },
  { id:"sfx-18", name:"Ambient_Hall_Verb", dur:"0:18", tag:"Ambient",  bpm:"—",   key:"D", hue:188, peak:.36 },
  { id:"sfx-19", name:"Impact_Metal_Crash",dur:"0:02", tag:"Impact",   bpm:"—",   key:"—", hue:24,  peak:.91 },
  { id:"sfx-20", name:"Whoosh_Fast_Pass",  dur:"0:01", tag:"Whoosh",   bpm:"—",   key:"—", hue:204, peak:.69 },
  { id:"sfx-21", name:"Ambient_Forest_Day",dur:"0:42", tag:"Ambient",  bpm:"—",   key:"—", hue:122, peak:.34 },
  { id:"sfx-22", name:"Foley_Paper_Flip",  dur:"0:00", tag:"Foley",    bpm:"—",   key:"—", hue:48,  peak:.39 },
  { id:"sfx-23", name:"Riser_Whoosh_Up",   dur:"0:05", tag:"Riser",    bpm:"—",   key:"C", hue:228, peak:.81 },
  { id:"sfx-24", name:"Sub_Rumble_Low",    dur:"0:08", tag:"Sub",      bpm:"—",   key:"E", hue:296, peak:.93 },
  { id:"sfx-25", name:"Glitch_Reverse_Hit",dur:"0:01", tag:"Glitch",   bpm:"—",   key:"—", hue:316, peak:.86 },
  { id:"sfx-26", name:"UI_Hover_Pulse",    dur:"0:00", tag:"UI",       bpm:"—",   key:"—", hue:160, peak:.46 },
  { id:"sfx-27", name:"Cinematic_Stinger", dur:"0:03", tag:"Cinematic",bpm:"—",   key:"A", hue:354, peak:.94 },
  { id:"sfx-28", name:"Designed_Texture",  dur:"0:14", tag:"Designed", bpm:"—",   key:"D", hue:252, peak:.58 },
  { id:"sfx-29", name:"Impact_Wood_Knock", dur:"0:01", tag:"Impact",   bpm:"—",   key:"—", hue:38,  peak:.72 },
  { id:"sfx-30", name:"Whoosh_Magic_Spark",dur:"0:02", tag:"Whoosh",   bpm:"—",   key:"—", hue:178, peak:.74 },
  { id:"sfx-31", name:"Ambient_Rain_Soft", dur:"0:60", tag:"Ambient",  bpm:"—",   key:"—", hue:200, peak:.29 },
  { id:"sfx-32", name:"Foley_Glass_Tap",   dur:"0:00", tag:"Foley",    bpm:"—",   key:"—", hue:172, peak:.55 },
  { id:"sfx-33", name:"Riser_Synth_Pad",   dur:"0:10", tag:"Riser",    bpm:"110", key:"F", hue:286, peak:.79 },
  { id:"sfx-34", name:"Sub_Boom_Heavy",    dur:"0:03", tag:"Sub",      bpm:"—",   key:"G", hue:268, peak:.96 },
  { id:"sfx-35", name:"Glitch_Tape_Stop",  dur:"0:01", tag:"Glitch",   bpm:"—",   key:"—", hue:344, peak:.82 },
  { id:"sfx-36", name:"UI_Notify_Chime",   dur:"0:01", tag:"UI",       bpm:"—",   key:"B", hue:140, peak:.61 },
  { id:"sfx-37", name:"Cinematic_Drone",   dur:"0:22", tag:"Cinematic",bpm:"—",   key:"C", hue:18,  peak:.68 },
  { id:"sfx-38", name:"Designed_Glitch_LP",dur:"0:09", tag:"Designed", bpm:"120", key:"—", hue:312, peak:.71 },
  { id:"sfx-39", name:"Impact_Door_Slam",  dur:"0:01", tag:"Impact",   bpm:"—",   key:"—", hue:6,   peak:.87 },
  { id:"sfx-40", name:"Whoosh_Sword_Slash",dur:"0:01", tag:"Whoosh",   bpm:"—",   key:"—", hue:192, peak:.83 },
];

const RECENT_DATA = [
  { id:"r1", name:"Impact_Sub_Bloom",   tag:"Impact",  hue:212, peak:.92, when:"2m" },
  { id:"r2", name:"Whoosh_Reverse_03",  tag:"Whoosh",  hue:198, peak:.78, when:"5m" },
  { id:"r3", name:"Cinematic_Boom",     tag:"Cinema.", hue:8,   peak:.95, when:"7m" },
  { id:"r4", name:"UI_Confirm_Click",   tag:"UI",      hue:152, peak:.48, when:"12m" },
  { id:"r5", name:"Riser_Tonal_Long",   tag:"Riser",   hue:262, peak:.85, when:"18m" },
  { id:"r6", name:"Sub_Drop_808",       tag:"Sub",     hue:280, peak:.97, when:"24m" },
  { id:"r7", name:"Glitch_Stutter_2x",  tag:"Glitch",  hue:330, peak:.88, when:"31m" },
  { id:"r8", name:"Foley_Cloth_Move",   tag:"Foley",   hue:32,  peak:.42, when:"42m" },
  { id:"r9", name:"Ambient_Room_Air",   tag:"Amb.",    hue:182, peak:.31, when:"1h" },
  { id:"r10",name:"Designed_Drone_LP",  tag:"Design.", hue:240, peak:.62, when:"1h" },
];

// Deterministic waveform sample (looks like real audio peaks).
function waveSamples(seed, n, peak) {
  const out = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    // shape: rise-fast, decay-slow envelope around middle
    const t = i / (n - 1);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(t, .55)), 1.4);
    const noise = .25 + r * .75;
    out.push(Math.max(.04, env * noise * peak));
  }
  return out;
}

function Waveform({ seed, peak, color, height = 56, bars = 64, accent }) {
  const samples = React.useMemo(() => waveSamples(seed, bars, peak), [seed, peak, bars]);
  return (
    <div className="cd-wave" style={{ height }}>
      {samples.map((v, i) => (
        <span key={i} style={{
          height: `${Math.round(v * 100)}%`,
          background: i === Math.floor(bars*.18) ? accent : color,
        }}/>
      ))}
    </div>
  );
}

// Photo-realistic gradient thumbnail (used by sidebar previews / palette etc.)
function GradientThumb({ hue, label, w = 96, h = 56 }) {
  const bg = `radial-gradient(120% 90% at 18% 12%, hsl(${hue} 90% 70% / .9), transparent 55%),
              radial-gradient(120% 110% at 88% 92%, hsl(${(hue+38)%360} 80% 45% / .9), transparent 60%),
              linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue+20)%360} 70% 10%))`;
  return (
    <div className="cd-grad" style={{ width: w, height: h, background: bg }}>
      {label && <span>{label}</span>}
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "sfx",         label: "SFX",            count: 1284 },
  { id: "music",       label: "Music",          count: 412 },
  { id: "transitions", label: "Transitions",    count: 86 },
  { id: "greenscreen", label: "Green screens",  count: 58 },
  { id: "vfx",         label: "VFX",            count: 240 },
  { id: "movieclips",  label: "Movie Clips",    count: 96 },
  { id: "pngs",        label: "PNGs",           count: 314 },
  { id: "nested",      label: "Nested Assets",  count: 22 },
  { id: "intro",       label: "Intro",          count: 14 },
];

function Sidebar({ active, onPick, accent, density, query, onQuery, onOpenPalette }) {
  return (
    <aside className="cd-side" data-density={density}>
      <div className="cd-side-brand">
        <div className="cd-brand-mark">
          <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
            <rect x="0" y="0" width="32" height="32" rx="8" fill="#02ff94"/>
            <rect x="7"  y="7"  width="8.5" height="8.5" rx="1.6" fill="#000"/>
            <rect x="16.5" y="7"  width="8.5" height="8.5" rx="1.6" fill="#000"/>
            <rect x="7"  y="16.5" width="8.5" height="8.5" rx="1.6" fill="#000"/>
            <rect x="16.5" y="16.5" width="8.5" height="8.5" rx="1.6" fill="#0a3a25"/>
          </svg>
        </div>
        <div className="cd-brand-text">
          <div className="cd-brand-name">Clip Deck</div>
          <div className="cd-brand-sub">INTHEZONE</div>
        </div>
      </div>

      <div className="cd-search">
        <I.search className="cd-search-ico"/>
        <input
          className="cd-search-input"
          placeholder="Search…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <button className="cd-search-cmd" onClick={onOpenPalette} title="Open command palette">
          <span>⌘</span><span>K</span>
        </button>
      </div>

      <nav className="cd-side-nav">
        <div className="cd-side-h">User Libraries</div>
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <button key={s.id} className={`cd-side-item no-ico${on ? " on" : ""}`} onClick={() => onPick(s.id)}>
              <span className="cd-side-rail" style={{ background: on ? accent.hex : "transparent" }}/>
              <span className="cd-side-label">{s.label}</span>
              <span className="cd-side-count">{s.count.toLocaleString()}</span>
            </button>
          );
        })}
        <button className="cd-side-add" onClick={() => {}}>
          <span className="cd-side-add-plus">+</span>
          <span>Add library</span>
        </button>
      </nav>

      <div className="cd-side-locked">
        <div className="cd-side-h">INTHEZONE Libraries</div>
        <div className="cd-side-locked-list">
          {["SFX Pack","Music Pack","Transitions Pack","Memes Pack"].map((label) => (
            <div key={label} className="cd-side-locked-item">
              <span className="cd-side-rail"/>
              <span className="cd-side-label">{label}</span>
              <I.lock className="cd-side-lock"/>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── Topbar ──────────────────────────────────────────────────────────────────
function Topbar({ accent, activeTag, onTag, onAddPage }) {
  return (
    <header className="cd-top">
      <div className="cd-pages">
        <button className={`cd-tag${!activeTag ? " on" : ""}`} onClick={() => onTag(null)}>All</button>
        {SFX_TAGS.map((t) => (
          <button key={t}
            className={`cd-tag${activeTag === t ? " on" : ""}`}
            style={ activeTag === t ? { color: accent.hex, borderColor: accent.glow, background: accent.soft } : null }
            onClick={() => onTag(t)}>{t}</button>
        ))}
      </div>

      <div className="cd-top-actions">
        <button className="cd-addpage" onClick={onAddPage}>
          <span className="cd-addpage-plus">+</span>
          <span>Add page</span>
        </button>
      </div>
    </header>
  );
}

// ── Main grid ───────────────────────────────────────────────────────────────
const QWERTY_KEYS = [
  "1","2","3","4","5","6","7","8","9","0",
  "Q","W","E","R","T","Y","U","I","O","P",
  "A","S","D","F","G","H","J","K","L",";",
  "Z","X","C","V","B","N","M",",",".","/",
];

// ── Thumbnail variants ──────────────────────────────────────────────────────
function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

const MEME_IMAGES = [
  "thumbnails/t01.png","thumbnails/t02.png","thumbnails/t03.png","thumbnails/t04.png",
  "thumbnails/t05.png","thumbnails/t06.jpg","thumbnails/t07.png","thumbnails/t08.png",
  "thumbnails/t09.png","thumbnails/t10.png","thumbnails/t11.png","thumbnails/t12.png",
  "thumbnails/t13.png","thumbnails/t14.png","thumbnails/t15.png","thumbnails/t16.png",
  "thumbnails/t17.png","thumbnails/t18.png","thumbnails/t19.png","thumbnails/t20.jpg",
  "thumbnails/t21.png",
];

// Deterministic mapping: assign each meme to one unique sfx id.
// Seeded shuffle of all sfx ids, take first N for memes.
function buildMemeMap(allIds, memes) {
  const arr = allIds.slice();
  // Fisher-Yates with deterministic seed
  let seed = 0x1F83D9AB;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const map = {};
  for (let i = 0; i < memes.length && i < arr.length; i++) {
    map[arr[i]] = memes[i];
  }
  return map;
}
const MEME_MAP = buildMemeMap(SFX_DATA.map(s => s.id), MEME_IMAGES);

function ThumbArt({ item, accent }) {
  const meme = MEME_MAP[item.id];
  if (meme) {
    return (
      <div className="cd-th-img" style={{
        backgroundImage: `url("${meme}")`,
        backgroundColor: `hsl(${item.hue} 40% 18%)`,
      }}/>
    );
  }
  return (
    <Waveform
      seed={parseInt(item.id.replace(/\D/g,""),10) * 17 + 3}
      peak={item.peak}
      color="rgba(255,255,255,.55)"
      accent={accent.hex}
      height={62}
      bars={56}
    />
  );
}

function SfxTile({
  item, hovered, onHover, accent, showShortcuts, hotkey, selected,
  isDragging, isDragOver,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop
}) {
  const isOn = hovered || selected;
  let cls = "cd-tile";
  if (isOn)        cls += " on";
  if (selected)    cls += " sel";
  if (isDragging)  cls += " dragging";
  if (isDragOver)  cls += " drag-over";
  return (
    <div
      className={cls}
      draggable={true}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={ isOn && !isDragging
        ? { borderColor: accent.glow, boxShadow: `0 0 0 1px ${accent.glow}, 0 8px 30px -10px ${accent.glow}` }
        : isDragOver
          ? { borderColor: accent.hex, boxShadow: `0 0 0 1px ${accent.hex}, 0 0 0 4px ${accent.soft}` }
          : null }
    >
      <div className="cd-tile-thumb">
        <div className="cd-tile-bg" style={{
          background: `radial-gradient(120% 90% at 20% 10%, hsl(${item.hue} 80% 60% / .55), transparent 55%),
                       radial-gradient(120% 100% at 90% 95%, hsl(${(item.hue+34)%360} 70% 40% / .55), transparent 55%),
                       linear-gradient(135deg, hsl(${item.hue} 35% 14%), hsl(${(item.hue+20)%360} 30% 8%))`
        }}/>
        <ThumbArt item={item} accent={accent}/>
        {isOn && !isDragging && (
          <button className="cd-tile-play" style={{ background: accent.hex }}>
            <I.play/>
          </button>
        )}
        {showShortcuts && hotkey && (
          <div className="cd-kbd-hint">
            <kbd>{hotkey}</kbd>
          </div>
        )}
      </div>
      <div className="cd-tile-foot">
        <span className="cd-tile-name">{item.name}</span>
      </div>
    </div>
  );
}

function SfxGrid({ items: itemsProp, accent, showShortcuts }) {
  // Local copy of the items so dragging can swap them in place. Resets if
  // the parent re-supplies a different list (e.g. tag filter change).
  const [items, setItems] = React.useState(itemsProp);
  React.useEffect(() => { setItems(itemsProp); }, [itemsProp]);

  const [hover, setHover] = React.useState(null);
  const [selected, setSelected] = React.useState(itemsProp[0]?.id);
  React.useEffect(() => { setSelected(itemsProp[0]?.id); }, [itemsProp]);

  // Drag-and-drop state — mirrors the Clip Deck plugin's pattern, but the
  // mockup always has populated tiles so drops always swap (no replace path).
  const [draggingIndex, setDraggingIndex] = React.useState(null);
  const [dragOverIndex, setDragOverIndex] = React.useState(null);

  const handleDragStart = (idx) => (e) => {
    if (e.dataTransfer) {
      try { e.dataTransfer.setData("application/x-clipdeck-slot", String(idx)); } catch (err) {}
      try { e.dataTransfer.setData("text/plain", "clipdeck-slot:" + idx); } catch (err) {}
      e.dataTransfer.effectAllowed = "move";
    }
    setDraggingIndex(idx);
  };
  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };
  const handleDragOver = (idx) => (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (draggingIndex == null || draggingIndex === idx) return;
    if (dragOverIndex !== idx) setDragOverIndex(idx);
  };
  const handleDragLeave = (idx) => () => {
    if (dragOverIndex === idx) setDragOverIndex(null);
  };
  const handleDrop = (idx) => (e) => {
    e.preventDefault();
    setDragOverIndex(null);
    const fromStr = e.dataTransfer && e.dataTransfer.getData
      ? e.dataTransfer.getData("application/x-clipdeck-slot")
      : null;
    const fromIdx = fromStr != null && fromStr !== ""
      ? parseInt(fromStr, 10)
      : draggingIndex;
    if (fromIdx == null || isNaN(fromIdx) || fromIdx === idx) {
      setDraggingIndex(null);
      return;
    }
    setItems((prev) => {
      const next = prev.slice();
      const tmp = next[fromIdx];
      next[fromIdx] = next[idx];
      next[idx] = tmp;
      return next;
    });
    setDraggingIndex(null);
  };

  return (
    <div className={`cd-grid${draggingIndex != null ? " is-dragging" : ""}`}>
      {items.map((it, i) => (
        <SfxTile
          key={it.id}
          item={it}
          hovered={hover === it.id}
          selected={selected === it.id}
          isDragging={draggingIndex === i}
          isDragOver={dragOverIndex === i}
          onHover={(id) => { setHover(id); if (id) setSelected(id); }}
          onDragStart={handleDragStart(i)}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver(i)}
          onDragLeave={handleDragLeave(i)}
          onDrop={handleDrop(i)}
          accent={accent}
          showShortcuts={showShortcuts}
          hotkey={QWERTY_KEYS[i] || null}
        />
      ))}
    </div>
  );
}

// ── Recently used strip ─────────────────────────────────────────────────────
function RecentStrip({ items, accent }) {
  const [hover, setHover] = React.useState(null);
  return (
    <section className="cd-recent">
      <div className="cd-recent-head">
        <div className="cd-recent-title">
          <I.clock className="cd-recent-ico"/>
          <span>Recently Used</span>
          <span className="cd-recent-count">{items.length}</span>
        </div>
        <div className="cd-recent-tools">
          <button className="cd-link">Clear</button>
          <button className="cd-link">Pin all</button>
        </div>
      </div>
      <div className="cd-recent-row">
        {items.map((it) => {
          const on = hover === it.id;
          return (
            <div key={it.id} className={`cd-rtile${on ? " on" : ""}`}
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              style={ on ? { borderColor: accent.glow, boxShadow: `0 0 0 1px ${accent.glow}` } : null }
            >
              <div className="cd-rtile-thumb">
                <div className="cd-rtile-bg" style={{
                  background: `radial-gradient(80% 80% at 20% 10%, hsl(${it.hue} 80% 60% / .5), transparent 55%),
                               linear-gradient(135deg, hsl(${it.hue} 30% 14%), hsl(${(it.hue+20)%360} 30% 8%))`
                }}/>
                <ThumbArt item={it} accent={accent}/>
              </div>
              <div className="cd-rtile-foot">
                <span className="cd-rtile-name">{it.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Cmd+K palette ───────────────────────────────────────────────────────────
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
    { label: "Suggested", items: [
      { name: "Impact_Sub_Bloom",   hint: "↵", tag: "SFX", hue: 212 },
      { name: "Whoosh_Reverse_03",  hint: "↵", tag: "SFX", hue: 198 },
      { name: "Cinematic_Boom",     hint: "↵", tag: "SFX", hue: 8 },
    ]},
  ];

  if (!open) return null;
  return (
    <div className="cd-pal-scrim" onMouseDown={onClose}>
      <div className="cd-pal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cd-pal-head">
          <I.search className="cd-pal-ico"/>
          <input
            ref={inputRef}
            className="cd-pal-input"
            placeholder="Type a command, or search anything…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="cd-pal-esc">esc</span>
        </div>
        <div className="cd-pal-body">
          {groups.map((g, gi) => (
            <div key={g.label} className="cd-pal-group">
              <div className="cd-pal-group-h">{g.label}</div>
              {g.items.map((it, i) => {
                const sel = gi === 0 && i === 0;
                return (
                  <div key={it.name}
                    className={`cd-pal-row${sel ? " on" : ""}`}
                    style={ sel ? { background: accent.soft } : null }
                  >
                    {it.hue != null
                      ? <div className="cd-pal-thumb" style={{
                          background: `radial-gradient(80% 80% at 30% 20%, hsl(${it.hue} 80% 60%), hsl(${(it.hue+30)%360} 50% 20%))`
                        }}/>
                      : <div className="cd-pal-thumb dim"><I.cmd/></div>
                    }
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

// ── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = ACCENTS[t.accent] || ACCENTS.blue;
  const palette = PALETTES[t.palette] || PALETTES.graphite;

  const [section, setSection] = React.useState(t.section);
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState(null);
  const [palOpen, setPalOpen] = React.useState(!!t.showPalette);

  React.useEffect(() => { setPalOpen(!!t.showPalette); }, [t.showPalette]);

  const items = React.useMemo(() => {
    return SFX_DATA.filter((s) => {
      if (tag && s.tag !== tag) return false;
      if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, tag]);

  // Keyboard: Cmd/Ctrl-K opens palette, Esc closes
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen(true);
        setTweak("showPalette", true);
      } else if (e.key === "Escape") {
        setPalOpen(false);
        setTweak("showPalette", false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTweak]);

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
      <div className="cd-bezel">
        <div className="cd-panel" style={cssVars} data-density={t.density}>
          <Sidebar
            active={section} onPick={setSection}
            accent={accent} density={t.density}
            query={query} onQuery={setQuery}
            onOpenPalette={() => { setPalOpen(true); setTweak("showPalette", true); }}
          />
          <div className="cd-main">
            <Topbar
              accent={accent}
              activeTag={tag} onTag={setTag}
              onAddPage={() => {}}
            />
            <div className="cd-content">
              <SfxGrid items={items} accent={accent} showShortcuts={t.showShortcuts}/>
            </div>
            <RecentStrip items={RECENT_DATA} accent={accent}/>
          </div>

          <Palette open={palOpen} onClose={() => { setPalOpen(false); setTweak("showPalette", false); }} accent={accent}/>
        </div>
      </div>

      <TweaksPanel title="Clip Deck — Tweaks">
        <TweakSection label="Accent">
          <TweakRadio label="Color" value={t.accent}
            options={[{value:"blue",label:"Blue"},{value:"amber",label:"Amber"},{value:"violet",label:"Violet"}]}
            onChange={(v) => setTweak("accent", v)}/>
        </TweakSection>

        <TweakSection label="Surface">
          <TweakRadio label="Palette" value={t.palette}
            options={[{value:"graphite",label:"Graphite"},{value:"ink",label:"Ink"},{value:"warm",label:"Warm"}]}
            onChange={(v) => setTweak("palette", v)}/>
          <TweakRadio label="Density" value={t.density}
            options={[{value:"tight",label:"Tight"},{value:"regular",label:"Regular"}]}
            onChange={(v) => setTweak("density", v)}/>
        </TweakSection>

        <TweakSection label="Display">
          <TweakToggle label="Show shortcut hints" value={!!t.showShortcuts}
            onChange={(v) => setTweak("showShortcuts", v)}/>
          <TweakToggle label="Command palette open" value={!!t.showPalette}
            onChange={(v) => setTweak("showPalette", v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
