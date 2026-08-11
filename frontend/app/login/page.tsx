"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, homeForRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const DEMO = [
  { role: "organization", email: "org@demo.org", password: "Org123!" },
  { role: "reviewer", email: "reviewer@demo.org", password: "Reviewer123!" },
  { role: "admin", email: "admin@demo.org", password: "Admin123!" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
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
      <div className="hero" style={{ textAlign: "center" }}>
        <div
          className="brand-mark"
          style={{ width: 46, height: 46, margin: "0 auto 12px", fontSize: 22 }}
        >
          أ
        </div>
        <h1 style={{ margin: 0 }}>
          {t("app.name")} · Athar
        </h1>
        <p style={{ margin: "6px auto 0" }}>{t("app.tagline")}</p>
      </div>

      <div className="card">
        <div className="card-title">
          <h2 style={{ margin: 0 }}>{t("auth.signIn")}</h2>
        </div>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>{t("auth.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>{t("auth.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn" disabled={busy} style={{ width: "100%" }}>
            {busy ? t("common.loading") : t("auth.signIn")}
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>
          {t("auth.noAccount")}{" "}
          <Link href="/register">{t("auth.registerOrg")}</Link>
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <h3 style={{ margin: 0 }}>{t("auth.demoAccounts")}</h3>
        </div>
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
              {t(`role.${d.role}`)} — {d.email}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
