"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Pricing, PaymentKind, Project } from "@/lib/types";
import { RequireAuth, PageHead, Skeleton } from "@/components/ui";

function money(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function CheckoutInner() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [kind, setKind] = useState<PaymentKind>("per_review");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.getProject(id), api.pricing()])
      .then(([p, pr]) => {
        setProject(p);
        setPricing(pr);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  async function pay() {
    setBusy(true);
    setErr("");
    try {
      const co = await api.checkout(kind, kind === "per_review" ? id : undefined);
      if (co.redirect_url) {
        window.location.href = co.redirect_url;
        return;
      }
      setErr("Could not start payment.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  if (err && !pricing) return <div className="error">{err}</div>;
  if (!pricing || !project) {
    return (
      <div className="card" style={{ maxWidth: 620 }}>
        <Skeleton h={20} w="50%" />
        <div style={{ height: 12 }} />
        <Skeleton h={90} />
        <div style={{ height: 8 }} />
        <Skeleton h={90} />
      </div>
    );
  }

  const cur = pricing.currency;
  const isReview = kind === "per_review";
  const amount = isReview ? pricing.per_review_minor : pricing.subscription_minor;
  const total = isReview
    ? pricing.per_review_total_minor
    : pricing.subscription_total_minor;
  const vat = total - amount;
  const subDesc = t("checkout.subDesc").replace(
    "{days}",
    String(pricing.subscription_period_days)
  );

  const Option = ({
    value,
    title,
    desc,
    priceMinor,
    suffix,
  }: {
    value: PaymentKind;
    title: string;
    desc: string;
    priceMinor: number;
    suffix: string;
  }) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className={`pay-option${kind === value ? " selected" : ""}`}
    >
      <span className="radio" aria-hidden />
      <span className="po-body">
        <span className="po-title">{title}</span>
        <span className="po-desc">{desc}</span>
      </span>
      <span className="po-price">
        {money(priceMinor, cur)}
        <span className="po-suffix">{suffix}</span>
      </span>
    </button>
  );

  return (
    <>
      <PageHead title={t("checkout.title")} />
      <div className="card" style={{ maxWidth: 620 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("checkout.for")}
        </p>
        <p style={{ fontWeight: 700, fontSize: 16, marginTop: 0 }}>{project.title}</p>

        <h3 style={{ fontSize: 14, marginBottom: 10 }}>{t("checkout.choose")}</h3>
        <div className="stack" style={{ gap: 10 }}>
          <Option
            value="per_review"
            title={t("checkout.perReview")}
            desc={t("checkout.perReviewDesc")}
            priceMinor={pricing.per_review_total_minor}
            suffix={` · ${t("checkout.oneReview")}`}
          />
          <Option
            value="subscription"
            title={t("checkout.subscription")}
            desc={subDesc}
            priceMinor={pricing.subscription_total_minor}
            suffix={` ${t("checkout.perMonth")}`}
          />
        </div>

        {/* Price breakdown for the selected option */}
        <dl className="kv" style={{ margin: "18px 0 8px" }}>
          <dt>{t("pay.amount")}</dt>
          <dd>{money(amount, cur)}</dd>
          <dt>{t("pay.vat")}</dt>
          <dd>{money(vat, cur)}</dd>
          <dt>
            <strong>{t("pay.total")}</strong>
          </dt>
          <dd>
            <strong>{money(total, cur)}</strong>
          </dd>
        </dl>

        {err && <div className="error">{err}</div>}

        <div className="flex-between" style={{ marginTop: 16, gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => router.push(`/projects/${id}`)}
            disabled={busy}
          >
            {t("checkout.cancel")}
          </button>
          <button className="btn btn-success" onClick={pay} disabled={busy}>
            {busy ? t("checkout.starting") : `${t("checkout.proceed")} · ${money(total, cur)}`}
          </button>
        </div>

        <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
          🔒 {t("checkout.secured")} {t("checkout.vatIncluded")}
        </p>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <CheckoutInner />
    </RequireAuth>
  );
}
