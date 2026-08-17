"""Tap gateway provider (https://tap.company).

Active only when ``TAP_SECRET_KEY`` is set. Uses the Charges API to open a
hosted payment page and validates webhook authenticity via Tap's ``hashstring``
HMAC. No card data ever touches this service (PCI SAQ-A) — only Tap's opaque
charge id and status.

Tap amounts are in MAJOR units (e.g. 150.00 SAR); we store minor units
internally and convert at the boundary.
"""

from __future__ import annotations

import hashlib
import hmac
import json

from app.core.config import settings
from app.models import Payment, PaymentStatus
from app.services.payments.base import ChargeResult, WebhookVerification

# Tap charge status -> our PaymentStatus.
_STATUS_MAP = {
    "CAPTURED": PaymentStatus.paid,
    "AUTHORIZED": PaymentStatus.paid,
    "INITIATED": PaymentStatus.pending,
    "IN_PROGRESS": PaymentStatus.pending,
    "PENDING": PaymentStatus.pending,
    "DECLINED": PaymentStatus.failed,
    "CANCELLED": PaymentStatus.failed,
    "FAILED": PaymentStatus.failed,
    "EXPIRED": PaymentStatus.expired,
    "TIMEDOUT": PaymentStatus.expired,
    "REFUNDED": PaymentStatus.refunded,
}


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.tap_secret_key}",
        "Content-Type": "application/json",
    }


class TapProvider:
    name = "tap"

    def create_charge(self, payment: Payment, return_url: str) -> ChargeResult:
        import httpx

        amount = round(payment.total_minor / 100, 2)
        payload = {
            "amount": amount,
            "currency": payment.currency,
            "threeDSecure": True,
            "reference": {"transaction": payment.id, "order": payment.id},
            "customer": {"first_name": "Athar", "email": "billing@athar.local"},
            "source": {"id": "src_all"},
            "redirect": {"url": f"{return_url}?payment_id={payment.id}"},
            "post": {"url": settings.payment_return_url},  # server webhook set in Tap dashboard
            "metadata": {"payment_id": payment.id, "kind": payment.kind.value},
        }
        with httpx.Client(timeout=30) as client:
            r = client.post(
                f"{settings.tap_api_base}/charges",
                headers=_headers(),
                content=json.dumps(payload),
            )
            r.raise_for_status()
            data = r.json()
        charge_id = data["id"]
        redirect = (data.get("transaction") or {}).get("url") or return_url
        status = _STATUS_MAP.get(data.get("status", ""), PaymentStatus.pending)
        return ChargeResult(
            provider_charge_id=charge_id, redirect_url=redirect, status=status
        )

    def fetch_status(self, provider_charge_id: str) -> PaymentStatus | None:
        import httpx

        try:
            with httpx.Client(timeout=30) as client:
                r = client.get(
                    f"{settings.tap_api_base}/charges/{provider_charge_id}",
                    headers=_headers(),
                )
                r.raise_for_status()
                data = r.json()
        except Exception:  # noqa: BLE001 — reconciliation is best-effort
            return None
        return _STATUS_MAP.get(data.get("status", ""))

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookVerification:
        try:
            data = json.loads(body)
        except (ValueError, TypeError):
            return WebhookVerification(valid=False)

        charge_id = data.get("id")
        status = _STATUS_MAP.get(data.get("status", ""))
        # Tap signs the webhook with a `hashstring` (HMAC-SHA256 over an ordered
        # subset of fields, keyed by the webhook secret). Header name is
        # case-insensitive.
        provided = {k.lower(): v for k, v in headers.items()}.get("hashstring", "")
        expected = self._hashstring(data)
        valid = bool(expected) and hmac.compare_digest(expected, provided)
        return WebhookVerification(
            valid=valid, event_id=charge_id, charge_id=charge_id, status=status
        )

    @staticmethod
    def _hashstring(data: dict) -> str:
        if not settings.tap_webhook_secret:
            return ""
        # Field order per Tap's webhook signature spec.
        txn = data.get("transaction") or {}
        ref = data.get("reference") or {}
        to_hash = (
            f"x_id{data.get('id', '')}"
            f"x_amount{txn.get('amount', '')}"
            f"x_currency{txn.get('currency', '')}"
            f"x_gateway_reference{ref.get('gateway', '')}"
            f"x_payment_reference{ref.get('payment', '')}"
            f"x_status{data.get('status', '')}"
            f"x_created{data.get('transaction', {}).get('created', '')}"
        )
        return hmac.new(
            settings.tap_webhook_secret.encode(), to_hash.encode(), hashlib.sha256
        ).hexdigest()
