"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { RequireAuth, PageHead, Stepper } from "@/components/ui";

const CATEGORIES = [
  "التعليم",
  "الصحة",
  "البيئة",
  "التمكين الاقتصادي",
  "الإغاثة",
  "اجتماعي",
  "أخرى",
];

const EMPTY = {
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
};

function NewProjectInner() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const steps = [
    t("wizard.s1.title"),
    t("wizard.s2.title"),
    t("wizard.s3.title"),
    t("wizard.s4.title"),
  ];

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Per-step gating: block Continue until this step's required fields are filled.
  function stepValid(i: number): boolean {
    if (i === 0) return form.title.trim().length > 0;
    if (i === 1) return form.problem_statement.trim().length > 0 && form.goals.trim().length > 0;
    return true;
  }

  function next() {
    if (!stepValid(step)) {
      setErr(t("wizard.required"));
      return;
    }
    setErr("");
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function prev() {
    setErr("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
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
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={t("proj.createNew")}
        sub={`${t("wizard.step")} ${step + 1} ${t("wizard.of")} ${steps.length}`}
      />
      <div className="card">
        <Stepper steps={steps} current={step} />
        {err && <div className="error">{err}</div>}

        {step === 0 && (
          <div className="step-panel">
            <p className="section-hint" style={{ marginTop: 0 }}>{t("wizard.s1.hint")}</p>
            <div className="field">
              <label>
                {t("proj.title")} <span className="req">*</span>
              </label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
              <div className="hint">{t("hint.title")}</div>
            </div>
            <div className="row">
              <div className="field">
                <label>{t("proj.category")}</label>
                <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">— {t("proj.category")} —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t("proj.location")}</label>
                <input value={form.location} onChange={(e) => set("location", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>
                {t("proj.summary")} <span className="muted">({t("common.optional")})</span>
              </label>
              <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="step-panel">
            <p className="section-hint" style={{ marginTop: 0 }}>{t("wizard.s2.hint")}</p>
            <div className="field">
              <label>
                {t("proj.problem")} <span className="req">*</span>
              </label>
              <textarea
                value={form.problem_statement}
                onChange={(e) => set("problem_statement", e.target.value)}
                autoFocus
              />
              <div className="hint">{t("hint.problem")}</div>
            </div>
            <div className="field">
              <label>
                {t("proj.goals")} <span className="req">*</span>
              </label>
              <textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} />
              <div className="hint">{t("hint.goals")}</div>
            </div>
            <div className="field">
              <label>
                {t("proj.kpis")} <span className="muted">({t("common.optional")})</span>
              </label>
              <textarea value={form.kpis} onChange={(e) => set("kpis", e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-panel">
            <p className="section-hint" style={{ marginTop: 0 }}>{t("wizard.s3.hint")}</p>
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
                <div className="hint">{t("hint.budget")}</div>
              </div>
              <div className="field">
                <label>{t("proj.currency")}</label>
                <input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-panel">
            <p className="section-hint" style={{ marginTop: 0 }}>{t("wizard.s4.hint")}</p>
            <dl className="kv" style={{ marginBottom: 14 }}>
              <dt>{t("proj.title")}</dt>
              <dd>{form.title || "—"}</dd>
              <dt>{t("proj.category")}</dt>
              <dd>{form.category || "—"}</dd>
              <dt>{t("proj.location")}</dt>
              <dd>{form.location || "—"}</dd>
              <dt>{t("proj.problem")}</dt>
              <dd>{form.problem_statement || "—"}</dd>
              <dt>{t("proj.goals")}</dt>
              <dd>{form.goals || "—"}</dd>
              <dt>{t("proj.targetBeneficiaries")}</dt>
              <dd>{form.target_beneficiaries || "—"}</dd>
              <dt>{t("proj.budget")}</dt>
              <dd>
                {form.requested_budget
                  ? `${form.requested_budget} ${form.currency}`
                  : "—"}
              </dd>
              <dt>{t("proj.duration")}</dt>
              <dd>{form.duration_months || "—"}</dd>
            </dl>
            <div className="info-box">{t("wizard.createdNext")}</div>
          </div>
        )}

        <div className="wizard-foot">
          <div>
            {step > 0 && (
              <button className="btn btn-secondary" onClick={prev} disabled={busy}>
                ← {t("wizard.prev")}
              </button>
            )}
          </div>
          <div className="flex">
            <span className="small muted" style={{ marginInlineEnd: 6 }}>
              {t("wizard.reqNote")}
            </span>
            {step < steps.length - 1 ? (
              <button className="btn" onClick={next} disabled={!stepValid(step)}>
                {t("wizard.next")} →
              </button>
            ) : (
              <button className="btn btn-success" onClick={submit} disabled={busy}>
                {busy ? t("common.loading") : t("wizard.finish")}
              </button>
            )}
          </div>
        </div>
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
