"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Search,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  acknowledgeSecurityAnomaly,
  ALL_PERMISSIONS,
  createAuthRole,
  decideApprovalRequest,
  exportAuthAuditEvents,
  listAgentRunHistory,
  listApprovalRequests,
  listAuthAuditEvents,
  listAuthRoles,
  listSecurityAnomalies,
  listServiceTokens,
  type AuthAuditEvent,
  type AuthAuditEventList,
  type AuthAuditEventQuery,
  type AuthCredentials,
  type AuthRole,
  type AgentRunHistoryItem,
  type ApprovalRequest,
  type Permission,
  type SecurityAnomalyEvent,
  type ServiceToken,
} from "@/lib/api/client";

type SecurityData = {
  roles: AuthRole[];
  serviceTokens: ServiceToken[];
  anomalies: SecurityAnomalyEvent[];
  approvalRequests: ApprovalRequest[];
  agentRuns: AgentRunHistoryItem[];
};

const emptyData: SecurityData = {
  roles: [],
  serviceTokens: [],
  anomalies: [],
  approvalRequests: [],
  agentRuns: [],
};

const defaultAuditQuery = {
  limit: 25,
  offset: 0,
  action: "",
  targetType: "",
  targetId: "",
  actorUserId: "",
  from: "",
  to: "",
};

type AuditFilterState = typeof defaultAuditQuery;

function formatDate(value?: string): string {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeLocalToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toAuditQuery(filters: AuditFilterState): AuthAuditEventQuery {
  return {
    limit: filters.limit,
    offset: filters.offset,
    action: filters.action.trim() || undefined,
    targetType: filters.targetType.trim() || undefined,
    targetId: filters.targetId.trim() || undefined,
    actorUserId: filters.actorUserId.trim() || undefined,
    from: dateTimeLocalToIso(filters.from),
    to: dateTimeLocalToIso(filters.to),
  };
}

function severityTone(severity: SecurityAnomalyEvent["severity"]) {
  if (severity === "critical") {
    return "danger" as const;
  }
  if (severity === "warning") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function approvalTone(status: ApprovalRequest["status"]) {
  if (status === "approved") {
    return "success" as const;
  }
  if (status === "pending") {
    return "warning" as const;
  }
  return "danger" as const;
}

function runTone(status: AgentRunHistoryItem["status"]) {
  if (status === "failed") {
    return "danger" as const;
  }
  if (status === "approval_required") {
    return "warning" as const;
  }
  return "success" as const;
}

export function SecurityGovernance() {
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [data, setData] = useState<SecurityData>(emptyData);
  const [auditEvents, setAuditEvents] = useState<AuthAuditEventList>({
    items: [],
    limit: defaultAuditQuery.limit,
    offset: defaultAuditQuery.offset,
  });
  const [auditFilters, setAuditFilters] = useState<AuditFilterState>(defaultAuditQuery);
  const [selectedAuditEventId, setSelectedAuditEventId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | undefined>();
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleReason, setRoleReason] = useState("SECURITY-GOVERNANCE: local console role creation");
  const [roleComment, setRoleComment] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([
    "knowledge:read",
    "observability:read",
  ]);
  const [ackComment, setAckComment] = useState("Acknowledged from Web security console.");
  const [approvalComment, setApprovalComment] = useState("Reviewed from Web security console.");

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);

  const breakGlassRoles = data.roles.filter((role) => role.name.includes("break_glass"));
  const breakGlassTokens = data.serviceTokens.filter((token) => token.roles.includes("break_glass"));
  const activeCriticalAnomalies = data.anomalies.filter(
    (event) => event.severity === "critical" && !event.acknowledged,
  );
  const pendingApprovals = data.approvalRequests.filter((request) => request.status === "pending");
  const approvalRequiredRuns = data.agentRuns.filter((run) => run.status === "approval_required");
  const selectedAuditEvent = auditEvents.items.find((event) => event.id === selectedAuditEventId);

  async function refresh(): Promise<void> {
    if (!hasCredentials) {
      setData(emptyData);
      setAuditEvents({
        items: [],
        limit: auditFilters.limit,
        offset: auditFilters.offset,
      });
      setSelectedAuditEventId(undefined);
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
      return;
    }

    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const [roles, serviceTokens, nextAuditEvents, anomalies, approvalRequests, agentRuns] = await Promise.all([
        listAuthRoles(credentials),
        listServiceTokens(credentials),
        listAuthAuditEvents(credentials, toAuditQuery(auditFilters)),
        listSecurityAnomalies(credentials, { limit: 25 }),
        listApprovalRequests(credentials),
        listAgentRunHistory(credentials),
      ]);
      setData({
        roles,
        serviceTokens,
        anomalies: anomalies.items,
        approvalRequests,
        agentRuns,
      });
      setAuditEvents(nextAuditEvents);
      setSelectedAuditEventId((current) =>
        current && nextAuditEvents.items.some((event) => event.id === current)
          ? current
          : nextAuditEvents.items[0]?.id,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load security governance data.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAuditEvents(nextFilters = auditFilters): Promise<void> {
    if (!hasCredentials) {
      setAuditEvents({
        items: [],
        limit: nextFilters.limit,
        offset: nextFilters.offset,
      });
      setSelectedAuditEventId(undefined);
      return;
    }

    setAuditLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const result = await listAuthAuditEvents(credentials, toAuditQuery(nextFilters));
      setAuditEvents(result);
      setSelectedAuditEventId((current) =>
        current && result.items.some((event) => event.id === current)
          ? current
          : result.items[0]?.id,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to query audit events.");
    } finally {
      setAuditLoading(false);
    }
  }

  function updateAuditFilter<K extends keyof AuditFilterState>(
    key: K,
    value: AuditFilterState[K],
  ): void {
    setAuditFilters((current) => ({
      ...current,
      [key]: value,
      offset: key === "offset" ? value as number : 0,
    }));
  }

  async function submitAuditSearch(): Promise<void> {
    const nextFilters = { ...auditFilters, offset: 0 };
    setAuditFilters(nextFilters);
    await refreshAuditEvents(nextFilters);
  }

  async function clearAuditSearch(): Promise<void> {
    setAuditFilters(defaultAuditQuery);
    await refreshAuditEvents(defaultAuditQuery);
  }

  async function moveAuditPage(offset: number): Promise<void> {
    const nextFilters = { ...auditFilters, offset };
    setAuditFilters(nextFilters);
    await refreshAuditEvents(nextFilters);
  }

  async function exportAuditEvents(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before exporting audit events.");
      return;
    }
    setExporting(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const csv = await exportAuthAuditEvents(credentials, toAuditQuery(auditFilters));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-events-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccessMessage("Audit events exported successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to export audit events.");
    } finally {
      setExporting(false);
    }
  }

  function togglePermission(permission: Permission): void {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  async function submitRole(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before creating a role.");
      return;
    }

    const trimmedName = roleName.trim();
    if (!trimmedName || selectedPermissions.length === 0 || !roleReason.trim()) {
      setErrorMessage("Role name, permissions, and reason are required.");
      return;
    }

    setCreating(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const created = await createAuthRole({
        ...credentials,
        name: trimmedName,
        description: roleDescription.trim() || undefined,
        permissions: selectedPermissions,
        reason: roleReason.trim(),
        comment: roleComment.trim() || undefined,
      });
      setRoleName("");
      setRoleDescription("");
      setRoleComment("");
      setSuccessMessage(`Created role ${created.name}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create role.");
    } finally {
      setCreating(false);
    }
  }

  async function acknowledge(eventId: string): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before acknowledging an anomaly.");
      return;
    }

    setAcknowledgingId(eventId);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      await acknowledgeSecurityAnomaly({
        ...credentials,
        eventId,
        comment: ackComment.trim() || undefined,
      });
      setSuccessMessage("Security anomaly acknowledged.");
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to acknowledge anomaly.");
    } finally {
      setAcknowledgingId(undefined);
    }
  }

  async function decideApproval(requestId: string, decision: "approve" | "reject"): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before deciding an approval request.");
      return;
    }

    setDecidingApprovalId(requestId);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      await decideApprovalRequest({
        ...credentials,
        requestId,
        decision,
        comment: approvalComment.trim() || undefined,
      });
      setSuccessMessage(`Approval request ${decision}d.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to decide approval request.");
    } finally {
      setDecidingApprovalId(undefined);
    }
  }

  return (
    <div className="security-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Security Governance</h1>
          <p className="dashboard-description">
            Manage auth roles, inspect service tokens, review audit events, and triage security anomalies.
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
          Enter an API key or service token, then refresh to load protected security governance data.
        </div>
      ) : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Roles</span>
            <ShieldCheck className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.roles.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Service Tokens</span>
            <KeyRound className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.serviceTokens.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Open Critical</span>
            <AlertTriangle className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{activeCriticalAnomalies.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Audit Events</span>
            <CheckCircle2 className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{auditEvents.items.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Pending Approvals</span>
            <ShieldCheck className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{pendingApprovals.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Approval Runs</span>
            <AlertTriangle className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{approvalRequiredRuns.length}</div>
          </div>
        </div>
      </section>

      {breakGlassRoles.length > 0 || breakGlassTokens.length > 0 ? (
        <section className="break-glass-warning">
          <AlertTriangle className="icon-md" aria-hidden="true" />
          <div>
            <h2>Break-glass access detected</h2>
            <p>
              {breakGlassRoles.length} role(s) and {breakGlassTokens.length} service token(s) can bypass normal
              least-privilege controls. Keep reason/comment fields explicit before sensitive operations.
            </p>
          </div>
        </section>
      ) : null}

      <section className="security-layout">
        <div className="security-main">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Roles</h2>
              <p className="section-card-description">Tenant-scoped RBAC roles and granted permissions.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Permissions</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roles.map((role) => (
                      <tr key={role.id}>
                        <td>
                          <div className="dependency-name">{role.name}</div>
                          <div className="dependency-detail">{role.description || role.id}</div>
                        </td>
                        <td>
                          <div className="badge-row">
                            {role.permissions.map((permission) => (
                              <StatusBadge key={permission}>{permission}</StatusBadge>
                            ))}
                          </div>
                        </td>
                        <td>{formatDate(role.updatedAt)}</td>
                      </tr>
                    ))}
                    {data.roles.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <div className="table-empty">No roles loaded.</div>
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
              <h2 className="section-card-title">Service Tokens</h2>
              <p className="section-card-description">Operational tokens are read-only in this first console slice.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Roles</th>
                      <th>Status</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.serviceTokens.map((token) => (
                      <tr key={token.id}>
                        <td>
                          <div className="dependency-name">{token.name}</div>
                          <div className="dependency-detail">{token.id}</div>
                        </td>
                        <td>{token.roles.join(", ") || "none"}</td>
                        <td>
                          <StatusBadge tone={token.enabled ? "success" : "warning"}>
                            {token.enabled ? "enabled" : "disabled"}
                          </StatusBadge>
                        </td>
                        <td>{formatDate(token.expiresAt)}</td>
                      </tr>
                    ))}
                    {data.serviceTokens.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No service tokens loaded.</div>
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
              <h2 className="section-card-title">Security Anomalies</h2>
              <p className="section-card-description">Review and acknowledge suspicious security events.</p>
            </div>
            <div className="section-card-body anomaly-list">
              <label>
                <span className="label">Acknowledge comment</span>
                <input
                  value={ackComment}
                  onChange={(event) => setAckComment(event.target.value)}
                  className="text-input"
                />
              </label>
              {data.anomalies.map((event) => (
                <article key={event.id} className="anomaly-item">
                  <div className="anomaly-head">
                    <div>
                      <div className="dependency-name">{event.message}</div>
                      <div className="dependency-detail">
                        {event.category} / {event.action} / {formatDate(event.createdAt)}
                      </div>
                    </div>
                    <div className="badge-row">
                      <StatusBadge tone={severityTone(event.severity)}>{event.severity}</StatusBadge>
                      <StatusBadge tone={event.acknowledged ? "success" : "warning"}>
                        {event.acknowledged ? "acknowledged" : "open"}
                      </StatusBadge>
                    </div>
                  </div>
                  <pre className="code-block compact-code">{JSON.stringify(event.metadata, null, 2)}</pre>
                  {!event.acknowledged ? (
                    <button
                      type="button"
                      className="refresh-button"
                      onClick={() => void acknowledge(event.id)}
                      disabled={acknowledgingId === event.id || !hasCredentials}
                    >
                      <CheckCircle2 className="icon-sm" aria-hidden="true" />
                      Acknowledge
                    </button>
                  ) : null}
                </article>
              ))}
              {data.anomalies.length === 0 ? <div className="empty-state">No security anomalies loaded.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Approval Requests</h2>
              <p className="section-card-description">Human-in-the-loop governance for high-risk operations.</p>
            </div>
            <div className="section-card-body anomaly-list">
              <label>
                <span className="label">Decision comment</span>
                <input
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  className="text-input"
                />
              </label>
              {data.approvalRequests.map((request) => (
                <article key={request.id} className="anomaly-item">
                  <div className="anomaly-head">
                    <div>
                      <div className="dependency-name">{request.action}</div>
                      <div className="dependency-detail">
                        {request.resourceType} / {request.resourceId ?? "none"} / {formatDate(request.createdAt)}
                      </div>
                      <div className="dependency-detail">{request.reason}</div>
                    </div>
                    <div className="badge-row">
                      <StatusBadge tone={approvalTone(request.status)}>{request.status}</StatusBadge>
                      <StatusBadge>{`${request.approvals.length}/${request.requiredApprovals}`}</StatusBadge>
                    </div>
                  </div>
                  <pre className="code-block compact-code">{JSON.stringify(request.payload, null, 2)}</pre>
                  {request.status === "pending" ? (
                    <div className="button-row">
                      <button
                        type="button"
                        className="refresh-button"
                        onClick={() => void decideApproval(request.id, "approve")}
                        disabled={decidingApprovalId === request.id || !hasCredentials}
                      >
                        <CheckCircle2 className="icon-sm" aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        type="button"
                        className="refresh-button"
                        onClick={() => void decideApproval(request.id, "reject")}
                        disabled={decidingApprovalId === request.id || !hasCredentials}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {data.approvalRequests.length === 0 ? <div className="empty-state">No approval requests loaded.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Agent Run Governance</h2>
              <p className="section-card-description">Recent Agent runs with preflight, usage, and approval state.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Status</th>
                      <th>Usage</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentRuns.slice(0, 25).map((run) => (
                      <tr key={run.requestId}>
                        <td>
                          <Link className="link-button" href={`/observability?requestId=${run.requestId}`}>
                            {run.requestId}
                          </Link>
                          <div className="dependency-detail">
                            preflight {run.preflightAllowed === false ? "blocked" : "ok"} / usage {run.usageRecorded ? "recorded" : "none"}
                          </div>
                        </td>
                        <td>
                          <StatusBadge tone={runTone(run.status)}>{run.stopReason ?? run.status}</StatusBadge>
                        </td>
                        <td>{run.totalTokens ?? 0} tokens</td>
                        <td>{formatDate(run.completedAt)}</td>
                      </tr>
                    ))}
                    {data.agentRuns.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No agent runs loaded.</div>
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
              <h2 className="section-card-title">Audit Events</h2>
              <p className="section-card-description">Query who changed what, when, and why across auth and MCP governance.</p>
            </div>
            <div className="section-card-body audit-query-panel">
              <div className="audit-filter-grid">
                <label>
                  <span className="label">Action</span>
                  <input
                    value={auditFilters.action}
                    onChange={(event) => updateAuditFilter("action", event.target.value)}
                    className="text-input"
                    placeholder="tools.mcp.update"
                  />
                </label>
                <label>
                  <span className="label">Actor</span>
                  <input
                    value={auditFilters.actorUserId}
                    onChange={(event) => updateAuditFilter("actorUserId", event.target.value)}
                    className="text-input"
                    placeholder="user@example.com"
                  />
                </label>
                <label>
                  <span className="label">Target type</span>
                  <input
                    value={auditFilters.targetType}
                    onChange={(event) => updateAuditFilter("targetType", event.target.value)}
                    className="text-input"
                    placeholder="mcp_server"
                  />
                </label>
                <label>
                  <span className="label">Target ID</span>
                  <input
                    value={auditFilters.targetId}
                    onChange={(event) => updateAuditFilter("targetId", event.target.value)}
                    className="text-input"
                    placeholder="github"
                  />
                </label>
                <label>
                  <span className="label">From</span>
                  <input
                    value={auditFilters.from}
                    onChange={(event) => updateAuditFilter("from", event.target.value)}
                    className="text-input"
                    type="datetime-local"
                  />
                </label>
                <label>
                  <span className="label">To</span>
                  <input
                    value={auditFilters.to}
                    onChange={(event) => updateAuditFilter("to", event.target.value)}
                    className="text-input"
                    type="datetime-local"
                  />
                </label>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void submitAuditSearch()}
                  disabled={auditLoading || !hasCredentials}
                >
                  <Search className="icon-sm" aria-hidden="true" />
                  Search
                </button>
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void clearAuditSearch()}
                  disabled={auditLoading || !hasCredentials}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void exportAuditEvents()}
                  disabled={exporting || auditLoading || !hasCredentials}
                >
                  <Download className="icon-sm" aria-hidden="true" />
                  {exporting ? "Exporting..." : "Export CSV"}
                </button>
              </div>

              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Reason</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.items.map((event) => (
                      <tr
                        key={event.id}
                        className={event.id === selectedAuditEventId ? "clickable-row table-row-active" : "clickable-row"}
                        onClick={() => setSelectedAuditEventId(event.id)}
                      >
                        <td>
                          <div className="dependency-name">{event.action}</div>
                          <div className="dependency-detail">{event.actorUserId}</div>
                        </td>
                        <td>
                          {event.targetType}
                          <div className="dependency-detail">{event.targetId}</div>
                        </td>
                        <td>
                          {event.reason}
                          {event.comment ? <div className="dependency-detail">{event.comment}</div> : null}
                        </td>
                        <td>{formatDate(event.createdAt)}</td>
                      </tr>
                    ))}
                    {auditEvents.items.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No audit events loaded.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="pagination-row">
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void moveAuditPage(Math.max(0, auditEvents.offset - auditEvents.limit))}
                  disabled={auditLoading || auditEvents.offset === 0}
                >
                  Previous
                </button>
                <span className="pagination-label">
                  {auditEvents.items.length === 0
                    ? "0 results"
                    : `${auditEvents.offset + 1}-${auditEvents.offset + auditEvents.items.length}`}
                </span>
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void moveAuditPage(auditEvents.nextOffset ?? auditEvents.offset)}
                  disabled={auditLoading || auditEvents.nextOffset === undefined}
                >
                  Next
                </button>
              </div>
              {selectedAuditEvent ? (
                <div className="audit-detail-card">
                  <div>
                    <div className="dependency-name">{selectedAuditEvent.action}</div>
                    <div className="dependency-detail">
                      {selectedAuditEvent.actorUserId} / {selectedAuditEvent.actorAuthType} / {formatDate(selectedAuditEvent.createdAt)}
                    </div>
                  </div>
                  <dl className="details-grid single">
                    <div>
                      <dt className="label">Target</dt>
                      <dd className="detail-value">{selectedAuditEvent.targetType} / {selectedAuditEvent.targetId}</dd>
                    </div>
                    <div>
                      <dt className="label">Reason</dt>
                      <dd className="detail-value">{selectedAuditEvent.reason}</dd>
                    </div>
                    {selectedAuditEvent.comment ? (
                      <div>
                        <dt className="label">Comment</dt>
                        <dd className="detail-value">{selectedAuditEvent.comment}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <pre className="code-block compact-code">{JSON.stringify(selectedAuditEvent.metadata, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="security-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Credentials</h2>
              <p className="section-card-description">Use a local admin service token for protected auth endpoints.</p>
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
              <h2 className="section-card-title">Create Role</h2>
              <p className="section-card-description">Every mutation requires an auditable reason.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Role name</span>
                <input value={roleName} onChange={(event) => setRoleName(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Description</span>
                <input
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                  className="text-input"
                />
              </label>
              <div>
                <span className="label">Permissions</span>
                <div className="permission-grid">
                  {ALL_PERMISSIONS.map((permission) => (
                    <label key={permission} className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                      <span>{permission}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label>
                <span className="label">Reason</span>
                <input
                  value={roleReason}
                  onChange={(event) => setRoleReason(event.target.value)}
                  className="text-input"
                />
              </label>
              <label>
                <span className="label">Comment</span>
                <textarea
                  value={roleComment}
                  onChange={(event) => setRoleComment(event.target.value)}
                  className="composer-input"
                  rows={4}
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitRole()}
                disabled={creating || !hasCredentials}
              >
                <Plus className="icon-sm" aria-hidden="true" />
                Create Role
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
