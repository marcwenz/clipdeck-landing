// cgfy.jsx — VFX Engine view.
//
// Renders inside `.cd-content` when the user clicks "VFX Engine" in
// the INTHEZONE Tools sidebar. The user-visible product name is
// "VFX Engine" — internal identifiers stay `CGfy*` for code stability.
// No mentions of the underlying AI provider in user-visible strings
// (trade secret per the product owner).
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  INPUTS (left)                 │  OUTPUTS (right)            │
//   │                                │                             │
//   │  [Capture] [Import]            │  [Generated result tiles]   │
//   │  [Lighting ▾] [Grading ▾]      │                             │
//   │  [Style ▾]                     │                             │
//   │  prompt textarea               │                             │
//   │  [Generate · 1 credit]         │                             │
//   └──────────────────────────────────────────────────────────────┘
//
// Background is a radial cyan→blue→black gradient. No top bar — users
// leave this view by clicking a library/deck in the sidebar (App
// resets mainView to "slots" in those handlers).

(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const useLicense = window.useLicense;

  // Preset menus. None is the default ("Auto" — let the model decide).
  const LIGHTING_OPTIONS = [
    "Natural", "Cinematic", "Neon", "Golden Hour", "Moody", "Horror",
    "Studio Lighting", "Volumetric Lighting", "Rim Light", "Soft Light",
    "Harsh Shadows",
  ];
  const GRADING_OPTIONS = [
    "Teal and Orange", "Warm Film Look", "Cold Blue", "Cyberpunk Neon",
    "Desaturated", "Vintage Film", "High Contrast", "Pastel", "Dark Fantasy",
  ];
  const STYLE_OPTIONS = [
    "Cinematic CGI", "Pixar-style 3D", "Unreal Engine", "Anime",
    "Claymation", "Horror", "Fantasy", "Sci-Fi", "Game Cutscene",
    "Stop Motion", "Photoreal VFX",
  ];

  // Trigger button — just the labelled card that opens the preset
  // picker modal. The popup itself lives elsewhere (centered in the
  // left column) so this button has no dropdown attached.
  function PresetButton({ label, value, open, onOpen }) {
    return (
      <button
        type="button"
        className={`cd-vfx-preset${open ? " open" : ""}`}
        onClick={onOpen}>
        <span className="cd-vfx-preset-label">{label}</span>
        <span className="cd-vfx-preset-value">{value || "Auto"}</span>
      </button>
    );
  }

  // Deterministic placeholder swatch palette. Hashes the label name
  // to one of N gradient pairs so each option keeps a consistent icon
  // across renders. Stays loosely on-brand (cyan/blue/purple/pink).
  const SWATCHES = [
    ["#00e5ff", "#0080ff"], // bright cyan → blue
    ["#7c4dff", "#2962ff"], // violet → blue
    ["#ff4081", "#7c4dff"], // pink → violet
    ["#00bfa5", "#1de9b6"], // teal
    ["#ff6e40", "#ff3d00"], // amber → orange
    ["#536dfe", "#3d5afe"], // indigo
    ["#ffd740", "#ffab00"], // gold
    ["#69f0ae", "#00c853"], // green
    ["#ff5252", "#d50000"], // red
    ["#b388ff", "#651fff"], // light violet
    ["#84ffff", "#00b8d4"], // light cyan
    ["#f06292", "#ec407a"], // rose
  ];
  function swatchFor(label) {
    if (!label || label === "Auto") return ["rgba(140,220,255,0.30)", "rgba(40,90,200,0.30)"];
    let h = 0;
    for (let i = 0; i < label.length; i++) h = ((h << 5) - h + label.charCodeAt(i)) | 0;
    const pair = SWATCHES[Math.abs(h) % SWATCHES.length];
    return pair;
  }

  // Modal-style grid picker centered over the left column. Each
  // option is a tile with a gradient swatch (placeholder icon) + label.
  function PresetGrid({ title, options, value, onPick, onClose }) {
    // Esc to close.
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    return (
      <div className="cd-vfx-grid-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cd-vfx-grid-modal-header">
          <span className="cd-vfx-grid-modal-title">{title}</span>
          <button className="cd-vfx-grid-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cd-vfx-grid">
          {/* Auto/clear tile first */}
          <PresetTile
            label="Auto"
            selected={!value}
            onClick={() => onPick(null)}/>
          {options.map((opt) => (
            <PresetTile
              key={opt}
              label={opt}
              selected={value === opt}
              onClick={() => onPick(opt)}/>
          ))}
        </div>
      </div>
    );
  }

  function PresetTile({ label, selected, onClick }) {
    const [c1, c2] = swatchFor(label);
    const initial = label === "Auto"
      ? "✦"
      : label.split(/[\s-]/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return (
      <button
        type="button"
        className={`cd-vfx-tile${selected ? " selected" : ""}`}
        onClick={onClick}>
        <div
          className="cd-vfx-tile-icon"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
          {initial}
        </div>
        <div className="cd-vfx-tile-label">{label}</div>
      </button>
    );
  }

  // Map open-menu key → { title, options, value, setter }.
  function menuConfig(key, state) {
    if (key === "lighting") return { title: "Lighting Style",   options: LIGHTING_OPTIONS, value: state.lighting,    set: state.setLighting };
    if (key === "grading")  return { title: "Color Grading",    options: GRADING_OPTIONS,  value: state.grading,     set: state.setGrading  };
    if (key === "style")    return { title: "Style Preset",     options: STYLE_OPTIONS,    value: state.stylePreset, set: state.setStyle    };
    return null;
  }

  function CGfyView({ onClose, onDropOnTimeline }) {
    const lic = useLicense ? useLicense() : { isPro: false };
    const cgfy = (window.clipDeck && window.clipDeck.cgfy) || null;

    // ── Inputs state ───────────────────────────────────────────────────
    const [source, setSource] = useState(null);       // { localPath, durationSeconds, kind: "timeline" | "file" }
    const [capturing, setCapturing] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [lighting, setLighting] = useState(null);
    const [grading, setGrading]   = useState(null);
    const [stylePreset, setStyle] = useState(null);
    const [openMenu, setOpenMenu] = useState(null);   // "lighting" | "grading" | "style" | null

    // ── Results history + credits ──────────────────────────────────────
    // Each result: { id, status: "generating"|"done"|"failed", startedAt, prompt, sourceKind, result?: { localPath }, error? }
    const [results, setResults] = useState([]);
    const [credits, setCredits] = useState(null);
    const [error, setError] = useState(null);
    const [tick, setTick] = useState(0);              // forces elapsed re-render on running jobs
    const pollRefs = useRef(new Map());               // jobId → intervalId

    const refreshCredits = useCallback(async () => {
      if (!cgfy) return;
      const res = await cgfy.listCredits();
      if (res && res.ok) setCredits({ balance: res.balance });
    }, [cgfy]);

    useEffect(() => { refreshCredits(); }, [refreshCredits]);

    // Tick once a second while there's any in-flight job, for elapsed-time UI.
    useEffect(() => {
      if (!results.some((r) => r.status === "generating")) return;
      const id = setInterval(() => setTick((t) => t + 1), 1000);
      return () => clearInterval(id);
    }, [results]);

    // Cleanup poll intervals on unmount.
    useEffect(() => () => {
      pollRefs.current.forEach((id) => clearInterval(id));
      pollRefs.current.clear();
    }, []);

    // ── Actions ────────────────────────────────────────────────────────

    const onCapture = async () => {
      if (!cgfy || capturing) return;
      setError(null);
      setCapturing(true);
      const res = await cgfy.exportSelection();
      setCapturing(false);
      if (res && res.ok) {
        setSource({ localPath: res.localPath, durationSeconds: res.durationSeconds, kind: "timeline" });
      } else {
        setError((res && res.error) || "Couldn't capture timeline selection.");
      }
    };

    const onImport = async () => {
      // Browse Finder for an existing video file. Reuses the panel's
      // file picker (preload.js exposes pickFile which already filters
      // to media extensions).
      if (!window.clipDeck || !window.clipDeck.pickFile || capturing) return;
      setError(null);
      const picked = await window.clipDeck.pickFile();
      if (!picked || !picked.path) return;
      // Duration is unknown without probing; just show "(imported file)"
      // until Phase 2 wires actual ffprobe / file inspection.
      setSource({ localPath: picked.path, durationSeconds: 0, kind: "file", name: picked.name });
    };

    const onGenerate = async () => {
      if (!cgfy || !source || !prompt.trim()) return;
      if (!credits || credits.balance < 1) {
        setError("You're out of credits.");
        return;
      }
      setError(null);

      // Insert a "generating" tile in the results column immediately
      // so the user sees feedback.
      const tempId = "pending-" + Math.random().toString(36).slice(2, 10);
      const newResult = {
        id: tempId,
        status: "generating",
        startedAt: Date.now(),
        prompt: prompt.trim(),
        sourceKind: source.kind,
      };
      setResults((prev) => [newResult, ...prev]);

      // Step 1: extract the first frame from the source clip. The
      // AI model (image-to-video) needs an image anchor; we draw the
      // first frame to a canvas in the renderer and base64-encode it.
      let imageBase64;
      try {
        imageBase64 = await extractFirstFrame(source.localPath);
      } catch (e) {
        markResultFailed(tempId, "Couldn't read first frame from source clip: " + (e.message || e));
        return;
      }

      // Step 2: hand the prompt + image to the backend in one call.
      // Backend submits to the upstream provider and returns the job id.
      const promptText = composePrompt(prompt.trim(), { lighting, grading, stylePreset });
      const submitRes = await cgfy.submit({
        prompt:    promptText,
        imageBase64,
        duration:  "5",
        mode:      "std",
      });
      if (!submitRes || !submitRes.ok) {
        markResultFailed(tempId, (submitRes && submitRes.error) || "Submission failed.");
        return;
      }
      const realId = submitRes.jobId;
      setResults((prev) => prev.map((r) => r.id === tempId ? { ...r, id: realId } : r));

      // Step 3: poll the backend until the upstream job finishes.
      const intervalId = setInterval(async () => {
        const poll = await cgfy.pollJob(realId);
        if (!poll || !poll.ok) {
          // Soft fail — keep polling. Real failures land in poll.status.
          return;
        }
        if (poll.status === "completed") {
          clearInterval(intervalId);
          pollRefs.current.delete(realId);
          const dl = await cgfy.downloadResult(realId, poll.resultUrl);
          if (dl && dl.ok) {
            setResults((prev) => prev.map((r) =>
              r.id === realId ? { ...r, status: "done", result: { localPath: dl.localPath } } : r
            ));
          } else {
            markResultFailed(realId, (dl && dl.error) || "Download failed.");
          }
          await refreshCredits();
        } else if (poll.status === "failed") {
          clearInterval(intervalId);
          pollRefs.current.delete(realId);
          markResultFailed(realId, poll.statusMsg || poll.error || "Generation failed.");
          await refreshCredits();
        }
      }, 8000);
      pollRefs.current.set(realId, intervalId);
    };

    // Extract the first frame of a local video file as base64 JPEG.
    // Uses an off-DOM <video> + canvas. file:// URLs are same-origin
    // with the panel (which loads via file://) so cross-folder reads
    // work under default web security.
    function extractFirstFrame(localPath) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.preload = "auto";
        video.playsInline = true;
        // Encode any special path characters; Electron file:// URLs
        // tolerate spaces but won't decode percent-encoded already.
        const fileUrl = "file://" + localPath.split("/").map(encodeURIComponent).join("/")
          .replace(/^file%3A%2F%2F/, "file://"); // leave file:// prefix intact
        video.src = "file://" + localPath; // simpler: trust the path as-is
        let done = false;
        const cleanup = () => { done = true; };
        const timeout = setTimeout(() => {
          if (!done) { cleanup(); reject(new Error("Frame extraction timed out (10s)")); }
        }, 10000);
        video.onloadeddata = () => {
          // Seek slightly past 0 — some codecs return a black frame at
          // exact 0 (frame index 0 is sometimes the I-frame's display).
          try { video.currentTime = 0.05; } catch (e) {}
        };
        video.onseeked = () => {
          if (done) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width  = video.videoWidth  || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
            const base64 = dataUrl.split(",")[1] || "";
            clearTimeout(timeout);
            cleanup();
            if (!base64) reject(new Error("Empty frame")); else resolve(base64);
          } catch (e) {
            clearTimeout(timeout);
            cleanup();
            reject(e);
          }
        };
        video.onerror = () => {
          clearTimeout(timeout);
          cleanup();
          reject(new Error("Couldn't load video for frame extraction"));
        };
      });
    }

    const markResultFailed = (id, errMsg) => {
      setResults((prev) => prev.map((r) =>
        r.id === id ? { ...r, status: "failed", error: errMsg } : r
      ));
      refreshCredits();
    };

    const onDropResult = async (r) => {
      if (!r.result) return;
      if (onDropOnTimeline) await onDropOnTimeline(r.result.localPath);
    };

    // ── Rendering helpers ──────────────────────────────────────────────

    const sourceLabel = source
      ? (source.kind === "file"
          ? (source.name || "Imported file")
          : `Timeline selection · ${source.durationSeconds.toFixed(1)}s`)
      : null;

    const canGenerate = !!source && prompt.trim().length > 0 && (credits && credits.balance >= 1);

    const activeMenu = openMenu && menuConfig(openMenu, {
      lighting, setLighting,
      grading,  setGrading,
      stylePreset, setStyle,
    });

    return (
      <div className="cd-vfx-view">
        <div className="cd-vfx-layout">
          {/* ── LEFT: inputs ── */}
          <div className="cd-vfx-left">
            {/* Scrolling content. Anything sitting OUTSIDE this wrapper
                (the scrim + the grid modal) is positioned against the
                left column's outer bounds and stays put while content
                scrolls beneath. */}
            <div className="cd-vfx-left-scroll">
            <h1 className="cd-vfx-title">VFX Engine</h1>

            <div className="cd-vfx-section">
              <div className="cd-vfx-section-h">Source</div>
              {source
                ? (
                  <div className="cd-vfx-source-preview">
                    <div className="cd-vfx-source-thumb" aria-hidden="true">▶</div>
                    <div className="cd-vfx-source-meta">
                      <div className="cd-vfx-source-name">{sourceLabel}</div>
                      <div className="cd-vfx-source-sub">
                        {source.kind === "timeline" ? "From timeline" : "Imported"}
                      </div>
                    </div>
                    <button className="cd-vfx-source-clear"
                            onClick={() => setSource(null)}
                            title="Remove source">×</button>
                  </div>
                )
                : (
                  <div className="cd-vfx-source-buttons">
                    <button
                      className="cd-vfx-source-capture"
                      onClick={onCapture}
                      disabled={capturing}>
                      {capturing ? "Capturing…" : "Capture from Timeline"}
                    </button>
                    <button
                      className="cd-vfx-source-import"
                      onClick={onImport}
                      disabled={capturing}
                      title="Import a video file from your computer">
                      Import from Computer
                    </button>
                  </div>
                )
              }
            </div>

            <div className="cd-vfx-section">
              <div className="cd-vfx-section-h">Style</div>
              <div className="cd-vfx-presets">
                <PresetButton
                  label="Lighting"
                  value={lighting}
                  open={openMenu === "lighting"}
                  onOpen={() => setOpenMenu("lighting")}/>
                <PresetButton
                  label="Color Grading"
                  value={grading}
                  open={openMenu === "grading"}
                  onOpen={() => setOpenMenu("grading")}/>
                <PresetButton
                  label="Style Preset"
                  value={stylePreset}
                  open={openMenu === "style"}
                  onOpen={() => setOpenMenu("style")}/>
              </div>
            </div>

            <div className="cd-vfx-section">
              <div className="cd-vfx-section-h">Prompt</div>
              <textarea
                className="cd-vfx-prompt"
                placeholder='e.g. "make this look like a Pixar shot with vibrant colors"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}/>
            </div>

            {error && <div className="cd-vfx-error">{error}</div>}

            <button
              className="cd-vfx-generate"
              disabled={!canGenerate}
              onClick={onGenerate}
              title={
                !source        ? "Add a source clip first" :
                !prompt.trim() ? "Type a prompt" :
                !credits || credits.balance < 1 ? "Out of credits" :
                "Send to VFX Engine"
              }>
              <span className="cd-vfx-generate-label">Generate</span>
              <span className="cd-vfx-generate-cost">
                1 credit
                {credits != null && <span className="cd-vfx-generate-balance"> · {credits.balance} left</span>}
              </span>
            </button>
            </div>{/* /cd-vfx-left-scroll */}

            {/* Preset picker overlay — scrim + grid modal both scoped
                to the left column, so the right column / outputs stay
                fully visible and unblurred. */}
            {activeMenu && (
              <>
                <div className="cd-vfx-section-scrim" onMouseDown={() => setOpenMenu(null)}/>
                <PresetGrid
                  title={activeMenu.title}
                  options={activeMenu.options}
                  value={activeMenu.value}
                  onPick={(v) => { activeMenu.set(v); setOpenMenu(null); }}
                  onClose={() => setOpenMenu(null)}/>
              </>
            )}
          </div>

          {/* ── RIGHT: outputs ── */}
          <div className="cd-vfx-right">
            <div className="cd-vfx-right-h">Generations</div>
            {results.length === 0 && (
              <div className="cd-vfx-empty">
                <div className="cd-vfx-empty-icon" aria-hidden="true">✦</div>
                <div className="cd-vfx-empty-text">Your generations will appear here.</div>
              </div>
            )}
            <div className="cd-vfx-results">
              {results.map((r) => (
                <ResultCard key={r.id} result={r} onDrop={onDropResult}/>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ResultCard({ result, onDrop }) {
    const elapsedSec = result.startedAt ? Math.floor((Date.now() - result.startedAt) / 1000) : 0;
    const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;
    return (
      <div className={`cd-vfx-result cd-vfx-result--${result.status}`}>
        <div className="cd-vfx-result-thumb" aria-hidden="true">
          {result.status === "generating" && <div className="cd-vfx-spinner"/>}
          {result.status === "done" && <span>✓</span>}
          {result.status === "failed" && <span>!</span>}
        </div>
        <div className="cd-vfx-result-meta">
          <div className="cd-vfx-result-prompt" title={result.prompt}>{result.prompt}</div>
          <div className="cd-vfx-result-status">
            {result.status === "generating" && <>Generating · {elapsed}</>}
            {result.status === "done" && <>Ready</>}
            {result.status === "failed" && <>Failed{result.error ? ` — ${result.error}` : ""}</>}
          </div>
        </div>
        {result.status === "done" && (
          <button className="cd-vfx-result-drop" onClick={() => onDrop(result)}>
            Drop
          </button>
        )}
      </div>
    );
  }

  // Combine the user's freeform prompt with any selected preset
  // dimensions into a single prompt string. The presets just append
  // descriptive tags — letting the underlying model do the heavy
  // lifting on prompt-engineering rather than us hand-tuning it.
  function composePrompt(userPrompt, presets) {
    const parts = [userPrompt];
    if (presets.lighting)    parts.push(`Lighting: ${presets.lighting}.`);
    if (presets.grading)     parts.push(`Color grading: ${presets.grading}.`);
    if (presets.stylePreset) parts.push(`Style: ${presets.stylePreset}.`);
    return parts.join(" ");
  }

  window.CGfyView = CGfyView;
})();
