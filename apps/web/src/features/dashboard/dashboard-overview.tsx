import { Activity, Database, Server, ShieldCheck } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getReadiness, type HealthResponse } from "@/lib/api/client";
import { apiBaseUrl } from "@/lib/config";

function toneForStatus(status?: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "ok") {
    return "success";
  }

  if (status === "disabled") {
    return "warning";
  }

  if (status === "error") {
    return "danger";
  }

  return "neutral";
}

export async function DashboardOverview() {
  let readiness: HealthResponse;
  let errorMessage: string | undefined;

  try {
    readiness = await getReadiness();
  } catch (error) {
    readiness = {
      status: "error",
      service: "enterprise-agent-api",
    };
    errorMessage = error instanceof Error ? error.message : "Failed to load readiness.";
  }

  const databaseStatus = readiness.dependencies?.database?.status;
  const vectorStoreStatus = readiness.dependencies?.vectorStore?.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Enterprise Agent local operations and readiness overview.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={toneForStatus(readiness.status)}>API {readiness.status}</StatusBadge>
          <StatusBadge tone={toneForStatus(databaseStatus)}>DB {databaseStatus ?? "unknown"}</StatusBadge>
          <StatusBadge tone={toneForStatus(vectorStoreStatus)}>Vector {vectorStoreStatus ?? "unknown"}</StatusBadge>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Server} label="API Service" value={readiness.service} status={readiness.status} />
        <MetricTile icon={Database} label="Database" value={databaseStatus ?? "unknown"} status={databaseStatus} />
        <MetricTile icon={Activity} label="Vector Store" value={vectorStoreStatus ?? "unknown"} status={vectorStoreStatus} />
        <MetricTile icon={ShieldCheck} label="Environment" value={readiness.environment ?? "local"} status="ok" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Dependency Details" description="Live readiness data from the API health endpoint.">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="API base URL" value={apiBaseUrl} />
            <DetailItem label="Uptime seconds" value={readiness.uptimeSeconds?.toString() ?? "not reported"} />
            <DetailItem label="Database latency" value={readiness.dependencies?.database?.latencyMs ? `${readiness.dependencies.database.latencyMs} ms` : "not reported"} />
            <DetailItem label="Vector collection" value={readiness.dependencies?.vectorStore?.collection ?? "not reported"} />
          </dl>
        </SectionCard>

        <SectionCard title="Agent Response Preview" description="Markdown rendering is part of the first Web foundation phase.">
          <MarkdownRenderer
            content={[
              "### Streaming-ready Markdown",
              "",
              "- Supports **GFM** content.",
              "- Keeps unsafe HTML filtered.",
              "- Will render streamed Agent messages incrementally.",
              "",
              "`POST /api/agent/run/stream` is the planned SSE endpoint.",
            ].join("\n")}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  status?: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <StatusBadge tone={toneForStatus(status)}>{status ?? "unknown"}</StatusBadge>
      </div>
      <div className="mt-4">
        <div className="text-xs font-medium uppercase text-[var(--muted)]">{label}</div>
        <div className="mt-1 break-words text-base font-semibold text-slate-950">{value}</div>
      </div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}
