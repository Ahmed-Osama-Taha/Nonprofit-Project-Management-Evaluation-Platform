# Architecture

## 1. System overview

```
                        ┌────────────────────────┐
                        │   Web Frontend          │
                        │   Next.js + TypeScript  │
                        │   (org / reviewer / admin portals)
                        └───────────┬────────────┘
                                    │  HTTPS / REST (JWT)
                                    ▼
                        ┌────────────────────────┐
                        │   Backend API — FastAPI │
                        │  ┌──────────────────┐   │
                        │  │ Auth   Projects  │   │
                        │  │ Reviews Documents│   │
                        │  │ AI     Notify    │   │
                        │  │ Admin  Audit     │   │
                        │  └──────────────────┘   │
                        └───┬───────────────┬─────┘
                            │               │
              ┌─────────────▼───┐     ┌─────▼───────────┐
              │  PostgreSQL      │     │ Object Storage  │
              │  + pgvector      │     │ MinIO / S3      │
              │                  │     │ (documents)     │
              │ users, orgs,     │     └─────────────────┘
              │ projects,        │
              │ reviews, audit,  │            │
              │ notifications,   │      ┌─────▼──────────┐
              │ document_chunks  │      │ AI Provider    │
              │ (embeddings)     │◀─────│ OpenAI-compat  │
              └──────────────────┘ RAG  │ chat + embed   │
                                        └────────────────┘
```

**Style: modular monolith.** One FastAPI application, internally split into
modules (`auth`, `projects`, `reviews`, `documents`, `ai`, `notifications`,
`admin`, `audit`) with clear boundaries. Rationale below.

## 2. Why a modular monolith (not microservices)

For a prototype in this domain, microservices would add distributed-systems
cost — network hops, partial failures, deployment/orchestration overhead,
distributed transactions — without a matching benefit. The domain is small and
cohesive, and a single transactional database keeps the org→project→review→
decision invariants simple and correct.

The important part is that the modules are **isolated behind clear seams**, so
the pieces that actually get hot — **document ingestion** and **AI analysis** —
can be extracted into independent background workers or services later *without
rewriting the domain*. That extraction path is section 8.

## 3. Components (backend)

| Module | Responsibility |
| --- | --- |
| `core/config` | Env-driven settings (12-factor) |
| `core/db` | SQLAlchemy engine/session, `CREATE EXTENSION vector`, table creation |
| `core/security` | Password hashing (bcrypt), JWT create/decode |
| `api/deps` | `get_current_user`, `require_roles(...)` RBAC dependency |
| `api/auth` | Register (org), login, OAuth2 token (Swagger), `/me` |
| `api/projects` | Project CRUD + workflow (submit/analyze), document upload/download, RAG chat |
| `api/reviews` | Reviewer decisions → drive the project state machine |
| `api/notifications` | In-app notifications |
| `api/admin` | Dashboard stats, users/orgs, provision reviewers, audit |
| `services/ai` | OpenAI-compatible client: embeddings, structured analysis, RAG answer |
| `services/analysis` | Orchestrates index → retrieve → analyze → persist |
| `services/extraction` | PDF/DOCX/TXT text extraction + chunking |
| `services/storage` | S3/MinIO upload, download, presigned URLs |
| `services/audit` | Append-only audit + notification helpers |

## 4. Data model (ERD)

```
Organization ──1:N── User
     │
     │1:N
     ▼
  Project ──1:N── Document ──1:N── DocumentChunk (embedding: vector(1536))
     │  │
     │  ├─1:1── AIAnalysis  (summary, category, risks[], missing[], questions[],
     │  │                     preliminary_score, recommendation, extracted_fields)
     │  └─1:N── Review ──N:1── User (reviewer)
     │
User ──1:N── Notification
AuditLog (append-only; actor, action, entity, detail, timestamp)
```

Design choices:
- **Structured AI output in JSONB** (`risks`, `missing_information`,
  `suggested_questions`, `extracted_fields`) — typed enough for the UI, flexible
  enough to evolve the schema without migrations.
- **Embeddings in `document_chunks.embedding`** (`pgvector`), queried with cosine
  distance — RAG without a separate vector database.
- **Enums** for `UserRole`, `ProjectStatus`, `ReviewDecision`, `AIAnalysisStatus`
  keep the state machine explicit.

> Prototype uses `Base.metadata.create_all()` for schema. Production would use
> **Alembic** migrations (the models are already Alembic-ready).

## 5. AI pipeline (RAG + structured analysis)

```
On submit (async):
  documents ─▶ extract text ─▶ chunk (≈1000 words, 150 overlap)
            ─▶ embed (text-embedding-3-small) ─▶ store in document_chunks (pgvector)

Analysis:
  build structured project payload
  + retrieve top-k chunks by cosine distance for a standard evaluation query
  ─▶ LLM (chat, temperature 0.2, response_format=json_object)
  ─▶ parse to typed fields ─▶ persist AIAnalysis (status=completed|failed)

Reviewer Q&A:
  question ─▶ embed ─▶ retrieve top-k chunks ─▶ LLM answers ONLY from context
```

- The LLM is asked for **JSON matching a fixed schema**, so the output is
  consumable data, not prose.
- **Resilience:** any provider error marks the analysis `failed` (with the
  error) and never breaks submission; a missing API key surfaces a clear `503`
  on the synchronous re-run endpoint.
- **Portability:** `OPENAI_BASE_URL` + `OPENAI_API_KEY` point at OpenAI, Azure
  OpenAI, OpenRouter, or a local vLLM/Ollama gateway.

## 6. AuthN / AuthZ

- **JWT** bearer tokens (HS256), stateless → horizontal scale with no shared session store.
- Passwords hashed with **bcrypt**.
- **RBAC** via a `require_roles(...)` dependency on every protected route; object-
  level checks (an org only sees/edits its own projects; editing is blocked once
  submitted). Reviewers/admins see the queue; only reviewers/admins can decide.

## 7. API surface (selected)

```
POST /api/auth/register        POST /api/auth/login        GET  /api/auth/me
GET  /api/projects             POST /api/projects          GET  /api/projects/{id}
PATCH/api/projects/{id}        POST /api/projects/{id}/submit
POST /api/projects/{id}/documents        GET .../documents/{doc}/download
POST /api/projects/{id}/analyze          POST /api/projects/{id}/chat
POST /api/projects/{id}/reviews
GET  /api/notifications        POST /api/notifications/{id}/read
GET  /api/admin/stats  /users  /organizations  /audit   POST /api/admin/reviewers
GET  /api/health
```

Full, interactive schema at `/docs` (OpenAPI).

## 8. From prototype to production

The modular seams make this incremental, not a rewrite:

**Async processing.** Move `services/analysis.run_analysis` behind a queue
(Celery/RQ/Arq + Redis, or SQS). API enqueues on submit; a pool of **workers**
does extraction, embeddings, and LLM calls. Scale workers independently of the API.

**Data tier.** Managed PostgreSQL (RDS/Cloud SQL) with **read replicas** for
queue/dashboard reads. Keep pgvector initially; if vector volume outgrows it,
swap `services/analysis` retrieval for a dedicated store (Qdrant/pgvector-on-its-
own-cluster/pinecone) behind the same interface. Add an **HNSW index** on
`document_chunks.embedding` as data grows.

**Storage.** MinIO → AWS S3 / GCS unchanged (same S3 API). Add lifecycle rules,
server-side encryption, and virus scanning on upload.

**API scale.** The API is stateless → run N replicas behind a load balancer
(Kubernetes / ECS / Cloud Run). Add rate limiting and request size limits at the
edge.

**Observability.** Structured logs, metrics (Prometheus), tracing (OpenTelemetry)
across API → worker → DB → LLM; dashboards + alerts. Track AI latency/cost/failure
rate as first-class metrics.

**Security hardening.** Lock CORS to known origins; secrets from a manager
(not env defaults); short-lived access tokens + refresh; per-file AV scanning;
tenant isolation review; audit log shipped to immutable storage.

**AI quality & governance.** Prompt/version pinning, evaluation harness on a
labelled set, PII handling policy, cost controls (caching, cheaper models for
triage), and a feedback loop capturing reviewer agree/disagree to measure and
improve the assistant — while keeping the human as the decision-maker.

**Delivery.** CI (tests + build, included) → CD to staging/prod; Alembic
migrations in the release step; blue/green or rolling deploys.

## 9. Trade-offs I made for the prototype (and would revisit)

| Prototype choice | Production choice | Why deferred |
| --- | --- | --- |
| `create_all()` schema | Alembic migrations | Faster iteration; models are migration-ready |
| AI on a background *task* | Queue + worker pool | Same code path; queue is an ops addition |
| pgvector | pgvector or dedicated vector DB | Fine until vector scale demands otherwise |
| In-app notifications | Email/push + in-app | Keeps the MVP self-contained and demoable |
| Permissive CORS / dev secret | Locked origins / secret manager | Convenience for local review only |
