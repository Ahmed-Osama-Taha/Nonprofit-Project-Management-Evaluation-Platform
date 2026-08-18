import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { NavBar } from "@/components/NavBar";
import { Tracker } from "@/components/Tracker";

export const metadata: Metadata = {
  title: "Athar · أثر — Nonprofit Project Evaluation",
  description:
    "Athar (أثر): submit, review, and evaluate nonprofit project applications with AI (Claude) assistance. GCC / Saudi Arabia.",
  manifest: "/manifest.webmanifest",
  applicationName: "Athar",
  appleWebApp: { capable: true, title: "Athar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// Mobile-first viewport: fills the screen, respects iOS notch safe-areas, and
// paints the browser chrome in the brand colour.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#006c35",
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
            <Tracker />
            <NavBar />
            <main className="container">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
