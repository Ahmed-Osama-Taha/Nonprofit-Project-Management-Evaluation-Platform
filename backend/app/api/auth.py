from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Organization, User, UserRole
from app.schemas import LoginRequest, RegisterRequest, Token, UserOut
from app.services.audit import record_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_token(user: User) -> Token:
    token = create_access_token(subject=user.id, role=user.role.value)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> Token:
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
    return _issue_token(user)


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return _issue_token(user)


@router.post("/token", response_model=Token)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Token:
    """OAuth2 password flow — powers the Swagger `Authorize` button."""
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue_token(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
