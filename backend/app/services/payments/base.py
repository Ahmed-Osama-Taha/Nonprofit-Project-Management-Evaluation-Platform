"""Provider-agnostic payment types and interface."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.models import Payment, PaymentStatus


@dataclass
class ChargeResult:
    """Outcome of opening a charge at the gateway."""

    provider_charge_id: str
    redirect_url: str
    status: PaymentStatus = PaymentStatus.pending


@dataclass
class WebhookVerification:
    """Result of validating an inbound webhook."""

    valid: bool
    event_id: str | None = None
    charge_id: str | None = None
    status: PaymentStatus | None = None


class PaymentProvider(Protocol):
    """What every gateway adapter must implement."""

    name: str

    def create_charge(self, payment: Payment, return_url: str) -> ChargeResult:
        """Open a charge and return the hosted-page redirect URL."""
        ...

    def fetch_status(self, provider_charge_id: str) -> PaymentStatus | None:
        """Query the gateway for a charge's current status (reconciliation and
        client-return fallback). Returns None if it can't be determined."""
        ...

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookVerification:
        """Validate a webhook's signature and extract (event_id, charge_id,
        status). ``valid=False`` means reject the delivery."""
        ...
