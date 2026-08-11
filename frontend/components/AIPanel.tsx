"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AIAnalysis } from "@/lib/types";
import { ScoreRing } from "@/components/ui";

export function AIPanel({
  projectId,
  analysis,
  canRerun,
  onRerun,
}: {
  projectId: string;
  analysis?: AIAnalysis | null;
  canRerun?: boolean;
  onRerun?: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function rerun() {
    setBusy(true);
    setErr("");
    try {
      await api.analyzeProject(projectId);
      onRerun?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const rec = analysis?.preliminary_recommendation;

  return (
    <div className="card">
      <div className="card-title">
        <div>
          <h3 style={{ margin: 0 }}>✦ {t("ai.title")}</h3>
          <span className="section-hint">{t("ai.subtitle")}</span>
        </div>
        {canRerun && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={rerun}
            disabled={busy}
          >
            {busy ? t("common.loading") : t("proj.runAnalysis")}
          </button>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      {!analysis && <p className="muted">{t("ai.notRun")}</p>}
      {analysis?.status === "processing" && (
        <p className="muted">{t("common.loading")}</p>
      )}
      {analysis?.status === "failed" && (
        <div className="error">
          {analysis.error?.toLowerCase().includes("key")
            ? t("ai.disabled")
            : `${analysis.error || "error"}`}
        </div>
      )}

      {analysis?.status === "completed" && (
        <div className="stack" style={{ gap: 18 }}>
          <div className="flex wrap" style={{ gap: 24, alignItems: "center" }}>
            <ScoreRing
              score={analysis.preliminary_score}
              caption={t("ai.readiness")}
            />
            <div className="stack" style={{ gap: 6 }}>
              <div>
                <span className="section-hint">{t("ai.recommendation")}: </span>
                {rec ? (
                  <span className={`rec-${rec}`}>
                    {t(
                      `review.${
                        rec === "request_changes"
                          ? "requestChanges"
                          : rec === "approve"
                            ? "approve"
                            : "reject"
                      }`,
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              {analysis.category && (
                <div>
                  <span className="section-hint">{t("proj.category")}: </span>
                  <span className="pill">{analysis.category}</span>
                </div>
              )}
              {analysis.recommendation_rationale && (
                <p className="small muted" style={{ margin: 0, maxWidth: "60ch" }}>
                  {analysis.recommendation_rationale}
                </p>
              )}
            </div>
          </div>

          {analysis.summary && (
            <div>
              <strong>{t("ai.summary")}</strong>
              <p style={{ marginTop: 4 }}>{analysis.summary}</p>
            </div>
          )}

          {analysis.criteria && analysis.criteria.length > 0 && (
            <div>
              <strong>{t("ai.scorecard")}</strong>
              <div style={{ marginTop: 10 }}>
                {analysis.criteria.map((c, i) => (
                  <div key={i} className="crit-row">
                    <div className="crit-head">
                      <span>{c.name}</span>
                      <strong>{Math.round(c.score)}</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                      />
                    </div>
                    {c.rationale && (
                      <div className="small muted" style={{ marginTop: 3 }}>
                        {c.rationale}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row">
            {analysis.strengths && analysis.strengths.length > 0 && (
              <div>
                <strong>{t("ai.strengths")}</strong>
                <ul style={{ marginTop: 4 }}>
                  {analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.risks && analysis.risks.length > 0 && (
              <div>
                <strong>{t("ai.risks")}</strong>
                <ul style={{ marginTop: 4 }}>
                  {analysis.risks.map((r, i) => (
                    <li key={i}>
                      <span className={`sev-${r.severity}`}>[{r.severity}]</span>{" "}
                      <strong>{r.title}</strong> — {r.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="row">
            {analysis.missing_information &&
              analysis.missing_information.length > 0 && (
                <div>
                  <strong>{t("ai.missing")}</strong>
                  <ul style={{ marginTop: 4 }}>
                    {analysis.missing_information.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            {analysis.suggested_questions &&
              analysis.suggested_questions.length > 0 && (
                <div>
                  <strong>{t("ai.questions")}</strong>
                  <ul style={{ marginTop: 4 }}>
                    {analysis.suggested_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>

          {analysis.model && (
            <p className="small muted">
              {t("ai.model")}: {analysis.model}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
