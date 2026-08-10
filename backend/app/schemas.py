"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    AIAnalysisStatus,
    ProjectStatus,
    ReviewDecision,
    UserRole,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ─────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    organization_name: str
    country: str | None = None
    website: str | None = None


# ── Users / Orgs ─────────────────────────────────────────────
class OrganizationOut(ORMModel):
    id: str
    name: str
    description: str | None = None
    country: str | None = None
    website: str | None = None
    created_at: datetime


class UserOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    organization_id: str | None = None
    organization: OrganizationOut | None = None
    created_at: datetime


# ── Projects ─────────────────────────────────────────────────
class ProjectBase(BaseModel):
    title: str
    summary: str | None = None
    category: str | None = None
    problem_statement: str | None = None
    goals: str | None = None
    kpis: str | None = None
    target_beneficiaries: int | None = None
    beneficiary_description: str | None = None
    requested_budget: float | None = None
    currency: str = "USD"
    duration_months: int | None = None
    location: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    category: str | None = None
    problem_statement: str | None = None
    goals: str | None = None
    kpis: str | None = None
    target_beneficiaries: int | None = None
    beneficiary_description: str | None = None
    requested_budget: float | None = None
    currency: str | None = None
    duration_months: int | None = None
    location: str | None = None


class DocumentOut(ORMModel):
    id: str
    filename: str
    content_type: str | None = None
    size_bytes: int | None = None
    extraction_status: str
    created_at: datetime


class AIAnalysisOut(ORMModel):
    id: str
    status: AIAnalysisStatus
    model: str | None = None
    summary: str | None = None
    category: str | None = None
    risks: list | None = None
    missing_information: list | None = None
    suggested_questions: list | None = None
    preliminary_score: float | None = None
    preliminary_recommendation: str | None = None
    extracted_fields: dict | None = None
    error: str | None = None
    updated_at: datetime


class ReviewOut(ORMModel):
    id: str
    decision: ReviewDecision
    comment: str | None = None
    reviewer: UserOut
    created_at: datetime


class ProjectOut(ORMModel):
    id: str
    title: str
    summary: str | None = None
    category: str | None = None
    status: ProjectStatus
    problem_statement: str | None = None
    goals: str | None = None
    kpis: str | None = None
    target_beneficiaries: int | None = None
    beneficiary_description: str | None = None
    requested_budget: float | None = None
    currency: str
    duration_months: int | None = None
    location: str | None = None
    submitted_at: datetime | None = None
    decided_at: datetime | None = None
    organization: OrganizationOut
    owner: UserOut
    created_at: datetime
    updated_at: datetime


class ProjectDetailOut(ProjectOut):
    documents: list[DocumentOut] = []
    reviews: list[ReviewOut] = []
    ai_analysis: AIAnalysisOut | None = None


class ReviewCreate(BaseModel):
    decision: ReviewDecision
    comment: str | None = None


# ── Notifications / Audit ────────────────────────────────────
class NotificationOut(ORMModel):
    id: str
    message: str
    is_read: bool
    project_id: str | None = None
    created_at: datetime


class AuditLogOut(ORMModel):
    id: str
    actor_email: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    detail: dict | None = None
    created_at: datetime


# ── AI chat (RAG assistant) ──────────────────────────────────
class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[str] = []


# ── Admin dashboard ──────────────────────────────────────────
class DashboardStats(BaseModel):
    total_projects: int
    by_status: dict[str, int]
    total_organizations: int
    total_users: int
    pending_review: int


Token.model_rebuild()
