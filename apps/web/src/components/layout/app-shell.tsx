"use client";

import {
  Activity,
  Bot,
  Brain,
  ClipboardCheck,
  FileText,
  GitBranch,
  KeyRound,
  Library,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Permission } from "@/lib/api/client";
import { webConfig } from "@/lib/config";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "API Docs", icon: FileText, href: "/api-docs" },
  { label: "Agent Chat", icon: Bot, href: "/agent-chat", permission: "agent:run" },
  { label: "Knowledge", icon: Library, href: "/knowledge", permission: "knowledge:read" },
  { label: "Tools", icon: Wrench, href: "/tools", permission: "tools:execute" },
  { label: "Workflows", icon: GitBranch, href: "/workflows", permission: "workflow:manage" },
  { label: "Security", icon: ShieldCheck, href: "/security", permission: "auth:manage" },
  { label: "Evaluations", icon: ClipboardCheck, href: "/evaluations", permission: "evaluation:manage" },
  { label: "Observability", icon: Activity, href: "/observability", permission: "observability:read" },
  { label: "Login", icon: KeyRound, href: "/login" },
] satisfies Array<{ label: string; icon: typeof LayoutDashboard; href: string; permission?: Permission }>;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, status, hasPermission, logout } = useSession();
  const visibleNavigation = navigation.filter(
    (item) => !item.permission || status !== "authenticated" || hasPermission(item.permission),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Brain className="icon-md" aria-hidden="true" />
          </div>
          <div>
            <div className="brand-title">Enterprise Agent</div>
            <div className="brand-subtitle">Production Console</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const className = isActive ? "nav-link nav-link-active" : "nav-link";

            return (
            <Link key={item.label} href={item.href} className={className}>
              <Icon className="icon-sm" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
          })}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div>
            <div className="topbar-title">Operations Workspace</div>
            <div className="topbar-meta">
              {user
                ? `${user.userId} / ${user.tenantId}`
                : `${webConfig.webEnvironment} API: ${webConfig.apiBaseUrl}`}
            </div>
          </div>
          <div className="topbar-actions">
            <StatusBadge tone={status === "authenticated" ? "success" : "neutral"}>
              {status === "authenticated" ? user?.authType ?? "session" : status}
            </StatusBadge>
            <StatusBadge tone={webConfig.isProductionProfile ? "success" : "neutral"}>
              {webConfig.webEnvironment}
            </StatusBadge>
            <StatusBadge tone="neutral">Next.js</StatusBadge>
            {status === "authenticated" ? (
              <button type="button" className="icon-button" onClick={() => void logout()} aria-label="Sign out">
                <LogOut className="icon-sm" aria-hidden="true" />
              </button>
            ) : (
              <Link href="/login" className="refresh-button">
                <KeyRound className="icon-sm" aria-hidden="true" />
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="page-main">{children}</main>
      </div>
    </div>
  );
}
