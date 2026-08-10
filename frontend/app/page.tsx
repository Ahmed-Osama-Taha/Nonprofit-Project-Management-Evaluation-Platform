"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeForRole } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homeForRole(user.role) : "/login");
  }, [user, loading, router]);

  return <p className="muted">Loading…</p>;
}
