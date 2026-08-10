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

export interface AIAnalysis {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  model?: string | null;
  summary?: string | null;
  category?: string | null;
  risks?: Risk[] | null;
  missing_information?: string[] | null;
  suggested_questions?: string[] | null;
  preliminary_score?: number | null;
  preliminary_recommendation?: string | null;
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
