"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n, fmtMoney, statusLabel } from "@/lib/i18n";
import type { ReviewerDashboard } from "@/lib/types";
import {
  RequireAuth,
  StatusBadge,
  PageHead,
  BarList,
  Donut,
  money,
} from "@/components/ui";

const STATUS_COLORS: Record<string, string> = {
  draft: "#64748b",
  submitted: "#2563eb",
  under_review: "#d97706",
  changes_requested: "#c2410c",
  approved: "#16a34a",
  rejected: "#dc2626",
};

function Dashboard() {
  const { t } = useI18n();
  const router = useRouter();
  const [d, setD] = useState<ReviewerDashboard | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.reviewerDashboard().then(setD).catch((e) => setErr(String(e.message)));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!d)
    return (
      <div className="center-page">
        <div className="spinner" />
      </div>
    );

  const statusData = Object.entries(d.by_status).map(([k, v]) => ({
    label: statusLabel(t, k),
    value: v,
    color: STATUS_COLORS[k],
  }));
  const catData = d.by_category.map((c) => ({
    label: c.category,
    value: c.count,
    sub: `${c.count} · ${money(c.total_budget, d.currency)}`,
  }));

  return (
    <>
      <PageHead title={t("rev.title")} sub={t("rev.subtitle")} />

      {/* KPI tiles */}
      <div className="grid-stats" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="num">{d.total_projects}</div>
          <div className="lbl">{t("rev.totalProjects")}</div>
        </div>
        <div className="stat">
          <div className="num">{d.pending_review}</div>
          <div className="lbl">{t("rev.pending")}</div>
        </div>
        <div className="stat">
          <div className="num">
            {d.approval_rate == null
              ? "—"
              : `${Math.round(d.approval_rate * 100)}%`}
          </div>
          <div className="lbl">{t("rev.approvalRate")}</div>
          <div className="sub">
            {d.decided} {t("rev.decided")}
          </div>
        </div>
        <div className="stat">
          <div className="num">{fmtMoney(t, d.total_requested_budget)}</div>
          <div className="lbl">{t("rev.requestedBudget")}</div>
          <div className="sub">
            {fmtMoney(t, d.approved_budget)} · {t("rev.approvedBudget")}
          </div>
        </div>
        <div className="stat">
          <div className="num">{d.avg_ai_score ?? "—"}</div>
          <div className="lbl">{t("rev.avgScore")}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-title">
            <h3>{t("rev.byStatus")}</h3>
          </div>
          <Donut
            data={statusData}
            centerValue={String(d.total_projects)}
            centerLabel={t("rev.totalProjects")}
          />
        </div>
        <div className="card">
          <div className="card-title">
            <h3>{t("rev.riskDist")}</h3>
          </div>
          <BarList
            data={[
              { label: t("ai.risks") + " · high", value: d.risk_distribution.high || 0 },
              { label: t("ai.risks") + " · medium", value: d.risk_distribution.medium || 0 },
              { label: t("ai.risks") + " · low", value: d.risk_distribution.low || 0 },
            ]}
          />
          <div className="section-hint" style={{ marginTop: 12 }}>
            {t("rev.aiScores")}
          </div>
          <BarList
            data={d.ai_score_buckets.map((b) => ({
              label: b.label,
              value: b.value,
            }))}
            color="var(--gold)"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t("rev.byCategory")}</h3>
        </div>
        {catData.length ? (
          <BarList data={catData} />
        ) : (
          <p className="muted">{t("common.none")}</p>
        )}
      </div>

      {/* Review queue */}
      <div className="card">
        <div className="card-title">
          <h3>{t("rev.queue")}</h3>
          <span className="pill">{d.queue.length}</span>
        </div>
        {d.queue.length === 0 ? (
          <p className="muted">{t("rev.queueEmpty")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("proj.title")}</th>
                  <th>{t("proj.category")}</th>
                  <th>{t("status.submitted")}</th>
                  <th>{t("proj.budget")}</th>
                  <th>{t("rev.aiScore")}</th>
                  <th>{t("ai.recommendation")}</th>
                </tr>
              </thead>
              <tbody>
                {d.queue.map((q) => (
                  <tr
                    key={q.id}
                    className="clickable"
                    onClick={() => router.push(`/projects/${q.id}`)}
                  >
                    <td>
                      <strong>{q.title}</strong>
                      <div className="small muted">{q.organization}</div>
                    </td>
                    <td>{q.category || t("common.none")}</td>
                    <td>
                      <StatusBadge status={q.status} />
                    </td>
                    <td>{money(q.requested_budget, q.currency)}</td>
                    <td>
                      {q.ai_score == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <ScoreRingMini score={q.ai_score} />
                      )}
                      {q.risk_high > 0 && (
                        <div className="small sev-high">
                          {q.risk_high} {t("rev.highRisks")}
                        </div>
                      )}
                    </td>
                    <td>
                      {q.ai_recommendation ? (
                        <span className={`rec-${q.ai_recommendation}`}>
                          {t(`review.${camel(q.ai_recommendation)}`)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
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

function camel(rec: string): string {
  return rec === "request_changes"
    ? "requestChanges"
    : rec === "approve"
      ? "approve"
      : "reject";
}

function ScoreRingMini({ score }: { score: number }) {
  const v = Math.round(score);
  const color = v >= 75 ? "#16a34a" : v >= 55 ? "#b88a2f" : v >= 40 ? "#d97706" : "#dc2626";
  return (
    <span style={{ fontWeight: 800, color }}>{v}</span>
  );
}

export default function ReviewerPage() {
  return (
    <RequireAuth roles={["reviewer", "admin"]}>
      <Dashboard />
    </RequireAuth>
  );
}
