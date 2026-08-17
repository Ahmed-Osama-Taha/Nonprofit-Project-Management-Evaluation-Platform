"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Payment } from "@/lib/types";
import { RequireAuth, PageHead, Skeleton } from "@/components/ui";

function money(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function ReturnInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const paymentId = params.get("payment_id");
  const chargeId = params.get("charge_id");
  const isMock = params.get("mock") === "1";

  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  const load = useCallback(async () => {
    if (!paymentId) return;
    try {
      const p = await api.getPayment(paymentId);
      setPayment(p);
      // On success, finish the Model-A flow by submitting the project (idempotent
      // server-side: already-submitted projects just 409 and are ignored).
      if (p.status === "paid" && p.project_id && !submitted.current) {
        submitted.current = true;
        try {
          await api.submitProject(p.project_id);
        } catch {
          /* already submitted / not submittable — ignore */
        }
      }
    } catch {
      /* ignore transient errors while polling */
    }
  }, [paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while pending (covers the real-gateway case where the webhook settles
  // the charge a moment after the customer returns).
  useEffect(() => {
    if (!payment || payment.status !== "pending") return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [payment, load]);

  async function simulate(outcome: "paid" | "failed") {
    if (!chargeId) return;
    setBusy(true);
    try {
      await api.mockCompletePayment(chargeId, outcome);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const status = payment?.status;
  const projectHref = payment?.project_id ? `/projects/${payment.project_id}` : "/projects";

  return (
    <>
      <PageHead title={t("pay.return.title")} />
      <div className="card" style={{ maxWidth: 560 }}>
        {!payment ? (
          <div className="stack" style={{ gap: 10 }}>
            <Skeleton h={20} w="50%" />
            <Skeleton h={14} w="80%" />
          </div>
        ) : (
          <>
            {/* Amount summary */}
            <dl className="kv" style={{ marginBottom: 16 }}>
              <dt>{t("pay.amount")}</dt>
              <dd>{money(payment.amount_minor, payment.currency)}</dd>
              <dt>{t("pay.vat")}</dt>
              <dd>{money(payment.vat_minor, payment.currency)}</dd>
              <dt>
                <strong>{t("pay.total")}</strong>
              </dt>
              <dd>
                <strong>{money(payment.total_minor, payment.currency)}</strong>
              </dd>
            </dl>

            {status === "paid" && (
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontSize: 40 }}>✅</div>
                <h3 style={{ margin: 0 }}>{t("pay.paid")}</h3>
                <p className="muted" style={{ margin: 0 }}>{t("pay.paidBody")}</p>
                <Link href={projectHref} className="btn" style={{ marginTop: 8 }}>
                  {t("pay.backToProject")}
                </Link>
              </div>
            )}

            {(status === "failed" || status === "expired") && (
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontSize: 40 }}>⚠️</div>
                <h3 style={{ margin: 0 }}>{t("pay.failed")}</h3>
                <p className="muted" style={{ margin: 0 }}>{t("pay.failedBody")}</p>
                <Link href={projectHref} className="btn btn-secondary" style={{ marginTop: 8 }}>
                  {t("pay.backToProject")}
                </Link>
              </div>
            )}

            {(status === "pending" || status === "initiated") && (
              <div className="stack" style={{ gap: 12 }}>
                <div className="flex" style={{ gap: 10, alignItems: "center" }}>
                  <div className="spinner" />
                  <span className="muted">{t("pay.processing")}</span>
                </div>
                {isMock && (
                  <div className="info-box">
                    <p style={{ marginTop: 0 }}>{t("pay.sandboxNote")}</p>
                    <div className="flex" style={{ gap: 8 }}>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => simulate("paid")}
                        disabled={busy}
                      >
                        {t("pay.simulatePay")}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => simulate("failed")}
                        disabled={busy}
                      >
                        {t("pay.simulateFail")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function PaymentReturnPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <Suspense fallback={<div className="center-page"><div className="spinner" /></div>}>
        <ReturnInner />
      </Suspense>
    </RequireAuth>
  );
}
