# أثر · Athar — Nonprofit Project Management & Evaluation Platform

**Athar** (أثر, "impact") is a working prototype of a platform where **nonprofit
organizations submit project applications**, an **internal team reviews and
evaluates them with AI (Claude) assistance**, and **admins oversee** the
platform — with a clear **human‑in‑the‑loop** boundary: the AI produces
*advisory* analysis, but a human makes every funding decision.

Built for a GCC / Saudi Arabia context: **bilingual (Arabic + English) RTL UI**,
**SAR** currency, and a Saudi‑green identity.

> Built as a home assignment. The emphasis is on turning a deliberately vague
> brief into clear requirements, a defensible architecture, and a prototype that
> actually runs — shaped like a production system, not a throwaway demo.

- **Requirements & analysis:** [`docs/ANALYSIS.md`](docs/ANALYSIS.md)
- **Architecture, ERD, API, scaling:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Table of contents

1. [What it does](#what-it-does)
2. [Highlights](#highlights)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [Tech stack](#tech-stack)
5. [Prerequisites](#prerequisites)
6. [Quick start (Docker — one command)](#quick-start-docker--one-command)
7. [Service map & URLs](#service-map--urls)
8. [Demo accounts](#demo-accounts)
9. [Enabling AI (Anthropic Claude)](#enabling-ai-anthropic-claude)
10. [Configuration reference](#configuration-reference)
11. [Using the platform (per role)](#using-the-platform-per-role)
12. [Viewing the database (Adminer)](#viewing-the-database-adminer)
13. [The audit trail (S3/MinIO)](#the-audit-trail-s3minio)
14. [Local development (without Docker)](#local-development-without-docker)
15. [Testing](#testing)
16. [Project structure](#project-structure)
17. [Troubleshooting](#troubleshooting)
18. [From prototype to production](#from-prototype-to-production)

---

## What it does

Three roles, one workflow:

```
Organization → Create project (info, budget, goals/KPIs, beneficiaries, attachments)
             → Submit
                   → AI pre-analysis (summary, category, six-criterion scorecard,
                     risks, missing info, suggested questions, readiness score —
                     advisory only)
                   → Review queue (analytics dashboard)
                         → Reviewer: request changes / approve / reject
                                (+ RAG Q&A grounded in the attachments)
             → Organization updates & resubmits (loop)
                   → Final decision (human)

Admin → users, organizations, reviewers, platform stats, full audit log
```

Every authenticated API request and every workflow decision is journaled to
PostgreSQL **and** shipped to object storage.

---

## Highlights

- **Bilingual, RTL‑first UI** — Arabic (default) and English, switchable live; the
  whole layout flips direction. Saudi‑green theme, light + dark, no UI libraries.
- **Claude as the LLM** — Anthropic Claude via the official SDK (OpenAI‑compatible
  provider also supported). Embeddings are **pluggable**: the default is a **local
  multilingual sentence‑transformer** (semantic, offline, Arabic‑capable), with a
  zero‑dependency hashing embedder and hosted OpenAI as alternatives — so the RAG
  pipeline runs with **only a Claude key** (Anthropic has no embeddings endpoint).
- **Reviewer analytics** — a dashboard (status/category breakdowns, budget totals
  in SAR, AI‑readiness score buckets, risk distribution, and a prioritised review
  queue) so reviewers decide from data, not just chat.
- **Structured AI output** — a six‑criterion scorecard, strengths, risks, missing
  info, suggested questions, and an advisory recommendation — never a decision.
- **Full‑API audit → object storage** — middleware logs every request (method,
  path, status, latency, actor, request id) to Postgres and to S3/MinIO as
  date‑partitioned JSON.
- **DB visualization** — Adminer ships in the compose stack.
- **Runs fully without AI** — the platform is complete without a key; AI is additive.

---

## Architecture at a glance

```
                    ┌───────────────────────────┐
                    │  Next.js frontend (RTL)    │  :3000
                    │  AR/EN · Saudi identity     │
                    └───────────────┬────────────┘
                                    │ HTTPS / REST + JWT
                    ┌───────────────▼────────────┐
                    │   FastAPI (modular monolith)│  :8000
                    │  auth · projects · reviews  │
                    │  documents · ai · analytics │
                    │  audit (middleware → S3)     │
                    └───┬───────────┬──────────┬──┘
                        │           │          │
              ┌─────────▼──┐  ┌─────▼─────┐  ┌─▼──────────────┐
              │ PostgreSQL │  │ S3/MinIO   │  │ Anthropic Claude│
              │ + pgvector │  │ docs +      │  │ (LLM analysis   │
              │ relational │  │ audit JSON  │  │  + RAG answers) │
              │ + embeddings│ └────────────┘  └────────────────┘
              └─────────────┘
                     ▲
              ┌──────┴──────┐
              │  Adminer     │  :8080  (DB viewer)
              └─────────────┘
```

A **modular monolith** by design: small domain, clear module boundaries, so the
high‑load parts (document ingestion, AI analysis) can later be extracted into
async workers without a rewrite. Full rationale in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Tech stack

| Layer          | Technology                                   | Why |
| -------------- | -------------------------------------------- | --- |
| Frontend       | Next.js 14 + TypeScript                      | SSR-capable, typed, first-class RTL |
| i18n / RTL     | Lightweight custom context (AR/EN)           | No heavy dep; full control of direction |
| Backend        | FastAPI + Python 3.11                        | Async, typed, auto OpenAPI |
| ORM            | SQLAlchemy 2.0                               | Modern typed models |
| Database       | PostgreSQL 16 + **pgvector**                 | Relational data + embeddings in one store |
| LLM            | **Anthropic Claude** (OpenAI-compatible opt) | Structured, advisory analysis |
| Embeddings     | Pluggable — local **semantic** (multilingual ST) / hashing / OpenAI | Real semantic RAG, offline, with only a Claude key |
| Object storage | S3 / MinIO                                    | Documents + durable audit journal |
| DB viewer      | Adminer                                       | Zero-config database inspection |
| Auth           | JWT + bcrypt, role-based access              | Stateless, standard |
| Containers     | Docker + Docker Compose                       | One-command local run |
| CI             | GitHub Actions                                | Tests + build on every push |

---

## Prerequisites

- **Docker** and **Docker Compose v2** (`docker compose ...`).
- ~2 GB free disk for images.
- *(Optional)* an **Anthropic API key** to enable AI features.

That's it — everything else runs in containers.

---

## Quick start (Docker — one command)

```bash
git clone https://github.com/Ahmed-Osama-Taha/Nonprofit-Project-Management-Evaluation-Platform.git
cd Nonprofit-Project-Management-Evaluation-Platform

cp .env.example .env          # (optional) add your ANTHROPIC_API_KEY inside
docker compose up --build
```

First boot pulls images, builds the two app images, starts PostgreSQL + MinIO +
Adminer, runs migrations (auto‑create), and **seeds demo data** (a Saudi
nonprofit with six Arabic project applications). Give it ~1–2 minutes.

When it's up, open **http://localhost:3000** and sign in with a demo account
below.

To stop: `Ctrl‑C`, then `docker compose down` (add `-v` to wipe data volumes).

---

## Service map & URLs

| Service           | URL                              | Notes |
| ----------------- | -------------------------------- | ----- |
| **Frontend**      | http://localhost:3000            | The app (sign in here) |
| **API docs**      | http://localhost:8000/docs       | Swagger UI |
| **API health**    | http://localhost:8000/api/health | JSON status (shows AI provider/model) |
| **Adminer (DB)**  | http://localhost:8080            | System `PostgreSQL` · Server `db` · User/Pass/DB `nppm` |
| **MinIO console** | http://localhost:9001            | User/Pass `minioadmin` — buckets: `nppm-documents`, audit under `audit/` |

---

## Demo accounts

Seeded on first boot (override via `.env`). On the login page you can click a
role to prefill it.

| Role         | Email                | Password       | Lands on |
| ------------ | -------------------- | -------------- | -------- |
| Organization | `org@demo.org`       | `Org123!`      | My projects |
| Reviewer     | `reviewer@demo.org`  | `Reviewer123!` | Review desk (analytics) |
| Admin        | `admin@demo.org`     | `Admin123!`    | Administration |

---

## Enabling AI (Anthropic Claude)

The platform runs fully **without** a key — AI features simply return a clear
"not configured" message. To turn them on:

1. Put your key in `.env`:
   ```dotenv
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-5     # or claude-sonnet-5, claude-haiku-4-5, ...
   EMBEDDING_PROVIDER=st             # semantic multilingual embeddings, no extra key
   ```
2. Restart: `docker compose up -d --build backend`.
3. Verify: `curl http://localhost:8000/api/health` → `"ai_enabled": true`.

Then, as a reviewer, open a submitted project and click **Run AI analysis**. You
get a structured scorecard, risks, missing info, suggested questions, and an
advisory recommendation — and the reviewer dashboard's AI‑score columns light up.

**Notes**
- **Embeddings (semantic RAG).** Anthropic has no embeddings endpoint, so the
  embedder is decoupled from the LLM. The default `EMBEDDING_PROVIDER=st` runs a
  local **multilingual sentence‑transformer** (`paraphrase-multilingual-MiniLM-L12-v2`,
  384‑d) — real **semantic** retrieval, offline, Arabic‑capable, no extra key.
  `local` falls back to a deterministic **hashing** embedder (lexical, needs no ML
  libs); `openai` uses a hosted model. **If you change the provider/model, the
  vector dimension changes** (`st`=384, `openai`=1536) — run
  `python -m app.reindex` in the backend to rebuild the chunk index (and add an
  HNSW ANN index). `AI_EMBEDDING_DIM` must match the active provider.
- **OpenAI‑compatible provider.** Set `AI_PROVIDER=openai` with `OPENAI_API_KEY` /
  `OPENAI_BASE_URL` / `AI_CHAT_MODEL` to route the LLM through OpenAI or any
  compatible gateway.

---

## Configuration reference

All settings are environment variables (see [`.env.example`](.env.example)).

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | `dev-...` | JWT signing secret — **change in production** |
| `ENVIRONMENT` | `development` | Free-form environment label |
| `DEFAULT_CURRENCY` | `SAR` | Currency used in seed data and analytics |
| `DATABASE_URL` | `postgresql+psycopg://nppm:nppm@db:5432/nppm` | Postgres DSN |
| `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` | MinIO | Object storage (internal / browser-facing) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | `minioadmin` / `nppm-documents` | Storage creds + bucket |
| `AUDIT_TO_S3` | `true` | Ship every audit entry to object storage |
| `AI_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | *(empty)* | Enables AI when set |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Claude model id |
| `EMBEDDING_PROVIDER` | `st` | `st` (local semantic, multilingual), `local` (hashing), or `openai` |
| `AI_ST_MODEL` | `…MiniLM-L12-v2` | Sentence-transformer model for `st` |
| `AI_EMBEDDING_DIM` | `384` | Embedding vector dimension — must match provider (`st`=384, `openai`=1536) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AI_CHAT_MODEL` | — | OpenAI-compatible provider |
| `SEED_ON_STARTUP` | `true` | Seed demo data on first boot |
| `SEED_*_EMAIL` / `SEED_*_PASSWORD` | demo creds | Demo account overrides |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base the browser calls |

---

## Using the platform (per role)

**Switch language** anytime with the عربي / EN toggle in the top bar (Arabic is
the default; the layout flips to RTL/LTR).

### Organization (`org@demo.org`)
1. **My projects** → **New project**. Fill title, category, budget (SAR), goals,
   KPIs, beneficiaries. **Save draft**.
2. Open the project → **Upload document** (PDF/DOCX) as an attachment.
3. **Submit for review** (requires a problem statement + goals). Editing locks
   until a reviewer responds.
4. If a reviewer **requests changes**, edit and resubmit — the loop continues.

### Reviewer (`reviewer@demo.org`)
1. **Review desk** — the analytics dashboard: KPIs, status donut, category bars,
   risk distribution, AI‑readiness buckets, and a prioritised queue.
2. Click a queued project → read the **AI analysis** (scorecard, risks, missing
   info, suggested questions), browse attachments, and use **Ask about this
   project** (RAG grounded in the application + documents).
3. Record the decision: **request changes**, **approve**, or **reject**. The AI is
   advisory — the reviewer decides.

### Admin (`admin@demo.org`)
- **Overview** — platform stats. **Users** — provision reviewers, list accounts.
- **Audit log** — every request and decision, with method/path/status/latency,
  actor role, and an "stored in S3" indicator.

---

## Viewing the database (Adminer)

Open **http://localhost:8080** and log in:

| Field    | Value        |
| -------- | ------------ |
| System   | `PostgreSQL` |
| Server   | `db`         |
| Username | `nppm`       |
| Password | `nppm`       |
| Database | `nppm`       |

Browse tables (`projects`, `reviews`, `ai_analyses`, `document_chunks` with
pgvector embeddings, `audit_logs`, …) or run SQL directly.

---

## The audit trail (S3/MinIO)

Two kinds of rows land in `audit_logs`: **domain events** (`project.submit`,
`review.approve`, …) and an **HTTP access log** (one row per authenticated
request). Every row is also written to object storage as a JSON object under
`audit/YYYY/MM/DD/…`.

To inspect the stored objects: open the **MinIO console** (http://localhost:9001,
`minioadmin`/`minioadmin`) → bucket `nppm-documents` → the `audit/` prefix.
Uploaded project documents live at the bucket root under per‑project keys.

---

## Local development (without Docker)

You need local **PostgreSQL 16 with the `pgvector` extension** and (optionally)
MinIO. Then:

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://nppm:nppm@localhost:5432/nppm"
export AUDIT_TO_S3=false          # skip S3 if you're not running MinIO
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

---

## Testing

Backend integration tests run against real Postgres + pgvector (S3 is mocked;
AI is left unconfigured so the pipeline exercises its graceful‑degradation path).

```bash
cd backend
source .venv/bin/activate
pip install pytest "moto[s3]"
export TEST_DATABASE_URL="postgresql+psycopg://nppm:nppm@localhost:5432/nppm"
pytest -q
```

Frontend production build (type‑checks the whole app):

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
```

CI (`.github/workflows/ci.yml`) runs both on every push.

---

## Project structure

```
.
├── docker-compose.yml         # db · minio · adminer · backend · frontend
├── .env.example               # all configuration, documented
├── backend/
│   └── app/
│       ├── main.py            # app + audit middleware + routers
│       ├── models.py          # SQLAlchemy models (incl. pgvector, audit)
│       ├── schemas.py         # Pydantic I/O + analytics shapes
│       ├── seed.py            # Saudi org + Arabic project applications
│       ├── core/              # config · db · security
│       ├── api/               # auth · projects · reviews · admin · analytics · notifications
│       ├── services/          # ai (Claude + embeddings) · analysis (RAG) · storage · audit · extraction
│       └── tests/             # workflow + RBAC + AI-degradation tests
├── frontend/
│   ├── app/                   # login · projects · projects/[id] · reviewer · admin
│   ├── components/            # NavBar · AIPanel · ui (charts) 
│   └── lib/                   # i18n (AR/EN) · api · auth · types
└── docs/                      # ANALYSIS.md · ARCHITECTURE.md
```

---

## Troubleshooting

- **`ai_enabled: false` after setting a key** — ensure `AI_PROVIDER=anthropic`
  and a non‑empty `ANTHROPIC_API_KEY`, then `docker compose up -d --build backend`.
  Check `curl http://localhost:8000/api/health`.
- **Frontend can't reach the API** — `NEXT_PUBLIC_API_URL` is baked at build time;
  rebuild the frontend after changing it.
- **Port already in use** — free `3000/8000/8080/9000/9001/5432` or edit the
  published ports in `docker-compose.yml`.
- **Reset everything** — `docker compose down -v` wipes the DB and storage volumes;
  the next `up` re‑seeds fresh demo data.
- **AI calls fail with a model error** — set `ANTHROPIC_MODEL` to a model your key
  can access.

---

## From prototype to production

The prototype is intentionally a modular monolith. To scale to many organizations:

- **Async processing** — move document ingestion + AI analysis to a queue
  (SQS/Celery/RQ) and workers, so uploads never block requests. The `analysis`
  service is already isolated behind a clean boundary.
- **Managed data** — managed PostgreSQL with read replicas; pgvector or a
  dedicated vector store behind the same repository layer as volume grows.
- **Object storage** — S3 with lifecycle policies + presigned URLs (already used).
- **Horizontal scale** — stateless API pods behind a load balancer.
- **Multi‑tenant isolation** — per‑organization row scoping (already modelled),
  per‑tenant rate limits, reviewer assignment/SLA queues.
- **Observability** — structured logs, metrics, tracing; the S3 audit journal
  streams straight into a SIEM/data lake.
- **Hardening** — rotate `SECRET_KEY`, tighten CORS to known origins, per‑tenant
  key management.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design, ERD, API
surface, and AI pipeline.
