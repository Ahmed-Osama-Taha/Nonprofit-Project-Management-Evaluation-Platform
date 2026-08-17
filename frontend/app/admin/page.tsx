"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n, statusLabel } from "@/lib/i18n";
import type { AuditEntry, DashboardStats, User } from "@/lib/types";
import { RequireAuth, PageHead, dateStr } from "@/components/ui";

function AdminInner() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "audit">("overview");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function loadAll() {
    api.stats().then(setStats).catch(() => {});
    api.users().then(setUsers).catch(() => {});
    api.audit(120).then(setAudit).catch(() => {});
  }

  useEffect(loadAll, []);

  async function createReviewer(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await api.createReviewer(form);
      setMsg(`✓ ${form.email}`);
      setForm({ full_name: "", email: "", password: "" });
      loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "overview", label: t("nav.dashboard") },
    { key: "users", label: t("admin.users") },
    { key: "audit", label: t("admin.audit") },
  ];

  return (
    <>
      <PageHead title={t("admin.title")} sub={t("app.tagline")} />

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            className={`btn btn-sm ${tab === tb.key ? "" : "btn-secondary"}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <>
          <div className="grid-stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="num">{stats.total_projects}</div>
              <div className="lbl">{t("rev.totalProjects")}</div>
            </div>
            <div className="stat">
              <div className="num">{stats.pending_review}</div>
              <div className="lbl">{t("rev.pending")}</div>
            </div>
            <div className="stat">
              <div className="num">{stats.total_organizations}</div>
              <div className="lbl">{t("admin.orgs")}</div>
            </div>
            <div className="stat">
              <div className="num">{stats.total_users}</div>
              <div className="lbl">{t("admin.users")}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">
              <h3>{t("rev.byStatus")}</h3>
            </div>
            <table>
              <tbody>
                {Object.entries(stats.by_status).map(([k, v]) => (
                  <tr key={k}>
                    <td>{statusLabel(t, k)}</td>
                    <td style={{ textAlign: "end", fontWeight: 700 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "users" && (
        <>
          <div className="card">
            <div className="card-title">
              <h3>{t("admin.createReviewer")}</h3>
            </div>
            {msg && <div className="success-box">{msg}</div>}
            {err && <div className="error">{err}</div>}
            <form onSubmit={createReviewer}>
              <div className="row">
                <div className="field">
                  <label>{t("auth.fullName")}</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>{t("auth.email")}</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>{t("auth.password")}</label>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <button className="btn">{t("admin.createReviewer")}</button>
            </form>
          </div>

          <div className="card">
            <div className="card-title">
              <h3>{t("admin.users")}</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("auth.fullName")}</th>
                    <th>{t("auth.email")}</th>
                    <th>{t("review.decision")}</th>
                    <th>{t("role.organization")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className="pill">{t(`role.${u.role}`)}</span>
                      </td>
                      <td>{u.organization?.name || t("common.none")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "audit" && (
        <div className="card">
          <div className="card-title">
            <div>
              <h3 style={{ margin: 0 }}>{t("admin.audit")}</h3>
              <span className="section-hint">{t("admin.auditHint")}</span>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("admin.when")}</th>
                  <th>{t("admin.actor")}</th>
                  <th>{t("admin.action")}</th>
                  <th>{t("admin.method")}</th>
                  <th>{t("admin.path")}</th>
                  <th>{t("admin.statusCode")}</th>
                  <th>{t("admin.latency")}</th>
                  <th>{t("admin.stored")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="small muted">{dateStr(a.created_at)}</td>
                    <td className="small">
                      {a.actor_email || "system"}
                      {a.actor_role && (
                        <span className="pill" style={{ marginInlineStart: 6 }}>
                          {t(`role.${a.actor_role}`)}
                        </span>
                      )}
                    </td>
                    <td>
                      <code>{a.action}</code>
                    </td>
                    <td className="small">{a.method || "—"}</td>
                    <td className="small muted">{a.path || a.entity_type || "—"}</td>
                    <td className="small">
                      {a.status_code ? (
                        <span
                          className={
                            a.status_code >= 400 ? "sev-high" : "rec-approve"
                          }
                        >
                          {a.status_code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="small muted">
                      {a.latency_ms != null ? `${a.latency_ms}ms` : "—"}
                    </td>
                    <td>{a.s3_key ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminInner />
    </RequireAuth>
  );
}
