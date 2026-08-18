"use client";

import { useState } from "react";
import { Alert, Card, Collapse, Input, Space, Typography } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const { Paragraph, Text } = Typography;
const { Search } = Input;

/** Reviewer assistant: ask grounded (RAG) questions about a project. */
export function ChatBox({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setErr("");
    setAnswer("");
    try {
      const res = await api.chat(projectId, q, lang);
      setAnswer(res.answer);
      setSources(res.sources);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <RobotOutlined style={{ color: "#006c35" }} />
          <span>{t("ai.ask")}</span>
        </Space>
      }
    >
      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
      <Search
        placeholder={t("ai.askPlaceholder")}
        enterButton={t("ai.ask")}
        loading={busy}
        onSearch={ask}
        size="large"
      />
      {answer && (
        <div style={{ marginTop: 16 }}>
          <Paragraph style={{ whiteSpace: "pre-wrap" }}>{answer}</Paragraph>
          {sources.length > 0 && (
            <Collapse
              ghost
              items={[
                {
                  key: "src",
                  label: <Text type="secondary">{sources.length} {t("ai.sources")}</Text>,
                  children: (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {sources.map((s, i) => (
                        <Text
                          key={i}
                          type="secondary"
                          style={{ borderInlineStart: "3px solid #eee", paddingInlineStart: 8, display: "block" }}
                        >
                          {s.slice(0, 300)}…
                        </Text>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}
    </Card>
  );
}
