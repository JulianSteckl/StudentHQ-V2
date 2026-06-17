# StudentHQ v2 ("Scholar")

A single-file React academic dashboard for students (homework, notes, flashcards,
schedule, grades, AI tools), with an optional MongoDB-backed profile sync API.

## Cursor Cloud specific instructions

### Layout & services
- `index.html` (frontend): a **self-contained, no-build** React app (~3.2k lines). It
  loads React, ReactDOM, `@babel/standalone`, and Google GSI from CDNs and transpiles
  the in-page `text/babel` script in the browser. **Internet access is required** for it
  to render (CDN scripts + Google Fonts).
- `api/profile.js` (backend, optional): a Vercel serverless function
  (`module.exports = async (req, res) => {...}`) that stores/reads profiles in MongoDB.
  Used only for cross-device profile sync. It requires the `MONGODB_URI` env var and a
  reachable MongoDB instance, and is normally served via `vercel dev`.

### Running the frontend (primary dev workflow)
- Serve the repo root statically and open the app, e.g. `python3 -m http.server 3000`
  then visit `http://localhost:3000`.
- The frontend **gracefully degrades**: when `/api/profile` is unavailable (e.g. a plain
  static server returns 404), it catches the error and falls back to `localStorage`. So a
  static server is sufficient for developing the UI — no DB needed.
- To onboard **without Google OAuth**, click **"Open fresh notebook →"** on the landing
  screen to use the manual 3-step setup flow.

### Running the API (optional)
- `vercel dev` is the canonical way to run `index.html` + `/api/profile` together, but it
  requires interactive Vercel login (needs a Vercel token) and `MONGODB_URI`, so it is not
  set up automatically here. The UI does not need it.

### Lint / test / build
- There is **no build step**, no linter config, and no test suite in this repo (the only
  dependency is `mongodb`, used by the API function). `npm install` is the only setup step.
