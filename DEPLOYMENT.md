# Deploying the AI Analytics Platform (so live tracking works)

The tracking snippet points browsers at **this platform's public URL**. Until this platform
is deployed to a real domain, the snippet must NOT use `localhost` — browsers on other
machines cannot reach your computer. Follow these steps once, and live visitor data flows.

## Architecture after deployment

```
Visitor's browser (kannada-keyword-extractor.vercel.app)
   │  loads <script src="https://YOUR-FRONTEND/t.js" data-site="...">
   ▼
Vercel frontend (Next.js) ──rewrites /api/* and /t.js──► Render backend (Express)
                                                            │  stores visits
                                                            ▼
                                                     MongoDB Atlas
```

The frontend rewrites `/t.js` and `/api/*` to the backend, so the snippet URL is simply
**your frontend domain** — visitors never need to know about the backend.

## Step 1 — MongoDB Atlas (free)

1. Go to https://www.mongodb.com/atlas → create a **free M0 cluster**.
2. Under **Database Access** create a user + password.
3. Under **Network Access** → allow access from **everywhere** (`0.0.0.0/0`) so Render can connect.
4. **Connect → Drivers** → copy the connection string:
   `mongodb+srv://iamprashanthb05_db_user:Prashanth123@cluster0.dgowzob.mongodb.net/?appName=Cluster0`
   (replace `<user>`, `<password>`, and the cluster name).

## Step 2 — Backend on Render (free)

1. Push this repo to GitHub.
2. https://dashboard.render.com → **New → Blueprint** → select the repo.
   Render reads `render.yaml` (already in the repo root) and creates the `ai-analytics-api` service.
3. Render will ask for the **sync:false** env values — set:
   - `MONGO_URI` = your Atlas connection string from Step 1
   - `JWT_SECRET` = long random string (e.g. from `openssl rand -hex 32`)
   - `ENCRYPTION_KEY` = another long random string (different from JWT_SECRET)
   - `ADMIN_PASSWORD` = your admin login password
   - `ADMIN_EMAIL` is preset to `admin@corp.com` (change in render.yaml if you want another)
4. Deploy. `AUTO_SEED=true` is already set, so on first boot the server creates the admin
   account, your 5 projects, deployments (monitoring your real URLs), and your products —
   no manual seeding needed.
5. Note your service URL: `https://ai-analytics-api.onrender.com`. Confirm it answers:
   `curl https://ai-analytics-api.onrender.com/api/health` → `{"status":"ok",...}`

## Step 3 — Frontend on Vercel

1. https://vercel.com → **Add New Project** → import this same repo.
2. Framework preset: **Next.js** (auto-detected). Root directory: `frontend`.
3. Under **Environment Variables** add:
   - `BACKEND_URL` = `https://ai-analytics-api.onrender.com` (your Render URL)
4. Deploy. Note your frontend URL: `https://your-platform.vercel.app`.
5. Confirm the proxy works:
   `curl https://your-platform.vercel.app/api/health` → `{"status":"ok",...}`
   `curl https://your-platform.vercel.app/t.js` → the tracking script

## Step 4 — Log in & verify

1. Open `https://your-platform.vercel.app` → **Log in** with `admin@corp.com` + your `ADMIN_PASSWORD`.
2. You'll see your 5 projects and 5 live deployments (real monitoring via the same 60s worker).
3. Re-add your 3 real API keys on the API Keys page (the deployed DB starts fresh —
   keys you pasted earlier live only in the local database).

## Step 5 — Switch your tracking snippets to production

In your Kannada Keyword Extractor repo (`frontend/index.html`):

```html
<script src="https://your-platform.vercel.app/t.js" data-site="6a76187b68b6cd36d719d6db" data-site-type="project"></script>
```

Document Verification Tool (`index.html`):

```html
<script src="https://your-platform.vercel.app/t.js" data-site="6a76187b68b6cd36d719d6da" data-site-type="project"></script>
```

Commit & push → Vercel auto-deploys your site → every visit is now counted in the dashboard.

> Note: the `/t.js` snippet self-locates the API from its own `src`, and the frontend rewrites
> `/api/track` to the backend, so cross-origin CORS is not an issue (also open server-side).

## Local development (unchanged)

- Backend: `cd backend && npm run dev` (port 5001)
- Frontend: `cd frontend && BACKEND_URL=http://localhost:5001 npm run dev` (port 3001)
- Seed/reset: `cd backend && npm run seed -- --reset`

## Updating later

Push to GitHub → Render and Vercel both auto-deploy. The monitor worker keeps running 24/7
on Render — uptime checks, key expiry, and visitor collection never stop.
