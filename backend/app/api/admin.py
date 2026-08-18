from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.config import settings
from app.core.db import get_db
from app.core.security import hash_password
from app.services import ai, risk
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
    AnalyticsOut,
    AuditLogOut,
    DashboardStats,
    InsightsOut,
    LabelValue,
    OrganizationOut,
    ProfileOut,
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
    return [_session_out(s) for s in db.scalars(stmt).all()]


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
        device=v.device,
        is_bot=v.is_bot,
        network_type=v.network_type,
        isp=v.isp,
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


# ── Visitor analytics + AI insights ──────────────────────────
def _lv(rows) -> list[LabelValue]:
    return [
        LabelValue(label=(str(k) if k not in (None, "") else "—"), value=int(v))
        for k, v in rows
    ]


def _build_analytics(db: Session) -> AnalyticsOut:
    def count(model, *where) -> int:
        stmt = select(func.count()).select_from(model)
        for w in where:
            stmt = stmt.where(w)
        return db.scalar(stmt) or 0

    def grouped(col, *where, limit=10) -> list[LabelValue]:
        stmt = select(col, func.count()).group_by(col).order_by(desc(func.count())).limit(limit)
        for w in where:
            stmt = stmt.where(w)
        return _lv(db.execute(stmt).all())

    total = count(Visitor)
    identified = count(Visitor, Visitor.user_id.is_not(None))
    utm_src = func.jsonb_extract_path_text(Visitor.utm, "utm_source")
    day = func.to_char(func.date_trunc("day", VisitorEvent.created_at), "MM-DD")

    ts = _lv(
        db.execute(
            select(day, func.count()).group_by(day).order_by(day).limit(30)
        ).all()
    )

    alerts: list[dict] = []
    rows = db.execute(
        select(
            VisitorEvent.created_at, VisitorEvent.location, VisitorEvent.url, User.email
        )
        .join(User, VisitorEvent.user_id == User.id, isouter=True)
        .where(VisitorEvent.new_device.is_(True))
        .order_by(VisitorEvent.created_at.desc())
        .limit(50)
    ).all()
    for created_at, location, url, email in rows:
        alerts.append(
            {
                "type": "new_device",
                "when": created_at.isoformat() if created_at else None,
                "user": email,
                "location": location,
                "url": url,
            }
        )

    return AnalyticsOut(
        total_visitors=total,
        identified=identified,
        anonymous=total - identified,
        bots=count(Visitor, Visitor.is_bot.is_(True)),
        new_devices=count(VisitorEvent, VisitorEvent.new_device.is_(True)),
        pageviews=count(VisitorEvent, VisitorEvent.type == "pageview"),
        events=count(VisitorEvent),
        by_country=grouped(Visitor.location, Visitor.location.is_not(None)),
        by_device=grouped(Visitor.device, Visitor.device.is_not(None)),
        by_platform=grouped(Visitor.platform, Visitor.platform.is_not(None)),
        top_pages=grouped(VisitorEvent.url, VisitorEvent.type == "pageview"),
        top_referrers=grouped(Visitor.first_referrer, Visitor.first_referrer.is_not(None)),
        utm_sources=grouped(utm_src, Visitor.utm.is_not(None)),
        timeseries=ts,
        security_alerts=alerts,
    )


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(db: Session = Depends(get_db), _: User = AdminOnly) -> AnalyticsOut:
    return _build_analytics(db)


@router.post("/insights", response_model=InsightsOut)
def ai_insights(
    db: Session = Depends(get_db),
    admin: User = AdminOnly,
    language: str = Query(default="ar", description="ar | en"),
) -> InsightsOut:
    """AI narrative over the AGGREGATE (non-PII) analytics: security anomalies,
    behaviour, and marketing recommendations."""
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI is not configured.")
    a = _build_analytics(db)
    payload = {
        "totals": {
            "visitors": a.total_visitors,
            "identified": a.identified,
            "anonymous": a.anonymous,
            "bots": a.bots,
            "pageviews": a.pageviews,
            "events": a.events,
            "new_device_logins": a.new_devices,
        },
        "by_country": [x.model_dump() for x in a.by_country],
        "by_device": [x.model_dump() for x in a.by_device],
        "top_pages": [x.model_dump() for x in a.top_pages],
        "top_referrers": [x.model_dump() for x in a.top_referrers],
        "utm_sources": [x.model_dump() for x in a.utm_sources],
        "daily_events": [x.model_dump() for x in a.timeseries],
        "security_alert_count": len(a.security_alerts),
    }
    lang = "Arabic" if language == "ar" else "English"
    system = (
        "You are a senior growth + security analyst for 'Athar', a nonprofit "
        "grant-review platform in Saudi Arabia. You are given AGGREGATE, "
        "non-personal visitor analytics. Produce concise, prioritized, "
        f"actionable insights in {lang}. Use three short sections with headers: "
        "1) Security & anomalies, 2) Visitor behaviour, 3) Marketing & growth. "
        "Be specific, reference the numbers, and give concrete next actions. "
        "If data is sparse, say so briefly. Do not invent data."
    )
    try:
        text = ai.generate_text(system, json.dumps(payload, ensure_ascii=False))
    except ai.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    record_audit(db, actor=admin, action="admin.insights", entity_type="analytics")
    db.commit()
    return InsightsOut(text=text)


# ── 360° identity profile (enterprise drill-down) ────────────
def _session_out(s: UserSession) -> AdminSessionOut:
    return AdminSessionOut(
        id=s.id,
        user_id=s.user_id,
        user_email=s.user.email if s.user else None,
        user_name=s.user.full_name if s.user else None,
        device=s.device,
        ip=s.ip,
        location=s.location,
        created_at=s.created_at,
        last_seen_at=s.last_seen_at,
        revoked=s.revoked_at is not None,
    )


def _build_profile(db: Session, seed: Visitor | None, user: User | None) -> ProfileOut:
    """Stitch a 360° identity from a seed visitor and/or a resolved user."""
    from datetime import datetime, timezone

    if user is not None:
        devices = list(
            db.scalars(
                select(Visitor)
                .options(selectinload(Visitor.user))
                .where(Visitor.user_id == user.id)
                .order_by(Visitor.last_seen.desc())
            ).all()
        )
        sessions = list(
            db.scalars(
                select(UserSession)
                .options(selectinload(UserSession.user))
                .where(UserSession.user_id == user.id)
                .order_by(UserSession.last_seen_at.desc())
            ).all()
        )
    else:
        devices, sessions = ([seed] if seed else []), []

    device_ids = [d.id for d in devices]
    events = (
        list(
            db.scalars(
                select(VisitorEvent)
                .where(VisitorEvent.visitor_id.in_(device_ids))
                .order_by(VisitorEvent.created_at.desc())
                .limit(100)
            ).all()
        )
        if device_ids
        else []
    )

    level, risk_signals = risk.compute_risk(devices, sessions, events)
    now = datetime.now(timezone.utc)
    seen = [d.first_seen for d in devices] + [s.created_at for s in sessions]
    last = [d.last_seen for d in devices] + [s.last_seen_at for s in sessions]
    return ProfileOut(
        visitor_id=seed.id if seed else (devices[0].id if devices else ""),
        is_identified=user is not None,
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        user_name=user.full_name if user else None,
        role=user.role.value if user else None,
        organization=(user.organization.name if user and user.organization else None),
        first_seen=min(seen, default=now),
        last_seen=max(last, default=now),
        consent=seed.consent if seed else "none",
        location=seed.location if seed else (sessions[0].location if sessions else None),
        first_referrer=seed.first_referrer if seed else None,
        utm=seed.utm if seed else None,
        risk_level=level,
        risk_signals=risk_signals,
        devices=[_visitor_out(d) for d in devices],
        sessions=[_session_out(s) for s in sessions],
        events=[VisitorEventOut.model_validate(e) for e in events],
    )


@router.get("/profile/{visitor_id}", response_model=ProfileOut)
def identity_profile(
    visitor_id: str, db: Session = Depends(get_db), _: User = AdminOnly
) -> ProfileOut:
    """Full identity for a visitor (drill-down from the Visitors tab)."""
    v = db.scalar(
        select(Visitor).options(selectinload(Visitor.user)).where(Visitor.id == visitor_id)
    )
    if not v:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _build_profile(db, v, v.user)


@router.get("/profile/user/{user_id}", response_model=ProfileOut)
def identity_profile_for_user(
    user_id: str, db: Session = Depends(get_db), _: User = AdminOnly
) -> ProfileOut:
    """Full identity for a user (drill-down from the Logins/Users tabs)."""
    u = db.scalar(
        select(User).options(selectinload(User.organization)).where(User.id == user_id)
    )
    if not u:
        raise HTTPException(status_code=404, detail="Profile not found")
    seed = db.scalar(
        select(Visitor).where(Visitor.user_id == user_id).order_by(Visitor.last_seen.desc())
    )
    return _build_profile(db, seed, u)


@router.delete("/profile/{visitor_id}", status_code=204)
def erase_identity(
    visitor_id: str, db: Session = Depends(get_db), admin: User = AdminOnly
) -> Response:
    """DSAR erasure: delete all visitor/behaviour data for this identity (every
    device + its events). Login/session and account records are kept."""
    v = db.get(Visitor, visitor_id)
    if not v:
        raise HTTPException(status_code=404, detail="Profile not found")
    if v.user_id:
        db.execute(delete(Visitor).where(Visitor.user_id == v.user_id))
    else:
        db.delete(v)
    record_audit(db, actor=admin, action="admin.identity.erase",
                 entity_type="visitor", entity_id=visitor_id,
                 detail={"user_id": v.user_id})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
