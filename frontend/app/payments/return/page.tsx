"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Descriptions, Result, Space, Spin } from "antd";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Payment } from "@/lib/types";
import { RequireAuth } from "@/components/ui";

function money(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
      if (p.status === "paid" && p.project_id && !submitted.current) {
        submitted.current = true;
        try {
          await api.submitProject(p.project_id);
        } catch {
          /* already submitted */
        }
      }
    } catch {
      /* ignore */
    }
  }, [paymentId]);

  useEffect(() => {
    load();
  }, [load]);
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

  const href = payment?.project_id ? `/projects/${payment.project_id}` : "/projects";
  const status = payment?.status;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <Card>
        {!payment ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin size="large" />
          </div>
        ) : status === "paid" ? (
          <Result
            status="success"
            title={t("pay.paid")}
            subTitle={t("pay.paidBody")}
            extra={<Link href={href}><Button type="primary">{t("pay.backToProject")}</Button></Link>}
          />
        ) : status === "failed" || status === "expired" ? (
          <Result
            status="error"
            title={t("pay.failed")}
            subTitle={t("pay.failedBody")}
            extra={<Link href={href}><Button>{t("pay.backToProject")}</Button></Link>}
          />
        ) : (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t("pay.amount")}>{money(payment.amount_minor, payment.currency)}</Descriptions.Item>
              <Descriptions.Item label={t("pay.vat")}>{money(payment.vat_minor, payment.currency)}</Descriptions.Item>
              <Descriptions.Item label={t("pay.total")}>
                <strong>{money(payment.total_minor, payment.currency)}</strong>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <Space>
                <Spin />
                <span style={{ opacity: 0.7 }}>{t("pay.processing")}</span>
              </Space>
            </div>
            {isMock && (
              <Alert
                type="info"
                message={t("pay.sandboxNote")}
                description={
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" loading={busy} onClick={() => simulate("paid")}>
                      {t("pay.simulatePay")}
                    </Button>
                    <Button danger loading={busy} onClick={() => simulate("failed")}>
                      {t("pay.simulateFail")}
                    </Button>
                  </Space>
                }
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <Suspense fallback={<Spin />}>
        <ReturnInner />
      </Suspense>
    </RequireAuth>
  );
}
