"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import { LockOutlined, MailOutlined, SafetyOutlined } from "@ant-design/icons";
import { useAuth, homeForRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const { Title, Text } = Typography;

const DEMO = [
  { role: "organization", email: "org@demo.org", password: "Org123!" },
  { role: "reviewer", email: "reviewer@demo.org", password: "Reviewer123!" },
  { role: "admin", email: "admin@demo.org", password: "Admin123!" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [form] = Form.useForm();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFinish(v: { email: string; password: string }) {
    setBusy(true);
    setErr("");
    try {
      const user = await login(v.email, v.password);
      router.replace(homeForRole(user.role));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "6vh auto 0", width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: "0 auto 14px",
            display: "grid",
            placeItems: "center",
            background: "#006c35",
            color: "#fff",
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          أ
        </div>
        <Title level={3} style={{ margin: 0 }}>
          {t("app.name")} · Athar
        </Title>
        <Text type="secondary">{t("app.tagline")}</Text>
      </div>

      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          {t("auth.signIn")}
        </Title>
        {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email" }]}>
            <Input size="large" prefix={<MailOutlined />} placeholder="you@example.org" autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label={t("auth.password")} rules={[{ required: true }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            {t("auth.signIn")}
          </Button>
        </Form>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">{t("auth.noAccount")} </Text>
          <Link href="/register">{t("auth.registerOrg")}</Link>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }} size="small" title={<Space><SafetyOutlined />{t("auth.demoAccounts")}</Space>}>
        <Space direction="vertical" style={{ width: "100%" }}>
          {DEMO.map((d) => (
            <Button
              key={d.email}
              block
              style={{ display: "flex", justifyContent: "space-between" }}
              onClick={() => form.setFieldsValue({ email: d.email, password: d.password })}
            >
              <span>{t(`role.${d.role}`)}</span>
              <span style={{ fontFamily: "monospace", opacity: 0.7, fontSize: 12 }}>{d.email}</span>
            </Button>
          ))}
        </Space>
      </Card>
    </div>
  );
}
