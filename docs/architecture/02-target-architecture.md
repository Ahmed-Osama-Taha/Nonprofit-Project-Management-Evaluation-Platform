# Athar (أثر) — Target Production Architecture (Phase 2B)

> **Companion to** [`01-current-architecture.md`](./01-current-architecture.md). That
> document describes what runs today (a modular monolith on Docker Compose).
> **This document describes where it goes in production**, and — critically — is
> written as a **scaling ladder**, not a single fixed target, because the scale
> requirement changed mid-design (from 10k users to millions).
>
> **Tagging** (same contract as the current-architecture doc):
>
> | Tag | Meaning |
> |-----|---------|
> | **[VERIFIED]** | True of the code in this repo today. |
> | **[TARGET]** | Part of the production design; **not implemented yet**. |
> | **[RECOMMENDATION]** | A judgement call, stated as such — validate before committing. |
> | **[COMPLIANCE — VALIDATE]** | A regulatory design intent. **Not a certification claim**; must be confirmed with a qualified compliance authority. |
>
> No AWS infrastructure described here exists yet. Nothing below claims the
> platform *is* compliant with any regulation — only that it is *designed to
> support* the named controls.

---

## 0. Why there is a "scaling ladder" and not one target

The original brief for this architecture fixed the scale at **10,000 registered
users / 1,000 concurrent**, with an explicit instruction to *not over-engineer
for hyperscale*. The Tier-2 design below was built faithfully to that number.

That number was a **requirement, not a ceiling**. The requirement has since been
raised to **millions → tens of millions of users**. Rather than throw away the
right-sized design, this document presents **three tiers**, each a deliberate
step with an explicit *trigger* for moving to the next:

| Tier | Scale | One-line shape |
|------|-------|----------------|
| **T1 — MVP (today)** | hundreds–low thousands | Modular monolith · Docker Compose · pgvector · in-process jobs — **[VERIFIED]** |
| **T2 — Production** | 10k–100k users | EKS microservices · Cognito · RDS Multi-AZ + RDS Proxy · pre-signed S3 uploads · SQS ingestion · WAF + API Gateway edge · KSA region + KMS — **[TARGET]** |
| **T3 — Hyperscale** | 1M–10M+ users | Aurora (Serverless v2 / Global) + sharding · dedicated vector store · Kinesis event backbone · ElastiCache · CDN · cell-based / multi-region — **[TARGET]** |

"Why only 10k?" is answered by making 10k **Tier 2** and showing Tier 3
explicitly.

---

## 1. Backend — EKS microservices (Tier 2)

The app is a **modular monolith** today — **[VERIFIED]**. Production decomposes it
along the seams the FastAPI routers already draw. Deliberately **three
deployables, not ten**:

| Service | Responsibility | Why it is a real boundary |
|---------|----------------|---------------------------|
| **web-api** | projects, reviews, documents (metadata), notifications, analytics — the request path | Stateless HTTP; scales on request rate |
| **ai-worker** | consume queue → extract · chunk · embed · retrieve · Claude · persist results | Slow, bursty, LLM-bound — **must** scale independently from web traffic |
| **auth** *(optional)* | only if Cognito is **not** adopted (see §4) | Disappears when Cognito owns authentication |

**[RECOMMENDATION]** The **ai-worker split is the one that genuinely earns its
keep**. Splitting `web-api` further is defensible for the microservices *story*
but is not required at Tier 2 — say so plainly; it reads as judgement, not
résumé-padding. EKS itself is heavier than 10k users strictly needs; it is
chosen here to (a) support the Tier-3 growth path and (b) demonstrate
Kubernetes/microservices competence — a deliberate, stated trade-off.

Autoscaling: **HPA / KEDA** on queue depth for `ai-worker`, **Karpenter** for
node scaling — **[TARGET]**.

---

## 2. Frontend — a container/pod, **not EC2**

The Next.js frontend is the **web tier**, not a domain microservice.

- **[RECOMMENDATION]** Containerise Next.js and run it as its **own Deployment/pod**
  on the same EKS cluster, behind the ingress + CloudFront. It keeps SSR and the
  same-origin `/api` proxy that already exists — **[VERIFIED]** (`next.config.mjs`).
- **Not EC2** — a raw VM is the most operational overhead and defeats the reason
  to run EKS.
- Static S3 + CloudFront would only work if SSR were dropped — not recommended.

---

## 3. The write path — protecting the database (the critical Tier-2 fix)

**The single most important correction over a naïve design.** Queuing only the
AI path leaves the **write path unprotected**: today document extraction runs
**synchronously on upload** — **[VERIFIED]** (`api/projects.py::upload_document`
calls `extract_text` inline) — so a burst of orgs uploading at once would hit the
API and RDS directly with no buffer.

Target protections — **[TARGET]**:

| Threat | Protection |
|--------|-----------|
| Connection storms from many pods/clients | **RDS Proxy** (managed pooling) in front of the database |
| Heavy upload bytes hitting the API + DB | **Pre-signed S3 uploads** — browser → S3 **directly**; the API writes only a small metadata row |
| Bursty extraction / embedding | **Ingestion queue** (SQS, or Kinesis at T3): `S3 event → queue → worker`, never synchronous |
| Read pressure (dashboards, lookups) | **Read replicas** + **ElastiCache (Redis)** for hot reads |
| Spikes overrunning workers | **KEDA autoscaling on queue depth** + graceful **429s** at the edge (backpressure) |

Corrected end-to-end shape:

```
edge throttle (WAF + API Gateway)
   → thin web-api
      → pre-signed S3 upload (bytes bypass the API)
      → ingestion queue (SQS)
         → worker pods
            → DB via RDS Proxy
   + read replicas + ElastiCache for reads
```

---

## 4. Authentication — Cognito for authN, app for authZ

Today: hand-rolled **JWT (HS256) + bcrypt + `require_roles` RBAC + org
row-scoping** — **[VERIFIED]** (`core/security.py`, `api/deps.py`).

**[RECOMMENDATION]** Split the concern:

- **Cognito owns authentication** — login, MFA, password reset, token
  issuance/refresh. Services validate Cognito JWTs via JWKS (RS256).
- **The app keeps authorization** — RBAC roles (`admin/reviewer/organization`)
  and org-scoping stay in the database (domain logic Cognito should not own).
  Map Cognito `sub` → the `User` row on first login.

**Why:** offloads the security-sensitive, undifferentiated auth machinery to a
managed IdP while keeping the domain model intact — a strong fit for a KSA
compliance posture (§7). **Trade-off:** a migration (swap token issue/validate,
backfill user mapping) and mild vendor coupling. Keeping custom JWT is valid for
the MVP but then MFA / reset / rotation are your responsibility — a target-state
gap.

---

## 5. API edge — throttling belongs here, not in the app

At Tier 1/small scale, an **ALB** alone is enough for a private SPA→backend.
**At Tier 2+ this is upgraded:** volumetric protection belongs at the **edge,
before compute** — **[TARGET]**:

- **AWS WAF** on CloudFront/ALB — rate-based rules, managed OWASP rule sets, bot
  control, geo/IP reputation.
- **AWS Shield** for DDoS.
- **API Gateway** (or an Envoy/Gateway-API ingress) — **per-tenant** throttling,
  quotas, usage plans, and optionally a **Cognito JWT authorizer** at the edge.

The application enforces only **business** limits (e.g. "N submissions per org
per day") — never raw volumetric defence.

> This reverses the earlier "API Gateway optional" note, which applied only to
> the 10k case. At the raised scale, edge throttling is **required**.

---

## 6. Why SQS (and where it is not enough)

Today AI analysis is an **in-process FastAPI `BackgroundTask`** — **[VERIFIED]**
(`api/projects.py::_run_analysis_background`): lost on restart, no retries, no
backpressure, competing with request threads.

**SQS is the seam** between `web-api` and `ai-worker` — **[TARGET]**:

- `web-api` **enqueues** an "analyze project X" message and returns immediately.
- `ai-worker` **consumes** and does the slow LLM work.
- Gains: **durability** (survives restarts/deploys), **retries** (visibility
  timeout), a **dead-letter queue** for poison messages, **independent
  autoscaling** (KEDA on queue depth), and **backpressure** so a burst can't
  overwhelm Claude or the DB.

**Where SQS is not enough (T3):** for very high-throughput ingestion and audit
streaming, move to **Kinesis / Amazon MSK (Kafka)** — an event backbone, not a
point-to-point queue.

---

## 7. Saudi Arabia — security & compliance (design intent)

For a KSA deployment this is a first-class constraint. Everything here is
**[COMPLIANCE — VALIDATE]**: *designed to support*, never a certification claim.
Confirm scope with a qualified compliance authority / legal.

- **Data residency** — keep personal data **in-Kingdom**. AWS has **Middle East
  (Bahrain)** and **(UAE)** today; an **AWS Region in Saudi Arabia** is announced
  (targeting ~2026 — **verify current availability**). Pin the region; no
  cross-border replication of personal data without controls.
- **Regulatory alignment** — **PDPL** (Saudi Personal Data Protection Law):
  lawful basis, data-subject rights, retention limits, breach notification.
  **NCA ECC** (Essential Cybersecurity Controls); **SAMA CSF** *if* any financial
  flows appear.
- **Crypto & isolation** — encryption at rest via **KMS** (or **CloudHSM** for
  stricter key custody), TLS 1.2+ in transit, **Secrets Manager** with rotation,
  private subnets with **no public database**, **VPC endpoints / PrivateLink** so
  service traffic never crosses the public internet.
- **Governance & detection** — **CloudTrail**, **AWS Config** (continuous
  compliance), **GuardDuty**, **Security Hub**, least-privilege IAM + SCPs.
- **Immutable audit** — the platform already logs every API call to Postgres +
  object storage — **[VERIFIED]** (`services/audit.py`). In KSA, store the audit
  journal in **S3 with Object Lock (WORM)** so it is tamper-evident — **[TARGET]**.
- **LLM egress caveat (important)** — sending proposal text to Anthropic crosses
  a data boundary. **[RECOMMENDATION]** For a compliance-sensitive build, prefer
  **Amazon Bedrock at an in-region endpoint** where Claude is available; otherwise
  a **Data Processing Agreement + PII redaction before egress**.

---

## 8. Tier-3 hyperscale — the path to millions

Triggers and changes when Tier 2 is outgrown — all **[TARGET]**:

| Concern | Tier-2 | Tier-3 (millions → tens of millions) |
|---------|--------|--------------------------------------|
| Relational DB | RDS PostgreSQL Multi-AZ + RDS Proxy | **Aurora PostgreSQL** (Serverless v2 / **Global**) + read replicas + **partition/shard by org** |
| Vector search | pgvector in Postgres | **Dedicated ANN store** — Amazon **OpenSearch k-NN** or a managed vector DB (pgvector is the wrong tool past ~10⁷ vectors) |
| Ingestion | SQS | **Kinesis / MSK (Kafka)** event backbone |
| Caching | ElastiCache for hot reads | ElastiCache as a tier (sessions, rate-limit counters, hot reads) |
| Delivery | CloudFront for static + docs | CDN everywhere, lifecycle to Glacier |
| Topology | Single region, Multi-AZ | **Cell-based / multi-region** (active-passive or active-active) via Route 53 latency/failover — also serves data-residency |
| Resilience | Backups, health checks | Defined **RPO/RTO**, DR runbooks, chaos testing |

---

## 9. Current → Target mapping (at a glance)

| Concern | Today — **[VERIFIED]** | Target — **[TARGET]** |
|---------|------------------------|------------------------|
| Compute | docker-compose, one host | EKS microservices (web-api, ai-worker) → Karpenter/KEDA |
| Frontend | Next.js container (compose) | Next.js pod on EKS behind CloudFront |
| Database | Postgres container + volume | RDS Multi-AZ + **RDS Proxy** → Aurora at T3 |
| Uploads | multipart → API → synchronous extract | **Pre-signed S3** + **ingestion queue** → workers |
| Vectors | pgvector | pgvector (T2) → OpenSearch/managed (T3) |
| Object storage | MinIO | Amazon S3 (+ Object Lock for audit) |
| Async AI | in-process BackgroundTask | **SQS → ai-worker** (retries, DLQ) |
| Auth | custom JWT + app RBAC | **Cognito authN** + app RBAC/org-scoping |
| Edge / throttling | none (app-level only) | **WAF + API Gateway** per-tenant throttling + Shield |
| Schema | `create_all` on boot | **Alembic** migrations in CI/CD |
| Secrets / TLS | dev defaults, proxy TLS | **Secrets Manager** + ACM + KMS |
| Observability | logs to stdout | **CloudWatch + X-Ray**, X-Request-ID correlation, alarms |
| Residency / compliance | n/a | **KSA region**, PDPL / NCA ECC alignment, WORM audit |

---

## 10. Honest caveats

- **EKS + microservices is heavier than 10k users requires.** It is a deliberate
  choice for the Tier-3 growth path and to demonstrate competence — stated, not
  hidden.
- **No compliance certification is claimed.** §7 items are design intents to be
  validated with a qualified authority.
- **AWS Saudi Arabia region timing must be verified** at build time.
- **LLM data egress** is the sharpest compliance question; resolve it (in-region
  Bedrock vs redaction + DPA) before processing real applicant data in KSA.

These are the decisions that turn "a 10k demo" into "a system with a credible,
staged path to tens of millions under KSA regulatory constraints."
