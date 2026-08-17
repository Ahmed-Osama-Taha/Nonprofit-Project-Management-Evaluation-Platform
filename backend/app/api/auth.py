import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

import uuid

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.redis import is_revoked, revoke
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models import Organization, User, UserRole, UserSession
from app.schemas import LoginRequest, RegisterRequest, SessionOut, Token, UserOut
from app.services import sessions as session_service
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


def _issue_session(
    request: Request, response: Response, db: Session, user: User
) -> Token:
    """Create a new login session (device tracking) + tokens, and set cookies."""
    refresh_jti = uuid.uuid4().hex
    session = session_service.create_session(db, user, request, refresh_jti)
    access = create_access_token(subject=user.id, role=user.role.value, sid=session.id)
    refresh = create_refresh_token(
        subject=user.id, role=user.role.value, sid=session.id, jti=refresh_jti
    )
    _set_auth_cookies(response, access, refresh)
    db.commit()
    return Token(access_token=access, user=UserOut.model_validate(user))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
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
    return _issue_session(request, response, db, user)


@router.post("/login", response_model=Token)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Token:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return _issue_session(request, response, db, user)


@router.post("/token", response_model=Token)
def login_form(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    """OAuth2 password flow — powers the Swagger `Authorize` button."""
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue_session(request, response, db, user)


@router.post("/refresh", response_model=Token)
def refresh(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> Token:
    """Rotate tokens using the refresh cookie, staying in the same login session.

    The used refresh jti is burned; the session's `sid` is preserved so the
    device keeps one continuous session across rotations."""
    raw = request.cookies.get(settings.refresh_cookie_name)
    payload = decode_access_token(raw) if raw else None
    if not payload or payload.get("type") != "refresh" or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if is_revoked(payload.get("jti")):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Rotate: burn the used refresh token for the rest of its lifetime.
    revoke(payload.get("jti"), settings.refresh_token_expire_minutes * 60)

    sid = payload.get("sid")
    if sid is not None:
        # A sid was issued -> the session must still be active. If it was
        # remotely signed out, refuse (this makes sign-out effective even
        # without a Redis denylist).
        session = session_service.get_active_session(db, sid, user.id)
        if session is None:
            _clear_auth_cookies(response)
            raise HTTPException(status_code=401, detail="Session ended")
        new_jti = uuid.uuid4().hex
        access = create_access_token(user.id, user.role.value, sid=session.id)
        new_refresh = create_refresh_token(
            user.id, user.role.value, sid=session.id, jti=new_jti
        )
        session_service.touch_session(db, session, request, new_jti)
        _set_auth_cookies(response, access, new_refresh)
        db.commit()
        return Token(access_token=access, user=UserOut.model_validate(user))

    # Legacy token minted before session tracking: start a fresh session.
    return _issue_session(request, response, db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> Response:
    """Revoke the current access + refresh tokens, end the session, clear cookies."""
    sid: str | None = None
    for name, ttl in (
        (settings.access_cookie_name, settings.access_token_expire_minutes * 60),
        (settings.refresh_cookie_name, settings.refresh_token_expire_minutes * 60),
    ):
        payload = decode_access_token(request.cookies.get(name) or "")
        if payload:
            revoke(payload.get("jti"), ttl)
            sid = sid or payload.get("sid")
    if sid:
        session = db.get(UserSession, sid)
        if session:
            session_service.revoke_session(db, session)
            db.commit()
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


# ── Active sessions (device activity log) ────────────────────
@router.get("/sessions", response_model=list[SessionOut])
def list_my_sessions(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SessionOut]:
    """List the caller's active login sessions, newest activity first, with the
    current device flagged."""
    current_sid = _current_sid(request)
    out: list[SessionOut] = []
    for s in session_service.list_sessions(db, user):
        item = SessionOut.model_validate(s)
        item.current = s.id == current_sid
        out.append(item)
    return out


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_my_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Remotely sign a device out of one of the caller's sessions."""
    session = db.get(UserSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    session_service.revoke_session(db, session)
    record_audit(
        db, actor=user, action="session.revoke", entity_type="session",
        entity_id=session_id, detail={"device": session.device},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/revoke-others", status_code=status.HTTP_204_NO_CONTENT)
def revoke_other_sessions(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Sign out every device except the one making this request."""
    current_sid = _current_sid(request)
    for s in session_service.list_sessions(db, user):
        if s.id != current_sid:
            session_service.revoke_session(db, s)
    record_audit(
        db, actor=user, action="session.revoke_others", entity_type="session",
        entity_id=current_sid,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _current_sid(request: Request) -> str | None:
    """The sid of the session making this request (Bearer header or cookie)."""
    raw = request.cookies.get(settings.access_cookie_name)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        raw = auth[7:]
    payload = decode_access_token(raw or "")
    return payload.get("sid") if payload else None


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
