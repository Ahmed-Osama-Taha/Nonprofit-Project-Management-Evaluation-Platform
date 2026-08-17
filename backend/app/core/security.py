import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(
    subject: str,
    role: str,
    token_type: str,
    minutes: int,
    sid: str | None = None,
    jti: str | None = None,
    org: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "type": token_type,               # "access" | "refresh"
        "jti": jti or uuid.uuid4().hex,   # unique id, enables server-side revocation
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
    }
    if sid:
        payload["sid"] = sid              # login-session id (device tracking)
    if org:
        payload["org"] = org              # tenant id (per-tenant rate limiting)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: str, role: str, sid: str | None = None, org: str | None = None
) -> str:
    return _encode(
        subject, role, "access", settings.access_token_expire_minutes, sid=sid, org=org
    )


def create_refresh_token(
    subject: str, role: str, sid: str | None = None, jti: str | None = None
) -> str:
    return _encode(
        subject,
        role,
        "refresh",
        settings.refresh_token_expire_minutes,
        sid=sid,
        jti=jti,
    )


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None
