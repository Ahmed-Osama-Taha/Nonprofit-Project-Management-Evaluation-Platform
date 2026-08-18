import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "Athar · أثر — Nonprofit Project Evaluation",
  description:
    "Athar (أثر): submit, review, and evaluate nonprofit project applications with AI (Claude) assistance. GCC / Saudi Arabia.",
  manifest: "/manifest.webmanifest",
  applicationName: "Athar",
  appleWebApp: { capable: true, title: "Athar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#006c35",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AntdRegistry>
          <I18nProvider>
            <AuthProvider>
              <AppProviders>{children}</AppProviders>
            </AuthProvider>
          </I18nProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
