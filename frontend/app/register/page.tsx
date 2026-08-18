"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Col, Form, Input, Row, Typography } from "antd";
import { useAuth, homeForRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFinish(v: Record<string, string>) {
    setBusy(true);
    setErr("");
    try {
      const user = await register(v as never);
      router.replace(homeForRole(user.role));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "5vh auto 0", width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          {t("auth.registerOrg")}
        </Title>
        <Text type="secondary">{t("auth.registerHint")}</Text>
        <div style={{ height: 16 }} />
        {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="full_name" label={t("auth.fullName")} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="organization_name" label={t("auth.orgName")} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email" }]}>
            <Input size="large" autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, min: 8 }]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="country" label={t("auth.country")}>
                <Input size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label={t("auth.website")}>
                <Input size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            {t("auth.createAccount")}
          </Button>
        </Form>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">{t("auth.haveAccount")} </Text>
          <Link href="/login">{t("auth.signIn")}</Link>
        </div>
      </Card>
    </div>
  );
}
