"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  List,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { DownloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

const { Title, Text } = Typography;

type Sev = "high" | "medium" | "info";

/** Turn a raw risk-signal code into a human-readable, severity-tagged message. */
function describeSignal(code: string, t: (k: string) => string): { text: string; severity: Sev } {
  const [key, arg] = code.split(":");
  const a = arg || "";
  switch (key) {
    case "impossible_travel":
      return { text: `${t("sig.impossible")}: ${a.replace("->", " → ")}`, severity: "high" };
    case "location_mismatch":
      return { text: `${t("sig.mismatch")} (${a.replace("!=", " ≠ ")})`, severity: "high" };
    case "multiple_countries":
      return { text: `${t("sig.countries")}: ${a}`, severity: "high" };
    case "high_velocity":
      return { text: `${t("sig.velocity")}: ${a}`, severity: "medium" };
    case "new_device_logins":
      return { text: `${a} ${t("sig.newdev")}`, severity: "medium" };
    case "bot_device":
      return { text: t("sig.bot"), severity: "medium" };
    case "many_devices":
      return { text: `${a} ${t("sig.manydev")}`, severity: "medium" };
    case "anon_network":
      return { text: `${t("sig.anon")}: ${netLabel(a, t)}`, severity: "high" };
    default:
      return { text: t("sig.none"), severity: "info" };
  }
}

const NET_ICON: Record<string, string> = {
  local: "🏠", residential: "🏠", hosting: "🖥️", vpn: "🛡️", proxy: "🔀", tor: "🧅",
};
function netLabel(nt: string | null | undefined, t: (k: string) => string) {
  if (!nt) return "—";
  return `${NET_ICON[nt] || ""} ${t(`net.${nt}`)}`.trim();
}

const SEV_COLOR: Record<Sev, string> = { high: "red", medium: "orange", info: "green" };
const RISK_COLOR: Record<string, string> = { high: "red", medium: "orange", low: "green" };

function dt(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Enterprise-style slide-over 360° identity profile. Open with either a
 *  visitorId (from the Visitors tab) or a userId (from the Logins tab). */
export function VisitorProfile({
  visitorId,
  userId,
  onClose,
  onErased,
}: {
  visitorId?: string;
  userId?: string;
  onClose: () => void;
  onErased?: () => void;
}) {
  const { t } = useI18n();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = userId ? api.profileByUser(userId) : api.profile(visitorId!);
    load.then(setP).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [visitorId, userId]);

  function exportJson() {
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `identity-${p.visitor_id || p.user_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function erase() {
    if (!p || !p.visitor_id) return;
    await api.eraseIdentity(p.visitor_id);
    onErased?.();
    onClose();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title={t("prof.title")}
      styles={{ body: { paddingTop: 16 } }}
      extra={
        p && (
          <Space>
            <Button size="small" icon={<DownloadOutlined />} onClick={exportJson}>
              {t("prof.export")}
            </Button>
            {p.visitor_id && (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={erase}>
                {t("prof.erase")}
              </Button>
            )}
          </Space>
        )
      }
    >
      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
      {!p ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          {/* Identity header + risk */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {p.is_identified ? p.user_name || p.user_email : t("prof.anonymous")}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {p.is_identified ? p.user_email : p.visitor_id.slice(0, 16) + "…"}
              </Text>
              {p.role && (
                <div>
                  <Tag style={{ marginTop: 4 }}>{t(`role.${p.role}`)}</Tag>
                </div>
              )}
              {p.organization && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {p.organization}
                </Text>
              )}
            </div>
            <Tag color={RISK_COLOR[p.risk_level] ?? "default"} style={{ fontSize: 13, padding: "3px 10px" }}>
              {t("prof.risk")}: {t(`prof.risk.${p.risk_level}`)}
            </Tag>
          </div>

          {/* Risk signals */}
          {p.risk_signals.length > 0 && (
            <Space direction="vertical" size={6} style={{ width: "100%", margin: "14px 0" }}>
              {p.risk_signals.map((s) => {
                const d = describeSignal(s, t);
                return (
                  <Alert
                    key={s}
                    type={d.severity === "info" ? "success" : d.severity === "high" ? "error" : "warning"}
                    message={d.text}
                    showIcon
                    banner
                    style={{ borderRadius: 6 }}
                  />
                );
              })}
            </Space>
          )}

          {/* Overview */}
          <Descriptions column={1} size="small" style={{ marginTop: 14 }}>
            <Descriptions.Item label={t("prof.firstSeen")}>{dt(p.first_seen)}</Descriptions.Item>
            <Descriptions.Item label={t("prof.lastSeen")}>{dt(p.last_seen)}</Descriptions.Item>
            <Descriptions.Item label={t("admin.location")}>{p.location || "—"}</Descriptions.Item>
            <Descriptions.Item label={t("prof.connection")}>
              {netLabel(p.network_type, t)}
              {p.isp ? <Text type="secondary"> · {p.isp}</Text> : null}
            </Descriptions.Item>
            <Descriptions.Item label={t("prof.timezone")}>{p.timezone || "—"}</Descriptions.Item>
            <Descriptions.Item label={t("prof.referrer")}>{p.first_referrer || "—"}</Descriptions.Item>
          </Descriptions>

          {/* Devices */}
          <Title level={5} style={{ marginTop: 18 }}>
            {t("prof.devices")} · {p.devices.length}
          </Title>
          <List
            size="small"
            dataSource={p.devices}
            renderItem={(d) => (
              <List.Item>
                <div style={{ width: "100%" }}>
                  <Space size={4} wrap>
                    <Text>{d.device || d.platform || "—"}</Text>
                    {d.is_bot && <Tag color="red">bot</Tag>}
                    {["vpn", "proxy", "tor", "hosting"].includes(d.network_type || "") && (
                      <Tag color="red">{netLabel(d.network_type, t)}</Tag>
                    )}
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {d.location || "—"}
                      {d.timezone ? ` · 🕓 ${d.timezone}` : ""} · {dt(d.last_seen)}
                      {d.isp ? ` · ${d.isp}` : ""}
                    </Text>
                  </div>
                </div>
              </List.Item>
            )}
          />

          {/* Sessions */}
          <Title level={5} style={{ marginTop: 18 }}>
            {t("prof.sessions")} · {p.sessions.length}
          </Title>
          {p.sessions.length === 0 ? (
            <Text type="secondary">—</Text>
          ) : (
            <List
              size="small"
              dataSource={p.sessions}
              renderItem={(s) => (
                <List.Item>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <Space size={4}>
                      <Text>{s.device || "—"}</Text>
                      <Tag color={s.revoked ? "default" : "green"}>{s.revoked ? t("admin.revoked") : t("admin.active")}</Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {s.location || "—"} · {dt(s.last_seen_at)}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          )}

          {/* Activity timeline */}
          <Title level={5} style={{ marginTop: 18 }}>
            {t("prof.activity")}
          </Title>
          {p.events.length === 0 ? (
            <Empty description={t("prof.noEvents")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Timeline
              items={p.events.map((e) => ({
                children: (
                  <div>
                    <Text strong>{e.type}</Text>{" "}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {e.url || ""}
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dt(e.created_at)}
                      </Text>
                    </div>
                  </div>
                ),
              }))}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
