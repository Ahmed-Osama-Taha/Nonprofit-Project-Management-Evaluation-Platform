"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { RequireAuth, StatusBadge, money, num, dateStr } from "@/components/ui";
import { AIPanel } from "@/components/AIPanel";

const EDITABLE = ["draft", "changes_requested"];

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
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

  if (loading) return <p className="muted">Loading…</p>;
  if (err) return <div className="error">{err}</div>;
  if (!p) return null;

  const isOwner = user?.role === "organization" && p.organization.id === user.organization_id;
  const isReviewer = user?.role === "reviewer" || user?.role === "admin";
  const canEdit = isOwner && EDITABLE.includes(p.status);

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{p.title}</h1>
          <div className="small muted">
            {p.organization.name} · submitted {dateStr(p.submitted_at)}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>

      {msg && <div className="success-box">{msg}</div>}

      {/* AI panel visible to reviewers/admins */}
      {isReviewer && (
        <AIPanel
          projectId={p.id}
          analysis={p.ai_analysis}
          canRerun
          onRerun={load}
        />
      )}

      <div className="card">
        <h3>Project details</h3>
        <dl className="kv">
          <dt>Category</dt>
          <dd>{p.category || "—"}</dd>
          <dt>Location</dt>
          <dd>{p.location || "—"}</dd>
          <dt>Requested budget</dt>
          <dd>{money(p.requested_budget, p.currency)}</dd>
          <dt>Target beneficiaries</dt>
          <dd>{num(p.target_beneficiaries)}</dd>
          <dt>Duration</dt>
          <dd>{p.duration_months ? `${p.duration_months} months` : "—"}</dd>
        </dl>
        <Section title="Summary" body={p.summary} />
        <Section title="Problem statement" body={p.problem_statement} />
        <Section title="Goals" body={p.goals} />
        <Section title="KPIs" body={p.kpis} />
        <Section title="Beneficiaries" body={p.beneficiary_description} />
      </div>

      <Documents project={p} canEdit={!!canEdit} onChange={load} />

      {isOwner && <OwnerActions project={p} onChange={load} setMsg={setMsg} setErr={setErr} />}
      {canEdit && <EditForm project={p} onSaved={load} />}

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

function Documents({
  project,
  canEdit,
  onChange,
}: {
  project: Project;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      await api.uploadDocument(project.id, file);
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

  return (
    <div className="card">
      <div className="flex-between">
        <h3 style={{ margin: 0 }}>Attachments</h3>
        {canEdit && (
          <label className="btn btn-secondary btn-sm" style={{ margin: 0 }}>
            {busy ? "Uploading…" : "+ Upload file"}
            <input type="file" onChange={upload} style={{ display: "none" }} disabled={busy} />
          </label>
        )}
      </div>
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      {(project.documents?.length ?? 0) === 0 ? (
        <p className="muted small">No attachments.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {project.documents!.map((d) => (
            <div key={d.id} className="list-item flex-between">
              <div>
                <button className="btn-secondary btn btn-sm" onClick={() => download(d.id)}>
                  {d.filename}
                </button>
              </div>
              <span className="small muted">
                {d.content_type} · extraction: {d.extraction_status}
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
  const [busy, setBusy] = useState(false);
  const canSubmit = ["draft", "changes_requested"].includes(project.status);
  if (!canSubmit) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.submitProject(project.id);
      setMsg("Submitted for review. AI analysis is running in the background.");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex-between">
        <div>
          <strong>Ready to submit?</strong>
          <p className="small muted" style={{ margin: 0 }}>
            Problem statement and goals are required. Submitting locks editing
            until a reviewer responds.
          </p>
        </div>
        <button className="btn btn-success" onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </div>
  );
}

function EditForm({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: project.title,
    summary: project.summary || "",
    problem_statement: project.problem_statement || "",
    goals: project.goals || "",
    kpis: project.kpis || "",
    requested_budget: project.requested_budget?.toString() || "",
    target_beneficiaries: project.target_beneficiaries?.toString() || "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateProject(project.id, {
        title: form.title,
        summary: form.summary,
        problem_statement: form.problem_statement,
        goals: form.goals,
        kpis: form.kpis,
        requested_budget: form.requested_budget ? Number(form.requested_budget) : null,
        target_beneficiaries: form.target_beneficiaries
          ? Number(form.target_beneficiaries)
          : null,
      });
      setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (!open)
    return (
      <div className="card">
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          Edit project
        </button>
      </div>
    );

  return (
    <div className="card">
      <h3>Edit project</h3>
      <div className="field">
        <label>Title</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="field">
        <label>Summary</label>
        <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} />
      </div>
      <div className="field">
        <label>Problem statement</label>
        <textarea
          value={form.problem_statement}
          onChange={(e) => set("problem_statement", e.target.value)}
        />
      </div>
      <div className="field">
        <label>Goals</label>
        <textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} />
      </div>
      <div className="field">
        <label>KPIs</label>
        <textarea value={form.kpis} onChange={(e) => set("kpis", e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <label>Requested budget</label>
          <input
            type="number"
            value={form.requested_budget}
            onChange={(e) => set("requested_budget", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Target beneficiaries</label>
          <input
            type="number"
            value={form.target_beneficiaries}
            onChange={(e) => set("target_beneficiaries", e.target.value)}
          />
        </div>
      </div>
      <div className="flex">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Reviews({ project }: { project: Project }) {
  if (!project.reviews || project.reviews.length === 0) return null;
  return (
    <div className="card">
      <h3>Review history</h3>
      {project.reviews.map((r) => (
        <div key={r.id} className="list-item">
          <div className="flex-between">
            <strong>{r.reviewer.full_name}</strong>
            <span className={`badge badge-${decisionBadge(r.decision)}`}>
              {r.decision.replace("_", " ")}
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

function ReviewActions({ project, onChange }: { project: Project; onChange: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const decided = ["approved", "rejected"].includes(project.status);
  const notSubmitted = project.status === "draft";

  async function act(decision: "comment" | "request_changes" | "approve" | "reject") {
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

  if (notSubmitted)
    return (
      <div className="card">
        <p className="muted">This project has not been submitted yet.</p>
      </div>
    );

  if (decided)
    return (
      <div className="card">
        <p className="muted">
          Final decision recorded: <StatusBadge status={project.status} />
        </p>
      </div>
    );

  return (
    <div className="card">
      <h3>Reviewer decision</h3>
      <p className="small muted">
        The reviewer makes the final call. AI output above is advisory.
      </p>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label>Comment (required for request-changes / reject)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="chip-row">
        <button className="btn btn-secondary" onClick={() => act("comment")} disabled={busy}>
          Add comment
        </button>
        <button className="btn btn-warning" onClick={() => act("request_changes")} disabled={busy}>
          Request changes
        </button>
        <button className="btn btn-success" onClick={() => act("approve")} disabled={busy}>
          Approve
        </button>
        <button className="btn btn-danger" onClick={() => act("reject")} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

function ChatBox({ projectId }: { projectId: string }) {
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
      const res = await api.chat(projectId, q);
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
      <h3>Ask the documents (RAG)</h3>
      <p className="small muted">
        Grounded Q&A over this project&apos;s attachments and application data.
      </p>
      {err && <div className="error">{err}</div>}
      <div className="flex">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. What is the cost per beneficiary?"
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="btn" onClick={ask} disabled={busy}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {answer && (
        <div style={{ marginTop: 12 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          {sources.length > 0 && (
            <details>
              <summary className="small muted">{sources.length} source excerpt(s)</summary>
              {sources.map((s, i) => (
                <p key={i} className="small muted" style={{ borderLeft: "3px solid #e5e7eb", paddingLeft: 8 }}>
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
