"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { Payment, SessionInfo, SubscriptionInfo } from "@/lib/types";
import { RequireAuth } from "@/components/ui";

const { Title, Text } = Typography;

function dt(v?: string | null) {
  return v ? new Date(v).toLocaleString() : "—";
}
function money(minor: number, cur: string) {
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`;
}

const PAY_COLOR: Record<string, string> = {
  paid: "green", failed: "red", expired: "red", refunded: "orange", pending: "blue", initiated: "blue",
};

function AccountInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.sessions().then(setSessions).finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  async function revoke(id: string) {
    await api.revokeSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
  }
  async function revokeOthers() {
    await api.revokeOtherSessions();
    setSessions((s) => s.filter((x) => x.current));
  }

  const cols: ColumnsType<SessionInfo> = [
    {
      title: t("acct.device"),
      dataIndex: "device",
      render: (d: string, r) => (
        <Space>
          {d || "—"}
          {r.current && <Tag color="green">{t("acct.current")}</Tag>}
        </Space>
      ),
    },
    { title: t("acct.location"), dataIndex: "location", render: (v: string) => v || "—" },
    { title: t("acct.lastSeen"), dataIndex: "last_seen_at", render: dt, responsive: ["sm"] },
    {
      title: "",
      key: "act",
      align: "end",
      render: (_: unknown, r) =>
        r.current ? null : (
          <Popconfirm title={t("acct.revokeConfirm")} onConfirm={() => revoke(r.id)}>
            <Button danger size="small">{t("acct.signOut")}</Button>
          </Popconfirm>
        ),
    },
  ];

  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      <Title level={3}>{t("acct.title")}</Title>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={1} title={t("acct.profile")}>
          <Descriptions.Item label={user?.full_name}>
            <Space>
              {user?.email}
              <Tag color="green">{t(`role.${user?.role}`)}</Tag>
            </Space>
          </Descriptions.Item>
          {user?.organization?.name && (
            <Descriptions.Item label={user.organization.name}>
              {user.organization.country || "—"}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {user?.role === "organization" && <Billing />}

      <Card
        title={t("acct.sessions")}
        extra={
          others > 0 && (
            <Popconfirm title={t("acct.revokeConfirm")} onConfirm={revokeOthers}>
              <Button size="small">{t("acct.signOutOthers")}</Button>
            </Popconfirm>
          )
        }
      >
        <Text type="secondary">{t("acct.sessionsHint")}</Text>
        <Table rowKey="id" loading={loading} columns={cols} dataSource={sessions} pagination={false} style={{ marginTop: 12 }} />
      </Card>
    </>
  );
}

function Billing() {
  const { t } = useI18n();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.subscription().then(setSub).catch(() => setSub({ active: false }));
    api.listPayments().then(setPayments).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const cols: ColumnsType<Payment> = [
    { title: t("bill.date"), dataIndex: "created_at", render: (v: string) => new Date(v).toLocaleDateString() },
    { title: t("bill.item"), dataIndex: "kind", render: (k: string) => t(`bill.kind.${k}`) },
    { title: t("bill.amount"), dataIndex: "total_minor", render: (v: number, r) => money(v, r.currency) },
    { title: t("bill.status"), dataIndex: "status", render: (s: string) => <Tag color={PAY_COLOR[s]}>{s}</Tag> },
  ];

  return (
    <Card title={t("bill.title")} style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <Text strong>{t("bill.subscription")}: </Text>
        {sub?.active ? (
          <Space>
            <Tag color="green">{t("bill.subActive")}</Tag>
            {sub.current_period_end && (
              <Text type="secondary">
                {t("bill.subUntil")} {new Date(sub.current_period_end).toLocaleDateString()}
              </Text>
            )}
          </Space>
        ) : (
          <Text type="secondary">{t("bill.subNone")}</Text>
        )}
      </div>
      <Table rowKey="id" size="small" loading={loading} columns={cols} dataSource={payments} pagination={{ pageSize: 5, hideOnSinglePage: true }} />
    </Card>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountInner />
    </RequireAuth>
  );
}
