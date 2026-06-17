"use client";

import {
  Activity,
  Clock,
  DatabaseZap,
  RefreshCcw,
  Route,
  Search,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getTraceTimeline,
  listAgentRunHistory,
  listTraceFailures,
  listTraceEvents,
  TRACE_EVENT_TYPES,
  type AuthCredentials,
  type AgentRunHistoryItem,
  type TraceEvent,
  type TraceFailureSummary,
  type TraceTimeline,
  type TraceEventType,
} from "@/lib/api/client";

function formatDate(value?: string): string {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function typeTone(type: TraceEventType) {
  if (type.endsWith(".failed")) {
    return "danger" as const;
  }
  if (type.includes("completed")) {
    return "success" as const;
  }
  if (type.includes("started") || type.includes("created")) {
    return "warning" as const;
  }
  return "neutral" as const;
}

function countByPrefix(events: TraceEvent[], prefix: string): number {
  return events.filter((event) => event.type.startsWith(prefix)).length;
}

function averageDuration(events: TraceEvent[]): number {
  const durations = events
    .map((event) => event.durationMs)
    .filter((value): value is number => typeof value === "number");
  if (durations.length === 0) {
    return 0;
  }
  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
}

export function ObservabilityDashboard() {
  const searchParams = useSearchParams();
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [timeline, setTimeline] = useState<TraceTimeline | undefined>();
  const [failures, setFailures] = useState<TraceFailureSummary[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunHistoryItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [requestId, setRequestId] = useState(searchParams.get("requestId") ?? "");
  const [typeFilter, setTypeFilter] = useState<"all" | TraceEventType>("all");
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const uniqueRequests = new Set(events.map((event) => event.requestId)).size;
  const failureCount = events.filter((event) => event.type.endsWith(".failed")).length;
  const timelineEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  async function refresh(): Promise<void> {
    if (!hasCredentials) {
      setEvents([]);
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
      return;
    }

    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const nextEvents = await listTraceEvents(credentials, {
        requestId: requestId.trim() || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        limit,
      });
      const nextFailures = await listTraceFailures(credentials);
      const nextAgentRuns = await listAgentRunHistory(credentials);
      setEvents(nextEvents);
      setFailures(nextFailures);
      setAgentRuns(nextAgentRuns);
      setTimeline(undefined);
      setSelectedEventId((current) => current || nextEvents[0]?.id || "");
      setSuccessMessage(`Loaded ${nextEvents.length} trace event(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load trace events.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(): Promise<void> {
    if (!hasCredentials || !requestId.trim()) {
      setErrorMessage("Enter a request ID before loading a trace timeline.");
      return;
    }

    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const nextTimeline = await getTraceTimeline(credentials, requestId.trim());
      setTimeline(nextTimeline);
      setEvents(nextTimeline.events);
      setSelectedEventId(nextTimeline.events[0]?.id ?? "");
      setSuccessMessage(`Loaded request timeline with ${nextTimeline.summary.eventCount} event(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load trace timeline.");
    } finally {
      setLoading(false);
    }
  }

  async function openFailureTimeline(failure: TraceFailureSummary): Promise<void> {
    setRequestId(failure.requestId);
    if (!hasCredentials) {
      return;
    }
    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const nextTimeline = await getTraceTimeline(credentials, failure.requestId);
      setTimeline(nextTimeline);
      setEvents(nextTimeline.events);
      setSelectedEventId(nextTimeline.events[0]?.id ?? "");
      setSuccessMessage(`Loaded failed request timeline with ${nextTimeline.summary.eventCount} event(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load failed request timeline.");
    } finally {
      setLoading(false);
    }
  }

  async function openAgentRunTimeline(run: AgentRunHistoryItem): Promise<void> {
    setRequestId(run.requestId);
    if (!hasCredentials) {
      return;
    }
    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const nextTimeline = await getTraceTimeline(credentials, run.requestId);
      setTimeline(nextTimeline);
      setEvents(nextTimeline.events);
      setSelectedEventId(nextTimeline.events[0]?.id ?? "");
      setSuccessMessage(`Loaded agent run timeline with ${nextTimeline.summary.eventCount} event(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load agent run timeline.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="observability-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Observability</h1>
          <p className="dashboard-description">
            Inspect trace events, derived runtime metrics, and the latest task/tool/indexing timeline.
          </p>
        </div>
        <button type="button" className="refresh-button" onClick={() => void refresh()} disabled={loading || !hasCredentials}>
          <RefreshCcw className={`icon-sm ${loading ? "spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}
      {successMessage ? <div className="alert alert-success">{successMessage}</div> : null}
      {!hasCredentials ? (
        <div className="alert alert-neutral">
          Enter an API key or service token, then refresh to load protected trace events.
        </div>
      ) : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Trace Events</span>
            <Activity className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{events.length}</div>
            <div className="dependency-detail">{uniqueRequests} request(s)</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Failures</span>
            <Route className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{failureCount}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Avg Duration</span>
            <Clock className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{averageDuration(events)} ms</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Signals</span>
            <DatabaseZap className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">
              {countByPrefix(events, "agent.")}/{countByPrefix(events, "tool.")}/{countByPrefix(events, "rag.")}
            </div>
            <div className="dependency-detail">agent / tool / rag</div>
          </div>
        </div>
      </section>

      <section className="observability-layout">
        <aside className="observability-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Credentials</h2>
              <p className="section-card-description">Use a token with observability:read.</p>
            </div>
            <div className="section-card-body auth-form">
              <LocalCredentialFields
                apiKey={apiKey}
                serviceToken={serviceToken}
                usingSession={usingSession}
                onApiKeyChange={setApiKey}
                onServiceTokenChange={setServiceToken}
              />
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Filters</h2>
              <p className="section-card-description">Narrow trace events by request, type, or limit.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Request ID</span>
                <input value={requestId} onChange={(event) => setRequestId(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Type</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as "all" | TraceEventType)}
                  className="text-input"
                >
                  <option value="all">all</option>
                  {TRACE_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Limit</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="text-input"
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void loadTimeline()}
                disabled={loading || !hasCredentials || !requestId.trim()}
              >
                <Route className="icon-sm" aria-hidden="true" />
                Load Timeline
              </button>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Event Mix</h2>
              <p className="section-card-description">Derived counts from the current trace query.</p>
            </div>
            <div className="section-card-body">
              <ul className="compact-list api-security-list">
                <li>
                  <span>Agent</span>
                  <StatusBadge>{countByPrefix(events, "agent.")}</StatusBadge>
                </li>
                <li>
                  <span>Model</span>
                  <StatusBadge>{countByPrefix(events, "model.")}</StatusBadge>
                </li>
                <li>
                  <span>Tools</span>
                  <StatusBadge>{countByPrefix(events, "tool.")}</StatusBadge>
                </li>
                <li>
                  <span>RAG</span>
                  <StatusBadge>{countByPrefix(events, "rag.")}</StatusBadge>
                </li>
                <li>
                  <span>Workflow</span>
                  <StatusBadge>{countByPrefix(events, "workflow.")}</StatusBadge>
                </li>
              </ul>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Recent Failures</h2>
              <p className="section-card-description">Failed requests grouped by requestId.</p>
            </div>
            <div className="section-card-body">
              <ul className="compact-list api-security-list">
                {failures.map((failure) => (
                  <li key={failure.requestId}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void openFailureTimeline(failure)}
                    >
                      {failure.requestId}
                    </button>
                    <StatusBadge tone="danger">{failure.failureCount}</StatusBadge>
                  </li>
                ))}
                {failures.length === 0 ? <li>No recent failures.</li> : null}
              </ul>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Agent Runs</h2>
              <p className="section-card-description">Recent runs grouped by requestId.</p>
            </div>
            <div className="section-card-body">
              <ul className="compact-list api-security-list">
                {agentRuns.slice(0, 10).map((run) => (
                  <li key={run.requestId}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void openAgentRunTimeline(run)}
                    >
                      {run.requestId}
                    </button>
                    <StatusBadge tone={run.status === "failed" ? "danger" : run.status === "approval_required" ? "warning" : "success"}>
                      {run.stopReason ?? run.status}
                    </StatusBadge>
                  </li>
                ))}
                {agentRuns.length === 0 ? <li>No agent runs loaded.</li> : null}
              </ul>
            </div>
          </section>
        </aside>

        <div className="observability-main">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Request Timeline</h2>
              <p className="section-card-description">Chronological trace for one requestId.</p>
            </div>
            <div className="section-card-body">
              {timeline ? (
                <>
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Request</dt>
                      <dd className="detail-value">{timeline.requestId}</dd>
                    </div>
                    <div>
                      <dt className="label">Events</dt>
                      <dd className="detail-value">{timeline.summary.eventCount}</dd>
                    </div>
                    <div>
                      <dt className="label">Failures</dt>
                      <dd className="detail-value">{timeline.summary.failureCount}</dd>
                    </div>
                    <div>
                      <dt className="label">Duration</dt>
                      <dd className="detail-value">{timeline.summary.durationMs ?? 0} ms</dd>
                    </div>
                  </dl>
                  <div className="subsection-title">Event Mix</div>
                  <div className="badge-row">
                    {Object.entries(timeline.summary.eventMix).map(([name, count]) => (
                      <StatusBadge key={name}>{`${name}: ${count}`}</StatusBadge>
                    ))}
                  </div>
                  <ol className="event-list">
                    {timeline.events.map((event, index) => (
                      <li key={event.id}>
                        {index + 1}. {event.type}
                        {event.durationMs !== undefined ? `, ${event.durationMs} ms` : ""} / {formatDate(event.timestamp)}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <div className="empty-state">Enter a request ID and load a timeline.</div>
              )}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Trace Events</h2>
              <p className="section-card-description">Structured trace event stream returned by the API.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Request</th>
                      <th>Duration</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timelineEvents.map((event) => (
                      <tr
                        key={event.id}
                        className="clickable-row"
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        <td>
                          <StatusBadge tone={typeTone(event.type)}>{event.type}</StatusBadge>
                        </td>
                        <td>
                          <code className="inline-code">{event.requestId}</code>
                          <div className="dependency-detail">{event.id}</div>
                        </td>
                        <td>{event.durationMs !== undefined ? `${event.durationMs} ms` : "none"}</td>
                        <td>{formatDate(event.timestamp)}</td>
                      </tr>
                    ))}
                    {timelineEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No trace events loaded.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Latest Timeline</h2>
              <p className="section-card-description">Recent tasks, tool calls, indexing events, and workflow runs.</p>
            </div>
            <div className="section-card-body timeline-list">
              {timelineEvents.slice(0, 12).map((event) => (
                <article key={event.id} className="timeline-item">
                  <div className="timeline-marker">
                    {event.type.startsWith("tool.") ? (
                      <Wrench className="icon-sm" aria-hidden="true" />
                    ) : event.type.startsWith("rag.") ? (
                      <DatabaseZap className="icon-sm" aria-hidden="true" />
                    ) : (
                      <Search className="icon-sm" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <div className="dependency-name">{event.type}</div>
                    <div className="dependency-detail">
                      {formatDate(event.timestamp)} / {event.durationMs ?? "no duration"} ms
                    </div>
                    <div className="dependency-detail">{event.requestId}</div>
                  </div>
                </article>
              ))}
              {timelineEvents.length === 0 ? <div className="empty-state">No timeline events loaded.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Selected Event</h2>
              <p className="section-card-description">Raw attributes for debugging and incident review.</p>
            </div>
            <div className="section-card-body">
              {selectedEvent ? (
                <>
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Type</dt>
                      <dd className="detail-value">{selectedEvent.type}</dd>
                    </div>
                    <div>
                      <dt className="label">User</dt>
                      <dd className="detail-value">{selectedEvent.userId ?? "none"}</dd>
                    </div>
                    <div>
                      <dt className="label">Tenant</dt>
                      <dd className="detail-value">{selectedEvent.tenantId ?? "none"}</dd>
                    </div>
                    <div>
                      <dt className="label">Timestamp</dt>
                      <dd className="detail-value">{formatDate(selectedEvent.timestamp)}</dd>
                    </div>
                  </dl>
                  <pre className="code-block api-json-preview">{JSON.stringify(selectedEvent.attributes, null, 2)}</pre>
                </>
              ) : (
                <div className="empty-state">No trace event selected.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
