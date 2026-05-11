import type { Metadata, Viewport } from "next";
import { Unbounded, Manrope } from "next/font/google";
import clsx from "clsx";
import AppShell from "@/components/layout/AppShell";
import AuthSessionProvider from "@/components/auth/AuthSessionProvider";
import "./globals.css";

const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Поток — суперап",
  description: "Личные инструменты для жизни и работы.",
};

export const viewport: Viewport = {
  themeColor: "#F7F5F0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={clsx(display.variable, body.variable)}>
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <AuthSessionProvider>
          <AppShell>{children}</AppShell>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
