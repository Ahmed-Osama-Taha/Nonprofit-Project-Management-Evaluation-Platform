"""Unit tests for payment pricing + the mock provider (no DB / no gateway)."""

from types import SimpleNamespace

from app.core.config import settings
from app.models import PaymentKind, PaymentStatus
from app.services.payments import get_provider
from app.services.payments.mock import MockProvider
from app.services.payments.service import price_for


def test_provider_defaults_to_mock_without_keys():
    assert settings.tap_secret_key == ""
    assert get_provider().name == "mock"


def test_pricing_vat_math():
    base, vat, total = price_for(PaymentKind.per_review)
    assert base == settings.price_per_review_minor
    assert vat == round(base * settings.vat_rate)
    assert total == base + vat


def _fake_payment():
    return SimpleNamespace(id="pay_1", total_minor=17250, currency="SAR", kind=PaymentKind.per_review)


def test_mock_charge_then_signed_webhook_roundtrip():
    provider = MockProvider()
    res = provider.create_charge(_fake_payment(), "http://app/return")
    assert res.provider_charge_id.startswith("mock_")
    assert res.status == PaymentStatus.pending
    assert "charge_id=" in res.redirect_url

    # fetch_status reflects the in-memory charge (reconciliation path).
    assert provider.fetch_status(res.provider_charge_id) == PaymentStatus.pending

    # Completing emits a signed webhook the same provider can verify.
    body = provider.complete(res.provider_charge_id, "paid")
    import json

    v = provider.verify_webhook({}, json.dumps(body).encode())
    assert v.valid is True
    assert v.charge_id == res.provider_charge_id
    assert v.status == PaymentStatus.paid
    assert provider.fetch_status(res.provider_charge_id) == PaymentStatus.paid


def test_mock_webhook_rejects_tampered_signature():
    provider = MockProvider()
    res = provider.create_charge(_fake_payment(), "http://app/return")
    body = provider.complete(res.provider_charge_id, "paid")
    body["status"] = "refunded"  # tamper after signing
    import json

    v = provider.verify_webhook({}, json.dumps(body).encode())
    assert v.valid is False
