"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Segmented, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { useI18n, fmtMoney, statusLabel } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { RequireAuth } from "@/components/ui";

const { Title } = Typography;

const STATUS_TAG: Record<string, string> = {
  draft: "default",
  submitted: "blue",
  under_review: "gold",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
};

type Tab = "all" | "draft" | "active" | "decided";
const IN_TAB: Record<Exclude<Tab, "all">, string[]> = {
  draft: ["draft", "changes_requested"],
  active: ["submitted", "under_review"],
  decided: ["approved", "rejected"],
};

function ProjectsInner() {
  const { t } = useI18n();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    api.listProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (tab === "all" ? projects : projects.filter((p) => IN_TAB[tab].includes(p.status))),
    [projects, tab]
  );

  const columns: ColumnsType<Project> = [
    {
      title: t("proj.title"),
      dataIndex: "title",
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{r.category || t("common.none")}</div>
        </div>
      ),
    },
    {
      title: t("proj.budget"),
      dataIndex: "requested_budget",
      responsive: ["sm"],
      render: (v: number) => fmtMoney(t, v),
    },
    {
      title: t("proj.location"),
      dataIndex: "location",
      responsive: ["md"],
      render: (v: string) => v || "—",
    },
    {
      title: t("admin.status"),
      dataIndex: "status",
      render: (s: string) => <Tag color={STATUS_TAG[s]}>{statusLabel(t, s)}</Tag>,
    },
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <Title level={3} style={{ margin: 0 }}>
          {t("proj.myProjects")}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/projects/new")}>
          {t("nav.newProject")}
        </Button>
      </div>

      {projects.length > 0 && (
        <Segmented
          style={{ marginBottom: 16 }}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: t("proj.all"), value: "all" },
            { label: t("proj.drafts"), value: "draft" },
            { label: t("proj.active"), value: "active" },
            { label: t("proj.decided"), value: "decided" },
          ]}
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table<Project>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          onRow={(r) => ({ onClick: () => router.push(`/projects/${r.id}`), style: { cursor: "pointer" } })}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty
                description={t("proj.emptyTitle")}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: 24 }}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/projects/new")}>
                  {t("nav.newProject")}
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>
    </>
  );
}

export default function ProjectsPage() {
  return (
    <RequireAuth roles={["organization"]}>
      <ProjectsInner />
    </RequireAuth>
  );
}
