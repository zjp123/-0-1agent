import {
  Activity,
  Bot,
  Brain,
  ClipboardCheck,
  Gauge,
  GitBranch,
  KeyRound,
  Library,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

const navigation = [
  { label: "Dashboard", icon: Gauge, active: true },
  { label: "Agent Chat", icon: Bot, active: false },
  { label: "Knowledge", icon: Library, active: false },
  { label: "Tools", icon: Wrench, active: false },
  { label: "Workflows", icon: GitBranch, active: false },
  { label: "Security", icon: ShieldCheck, active: false },
  { label: "Evaluations", icon: ClipboardCheck, active: false },
  { label: "Observability", icon: Activity, active: false },
  { label: "Settings", icon: KeyRound, active: false },
];

export function AppShell({ children }: { children: ReactNode }) {
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

            return (
              <a
                key={item.label}
                href="#"
                className={item.active ? "nav-link nav-link-active" : "nav-link"}
              >
                <Icon className="icon-sm" aria-hidden="true" />
                <span>{item.label}</span>
              </a>
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
