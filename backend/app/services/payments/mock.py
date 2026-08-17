"""Mock payment provider — no gateway keys required.

Simulates the real journey faithfully so every failure path can be exercised
locally: a charge is opened (status pending) and the customer is redirected to
an in-app mock hosted page; completing it emits a signed webhook (same code path
as Tap) and `fetch_status` reflects the stored charge — so the webhook,
reconciliation, and client-return convergence paths all work.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid

from app.core.config import settings
from app.models import Payment, PaymentStatus
from app.services.payments.base import ChargeResult, WebhookVerification

# In-memory charge store: charge_id -> status. Fine for a single-process mock;
# authoritative state lives in the DB Payment row regardless.
_CHARGES: dict[str, PaymentStatus] = {}

_STATUS_MAP = {
    "paid": PaymentStatus.paid,
    "failed": PaymentStatus.failed,
    "expired": PaymentStatus.expired,
}


def _secret() -> bytes:
    # Reuse the app secret so the mock webhook is genuinely signed/verifiable.
    return settings.secret_key.encode()


def sign(event_id: str, charge_id: str, status: str) -> str:
    msg = f"{event_id}.{charge_id}.{status}".encode()
    return hmac.new(_secret(), msg, hashlib.sha256).hexdigest()


class MockProvider:
    name = "mock"

    def create_charge(self, payment: Payment, return_url: str) -> ChargeResult:
        charge_id = f"mock_{uuid.uuid4().hex}"
        _CHARGES[charge_id] = PaymentStatus.pending
        # The mock "hosted page" is served by the frontend return route, which
        # offers Pay / Fail buttons that call the mock-complete endpoint.
        redirect = (
            f"{return_url}?charge_id={charge_id}&payment_id={payment.id}&mock=1"
        )
        return ChargeResult(provider_charge_id=charge_id, redirect_url=redirect)

    def fetch_status(self, provider_charge_id: str) -> PaymentStatus | None:
        return _CHARGES.get(provider_charge_id)

    def complete(self, charge_id: str, outcome: str) -> dict:
        """Simulate the gateway finishing and return a signed webhook body."""
        status = _STATUS_MAP.get(outcome, PaymentStatus.failed)
        _CHARGES[charge_id] = status
        event_id = f"evt_{uuid.uuid4().hex}"
        body = {
            "id": event_id,
            "charge_id": charge_id,
            "status": status.value,
            "signature": sign(event_id, charge_id, status.value),
        }
        return body

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookVerification:
        try:
            data = json.loads(body)
        except (ValueError, TypeError):
            return WebhookVerification(valid=False)
        event_id = data.get("id")
        charge_id = data.get("charge_id")
        status_raw = data.get("status")
        expected = sign(event_id or "", charge_id or "", status_raw or "")
        if not hmac.compare_digest(expected, data.get("signature", "")):
            return WebhookVerification(valid=False, event_id=event_id, charge_id=charge_id)
        try:
            status = PaymentStatus(status_raw)
        except ValueError:
            return WebhookVerification(valid=False, event_id=event_id, charge_id=charge_id)
        return WebhookVerification(
            valid=True, event_id=event_id, charge_id=charge_id, status=status
        )
