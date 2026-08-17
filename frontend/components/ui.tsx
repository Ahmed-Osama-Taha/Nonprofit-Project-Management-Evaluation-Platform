"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n, fmtMoney } from "@/lib/i18n";
import type { Project, Role } from "@/lib/types";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>;
}

export function money(v?: number | null, currency = "SAR") {
  if (v === null || v === undefined) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v)} ${currency}`;
}

export function num(v?: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(v);
}

export function dateStr(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Guards a page to authenticated users, optionally by role. */
export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (roles && !roles.includes(user.role)) router.replace("/");
  }, [user, loading, roles, router]);

  if (loading)
    return (
      <div className="center-page">
        <div className="spinner" />
      </div>
    );
  if (!user) return null;
  if (roles && !roles.includes(user.role))
    return <p className="muted">{t("common.loading")}</p>;
  return <>{children}</>;
}

export function ProjectRow({ p, href }: { p: Project; href: string }) {
  const { t } = useI18n();
  return (
    <div className="list-item flex-between">
      <div>
        <Link href={href} style={{ fontWeight: 700 }}>
          {p.title}
        </Link>
        <div className="small muted">
          {p.organization?.name} · {p.category || t("common.none")} ·{" "}
          {fmtMoney(t, p.requested_budget)}
        </div>
      </div>
      <StatusBadge status={p.status} />
    </div>
  );
}

/** Page title + optional subtitle and right-aligned action slot. */
export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head flex-between">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/** Numbered progress stepper for multi-step flows. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper">
      {steps.map((label, i) => {
        const state = i === current ? "active" : i < current ? "done" : "";
        return (
          <div key={label} className={`step ${state}`}>
            <span className="dot">{i < current ? "✓" : i + 1}</span>
            <span className="cap">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal lifecycle indicator for a project's journey. */
export function ProjectFlow({ status }: { status: string }) {
  const { t } = useI18n();
  const steps = [
    t("flow.draft"),
    t("flow.submitted"),
    t("flow.review"),
    t("flow.decision"),
  ];
  const idx =
    status === "approved" || status === "rejected"
      ? 3
      : status === "under_review"
        ? 2
        : status === "submitted"
          ? 1
          : 0; // draft / changes_requested
  const rejected = status === "rejected";
  return (
    <div className="flow">
      {steps.map((label, i) => {
        const state = i === idx ? "active" : i < idx ? "done" : "";
        return (
          <div key={label} className={`flow-step ${state}`}>
            <span
              className="flow-dot"
              style={
                rejected && i === 3
                  ? { background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }
                  : undefined
              }
            >
              {i < idx ? "✓" : i + 1}
            </span>
            <span className="flow-cap">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Friendly empty state with icon, heading, body and optional action. */
export function EmptyState({
  icon = "📋",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/** Shimmer placeholder. */
export function Skeleton({
  h = 14,
  w = "100%",
  style,
}: {
  h?: number | string;
  w?: number | string;
  style?: React.CSSProperties;
}) {
  return <div className="skel" style={{ height: h, width: w, ...style }} />;
}

/** A loading grid of skeleton project cards. */
export function ProjectCardSkeleton() {
  return (
    <div className="proj-card">
      <Skeleton h={18} w="70%" />
      <Skeleton h={13} w="45%" />
      <Skeleton h={13} w="60%" />
      <div style={{ marginTop: "auto", paddingTop: 10 }}>
        <Skeleton h={12} w="40%" />
      </div>
    </div>
  );
}

/** Rich clickable project card for the dashboard grid. */
export function ProjectCard({ p, href }: { p: Project; href: string }) {
  const { t } = useI18n();
  const docs = p.documents?.length ?? 0;
  return (
    <Link href={href} className="proj-card">
      <div className="pc-head">
        <div className="pc-title">{p.title}</div>
        <StatusBadge status={p.status} />
      </div>
      <div className="pc-meta">
        {p.category || t("common.none")} · {fmtMoney(t, p.requested_budget)}
      </div>
      <div className="pc-tags">
        {p.location && <span className="pill">{p.location}</span>}
        {p.duration_months ? (
          <span className="pill">
            {p.duration_months} {t("common.months")}
          </span>
        ) : null}
      </div>
      <div className="pc-foot">
        <span>
          {t("proj.updated")} {dateStr(p.updated_at)}
        </span>
        {docs > 0 && (
          <span>
            📎 {docs} {t("proj.docs")}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Chart primitives (dependency-free, theme-aware) ───────────

const CHART_COLORS = [
  "#006c35",
  "#05833f",
  "#b88a2f",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#0891b2",
];

export function chartColor(i: number) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

/** Horizontal labelled bars. */
export function BarList({
  data,
  color,
}: {
  data: { label: string; value: number; sub?: string }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {data.map((d, i) => (
        <div key={d.label} className="crit-row">
          <div className="crit-head">
            <span>{d.label}</span>
            <span className="muted">{d.sub ?? d.value}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: color ?? chartColor(i),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut chart via conic-gradient + a legend. */
export function Donut({
  data,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color?: string }[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops = data
    .map((d, i) => {
      const start = (acc / total) * 360;
      acc += d.value;
      const end = (acc / total) * 360;
      return `${d.color ?? chartColor(i)} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div className="flex wrap" style={{ gap: 20 }}>
      <div
        className="donut"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="hole">
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{centerValue}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {centerLabel}
            </div>
          </div>
        </div>
      </div>
      <div className="legend">
        {data.map((d, i) => (
          <div key={d.label}>
            <span
              className="dot"
              style={{ background: d.color ?? chartColor(i) }}
            />
            {d.label} · <strong>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Circular score ring (0-100) via conic-gradient. */
export function ScoreRing({
  score,
  caption,
}: {
  score: number | null | undefined;
  caption?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const color = v >= 75 ? "#16a34a" : v >= 55 ? "#b88a2f" : v >= 40 ? "#d97706" : "#dc2626";
  return (
    <div
      className="score-ring"
      style={{
        background: `conic-gradient(${color} ${v * 3.6}deg, var(--brand-soft) 0deg)`,
      }}
    >
      <div className="inner">
        <div className="val" style={{ color }}>
          {score == null ? "—" : v}
        </div>
        <div className="cap">{caption}</div>
      </div>
    </div>
  );
}
