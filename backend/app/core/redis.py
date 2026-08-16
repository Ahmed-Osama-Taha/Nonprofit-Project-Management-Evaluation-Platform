"""Redis client + JWT denylist.

Best-effort: when ``redis_url`` is blank (or Redis is unreachable) every helper
is a safe no-op, so the app and the test suite run without Redis. When Redis is
configured it provides token revocation (logout / refresh rotation) and, later,
caching and rate-limit counters.
"""

from __future__ import annotations

import json

from app.core.config import settings

_client = None
_FAILED = object()


def get_redis():
    """Return a shared Redis client, or None when unavailable/disabled."""
    global _client
    if not settings.redis_url:
        return None
    if _client is _FAILED:
        return None
    if _client is None:
        try:
            import redis

            _client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        except Exception:  # noqa: BLE001 — never let cache/denylist break a request
            _client = _FAILED
            return None
    return _client


def revoke(jti: str | None, ttl_seconds: int) -> None:
    """Add a token id to the denylist until it would have expired anyway."""
    r = get_redis()
    if not r or not jti:
        return
    try:
        r.setex(f"revoked:{jti}", max(1, ttl_seconds), "1")
    except Exception:  # noqa: BLE001
        pass


def is_revoked(jti: str | None) -> bool:
    if not jti:
        return False
    r = get_redis()
    if not r:
        return False
    try:
        return r.exists(f"revoked:{jti}") == 1
    except Exception:  # noqa: BLE001
        return False


# --------------------------------------------------------------------------- #
# Caching (best-effort; no-op without Redis)
# --------------------------------------------------------------------------- #
def cache_get_json(key: str):
    r = get_redis()
    if not r:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        return None


def cache_set_json(key: str, value, ttl_seconds: int) -> None:
    r = get_redis()
    if not r:
        return
    try:
        r.setex(key, max(1, ttl_seconds), json.dumps(value, default=str))
    except Exception:  # noqa: BLE001
        pass


def cache_delete(*keys: str) -> None:
    r = get_redis()
    if not r or not keys:
        return
    try:
        r.delete(*keys)
    except Exception:  # noqa: BLE001
        pass
