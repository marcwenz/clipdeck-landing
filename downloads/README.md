# Download files for the Clip Deck landing page

The three "Download for Mac" buttons on the site (nav bar, hero, and below the
video) all link to:

    downloads/ClipDeck-mac.pkg

This file is **already in place** (currently Clip Deck 0.0.1, ~108 MB). The
buttons use the HTML `download` attribute, so a single click starts an instant,
free download — no new tab, no "save as" popup — and the visitor saves it as
`ClipDeck-0.0.1.pkg`.

## Shipping a new version

1. Replace `downloads/ClipDeck-mac.pkg` with the new build (keep that exact
   filename so the buttons keep working — no HTML change needed).
2. Tell me the new version number so I can bump the saved filename in the
   buttons' `download="ClipDeck-x.y.z.pkg"` attribute (optional, cosmetic).

## Heads-up: file size & hosting

The installer is ~108 MB. That's fine for local preview, but several static
hosts reject files over 100 MB (e.g. GitHub Pages). If a deploy refuses the
file, host the installer on a CDN or GitHub Releases and share the direct URL —
the buttons can point there instead (a `.pkg` still auto-downloads with no
popup, even cross-origin).

## Windows

The Windows ("beta") buttons are still placeholders — wire those up the same way
once the Windows build is ready.
