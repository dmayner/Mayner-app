# Deploying the Mayner Leadership app to Netlify

You do NOT need to install anything or use a terminal. Netlify builds it for you.

## What's in this folder
- `index.html` — the page shell
- `src/` — the app itself (MaynerLogger.jsx is the whole dashboard)
- `package.json`, `vite.config.js` — build settings
- `netlify.toml` — tells Netlify how to build it
- `.gitignore` — housekeeping

You do not need to open or edit any of these to deploy. (The one thing you
MIGHT edit later is the webhook URL — see "Rotating the webhook" below.)

────────────────────────────────────────────────────────

## OPTION A — Drag-and-drop with GitHub (recommended, gives auto-updates)

1. Go to github.com, sign in (or make a free account).
2. Click the "+" top right → "New repository." Name it "mayner-app," leave it
   Public or Private, click "Create repository."
3. On the next page click "uploading an existing file."
4. Drag EVERYTHING in this folder (index.html, src, package.json, etc.) into
   the upload area. Do NOT include node_modules or dist if they exist.
5. Click "Commit changes."
6. Go to netlify.com, sign in with GitHub.
7. "Add new site" → "Import an existing project" → pick GitHub → choose your
   "mayner-app" repo.
8. Netlify auto-detects the settings from netlify.toml. Just click "Deploy."
9. Wait ~1 minute. You'll get a live URL like
   https://mayner-app-xyz.netlify.app
   Done. You can rename that URL in Site settings → Domain.

Any time you want to change the app, upload the new file to GitHub and Netlify
redeploys automatically.

────────────────────────────────────────────────────────

## OPTION B — Netlify Drop (fastest, but no auto-updates)

This needs a pre-built version. Because the build has to happen somewhere,
Option A is genuinely easier since Netlify builds for you. Use Option A.

────────────────────────────────────────────────────────

## Rotating the webhook (do this before real use)

The app currently points at the Make webhook URL that was used during setup.
To swap in a fresh one:

1. In Make, open the Custom webhook module, delete the hook, create a new one,
   copy the new URL.
2. Open src/MaynerLogger.jsx, find the line near the top that starts with:
      const WEBHOOK_URL = "https://hook..."
3. Replace the URL inside the quotes with your new one.
4. Re-upload that file to GitHub. Netlify redeploys. Done.

────────────────────────────────────────────────────────

## Testing once it's live

1. Open your Netlify URL.
2. Add a test client (use an email you can check), include a first session note.
3. Look at your Google Sheet — a new row should appear within a few seconds.
4. Log a session for an existing client — that row should update.
5. Check the Make scenario history if anything doesn't show up; it logs every
   run and shows exactly what came through.
