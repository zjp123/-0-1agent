"use client";

import {
  BookOpen,
  FileJson,
  LockKeyhole,
  RefreshCcw,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getApiDocumentationSummary,
  getOpenApiDocument,
  type ApiDocGroup,
  type ApiDocOperation,
  type ApiDocumentationSummary,
  type OpenApiDocument,
} from "@/lib/api/client";

type MethodTone = "neutral" | "success" | "warning" | "danger";

const methodTone: Record<ApiDocOperation["method"], MethodTone> = {
  get: "success",
  post: "warning",
  patch: "neutral",
  delete: "danger",
};

function countOperations(groups: ApiDocGroup[]): number {
  return groups.reduce((total, group) => total + group.operations.length, 0);
}

function countProtectedOperations(groups: ApiDocGroup[]): number {
  return groups.reduce(
    (total, group) => total + group.operations.filter((operation) => operation.permission).length,
    0,
  );
}

function groupContainsSecurityEntry(group: ApiDocGroup): boolean {
  if (group.tag === "Security" || group.tag === "Governance" || group.tag === "Approvals" || group.tag === "Secrets") {
    return true;
  }
  return group.operations.some(
    (operation) =>
      operation.permission === "auth:manage" ||
      operation.path.startsWith("/auth") ||
      operation.path.startsWith("/governance") ||
      operation.path.startsWith("/secrets"),
  );
}

export function ApiDocsExplorer() {
  const [summary, setSummary] = useState<ApiDocumentationSummary | undefined>();
  const [openApi, setOpenApi] = useState<OpenApiDocument | undefined>();
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  async function refresh(): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const [nextSummary, nextOpenApi] = await Promise.all([
        getApiDocumentationSummary(),
        getOpenApiDocument(),
      ]);
      setSummary(nextSummary);
      setOpenApi(nextOpenApi);
      if (
        selectedTag !== "all" &&
        !nextSummary.groups.some((group) => group.tag === selectedTag)
      ) {
        setSelectedTag("all");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load API documentation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const groups = summary?.groups ?? [];
  const visibleGroups = useMemo(
    () => (selectedTag === "all" ? groups : groups.filter((group) => group.tag === selectedTag)),
    [groups, selectedTag],
  );
  const securityGroups = useMemo(
    () => groups.filter(groupContainsSecurityEntry),
    [groups],
  );
  const schemasCount = openApi?.components?.schemas
    ? Object.keys(openApi.components.schemas).length
    : 0;

  return (
    <div className="api-docs-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">API Docs</h1>
          <p className="dashboard-description">
            Explore platform capability groups, protected operations, and the generated OpenAPI contract.
          </p>
        </div>
        <button type="button" className="refresh-button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className={`icon-sm ${loading ? "spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">API Title</span>
            <BookOpen className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{summary?.title ?? "Loading"}</div>
            <div className="dependency-detail">Version {summary?.version ?? "unknown"}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Groups</span>
            <Route className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{groups.length}</div>
            <div className="dependency-detail">{countOperations(groups)} operations</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Protected</span>
            <LockKeyhole className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{countProtectedOperations(groups)}</div>
            <div className="dependency-detail">RBAC-gated operations</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Schemas</span>
            <FileJson className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{schemasCount}</div>
            <div className="dependency-detail">{openApi?.openapi ?? "OpenAPI"}</div>
          </div>
        </div>
      </section>

      <section className="api-docs-layout">
        <aside className="api-docs-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Groups</h2>
              <p className="section-card-description">Filter by capability area.</p>
            </div>
            <div className="section-card-body api-group-list">
              <button
                type="button"
                className={selectedTag === "all" ? "tool-list-item tool-list-item-active" : "tool-list-item"}
                onClick={() => setSelectedTag("all")}
              >
                <span>All groups</span>
                <StatusBadge>{countOperations(groups)}</StatusBadge>
              </button>
              {groups.map((group) => (
                <button
                  key={group.tag}
                  type="button"
                  className={selectedTag === group.tag ? "tool-list-item tool-list-item-active" : "tool-list-item"}
                  onClick={() => setSelectedTag(group.tag)}
                >
                  <span>{group.tag}</span>
                  <StatusBadge>{group.operations.length}</StatusBadge>
                </button>
              ))}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Security Entries</h2>
              <p className="section-card-description">Sensitive API areas surfaced for governance review.</p>
            </div>
            <div className="section-card-body">
              <ul className="compact-list api-security-list">
                {securityGroups.map((group) => (
                  <li key={group.tag}>
                    <span>{group.tag}</span>
                    <StatusBadge tone="warning">{group.operations.length}</StatusBadge>
                  </li>
                ))}
              </ul>
              {securityGroups.length === 0 ? <div className="empty-state">No security groups loaded.</div> : null}
            </div>
          </section>
        </aside>

        <div className="api-docs-main">
          {visibleGroups.map((group) => (
            <section key={group.tag} className="section-card">
              <div className="section-card-header">
                <h2 className="section-card-title">{group.tag}</h2>
                <p className="section-card-description">{group.operations.length} operations in this capability group.</p>
              </div>
              <div className="section-card-body">
                <div className="dependency-table-wrap">
                  <table className="dependency-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Summary</th>
                        <th>Permission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.operations.map((operation) => (
                        <tr key={operation.operationId}>
                          <td>
                            <StatusBadge tone={methodTone[operation.method]}>
                              {operation.method.toUpperCase()}
                            </StatusBadge>
                          </td>
                          <td>
                            <code className="inline-code">{operation.path}</code>
                            <div className="dependency-detail">{operation.operationId}</div>
                          </td>
                          <td>{operation.summary}</td>
                          <td>
                            {operation.permission ? (
                              <StatusBadge tone="warning">{operation.permission}</StatusBadge>
                            ) : (
                              <StatusBadge>public</StatusBadge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))}

          {visibleGroups.length === 0 ? <div className="empty-state">No API groups loaded.</div> : null}

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">OpenAPI Contract</h2>
              <p className="section-card-description">
                {summary?.openapiUrl ?? "/api/docs/openapi.json"} with generated paths and schemas.
              </p>
            </div>
            <div className="section-card-body">
              {openApi ? (
                <>
                  <div className="badge-row">
                    <StatusBadge tone="success">{openApi.openapi}</StatusBadge>
                    <StatusBadge>{Object.keys(openApi.paths).length} paths</StatusBadge>
                    <StatusBadge>{schemasCount} schemas</StatusBadge>
                    <StatusBadge>{openApi.servers?.[0]?.url ?? "/api"}</StatusBadge>
                  </div>
                  <pre className="code-block api-json-preview">
                    {JSON.stringify(
                      {
                        openapi: openApi.openapi,
                        info: openApi.info,
                        servers: openApi.servers,
                        tags: openApi.tags,
                        pathCount: Object.keys(openApi.paths).length,
                        schemaCount: schemasCount,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </>
              ) : (
                <div className="empty-state">No OpenAPI document loaded.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
