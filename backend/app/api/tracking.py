"""Visitor intelligence ingestion.

A public endpoint the client SDK posts device signals + behaviour to. It upserts
a Visitor (by first-party key), links the authenticated user when one is present
(identity resolution), appends an event, and flags a login from a device
fingerprint never seen for that user (security signal).

Design notes:
- Public (no auth required) but rate-limited by the global middleware.
- Never 500s the page: all work is best-effort and failures are swallowed.
- Collection is gated by ``tracking_enabled``. Analytics/marketing USE of this
  data must be gated on consent before production (PDPL) — see the plan.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import optional_current_user
from app.core.config import settings
from app.core.db import get_db
from app.models import User, Visitor, VisitorEvent
from app.schemas import CollectIn, CollectResult
from app.services import sessions as session_service

router = APIRouter(prefix="/api", tags=["tracking"])

_BOT_UA = ("bot", "crawler", "spider", "headless", "python", "curl", "wget", "scrapy", "phantom")


def _looks_like_bot(ua: str, p: CollectIn) -> bool:
    """Cheap bot heuristic: known bot UA tokens, or a client that produced no
    fingerprint and no real browser signals (typical of headless/automation)."""
    u = (ua or "").lower()
    if any(tok in u for tok in _BOT_UA):
        return True
    if not p.fingerprint_hash and not (p.signals or {}).get("timezone"):
        return True
    return False


@router.post("/collect", response_model=CollectResult)
def collect(
    payload: CollectIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_current_user),
) -> CollectResult:
    if not settings.tracking_enabled or not payload.visitor_key:
        return CollectResult(visitor_id="")

    try:
        return _collect(db, request, payload, user)
    except Exception:  # noqa: BLE001 — tracking must never break the page
        db.rollback()
        return CollectResult(visitor_id="")


def _collect(
    db: Session, request: Request, p: CollectIn, user: User | None
) -> CollectResult:
    ip = session_service.client_ip(request)
    location = session_service.lookup_location(ip)
    stored_ip = ip if settings.session_store_ip else None

    visitor = db.scalar(select(Visitor).where(Visitor.visitor_key == p.visitor_key))
    is_new = visitor is None
    if visitor is None:
        visitor = Visitor(
            visitor_key=p.visitor_key,
            first_referrer=p.referrer,
            first_landing=p.url,
            utm=p.utm,
        )
        db.add(visitor)

    # Security signal: a fingerprint we've never seen for this (now known) user.
    new_device = False
    if user and p.fingerprint_hash:
        seen = db.scalar(
            select(Visitor.id).where(
                Visitor.user_id == user.id,
                Visitor.fingerprint_hash == p.fingerprint_hash,
            )
        )
        new_device = seen is None and not is_new

    # Update the visitor snapshot.
    if p.fingerprint_hash:
        visitor.fingerprint_hash = p.fingerprint_hash
    if p.fingerprint_components:
        visitor.fingerprint_components = p.fingerprint_components
    ua = request.headers.get("user-agent") or (p.signals or {}).get("userAgent") or ""
    visitor.device = session_service.parse_device(ua)
    if p.signals:
        visitor.signals = p.signals
        visitor.user_agent = str(p.signals.get("userAgent") or visitor.user_agent or "")[:512] or None
        visitor.languages = str(p.signals.get("languages") or visitor.languages or "")[:255] or None
        visitor.timezone = str(p.signals.get("timezone") or visitor.timezone or "")[:64] or None
        visitor.screen = str(p.signals.get("screen") or visitor.screen or "")[:32] or None
        visitor.platform = str(p.signals.get("platform") or visitor.platform or "")[:64] or None
    visitor.is_bot = _looks_like_bot(ua, p)
    if p.consent:
        visitor.consent = p.consent
    if user:
        visitor.user_id = user.id
    visitor.ip = stored_ip
    visitor.location = location
    visitor.last_seen = datetime.now(timezone.utc)
    visitor.event_count = (visitor.event_count or 0) + 1
    db.flush()  # ensure visitor.id

    db.add(
        VisitorEvent(
            visitor_id=visitor.id,
            user_id=user.id if user else None,
            type=p.type or "pageview",
            url=p.url,
            referrer=p.referrer,
            payload=p.payload,
            ip=stored_ip,
            location=location,
            new_device=new_device,
        )
    )

    # Real-time security notice: alert admins when a known user signs in from a
    # device fingerprint never seen before (possible account takeover).
    if new_device and user:
        from app.models import User as UserModel
        from app.models import UserRole
        from app.services.audit import notify

        where = location or visitor.device or "an unrecognised device"
        for admin in db.scalars(
            select(UserModel).where(UserModel.role == UserRole.admin)
        ).all():
            notify(
                db,
                user_id=admin.id,
                message=f"⚠️ New-device sign-in: {user.email} from {where}",
            )

    db.commit()
    return CollectResult(visitor_id=visitor.id, new_device=new_device)
