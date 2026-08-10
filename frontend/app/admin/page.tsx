"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DashboardStats, User } from "@/lib/types";
import { RequireAuth, dateStr } from "@/components/ui";

interface AuditEntry {
  id: string;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  created_at: string;
}

function AdminInner() {
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
    api.audit().then((a) => setAudit(a as unknown as AuditEntry[])).catch(() => {});
  }

  useEffect(loadAll, []);

  async function createReviewer(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await api.createReviewer(form);
      setMsg(`Reviewer ${form.email} created.`);
      setForm({ full_name: "", email: "", password: "" });
      loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <h1>Admin Dashboard</h1>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {(["overview", "users", "audit"] as const).map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "" : "btn-secondary"}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <>
          <div className="grid-stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="num">{stats.total_projects}</div>
              <div className="lbl">Projects</div>
            </div>
            <div className="stat">
              <div className="num">{stats.pending_review}</div>
              <div className="lbl">Pending review</div>
            </div>
            <div className="stat">
              <div className="num">{stats.total_organizations}</div>
              <div className="lbl">Organizations</div>
            </div>
            <div className="stat">
              <div className="num">{stats.total_users}</div>
              <div className="lbl">Users</div>
            </div>
          </div>
          <div className="card">
            <h3>Projects by status</h3>
            <table>
              <tbody>
                {Object.entries(stats.by_status).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ textTransform: "capitalize" }}>{k.replace("_", " ")}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{v}</td>
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
            <h3>Provision reviewer</h3>
            {msg && <div className="success-box">{msg}</div>}
            {err && <div className="error">{err}</div>}
            <form onSubmit={createReviewer}>
              <div className="row">
                <div className="field">
                  <label>Full name</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>Password (min 8)</label>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <button className="btn">Create reviewer</button>
            </form>
          </div>

          <div className="card">
            <h3>All users</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Organization</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="pill">{u.role}</span>
                    </td>
                    <td>{u.organization?.name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "audit" && (
        <div className="card">
          <h3>Audit log</h3>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="small muted">{dateStr(a.created_at)}</td>
                  <td>{a.actor_email || "system"}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td className="small muted">{a.entity_type || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
