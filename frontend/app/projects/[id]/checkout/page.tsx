"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Descriptions, Radio, Skeleton, Space, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { PaymentKind, Pricing, Project } from "@/lib/types";
import { RequireAuth } from "@/components/ui";

const { Title, Text } = Typography;

function money(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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

  if (!pricing || !project) {
    return (
      <Card style={{ maxWidth: 620, margin: "0 auto" }}>
        {err ? <Alert type="error" message={err} showIcon /> : <Skeleton active />}
      </Card>
    );
  }

  const cur = pricing.currency;
  const isReview = kind === "per_review";
  const amount = isReview ? pricing.per_review_minor : pricing.subscription_minor;
  const total = isReview ? pricing.per_review_total_minor : pricing.subscription_total_minor;
  const vat = total - amount;
  const subDesc = t("checkout.subDesc").replace("{days}", String(pricing.subscription_period_days));

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <Title level={3}>{t("checkout.title")}</Title>
      <Card>
        <Text type="secondary">{t("checkout.for")}</Text>
        <Title level={5} style={{ marginTop: 4 }}>{project.title}</Title>

        <Text strong>{t("checkout.choose")}</Text>
        <Radio.Group
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, width: "100%" }}
        >
          {[
            { value: "per_review", title: t("checkout.perReview"), desc: t("checkout.perReviewDesc"), price: pricing.per_review_total_minor, suffix: t("checkout.oneReview") },
            { value: "subscription", title: t("checkout.subscription"), desc: subDesc, price: pricing.subscription_total_minor, suffix: t("checkout.perMonth") },
          ].map((o) => (
            <Card key={o.value} size="small" hoverable onClick={() => setKind(o.value as PaymentKind)}
              style={{ borderColor: kind === o.value ? "#006c35" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Radio value={o.value}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{o.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{o.desc}</div>
                  </div>
                </Radio>
                <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                  {money(o.price, cur)} <span style={{ fontSize: 12, opacity: 0.6 }}>{o.suffix}</span>
                </div>
              </div>
            </Card>
          ))}
        </Radio.Group>

        <Descriptions column={1} size="small" style={{ margin: "16px 0" }}>
          <Descriptions.Item label={t("pay.amount")}>{money(amount, cur)}</Descriptions.Item>
          <Descriptions.Item label={t("pay.vat")}>{money(vat, cur)}</Descriptions.Item>
          <Descriptions.Item label={<strong>{t("pay.total")}</strong>}>
            <strong>{money(total, cur)}</strong>
          </Descriptions.Item>
        </Descriptions>

        {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <Button onClick={() => router.push(`/projects/${id}`)} disabled={busy}>
            {t("checkout.cancel")}
          </Button>
          <Button type="primary" onClick={pay} loading={busy}>
            {t("checkout.proceed")} · {money(total, cur)}
          </Button>
        </div>
        <Text type="secondary" style={{ display: "block", marginTop: 14, fontSize: 12 }}>
          <SafetyCertificateOutlined /> {t("checkout.secured")} {t("checkout.vatIncluded")}
        </Text>
      </Card>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <CheckoutInner />
    </RequireAuth>
  );
}
