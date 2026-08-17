# 04 — Microsoft Entra ID Integration Plan (design only)

> **Status: PLAN — no auth code has been changed.** This document is the design
> we will implement *after* E3 (payments) and E5 (hardening). It is written to
> be dropped straight into a sprint when we get there.
>
> Anything marked _(assumption)_ is a default I chose that we should confirm
> before building.

---

## 1. Goal & guiding principle

Add **Microsoft Entra ID** as a sign-in option **without ripping out the current
auth**. The local email/password + httpOnly-cookie session stays as the app's
*session layer*; Entra becomes an *identity provider* (IdP) that feeds the exact
same session machinery.

**Why this matters:** after a successful Entra login we still call the existing
`_issue_session(request, response, db, user)`. That means:

- The httpOnly access/refresh cookies, CSRF double-submit, and Redis denylist
  are unchanged.
- The **login-session activity log** (`UserSession`, device/IP/location, remote
  sign-out) keeps working identically for Entra logins — a Microsoft sign-in
  shows up as just another device row.

Entra is therefore **purely additive**. No migration of existing accounts is
forced.

---

## 2. Which Entra product?

Microsoft splits the identity platform in two. The right choice depends on *who*
is signing in:

| Population | Product | Notes |
|---|---|---|
| **Staff** — reviewers & admins (your team) | **Entra ID** (workforce, "Azure AD") | Employees sign in with the org's Microsoft accounts / SSO. Natural fit for internal roles. |
| **Customers** — the nonprofit organizations | **Entra External ID** (CIAM; successor to Azure AD B2C) | Customer-facing sign-up/sign-in, self-service, custom branding. Separate tenant/app registration. |

**Decision captured:** _document now, build after E3 + E5._ The scope (staff /
customers / both) is still to be confirmed when we pick this up. The design
below is written for **staff-first workforce SSO** _(assumption)_ because it is
the smallest, safest first slice — the customer signup flow is untouched — and
the External ID variant is the same flow pointed at a different tenant.

---

## 3. The ngrok problem (and why it's not a blocker for dev)

Entra requires **stable, pre-registered redirect URIs**. A default ngrok tunnel
gets a **new URL every restart**, which breaks the registration each time.

Two facts resolve this:

1. **Local dev needs no ngrok.** Entra special-cases `http://localhost`, so
   `http://localhost:3000/auth/entra/callback` is an allowed redirect URI for
   development. The OIDC flow can be built and tested entirely on localhost.
2. **Sharing / MVP demo needs a stable URL.** For showing the app to others,
   use one of:
   - a **reserved ngrok domain** (paid; stable hostname), or
   - a small **cloud deploy** with HTTPS (Azure Container Apps / App Service is
     the natural pairing with Entra; or the AWS ECS target in doc 02).

   Register that stable URL as a second redirect URI. **Never** register a
   rotating tunnel URL.

---

## 4. OIDC flow (Authorization Code + PKCE)

```
Browser            Frontend (Next)         Backend (FastAPI)        Entra
  │  click "Sign in with Microsoft"        │                         │
  │ ─────────────────────────────────────▶ │  GET /auth/entra/login  │
  │                                         │  build authz URL + PKCE │
  │                                         │  set state/nonce cookie │
  │ ◀───────────── 302 to Entra authorize ─┤                         │
  │ ───────────────────────────────────────────────────────────────▶ │ user authenticates
  │ ◀─────────────────── 302 back to /auth/entra/callback?code=… ───── │
  │ ─────────────────────────────────────▶ │  GET /auth/entra/callback
  │                                         │  verify state, exchange │
  │                                         │  code→tokens (PKCE) ───▶ │
  │                                         │  validate id_token      │
  │                                         │  (iss, aud, exp, nonce, │
  │                                         │   signature via JWKS)   │
  │                                         │  find/link local User   │
  │                                         │  _issue_session(...)  ◀── reuse existing
  │ ◀──────────── 302 to app + auth cookies ┤                         │
```

Key security points:
- **Authorization Code + PKCE**, never implicit.
- Validate the `id_token`: issuer, audience (our client id), expiry, `nonce`,
  and signature against Entra's **JWKS** (cached).
- `state` (CSRF for the OAuth handshake) and `nonce` (replay) stored in a
  short-lived signed/httpOnly cookie, checked on callback.
- The Microsoft access/refresh tokens are **not** used as app sessions — we mint
  our own via `_issue_session`, so all existing protections apply.

---

## 5. Account model & linking

- Match on **verified email** _(assumption)_: the `email`/`preferred_username`
  claim from Entra is matched to `users.email`.
- Add a lightweight link table (or columns on `User`):
  - `auth_provider` — `"local" | "entra"` (default `"local"`).
  - `entra_oid` — the Entra object id (`oid` claim), the stable per-user key
    (email can change; `oid` doesn't).
- **First staff login:** if the email matches an existing reviewer/admin, link
  `entra_oid` to that account. If it doesn't match, **deny by default** _(assumption)_
  — staff are provisioned by an admin, not auto-created (mirrors today's rule
  that reviewers/admins are not self-registered).
- **Customer (External ID) variant:** first login *may* auto-provision an
  Organization account (like today's self-registration) — to confirm when/if we
  build the customer slice.

---

## 6. Role mapping

- Prefer **Entra App Roles / group claims** → app `UserRole` when staff are
  managed in Entra (e.g. an `Athar-Reviewers` group → `reviewer`).
- Until roles are curated in Entra, keep the role on the **local** `User` record
  (source of truth stays in our DB). Entra authenticates; our DB authorizes.

---

## 7. Config & secrets (no secrets in the repo or chat)

New settings (all blank by default → Entra disabled, existing auth unaffected):

```python
entra_enabled: bool = False
entra_tenant_id: str = ""          # directory (tenant) id
entra_client_id: str = ""          # app registration (client) id
entra_client_secret: str = ""      # from env / Secrets Manager only
entra_redirect_uri: str = ""       # e.g. http://localhost:3000/auth/entra/callback
entra_authority: str = ""          # https://login.microsoftonline.com/<tenant>
                                   # (External ID uses the CIAM authority host)
entra_allowed_group: str = ""      # optional: gate staff by group/app-role
```

- `entra_client_secret` lives in `.env` locally and **Secrets Manager** in
  prod — never committed, never pasted into chat.
- When `entra_enabled = False`, none of the new endpoints do anything and the
  app behaves exactly as it does today. This keeps CI green with zero config.

---

## 8. Library choice

- **Authlib** (generic OIDC client) is the lightest path for a
  standards-compliant Authorization Code + PKCE flow against Entra, and keeps us
  provider-agnostic. _(recommended default)_
- **MSAL for Python** is the Microsoft-first alternative (handles token
  acquisition/caching); heavier and Microsoft-specific. Choose it only if we
  later need on-behalf-of / downstream Microsoft Graph calls.

Either way it's a lazy/optional import gated behind `entra_enabled`, mirroring
how `redis`, `dramatiq`, and OTel are wired — so the dependency never affects
tests or a keyless run.

---

## 9. Endpoints & frontend

**Backend (new, all no-op unless `entra_enabled`):**
- `GET /api/auth/entra/login` → build authorize URL (PKCE + state + nonce), 302.
- `GET /api/auth/entra/callback` → validate, link/find user, `_issue_session`, 302 to app.

**Frontend:**
- A "Sign in with Microsoft" button on `/login` and `/register`, shown only when
  a `NEXT_PUBLIC_ENTRA_ENABLED` flag is set.
- No token handling in JS — the callback sets the same httpOnly cookies we use
  today; the SPA just lands logged-in and calls `/api/auth/me`.

---

## 10. Deployment note

For an MVP others can reach, Entra pairs most naturally with a **stable HTTPS
host**. Preferred order:
1. **Azure Container Apps / App Service** — same-cloud as Entra, simplest redirect-URI story.
2. The **AWS ECS target** (doc 02) — fine; register its HTTPS domain as the redirect URI.
3. **Reserved ngrok domain** — acceptable for demos only; register the fixed hostname.

Do **not** wire Entra to a rotating tunnel URL.

---

## 11. Test & rollout plan

- Feature-flagged (`entra_enabled`) so it ships dark and is enabled per-env.
- Local: register `http://localhost:3000/...`, test the full round-trip against a
  dev tenant.
- Add tests for id_token validation (issuer/aud/nonce/expiry) with a mocked JWKS;
  no live Entra call in CI.
- Roll out to **staff first**, monitor the session activity log for the new
  device rows, then decide on the customer (External ID) slice.

---

### Summary

Entra slots in as an **OIDC identity provider in front of the session layer we
already have**. Nothing about cookies, CSRF, the denylist, or the new session
activity log changes — a Microsoft sign-in is just another way to reach
`_issue_session`. Scoped to build **after E3 + E5**, staff-first, behind a flag.
