"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { RequireAuth } from "@/components/ui";

const CATEGORIES = [
  "التعليم",
  "الصحة",
  "البيئة",
  "التمكين الاقتصادي",
  "الإغاثة",
  "اجتماعي",
  "أخرى",
];

function NewProjectInner() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    category: "",
    summary: "",
    problem_statement: "",
    goals: "",
    kpis: "",
    target_beneficiaries: "",
    beneficiary_description: "",
    requested_budget: "",
    currency: "SAR",
    duration_months: "",
    location: "",
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
      const payload = {
        title: form.title,
        category: form.category || undefined,
        summary: form.summary || undefined,
        problem_statement: form.problem_statement || undefined,
        goals: form.goals || undefined,
        kpis: form.kpis || undefined,
        beneficiary_description: form.beneficiary_description || undefined,
        currency: form.currency,
        location: form.location || undefined,
        target_beneficiaries: form.target_beneficiaries
          ? Number(form.target_beneficiaries)
          : undefined,
        requested_budget: form.requested_budget
          ? Number(form.requested_budget)
          : undefined,
        duration_months: form.duration_months
          ? Number(form.duration_months)
          : undefined,
      };
      const p = await api.createProject(payload);
      router.replace(`/projects/${p.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{t("proj.createNew")}</h1>
      </div>
      <div className="card">
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>{t("proj.title")} *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="row">
            <div className="field">
              <label>{t("proj.category")}</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">{t("common.search")}…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("proj.location")}</label>
              <input value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("proj.summary")}</label>
            <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("proj.problem")} *</label>
            <textarea
              value={form.problem_statement}
              onChange={(e) => set("problem_statement", e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("proj.goals")} *</label>
            <textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("proj.kpis")}</label>
            <textarea value={form.kpis} onChange={(e) => set("kpis", e.target.value)} />
          </div>
          <div className="row">
            <div className="field">
              <label>{t("proj.targetBeneficiaries")}</label>
              <input
                type="number"
                value={form.target_beneficiaries}
                onChange={(e) => set("target_beneficiaries", e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t("proj.duration")}</label>
              <input
                type="number"
                value={form.duration_months}
                onChange={(e) => set("duration_months", e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>{t("proj.beneficiaryDesc")}</label>
            <textarea
              value={form.beneficiary_description}
              onChange={(e) => set("beneficiary_description", e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field">
              <label>{t("proj.budget")}</label>
              <input
                type="number"
                value={form.requested_budget}
                onChange={(e) => set("requested_budget", e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t("common.currency")}</label>
              <input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </div>
          </div>
          <button className="btn" disabled={busy}>
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </form>
      </div>
    </>
  );
}

export default function NewProjectPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <NewProjectInner />
    </RequireAuth>
  );
}
