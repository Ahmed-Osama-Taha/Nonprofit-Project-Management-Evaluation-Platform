"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useI18n, fmtMoney } from "@/lib/i18n";
import {
  RequireAuth,
  StatusBadge,
  PageHead,
  ProjectFlow,
  num,
  dateStr,
} from "@/components/ui";
import { AIPanel } from "@/components/AIPanel";
import Link from "next/link";

const EDITABLE = ["draft", "changes_requested"];

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const [p, setP] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setP(await api.getProject(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-update the AI analysis: while it's processing (worker running), poll
  // every 4s so the result appears without a manual page refresh.
  useEffect(() => {
    if (p?.ai_analysis?.status !== "processing") return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [p?.ai_analysis?.status, load]);

  if (loading)
    return (
      <div className="center-page">
        <div className="spinner" />
      </div>
    );
  if (err) return <div className="error">{err}</div>;
  if (!p) return null;

  const isOwner =
    user?.role === "organization" && p.organization.id === user.organization_id;
  const isReviewer = user?.role === "reviewer" || user?.role === "admin";
  const canEdit = isOwner && EDITABLE.includes(p.status);

  return (
    <>
      {isReviewer && (
        <Link href="/reviewer" className="nav-link" style={{ display: "inline-block", marginBottom: 10 }}>
          {t("flow.backToQueue")}
        </Link>
      )}

      <PageHead
        title={p.title}
        sub={`${p.organization.name}${p.submitted_at ? " · " + dateStr(p.submitted_at) : ""}`}
        action={<StatusBadge status={p.status} />}
      />

      <ProjectFlow status={p.status} />

      {msg && <div className="success-box">{msg}</div>}

      {isOwner && <OwnerStatusBanner status={p.status} />}

      {isReviewer && (
        <AIPanel projectId={p.id} analysis={p.ai_analysis} canRerun onRerun={load} />
      )}

      <DetailsCard project={p} canEdit={!!canEdit} onSaved={load} />

      <Documents project={p} canEdit={!!canEdit} onChange={load} />

      {isOwner && (
        <OwnerActions project={p} onChange={load} setMsg={setMsg} setErr={setErr} />
      )}

      <Reviews project={p} />

      {isReviewer && <ReviewActions project={p} onChange={load} />}
      {isReviewer && <ChatBox projectId={p.id} />}
    </>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <strong>{title}</strong>
      <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{body}</p>
    </div>
  );
}

/** Contextual status message for the owner on non-editable states. */
function OwnerStatusBanner({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { cls: string; key: string }> = {
    submitted: { cls: "info-box", key: "flow.awaiting" },
    under_review: { cls: "info-box", key: "flow.inReview" },
    changes_requested: { cls: "warn-box", key: "flow.changes" },
    approved: { cls: "success-box", key: "flow.approved" },
    rejected: { cls: "error", key: "flow.rejected" },
  };
  const m = map[status];
  if (!m) return null;
  return <div className={m.cls} style={{ marginBottom: 14 }}>{t(m.key)}</div>;
}

function Documents({
  project,
  canEdit,
  onChange,
}: {
  project: Project;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr("");
    try {
      for (const file of files) {
        await api.uploadDocument(project.id, file);
      }
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function download(docId: string) {
    const { url } = await api.downloadDocument(project.id, docId);
    window.open(url, "_blank");
  }

  async function remove(docId: string) {
    setErr("");
    try {
      await api.deleteDocument(project.id, docId);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{t("proj.documents")}</h3>
        {canEdit && (
          <label className="btn btn-secondary btn-sm" style={{ margin: 0 }}>
            {busy ? t("common.loading") : `+ ${t("proj.upload")}`}
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv"
              onChange={upload}
              style={{ display: "none" }}
              disabled={busy}
            />
          </label>
        )}
      </div>
      {canEdit && (
        <p className="small muted" style={{ marginTop: 6 }}>
          PDF · DOCX · TXT · MD · CSV — up to 20 MB each. You can add several.
        </p>
      )}
      {err && (
        <div className="error" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
      {(project.documents?.length ?? 0) === 0 ? (
        <p className="muted small">{t("common.none")}</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {project.documents!.map((d) => (
            <div key={d.id} className="list-item flex-between">
              <button
                className="btn-secondary btn btn-sm"
                onClick={() => download(d.id)}
              >
                {d.filename}
              </button>
              <span className="flex" style={{ gap: 10, alignItems: "center" }}>
                <span className="small muted">
                  {d.content_type} · {d.extraction_status}
                </span>
                {canEdit && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => remove(d.id)}
                    disabled={busy}
                    aria-label="Delete document"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerActions({
  project,
  onChange,
  setMsg,
  setErr,
}: {
  project: Project;
  onChange: () => void;
  setMsg: (s: string) => void;
  setErr: (s: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canSubmit = ["draft", "changes_requested"].includes(project.status);
  if (!canSubmit) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.submitProject(project.id);
      setMsg("✓");
      onChange();
    } catch (e) {
      // 402 = payment required (Model A). Send the user to the checkout screen
      // where they see the price + VAT and choose how to pay — never redirect
      // straight to a gateway without showing the amount.
      if (e instanceof ApiError && e.status === 402) {
        router.push(`/projects/${project.id}/checkout`);
        return;
      }
      setErr(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  const detailsDone = !!(project.problem_statement && project.goals);
  const docsDone = (project.documents?.length ?? 0) > 0;

  const Item = ({ done, title, hint }: { done: boolean; title: string; hint: string }) => (
    <div className={`next-item${done ? " done" : ""}`}>
      <span className="tick">{done ? "✓" : ""}</span>
      <span>
        <span className="ni-title">{title}</span>
        <div className="ni-hint">{hint}</div>
      </span>
    </div>
  );

  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{t("flow.next")}</h3>
      </div>
      <div className="next-step" style={{ marginBottom: 16 }}>
        <Item done={detailsDone} title={t("flow.stepDetails")} hint={t("flow.detailsHint")} />
        <Item done={docsDone} title={t("flow.stepDocs")} hint={t("flow.docsHint")} />
        <Item done={false} title={t("flow.stepSubmit")} hint={t("flow.submitHint")} />
      </div>
      <button
        className="btn btn-success"
        onClick={submit}
        disabled={busy || !detailsDone}
        title={!detailsDone ? t("flow.detailsHint") : undefined}
      >
        {busy ? t("common.loading") : t("proj.submitConfirm")}
      </button>
    </div>
  );
}

/** Single source of truth for the project's details: read-only view with an
 *  inline "Edit details" toggle (owners, while editable). No more duplicate
 *  read-only + separate edit-form cards. */
function DetailsCard({
  project,
  canEdit,
  onSaved,
}: {
  project: Project;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditForm
        project={project}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="card">
      <div className="card-title flex-between">
        <h3 style={{ margin: 0 }}>{t("common.viewDetails")}</h3>
        {canEdit && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            ✎ {t("flow.edit")}
          </button>
        )}
      </div>
      <dl className="kv">
        <dt>{t("proj.category")}</dt>
        <dd>{project.category || t("common.none")}</dd>
        <dt>{t("proj.location")}</dt>
        <dd>{project.location || t("common.none")}</dd>
        <dt>{t("proj.budget")}</dt>
        <dd>{fmtMoney(t, project.requested_budget)}</dd>
        <dt>{t("proj.targetBeneficiaries")}</dt>
        <dd>{num(project.target_beneficiaries)}</dd>
        <dt>{t("proj.duration")}</dt>
        <dd>
          {project.duration_months
            ? `${project.duration_months} ${t("common.months")}`
            : t("common.none")}
        </dd>
      </dl>
      <Section title={t("proj.summary")} body={project.summary} />
      <Section title={t("proj.problem")} body={project.problem_statement} />
      <Section title={t("proj.goals")} body={project.goals} />
      <Section title={t("proj.kpis")} body={project.kpis} />
      <Section title={t("proj.beneficiaryDesc")} body={project.beneficiary_description} />
    </div>
  );
}

function EditForm({
  project,
  onSaved,
  onCancel,
}: {
  project: Project;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: project.title,
    summary: project.summary || "",
    category: project.category || "",
    location: project.location || "",
    problem_statement: project.problem_statement || "",
    goals: project.goals || "",
    kpis: project.kpis || "",
    beneficiary_description: project.beneficiary_description || "",
    requested_budget: project.requested_budget?.toString() || "",
    currency: project.currency || "SAR",
    duration_months: project.duration_months?.toString() || "",
    target_beneficiaries: project.target_beneficiaries?.toString() || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api.updateProject(project.id, {
        title: form.title,
        summary: form.summary,
        category: form.category || null,
        location: form.location || null,
        problem_statement: form.problem_statement,
        goals: form.goals,
        kpis: form.kpis,
        beneficiary_description: form.beneficiary_description || null,
        requested_budget: form.requested_budget
          ? Number(form.requested_budget)
          : null,
        currency: form.currency || "SAR",
        duration_months: form.duration_months
          ? Number(form.duration_months)
          : null,
        target_beneficiaries: form.target_beneficiaries
          ? Number(form.target_beneficiaries)
          : null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>✎ {t("flow.edit")}</h3>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label>{t("proj.title")}</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <label>{t("proj.category")}</label>
          <input
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </div>
        <div className="field">
          <label>{t("proj.location")}</label>
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>{t("proj.summary")}</label>
        <textarea
          value={form.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </div>
      <div className="field">
        <label>{t("proj.problem")}</label>
        <textarea
          value={form.problem_statement}
          onChange={(e) => set("problem_statement", e.target.value)}
        />
      </div>
      <div className="field">
        <label>{t("proj.goals")}</label>
        <textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} />
      </div>
      <div className="field">
        <label>{t("proj.kpis")}</label>
        <textarea value={form.kpis} onChange={(e) => set("kpis", e.target.value)} />
      </div>
      <div className="field">
        <label>{t("proj.beneficiaryDesc")}</label>
        <textarea
          value={form.beneficiary_description}
          onChange={(e) => set("beneficiary_description", e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field">
          <label>{t("proj.budget")}</label>
          <input
            type="number"
            value={form.requested_budget}
            onChange={(e) => set("requested_budget", e.target.value)}
          />
        </div>
        <div className="field">
          <label>{t("proj.currency")}</label>
          <input
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
          />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t("proj.duration")}</label>
          <input
            type="number"
            value={form.duration_months}
            onChange={(e) => set("duration_months", e.target.value)}
          />
        </div>
        <div className="field">
          <label>{t("proj.targetBeneficiaries")}</label>
          <input
            type="number"
            value={form.target_beneficiaries}
            onChange={(e) => set("target_beneficiaries", e.target.value)}
          />
        </div>
      </div>
      <div className="flex">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? t("common.loading") : t("common.save")}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function Reviews({ project }: { project: Project }) {
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

function decisionBadge(d: string) {
  if (d === "approve") return "approved";
  if (d === "reject") return "rejected";
  if (d === "request_changes") return "changes_requested";
  return "submitted";
}

function ReviewActions({
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
    decision: "comment" | "request_changes" | "approve" | "reject",
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
        <button
          className="btn btn-secondary"
          onClick={() => act("comment")}
          disabled={busy}
        >
          {t("review.comment")}
        </button>
        <button
          className="btn btn-warning"
          onClick={() => act("request_changes")}
          disabled={busy}
        >
          {t("review.requestChanges")}
        </button>
        <button
          className="btn btn-success"
          onClick={() => act("approve")}
          disabled={busy}
        >
          {t("review.approve")}
        </button>
        <button
          className="btn btn-danger"
          onClick={() => act("reject")}
          disabled={busy}
        >
          {t("review.reject")}
        </button>
      </div>
    </div>
  );
}

function ChatBox({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setErr("");
    setAnswer("");
    try {
      const res = await api.chat(projectId, q, lang);
      setAnswer(res.answer);
      setSources(res.sources);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{t("ai.ask")}</h3>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="flex">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ai.askPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="btn" onClick={ask} disabled={busy}>
          {busy ? "…" : t("ai.ask")}
        </button>
      </div>
      {answer && (
        <div style={{ marginTop: 12 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          {sources.length > 0 && (
            <details>
              <summary className="small muted">{sources.length}</summary>
              {sources.map((s, i) => (
                <p
                  key={i}
                  className="small muted"
                  style={{
                    borderInlineStart: "3px solid var(--border)",
                    paddingInlineStart: 8,
                  }}
                >
                  {s.slice(0, 300)}…
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <RequireAuth>
      <Detail />
    </RequireAuth>
  );
}
