"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Profile } from "@/lib/types";
import { Skeleton } from "@/components/ui";

type Sev = "high" | "medium" | "info";

/** Turn a raw risk-signal code into a human-readable, severity-tagged message. */
function describeSignal(code: string, t: (k: string) => string): { text: string; severity: Sev } {
  const [key, arg] = code.split(":");
  const a = arg || "";
  switch (key) {
    case "impossible_travel":
      return { text: `${t("sig.impossible")}: ${a.replace("->", " → ")}`, severity: "high" };
    case "location_mismatch":
      return { text: `${t("sig.mismatch")} (${a.replace("!=", " ≠ ")})`, severity: "high" };
    case "multiple_countries":
      return { text: `${t("sig.countries")}: ${a}`, severity: "high" };
    case "high_velocity":
      return { text: `${t("sig.velocity")}: ${a}`, severity: "medium" };
    case "new_device_logins":
      return { text: `${a} ${t("sig.newdev")}`, severity: "medium" };
    case "bot_device":
      return { text: t("sig.bot"), severity: "medium" };
    case "many_devices":
      return { text: `${a} ${t("sig.manydev")}`, severity: "medium" };
    default:
      return { text: t("sig.none"), severity: "info" };
  }
}

function dt(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Enterprise-style slide-over 360° identity profile. Open with either a
 *  visitorId (from the Visitors tab) or a userId (from the Logins tab). */
export function VisitorProfile({
  visitorId,
  userId,
  onClose,
  onErased,
}: {
  visitorId?: string;
  userId?: string;
  onClose: () => void;
  onErased?: () => void;
}) {
  const { t } = useI18n();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = userId ? api.profileByUser(userId) : api.profile(visitorId!);
    load.then(setP).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [visitorId, userId]);

  function exportJson() {
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `identity-${p.visitor_id || p.user_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function erase() {
    if (!p || !p.visitor_id) return;
    if (!window.confirm(t("prof.eraseConfirm"))) return;
    await api.eraseIdentity(p.visitor_id);
    onErased?.();
    onClose();
  }

  const riskClass =
    p?.risk_level === "high"
      ? "risk-high"
      : p?.risk_level === "medium"
        ? "risk-medium"
        : "risk-low";

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("prof.title")}</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {t("admin.close")}
          </button>
        </div>

        {err && <div className="error">{err}</div>}
        {!p ? (
          <div className="stack" style={{ gap: 10 }}>
            <Skeleton h={64} />
            <Skeleton h={40} />
            <Skeleton h={120} />
          </div>
        ) : (
          <div className="drawer-body">
            {/* Identity header + risk */}
            <div className="prof-id">
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {p.is_identified ? p.user_name || p.user_email : t("prof.anonymous")}
                </div>
                <div className="small muted">
                  {p.is_identified ? p.user_email : p.visitor_id.slice(0, 16) + "…"}
                  {p.role && <span className="pill" style={{ marginInlineStart: 6 }}>{t(`role.${p.role}`)}</span>}
                </div>
                {p.organization && <div className="small muted">{p.organization}</div>}
              </div>
              <div className={`risk-badge ${riskClass}`}>
                {t("prof.risk")}: {t(`prof.risk.${p.risk_level}`)}
              </div>
            </div>

            {/* Risk signals — readable, severity-coloured */}
            <div className="prof-signals">
              {p.risk_signals.map((s) => {
                const d = describeSignal(s, t);
                return (
                  <div key={s} className={`sig-row sig-${d.severity}`}>
                    <span>{d.severity === "info" ? "✓" : "⚠️"}</span>
                    <span>{d.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Overview */}
            <dl className="kv" style={{ margin: "14px 0" }}>
              <dt>{t("prof.firstSeen")}</dt>
              <dd>{dt(p.first_seen)}</dd>
              <dt>{t("prof.lastSeen")}</dt>
              <dd>{dt(p.last_seen)}</dd>
              <dt>{t("admin.location")}</dt>
              <dd>{p.location || "—"}</dd>
              <dt>{t("prof.referrer")}</dt>
              <dd className="small">{p.first_referrer || "—"}</dd>
            </dl>

            {/* Devices */}
            <h3 className="prof-h">{t("prof.devices")} · {p.devices.length}</h3>
            <div className="stack" style={{ gap: 6 }}>
              {p.devices.map((d) => (
                <div key={d.id} className="prof-row">
                  <span>
                    {d.device || d.platform || "—"}
                    {d.is_bot && <span className="badge badge-rejected" style={{ marginInlineStart: 6 }}>bot</span>}
                  </span>
                  <span className="small muted">{d.location || "—"} · {dt(d.last_seen)}</span>
                </div>
              ))}
            </div>

            {/* Sessions */}
            <h3 className="prof-h">{t("prof.sessions")} · {p.sessions.length}</h3>
            {p.sessions.length === 0 ? (
              <p className="muted small">—</p>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {p.sessions.map((s) => (
                  <div key={s.id} className="prof-row">
                    <span>
                      {s.device || "—"}
                      {s.revoked ? (
                        <span className="badge" style={{ marginInlineStart: 6 }}>{t("admin.revoked")}</span>
                      ) : (
                        <span className="badge badge-approved" style={{ marginInlineStart: 6 }}>{t("admin.active")}</span>
                      )}
                    </span>
                    <span className="small muted">{s.location || "—"} · {dt(s.last_seen_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Activity timeline */}
            <h3 className="prof-h">{t("prof.activity")}</h3>
            {p.events.length === 0 ? (
              <p className="muted small">{t("prof.noEvents")}</p>
            ) : (
              <div className="timeline">
                {p.events.map((e) => (
                  <div key={e.id} className="tl-row">
                    <span className="tl-dot" />
                    <span className="tl-type">{e.type}</span>
                    <span className="small muted tl-url">{e.url || ""}</span>
                    <span className="small muted">{dt(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* DSAR actions */}
            <div className="flex" style={{ gap: 8, marginTop: 18 }}>
              <button className="btn btn-secondary btn-sm" onClick={exportJson}>
                {t("prof.export")}
              </button>
              {p.visitor_id && (
                <button className="btn btn-danger btn-sm" onClick={erase}>
                  {t("prof.erase")}
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
