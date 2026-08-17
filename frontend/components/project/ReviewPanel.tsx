"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { StatusBadge, dateStr } from "@/components/ui";

function decisionBadge(d: string) {
  if (d === "approve") return "approved";
  if (d === "reject") return "rejected";
  if (d === "request_changes") return "changes_requested";
  return "submitted";
}

/** Read-only history of reviewer decisions on a project. */
export function Reviews({ project }: { project: Project }) {
  const { t } = useI18n();
  if (!project.reviews || project.reviews.length === 0) return null;
  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{t("proj.reviews")}</h3>
      </div>
      {project.reviews.map((r) => (
        <div key={r.id} className="list-item">
          <div className="flex-between">
            <strong>{r.reviewer.full_name}</strong>
            <span className={`badge badge-${decisionBadge(r.decision)}`}>
              {t(`status.${decisionBadge(r.decision)}`)}
            </span>
          </div>
          {r.comment && <p style={{ margin: "6px 0 0" }}>{r.comment}</p>}
          <div className="small muted">{dateStr(r.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

/** Reviewer decision controls (comment / request changes / approve / reject). */
export function ReviewActions({
  project,
  onChange,
}: {
  project: Project;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const decided = ["approved", "rejected"].includes(project.status);
  const notSubmitted = project.status === "draft";

  async function act(
    decision: "comment" | "request_changes" | "approve" | "reject"
  ) {
    setBusy(true);
    setErr("");
    try {
      await api.createReview(project.id, decision, comment || undefined);
      setComment("");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (notSubmitted) return null;

  if (decided)
    return (
      <div className="card">
        <p className="muted flex">
          {t("review.decision")}: <StatusBadge status={project.status} />
        </p>
      </div>
    );

  return (
    <div className="card">
      <div className="card-title">
        <div>
          <h3 style={{ margin: 0 }}>{t("review.decision")}</h3>
          <span className="section-hint">{t("ai.subtitle")}</span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label>{t("review.comment")}</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("review.addComment")}
        />
      </div>
      <div className="chip-row">
        <button className="btn btn-secondary" onClick={() => act("comment")} disabled={busy}>
          {t("review.comment")}
        </button>
        <button className="btn btn-warning" onClick={() => act("request_changes")} disabled={busy}>
          {t("review.requestChanges")}
        </button>
        <button className="btn btn-success" onClick={() => act("approve")} disabled={busy}>
          {t("review.approve")}
        </button>
        <button className="btn btn-danger" onClick={() => act("reject")} disabled={busy}>
          {t("review.reject")}
        </button>
      </div>
    </div>
  );
}
