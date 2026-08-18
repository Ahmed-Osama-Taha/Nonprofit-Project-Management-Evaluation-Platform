"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Result,
  Row,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleTwoTone,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useI18n, fmtMoney } from "@/lib/i18n";
import { RequireAuth, num, dateStr } from "@/components/ui";
import { AIPanel } from "@/components/AIPanel";
import { Reviews, ReviewActions } from "@/components/project/ReviewPanel";
import { ChatBox } from "@/components/project/ChatBox";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const EDITABLE = ["draft", "changes_requested"];

const STATUS_TAG: Record<string, string> = {
  draft: "default",
  submitted: "blue",
  under_review: "gold",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
};

/** AntD lifecycle stepper for a project's journey. */
function Flow({ status }: { status: string }) {
  const { t } = useI18n();
  const idx =
    status === "approved" || status === "rejected"
      ? 3
      : status === "under_review"
        ? 2
        : status === "submitted"
          ? 1
          : 0;
  const rejected = status === "rejected";
  return (
    <Card style={{ marginBottom: 16 }}>
      <Steps
        responsive
        current={idx}
        status={rejected ? "error" : "process"}
        items={[
          { title: t("flow.draft") },
          { title: t("flow.submitted") },
          { title: t("flow.review") },
          { title: t("flow.decision") },
        ]}
      />
    </Card>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const [p, setP] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setP(await api.getProject(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-update the AI analysis: while it's processing (worker running), poll
  // every 4s so the result appears without a manual page refresh.
  useEffect(() => {
    if (p?.ai_analysis?.status !== "processing") return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [p?.ai_analysis?.status, load]);

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  if (err) return <Alert type="error" message={err} showIcon />;
  if (!p) return null;

  const isOwner = user?.role === "organization" && p.organization.id === user.organization_id;
  const isReviewer = user?.role === "reviewer" || user?.role === "admin";
  const canEdit = isOwner && EDITABLE.includes(p.status);

  return (
    <>
      {isReviewer && (
        <Link href="/reviewer">
          <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingInlineStart: 0, marginBottom: 4 }}>
            {t("flow.backToQueue")}
          </Button>
        </Link>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {p.title}
          </Title>
          <Text type="secondary">
            {p.organization.name}
            {p.submitted_at ? ` · ${dateStr(p.submitted_at)}` : ""}
          </Text>
        </div>
        <Tag color={STATUS_TAG[p.status]} style={{ fontSize: 13, padding: "2px 10px" }}>
          {t(`status.${p.status}`)}
        </Tag>
      </div>

      <Flow status={p.status} />

      {msg && <Alert type="success" message={msg} showIcon closable style={{ marginBottom: 16 }} onClose={() => setMsg("")} />}

      {isOwner && <OwnerStatusBanner status={p.status} />}

      {isReviewer && <AIPanel projectId={p.id} analysis={p.ai_analysis} canRerun onRerun={load} />}

      <DetailsCard project={p} canEdit={!!canEdit} onSaved={load} />

      <Documents project={p} canEdit={!!canEdit} onChange={load} />

      {isOwner && <OwnerActions project={p} onChange={load} setMsg={setMsg} setErr={setErr} />}

      <Reviews project={p} />

      {isReviewer && <ReviewActions project={p} onChange={load} />}
      {isReviewer && <ChatBox projectId={p.id} />}
    </>
  );
}

/** Contextual status message for the owner on non-editable states. */
function OwnerStatusBanner({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { type: "info" | "warning" | "success" | "error"; key: string }> = {
    submitted: { type: "info", key: "flow.awaiting" },
    under_review: { type: "info", key: "flow.inReview" },
    changes_requested: { type: "warning", key: "flow.changes" },
    approved: { type: "success", key: "flow.approved" },
    rejected: { type: "error", key: "flow.rejected" },
  };
  const m = map[status];
  if (!m) return null;
  return <Alert type={m.type} message={t(m.key)} showIcon style={{ marginBottom: 16 }} />;
}

function DocSection({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <Text strong>{title}</Text>
      <Paragraph style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{body}</Paragraph>
    </div>
  );
}

function Documents({
  project,
  canEdit,
  onChange,
}: {
  project: Project;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const uploadProps: UploadProps = {
    multiple: true,
    accept: ".pdf,.docx,.txt,.md,.csv",
    showUploadList: false,
    disabled: busy,
    beforeUpload: async (file) => {
      setBusy(true);
      try {
        await api.uploadDocument(project.id, file as File);
        message.success(t("proj.upload"));
        onChange();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
      return Upload.LIST_IGNORE;
    },
  };

  async function download(docId: string) {
    const { url } = await api.downloadDocument(project.id, docId);
    window.open(url, "_blank");
  }

  async function remove(docId: string) {
    try {
      await api.deleteDocument(project.id, docId);
      onChange();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const docs = project.documents ?? [];

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={t("proj.documents")}
      extra={
        canEdit && (
          <Upload {...uploadProps}>
            <Button size="small" loading={busy}>
              + {t("proj.upload")}
            </Button>
          </Upload>
        )
      }
    >
      {canEdit && docs.length === 0 && (
        <Upload.Dragger {...uploadProps} style={{ marginBottom: 12 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t("proj.upload")}</p>
          <p className="ant-upload-hint">PDF · DOCX · TXT · MD · CSV — up to 20 MB each.</p>
        </Upload.Dragger>
      )}

      {docs.length === 0 ? (
        !canEdit && <Text type="secondary">{t("common.none")}</Text>
      ) : (
        <List
          dataSource={docs}
          renderItem={(d) => (
            <List.Item
              actions={[
                <Button key="dl" type="text" icon={<DownloadOutlined />} onClick={() => download(d.id)} />,
                canEdit ? (
                  <Popconfirm key="rm" title={t("common.delete") ?? "Delete"} onConfirm={() => remove(d.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} disabled={busy} />
                  </Popconfirm>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: 20, color: "#006c35" }} />}
                title={
                  <a onClick={() => download(d.id)} style={{ cursor: "pointer" }}>
                    {d.filename}
                  </a>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {d.content_type} · {d.extraction_status}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function OwnerActions({
  project,
  onChange,
  setMsg,
  setErr,
}: {
  project: Project;
  onChange: () => void;
  setMsg: (s: string) => void;
  setErr: (s: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canSubmit = ["draft", "changes_requested"].includes(project.status);

  if (!canSubmit) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.submitProject(project.id);
      setMsg(t("proj.submitConfirm"));
      onChange();
    } catch (e) {
      // 402 = payment required (Model A). Send the user to the checkout screen
      // where they see the price + VAT and choose how to pay.
      if (e instanceof ApiError && e.status === 402) {
        router.push(`/projects/${project.id}/checkout`);
        return;
      }
      setErr(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  const detailsDone = !!(project.problem_statement && project.goals);
  const docsDone = (project.documents?.length ?? 0) > 0;

  const steps = [
    { done: detailsDone, title: t("flow.stepDetails"), hint: t("flow.detailsHint") },
    { done: docsDone, title: t("flow.stepDocs"), hint: t("flow.docsHint") },
    { done: false, title: t("flow.stepSubmit"), hint: t("flow.submitHint") },
  ];

  return (
    <Card style={{ marginBottom: 16 }} title={t("flow.next")}>
      <List
        itemLayout="horizontal"
        dataSource={steps}
        style={{ marginBottom: 12 }}
        renderItem={(s) => (
          <List.Item>
            <List.Item.Meta
              avatar={
                s.done ? (
                  <CheckCircleTwoTone twoToneColor="#006c35" style={{ fontSize: 20 }} />
                ) : (
                  <span
                    style={{
                      display: "inline-block",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "2px solid #d9d9d9",
                    }}
                  />
                )
              }
              title={s.title}
              description={s.hint}
            />
          </List.Item>
        )}
      />
      <Button
        type="primary"
        onClick={submit}
        loading={busy}
        disabled={!detailsDone}
        title={!detailsDone ? t("flow.detailsHint") : undefined}
      >
        {t("proj.submitConfirm")}
      </Button>
    </Card>
  );
}

/** Read-only details with an inline "Edit" toggle (owners, while editable). */
function DetailsCard({
  project,
  canEdit,
  onSaved,
}: {
  project: Project;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditForm
        project={project}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={t("common.viewDetails")}
      extra={
        canEdit && (
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
            {t("flow.edit")}
          </Button>
        )
      }
    >
      <Descriptions column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label={t("proj.category")}>{project.category || t("common.none")}</Descriptions.Item>
        <Descriptions.Item label={t("proj.location")}>{project.location || t("common.none")}</Descriptions.Item>
        <Descriptions.Item label={t("proj.budget")}>{fmtMoney(t, project.requested_budget)}</Descriptions.Item>
        <Descriptions.Item label={t("proj.targetBeneficiaries")}>{num(project.target_beneficiaries)}</Descriptions.Item>
        <Descriptions.Item label={t("proj.duration")}>
          {project.duration_months ? `${project.duration_months} ${t("common.months")}` : t("common.none")}
        </Descriptions.Item>
      </Descriptions>
      <DocSection title={t("proj.summary")} body={project.summary} />
      <DocSection title={t("proj.problem")} body={project.problem_statement} />
      <DocSection title={t("proj.goals")} body={project.goals} />
      <DocSection title={t("proj.kpis")} body={project.kpis} />
      <DocSection title={t("proj.beneficiaryDesc")} body={project.beneficiary_description} />
    </Card>
  );
}

function EditForm({
  project,
  onSaved,
  onCancel,
}: {
  project: Project;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    let vals;
    try {
      vals = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api.updateProject(project.id, {
        title: vals.title,
        summary: vals.summary ?? "",
        category: vals.category || null,
        location: vals.location || null,
        problem_statement: vals.problem_statement ?? "",
        goals: vals.goals ?? "",
        kpis: vals.kpis ?? "",
        beneficiary_description: vals.beneficiary_description || null,
        requested_budget: vals.requested_budget ?? null,
        currency: vals.currency || "SAR",
        duration_months: vals.duration_months ?? null,
        target_beneficiaries: vals.target_beneficiaries ?? null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <EditOutlined />
          {t("flow.edit")}
        </Space>
      }
    >
      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          title: project.title,
          summary: project.summary || "",
          category: project.category || "",
          location: project.location || "",
          problem_statement: project.problem_statement || "",
          goals: project.goals || "",
          kpis: project.kpis || "",
          beneficiary_description: project.beneficiary_description || "",
          requested_budget: project.requested_budget ?? undefined,
          currency: project.currency || "SAR",
          duration_months: project.duration_months ?? undefined,
          target_beneficiaries: project.target_beneficiaries ?? undefined,
        }}
      >
        <Form.Item name="title" label={t("proj.title")} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="category" label={t("proj.category")}>
              <Input />
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
        <Form.Item name="problem_statement" label={t("proj.problem")}>
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item name="goals" label={t("proj.goals")}>
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item name="kpis" label={t("proj.kpis")}>
          <TextArea rows={2} />
        </Form.Item>
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
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="duration_months" label={t("proj.duration")}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="target_beneficiaries" label={t("proj.targetBeneficiaries")}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Space>
        <Button type="primary" onClick={save} loading={busy}>
          {t("common.save")}
        </Button>
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
      </Space>
    </Card>
  );
}

export default function ProjectDetailPage() {
  return (
    <RequireAuth>
      <Detail />
    </RequireAuth>
  );
}
