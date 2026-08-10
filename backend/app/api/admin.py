from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.db import get_db
from app.core.security import hash_password
from app.models import (
    AuditLog,
    Organization,
    Project,
    ProjectStatus,
    User,
    UserRole,
)
from app.schemas import (
    AuditLogOut,
    DashboardStats,
    OrganizationOut,
    RegisterRequest,
    UserOut,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])

AdminOnly = Depends(require_roles(UserRole.admin))


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), _: User = AdminOnly) -> DashboardStats:
    by_status = {
        status.value: db.scalar(
            select(func.count()).select_from(Project).where(Project.status == status)
        )
        or 0
        for status in ProjectStatus
    }
    return DashboardStats(
        total_projects=db.scalar(select(func.count()).select_from(Project)) or 0,
        by_status=by_status,
        total_organizations=db.scalar(select(func.count()).select_from(Organization)) or 0,
        total_users=db.scalar(select(func.count()).select_from(User)) or 0,
        pending_review=by_status.get(ProjectStatus.submitted.value, 0)
        + by_status.get(ProjectStatus.under_review.value, 0),
    )


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = AdminOnly) -> list[User]:
    return list(
        db.scalars(
            select(User).options(selectinload(User.organization)).order_by(User.created_at.desc())
        ).all()
    )


@router.get("/organizations", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db), _: User = AdminOnly) -> list[Organization]:
    return list(db.scalars(select(Organization).order_by(Organization.created_at.desc())).all())


@router.post("/reviewers", response_model=UserOut, status_code=201)
def create_reviewer(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    admin: User = AdminOnly,
) -> User:
    """Admin provisions an internal reviewer account (organization_name ignored)."""
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.reviewer,
    )
    db.add(user)
    record_audit(db, actor=admin, action="reviewer.create", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@router.get("/audit", response_model=list[AuditLogOut])
def list_audit(
    db: Session = Depends(get_db), _: User = AdminOnly, limit: int = 200
) -> list[AuditLog]:
    return list(
        db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    )
