"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { useI18n, fmtMoney, statusLabel } from "@/lib/i18n";
import type { ReviewerDashboard } from "@/lib/types";
import { RequireAuth, money } from "@/components/ui";

const { Title, Text } = Typography;

const STATUS_TAG: Record<string, string> = {
  draft: "default",
  submitted: "blue",
  under_review: "gold",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
};

const STATUS_STROKE: Record<string, string> = {
  draft: "#64748b",
  submitted: "#2563eb",
  under_review: "#d97706",
  changes_requested: "#c2410c",
  approved: "#16a34a",
  rejected: "#dc2626",
};

const REC_TAG: Record<string, { color: string; key: string }> = {
  approve: { color: "green", key: "review.approve" },
  request_changes: { color: "orange", key: "review.requestChanges" },
  reject: { color: "red", key: "review.reject" },
};

function scoreColor(v: number) {
  if (v >= 75) return "#16a34a";
  if (v >= 55) return "#b88a2f";
  if (v >= 40) return "#d97706";
  return "#dc2626";
}

/** Labelled Progress bar row for a distribution. */
function DistRow({ label, value, max, stroke }: { label: string; value: number; max: number; stroke?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <Text>{label}</Text>
        <Text strong>{value}</Text>
      </div>
      <Progress percent={Math.round((value / Math.max(1, max)) * 100)} strokeColor={stroke} showInfo={false} />
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const router = useRouter();
  const [d, setD] = useState<ReviewerDashboard | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.reviewerDashboard().then(setD).catch((e) => setErr(String(e.message)));
  }, []);

  if (err) return <Alert type="error" message={err} showIcon />;
  if (!d)
    return (
      <div style={{ textAlign: "center", padding: 64 }}>
        <Spin size="large" />
      </div>
    );

  const statusEntries = Object.entries(d.by_status);
  const statusMax = Math.max(1, ...statusEntries.map(([, v]) => v));
  const riskMax = Math.max(1, d.risk_distribution.high || 0, d.risk_distribution.medium || 0, d.risk_distribution.low || 0);
  const scoreMax = Math.max(1, ...d.ai_score_buckets.map((b) => b.value));
  const catMax = Math.max(1, ...d.by_category.map((c) => c.count));
  const approvalPct = d.approval_rate == null ? null : Math.round(d.approval_rate * 100);

  const queueCols: ColumnsType<ReviewerDashboard["queue"][number]> = [
    {
      title: t("proj.title"),
      dataIndex: "title",
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.organization}
          </Text>
        </div>
      ),
    },
    { title: t("proj.category"), dataIndex: "category", responsive: ["md"], render: (v: string) => v || t("common.none") },
    {
      title: t("status.submitted"),
      dataIndex: "status",
      render: (s: string) => <Tag color={STATUS_TAG[s]}>{statusLabel(t, s)}</Tag>,
    },
    {
      title: t("proj.budget"),
      dataIndex: "requested_budget",
      responsive: ["sm"],
      render: (v: number, r) => money(v, r.currency),
    },
    {
      title: t("rev.aiScore"),
      dataIndex: "ai_score",
      render: (v: number | null, r) =>
        v == null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space direction="vertical" size={0}>
            <Text strong style={{ color: scoreColor(Math.round(v)) }}>
              {Math.round(v)}
            </Text>
            {r.risk_high > 0 && (
              <Text style={{ color: "#dc2626", fontSize: 12 }}>
                {r.risk_high} {t("rev.highRisks")}
              </Text>
            )}
          </Space>
        ),
    },
    {
      title: t("ai.recommendation"),
      dataIndex: "ai_recommendation",
      responsive: ["lg"],
      render: (rec: string | null) => {
        const r = rec ? REC_TAG[rec] : undefined;
        return r ? <Tag color={r.color}>{t(r.key)}</Tag> : <Text type="secondary">—</Text>;
      },
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {t("rev.title")}
        </Title>
        <Text type="secondary">{t("rev.subtitle")}</Text>
      </div>

      {/* KPI tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic title={t("rev.totalProjects")} value={d.total_projects} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={5}>
          <Card>
            <Statistic title={t("rev.pending")} value={d.pending_review} valueStyle={{ color: "#d97706" }} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={5}>
          <Card>
            <Statistic
              title={t("rev.approvalRate")}
              value={approvalPct == null ? "—" : approvalPct}
              suffix={approvalPct == null ? "" : "%"}
              valueStyle={{ color: "#16a34a" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {d.decided} {t("rev.decided")}
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={12} lg={6}>
          <Card>
            <Statistic title={t("rev.requestedBudget")} value={fmtMoney(t, d.total_requested_budget)} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fmtMoney(t, d.approved_budget)} · {t("rev.approvedBudget")}
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={12} lg={4}>
          <Card>
            <Statistic title={t("rev.avgScore")} value={d.avg_ai_score ?? "—"} />
          </Card>
        </Col>
      </Row>

      {/* Distributions */}
      <Row gutter={[16, 16]} style={{ marginBottom: 18 }}>
        <Col xs={24} lg={12}>
          <Card title={t("rev.byStatus")} style={{ height: "100%" }}>
            {statusEntries.map(([k, v]) => (
              <DistRow key={k} label={statusLabel(t, k)} value={v} max={statusMax} stroke={STATUS_STROKE[k]} />
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t("rev.riskDist")} style={{ height: "100%" }}>
            <DistRow label={`${t("ai.risks")} · high`} value={d.risk_distribution.high || 0} max={riskMax} stroke="#dc2626" />
            <DistRow label={`${t("ai.risks")} · medium`} value={d.risk_distribution.medium || 0} max={riskMax} stroke="#d97706" />
            <DistRow label={`${t("ai.risks")} · low`} value={d.risk_distribution.low || 0} max={riskMax} stroke="#16a34a" />
            <Text type="secondary" style={{ display: "block", margin: "12px 0 8px" }}>
              {t("rev.aiScores")}
            </Text>
            {d.ai_score_buckets.map((b) => (
              <DistRow key={b.label} label={b.label} value={b.value} max={scoreMax} stroke="#b88a2f" />
            ))}
          </Card>
        </Col>
      </Row>

      <Card title={t("rev.byCategory")} style={{ marginBottom: 18 }}>
        {d.by_category.length ? (
          d.by_category.map((c) => (
            <DistRow
              key={c.category}
              label={`${c.category} · ${money(c.total_budget, d.currency)}`}
              value={c.count}
              max={catMax}
            />
          ))
        ) : (
          <Empty description={t("common.none")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* Review queue */}
      <Card
        title={
          <Space>
            {t("rev.queue")}
            <Tag>{d.queue.length}</Tag>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="id"
          columns={queueCols}
          dataSource={d.queue}
          onRow={(r) => ({ onClick: () => router.push(`/projects/${r.id}`), style: { cursor: "pointer" } })}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description={t("rev.queueEmpty")} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} /> }}
        />
      </Card>
    </>
  );
}

export default function ReviewerPage() {
  return (
    <RequireAuth roles={["reviewer", "admin"]}>
      <Dashboard />
    </RequireAuth>
  );
}
