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
