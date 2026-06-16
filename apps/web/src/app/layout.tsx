import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/auth/session-provider";
import { ToastProvider } from "@/components/notifications/toast-provider";

export const metadata: Metadata = {
  title: "Enterprise Agent Console",
  description: "Enterprise Agent production operations console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </SessionProvider>
      </body>
    </html>
  );
}
