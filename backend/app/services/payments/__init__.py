"""Payment provider abstraction.

A single ``PaymentProvider`` interface with two implementations:
- ``MockProvider``  — no gateway keys; simulates the redirect + webhook flow so
  the whole payment journey works locally and in demos.
- ``TapProvider``   — the real Tap gateway; used automatically once
  ``TAP_SECRET_KEY`` is configured.

``get_provider()`` selects between them, so the app works with no keys and
switches to real payments the moment keys are added — no code change.
"""

from app.services.payments.base import (
    ChargeResult,
    PaymentProvider,
    WebhookVerification,
)
from app.services.payments.service import get_provider

__all__ = [
    "ChargeResult",
    "PaymentProvider",
    "WebhookVerification",
    "get_provider",
]
