# Scholar (StudentHQ-V2)

Academic dashboard for homework, notes, flashcards, schedule, grades, and tools. The UI is a **Vite + React** SPA; profile and user data sync through **Vercel serverless API routes** backed by **MongoDB Atlas**.

Production: [studenthq-v2.vercel.app](https://studenthq-v2.vercel.app)

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite 5, React 18 (`src/`) |
| API | `api/data.js`, `api/profile.js` (Node serverless) |
| Database | MongoDB Atlas |
| Auth | Google Identity Services (OAuth 2.0 Bearer tokens) |
| Deploy | Vercel (`git push` → auto deploy) |

React is installed via npm and bundled at build time. There is **no in-browser Babel**. The only runtime CDN script is [Google Identity Services](https://accounts.google.com/gsi/client) for sign-in.

## Project layout

```
index.html          Vite entry shell
src/
  main.jsx          App root + screens
  data.js           Shared constants & GPA helpers
  storage.js        localStorage + cloud sync client
  user-data-helpers.js
  theme.js, icons.jsx, styles.css
api/
  data.js           GET/POST user data (homework, grades, notes, …)
  profile.js        GET/POST profile (subjects, name, school)
```

## Local development

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB with a compatible URI)
- Google Cloud OAuth 2.0 **Web client** with authorized JavaScript origins:
  - `http://localhost:5173`
  - your Vercel production URL

### Setup

```bash
npm install
cp .env.example .env.local   # optional for local API testing on Vercel CLI
```

Set environment variables (see below). For frontend-only work:

```bash
npm run dev
```

Open `http://localhost:5173`. Data persists in `localStorage`; cloud sync requires a valid Google token and working `/api/*` routes.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint on `src/` |

### API routes locally

Use the [Vercel CLI](https://vercel.com/docs/cli) to run API functions with env vars:

```bash
npx vercel env pull .env.local
npx vercel dev
```

## Environment variables

Set these in Vercel **Project → Settings → Environment Variables** (and in `.env.local` for `vercel dev`):

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `GOOGLE_CLIENT_ID` | Yes* | OAuth client ID (API verifies Bearer tokens) |
| `ALLOWED_ORIGINS` | No | Comma-separated extra CORS origins |

\* A default client ID exists in code for the shipped demo; use your own client for a fork.

## Google OAuth

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Identity** / OAuth consent screen.
3. Create **OAuth 2.0 Client ID** (Web application).
4. Add authorized JavaScript origins: `http://localhost:5173`, `https://<your-vercel-domain>`.
5. Copy the client ID into `GOOGLE_CLIENT_ID` (Vercel) and `src/storage.js` if you maintain a separate frontend constant.

Sign-in flow: GIS returns an access token → stored in `localStorage` → sent as `Authorization: Bearer …` to `/api/profile` and `/api/data`.

## MongoDB

Collections are created automatically. Documents are keyed by the authenticated user's email.

- **Profiles** — name, grade, school, subjects
- **User data** — homework, grades, notes, flashcards, quizzes, schedule, prefs

Use a dedicated database user with read/write on one database (e.g. `scholar`).

## Deploy (Vercel)

1. Connect the GitHub repo to Vercel.
2. Framework preset: **Vite** (or use root `vercel.json`).
3. Set `MONGODB_URI` and `GOOGLE_CLIENT_ID` in Vercel env.
4. Push to `master` — Vercel builds `vite build` and deploys `dist/` plus `api/` functions.

`vercel.json` rewrites non-API routes to `index.html` for SPA fallback.

## Archive

`archive/Scholar.dc.html` is an early **Broadsheet** design mock (standalone HTML). It is not part of the build or deploy.
