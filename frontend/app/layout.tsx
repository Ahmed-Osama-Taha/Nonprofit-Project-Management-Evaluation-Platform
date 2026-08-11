import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Athar · أثر — Nonprofit Project Evaluation",
  description:
    "Athar (أثر): submit, review, and evaluate nonprofit project applications with AI (Claude) assistance. GCC / Saudi Arabia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <I18nProvider>
          <AuthProvider>
            <NavBar />
            <main className="container">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
