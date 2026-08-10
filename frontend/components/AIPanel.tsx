"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AIAnalysis } from "@/lib/types";

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
    <div className="card" style={{ borderColor: "#c7d2fe" }}>
      <div className="flex-between">
        <h3 style={{ margin: 0 }}>🤖 AI Pre-Analysis</h3>
        {canRerun && (
          <button className="btn btn-secondary btn-sm" onClick={rerun} disabled={busy}>
            {busy ? "Analyzing…" : "Run / Re-run"}
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Advisory only — the final decision is made by a human reviewer.
      </p>

      {err && <div className="error">{err}</div>}

      {!analysis && <p className="muted">No analysis yet.</p>}

      {analysis?.status === "processing" && (
        <p className="muted">Analysis in progress… refresh in a moment.</p>
      )}
      {analysis?.status === "pending" && <p className="muted">Queued.</p>}
      {analysis?.status === "failed" && (
        <div className="error">
          Analysis failed: {analysis.error || "unknown error"}
          {canRerun && " — check that the AI API key is configured, then re-run."}
        </div>
      )}

      {analysis?.status === "completed" && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="flex" style={{ gap: 20, alignItems: "flex-start" }}>
            <div>
              <div className="lbl small muted">Preliminary score</div>
              <div className="score-ring">
                {analysis.preliminary_score ?? "—"}
                <span style={{ fontSize: 14, color: "var(--muted)" }}>/100</span>
              </div>
            </div>
            <div>
              <div className="lbl small muted">AI recommendation</div>
              <div>
                {rec ? (
                  <span
                    className={`badge badge-${
                      rec === "approve"
                        ? "approved"
                        : rec === "reject"
                          ? "rejected"
                          : "changes_requested"
                    }`}
                  >
                    {rec.replace("_", " ")}
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <div className="lbl small muted">Category</div>
              <div>{analysis.category || "—"}</div>
            </div>
          </div>

          {analysis.summary && (
            <div>
              <strong>Summary</strong>
              <p style={{ marginTop: 4 }}>{analysis.summary}</p>
            </div>
          )}

          {analysis.risks && analysis.risks.length > 0 && (
            <div>
              <strong>Risk flags</strong>
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

          {analysis.missing_information && analysis.missing_information.length > 0 && (
            <div>
              <strong>Missing information</strong>
              <ul style={{ marginTop: 4 }}>
                {analysis.missing_information.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.suggested_questions && analysis.suggested_questions.length > 0 && (
            <div>
              <strong>Suggested questions for the applicant</strong>
              <ul style={{ marginTop: 4 }}>
                {analysis.suggested_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.model && (
            <p className="small muted">Model: {analysis.model}</p>
          )}
        </div>
      )}
    </div>
  );
}
