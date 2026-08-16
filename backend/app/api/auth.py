import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.redis import revoke
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models import Organization, User, UserRole
from app.schemas import LoginRequest, RegisterRequest, Token, UserOut
from app.services.audit import record_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    """Set the httpOnly access/refresh cookies plus a readable CSRF cookie.

    The access/refresh cookies are httpOnly so JS/XSS cannot read the JWT. The
    CSRF cookie is deliberately readable — the SPA echoes it in an X-CSRF-Token
    header (double-submit) on state-changing requests.
    """
    base = dict(
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    if settings.cookie_domain:
        base["domain"] = settings.cookie_domain

    response.set_cookie(
        settings.access_cookie_name,
        access,
        httponly=True,
        max_age=settings.access_token_expire_minutes * 60,
        **base,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh,
        httponly=True,
        max_age=settings.refresh_token_expire_minutes * 60,
        **base,
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,  # readable by JS for the double-submit header
        max_age=settings.refresh_token_expire_minutes * 60,
        **base,
    )


def _clear_auth_cookies(response: Response) -> None:
    for name in (
        settings.access_cookie_name,
        settings.refresh_cookie_name,
        settings.csrf_cookie_name,
    ):
        response.delete_cookie(name, path="/", domain=settings.cookie_domain or None)


def _issue_session(response: Response, user: User) -> Token:
    """Create tokens, set cookies, and return the body (token kept for API clients)."""
    access = create_access_token(subject=user.id, role=user.role.value)
    refresh = create_refresh_token(subject=user.id, role=user.role.value)
    _set_auth_cookies(response, access, refresh)
    return Token(access_token=access, user=UserOut.model_validate(user))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest, response: Response, db: Session = Depends(get_db)
) -> Token:
    """Self-service registration always creates an Organization account.

    Reviewer/admin accounts are provisioned by an admin, not self-registered.
    """
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    org = Organization(
        name=payload.organization_name,
        country=payload.country,
        website=payload.website,
    )
    db.add(org)
    db.flush()

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.organization,
        organization_id=org.id,
    )
    db.add(user)
    record_audit(
        db,
        actor=user,
        action="user.register",
        entity_type="user",
        entity_id=user.id,
        detail={"organization": org.name},
    )
    db.commit()
    db.refresh(user)
    return _issue_session(response, user)


@router.post("/login", response_model=Token)
def login(
    payload: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> Token:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return _issue_session(response, user)


@router.post("/token", response_model=Token)
def login_form(
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    """OAuth2 password flow — powers the Swagger `Authorize` button."""
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue_session(response, user)


@router.post("/refresh", response_model=Token)
def refresh(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> Token:
    """Rotate tokens using the refresh cookie. Old refresh jti is revoked."""
    raw = request.cookies.get(settings.refresh_cookie_name)
    payload = decode_access_token(raw) if raw else None
    if not payload or payload.get("type") != "refresh" or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Rotate: revoke the used refresh token for the rest of its lifetime.
    revoke(payload.get("jti"), settings.refresh_token_expire_minutes * 60)
    return _issue_session(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> Response:
    """Revoke the current access + refresh tokens and clear cookies."""
    for name, ttl in (
        (settings.access_cookie_name, settings.access_token_expire_minutes * 60),
        (settings.refresh_cookie_name, settings.refresh_token_expire_minutes * 60),
    ):
        payload = decode_access_token(request.cookies.get(name) or "")
        if payload:
            revoke(payload.get("jti"), ttl)
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
