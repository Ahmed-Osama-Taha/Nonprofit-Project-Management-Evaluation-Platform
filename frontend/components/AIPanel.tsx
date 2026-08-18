"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { ThunderboltOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AIAnalysis } from "@/lib/types";

const { Title, Text, Paragraph } = Typography;

const REC_TAG: Record<string, { color: string; key: string }> = {
  approve: { color: "green", key: "review.approve" },
  request_changes: { color: "orange", key: "review.requestChanges" },
  reject: { color: "red", key: "review.reject" },
};

const SEV_COLOR: Record<string, string> = { high: "red", medium: "orange", low: "gold" };

function scoreColor(v: number) {
  if (v >= 75) return "#16a34a";
  if (v >= 55) return "#b88a2f";
  if (v >= 40) return "#d97706";
  return "#dc2626";
}

export function AIPanel({
  projectId,
  analysis,
  canRerun,
  onRerun,
}: {
  projectId: string;
  analysis?: AIAnalysis | null;
  canRerun?: boolean;
  onRerun?: () => void;
}) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function rerun() {
    setBusy(true);
    setErr("");
    try {
      await api.analyzeProject(projectId, lang);
      onRerun?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const rec = analysis?.preliminary_recommendation;
  const recTag = rec ? REC_TAG[rec] : undefined;
  const processing = analysis?.status === "processing";
  const score = Math.max(0, Math.min(100, Math.round(analysis?.preliminary_score ?? 0)));

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <ThunderboltOutlined style={{ color: "#006c35" }} />
          <span>{t("ai.title")}</span>
        </Space>
      }
      extra={
        canRerun && (
          <Button
            icon={<ReloadOutlined />}
            onClick={rerun}
            loading={busy || processing}
            size="small"
          >
            {t("proj.runAnalysis")}
          </Button>
        )
      }
    >
      <Text type="secondary">{t("ai.subtitle")}</Text>

      {err && <Alert type="error" message={err} showIcon style={{ marginTop: 12 }} />}

      {!analysis && (
        <Empty description={t("ai.notRun")} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 12 }} />
      )}

      {processing && (
        <Space style={{ marginTop: 16 }}>
          <Spin />
          <Text type="secondary">{t("common.loading")}</Text>
        </Space>
      )}

      {analysis?.status === "failed" && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={
            analysis.error?.toLowerCase().includes("key")
              ? t("ai.disabled")
              : analysis.error || "error"
          }
        />
      )}

      {analysis?.status === "completed" && (
        <div style={{ marginTop: 16 }}>
          <Row gutter={[24, 16]} align="middle">
            <Col flex="none" style={{ textAlign: "center" }}>
              <Progress
                type="circle"
                percent={score}
                strokeColor={scoreColor(score)}
                format={() => (analysis.preliminary_score == null ? "—" : score)}
                size={112}
              />
              <div style={{ marginTop: 6 }}>
                <Text type="secondary">{t("ai.readiness")}</Text>
              </div>
            </Col>
            <Col flex="auto">
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <div>
                  <Text type="secondary">{t("ai.recommendation")}: </Text>
                  {recTag ? <Tag color={recTag.color}>{t(recTag.key)}</Tag> : "—"}
                </div>
                {analysis.category && (
                  <div>
                    <Text type="secondary">{t("proj.category")}: </Text>
                    <Tag>{analysis.category}</Tag>
                  </div>
                )}
                {analysis.recommendation_rationale && (
                  <Paragraph type="secondary" style={{ margin: 0, maxWidth: "60ch" }}>
                    {analysis.recommendation_rationale}
                  </Paragraph>
                )}
              </Space>
            </Col>
          </Row>

          {analysis.summary && (
            <div style={{ marginTop: 20 }}>
              <Title level={5}>{t("ai.summary")}</Title>
              <Paragraph>{analysis.summary}</Paragraph>
            </div>
          )}

          {analysis.criteria && analysis.criteria.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <Title level={5}>{t("ai.scorecard")}</Title>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                {analysis.criteria.map((c, i) => {
                  const cv = Math.max(0, Math.min(100, Math.round(c.score)));
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <Text>{c.name}</Text>
                        <Text strong>{cv}</Text>
                      </div>
                      <Progress percent={cv} strokeColor={scoreColor(cv)} showInfo={false} />
                      {c.rationale && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {c.rationale}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </Space>
            </div>
          )}

          <Row gutter={[24, 16]} style={{ marginTop: 20 }}>
            {analysis.strengths && analysis.strengths.length > 0 && (
              <Col xs={24} md={12}>
                <List
                  size="small"
                  header={<Text strong>{t("ai.strengths")}</Text>}
                  dataSource={analysis.strengths}
                  renderItem={(s) => <List.Item>{s}</List.Item>}
                />
              </Col>
            )}
            {analysis.risks && analysis.risks.length > 0 && (
              <Col xs={24} md={12}>
                <List
                  size="small"
                  header={<Text strong>{t("ai.risks")}</Text>}
                  dataSource={analysis.risks}
                  renderItem={(r) => (
                    <List.Item>
                      <Space size={4} wrap>
                        <Tag color={SEV_COLOR[r.severity]}>{r.severity}</Tag>
                        <Text strong>{r.title}</Text>
                        <Text type="secondary">— {r.detail}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Col>
            )}
          </Row>

          <Row gutter={[24, 16]} style={{ marginTop: 4 }}>
            {analysis.missing_information && analysis.missing_information.length > 0 && (
              <Col xs={24} md={12}>
                <List
                  size="small"
                  header={<Text strong>{t("ai.missing")}</Text>}
                  dataSource={analysis.missing_information}
                  renderItem={(m) => <List.Item>{m}</List.Item>}
                />
              </Col>
            )}
            {analysis.suggested_questions && analysis.suggested_questions.length > 0 && (
              <Col xs={24} md={12}>
                <List
                  size="small"
                  header={<Text strong>{t("ai.questions")}</Text>}
                  dataSource={analysis.suggested_questions}
                  renderItem={(q) => <List.Item>{q}</List.Item>}
                />
              </Col>
            )}
          </Row>

          {analysis.model && (
            <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label={t("ai.model")}>{analysis.model}</Descriptions.Item>
            </Descriptions>
          )}
        </div>
      )}
    </Card>
  );
}
