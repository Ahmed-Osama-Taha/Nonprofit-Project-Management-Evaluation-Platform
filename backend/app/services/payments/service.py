"""Payment orchestration: provider selection, pricing, checkout, webhook
finalisation, reconciliation, and entitlement checks.

Design for correctness under partial failure ("customer paid but our
server/network dropped before the DB updated"): three independent paths
converge on the same `apply_status`, and each is idempotent:

  1. **Webhook** (source of truth) — signed, deduped by event_id.
  2. **Reconciliation** — a worker/`fetch_status` poll settles stuck 'pending'.
  3. **Client return** — the browser landing back triggers an on-demand poll.

No path can double-charge or double-grant: status only moves forward, and a
paid per-review / active subscription is the single entitlement source.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Organization,
    Payment,
    PaymentKind,
    PaymentStatus,
    Project,
    Subscription,
    SubscriptionStatus,
    User,
    WebhookEvent,
)
from app.services.payments.base import PaymentProvider

# Singletons so the mock provider's in-memory charge store is shared across
# requests within a process.
_mock = None
_tap = None


def get_provider() -> PaymentProvider:
    """Return the real Tap provider when a secret key is set, else the mock.

    This is what makes payments work with no keys and switch to real charges the
    moment keys are added — no code change."""
    global _mock, _tap
    if settings.tap_secret_key:
        if _tap is None:
            from app.services.payments.tap import TapProvider

            _tap = TapProvider()
        return _tap
    if _mock is None:
        from app.services.payments.mock import MockProvider

        _mock = MockProvider()
    return _mock


# ── Pricing (integer minor units + VAT) ─────────────────────────
def price_for(kind: PaymentKind) -> tuple[int, int, int]:
    base = (
        settings.price_per_review_minor
        if kind == PaymentKind.per_review
        else settings.price_subscription_minor
    )
    vat = round(base * settings.vat_rate)
    return base, vat, base + vat


# ── Checkout ────────────────────────────────────────────────────
def create_checkout(
    db: Session,
    org: Organization,
    user: User,
    kind: PaymentKind,
    project: Project | None,
) -> Payment:
    # Reuse an in-flight charge for the same target instead of creating a
    # duplicate (idempotent from the user's perspective on double-clicks).
    if kind == PaymentKind.per_review and project is not None:
        existing = db.scalar(
            select(Payment).where(
                Payment.project_id == project.id,
                Payment.kind == PaymentKind.per_review,
                Payment.status.in_([PaymentStatus.initiated, PaymentStatus.pending]),
            )
        )
        if existing and existing.redirect_url:
            return existing

    amount, vat, total = price_for(kind)
    payment = Payment(
        organization_id=org.id,
        user_id=user.id,
        project_id=project.id if project else None,
        kind=kind,
        status=PaymentStatus.initiated,
        amount_minor=amount,
        vat_minor=vat,
        total_minor=total,
        currency=settings.payment_currency,
        provider=get_provider().name,
    )
    db.add(payment)
    db.flush()  # assign payment.id before opening the charge

    provider = get_provider()
    result = provider.create_charge(payment, settings.payment_return_url)
    payment.provider_charge_id = result.provider_charge_id
    payment.redirect_url = result.redirect_url
    payment.status = result.status
    db.commit()
    db.refresh(payment)
    return payment


# ── Status transitions (idempotent, forward-only) ───────────────
_TERMINAL = {PaymentStatus.paid, PaymentStatus.refunded, PaymentStatus.expired}


def apply_status(db: Session, payment: Payment, new: PaymentStatus) -> bool:
    """Move a payment forward. Returns True if a transition happened.

    Forward-only: never overwrite a terminal state, and treat a repeat of the
    current state as a no-op (so redelivered webhooks / reconciliation polls are
    safe)."""
    if payment.status == new:
        return False
    if payment.status in _TERMINAL and new != PaymentStatus.refunded:
        return False

    payment.status = new
    if new == PaymentStatus.paid and payment.paid_at is None:
        payment.paid_at = datetime.now(timezone.utc)
        if payment.kind == PaymentKind.subscription:
            _grant_subscription(db, payment)
    return True


def _grant_subscription(db: Session, payment: Payment) -> None:
    end = datetime.now(timezone.utc) + timedelta(days=settings.subscription_period_days)
    sub = db.scalar(
        select(Subscription).where(Subscription.organization_id == payment.organization_id)
    )
    if sub is None:
        sub = Subscription(organization_id=payment.organization_id)
        db.add(sub)
    sub.status = SubscriptionStatus.active
    sub.current_period_end = end
    sub.provider = payment.provider
    sub.provider_ref = payment.provider_charge_id


# ── Webhook handling (source of truth, deduped) ─────────────────
def handle_webhook(db: Session, headers: dict[str, str], body: bytes) -> bool:
    provider = get_provider()
    v = provider.verify_webhook(headers, body)

    # Record every delivery (even invalid) for audit; dedupe by event_id. Reuse
    # an existing row so a redelivery never violates the unique event_id (and a
    # replay of an already-processed event is a no-op).
    event = None
    if v.event_id:
        event = db.scalar(
            select(WebhookEvent).where(WebhookEvent.event_id == v.event_id)
        )
        if event and event.processed:
            return True  # already applied — idempotent replay
    if event is None:
        event = WebhookEvent(
            provider=provider.name,
            event_id=v.event_id or f"unsigned-{datetime.now(timezone.utc).timestamp()}",
            charge_id=v.charge_id,
            signature_valid=v.valid,
            payload=_safe_json(body),
        )
        db.add(event)
    else:
        event.signature_valid = v.valid

    if not v.valid or not v.charge_id or v.status is None:
        db.commit()
        return False

    payment = db.scalar(
        select(Payment).where(Payment.provider_charge_id == v.charge_id)
    )
    if payment:
        apply_status(db, payment, v.status)
        event.processed = True
    db.commit()
    return bool(payment)


# ── Reconciliation (settle stuck 'pending') ─────────────────────
def reconcile_payment(db: Session, payment: Payment) -> bool:
    if payment.status != PaymentStatus.pending or not payment.provider_charge_id:
        return False
    status = get_provider().fetch_status(payment.provider_charge_id)
    if status and status != payment.status:
        changed = apply_status(db, payment, status)
        if changed:
            db.commit()
        return changed
    return False


def reconcile_stale(db: Session, older_than_seconds: int = 120) -> int:
    """Settle any pending payments that have been stuck past a grace window.
    Returns the number of payments whose status changed."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
    pending = db.scalars(
        select(Payment).where(
            Payment.status == PaymentStatus.pending,
            Payment.updated_at < cutoff,
        )
    ).all()
    return sum(1 for p in pending if reconcile_payment(db, p))


# ── Entitlement ─────────────────────────────────────────────────
def active_subscription(db: Session, organization_id: str) -> Subscription | None:
    sub = db.scalar(
        select(Subscription).where(Subscription.organization_id == organization_id)
    )
    if not sub or sub.status != SubscriptionStatus.active:
        return None
    if sub.current_period_end and sub.current_period_end < datetime.now(timezone.utc):
        return None
    return sub


def has_entitlement(db: Session, organization_id: str, project: Project) -> bool:
    """True if the org may have this project reviewed: an active subscription, or
    a paid per-review payment for this specific project."""
    if not settings.payments_enabled:
        return True
    if active_subscription(db, organization_id):
        return True
    paid = db.scalar(
        select(Payment).where(
            Payment.project_id == project.id,
            Payment.kind == PaymentKind.per_review,
            Payment.status == PaymentStatus.paid,
        )
    )
    return paid is not None


def _safe_json(body: bytes):
    import json

    try:
        return json.loads(body)
    except (ValueError, TypeError):
        return {"raw": body.decode("utf-8", "replace")[:2000]}
