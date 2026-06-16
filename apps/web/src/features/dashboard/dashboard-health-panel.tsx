"use client";

import { Activity, Database, RefreshCcw, Server, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getReadiness, type HealthResponse } from "@/lib/api/client";
import { apiBaseUrl, webConfig } from "@/lib/config";

type StatusTone = "success" | "warning" | "danger" | "neutral";
type LoadState = "idle" | "loading" | "success" | "error";

const fallbackReadiness: HealthResponse = {
  status: "error",
  service: "enterprise-agent-api",
};

function toneForStatus(status?: string): StatusTone {
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

export function DashboardHealthPanel() {
  const [readiness, setReadiness] = useState<HealthResponse>(fallbackReadiness);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | undefined>();

  const refresh = useCallback(async () => {
    setLoadState((current) => (current === "success" ? "idle" : "loading"));
    setErrorMessage(undefined);

    try {
      const response = await getReadiness();
      setReadiness(response);
      setLastUpdatedAt(new Date());
      setLoadState("success");
    } catch (error) {
      setReadiness(fallbackReadiness);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load readiness.");
      setLastUpdatedAt(new Date());
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const databaseStatus = readiness.dependencies?.database?.status;
  const vectorStoreStatus = readiness.dependencies?.vectorStore?.status;

  const dependencies = useMemo(
    () => [
      {
        name: "Database",
        status: databaseStatus ?? "unknown",
        details: readiness.dependencies?.database?.message ?? `${readiness.dependencies?.database?.latencyMs ?? "n/a"} ms latency`,
      },
      {
        name: "Vector Store",
        status: vectorStoreStatus ?? "unknown",
        details: readiness.dependencies?.vectorStore?.message ?? readiness.dependencies?.vectorStore?.collection ?? "No collection reported",
      },
    ],
    [databaseStatus, readiness.dependencies?.database, readiness.dependencies?.vectorStore, vectorStoreStatus],
  );

  const isLoading = loadState === "loading";

  return (
    <div className="health-panel">
      <div className="health-toolbar">
        <div className="badge-row">
          <StatusBadge tone={toneForStatus(readiness.status)}>API {readiness.status}</StatusBadge>
          <StatusBadge tone={toneForStatus(databaseStatus)}>DB {databaseStatus ?? "unknown"}</StatusBadge>
          <StatusBadge tone={toneForStatus(vectorStoreStatus)}>Vector {vectorStoreStatus ?? "unknown"}</StatusBadge>
        </div>
        <div className="health-actions">
          <span className="muted">Updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "not yet"}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="refresh-button"
          >
            <RefreshCcw className={`icon-sm ${isLoading ? "spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-danger">{errorMessage}</div>
      ) : null}

      {webConfig.warnings.map((warning) => (
        <div key={warning} className="alert alert-warning">
          {warning}
        </div>
      ))}

      {isLoading ? <LoadingState /> : null}

      <div className="metric-grid">
        <MetricTile icon={Server} label="API Service" value={readiness.service} status={readiness.status} />
        <MetricTile icon={Database} label="Database" value={databaseStatus ?? "unknown"} status={databaseStatus} />
        <MetricTile icon={Activity} label="Vector Store" value={vectorStoreStatus ?? "unknown"} status={vectorStoreStatus} />
        <MetricTile icon={ShieldCheck} label="Environment" value={readiness.environment ?? "local"} status="ok" />
      </div>

      <div className="grid-panel">
        <SectionCard title="Dependency Details" description="Live readiness data from the API health endpoint.">
          <div className="dependency-table-wrap">
            <table className="dependency-table">
              <thead>
                <tr>
                  <th>Dependency</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {dependencies.map((dependency) => (
                  <tr key={dependency.name}>
                    <td className="dependency-name">{dependency.name}</td>
                    <td>
                      <StatusBadge tone={toneForStatus(dependency.status)}>{dependency.status}</StatusBadge>
                    </td>
                    <td className="dependency-detail">{dependency.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="details-grid">
            <DetailItem label="API base URL" value={apiBaseUrl} />
            <DetailItem label="Web profile" value={webConfig.webEnvironment} />
            <DetailItem label="Uptime seconds" value={readiness.uptimeSeconds?.toString() ?? "not reported"} />
            <DetailItem label="Service timestamp" value={readiness.timestamp ?? "not reported"} />
            <DetailItem label="Load state" value={loadState} />
          </dl>
        </SectionCard>

        <SectionCard title="Agent Response Preview" description="Markdown rendering is ready for streamed Agent messages.">
          <MarkdownRenderer
            content={[
              "### Streaming-ready Markdown",
              "",
              "- Supports **GFM** content.",
              "- Keeps unsafe HTML filtered.",
              "- Can render Agent messages as chunks arrive.",
              "",
              "| Endpoint | Purpose |",
              "| --- | --- |",
              "| `POST /api/agent/run/stream` | SSE Agent output |",
            ].join("\n")}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="alert alert-neutral">
      Loading latest readiness data...
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
    <section className="metric-tile">
      <div className="metric-head">
        <div className="metric-icon">
          <Icon className="icon-sm" aria-hidden="true" />
        </div>
        <StatusBadge tone={toneForStatus(status)}>{status ?? "unknown"}</StatusBadge>
      </div>
      <div className="metric-body">
        <div className="label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="detail-value">{value}</dd>
    </div>
  );
}
