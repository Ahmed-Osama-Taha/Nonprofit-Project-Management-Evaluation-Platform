"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Dropdown,
  Layout,
  Menu,
  Segmented,
  Space,
  Tag,
  theme,
} from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import arEG from "antd/locale/ar_EG";
import enUS from "antd/locale/en_US";
import { useI18n } from "@/lib/i18n";
import { useAuth, homeForRole } from "@/lib/auth";
import { Tracker } from "@/components/Tracker";

const { Header, Content } = Layout;

function useSystemDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { token } = theme.useToken();

  const navItems =
    user?.role === "organization"
      ? [
          { key: "/projects", label: t("proj.myProjects") },
          { key: "/projects/new", label: t("nav.newProject") },
        ]
      : user?.role === "reviewer"
        ? [
            { key: "/reviewer", label: t("nav.reviewer") },
            { key: "/projects", label: t("nav.projects") },
          ]
        : user?.role === "admin"
          ? [
              { key: "/admin", label: t("nav.admin") },
              { key: "/reviewer", label: t("nav.reviewer") },
            ]
          : [];
  if (user) navItems.push({ key: "/account", label: t("nav.account") });

  return (
    <Layout style={{ minHeight: "100dvh", background: "transparent" }}>
      <Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingInline: 16,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Link
          href={user ? homeForRole(user.role) : "/login"}
          style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: "#006c35",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            أ
          </span>
          <span style={{ fontSize: 16 }}>{t("app.name")}</span>
        </Link>

        {user && (
          <Menu
            mode="horizontal"
            selectedKeys={[pathname]}
            onClick={({ key }) => router.push(key)}
            items={navItems}
            style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none" }}
          />
        )}
        <div style={{ flex: user ? 0 : 1 }} />

        <Space>
          <Segmented
            size="small"
            value={lang}
            onChange={(v) => setLang(v as "ar" | "en")}
            options={[
              { label: "ع", value: "ar" },
              { label: "EN", value: "en" },
            ]}
          />
          {user ? (
            <Dropdown
              menu={{
                items: [
                  { key: "account", icon: <UserOutlined />, label: <Link href="/account">{t("nav.account")}</Link> },
                  { type: "divider" },
                  { key: "logout", icon: <LogoutOutlined />, label: t("nav.logout"), onClick: () => logout() },
                ],
              }}
            >
              <Button type="text">
                <Space size={6}>
                  <UserOutlined />
                  <span className="hide-sm">{user.full_name}</span>
                  <Tag color="green" style={{ marginInlineEnd: 0 }}>{t(`role.${user.role}`)}</Tag>
                </Space>
              </Button>
            </Dropdown>
          ) : (
            <Link href="/login">
              <Button type="primary">{t("nav.login")}</Button>
            </Link>
          )}
        </Space>
      </Header>

      <Content style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "24px 16px 72px" }}>
        {children}
      </Content>
    </Layout>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const { lang, dir } = useI18n();
  const dark = useSystemDark();

  return (
    <ConfigProvider
      direction={dir}
      locale={lang === "ar" ? arEG : enUS}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#006c35",
          colorInfo: "#006c35",
          borderRadius: 8,
          fontFamily:
            "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif",
        },
      }}
    >
      <AntApp>
        <Tracker />
        <Shell>{children}</Shell>
      </AntApp>
    </ConfigProvider>
  );
}
