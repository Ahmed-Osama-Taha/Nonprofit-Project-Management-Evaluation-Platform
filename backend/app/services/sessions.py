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
# Cache the opened DB reader (and whether we've tried) so we don't reopen the
# file on every login. `_READER is False` means "tried and unavailable".
_READER: object | None = None


def _reader():
    """Lazily open the local .mmdb reader, or None if unavailable. Fully
    offline — no network access is ever performed."""
    global _READER
    if _READER is not None:
        return _READER or None
    db_path = getattr(settings, "geoip_db_path", "") or ""
    if not db_path:
        _READER = False
        return None
    try:
        import geoip2.database  # type: ignore

        _READER = geoip2.database.Reader(db_path)
    except Exception:  # noqa: BLE001 — missing lib/file -> geolocation disabled
        _READER = False
        return None
    return _READER


def lookup_location(ip: str | None) -> str | None:
    """Resolve an IP to a coarse 'City, Region, CC' label — fully offline.

    Private/loopback addresses resolve to 'Local network'. Public addresses are
    resolved against a locally mounted MaxMind-format .mmdb DB
    (``settings.geoip_db_path``). No external service is ever contacted, so this
    is safe for a no-egress, security-compliant deployment (and CI)."""
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_loopback or addr.is_private:
            return "Local network"
    except ValueError:
        return None

    reader = _reader()
    if reader is None:
        return None
    try:
        r = reader.city(ip)  # resolves IPv4 and IPv6
        parts = [
            r.city.name,
            r.subdivisions.most_specific.name if r.subdivisions else None,
            r.country.iso_code,
        ]
        return ", ".join(p for p in parts if p) or None
    except Exception:  # noqa: BLE001 — unknown IP / lookup error -> no location
        return None


# ── Lifecycle ───────────────────────────────────────────────────
def create_session(
    db: Session, user: User, request: Request, refresh_jti: str | None
) -> UserSession:
    ua = request.headers.get("user-agent")
    ip = client_ip(request)
    # Always derive a coarse location, but only PERSIST the raw IP when the
    # privacy switch allows it (off by default for shared demos).
    session = UserSession(
        user_id=user.id,
        refresh_jti=refresh_jti,
        device=parse_device(ua),
        user_agent=(ua or "")[:512] or None,
        ip=ip if settings.session_store_ip else None,
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
        session.ip = ip if settings.session_store_ip else None
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
