from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.redis import is_revoked
from app.core.security import decode_access_token
from app.models import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # A Bearer header (API clients) takes precedence; browsers send the token as
    # an httpOnly cookie that JavaScript — and therefore XSS — cannot read.
    raw = token or request.cookies.get(settings.access_cookie_name)
    if not raw:
        raise credentials_error

    payload = decode_access_token(raw)
    if not payload or payload.get("type") != "access" or "sub" not in payload:
        raise credentials_error
    if is_revoked(payload.get("jti")):
        raise credentials_error

    # If the token belongs to a tracked login session, that session must still
    # be active — this makes remote sign-out effective immediately, even without
    # a Redis denylist. Legacy tokens (no sid) skip the check.
    sid = payload.get("sid")
    if sid is not None:
        from app.models import UserSession

        session = db.get(UserSession, sid)
        if not session or session.revoked_at is not None:
            raise credentials_error

    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise credentials_error
    return user


def optional_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising when there is no
    valid session. Used by public endpoints (e.g. visitor tracking) that want to
    link an authenticated user when one happens to be present."""
    try:
        return get_current_user(request, token, db)
    except HTTPException:
        return None


def require_roles(*roles: UserRole) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this action",
            )
        return user

    return dependency
