from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles
from app.core.db import SessionLocal, get_db
from app.models import (
    Document,
    Project,
    ProjectStatus,
    User,
    UserRole,
)
from app.schemas import (
    ChatRequest,
    ChatResponse,
    DocumentOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
)
from app.services import analysis as analysis_service
from app.services import storage
from app.services.ai import AINotConfigured
from app.services.audit import notify, record_audit
from app.services.extraction import extract_text

router = APIRouter(prefix="/api/projects", tags=["projects"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


def _load_project(db: Session, project_id: str) -> Project:
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.organization),
            selectinload(Project.owner).selectinload(User.organization),
            selectinload(Project.documents),
            selectinload(Project.reviews),
            selectinload(Project.ai_analysis),
        )
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _authorize_view(project: Project, user: User) -> None:
    if user.role in (UserRole.admin, UserRole.reviewer):
        return
    if user.organization_id and project.organization_id == user.organization_id:
        return
    raise HTTPException(status_code=403, detail="Not allowed to access this project")


def _authorize_edit(project: Project, user: User) -> None:
    """Only the owning organization may edit, and only in editable states."""
    if user.role != UserRole.organization or project.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Only the owning organization can edit")
    if project.status not in (ProjectStatus.draft, ProjectStatus.changes_requested):
        raise HTTPException(
            status_code=409,
            detail=f"Project cannot be edited while status is '{project.status.value}'",
        )


def _run_analysis_background(project_id: str) -> None:
    """Runs the AI pipeline in a fresh DB session (background task)."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if project:
            analysis_service.run_analysis(db, project)
    except Exception:  # noqa: BLE001 — failure already recorded on the analysis row
        pass
    finally:
        db.close()


# ── List / create ────────────────────────────────────────────
@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    q: str | None = Query(default=None, description="search in title/summary"),
) -> list[Project]:
    stmt = select(Project).options(
        selectinload(Project.organization),
        selectinload(Project.owner),
    )

    # Organizations only see their own projects; reviewers/admins see all.
    if user.role == UserRole.organization:
        stmt = stmt.where(Project.organization_id == user.organization_id)
    elif user.role == UserRole.reviewer:
        # Reviewers work the queue: only submitted/in-flight items by default.
        if status_filter is None:
            stmt = stmt.where(
                Project.status.in_(
                    [
                        ProjectStatus.submitted,
                        ProjectStatus.under_review,
                        ProjectStatus.changes_requested,
                    ]
                )
            )

    if status_filter is not None:
        stmt = stmt.where(Project.status == status_filter)
    if category:
        stmt = stmt.where(Project.category == category)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Project.title.ilike(like) | Project.summary.ilike(like))

    stmt = stmt.order_by(Project.updated_at.desc())
    return list(db.scalars(stmt).all())


@router.post("", response_model=ProjectDetailOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.organization)),
) -> Project:
    project = Project(
        **payload.model_dump(),
        organization_id=user.organization_id,
        owner_id=user.id,
        status=ProjectStatus.draft,
    )
    db.add(project)
    record_audit(db, actor=user, action="project.create", entity_type="project", entity_id=project.id)
    db.commit()
    return _load_project(db, project.id)


# ── Retrieve / update ────────────────────────────────────────
@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = _load_project(db, project_id)
    _authorize_view(project, user)
    return project


@router.patch("/{project_id}", response_model=ProjectDetailOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = _load_project(db, project_id)
    _authorize_edit(project, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    record_audit(db, actor=user, action="project.update", entity_type="project", entity_id=project.id)
    db.commit()
    return _load_project(db, project.id)


# ── Documents ────────────────────────────────────────────────
@router.post("/{project_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Document:
    project = _load_project(db, project_id)
    _authorize_edit(project, user)

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    storage.ensure_bucket()
    key = f"projects/{project_id}/{uuid.uuid4()}-{file.filename}"
    storage.upload_bytes(key, data, file.content_type)

    text = ""
    extraction_status = "done"
    try:
        text = extract_text(file.filename or "", file.content_type, data)
    except Exception:  # noqa: BLE001 — file stored even if extraction fails
        extraction_status = "failed"

    doc = Document(
        project_id=project_id,
        filename=file.filename or "upload",
        content_type=file.content_type,
        size_bytes=len(data),
        storage_key=key,
        extracted_text=text or None,
        extraction_status=extraction_status if text else "empty",
    )
    db.add(doc)
    record_audit(
        db, actor=user, action="document.upload", entity_type="document",
        entity_id=doc.id, detail={"project_id": project_id, "filename": doc.filename},
    )
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{project_id}/documents/{document_id}/download")
def download_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    project = _load_project(db, project_id)
    _authorize_view(project, user)
    doc = db.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"url": storage.presigned_url(doc.storage_key)}


# ── Workflow: submit ─────────────────────────────────────────
@router.post("/{project_id}/submit", response_model=ProjectDetailOut)
def submit_project(
    project_id: str,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.organization)),
) -> Project:
    project = _load_project(db, project_id)
    if project.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Not your project")
    if project.status not in (ProjectStatus.draft, ProjectStatus.changes_requested):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot submit from status '{project.status.value}'",
        )
    if not project.problem_statement or not project.goals:
        raise HTTPException(
            status_code=422,
            detail="Problem statement and goals are required before submission",
        )

    project.status = ProjectStatus.submitted
    project.submitted_at = datetime.now(timezone.utc)
    record_audit(db, actor=user, action="project.submit", entity_type="project", entity_id=project.id)

    # Notify reviewers.
    for reviewer in db.scalars(select(User).where(User.role == UserRole.reviewer)).all():
        notify(db, user_id=reviewer.id, project_id=project.id,
               message=f"New project submitted for review: {project.title}")
    db.commit()

    # Kick off AI analysis asynchronously so submission stays fast.
    background.add_task(_run_analysis_background, project.id)
    return _load_project(db, project.id)


@router.post("/{project_id}/analyze", response_model=ProjectDetailOut)
def rerun_analysis(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.reviewer, UserRole.admin)),
) -> Project:
    project = _load_project(db, project_id)
    try:
        analysis_service.run_analysis(db, project)
    except AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return _load_project(db, project.id)


# ── AI reviewer assistant (RAG chat) ─────────────────────────
@router.post("/{project_id}/chat", response_model=ChatResponse)
def chat_about_project(
    project_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.reviewer, UserRole.admin)),
) -> ChatResponse:
    from app.services import ai

    project = _load_project(db, project_id)
    try:
        context = analysis_service.retrieve_context(db, project, payload.question)
        answer = ai.answer_question(
            analysis_service._project_payload(project), payload.question, context
        )
    except AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return ChatResponse(answer=answer, sources=context)
