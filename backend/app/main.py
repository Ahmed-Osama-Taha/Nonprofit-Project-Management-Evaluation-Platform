from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, analytics, auth, notifications, projects, reviews
from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.core.security import decode_access_token
from app.models import User
from app.seed import seed
from app.services import storage
from app.services.audit import record_api_access

logger = logging.getLogger("nppm")
logging.basicConfig(level=logging.INFO)

# Paths that would flood the audit journal with no security value.
_AUDIT_SKIP_PREFIXES = ("/api/health", "/docs", "/redoc", "/openapi.json", "/favicon")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        storage.ensure_bucket()
    except Exception as exc:  # noqa: BLE001 — storage optional at boot
        logger.warning("Bucket ensure skipped: %s", exc)
    try:
        seed()
    except Exception as exc:  # noqa: BLE001 — seeding must never block startup
        logger.warning("Seed skipped: %s", exc)
    yield


app = FastAPI(
    title=f"{settings.app_name} — {settings.app_tagline}",
    description=(
        "API for nonprofit organizations to submit projects, an internal team "
        "to review them with AI (Claude) assistance, and admins to oversee the "
        "platform. AI produces advisory analysis only — humans make the final "
        "decision. Every API request is audited to object storage."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    """Journal every authenticated API request to the DB + S3, and stamp a
    correlation id on the response. Auditing failures never break the request.

    Any unhandled downstream exception is converted here into a JSON 500 that
    still carries CORS headers — otherwise the browser masks the real error as
    an opaque "NetworkError" (this middleware sits outside CORSMiddleware, which
    does not add headers to responses produced from an exception)."""
    request_id = str(uuid.uuid4())
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001 — surface a real, CORS-headed error
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. See backend logs."},
        )
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["X-Request-ID"] = request_id

    path = request.url.path
    if request.method == "OPTIONS" or any(path.startswith(p) for p in _AUDIT_SKIP_PREFIXES):
        return response
    if not path.startswith("/api/"):
        return response

    try:
        latency_ms = int((time.perf_counter() - started) * 1000)
        actor = _resolve_actor(request)
        client_ip = request.client.host if request.client else None
        db = SessionLocal()
        try:
            record_api_access(
                db,
                actor=actor,
                method=request.method,
                path=path,
                status_code=response.status_code,
                latency_ms=latency_ms,
                ip=client_ip,
                request_id=request_id,
            )
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Audit middleware failed: %s", exc)
    return response


_CSRF_EXEMPT = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/token",
    "/api/auth/refresh",
    "/api/auth/logout",
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """CSRF (double-submit) for cookie-auth mutations + baseline security headers.

    CSRF is enforced only when the request is authenticated by the httpOnly
    cookie AND carries no Bearer header — Bearer (API) clients are not CSRF-able
    because a browser never attaches that header automatically. The strict CSP
    is set by the Next.js frontend, which serves the HTML/JS."""
    method = request.method
    path = request.url.path
    if (
        method in ("POST", "PUT", "PATCH", "DELETE")
        and path.startswith("/api/")
        and not any(path.startswith(p) for p in _CSRF_EXEMPT)
    ):
        has_bearer = request.headers.get("authorization", "").lower().startswith("bearer ")
        has_cookie = settings.access_cookie_name in request.cookies
        if has_cookie and not has_bearer:
            header_csrf = request.headers.get("x-csrf-token")
            cookie_csrf = request.cookies.get(settings.csrf_cookie_name)
            if not header_csrf or not cookie_csrf or header_csrf != cookie_csrf:
                return JSONResponse(
                    status_code=403, content={"detail": "CSRF token missing or invalid"}
                )

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return response


_RL_SKIP_PREFIXES = ("/api/health", "/docs", "/redoc", "/openapi.json", "/favicon", "/metrics")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Fixed-window rate limiting: per-IP (all clients) + per-tenant (per
    organization). Backed by Redis — a no-op when Redis is not configured, so
    dev/test are unaffected. Returns 429 with a Retry-After header when over
    limit."""
    if (
        not settings.rate_limit_enabled
        or request.method == "OPTIONS"
        or not request.url.path.startswith("/api/")
        or any(request.url.path.startswith(p) for p in _RL_SKIP_PREFIXES)
    ):
        return await call_next(request)

    from app.core.redis import rate_incr

    # Per-IP limit (honours a forwarding proxy / ngrok).
    ip = _client_ip(request)
    if ip:
        window = settings.rate_limit_ip_window
        bucket = int(time.time()) // window
        count = rate_incr(f"rl:ip:{ip}:{bucket}", window)
        if count is not None and count > settings.rate_limit_ip_max:
            return _too_many(window)

    # Per-tenant limit (organization id from the access token's `org` claim).
    org = _token_org(request)
    if org:
        window = settings.rate_limit_tenant_window
        bucket = int(time.time()) // window
        count = rate_incr(f"rl:org:{org}:{bucket}", window)
        if count is not None and count > settings.rate_limit_tenant_max:
            return _too_many(window)

    return await call_next(request)


def _too_many(retry_after: int) -> JSONResponse:
    resp = JSONResponse(
        status_code=429, content={"detail": "Rate limit exceeded. Slow down."}
    )
    resp.headers["Retry-After"] = str(retry_after)
    return resp


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


def _token_org(request: Request) -> str | None:
    raw = request.cookies.get(settings.access_cookie_name)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        raw = auth[7:]
    payload = decode_access_token(raw or "")
    return payload.get("org") if payload else None


def _resolve_actor(request: Request) -> User | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    payload = decode_access_token(auth_header.split(" ", 1)[1])
    if not payload or "sub" not in payload:
        return None
    db = SessionLocal()
    try:
        return db.get(User, payload["sub"])
    finally:
        db.close()


app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(reviews.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(analytics.router)

# OpenTelemetry / Prometheus / JSON logs — no-op unless OTEL_ENABLED=true.
from app.observability import setup_observability  # noqa: E402

setup_observability(app)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    """Liveness — the process is up and serving."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "ai_enabled": settings.ai_enabled,
        "ai_provider": settings.ai_provider,
        "ai_model": settings.ai_model_name if settings.ai_enabled else None,
        "embedding_provider": settings.embedding_provider,
        "audit_to_s3": settings.audit_to_s3,
    }


@app.get("/api/health/ready", tags=["health"])
def readiness() -> JSONResponse:
    """Readiness — dependencies reachable. Returns 503 if a critical dep is down."""
    from sqlalchemy import text

    from app.core.redis import get_redis

    checks: dict[str, bool] = {}

    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            checks["database"] = True
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        checks["database"] = False

    try:
        checks["object_storage"] = bool(storage._s3().list_buckets())
    except Exception:  # noqa: BLE001
        checks["object_storage"] = False

    if settings.redis_url:
        try:
            r = get_redis()
            checks["redis"] = bool(r and r.ping())
        except Exception:  # noqa: BLE001
            checks["redis"] = False

    # Database is the only hard dependency for readiness; storage/redis are
    # reported but degrade gracefully.
    ready = checks.get("database", False)
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready", "checks": checks},
    )
