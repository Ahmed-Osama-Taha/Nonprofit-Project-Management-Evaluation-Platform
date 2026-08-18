export type Role = "admin" | "reviewer" | "organization";

export type ProjectStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected";

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  country?: string | null;
  website?: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  organization_id?: string | null;
  organization?: Organization | null;
  created_at: string;
}

export type PaymentKind = "per_review" | "subscription";
export type PaymentStatusT =
  | "initiated"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";

export interface Payment {
  id: string;
  kind: PaymentKind;
  status: PaymentStatusT;
  project_id?: string | null;
  amount_minor: number;
  vat_minor: number;
  total_minor: number;
  currency: string;
  provider: string;
  redirect_url?: string | null;
  failure_reason?: string | null;
  created_at: string;
  paid_at?: string | null;
}

export interface SubscriptionInfo {
  active: boolean;
  status?: string | null;
  current_period_end?: string | null;
}

export interface Pricing {
  currency: string;
  vat_rate: number;
  per_review_minor: number;
  per_review_total_minor: number;
  subscription_minor: number;
  subscription_total_minor: number;
  subscription_period_days: number;
}

export interface SessionInfo {
  id: string;
  device?: string | null;
  location?: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface LabelValueT {
  label: string;
  value: number;
}

export interface SecurityAlert {
  type: string;
  when?: string | null;
  user?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface Analytics {
  total_visitors: number;
  identified: number;
  anonymous: number;
  bots: number;
  new_devices: number;
  pageviews: number;
  events: number;
  by_country: LabelValueT[];
  by_device: LabelValueT[];
  by_platform: LabelValueT[];
  top_pages: LabelValueT[];
  top_referrers: LabelValueT[];
  utm_sources: LabelValueT[];
  timeseries: LabelValueT[];
  security_alerts: SecurityAlert[];
}

export interface VisitorSummary {
  id: string;
  visitor_key: string;
  fingerprint_hash?: string | null;
  user_email?: string | null;
  device?: string | null;
  is_bot?: boolean;
  user_agent?: string | null;
  timezone?: string | null;
  screen?: string | null;
  platform?: string | null;
  location?: string | null;
  ip?: string | null;
  first_referrer?: string | null;
  utm?: Record<string, unknown> | null;
  consent: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

export interface VisitorEventInfo {
  id: string;
  type: string;
  url?: string | null;
  referrer?: string | null;
  location?: string | null;
  new_device: boolean;
  created_at: string;
}

export interface VisitorDetail extends VisitorSummary {
  fingerprint_components?: Record<string, unknown> | null;
  signals?: Record<string, unknown> | null;
  events: VisitorEventInfo[];
}

export interface Profile {
  visitor_id: string;
  is_identified: boolean;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  role?: string | null;
  organization?: string | null;
  first_seen: string;
  last_seen: string;
  consent: string;
  location?: string | null;
  first_referrer?: string | null;
  utm?: Record<string, unknown> | null;
  risk_level: string;
  risk_signals: string[];
  devices: VisitorSummary[];
  sessions: AdminSession[];
  events: VisitorEventInfo[];
}

export interface AdminSession {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  device?: string | null;
  ip?: string | null;
  location?: string | null;
  created_at: string;
  last_seen_at: string;
  revoked: boolean;
}

export interface DocumentFile {
  id: string;
  filename: string;
  content_type?: string | null;
  size_bytes?: number | null;
  extraction_status: string;
  created_at: string;
}

export interface Risk {
  title: string;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface Criterion {
  name: string;
  score: number;
  rationale?: string;
}

export interface AIAnalysis {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  model?: string | null;
  summary?: string | null;
  category?: string | null;
  risks?: Risk[] | null;
  missing_information?: string[] | null;
  suggested_questions?: string[] | null;
  strengths?: string[] | null;
  criteria?: Criterion[] | null;
  preliminary_score?: number | null;
  preliminary_recommendation?: string | null;
  recommendation_rationale?: string | null;
  extracted_fields?: Record<string, unknown> | null;
  error?: string | null;
  updated_at: string;
}

export interface Review {
  id: string;
  decision: "comment" | "request_changes" | "approve" | "reject";
  comment?: string | null;
  reviewer: User;
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  status: ProjectStatus;
  problem_statement?: string | null;
  goals?: string | null;
  kpis?: string | null;
  target_beneficiaries?: number | null;
  beneficiary_description?: string | null;
  requested_budget?: number | null;
  currency: string;
  duration_months?: number | null;
  location?: string | null;
  submitted_at?: string | null;
  decided_at?: string | null;
  organization: Organization;
  owner: User;
  created_at: string;
  updated_at: string;
  documents?: DocumentFile[];
  reviews?: Review[];
  ai_analysis?: AIAnalysis | null;
}

export interface Notification {
  id: string;
  message: string;
  is_read: boolean;
  project_id?: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_projects: number;
  by_status: Record<string, number>;
  total_organizations: number;
  total_users: number;
  pending_review: number;
}

export interface AuditEntry {
  id: string;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  detail?: Record<string, unknown> | null;
  method?: string | null;
  path?: string | null;
  status_code?: number | null;
  latency_ms?: number | null;
  ip?: string | null;
  request_id?: string | null;
  s3_key?: string | null;
  created_at: string;
}

export interface CategoryStat {
  category: string;
  count: number;
  total_budget: number;
  avg_score?: number | null;
}

export interface LabelValue {
  label: string;
  value: number;
}

export interface QueueItem {
  id: string;
  title: string;
  organization: string;
  category?: string | null;
  status: ProjectStatus;
  requested_budget?: number | null;
  currency: string;
  ai_score?: number | null;
  ai_recommendation?: string | null;
  risk_high: number;
  submitted_at?: string | null;
}

export interface ReviewerDashboard {
  total_projects: number;
  pending_review: number;
  decided: number;
  approval_rate?: number | null;
  total_requested_budget: number;
  approved_budget: number;
  currency: string;
  by_status: Record<string, number>;
  by_category: CategoryStat[];
  risk_distribution: Record<string, number>;
  avg_ai_score?: number | null;
  ai_score_buckets: LabelValue[];
  queue: QueueItem[];
}
