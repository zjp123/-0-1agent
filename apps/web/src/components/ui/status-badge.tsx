import type { ReactNode } from "react";

const toneClassName = {
  neutral: "badge-neutral",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof toneClassName;
}) {
  return (
    <span className={`badge ${toneClassName[tone]}`}>
      {children}
    </span>
  );
}
