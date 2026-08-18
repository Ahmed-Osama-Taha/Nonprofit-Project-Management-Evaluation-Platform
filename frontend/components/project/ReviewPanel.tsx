"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { dateStr } from "@/components/ui";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DECISION: Record<string, { status: string; color: string }> = {
  approve: { status: "approved", color: "green" },
  reject: { status: "rejected", color: "red" },
  request_changes: { status: "changes_requested", color: "orange" },
  comment: { status: "submitted", color: "blue" },
};

const STATUS_COLOR: Record<string, string> = {
  approved: "green",
  rejected: "red",
  changes_requested: "orange",
  submitted: "blue",
  under_review: "gold",
  draft: "default",
};

/** Read-only history of reviewer decisions on a project. */
export function Reviews({ project }: { project: Project }) {
  const { t } = useI18n();
  if (!project.reviews || project.reviews.length === 0) return null;
  return (
    <Card title={t("proj.reviews")} style={{ marginBottom: 16 }}>
      <Timeline
        items={project.reviews.map((r) => {
          const d = DECISION[r.decision] ?? DECISION.comment;
          return {
            color: d.color === "default" ? "gray" : d.color,
            children: (
              <div>
                <Space wrap>
                  <Text strong>{r.reviewer.full_name}</Text>
                  <Tag color={d.color}>{t(`status.${d.status}`)}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dateStr(r.created_at)}
                  </Text>
                </Space>
                {r.comment && <Paragraph style={{ margin: "6px 0 0" }}>{r.comment}</Paragraph>}
              </div>
            ),
          };
        })}
      />
    </Card>
  );
}

/** Reviewer decision controls (comment / request changes / approve / reject). */
export function ReviewActions({
  project,
  onChange,
}: {
  project: Project;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const decided = ["approved", "rejected"].includes(project.status);
  const notSubmitted = project.status === "draft";

  async function act(decision: "comment" | "request_changes" | "approve" | "reject") {
    setBusy(decision);
    setErr("");
    try {
      await api.createReview(project.id, decision, comment || undefined);
      setComment("");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (notSubmitted) return null;

  if (decided)
    return (
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Text type="secondary">{t("review.decision")}:</Text>
          <Tag color={STATUS_COLOR[project.status]}>{t(`status.${project.status}`)}</Tag>
        </Space>
      </Card>
    );

  return (
    <Card style={{ marginBottom: 16 }} title={t("review.decision")}>
      <Text type="secondary">{t("ai.subtitle")}</Text>
      {err && <Alert type="error" message={err} showIcon style={{ margin: "12px 0" }} />}
      <TextArea
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("review.addComment")}
        style={{ margin: "12px 0" }}
      />
      <Space wrap>
        <Button icon={<MessageOutlined />} loading={busy === "comment"} onClick={() => act("comment")}>
          {t("review.comment")}
        </Button>
        <Button
          icon={<EditOutlined />}
          loading={busy === "request_changes"}
          onClick={() => act("request_changes")}
        >
          {t("review.requestChanges")}
        </Button>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={busy === "approve"}
          onClick={() => act("approve")}
        >
          {t("review.approve")}
        </Button>
        <Button danger icon={<CloseCircleOutlined />} loading={busy === "reject"} onClick={() => act("reject")}>
          {t("review.reject")}
        </Button>
      </Space>
    </Card>
  );
}
