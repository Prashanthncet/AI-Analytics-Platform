# NEXT SESSION — handoff notes (saved Aug 8)

Pick up here tomorrow. Everything below is the current truth of the project.

## What the platform does (done & working)

AI Product Analytics platform — public dashboard, admin-only login, monitors the user's real
sites, tracks AI tool/API-key usage, licensed software, and produces PDF/CSV reports + an
admin chatbot. Local preview: frontend `http://localhost:3001`, backend `http://localhost:5001`.

**Current live state (verified):**
- 5 projects: NDC & Co., Document Verification Tool, Kannada Keyword Extractor, NDC Mobile App, DocVerify Mobile
- 5 deployments monitoring real URLs — all LIVE (60s monitor worker)
- 3 real API keys (Gemini, OpenAI, Anthropic — user pasted, AES-256 encrypted)
- 12 products (7 AI tools + 5 licensed software)
- **Zero dummy data** — all seeded visits/usage/placeholder keys removed; seed rewritten to never fabricate data
- Admin login: `admin@corp.com` / password from `backend/.env` `ADMIN_PASSWORD` (default `secret123`)

## What the user was doing — LIVE TRACKING (in progress)

User embedded the snippet in their deployed Kannada site, but the snippet points at
`http://localhost:3001/t.js` — that only exists on this dev machine, so **no visits arrive**
(DB confirmed 0). Root cause: the analytics platform itself is not deployed to a public URL yet.

**The whole fix is prepared and committed to disk — user needs to execute deployment:**
- `render.yaml` (repo root) — Render Blueprint for backend (AUTO_SEED=true, health check)
- `DEPLOYMENT.md` — full step-by-step: MongoDB Atlas → Render backend → Vercel frontend → final snippets
- Auto-seed with retry added to `server.ts` (seeds admin + real projects/products on first boot)
- Backend build ✅, frontend typecheck ✅, importable `runSeed()` verified ✅

**User's 3 steps tomorrow (from DEPLOYMENT.md):**
1. MongoDB Atlas free cluster → `mongodb+srv://...` connection string
2. Render → New → Blueprint → repo → set `MONGO_URI`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`
3. Vercel → import repo (root `frontend`) → env `BACKEND_URL=https://ai-analytics-api.onrender.com`

**Then update the snippets (production versions):**
- Kannada Keyword Extractor (Vite, `frontend/index.html` in their repo):
  `<script src="https://YOUR-PLATFORM.vercel.app/t.js" data-site="6a76187b68b6cd36d719d6db" data-site-type="project"></script>`
- Document Verification Tool: same line, `data-site="6a76187b68b6cd36d719d6da"`

## Project IDs (already in DB, stable)

| Site | project _id |
|---|---|
| NDC & Co. | `6a76187b68b6cd36d719d6d9` |
| Document Verification Tool | `6a76187b68b6cd36d719d6da` |
| Kannada Keyword Extractor | `6a76187b68b6cd36d719d6db` |
| NDC Mobile App | `6a76187b68b6cd36d719d6dc` |
| DocVerify Mobile | `6a76187b68b6cd36d719d6dd` |

## User's stack (for context)

- Their sites: React frontend (Vite) on Vercel + Python Flask backend on Render, GitHub auto-deploy
- This analytics platform: Next.js frontend + Express/Mongoose backend, local Mongo (docker-compose or local)

## Open offers / next milestones (pick up anytime)

1. **Deploy the platform** (above) — the active task
2. Provider usage connectors — auto-pull real usage/cost from Anthropic/OpenAI/Gemini APIs with the real stored keys
3. Offline alerting — email/webhook when a deployment goes down
4. The 30-day series window edge fix (cosmetic, noted in review) — optional

## Commands

- Backend dev: `cd backend && npm run dev`
- Frontend dev: `cd frontend && BACKEND_URL=http://localhost:5001 npm run dev`
- Seed/reset: `cd backend && npm run seed -- --reset`
- Build: `cd backend && npm run build`
- Frontend checks: `cd frontend && npx tsc --noEmit` and `npx eslint src/ --max-warnings 0`
