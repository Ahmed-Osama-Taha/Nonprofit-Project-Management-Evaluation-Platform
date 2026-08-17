"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import {
  RequireAuth,
  PageHead,
  ProjectCard,
  ProjectCardSkeleton,
  EmptyState,
} from "@/components/ui";

type Tab = "all" | "draft" | "active" | "decided";

const IN_TAB: Record<Exclude<Tab, "all">, string[]> = {
  draft: ["draft", "changes_requested"],
  active: ["submitted", "under_review"],
  decided: ["approved", "rejected"],
};

function ProjectsInner() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: projects.length, draft: 0, active: 0, decided: 0 };
    for (const p of projects) {
      if (IN_TAB.draft.includes(p.status)) c.draft++;
      else if (IN_TAB.active.includes(p.status)) c.active++;
      else if (IN_TAB.decided.includes(p.status)) c.decided++;
    }
    return c;
  }, [projects]);

  const filtered = useMemo(
    () =>
      tab === "all"
        ? projects
        : projects.filter((p) => IN_TAB[tab].includes(p.status)),
    [projects, tab]
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: t("proj.all"), count: counts.all },
    { id: "draft", label: t("proj.drafts"), count: counts.draft },
    { id: "active", label: t("proj.active"), count: counts.active },
    { id: "decided", label: t("proj.decided"), count: counts.decided },
  ];

  return (
    <>
      <PageHead
        title={t("proj.myProjects")}
        action={
          <Link href="/projects/new" className="btn">
            + {t("nav.newProject")}
          </Link>
        }
      />

      {!loading && projects.length > 0 && (
        <div className="tabs" style={{ marginBottom: 18 }}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              className={tab === tb.id ? "active" : ""}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
              <span className="count">{tb.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon="🌱"
          title={t("proj.emptyTitle")}
          body={t("proj.emptyBody")}
          action={
            <Link href="/projects/new" className="btn">
              + {t("nav.newProject")}
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title={t("proj.emptyFiltered")} />
      ) : (
        <div className="card-grid">
          {filtered.map((p) => (
            <ProjectCard key={p.id} p={p} href={`/projects/${p.id}`} />
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
