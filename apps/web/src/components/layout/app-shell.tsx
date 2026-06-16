"use client";

import {
  Activity,
  Bot,
  Brain,
  ClipboardCheck,
  FileText,
  Gauge,
  GitBranch,
  KeyRound,
  Library,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

const navigation = [
  { label: "Dashboard", icon: Gauge, href: "/" },
  { label: "API Docs", icon: FileText, href: "/api-docs" },
  { label: "Agent Chat", icon: Bot, href: "/agent-chat" },
  { label: "Knowledge", icon: Library, href: "/knowledge" },
  { label: "Tools", icon: Wrench, href: "/tools" },
  { label: "Workflows", icon: GitBranch, href: "/workflows" },
  { label: "Security", icon: ShieldCheck, href: "/security" },
  { label: "Evaluations", icon: ClipboardCheck, href: "#" },
  { label: "Observability", icon: Activity, href: "#" },
  { label: "Settings", icon: KeyRound, href: "#" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const className = isActive ? "nav-link nav-link-active" : "nav-link";

            return item.href === "#" ? (
              <a
                key={item.label}
                href="#"
                className={className}
              >
                <Icon className="icon-sm" aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            ) : (
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
            <div className="topbar-meta">Local API: {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000/api"}</div>
          </div>
          <div className="topbar-actions">
            <StatusBadge tone="success">Local</StatusBadge>
            <StatusBadge tone="neutral">Next.js</StatusBadge>
          </div>
        </header>

        <main className="page-main">{children}</main>
      </div>
    </div>
  );
}
