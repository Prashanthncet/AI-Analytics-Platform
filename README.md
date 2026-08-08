# AI Product & Project Analytics Platform

A centralized dashboard to manage organizational projects, software products, API keys, usage and costs — with **live deployment monitoring**, **embedded visitor analytics**, **usage vs quota tracking**, and **downloadable analytical reports**. See [`docs/PRD.md`](docs/PRD.md) for the full product requirements.

## Architecture

```
React Dashboard (Next.js)   →   Node.js API (Express)   →   MongoDB
                                     |
                   Uptime monitor worker (polls deployment check URLs)
```

- **Frontend**: Next.js (pages router) + React 19 + Tailwind CSS v4 + lucide-react + Apache ECharts
- **Backend**: Node.js + Express 5 + Mongoose + pdfkit (report generation)
- **Database**: MongoDB (local install or Docker Compose)
- **Auth**: JWT bearer tokens — **admin only** (public registration is disabled)

## Features

### Public dashboard (no login required to view)
- Overview of projects, products, API keys, users and **deployment health**
- Project / product / API key lists with live status, usage bars and remaining quotas
- Project detail pages with **deployment live/offline status**, uptime %, response time

### Admin-only management
- **Only the admin can create / edit / delete** projects, products, API keys and deployments (JWT + role gate on every write endpoint, gated buttons in the UI)
- Admin account is provisioned by `npm run seed` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars

### Live / offline monitoring
- Every project, AI tool or API key can have **deployments** (web / app / desktop / api) with a **check URL**
- A background monitor worker probes each check URL every 60s (10s timeout) and records: **LIVE / OFFLINE** status, response time (ms), rolling **uptime %**, and check history
- Keys with an expired date are **auto-marked expired**
- LIVE/OFFLINE badges appear on the dashboard, project lists and project detail pages

### Visitor analytics (embed one line of JS)
- The platform serves an embeddable tracking snippet at `/t.js`
- Add it to any website or web app to start collecting pageviews:
  ```html
  <script src="https://your-platform.com/t.js" data-site="<PROJECT_ID>" data-site-type="project"></script>
  ```
- Daily / weekly / monthly / yearly visitor + pageview totals, 30-day trend charts (ECharts) and top pages per project/product/key
- **Note:** visitors are estimated from session-based tracking (localStorage session id) — no cookies, no cross-site identity

### Usage vs quota
- API keys and products carry `quota` / `usage` / `costUsd` — the UI shows **used, remaining, and %** with color-coded progress bars
- Admins can log usage increments (`POST /api/usage`) which append to a daily history series

### Analytical reports
- On-demand **PDF and CSV** reports per project / product / API key (admin): resource summary, visitor totals, daily traffic, top pages, usage & cost, deployments & uptime
- CSV gives the raw daily series for spreadsheet work

### Admin analytics assistant (chatbot)
- Floating assistant widget (visible to admins only) that answers questions in natural language **from your live data** — e.g. “is my site down?”, “visitors this month”, “which API key uses the most?”, “licenses expiring soon”
- Replies come back as prose, tables, charts and one-click **PDF/CSV report** downloads (`POST /api/chat`)

## Quick Start

> **Port note:** on this machine ports `3000` and `5000` are used by other projects, so the
> backend runs on **5001** and the frontend on **3001**. Adjust `backend/.env` and the
> `next dev -p` flag if your environment differs.

### 1. Database

The backend connects to MongoDB on `localhost:27017`. Two options:

- **Local MongoDB install** (no auth — current default):
  `MONGO_URI=mongodb://localhost:27017/ai_analytics`
- **Docker Compose** (with auth):
  ```bash
  docker-compose up -d
  MONGO_URI=mongodb://admin:password@localhost:27017/ai_analytics?authSource=admin
  ```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit values (JWT_SECRET, ENCRYPTION_KEY, MONGO_URI, ADMIN_*)
npm run seed           # creates the admin + data (idempotent)
npm run seed -- --reset   # wipe ALL data and reseed from scratch (real projects/AI tools/software/keys)
npm run dev            # http://localhost:5001
```

**There is no public registration.** The admin account is created by the seed script from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@corp.com` / `secret123`).

### 3. Frontend

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:5001 npm run dev -p 3001   # http://localhost:3001
```

The Next.js dev server proxies `/api/*` **and `/t.js`** to the backend (see `next.config.ts`; override with `BACKEND_URL`).

## API Overview

Reads are **public** (view-only). Writes require an admin JWT (`Authorization: Bearer <token>`).

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/login` · GET `/api/auth/me` | public / authenticated |
| GET | `/api/projects` · `/api/projects/:id` | public |
| POST/PATCH/DELETE | `/api/projects...` | admin |
| GET | `/api/products` · `/api/products/:id` | public |
| POST/PATCH/DELETE | `/api/products...` | admin |
| GET | `/api/apikeys` · `/api/apikeys/:id` | public (keys stay masked) |
| POST/PATCH/DELETE | `/api/apikeys...` | admin |
| GET | `/api/deployments` · `/api/deployments/:id` | public |
| POST/PATCH/DELETE | `/api/deployments...` | admin |
| GET | `/api/dashboard/stats` | public |
| GET | `/t.js` · POST `/api/track` | public (tracking snippet + pageview events) |
| GET | `/api/visitors/:siteType/:siteId?days=30` | public |
| GET | `/api/usage/:targetType/:targetId?days=30` | public |
| POST | `/api/usage` | admin (log usage/cost increment) |
| GET | `/api/reports/:targetType/:targetId?format=pdf\|csv` | admin |

**Security notes**

- Passwords are hashed with bcrypt (10 rounds) and never returned.
- API key secrets are encrypted with AES-256-GCM using `ENCRYPTION_KEY` (falls back to `JWT_SECRET`); only a masked preview (`sk-p••••cdef`) is ever exposed by the API.
- Invalid/expired tokens return `401`; non-admin writes return `403`; duplicate records return `409`.
- The uptime monitor only ever issues `GET` requests to check URLs — set `checkUrl` to a lightweight health endpoint.

## Scripts

| Directory | Script | Purpose |
|---|---|---|
| `backend` | `npm run seed` | provision admin + idempotent demo data |
| `backend` | `npm run dev` | dev server (tsx watch, starts monitor worker) |
| `backend` | `npm run build` / `npm start` | compile + run production build |
| `frontend` | `npm run dev` | dev server |
| `frontend` | `npm run build` / `npm run lint` | production build / lint |
