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
  User,
} from "./types";

// Empty string ("") means "same origin" — calls go to /api/* on the page's own
// host and Next proxies them to the backend (see next.config.mjs rewrites). This
// is what makes ngrok/reverse-proxy setups work. `??` (not `||`) so "" is kept.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "nppm_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
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
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || (body ? "POST" : "GET"),
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    if (res.status === 401) clearToken();
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
  // Auth
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
  me: () => request<User>("/api/auth/me"),

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
  analyzeProject: (id: string) =>
    request<Project>(`/api/projects/${id}/analyze`, { method: "POST" }),
  uploadDocument: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<DocumentFile>(`/api/projects/${id}/documents`, { formData: fd });
  },
  downloadDocument: (id: string, docId: string) =>
    request<{ url: string }>(`/api/projects/${id}/documents/${docId}/download`),
  chat: (id: string, question: string) =>
    request<{ answer: string; sources: string[] }>(`/api/projects/${id}/chat`, {
      body: { question },
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
