"""Login-session tracking: device/IP capture, best-effort geolocation, and
the create / rotate / revoke / list lifecycle for `UserSession` rows.

A *session* is one refresh-token family for one device. Its id is embedded in
every access/refresh token as the `sid` claim, so a user can list their active
sessions and remotely sign one out.
"""

from __future__ import annotations

import ipaddress
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis import revoke
from app.models import User, UserSession


# ── User-Agent → "<Client> (<OS>)" ──────────────────────────────
def _os_of(ua: str) -> str | None:
    u = ua.lower()
    if "windows" in u:
        return "Windows"
    if "iphone" in u or "ios" in u:
        return "iOS"
    if "ipad" in u:
        return "iPadOS"
    if "android" in u:
        return "Android"
    if "mac os" in u or "macintosh" in u:
        return "macOS"
    if "linux" in u:
        return "Linux"
    return None


def _client_of(ua: str) -> str:
    u = ua.lower()
    # Order matters: Edge/Chrome/Brave all contain "chrome"; check specifics first.
    if "claude" in u:
        return "Claude"
    if "edg/" in u or "edge" in u:
        return "Edge"
    if "opr/" in u or "opera" in u:
        return "Opera"
    if "firefox" in u:
        return "Firefox"
    if "chrome" in u or "chromium" in u:
        return "Chrome"
    if "safari" in u:
        return "Safari"
    if "postman" in u:
        return "Postman"
    if "curl" in u:
        return "curl"
    if "python" in u or "httpx" in u or "requests" in u:
        return "API client"
    return "Unknown device"


def parse_device(user_agent: str | None) -> str:
    """Turn a raw User-Agent into a friendly '<Client> (<OS>)' label."""
    ua = (user_agent or "").strip()
    if not ua:
        return "Unknown device"
    client = _client_of(ua)
    os_name = _os_of(ua)
    return f"{client} ({os_name})" if os_name else client


# ── Client IP (honours a reverse proxy / ngrok forward header) ───
def client_ip(request: Request) -> str | None:
    # X-Forwarded-For is a comma list; the first hop is the original client.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


# ── Best-effort geolocation ─────────────────────────────────────
def lookup_location(ip: str | None) -> str | None:
    """Resolve an IP to a coarse 'City, Region, CC' label — best effort only.

    Private/loopback addresses resolve to 'Local network'. Real geolocation is
    opt-in via a local MaxMind DB (``settings.geoip_db_path``): we never call an
    external service, so this stays offline- and CI-safe and leaks no PII.
    """
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_loopback or addr.is_private:
            return "Local network"
    except ValueError:
        return None

    db_path = getattr(settings, "geoip_db_path", "") or ""
    if not db_path:
        return None
    try:  # geoip2 + a local DB are both optional; missing either -> no location.
        import geoip2.database  # type: ignore

        with geoip2.database.Reader(db_path) as reader:
            r = reader.city(ip)
            parts = [
                r.city.name,
                r.subdivisions.most_specific.name if r.subdivisions else None,
                r.country.iso_code,
            ]
            return ", ".join(p for p in parts if p) or None
    except Exception:  # noqa: BLE001 — geo is a nicety, never fail the request
        return None


# ── Lifecycle ───────────────────────────────────────────────────
def create_session(
    db: Session, user: User, request: Request, refresh_jti: str | None
) -> UserSession:
    ua = request.headers.get("user-agent")
    ip = client_ip(request)
    session = UserSession(
        user_id=user.id,
        refresh_jti=refresh_jti,
        device=parse_device(ua),
        user_agent=(ua or "")[:512] or None,
        ip=ip,
        location=lookup_location(ip),
    )
    db.add(session)
    db.flush()  # assign session.id before it's baked into the tokens
    return session


def touch_session(
    db: Session, session: UserSession, request: Request, new_refresh_jti: str | None
) -> None:
    """Called on refresh: rotate the stored refresh jti and update last-seen."""
    session.refresh_jti = new_refresh_jti
    session.last_seen_at = datetime.now(timezone.utc)
    ip = client_ip(request)
    if ip:
        session.ip = ip
        session.location = lookup_location(ip)


def get_active_session(
    db: Session, sid: str | None, user_id: str
) -> UserSession | None:
    if not sid:
        return None
    session = db.get(UserSession, sid)
    if not session or session.user_id != user_id or session.revoked_at is not None:
        return None
    return session


def revoke_session(db: Session, session: UserSession) -> None:
    """Mark a session revoked and denylist its live refresh token."""
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
    if session.refresh_jti:
        revoke(session.refresh_jti, settings.refresh_token_expire_minutes * 60)


def list_sessions(db: Session, user: User) -> list[UserSession]:
    return list(
        db.scalars(
            select(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.last_seen_at.desc())
        ).all()
    )
