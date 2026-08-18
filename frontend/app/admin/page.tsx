"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n, statusLabel } from "@/lib/i18n";
import type {
  AdminSession,
  Analytics,
  AuditEntry,
  DashboardStats,
  User,
  VisitorSummary,
} from "@/lib/types";
import { RequireAuth, PageHead, BarList, Donut, dateStr } from "@/components/ui";

type AdminTab =
  | "overview"
  | "users"
  | "logins"
  | "visitors"
  | "analytics"
  | "audit";

function AdminInner() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [visitors, setVisitors] = useState<VisitorSummary[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [insights, setInsights] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showApiLog, setShowApiLog] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function loadAll() {
    api.stats().then(setStats).catch(() => {});
    api.users().then(setUsers).catch(() => {});
    api.audit(200, !showApiLog).then(setAudit).catch(() => {});
    api.adminSessions().then(setSessions).catch(() => {});
    api.visitors().then(setVisitors).catch(() => {});
    api.analytics().then(setAnalytics).catch(() => {});
  }

  async function generateInsights() {
    setAiBusy(true);
    setInsights("");
    try {
      const r = await api.insights(lang);
      setInsights(r.text);
    } catch (e) {
      setInsights(e instanceof Error ? e.message : "Failed");
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(loadAll, [showApiLog]);

  async function deleteSession(id: string) {
    if (!window.confirm(t("admin.deleteConfirm"))) return;
    await api.deleteAdminSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
  }

  async function clearApiLog() {
    if (!window.confirm(t("admin.clearConfirm"))) return;
    await api.clearAudit(true);
    loadAll();
  }

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

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "overview", label: t("nav.dashboard") },
    { key: "users", label: t("admin.users") },
    { key: "logins", label: t("admin.logins") },
    { key: "visitors", label: t("admin.visitors") },
    { key: "analytics", label: t("an.title") },
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

      {tab === "logins" && (
        <div className="card">
          <div className="card-title">
            <div>
              <h3 style={{ margin: 0 }}>{t("admin.logins")}</h3>
              <span className="section-hint">{t("admin.loginsHint")}</span>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("admin.user")}</th>
                  <th>{t("admin.device")}</th>
                  <th>{t("admin.location")}</th>
                  <th>{t("admin.ip")}</th>
                  <th>{t("admin.when")}</th>
                  <th>{t("admin.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="small">
                      {s.user_name || "—"}
                      <div className="muted">{s.user_email}</div>
                    </td>
                    <td className="small">{s.device || "—"}</td>
                    <td className="small">{s.location || "—"}</td>
                    <td className="small muted">{s.ip || "—"}</td>
                    <td className="small muted">{dateStr(s.last_seen_at)}</td>
                    <td>
                      <span className={`badge ${s.revoked ? "" : "badge-approved"}`}>
                        {s.revoked ? t("admin.revoked") : t("admin.active")}
                      </span>
                    </td>
                    <td style={{ textAlign: "end" }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteSession(s.id)}
                      >
                        {t("admin.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "visitors" && (
        <div className="card">
          <div className="card-title">
            <div>
              <h3 style={{ margin: 0 }}>{t("admin.visitors")}</h3>
              <span className="section-hint">{t("admin.visitorsHint")}</span>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("admin.fingerprint")}</th>
                  <th>{t("admin.user")}</th>
                  <th>{t("admin.device")}</th>
                  <th>{t("admin.location")}</th>
                  <th>{t("admin.evtCount")}</th>
                  <th>{t("admin.seen")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id}>
                    <td className="small muted" style={{ fontFamily: "monospace" }}>
                      {(v.fingerprint_hash || v.visitor_key).slice(0, 12)}…
                    </td>
                    <td className="small">{v.user_email || <span className="muted">—</span>}</td>
                    <td className="small">
                      {v.device || v.platform || "—"}
                      {v.is_bot && (
                        <span className="badge badge-rejected" style={{ marginInlineStart: 6 }}>
                          bot
                        </span>
                      )}
                      <div className="muted">{v.timezone || ""}</div>
                    </td>
                    <td className="small">{v.location || "—"}</td>
                    <td className="small">{v.event_count}</td>
                    <td className="small muted">{dateStr(v.last_seen)}</td>
                    <td style={{ textAlign: "end" }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={async () => {
                          if (!window.confirm(t("admin.deleteConfirm"))) return;
                          await api.deleteVisitor(v.id);
                          setVisitors((s) => s.filter((x) => x.id !== v.id));
                        }}
                      >
                        {t("admin.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "analytics" && analytics && (
        <>
          <div className="grid-stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="num">{analytics.total_visitors}</div>
              <div className="lbl">{t("an.visitors")}</div>
              <div className="sub">
                {analytics.identified} {t("an.identified")} · {analytics.anonymous}{" "}
                {t("an.anonymous")}
              </div>
            </div>
            <div className="stat">
              <div className="num">{analytics.pageviews}</div>
              <div className="lbl">{t("an.pageviews")}</div>
              <div className="sub">
                {analytics.events} {t("an.events")}
              </div>
            </div>
            <div className="stat">
              <div className="num">{analytics.new_devices}</div>
              <div className="lbl">{t("an.newDevices")}</div>
            </div>
            <div className="stat">
              <div className="num">{analytics.bots}</div>
              <div className="lbl">{t("an.bots")}</div>
            </div>
          </div>

          {analytics.total_visitors === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>{t("an.empty")}</p>
            </div>
          ) : (
            <>
              {/* AI insights */}
              <div className="card">
                <div className="card-title flex-between">
                  <div>
                    <h3 style={{ margin: 0 }}>🤖 {t("an.aiInsights")}</h3>
                    <span className="section-hint">{t("an.aiHint")}</span>
                  </div>
                  <button className="btn btn-sm" onClick={generateInsights} disabled={aiBusy}>
                    {aiBusy ? t("an.generating") : t("an.generate")}
                  </button>
                </div>
                {insights && (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{insights}</div>
                )}
              </div>

              <div className="row" style={{ marginBottom: 18 }}>
                <div className="card">
                  <div className="card-title"><h3>{t("an.overTime")}</h3></div>
                  <BarList data={analytics.timeseries} color="var(--brand)" />
                </div>
                <div className="card">
                  <div className="card-title"><h3>{t("an.byDevice")}</h3></div>
                  {analytics.by_device.length ? (
                    <Donut
                      data={analytics.by_device.map((d) => ({ label: d.label, value: d.value }))}
                      centerValue={String(analytics.total_visitors)}
                      centerLabel={t("an.visitors")}
                    />
                  ) : (
                    <p className="muted">{t("common.none")}</p>
                  )}
                </div>
              </div>

              <div className="row" style={{ marginBottom: 18 }}>
                <div className="card">
                  <div className="card-title"><h3>{t("an.byCountry")}</h3></div>
                  <BarList data={analytics.by_country} />
                </div>
                <div className="card">
                  <div className="card-title"><h3>{t("an.topPages")}</h3></div>
                  <BarList data={analytics.top_pages} color="var(--gold)" />
                </div>
              </div>

              <div className="row" style={{ marginBottom: 18 }}>
                <div className="card">
                  <div className="card-title"><h3>{t("an.topReferrers")}</h3></div>
                  {analytics.top_referrers.length ? (
                    <BarList data={analytics.top_referrers} />
                  ) : (
                    <p className="muted">{t("common.none")}</p>
                  )}
                </div>
                <div className="card">
                  <div className="card-title"><h3>{t("an.utm")}</h3></div>
                  {analytics.utm_sources.length ? (
                    <BarList data={analytics.utm_sources} color="var(--brand)" />
                  ) : (
                    <p className="muted">{t("common.none")}</p>
                  )}
                </div>
              </div>

              {/* Security alerts */}
              <div className="card">
                <div className="card-title"><h3>🛡️ {t("an.securityAlerts")}</h3></div>
                {analytics.security_alerts.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>{t("an.noAlerts")}</p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("admin.when")}</th>
                          <th>{t("admin.user")}</th>
                          <th>{t("admin.location")}</th>
                          <th>{t("admin.newDevice")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.security_alerts.map((s, i) => (
                          <tr key={i}>
                            <td className="small muted">{dateStr(s.when)}</td>
                            <td className="small">{s.user || "—"}</td>
                            <td className="small">{s.location || "—"}</td>
                            <td>
                              <span className="badge badge-changes_requested">
                                {t("admin.newDevice")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === "audit" && (
        <div className="card">
          <div className="card-title flex-between">
            <div>
              <h3 style={{ margin: 0 }}>
                {showApiLog ? t("admin.apiLog") : t("admin.events")}
              </h3>
              <span className="section-hint">{t("admin.auditHint")}</span>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowApiLog((v) => !v)}
              >
                {showApiLog ? t("admin.events") : t("admin.showApiLog")}
              </button>
              {showApiLog && (
                <button className="btn btn-danger btn-sm" onClick={clearApiLog}>
                  {t("admin.clearApiLog")}
                </button>
              )}
            </div>
          </div>

          {showApiLog ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("admin.when")}</th>
                    <th>{t("admin.actor")}</th>
                    <th>{t("admin.method")}</th>
                    <th>{t("admin.path")}</th>
                    <th>{t("admin.statusCode")}</th>
                    <th>{t("admin.latency")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="small muted">{dateStr(a.created_at)}</td>
                      <td className="small">{a.actor_email || "system"}</td>
                      <td className="small">{a.method || "—"}</td>
                      <td className="small muted">{a.path || "—"}</td>
                      <td className="small">
                        {a.status_code ? (
                          <span className={a.status_code >= 400 ? "sev-high" : "rec-approve"}>
                            {a.status_code}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="small muted">
                        {a.latency_ms != null ? `${a.latency_ms}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("admin.when")}</th>
                    <th>{t("admin.actor")}</th>
                    <th>{t("admin.summary")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                        {dateStr(a.created_at)}
                      </td>
                      <td className="small">
                        {a.actor_email || "system"}
                        {a.actor_role && (
                          <span className="pill" style={{ marginInlineStart: 6 }}>
                            {t(`role.${a.actor_role}`)}
                          </span>
                        )}
                      </td>
                      <td>{eventSummary(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "user.register": "registered a new organization account",
  "reviewer.create": "added a reviewer",
  "project.create": "created a project",
  "project.update": "updated a project",
  "project.submit": "submitted a project for review",
  "document.upload": "uploaded a document",
  "document.delete": "deleted a document",
  "document.malware_blocked": "⚠️ blocked a malicious file",
  "review.approve": "approved a project",
  "review.reject": "rejected a project",
  "review.request_changes": "requested changes",
  "payment.checkout": "started a payment",
  "session.revoke": "signed out a device",
  "session.revoke_others": "signed out other devices",
  "admin.session.delete": "deleted a login record",
  "admin.audit.clear": "cleared the API log",
};

function eventSummary(a: AuditEntry) {
  const label = ACTION_LABEL[a.action] || a.action.replace(/[._]/g, " ");
  const detail = a.detail as Record<string, unknown> | null | undefined;
  const name =
    (detail && (detail.filename || detail.organization || detail.device)) || "";
  return (
    <span>
      {label}
      {name ? <span className="muted"> — {String(name)}</span> : null}
    </span>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminInner />
    </RequireAuth>
  );
}
