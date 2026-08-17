"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { SessionInfo } from "@/lib/types";
import { RequireAuth, PageHead, EmptyState, Skeleton } from "@/components/ui";

function dateTime(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviceIcon(device?: string | null) {
  const d = (device || "").toLowerCase();
  if (d.includes("ios") || d.includes("android") || d.includes("ipad")) return "📱";
  if (d.includes("claude")) return "🤖";
  if (d.includes("api") || d.includes("curl") || d.includes("postman")) return "🔌";
  return "💻";
}

function AccountInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .sessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string) {
    if (!window.confirm(t("acct.revokeConfirm"))) return;
    setBusy(id);
    try {
      await api.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy("others");
    try {
      await api.revokeOtherSessions();
      setSessions((s) => s.filter((x) => x.current));
    } finally {
      setBusy(null);
    }
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      <PageHead title={t("acct.title")} />

      {/* Profile summary */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{t("acct.profile")}</h2>
        <dl className="kv" style={{ marginBottom: 0 }}>
          <dt>{user?.full_name}</dt>
          <dd>
            {user?.email} · <span className="pill">{t(`role.${user?.role}`)}</span>
          </dd>
          {user?.organization?.name && (
            <>
              <dt>{user.organization.name}</dt>
              <dd className="muted">{user.organization.country || "—"}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Active sessions */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("acct.sessions")}</h2>
          {others > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={revokeOthers}
              disabled={busy === "others"}
            >
              {t("acct.signOutOthers")}
            </button>
          )}
        </div>
        <p className="section-hint" style={{ marginTop: 0 }}>
          {t("acct.sessionsHint")}
        </p>

        {loading ? (
          <div className="stack" style={{ gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} h={44} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon="🔐" title={t("acct.noSessions")} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("acct.device")}</th>
                  <th>{t("acct.location")}</th>
                  <th>{t("acct.created")}</th>
                  <th>{t("acct.lastSeen")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ marginInlineEnd: 8 }}>{deviceIcon(s.device)}</span>
                      {s.device || "—"}
                      {s.current && (
                        <span className="badge badge-approved" style={{ marginInlineStart: 8 }}>
                          {t("acct.current")}
                        </span>
                      )}
                    </td>
                    <td>
                      {s.location || "—"}
                      {s.ip && <div className="small muted">{s.ip}</div>}
                    </td>
                    <td className="small">{dateTime(s.created_at)}</td>
                    <td className="small">{dateTime(s.last_seen_at)}</td>
                    <td style={{ textAlign: "end" }}>
                      {!s.current && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => revoke(s.id)}
                          disabled={busy === s.id}
                        >
                          {t("acct.signOut")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountInner />
    </RequireAuth>
  );
}
