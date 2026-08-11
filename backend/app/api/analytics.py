"""Reviewer analytics — aggregates the project portfolio into the numbers and
distributions a reviewer needs to prioritise and decide, not just RAG Q&A."""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.config import settings
from app.core.db import get_db
from app.models import AIAnalysis, Project, ProjectStatus, User, UserRole
from app.schemas import (
    CategoryStat,
    LabelValue,
    QueueItem,
    ReviewerDashboard,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

ReviewerOrAdmin = Depends(require_roles(UserRole.reviewer, UserRole.admin))

_OPEN_STATUSES = (
    ProjectStatus.submitted,
    ProjectStatus.under_review,
    ProjectStatus.changes_requested,
)


def _high_risk_count(analysis: AIAnalysis | None) -> int:
    if not analysis or not analysis.risks:
        return 0
    return sum(1 for r in analysis.risks if str(r.get("severity", "")).lower() == "high")


@router.get("/reviewer", response_model=ReviewerDashboard)
def reviewer_dashboard(
    db: Session = Depends(get_db), _: User = ReviewerOrAdmin
) -> ReviewerDashboard:
    projects = list(
        db.scalars(
            select(Project).options(
                selectinload(Project.organization),
                selectinload(Project.ai_analysis),
            )
        ).all()
    )

    by_status: Counter[str] = Counter()
    by_cat_count: Counter[str] = Counter()
    by_cat_budget: defaultdict[str, float] = defaultdict(float)
    by_cat_scores: defaultdict[str, list[float]] = defaultdict(list)
    risk_dist: Counter[str] = Counter({"low": 0, "medium": 0, "high": 0})
    ai_scores: list[float] = []
    buckets = {"0–40": 0, "40–60": 0, "60–75": 0, "75–100": 0}

    total_requested = 0.0
    approved_budget = 0.0
    decided = 0
    approved = 0

    for p in projects:
        by_status[p.status.value] += 1
        total_requested += p.requested_budget or 0.0

        if p.status == ProjectStatus.approved:
            approved += 1
            decided += 1
            approved_budget += p.requested_budget or 0.0
        elif p.status == ProjectStatus.rejected:
            decided += 1

        cat = p.category or "Uncategorized"
        by_cat_count[cat] += 1
        by_cat_budget[cat] += p.requested_budget or 0.0

        a = p.ai_analysis
        if a and a.preliminary_score is not None:
            score = float(a.preliminary_score)
            ai_scores.append(score)
            by_cat_scores[cat].append(score)
            if score < 40:
                buckets["0–40"] += 1
            elif score < 60:
                buckets["40–60"] += 1
            elif score < 75:
                buckets["60–75"] += 1
            else:
                buckets["75–100"] += 1
        if a and a.risks:
            for r in a.risks:
                sev = str(r.get("severity", "")).lower()
                if sev in risk_dist:
                    risk_dist[sev] += 1

    by_category = [
        CategoryStat(
            category=cat,
            count=by_cat_count[cat],
            total_budget=round(by_cat_budget[cat], 2),
            avg_score=(
                round(sum(by_cat_scores[cat]) / len(by_cat_scores[cat]), 1)
                if by_cat_scores[cat]
                else None
            ),
        )
        for cat in sorted(by_cat_count, key=lambda c: by_cat_count[c], reverse=True)
    ]

    queue_projects = [p for p in projects if p.status in _OPEN_STATUSES]
    queue_projects.sort(key=lambda p: (p.submitted_at or p.created_at), reverse=True)
    queue = [
        QueueItem(
            id=p.id,
            title=p.title,
            organization=p.organization.name if p.organization else "—",
            category=p.category,
            status=p.status,
            requested_budget=p.requested_budget,
            currency=p.currency,
            ai_score=(p.ai_analysis.preliminary_score if p.ai_analysis else None),
            ai_recommendation=(
                p.ai_analysis.preliminary_recommendation if p.ai_analysis else None
            ),
            risk_high=_high_risk_count(p.ai_analysis),
            submitted_at=p.submitted_at,
        )
        for p in queue_projects
    ]

    pending = by_status.get(ProjectStatus.submitted.value, 0) + by_status.get(
        ProjectStatus.under_review.value, 0
    )

    return ReviewerDashboard(
        total_projects=len(projects),
        pending_review=pending,
        decided=decided,
        approval_rate=(round(approved / decided, 3) if decided else None),
        total_requested_budget=round(total_requested, 2),
        approved_budget=round(approved_budget, 2),
        currency=settings.default_currency,
        by_status=dict(by_status),
        by_category=by_category,
        risk_distribution=dict(risk_dist),
        avg_ai_score=(round(sum(ai_scores) / len(ai_scores), 1) if ai_scores else None),
        ai_score_buckets=[LabelValue(label=k, value=v) for k, v in buckets.items()],
        queue=queue,
    )
