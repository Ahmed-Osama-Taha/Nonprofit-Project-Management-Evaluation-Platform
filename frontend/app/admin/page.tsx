"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Popconfirm,
  Progress,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  RobotOutlined,
  SafetyOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n, statusLabel } from "@/lib/i18n";
import type {
  AdminSession,
  Analytics,
  AuditEntry,
  DashboardStats,
  User,
  VisitorSummary,
} from "@/lib/types";
import { RequireAuth, dateStr } from "@/components/ui";
import { VisitorProfile } from "@/components/admin/VisitorProfile";

const { Title, Text, Paragraph } = Typography;

type AdminTab = "overview" | "users" | "logins" | "visitors" | "analytics" | "audit";

const STATUS_TAG: Record<string, string> = {
  draft: "default",
  submitted: "blue",
  under_review: "gold",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
};

/** Labelled Progress-bar row for a distribution. */
function DistList({ data, stroke }: { data: { label: string; value: number; sub?: string }[]; stroke?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <>
      {data.map((d) => (
        <div key={d.label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <Text>{d.label}</Text>
            <Text type="secondary">{d.sub ?? d.value}</Text>
          </div>
          <Progress percent={Math.round((d.value / max) * 100)} strokeColor={stroke} showInfo={false} />
        </div>
      ))}
    </>
  );
}

function AdminInner() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [visitors, setVisitors] = useState<VisitorSummary[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [insights, setInsights] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showApiLog, setShowApiLog] = useState(false);
  const [profile, setProfile] = useState<{ visitorId?: string; userId?: string } | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [form] = Form.useForm();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function loadAll() {
    api.stats().then(setStats).catch(() => {});
    api.users().then(setUsers).catch(() => {});
    api.audit(200, !showApiLog).then(setAudit).catch(() => {});
    api.adminSessions().then(setSessions).catch(() => {});
    api.visitors().then(setVisitors).catch(() => {});
    api.analytics().then(setAnalytics).catch(() => {});
  }

  useEffect(loadAll, [showApiLog]);

  async function generateInsights() {
    setAiBusy(true);
    setInsights("");
    try {
      const r = await api.insights(lang);
      setInsights(r.text);
    } catch (e) {
      setInsights(e instanceof Error ? e.message : "Failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function deleteSession(id: string) {
    await api.deleteAdminSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
  }

  async function clearApiLog() {
    await api.clearAudit(true);
    loadAll();
  }

  async function createReviewer(vals: { full_name: string; email: string; password: string }) {
    setMsg("");
    setErr("");
    try {
      await api.createReviewer(vals);
      setMsg(`✓ ${vals.email}`);
      form.resetFields();
      loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  const tabOptions = [
    { value: "overview", label: t("nav.dashboard") },
    { value: "users", label: t("admin.users") },
    { value: "logins", label: t("admin.logins") },
    { value: "visitors", label: t("admin.visitors") },
    { value: "analytics", label: t("an.title") },
    { value: "audit", label: t("admin.audit") },
  ];

  // ── Column definitions ────────────────────────────────
  const userCols: ColumnsType<User> = [
    { title: t("auth.fullName"), dataIndex: "full_name" },
    { title: t("auth.email"), dataIndex: "email", responsive: ["sm"] },
    { title: t("review.decision"), dataIndex: "role", render: (r: string) => <Tag>{t(`role.${r}`)}</Tag> },
    { title: t("role.organization"), dataIndex: ["organization", "name"], render: (v: string) => v || t("common.none") },
  ];

  const loginCols: ColumnsType<AdminSession> = [
    {
      title: t("admin.user"),
      dataIndex: "user_name",
      render: (v: string, r) => (
        <div>
          <div>{v || "—"}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.user_email}
          </Text>
        </div>
      ),
    },
    { title: t("admin.device"), dataIndex: "device", responsive: ["md"], render: (v: string) => v || "—" },
    { title: t("admin.location"), dataIndex: "location", responsive: ["sm"], render: (v: string) => v || "—" },
    { title: t("admin.ip"), dataIndex: "ip", responsive: ["lg"], render: (v: string) => <Text type="secondary">{v || "—"}</Text> },
    { title: t("admin.when"), dataIndex: "last_seen_at", responsive: ["md"], render: dateStr },
    {
      title: t("admin.status"),
      dataIndex: "revoked",
      render: (rev: boolean) => <Tag color={rev ? "default" : "green"}>{rev ? t("admin.revoked") : t("admin.active")}</Tag>,
    },
    {
      title: "",
      key: "act",
      align: "end",
      render: (_: unknown, r) => (
        <Popconfirm title={t("admin.deleteConfirm")} onConfirm={() => deleteSession(r.id)}>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      ),
    },
  ];

  const visitorCols: ColumnsType<VisitorSummary> = [
    {
      title: t("admin.fingerprint"),
      dataIndex: "fingerprint_hash",
      render: (_: string, v) => (
        <Text type="secondary" style={{ fontFamily: "monospace" }}>
          {(v.fingerprint_hash || v.visitor_key).slice(0, 12)}…
        </Text>
      ),
    },
    { title: t("admin.user"), dataIndex: "user_email", responsive: ["sm"], render: (v: string) => v || "—" },
    {
      title: t("admin.device"),
      dataIndex: "device",
      render: (_: string, v) => (
        <div>
          <Space size={4}>
            {v.device || v.platform || "—"}
            {v.is_bot && <Tag color="red">bot</Tag>}
          </Space>
          {v.timezone && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {v.timezone}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    { title: t("admin.location"), dataIndex: "location", responsive: ["md"], render: (v: string) => v || "—" },
    { title: t("admin.evtCount"), dataIndex: "event_count", responsive: ["lg"] },
    { title: t("admin.seen"), dataIndex: "last_seen", responsive: ["md"], render: dateStr },
    {
      title: "",
      key: "act",
      align: "end",
      render: (_: unknown, v) => (
        <Popconfirm
          title={t("admin.deleteConfirm")}
          onConfirm={async () => {
            await api.deleteVisitor(v.id);
            setVisitors((s) => s.filter((x) => x.id !== v.id));
          }}
        >
          <Button danger size="small" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      ),
    },
  ];

  const apiLogCols: ColumnsType<AuditEntry> = [
    { title: t("admin.when"), dataIndex: "created_at", render: dateStr },
    { title: t("admin.actor"), dataIndex: "actor_email", render: (v: string) => v || "system" },
    { title: t("admin.method"), dataIndex: "method", responsive: ["sm"], render: (v: string) => v || "—" },
    { title: t("admin.path"), dataIndex: "path", responsive: ["md"], render: (v: string) => <Text type="secondary">{v || "—"}</Text> },
    {
      title: t("admin.statusCode"),
      dataIndex: "status_code",
      render: (c: number) => (c ? <Tag color={c >= 400 ? "red" : "green"}>{c}</Tag> : "—"),
    },
    { title: t("admin.latency"), dataIndex: "latency_ms", responsive: ["lg"], render: (v: number) => (v != null ? `${v}ms` : "—") },
  ];

  const eventCols: ColumnsType<AuditEntry> = [
    { title: t("admin.when"), dataIndex: "created_at", render: dateStr, width: 160 },
    {
      title: t("admin.actor"),
      dataIndex: "actor_email",
      render: (v: string, a) => (
        <Space size={4}>
          {v || "system"}
          {a.actor_role && <Tag>{t(`role.${a.actor_role}`)}</Tag>}
        </Space>
      ),
    },
    { title: t("admin.summary"), key: "sum", render: (_: unknown, a) => eventSummary(a) },
  ];

  const alertCols: ColumnsType<Analytics["security_alerts"][number]> = [
    { title: t("admin.when"), dataIndex: "when", render: dateStr },
    { title: t("admin.user"), dataIndex: "user", render: (v: string) => v || "—" },
    { title: t("admin.location"), dataIndex: "location", render: (v: string) => v || "—" },
    { title: t("admin.newDevice"), key: "nd", render: () => <Tag color="orange">{t("admin.newDevice")}</Tag> },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {t("admin.title")}
        </Title>
        <Text type="secondary">{t("app.tagline")}</Text>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <Segmented value={tab} onChange={(v) => setTab(v as AdminTab)} options={tabOptions} />
      </div>

      {tab === "overview" && stats && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("rev.totalProjects")} value={stats.total_projects} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("rev.pending")} value={stats.pending_review} valueStyle={{ color: "#d97706" }} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("admin.orgs")} value={stats.total_organizations} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("admin.users")} value={stats.total_users} />
              </Card>
            </Col>
          </Row>
          <Card title={t("rev.byStatus")}>
            <DistList data={Object.entries(stats.by_status).map(([k, v]) => ({ label: statusLabel(t, k), value: v }))} />
          </Card>
        </>
      )}

      {tab === "users" && (
        <>
          <Card title={t("admin.createReviewer")} style={{ marginBottom: 16 }}>
            {msg && <Alert type="success" message={msg} showIcon style={{ marginBottom: 12 }} />}
            {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
            <Form form={form} layout="vertical" onFinish={createReviewer}>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="full_name" label={t("auth.fullName")} rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email" }]}>
                    <Input type="email" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, min: 8 }]}>
                <Input.Password />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<UserAddOutlined />}>
                {t("admin.createReviewer")}
              </Button>
            </Form>
          </Card>

          <Card title={t("admin.users")} styles={{ body: { padding: 0 } }}>
            <Table rowKey="id" columns={userCols} dataSource={users} pagination={{ pageSize: 10, hideOnSinglePage: true }} />
          </Card>
        </>
      )}

      {tab === "logins" && (
        <Card title={t("admin.logins")} styles={{ body: { padding: 0 } }}>
          <div style={{ padding: "0 16px", paddingTop: 12 }}>
            <Text type="secondary">{t("admin.loginsHint")}</Text>
          </div>
          <Table
            rowKey="id"
            columns={loginCols}
            dataSource={sessions}
            onRow={(r) => ({
              onClick: () => r.user_id && setProfile({ userId: r.user_id }),
              style: { cursor: r.user_id ? "pointer" : "default" },
            })}
            pagination={{ pageSize: 15, hideOnSinglePage: true }}
          />
        </Card>
      )}

      {tab === "visitors" && (
        <Card title={t("admin.visitors")} styles={{ body: { padding: 0 } }}>
          <div style={{ padding: "0 16px", paddingTop: 12 }}>
            <Text type="secondary">{t("admin.visitorsHint")}</Text>
          </div>
          <Table
            rowKey="id"
            columns={visitorCols}
            dataSource={visitors}
            onRow={(v) => ({ onClick: () => setProfile({ visitorId: v.id }), style: { cursor: "pointer" } })}
            pagination={{ pageSize: 15, hideOnSinglePage: true }}
          />
        </Card>
      )}

      {tab === "analytics" && analytics && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("an.visitors")} value={analytics.total_visitors} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {analytics.identified} {t("an.identified")} · {analytics.anonymous} {t("an.anonymous")}
                </Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("an.pageviews")} value={analytics.pageviews} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {analytics.events} {t("an.events")}
                </Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("an.newDevices")} value={analytics.new_devices} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title={t("an.bots")} value={analytics.bots} />
              </Card>
            </Col>
          </Row>

          {analytics.total_visitors === 0 ? (
            <Card>
              <Empty description={t("an.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </Card>
          ) : (
            <>
              <Card
                style={{ marginBottom: 16 }}
                title={
                  <Space>
                    <RobotOutlined style={{ color: "#006c35" }} />
                    {t("an.aiInsights")}
                  </Space>
                }
                extra={
                  <Button size="small" onClick={generateInsights} loading={aiBusy}>
                    {t("an.generate")}
                  </Button>
                }
              >
                <Text type="secondary">{t("an.aiHint")}</Text>
                {insights && <Paragraph style={{ whiteSpace: "pre-wrap", marginTop: 12, lineHeight: 1.6 }}>{insights}</Paragraph>}
              </Card>

              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} lg={12}>
                  <Card title={t("an.overTime")} style={{ height: "100%" }}>
                    <DistList data={analytics.timeseries} stroke="#006c35" />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title={t("an.byDevice")} style={{ height: "100%" }}>
                    {analytics.by_device.length ? (
                      <DistList data={analytics.by_device} />
                    ) : (
                      <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} lg={12}>
                  <Card title={t("an.byCountry")} style={{ height: "100%" }}>
                    {analytics.by_country.length ? (
                      <DistList data={analytics.by_country} />
                    ) : (
                      <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title={t("an.topPages")} style={{ height: "100%" }}>
                    {analytics.top_pages.length ? (
                      <DistList data={analytics.top_pages} stroke="#b88a2f" />
                    ) : (
                      <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} lg={12}>
                  <Card title={t("an.topReferrers")} style={{ height: "100%" }}>
                    {analytics.top_referrers.length ? (
                      <DistList data={analytics.top_referrers} />
                    ) : (
                      <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title={t("an.utm")} style={{ height: "100%" }}>
                    {analytics.utm_sources.length ? (
                      <DistList data={analytics.utm_sources} stroke="#006c35" />
                    ) : (
                      <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
              </Row>

              <Card
                title={
                  <Space>
                    <SafetyOutlined style={{ color: "#dc2626" }} />
                    {t("an.securityAlerts")}
                  </Space>
                }
                styles={{ body: { padding: analytics.security_alerts.length ? 0 : undefined } }}
              >
                {analytics.security_alerts.length === 0 ? (
                  <Text type="secondary">{t("an.noAlerts")}</Text>
                ) : (
                  <Table
                    rowKey={(r) => `${r.when}-${r.user}-${r.location}`}
                    columns={alertCols}
                    dataSource={analytics.security_alerts}
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  />
                )}
              </Card>
            </>
          )}
        </>
      )}

      {tab === "audit" && (
        <Card
          title={showApiLog ? t("admin.apiLog") : t("admin.events")}
          styles={{ body: { padding: 0 } }}
          extra={
            <Space>
              <Button size="small" onClick={() => setShowApiLog((v) => !v)}>
                {showApiLog ? t("admin.events") : t("admin.showApiLog")}
              </Button>
              {showApiLog && (
                <Popconfirm title={t("admin.clearConfirm")} onConfirm={clearApiLog}>
                  <Button size="small" danger>
                    {t("admin.clearApiLog")}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          }
        >
          <div style={{ padding: "12px 16px 0" }}>
            <Text type="secondary">{t("admin.auditHint")}</Text>
          </div>
          <Table
            rowKey="id"
            columns={showApiLog ? apiLogCols : eventCols}
            dataSource={audit}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
          />
        </Card>
      )}

      {profile && (
        <VisitorProfile
          visitorId={profile.visitorId}
          userId={profile.userId}
          onClose={() => setProfile(null)}
          onErased={loadAll}
        />
      )}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "user.register": "registered a new organization account",
  "reviewer.create": "added a reviewer",
  "project.create": "created a project",
  "project.update": "updated a project",
  "project.submit": "submitted a project for review",
  "document.upload": "uploaded a document",
  "document.delete": "deleted a document",
  "document.malware_blocked": "⚠️ blocked a malicious file",
  "review.approve": "approved a project",
  "review.reject": "rejected a project",
  "review.request_changes": "requested changes",
  "payment.checkout": "started a payment",
  "session.revoke": "signed out a device",
  "session.revoke_others": "signed out other devices",
  "admin.session.delete": "deleted a login record",
  "admin.audit.clear": "cleared the API log",
};

function eventSummary(a: AuditEntry) {
  const label = ACTION_LABEL[a.action] || a.action.replace(/[._]/g, " ");
  const detail = a.detail as Record<string, unknown> | null | undefined;
  const name = (detail && (detail.filename || detail.organization || detail.device)) || "";
  return (
    <span>
      {label}
      {name ? <Text type="secondary"> — {String(name)}</Text> : null}
    </span>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminInner />
    </RequireAuth>
  );
}
