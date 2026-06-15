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
    <div className="min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--line)] bg-[var(--panel)] lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--line)] px-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <Brain className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-950">Enterprise Agent</div>
            <div className="text-xs text-[var(--muted)]">Production Console</div>
          </div>
        </div>

        <nav className="space-y-1 px-3 py-4" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <a
                key={item.label}
                href="#"
                className={[
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  item.active
                    ? "bg-teal-50 text-[var(--accent-strong)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                ].join(" ")}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--line)] bg-white/95 px-4 backdrop-blur md:px-6">
          <div>
            <div className="text-sm font-semibold text-slate-950">Operations Workspace</div>
            <div className="text-xs text-[var(--muted)]">Local API: {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000/api"}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone="success">Local</StatusBadge>
            <StatusBadge tone="neutral">Next.js</StatusBadge>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
