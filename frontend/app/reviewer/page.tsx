"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { RequireAuth, ProjectRow } from "@/components/ui";

const STATUSES = [
  "",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
];

function ReviewerInner() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  function load() {
    setLoading(true);
    api
      .listProjects({ status: status || undefined, q: q || undefined })
      .then(setProjects)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <>
      <h1>Review Queue</h1>
      <div className="card">
        <div className="flex" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Search title or summary…"
            />
          </div>
          <div style={{ width: 220 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s ? s.replace("_", " ") : "Active queue (default)"}
                </option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button className="btn btn-secondary" onClick={load}>
              Apply
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card">
          <p className="muted">No projects match.</p>
        </div>
      ) : (
        <div className="card">
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} href={`/projects/${p.id}`} />
          ))}
        </div>
      )}
    </>
  );
}

export default function ReviewerPage() {
  return (
    <RequireAuth roles={["reviewer", "admin"]}>
      <ReviewerInner />
    </RequireAuth>
  );
}
