# CLAUDE.md — Athar (أثر)

Project context for Claude Code. Read this before making changes.

## What this is

**Athar (أثر)** — an AI-assisted **nonprofit grant-review platform** for the KSA
market. Organizations submit grant/project applications; reviewers evaluate them
with AI assistance; admins oversee users, sessions, analytics, and security.
Bilingual **Arabic (RTL) / English (LTR)**.

## Architecture — modular monolith

| Layer | Stack |
|---|---|
| **Backend** | FastAPI 0.115, Python 3.11, SQLAlchemy, Pydantic v2 |
| **Frontend** | Next.js 14 (App Router, standalone), React 18, TypeScript |
| **UI system** | **Ant Design v6** (`antd`) — themed once via `ConfigProvider`; do NOT hand-roll components or reintroduce shadcn/Tailwind-Preflight |
| **DB** | PostgreSQL 16 + **pgvector** (embeddings/RAG) |
| **Async** | RabbitMQ + **dramatiq** worker (AI analysis runs off-request) |
| **Cache / limits** | Redis (dashboard reads, rate-limit counters) |
| **Object storage** | MinIO / S3 (documents) |
| **AV** | ClamAV (scans every upload) |
| **AI** | Anthropic Claude (analysis, RAG chat, admin insights) |
| **Observability** | OTel → Jaeger, Prometheus + Grafana, Loki |

## Hard constraints — do not violate

- **NO-EGRESS (KSA compliance):** the backend must make **no external network
  calls** except the Anthropic API. All IP geolocation / VPN-proxy detection is
  **offline** via MaxMind `.mmdb` files (`geoip/`). Never add a call to a remote
  geo/IP/threat service.
- **PDPL (Saudi privacy):** IPs are **not stored by default** (`SESSION_STORE_IP=false`);
  fingerprinting requires consent; identity records must be erasable (DSAR).
- **Brand:** primary green `#006c35`, font **IBM Plex Sans Arabic**, `borderRadius` 10.
  Brand lives in the AntD theme (`frontend/components/AppProviders.tsx`) — apply it
  there, not per-component.
- **i18n:** every user-facing string goes through `t("...")` in `frontend/lib/i18n.tsx`
  (both EN + AR). RTL/LTR is driven by the i18n context.

## Run locally (primary path = Docker Compose)

```bash
cp .env.example .env          # set ANTHROPIC_API_KEY (+ any secrets)
docker compose up --build     # full stack
# backend  → http://localhost:8000  (docs at /docs)
# frontend → http://localhost:3000
docker compose down           # stop   (add -v to wipe DB + storage volumes)
```

Demo accounts (seeded): `org@demo.org` / `Org123!` · `reviewer@demo.org` /
`Reviewer123!` · `admin@demo.org` / `Admin123!`.

### Run a single service natively (for fast iteration)

```bash
# backend
cd backend && uvicorn app.main:app --reload --port 8000
# frontend
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
# build check (do this before committing FE changes)
cd frontend && npm run build
```

## Layout

```
backend/app/
  api/         routers (projects, reviews, documents, admin, tracking, payments…)
  services/    sessions, risk, ai, storage, av, geoip
  core/        config.py, db.py (schema self-heal via ADD COLUMN IF NOT EXISTS)
  models.py    SQLAlchemy models
  seed.py      demo data
frontend/
  app/         App Router pages (login, projects, reviewer, admin, account…)
  components/   AppProviders.tsx (AntD shell/theme), AIPanel, project/, admin/
  lib/         api.ts, auth.tsx, i18n.tsx, types.ts
geoip/         offline MaxMind .mmdb (City + ASN + Anonymous-IP)
```

## Conventions

- **Frontend:** Ant Design components only; `RequireAuth` guards pages by role;
  `fmtMoney`/`statusLabel`/`dateStr` from `lib/`. Run `npm run build` before commit.
- **Backend:** `init_db()` self-heals schema with idempotent `ALTER TABLE … ADD
  COLUMN IF NOT EXISTS` (create_all only adds missing tables, not columns).
- **DB schema change:** add the column to the model AND to the additive-column
  list in `core/db.py`.

## Git

- **Develop on branch `claude/nonprofit-project-management-platform-gdgq6h`.** Do
  not push to `main` without explicit permission.
- Commit per logical change; run the frontend build before committing FE work.
