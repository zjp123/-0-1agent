import type { ReactNode } from "react";

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-card-header">
        <h2 className="section-card-title">{title}</h2>
        {description ? <p className="section-card-description">{description}</p> : null}
      </div>
      <div className="section-card-body">{children}</div>
    </section>
  );
}
