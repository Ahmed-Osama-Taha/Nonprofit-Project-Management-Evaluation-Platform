"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAuth, homeForRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button, Card, CardContent, Input, Label } from "@/components/uikit";

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
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center py-10">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-extrabold text-white shadow-soft">
          أ
        </div>
        <h1 className="m-0 text-2xl font-extrabold tracking-tight text-fg">
          {t("app.name")} · Athar
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t("app.tagline")}</p>
      </div>

      <Card className="animate-slide-up">
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-bold text-fg">{t("auth.signIn")}</h2>
          {err && (
            <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {err}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>{t("auth.email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.org"
              />
            </div>
            <div>
              <Label>{t("auth.password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            <Button className="w-full" size="lg" disabled={busy}>
              <LogIn className="h-4 w-4" />
              {busy ? t("common.loading") : t("auth.signIn")}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted">
            {t("auth.noAccount")}{" "}
            <Link href="/register" className="font-semibold text-brand-700 hover:underline">
              {t("auth.registerOrg")}
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Demo accounts */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
            <ShieldCheck className="h-4 w-4 text-brand" />
            {t("auth.demoAccounts")}
          </div>
          <div className="grid gap-2">
            {DEMO.map((d) => (
              <Button
                key={d.email}
                type="button"
                variant="secondary"
                size="sm"
                className="justify-between"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                <span>{t(`role.${d.role}`)}</span>
                <span className="font-mono text-xs opacity-70">{d.email}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
