"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, homeForRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export function NavBar() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`nav-link${pathname === href ? " active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href={user ? homeForRole(user.role) : "/login"} className="brand">
          <span className="brand-mark">أ</span>
          <span>
            {t("app.name")}{" "}
            <span className="brand-sub">Athar</span>
          </span>
        </Link>

        {user && (
          <div className="nav-links">
            {user.role === "organization" && (
              <>
                {link("/projects", t("proj.myProjects"))}
                {link("/projects/new", t("nav.newProject"))}
              </>
            )}
            {user.role === "reviewer" && (
              <>
                {link("/reviewer", t("nav.reviewer"))}
                {link("/projects", t("nav.projects"))}
              </>
            )}
            {user.role === "admin" && (
              <>
                {link("/admin", t("nav.admin"))}
                {link("/reviewer", t("nav.reviewer"))}
              </>
            )}
            {link("/account", t("nav.account"))}
          </div>
        )}

        <div className="nav-spacer" />

        <div className="lang-toggle" role="group" aria-label="language">
          <button
            className={lang === "ar" ? "active" : ""}
            onClick={() => setLang("ar")}
          >
            عربي
          </button>
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>

        {user ? (
          <div className="flex">
            <Link href="/account" className="nav-user" title={t("acct.title")}>
              {user.full_name}{" "}
              <span className="pill">{t(`role.${user.role}`)}</span>
            </Link>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              {t("nav.logout")}
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-sm">
            {t("nav.login")}
          </Link>
        )}
      </div>
    </nav>
  );
}
