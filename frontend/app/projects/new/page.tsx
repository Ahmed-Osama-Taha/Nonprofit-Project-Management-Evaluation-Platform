"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Steps,
  Typography,
} from "antd";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { RequireAuth } from "@/components/ui";

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const CATEGORIES = ["التعليم", "الصحة", "البيئة", "التمكين الاقتصادي", "الإغاثة", "اجتماعي", "أخرى"];

const STEP_FIELDS: string[][] = [
  ["title", "category", "location", "summary"],
  ["problem_statement", "goals", "kpis"],
  ["target_beneficiaries", "duration_months", "beneficiary_description", "requested_budget", "currency"],
  [],
];

function NewProjectInner() {
  const { t } = useI18n();
  const router = useRouter();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const steps = [t("wizard.s1.title"), t("wizard.s2.title"), t("wizard.s3.title"), t("wizard.s4.title")];

  async function next() {
    try {
      await form.validateFields(STEP_FIELDS[step]);
      setErr("");
      setStep((s) => Math.min(s + 1, 3));
    } catch {
      setErr(t("wizard.required"));
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const f = form.getFieldsValue(true);
      const p = await api.createProject({
        ...f,
        category: f.category || undefined,
        target_beneficiaries: f.target_beneficiaries ?? undefined,
        requested_budget: f.requested_budget ?? undefined,
        duration_months: f.duration_months ?? undefined,
        currency: f.currency || "SAR",
      });
      router.replace(`/projects/${p.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create project");
      setBusy(false);
    }
  }

  const v = form.getFieldsValue(true);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Title level={3}>{t("proj.createNew")}</Title>
      <Card>
        <Steps current={step} items={steps.map((s) => ({ title: s }))} style={{ marginBottom: 24 }} />
        {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}

        <Form form={form} layout="vertical" initialValues={{ currency: "SAR" }}>
          <div style={{ display: step === 0 ? "block" : "none" }}>
            <Paragraph type="secondary">{t("wizard.s1.hint")}</Paragraph>
            <Form.Item name="title" label={t("proj.title")} rules={[{ required: true }]}>
              <Input size="large" />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="category" label={t("proj.category")}>
                  <Select allowClear options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="location" label={t("proj.location")}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="summary" label={t("proj.summary")}>
              <TextArea rows={3} />
            </Form.Item>
          </div>

          <div style={{ display: step === 1 ? "block" : "none" }}>
            <Paragraph type="secondary">{t("wizard.s2.hint")}</Paragraph>
            <Form.Item name="problem_statement" label={t("proj.problem")} rules={[{ required: true }]}>
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item name="goals" label={t("proj.goals")} rules={[{ required: true }]}>
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item name="kpis" label={t("proj.kpis")}>
              <TextArea rows={2} />
            </Form.Item>
          </div>

          <div style={{ display: step === 2 ? "block" : "none" }}>
            <Paragraph type="secondary">{t("wizard.s3.hint")}</Paragraph>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="target_beneficiaries" label={t("proj.targetBeneficiaries")}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="duration_months" label={t("proj.duration")}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="beneficiary_description" label={t("proj.beneficiaryDesc")}>
              <TextArea rows={2} />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="requested_budget" label={t("proj.budget")}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="currency" label={t("proj.currency")}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {step === 3 && (
            <>
              <Paragraph type="secondary">{t("wizard.s4.hint")}</Paragraph>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t("proj.title")}>{v.title || "—"}</Descriptions.Item>
                <Descriptions.Item label={t("proj.category")}>{v.category || "—"}</Descriptions.Item>
                <Descriptions.Item label={t("proj.problem")}>{v.problem_statement || "—"}</Descriptions.Item>
                <Descriptions.Item label={t("proj.goals")}>{v.goals || "—"}</Descriptions.Item>
                <Descriptions.Item label={t("proj.budget")}>
                  {v.requested_budget ? `${v.requested_budget} ${v.currency || "SAR"}` : "—"}
                </Descriptions.Item>
              </Descriptions>
              <Alert style={{ marginTop: 12 }} type="info" message={t("wizard.createdNext")} showIcon />
            </>
          )}
        </Form>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <Button onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0 || busy}>
            {t("wizard.prev")}
          </Button>
          {step < 3 ? (
            <Button type="primary" onClick={next}>
              {t("wizard.next")}
            </Button>
          ) : (
            <Button type="primary" onClick={submit} loading={busy}>
              {t("wizard.finish")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <NewProjectInner />
    </RequireAuth>
  );
}
