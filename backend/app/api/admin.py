from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
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
    UserSession,
    Visitor,
    VisitorEvent,
)
from app.schemas import (
    AdminSessionOut,
    AuditLogOut,
    DashboardStats,
    OrganizationOut,
    RegisterRequest,
    UserOut,
    VisitorDetailOut,
    VisitorEventOut,
    VisitorOut,
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


# ── Login activity (all users' sessions) ─────────────────────
@router.get("/sessions", response_model=list[AdminSessionOut])
def list_login_activity(
    db: Session = Depends(get_db),
    _: User = AdminOnly,
    limit: int = Query(default=200, le=1000),
    active_only: bool = Query(default=False),
) -> list[AdminSessionOut]:
    """Every login across all users — the admin login-activity log."""
    stmt = (
        select(UserSession)
        .options(selectinload(UserSession.user))
        .order_by(UserSession.last_seen_at.desc())
        .limit(limit)
    )
    if active_only:
        stmt = stmt.where(UserSession.revoked_at.is_(None))
    out: list[AdminSessionOut] = []
    for s in db.scalars(stmt).all():
        out.append(
            AdminSessionOut(
                id=s.id,
                user_email=s.user.email if s.user else None,
                user_name=s.user.full_name if s.user else None,
                device=s.device,
                ip=s.ip,
                location=s.location,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                revoked=s.revoked_at is not None,
            )
        )
    return out


@router.delete("/sessions/{session_id}", status_code=204)
def delete_login_record(
    session_id: str, db: Session = Depends(get_db), admin: User = AdminOnly
) -> Response:
    """Permanently delete one login record (e.g. to purge a bystander's IP on a
    shared demo)."""
    session = db.get(UserSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    record_audit(db, actor=admin, action="admin.session.delete",
                 entity_type="session", entity_id=session_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/audit", response_model=list[AuditLogOut])
def list_audit(
    db: Session = Depends(get_db),
    _: User = AdminOnly,
    limit: int = 200,
    events_only: bool = Query(
        default=False, description="Only human domain events, not raw API access rows"
    ),
) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if events_only:
        # Domain events have no HTTP method; API access rows do.
        stmt = stmt.where(AuditLog.method.is_(None))
    return list(db.scalars(stmt.limit(limit)).all())


# ── Visitor intelligence ─────────────────────────────────────
def _visitor_out(v: Visitor) -> VisitorOut:
    return VisitorOut(
        id=v.id,
        visitor_key=v.visitor_key,
        fingerprint_hash=v.fingerprint_hash,
        user_email=v.user.email if v.user else None,
        user_agent=v.user_agent,
        timezone=v.timezone,
        screen=v.screen,
        platform=v.platform,
        location=v.location,
        ip=v.ip,
        first_referrer=v.first_referrer,
        utm=v.utm,
        consent=v.consent,
        event_count=v.event_count or 0,
        first_seen=v.first_seen,
        last_seen=v.last_seen,
    )


@router.get("/visitors", response_model=list[VisitorOut])
def list_visitors(
    db: Session = Depends(get_db),
    _: User = AdminOnly,
    limit: int = Query(default=200, le=1000),
) -> list[VisitorOut]:
    rows = db.scalars(
        select(Visitor)
        .options(selectinload(Visitor.user))
        .order_by(Visitor.last_seen.desc())
        .limit(limit)
    ).all()
    return [_visitor_out(v) for v in rows]


@router.get("/visitors/{visitor_id}", response_model=VisitorDetailOut)
def get_visitor(
    visitor_id: str, db: Session = Depends(get_db), _: User = AdminOnly
) -> VisitorDetailOut:
    v = db.scalar(
        select(Visitor).options(selectinload(Visitor.user)).where(Visitor.id == visitor_id)
    )
    if not v:
        raise HTTPException(status_code=404, detail="Visitor not found")
    events = db.scalars(
        select(VisitorEvent)
        .where(VisitorEvent.visitor_id == visitor_id)
        .order_by(VisitorEvent.created_at.desc())
        .limit(100)
    ).all()
    base = _visitor_out(v)
    return VisitorDetailOut(
        **base.model_dump(),
        fingerprint_components=v.fingerprint_components,
        signals=v.signals,
        events=[VisitorEventOut.model_validate(e) for e in events],
    )


@router.delete("/visitors/{visitor_id}", status_code=204)
def delete_visitor(
    visitor_id: str, db: Session = Depends(get_db), admin: User = AdminOnly
) -> Response:
    v = db.get(Visitor, visitor_id)
    if not v:
        raise HTTPException(status_code=404, detail="Visitor not found")
    db.delete(v)  # cascades to visitor_events
    record_audit(db, actor=admin, action="admin.visitor.delete",
                 entity_type="visitor", entity_id=visitor_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/audit", status_code=204)
def clear_audit(
    db: Session = Depends(get_db),
    admin: User = AdminOnly,
    api_logs_only: bool = Query(
        default=True, description="Clear only raw API access rows, keep domain events"
    ),
) -> Response:
    """Clear audit rows. Defaults to purging just the noisy API access log (and
    the IPs it holds), keeping the human domain-event trail."""
    stmt = delete(AuditLog)
    if api_logs_only:
        stmt = stmt.where(AuditLog.method.is_not(None))
    db.execute(stmt)
    record_audit(db, actor=admin, action="admin.audit.clear",
                 entity_type="audit", detail={"api_logs_only": api_logs_only})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
