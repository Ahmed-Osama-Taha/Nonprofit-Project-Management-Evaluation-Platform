# 05 — Payments (Model A, Tap) — design & failure handling

**Model A:** an organization fills in its project + documents, then must pay to
have it reviewed — either a **per-review** charge or an active **monthly
subscription** (per-review is priced higher than the per-month-amortised sub).
Gateway: **Tap**. Currency **SAR**, **15% KSA VAT**.

The overriding requirement was correctness under partial failure — *"the customer
pays but the service/server/internet drops before the DB updates."* That case
must never (a) leave a paying customer un-entitled, nor (b) double-charge. The
design below guarantees both.

---

## Money & PCI

- All amounts are stored as integer **minor units** (halalas). No floats touch
  money → no rounding drift, clean accounting/VAT.
- **No card data is ever stored or received by our servers** — the customer
  enters card details on Tap's hosted page. We keep only Tap's opaque
  `charge_id` and status. This keeps us in **PCI DSS SAQ-A** scope.

## State machine (forward-only)

```
initiated ──▶ pending ──▶ paid ──▶ (refunded)
                   ├────▶ failed
                   └────▶ expired
```

`apply_status()` is the *only* mutator. It is **forward-only and idempotent**: it
never moves out of a terminal state (except paid→refunded) and treats a repeat of
the current state as a no-op. Every settlement path funnels through it, so
replays and races cannot corrupt state or grant twice.

## Three convergent settlement paths

A single confirmation is never trusted to be delivered. Three independent paths
converge on `apply_status`, each idempotent:

1. **Webhook — the source of truth.** Tap POSTs the charge result; we verify its
   `hashstring` HMAC (mock: an HMAC over the app secret), record it in the
   append-only `webhook_events` table, and dedupe on the unique `event_id`. The
   endpoint **always returns 200** so the gateway never retry-storms; validity is
   tracked internally.
2. **Reconciliation worker.** `reconcile_payments_task` (dramatiq) periodically
   polls Tap (`fetch_status`) for any charge stuck in `pending` past a grace
   window and settles it. This is the backstop when a webhook is lost or never
   arrives — a paid customer is settled even in total webhook failure.
3. **Client-return poll.** When the customer lands back on `/payments/return`,
   `GET /api/payments/{id}` reconciles on demand, so the UI resolves immediately
   even if both the webhook and the worker are momentarily behind.

**Why this covers the lawsuit scenario:** if the customer's card was charged, at
least one of {webhook, reconciliation poll} will observe `CAPTURED` at Tap and
drive the payment to `paid` — regardless of whether our server was up at the
exact callback moment. Conversely, entitlement is granted **only** from a
`paid` record, so a dropped/failed charge never unlocks a review.

## Entitlement gate

Submitting a project calls `has_entitlement(org, project)` = *active
subscription* **or** *a `paid` per-review payment for that project*. No
entitlement → **HTTP 402**; the UI opens checkout and redirects to the gateway.
After payment, the return page submits the project (idempotently).

## Idempotency & double-click safety

- `create_checkout` reuses an existing `initiated/pending` per-review charge for
  the same project instead of opening a second one.
- `payments.idempotency_key` is unique.
- Webhook dedupe on `event_id`; forward-only `apply_status`.

## Mock ⇄ real switch (no code change)

`get_provider()` returns the **MockProvider** when `TAP_SECRET_KEY` is blank and
the **TapProvider** the moment it is set. The mock simulates the redirect and a
*signed* webhook through the exact same finalisation code, so the whole flow —
including sandbox "pay / fail" — works with no keys, and turning on real Tap is
purely configuration. Secrets live in env / Secrets Manager, never in the repo.

## Compliance notes (KSA)

- **15% VAT** computed and stored per payment (`vat_minor`).
- Tap is **SAMA-licensed**; card capture is on Tap (SAQ-A).
- **ZATCA e-invoicing** (Fatoora) issuance is the next compliance step — the
  amount/VAT split is already persisted per payment to feed it.

## Config

`PAYMENTS_ENABLED` (off in tests so the existing flow is untouched; on in
compose), `PAYMENT_CURRENCY`, `VAT_RATE`, `PRICE_PER_REVIEW_MINOR`,
`PRICE_SUBSCRIPTION_MINOR`, `PAYMENT_RETURN_URL`, `TAP_SECRET_KEY`,
`TAP_WEBHOOK_SECRET`.
