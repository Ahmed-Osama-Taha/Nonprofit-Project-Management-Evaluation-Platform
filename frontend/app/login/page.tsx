"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, homeForRole } from "@/lib/auth";

const DEMO = [
  { label: "Organization", email: "org@demo.org", password: "Org123!" },
  { label: "Reviewer", email: "reviewer@demo.org", password: "Reviewer123!" },
  { label: "Admin", email: "admin@demo.org", password: "Admin123!" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const user = await login(email, password);
      router.replace(homeForRole(user.role));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <h2>Sign in</h2>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>
          New nonprofit? <Link href="/register">Create an organization account</Link>
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Demo accounts</h3>
        <p className="small muted">Click to prefill credentials.</p>
        <div className="stack">
          {DEMO.map((d) => (
            <button
              key={d.email}
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
              }}
            >
              {d.label} — {d.email}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
