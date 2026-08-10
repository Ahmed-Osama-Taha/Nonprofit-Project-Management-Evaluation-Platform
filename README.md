# Nonprofit Project Management & Evaluation Platform

A working prototype of a platform where **nonprofit organizations submit project
applications**, an **internal team reviews and evaluates them with AI
assistance**, and **admins manage** the platform — with a clear
**human-in-the-loop** boundary: the AI produces advisory analysis, but a human
makes every funding decision.

> Built as a home assignment. The emphasis is on turning a deliberately vague
> brief into clear requirements, a defensible architecture, and a prototype that
> actually runs — shaped like a production system, not a throwaway demo.

- **Requirements & analysis:** [`docs/ANALYSIS.md`](docs/ANALYSIS.md)
- **Architecture, ERD, API, scaling:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## What it does

Three roles, one workflow:

```
Organization → Create project (info, budget, goals/KPIs, beneficiaries, attachments)
             → Submit
                   → AI Pre-Analysis (summary, category, risks, missing info,
                     suggested questions, preliminary score — advisory only)
                   → Review Queue
                         → Reviewer: request changes / approve / reject
                                (+ RAG Q&A grounded in the attachments)
             → Organization updates & resubmits (loop)
                   → Final decision (human)
```

| Role | Can do |
| --- | --- |
| **Organization** | Register, create/edit projects, save drafts, upload documents, submit, track status, respond to reviewer notes |
| **Reviewer** | See the queue, filter/search, open a project, read AI analysis, ask the documents (RAG), request changes / approve / reject |
| **Admin** | Dashboard stats, manage users/orgs, provision reviewers, view the audit log |

**AI features** (OpenAI-compatible LLM): structured project summary, automatic
categorization, risk flags, missing-information detection, suggested reviewer
questions, a preliminary score, and grounded document Q&A via **pgvector**
retrieval. Every AI output is labelled advisory — the reviewer decides.

---

## Tech stack (and why)

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | **FastAPI** (Python) | Async, typed, first-class OpenAPI; fast to build, easy to scale out |
| Frontend | **Next.js + TypeScript** | Modern SSR/React, role-based portals, one deployable |
| Database | **PostgreSQL** | The domain is relational (org → project → review → decision) |
| Vector search | **pgvector** | RAG embeddings live *in Postgres* — no extra datastore for the MVP |
| Object storage | **MinIO** (S3-compatible) | Documents don't belong in the DB; S3 API ports straight to AWS S3/GCS |
| AI | **OpenAI-compatible API** | Works with OpenAI, Azure, OpenRouter, or local vLLM/Ollama |
| Auth | **JWT + RBAC** | Stateless, standard, three roles enforced server-side |
| Packaging | **Docker Compose** | One command brings up the whole stack |

Architecture is a **modular monolith** on purpose — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning and the path to
scale (async workers, managed Postgres + read replicas, queue, object storage,
observability, horizontal scaling).

---

## Run it (Docker — recommended)

```bash
cp .env.example .env
# To enable AI, set OPENAI_API_KEY in .env (any OpenAI-compatible key).
docker compose up --build
```

Then open:

| URL | What |
| --- | --- |
| http://localhost:3000 | Web app |
| http://localhost:8000/docs | API (Swagger UI) |
| http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin`) |

**Seeded demo accounts** (created on first boot):

| Role | Email | Password |
| --- | --- | --- |
| Organization | `org@demo.org` | `Org123!` |
| Reviewer | `reviewer@demo.org` | `Reviewer123!` |
| Admin | `admin@demo.org` | `Admin123!` |

> **AI without a key:** the app runs fully without `OPENAI_API_KEY`. Everything
> works except the AI calls, which are recorded as `failed` with a clear message
> (no fabricated analysis). Add a key and click **Run / Re-run** on any submitted
> project to see the real analysis.

### Try the flow
1. Log in as **Organization** → open the seeded *Digital Literacy* project (or create one) → upload a file → **Submit**.
2. Log in as **Reviewer** → open it → read the **AI Pre-Analysis** → **Request changes** / **Approve** / **Reject**; try **Ask the documents**.
3. Log in as **Admin** → **Dashboard**, **Users** (provision a reviewer), **Audit**.

---

## Run it (local dev, without Docker)

You need a PostgreSQL with the **pgvector** extension available, plus any
S3-compatible storage (MinIO, or point `S3_*` at AWS).

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://nppm:nppm@localhost:5432/nppm"
export S3_ENDPOINT_URL="http://localhost:9000" S3_ACCESS_KEY=minioadmin S3_SECRET_KEY=minioadmin
uvicorn app.main:app --reload            # http://localhost:8000

# Frontend (separate shell)
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

---

## Tests

Backend integration tests cover the workflow state machine, RBAC, and the AI
failure path. They require a Postgres+pgvector database (S3 is mocked with
`moto`, AI left unconfigured):

```bash
cd backend
pip install -r requirements.txt pytest "moto[s3]"
TEST_DATABASE_URL="postgresql+psycopg://nppm:nppm@localhost:5432/nppm" pytest -q
```

`.github/workflows/ci.yml` runs these against a pgvector service container and
builds the frontend on every push.

---

## Repository layout

```
backend/
  app/
    core/        config, db (SQLAlchemy + pgvector), security (JWT), 
    api/         auth, projects, reviews, notifications, admin, deps (RBAC)
    services/    ai, analysis (RAG pipeline), storage (S3), extraction, audit
    models.py    ORM models        schemas.py  Pydantic I/O
    seed.py      demo data          main.py     app + lifespan
  tests/         pytest integration tests
frontend/
  app/           login, register, projects, projects/[id], reviewer, admin
  components/     NavBar, AIPanel, ui helpers
  lib/           api client, auth context, types
docs/            ANALYSIS.md, ARCHITECTURE.md
docker-compose.yml   .env.example
```

## Security notes (prototype)
- JWT auth, bcrypt-hashed passwords, role checks enforced on every endpoint.
- Documents are private; browser downloads use short-lived S3 presigned URLs.
- Append-only audit log for sensitive actions.
- CORS is permissive and `SECRET_KEY` has a dev default — both must be locked
  down for production (see the architecture doc's hardening section).
