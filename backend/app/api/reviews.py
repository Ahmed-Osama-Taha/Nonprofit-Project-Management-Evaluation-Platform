from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.db import get_db
from app.models import (
    Project,
    ProjectStatus,
    Review,
    ReviewDecision,
    User,
    UserRole,
)
from app.schemas import ProjectDetailOut, ReviewCreate
from app.services.audit import notify, record_audit

router = APIRouter(prefix="/api/projects", tags=["reviews"])

# Which decisions are valid, and the status they drive the project to.
_DECISION_TO_STATUS = {
    ReviewDecision.comment: None,  # no status change
    ReviewDecision.request_changes: ProjectStatus.changes_requested,
    ReviewDecision.approve: ProjectStatus.approved,
    ReviewDecision.reject: ProjectStatus.rejected,
}


def _load(db: Session, project_id: str) -> Project:
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.organization),
            selectinload(Project.owner),
            selectinload(Project.documents),
            selectinload(Project.reviews).selectinload(Review.reviewer),
            selectinload(Project.ai_analysis),
        )
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/reviews", response_model=ProjectDetailOut, status_code=201)
def create_review(
    project_id: str,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    reviewer: User = Depends(require_roles(UserRole.reviewer, UserRole.admin)),
) -> Project:
    project = _load(db, project_id)

    if project.status in (ProjectStatus.draft,):
        raise HTTPException(status_code=409, detail="Project has not been submitted yet")
    if project.status in (ProjectStatus.approved, ProjectStatus.rejected):
        raise HTTPException(status_code=409, detail="A final decision has already been made")

    if payload.decision in (ReviewDecision.request_changes, ReviewDecision.reject) and not payload.comment:
        raise HTTPException(
            status_code=422,
            detail="A comment is required when requesting changes or rejecting",
        )

    review = Review(
        project_id=project.id,
        reviewer_id=reviewer.id,
        decision=payload.decision,
        comment=payload.comment,
    )
    db.add(review)

    new_status = _DECISION_TO_STATUS[payload.decision]
    if new_status is None:
        # First touch of a submitted project moves it to under_review.
        if project.status == ProjectStatus.submitted:
            project.status = ProjectStatus.under_review
    else:
        project.status = new_status
        if new_status in (ProjectStatus.approved, ProjectStatus.rejected):
            project.decided_at = datetime.now(timezone.utc)

    record_audit(
        db, actor=reviewer, action=f"review.{payload.decision.value}",
        entity_type="project", entity_id=project.id,
        detail={"new_status": project.status.value},
    )
    notify(
        db, user_id=project.owner_id, project_id=project.id,
        message=f"Reviewer {payload.decision.value.replace('_', ' ')} on '{project.title}'"
        + (f": {payload.comment}" if payload.comment else ""),
    )
    db.commit()
    return _load(db, project.id)
