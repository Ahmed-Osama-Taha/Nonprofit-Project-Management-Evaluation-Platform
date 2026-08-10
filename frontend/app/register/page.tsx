"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, homeForRole } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    organization_name: "",
    email: "",
    password: "",
    country: "",
    website: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const user = await register(form);
      router.replace(homeForRole(user.role));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <h2>Register organization</h2>
        <p className="small muted">
          Self-registration creates an <strong>Organization</strong> account.
          Reviewer and admin accounts are provisioned internally.
        </p>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Your name</label>
            <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
          </div>
          <div className="field">
            <label>Organization name</label>
            <input
              value={form.organization_name}
              onChange={(e) => set("organization_name", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          </div>
          <div className="field">
            <label>Password (min 8 chars)</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Country</label>
              <input value={form.country} onChange={(e) => set("country", e.target.value)} />
            </div>
            <div className="field">
              <label>Website</label>
              <input value={form.website} onChange={(e) => set("website", e.target.value)} />
            </div>
          </div>
          <button className="btn" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
