# Deploying clipdeck.inthezone.studio

**Site → Cloudflare Pages. Mac installer → GitHub Releases.**

Everything lives in **one GitHub repo**: the repo's files are the website
(served by Cloudflare Pages), and the repo's **Releases** hold the ~108 MB
installer. The installer is kept *out* of the website because it exceeds
Cloudflare Pages' 25 MB-per-file limit (and GitHub's 100 MB file limit for
normal repo files — Releases are the exception, built for big binaries).

---

## 0. One-time — put the project on GitHub

1. Create a new, empty GitHub repo. Suggested name: **`clipdeck-landing`**.
2. From this folder:

   ```sh
   git init
   git add .
   git commit -m "Clip Deck landing page"
   git branch -M main
   git remote add origin https://github.com/marcwenz/clipdeck-landing.git
   git push -u origin main
   ```

   The included `.gitignore` automatically keeps the 108 MB installer, ~9.6 MB
   of unused sample assets, and dev/back-end files out of the deploy.

---

## 1. Installer → GitHub Releases

1. On the repo → **Releases** → **Draft a new release**.
2. Tag: `v0.0.1` (release title e.g. "Clip Deck 0.0.1").
3. **Attach the installer**: drag your `.pkg` into the assets box and make sure
   the uploaded file is named exactly **`ClipDeck-mac.pkg`**.
   - Using a *stable* asset name means the website never needs editing for
     future versions — just upload each new build under the same name.
4. **Publish release.** The permanent download URL is:

   ```
   https://github.com/marcwenz/clipdeck-landing/releases/latest/download/ClipDeck-mac.pkg
   ```

   `latest` always resolves to your newest published release.

---

## 2. Wire the download buttons  ←  (I do this for you)

As soon as you tell me your **`marcwenz/clipdeck-landing`**, I'll repoint all three
"Download for Mac" buttons (nav, hero, below the video) at the URL above.

A cross-origin `.pkg` still auto-downloads with no popup — GitHub serves release
assets with `Content-Disposition: attachment`, so the click downloads the file
without navigating away.

---

## 3. Site → Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → choose your repo.
2. Build settings:
   - Framework preset: **None**
   - Build command: **(leave empty)**
   - Build output directory: **`/`** (root)
3. **Save and Deploy.** You'll get a `https://<project>.pages.dev` URL — open it
   and confirm the site loads.

---

## 4. Custom domain → clipdeck.inthezone.studio

- **If inthezone.studio's DNS is on Cloudflare:** Pages project → **Custom
  domains** → **Set up a domain** → enter `clipdeck.inthezone.studio`.
  Cloudflare creates the DNS record and provisions HTTPS automatically.

- **If DNS is somewhere else** (registrar, etc.): create a **CNAME** record
  `clipdeck` → `<project>.pages.dev`, then add the custom domain in the Pages
  project and let it verify. HTTPS is still automatic.

---

## 5. After it's live

- Click a "Download for Mac" button end-to-end and confirm the `.pkg`
  downloads.
- Pageview analytics begin logging automatically (the `localhost` skip in
  `script.js` no longer applies) — check your Google Sheet.
- **New installer version later?** Upload it to a new GitHub Release as
  `ClipDeck-mac.pkg`. Nothing else changes.

---

## Notes

- `apps-script.gs` (the waitlist/pageview back-end) is intentionally excluded
  from the public site by `.gitignore`. It's already deployed as a live Apps
  Script; keep a copy somewhere safe.
- **Windows** installer: attach a `ClipDeck-win.exe` to the same GitHub Release
  and tell me to wire the Windows ("beta") buttons the same way.
- **Code signing:** if the `.pkg` isn't signed/notarized by Apple, macOS will
  warn users it's from an "unidentified developer" on install. That's a
  build-side step, separate from hosting.
