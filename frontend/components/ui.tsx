"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { Project, Role } from "@/lib/types";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status.replace("_", " ")}</span>;
}

export function money(v?: number | null, currency = "USD") {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
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
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (roles && !roles.includes(user.role)) router.replace("/");
  }, [user, loading, roles, router]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return <p className="muted">Redirecting…</p>;
  return <>{children}</>;
}

export function ProjectRow({ p, href }: { p: Project; href: string }) {
  return (
    <div className="list-item flex-between">
      <div>
        <Link href={href} style={{ fontWeight: 600 }}>
          {p.title}
        </Link>
        <div className="small muted">
          {p.organization?.name} · {p.category || "Uncategorized"} ·{" "}
          {money(p.requested_budget, p.currency)}
        </div>
      </div>
      <StatusBadge status={p.status} />
    </div>
  );
}
