"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { RequireAuth, ProjectRow } from "@/components/ui";

function ProjectsInner() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>My Projects</h1>
        <Link href="/projects/new" className="btn">
          + New Project
        </Link>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card">
          <p className="muted">
            No projects yet. Create your first project to get started.
          </p>
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

export default function ProjectsPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <ProjectsInner />
    </RequireAuth>
  );
}
