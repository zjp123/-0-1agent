"use client";

import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  acknowledgeSecurityAnomaly,
  ALL_PERMISSIONS,
  createAuthRole,
  listAuthAuditEvents,
  listAuthRoles,
  listSecurityAnomalies,
  listServiceTokens,
  type AuthAuditEvent,
  type AuthCredentials,
  type AuthRole,
  type Permission,
  type SecurityAnomalyEvent,
  type ServiceToken,
} from "@/lib/api/client";

type SecurityData = {
  roles: AuthRole[];
  serviceTokens: ServiceToken[];
  auditEvents: AuthAuditEvent[];
  anomalies: SecurityAnomalyEvent[];
};

const emptyData: SecurityData = {
  roles: [],
  serviceTokens: [],
  auditEvents: [],
  anomalies: [],
};

function formatDate(value?: string): string {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

export function SecurityGovernance() {
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [data, setData] = useState<SecurityData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | undefined>();
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

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);

  const breakGlassRoles = data.roles.filter((role) => role.name.includes("break_glass"));
  const breakGlassTokens = data.serviceTokens.filter((token) => token.roles.includes("break_glass"));
  const activeCriticalAnomalies = data.anomalies.filter(
    (event) => event.severity === "critical" && !event.acknowledged,
  );

  async function refresh(): Promise<void> {
    if (!hasCredentials) {
      setData(emptyData);
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
      return;
    }

    setLoading(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const [roles, serviceTokens, auditEvents, anomalies] = await Promise.all([
        listAuthRoles(credentials),
        listServiceTokens(credentials),
        listAuthAuditEvents(credentials, { limit: 25 }),
        listSecurityAnomalies(credentials, { limit: 25 }),
      ]);
      setData({
        roles,
        serviceTokens,
        auditEvents: auditEvents.items,
        anomalies: anomalies.items,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load security governance data.");
    } finally {
      setLoading(false);
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
            <div className="metric-value">{data.auditEvents.length}</div>
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
              <h2 className="section-card-title">Audit Events</h2>
              <p className="section-card-description">Recent auth governance decisions with reason/comment metadata.</p>
            </div>
            <div className="section-card-body">
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
                    {data.auditEvents.map((event) => (
                      <tr key={event.id}>
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
                    {data.auditEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No audit events loaded.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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
