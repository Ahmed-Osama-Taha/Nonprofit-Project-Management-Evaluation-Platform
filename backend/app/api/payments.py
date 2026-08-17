"""Payments API — Model A (pay to have a project reviewed).

Works fully in MOCK mode with no gateway keys and switches to real Tap when
`TAP_SECRET_KEY` is set. Card data never touches this service (PCI SAQ-A).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.db import get_db
from app.models import (
    Payment,
    PaymentKind,
    PaymentStatus,
    Project,
    User,
    UserRole,
)
from app.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    MockCompleteRequest,
    PaymentOut,
    PricingOut,
)
from app.services.audit import record_audit
from app.services.payments import service as pay

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/pricing", response_model=PricingOut)
def pricing() -> PricingOut:
    pr, pr_vat, pr_total = pay.price_for(PaymentKind.per_review)
    sub, sub_vat, sub_total = pay.price_for(PaymentKind.subscription)
    return PricingOut(
        currency=settings.payment_currency,
        vat_rate=settings.vat_rate,
        per_review_minor=pr,
        per_review_total_minor=pr_total,
        subscription_minor=sub,
        subscription_total_minor=sub_total,
        subscription_period_days=settings.subscription_period_days,
    )


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.organization)),
) -> CheckoutResponse:
    try:
        kind = PaymentKind(payload.kind)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid payment kind")

    project = None
    if kind == PaymentKind.per_review:
        if not payload.project_id:
            raise HTTPException(status_code=422, detail="project_id is required")
        project = db.get(Project, payload.project_id)
        if not project or project.organization_id != user.organization_id:
            raise HTTPException(status_code=404, detail="Project not found")
        if pay.has_entitlement(db, user.organization_id, project):
            raise HTTPException(status_code=409, detail="This review is already paid for")

    payment = pay.create_checkout(db, user.organization, user, kind, project)
    record_audit(
        db, actor=user, action="payment.checkout", entity_type="payment",
        entity_id=payment.id,
        detail={"kind": kind.value, "project_id": payload.project_id,
                "total_minor": payment.total_minor},
    )
    db.commit()
    return CheckoutResponse(
        payment_id=payment.id, status=payment.status.value, redirect_url=payment.redirect_url
    )


@router.get("", response_model=list[PaymentOut])
def list_payments(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.organization)),
) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.organization_id == user.organization_id)
            .order_by(Payment.created_at.desc())
        ).all()
    )


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(
    payment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Payment:
    payment = db.get(Payment, payment_id)
    if not payment or payment.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Payment not found")
    # Client-return convergence path: if still pending, poll the gateway now so
    # the customer isn't stuck even if the webhook is late/lost.
    if payment.status == PaymentStatus.pending:
        pay.reconcile_payment(db, payment)
        db.refresh(payment)
    return payment


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Gateway webhook — the source of truth for payment status. Always returns
    200 so the gateway does not retry-storm; validity is recorded internally."""
    body = await request.body()
    headers = dict(request.headers)
    try:
        pay.handle_webhook(db, headers, body)
    except Exception:  # noqa: BLE001 — never 500 the gateway; reconciliation backstops
        pass
    return {"received": True}


@router.post("/mock/{charge_id}/complete", response_model=PaymentOut)
def mock_complete(
    charge_id: str,
    payload: MockCompleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.organization)),
) -> Payment:
    """DEV/MOCK ONLY: simulate the gateway finishing a charge. Routes through the
    same signed-webhook finalisation path as a real payment."""
    provider = pay.get_provider()
    if provider.name != "mock":
        raise HTTPException(status_code=404, detail="Not available")

    payment = db.scalar(select(Payment).where(Payment.provider_charge_id == charge_id))
    if not payment or payment.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Payment not found")

    import json

    body = json.dumps(provider.complete(charge_id, payload.outcome)).encode()
    pay.handle_webhook(db, {}, body)
    db.refresh(payment)
    return payment
