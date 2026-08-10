# Requirements & Analysis

The brief was intentionally vague ("no detailed requirements") — part of the
exercise is turning the idea into concrete requirements. This document is the
analysis I built the prototype from.

## 1. Problem

Nonprofit organizations need funding/approval for projects. A funder needs a
consistent way to **collect** applications, **review** them with enough rigour,
and **decide**. Doing this over email and spreadsheets is slow, inconsistent,
hard to audit, and doesn't scale across many organizations. The platform
centralizes intake, review, and decision-making, and uses AI to help reviewers
understand and triage applications faster — without handing the decision to a
machine.

## 2. Actors

| Actor | Description | Goals |
| --- | --- | --- |
| **Organization** (applicant) | Nonprofit submitting a project | Apply easily, attach evidence, know the status, respond to feedback |
| **Reviewer** (internal) | Evaluates applications | Understand each project quickly, spot gaps/risks, decide fairly, keep an audit trail |
| **Admin** | Runs the platform | Manage users/orgs, provision reviewers, oversee activity |
| **AI assistant** | Automated helper | Summarize, classify, flag risks/gaps, suggest questions, propose a *preliminary* assessment |

## 3. Core workflow (state machine)

```
draft ──submit──▶ submitted ──reviewer opens──▶ under_review
  ▲                                              │
  │                              ┌───────────────┼────────────────┐
  │                              ▼               ▼                ▼
  └──resubmit── changes_requested          approved (final)   rejected (final)
```

- Submission requires at least a **problem statement** and **goals**.
- `request_changes` / `reject` require a reviewer **comment**.
- `approved` / `rejected` are terminal (no further reviews); `decided_at` is stamped.
- Submitting triggers **AI pre-analysis** asynchronously so the applicant isn't blocked.

## 4. Functional requirements

**Organization**
- Register (self-service creates an organization account) and log in.
- Create/edit a project; save as **draft**; upload attachments (PDF/DOCX/TXT).
- Submit for review; track status; read reviewer feedback; edit and resubmit.

**Reviewer**
- See a queue of active projects; filter by status/category; search.
- Open a project: full application, attachments (presigned download), and **AI analysis**.
- Ask **grounded questions** about the documents (RAG).
- Request changes / approve / reject with comments.

**Admin**
- Dashboard: totals and projects-by-status.
- List users and organizations; provision reviewer accounts.
- View the audit log.

**AI**
- Summary, category, extracted fields, risk flags, missing information,
  suggested questions, preliminary score + recommendation — as **structured
  JSON**, persisted and rendered as typed UI (not a chat blob).
- RAG Q&A grounded in the project's documents via pgvector retrieval.
- **Human-in-the-loop:** AI never changes project status; only a reviewer can.

## 5. Non-functional requirements

- **Security:** authentication, role-based authorization on every endpoint,
  hashed passwords, private documents via short-lived presigned URLs, audit log.
- **Scalability:** stateless API (JWT) so it scales horizontally; heavy work
  (extraction, embeddings, LLM) isolated so it can move to background workers.
- **Reliability:** a failed/unconfigured AI call never breaks submission — it's
  recorded as `failed` and can be re-run.
- **Usability:** role-specific portals; clear status at every step.
- **Portability:** S3-compatible storage and OpenAI-compatible AI, so cloud
  providers/models can be swapped without code changes.
- **Auditability:** append-only log of sensitive actions.

## 6. Key assumptions

- One user belongs to one organization; a project belongs to one org.
- English-language content for the prototype (models used are multilingual-capable).
- A single funding pipeline (one queue) is sufficient for the MVP.
- Reviewers are trusted internal staff; any reviewer can act on any queued project.
- Document sizes are modest (≤ 20 MB/file) for the prototype.

## 7. Out of scope (deliberately, for the prototype)

- Email/SMS notifications (in-app notifications are implemented instead).
- Multi-stage review committees, scoring rubrics, weighted panels.
- Payments/disbursement, contracts, post-award reporting.
- SSO/OAuth providers, org self-management of members, granular per-field permissions.
- Fine-tuned or self-hosted models, human feedback loops on AI quality.

These are called out not because they're hard, but to show the MVP boundary is a
choice. The architecture leaves room for each (see `ARCHITECTURE.md`).

## 8. Why AI is advisory (human-in-the-loop)

Funding decisions carry real consequences and bias/hallucination risk. The AI is
positioned as a **force multiplier for the reviewer**: it reads fast, structures
information, and surfaces gaps and questions — but the score and recommendation
are explicitly labelled *preliminary/advisory*, and the system makes it
impossible for the AI to move a project to `approved`/`rejected`. That boundary
is enforced in code, not just UI copy.
