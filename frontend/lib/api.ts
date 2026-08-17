"use client";

import type {
  AIAnalysis,
  AuditEntry,
  DashboardStats,
  DocumentFile,
  Notification,
  Project,
  Review,
  ReviewerDashboard,
  SessionInfo,
  User,
} from "./types";

// Empty string ("") means "same origin" — calls go to /api/* on the page's own
// host and Next proxies them to the backend (see next.config.mjs rewrites). This
// is what makes ngrok/reverse-proxy setups work. `??` (not `||`) so "" is kept.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CSRF_COOKIE = "ath_csrf";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Read a non-httpOnly cookie (used for the CSRF double-submit token). */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    // Skip ngrok's free-tier browser interstitial for XHR/fetch requests.
    "ngrok-skip-browser-warning": "true",
  };

  const method = opts.method || (opts.body || opts.formData ? "POST" : "GET");

  // CSRF double-submit: echo the readable CSRF cookie in a header on mutations.
  if (MUTATING.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body,
    cache: "no-store",
    // Send/receive the httpOnly auth cookies. The token is never in JS.
    credentials: "include",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  // Auth — tokens live in httpOnly cookies set by the server; nothing is stored
  // in JS-readable storage, so XSS cannot exfiltrate a session.
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/login", {
      body: { email, password },
    }),
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
    country?: string;
    website?: string;
  }) =>
    request<{ access_token: string; user: User }>("/api/auth/register", {
      body: payload,
    }),
  refresh: () => request<{ user: User }>("/api/auth/refresh", { method: "POST" }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  // Active sessions (device activity log)
  sessions: () => request<SessionInfo[]>("/api/auth/sessions"),
  revokeSession: (id: string) =>
    request<void>(`/api/auth/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () =>
    request<void>("/api/auth/sessions/revoke-others", { method: "POST" }),

  // Projects
  listProjects: (params?: { status?: string; category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Project[]>(`/api/projects${suffix}`);
  },
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (body: Partial<Project>) =>
    request<Project>("/api/projects", { body }),
  updateProject: (id: string, body: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body }),
  submitProject: (id: string) =>
    request<Project>(`/api/projects/${id}/submit`, { method: "POST" }),
  analyzeProject: (id: string, language = "ar") =>
    request<Project>(`/api/projects/${id}/analyze?language=${language}`, {
      method: "POST",
    }),
  uploadDocument: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<DocumentFile>(`/api/projects/${id}/documents`, { formData: fd });
  },
  downloadDocument: (id: string, docId: string) =>
    request<{ url: string }>(`/api/projects/${id}/documents/${docId}/download`),
  deleteDocument: (id: string, docId: string) =>
    request<void>(`/api/projects/${id}/documents/${docId}`, { method: "DELETE" }),
  chat: (id: string, question: string, language = "ar") =>
    request<{ answer: string; sources: string[] }>(`/api/projects/${id}/chat`, {
      body: { question, language },
    }),

  // Reviews
  createReview: (
    id: string,
    decision: Review["decision"],
    comment?: string
  ) =>
    request<Project>(`/api/projects/${id}/reviews`, {
      body: { decision, comment },
    }),

  // Notifications
  notifications: () => request<Notification[]>("/api/notifications"),
  markRead: (id: string) =>
    request<Notification>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => request("/api/notifications/read-all", { method: "POST" }),

  // Analytics
  reviewerDashboard: () =>
    request<ReviewerDashboard>("/api/analytics/reviewer"),

  // Admin
  stats: () => request<DashboardStats>("/api/admin/stats"),
  users: () => request<User[]>("/api/admin/users"),
  organizations: () => request("/api/admin/organizations"),
  audit: (limit = 100) =>
    request<AuditEntry[]>(`/api/admin/audit?limit=${limit}`),
  createReviewer: (payload: {
    email: string;
    password: string;
    full_name: string;
  }) =>
    request<User>("/api/admin/reviewers", {
      body: { ...payload, organization_name: "internal" },
    }),
};

export type { AIAnalysis };
