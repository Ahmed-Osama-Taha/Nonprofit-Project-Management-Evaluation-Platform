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


class CheckoutRequest(BaseModel):
    kind: str  # "per_review" | "subscription"
    project_id: str | None = None


class PaymentOut(ORMModel):
    id: str
    kind: str
    status: str
    project_id: str | None = None
    amount_minor: int
    vat_minor: int
    total_minor: int
    currency: str
    provider: str
    redirect_url: str | None = None
    failure_reason: str | None = None
    created_at: datetime
    paid_at: datetime | None = None


class CheckoutResponse(BaseModel):
    payment_id: str
    status: str
    redirect_url: str | None = None


class SubscriptionOut(BaseModel):
    active: bool
    status: str | None = None
    current_period_end: datetime | None = None


class PricingOut(BaseModel):
    currency: str
    vat_rate: float
    per_review_minor: int
    per_review_total_minor: int
    subscription_minor: int
    subscription_total_minor: int
    subscription_period_days: int


class MockCompleteRequest(BaseModel):
    outcome: str = "paid"  # "paid" | "failed" | "expired"


class SessionOut(ORMModel):
    id: str
    device: str | None = None
    location: str | None = None
    created_at: datetime
    last_seen_at: datetime
    current: bool = False


# ── Visitor intelligence ─────────────────────────────────────
class CollectIn(BaseModel):
    visitor_key: str
    fingerprint_hash: str | None = None
    fingerprint_components: dict | None = None
    signals: dict | None = None
    type: str = "pageview"          # pageview | click | identify | signal
    url: str | None = None
    referrer: str | None = None
    utm: dict | None = None
    payload: dict | None = None
    consent: str | None = None      # none | granted | denied


class CollectResult(BaseModel):
    visitor_id: str
    new_device: bool = False


class VisitorOut(BaseModel):
    id: str
    visitor_key: str
    fingerprint_hash: str | None = None
    user_email: str | None = None
    device: str | None = None
    is_bot: bool = False
    user_agent: str | None = None
    timezone: str | None = None
    screen: str | None = None
    platform: str | None = None
    location: str | None = None
    ip: str | None = None
    network_type: str | None = None
    isp: str | None = None
    first_referrer: str | None = None
    utm: dict | None = None
    consent: str = "none"
    event_count: int = 0
    first_seen: datetime
    last_seen: datetime


class VisitorEventOut(ORMModel):
    id: str
    type: str
    url: str | None = None
    referrer: str | None = None
    location: str | None = None
    new_device: bool = False
    created_at: datetime


class VisitorDetailOut(VisitorOut):
    fingerprint_components: dict | None = None
    signals: dict | None = None
    events: list[VisitorEventOut] = []


class AnalyticsOut(BaseModel):
    total_visitors: int = 0
    identified: int = 0
    anonymous: int = 0
    bots: int = 0
    new_devices: int = 0
    pageviews: int = 0
    events: int = 0
    by_country: list["LabelValue"] = []
    by_device: list["LabelValue"] = []
    by_platform: list["LabelValue"] = []
    top_pages: list["LabelValue"] = []
    top_referrers: list["LabelValue"] = []
    utm_sources: list["LabelValue"] = []
    timeseries: list["LabelValue"] = []
    security_alerts: list[dict] = []


class InsightsOut(BaseModel):
    text: str


class ProfileOut(BaseModel):
    """A consolidated 360° identity profile: the person (or anonymous visitor)
    with all their devices, login sessions, and activity stitched together,
    plus a rule-based risk assessment."""

    visitor_id: str
    is_identified: bool = False
    user_id: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    role: str | None = None
    organization: str | None = None
    first_seen: datetime
    last_seen: datetime
    consent: str = "none"
    location: str | None = None
    first_referrer: str | None = None
    utm: dict | None = None
    risk_level: str = "low"          # low | medium | high
    risk_signals: list[str] = []
    devices: list["VisitorOut"] = []
    sessions: list["AdminSessionOut"] = []
    events: list["VisitorEventOut"] = []


class AdminSessionOut(BaseModel):
    """Admin login-activity row — includes who and (admin-only) the IP."""

    id: str
    user_id: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    device: str | None = None
    ip: str | None = None
    location: str | None = None
    created_at: datetime
    last_seen_at: datetime
    revoked: bool = False


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
    currency: str = "SAR"
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
    scan_status: str = "skipped"
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
    strengths: list | None = None
    criteria: list | None = None
    preliminary_score: float | None = None
    preliminary_recommendation: str | None = None
    recommendation_rationale: str | None = None
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
    actor_role: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    detail: dict | None = None
    method: str | None = None
    path: str | None = None
    status_code: int | None = None
    latency_ms: int | None = None
    ip: str | None = None
    request_id: str | None = None
    s3_key: str | None = None
    created_at: datetime


# ── AI chat (RAG assistant) ──────────────────────────────────
class ChatRequest(BaseModel):
    question: str
    language: str = "ar"


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


# ── Reviewer analytics ───────────────────────────────────────
class LabelValue(BaseModel):
    label: str
    value: float


class CategoryStat(BaseModel):
    category: str
    count: int
    total_budget: float
    avg_score: float | None = None


class QueueItem(BaseModel):
    id: str
    title: str
    organization: str
    category: str | None = None
    status: ProjectStatus
    requested_budget: float | None = None
    currency: str
    ai_score: float | None = None
    ai_recommendation: str | None = None
    risk_high: int = 0
    submitted_at: datetime | None = None


class ReviewerDashboard(BaseModel):
    total_projects: int
    pending_review: int
    decided: int
    approval_rate: float | None = None
    total_requested_budget: float
    approved_budget: float
    currency: str
    by_status: dict[str, int]
    by_category: list[CategoryStat]
    risk_distribution: dict[str, int]
    avg_ai_score: float | None = None
    ai_score_buckets: list[LabelValue]
    queue: list[QueueItem]


Token.model_rebuild()
