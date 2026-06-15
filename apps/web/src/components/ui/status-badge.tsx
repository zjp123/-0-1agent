import type { ReactNode } from "react";

const toneClassName = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof toneClassName;
}) {
  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium ${toneClassName[tone]}`}>
      {children}
    </span>
  );
}
