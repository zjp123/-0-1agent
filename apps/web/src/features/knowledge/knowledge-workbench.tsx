"use client";

import {
  BookOpen,
  DatabaseZap,
  FileText,
  Play,
  RefreshCcw,
  Search,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  enqueueKnowledgeReindex,
  getIndexingWorkerAlerts,
  getIndexingWorkerStatus,
  ingestKnowledge,
  listIndexingJobs,
  listKnowledgeDocuments,
  retrieveKnowledge,
  type AuthCredentials,
  type IndexingJob,
  type IndexingWorkerAlerts,
  type IndexingWorkerStatus,
  type KnowledgeDocument,
  type KnowledgeSearchResult,
  type KnowledgeSourceType,
} from "@/lib/api/client";

type KnowledgeData = {
  documents: KnowledgeDocument[];
  jobs: IndexingJob[];
  workerStatus?: IndexingWorkerStatus;
  workerAlerts?: IndexingWorkerAlerts;
};

const emptyData: KnowledgeData = {
  documents: [],
  jobs: [],
};

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function formatDate(value?: string): string {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function jobTone(status: IndexingJob["status"]) {
  if (status === "completed") {
    return "success" as const;
  }
  if (status === "failed" || status === "cancelled") {
    return "danger" as const;
  }
  if (status === "running") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function alertTone(status?: IndexingWorkerAlerts["status"]) {
  if (status === "critical") {
    return "danger" as const;
  }
  if (status === "warning") {
    return "warning" as const;
  }
  return "success" as const;
}

export function KnowledgeWorkbench() {
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [data, setData] = useState<KnowledgeData>(emptyData);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [title, setTitle] = useState("Enterprise Agent Runbook");
  const [content, setContent] = useState(
    "This document describes how operators test the enterprise agent knowledge base locally.",
  );
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("manual");
  const [sourceUri, setSourceUri] = useState("local://runbook");
  const [tagsText, setTagsText] = useState("runbook,local");
  const [query, setQuery] = useState("enterprise agent knowledge base");
  const [queryTagsText, setQueryTagsText] = useState("");
  const [limit, setLimit] = useState(5);

  const credentials = useMemo<AuthCredentials>(
    () => ({
      apiKey: apiKey.trim() || undefined,
      serviceToken: serviceToken.trim() || undefined,
    }),
    [apiKey, serviceToken],
  );
  const hasCredentials = Boolean(credentials.apiKey || credentials.serviceToken);
  const totalChunks = data.jobs.reduce((total, job) => total + job.totalChunks, 0);
  const processedChunks = data.jobs.reduce((total, job) => total + job.processedChunks, 0);

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
      const [documents, jobs, workerStatus, workerAlerts] = await Promise.all([
        listKnowledgeDocuments(credentials),
        listIndexingJobs(credentials),
        getIndexingWorkerStatus(credentials),
        getIndexingWorkerAlerts(credentials),
      ]);
      setData({ documents, jobs, workerStatus, workerAlerts });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load knowledge data.");
    } finally {
      setLoading(false);
    }
  }

  async function submitIngest(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before ingesting knowledge.");
      return;
    }
    if (!title.trim() || !content.trim()) {
      setErrorMessage("Title and content are required.");
      return;
    }

    setIngesting(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const response = await ingestKnowledge({
        ...credentials,
        title: title.trim(),
        content: content.trim(),
        sourceType,
        sourceUri: sourceUri.trim() || undefined,
        tags: parseTags(tagsText),
      });
      setSuccessMessage(`Ingested ${response.document.title} with ${response.chunks.length} chunk(s).`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Knowledge ingestion failed.");
    } finally {
      setIngesting(false);
    }
  }

  async function submitRetrieve(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before retrieval.");
      return;
    }
    if (!query.trim()) {
      setErrorMessage("Retrieval query is required.");
      return;
    }

    setRetrieving(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const response = await retrieveKnowledge({
        ...credentials,
        query: query.trim(),
        limit,
        tags: parseTags(queryTagsText),
      });
      setResults(response);
      setSuccessMessage(`Retrieved ${response.length} result(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Knowledge retrieval failed.");
    } finally {
      setRetrieving(false);
    }
  }

  async function triggerReindex(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before reindexing.");
      return;
    }

    setReindexing(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const job = await enqueueKnowledgeReindex(credentials);
      setSuccessMessage(`Queued reindex job ${job.id}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to queue reindex job.");
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="knowledge-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Knowledge / RAG</h1>
          <p className="dashboard-description">
            Inspect knowledge documents, ingest local content, test retrieval, and monitor indexing jobs.
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
          Enter an API key or service token, then refresh to load protected Knowledge/RAG data.
        </div>
      ) : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Documents</span>
            <FileText className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.documents.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Index Jobs</span>
            <DatabaseZap className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.jobs.length}</div>
            <div className="dependency-detail">{processedChunks}/{totalChunks} chunks processed</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Worker</span>
            <BookOpen className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.workerStatus?.enabled ? "enabled" : "unknown"}</div>
            <div className="dependency-detail">
              queue {data.workerStatus?.queueAvailable ? "available" : "not loaded"}
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Alerts</span>
            <Search className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.workerAlerts?.alerts.length ?? 0}</div>
            <StatusBadge tone={alertTone(data.workerAlerts?.status)}>
              {data.workerAlerts?.status ?? "not loaded"}
            </StatusBadge>
          </div>
        </div>
      </section>

      <section className="knowledge-layout">
        <aside className="knowledge-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Credentials</h2>
              <p className="section-card-description">Use a token with knowledge:read and knowledge:write.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">API key</span>
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Service token</span>
                <input
                  value={serviceToken}
                  onChange={(event) => setServiceToken(event.target.value)}
                  className="text-input"
                />
              </label>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Ingest Document</h2>
              <p className="section-card-description">Create a document and chunks for local RAG testing.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Source type</span>
                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value as KnowledgeSourceType)}
                  className="text-input"
                >
                  <option value="manual">manual</option>
                  <option value="upload">upload</option>
                  <option value="wiki">wiki</option>
                  <option value="webpage">webpage</option>
                  <option value="api">api</option>
                </select>
              </label>
              <label>
                <span className="label">Source URI</span>
                <input value={sourceUri} onChange={(event) => setSourceUri(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Tags</span>
                <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Content</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="composer-input"
                  rows={8}
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitIngest()}
                disabled={ingesting || !hasCredentials}
              >
                <UploadCloud className="icon-sm" aria-hidden="true" />
                Ingest
              </button>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Retrieve Test</h2>
              <p className="section-card-description">Run a query against keyword/vector hybrid retrieval.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Query</span>
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="composer-input"
                  rows={4}
                />
              </label>
              <label>
                <span className="label">Tags filter</span>
                <input
                  value={queryTagsText}
                  onChange={(event) => setQueryTagsText(event.target.value)}
                  className="text-input"
                />
              </label>
              <label>
                <span className="label">Limit</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="text-input"
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitRetrieve()}
                disabled={retrieving || !hasCredentials}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Retrieve
              </button>
            </div>
          </section>
        </aside>

        <div className="knowledge-main">
          <section className="section-card">
            <div className="section-card-header table-card-header">
              <div>
                <h2 className="section-card-title">Documents</h2>
                <p className="section-card-description">Persisted knowledge documents for the current tenant.</p>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void triggerReindex()}
                disabled={reindexing || !hasCredentials}
              >
                <DatabaseZap className="icon-sm" aria-hidden="true" />
                Reindex
              </button>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Source</th>
                      <th>Tags</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <div className="dependency-name">{document.title}</div>
                          <div className="dependency-detail">{document.id}</div>
                        </td>
                        <td>
                          <StatusBadge>{document.sourceType}</StatusBadge>
                          <div className="dependency-detail">{document.sourceUri ?? "none"}</div>
                        </td>
                        <td>{document.tags.join(", ") || "none"}</td>
                        <td>{formatDate(document.createdAt)}</td>
                      </tr>
                    ))}
                    {data.documents.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No documents loaded.</div>
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
              <h2 className="section-card-title">Retrieval Results</h2>
              <p className="section-card-description">Matched chunks returned by the retrieve endpoint.</p>
            </div>
            <div className="section-card-body retrieval-list">
              {results.map((result) => (
                <article key={result.chunk.id} className="retrieval-item">
                  <div className="anomaly-head">
                    <div>
                      <div className="dependency-name">{result.chunk.title}</div>
                      <div className="dependency-detail">
                        score {result.score} / {result.retrievalMode ?? "keyword"} / chunk {result.chunk.index}
                      </div>
                    </div>
                    <div className="badge-row">
                      {result.matchedTerms.map((term) => (
                        <StatusBadge key={term}>{term}</StatusBadge>
                      ))}
                    </div>
                  </div>
                  <p className="retrieval-content">{result.chunk.content}</p>
                  <pre className="code-block compact-code">{JSON.stringify(result.scores ?? {}, null, 2)}</pre>
                </article>
              ))}
              {results.length === 0 ? <div className="empty-state">No retrieval results yet.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Indexing Jobs</h2>
              <p className="section-card-description">Tenant reindex queue and progress state.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Attempts</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <StatusBadge tone={jobTone(job.status)}>{job.status}</StatusBadge>
                          <div className="dependency-detail">{job.id}</div>
                        </td>
                        <td>
                          {job.processedChunks}/{job.totalChunks}
                          {job.failedChunks > 0 ? <div className="dependency-detail">{job.failedChunks} failed</div> : null}
                        </td>
                        <td>
                          {job.attempts}/{job.maxAttempts}
                        </td>
                        <td>{formatDate(job.updatedAt)}</td>
                      </tr>
                    ))}
                    {data.jobs.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No indexing jobs loaded.</div>
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
              <h2 className="section-card-title">Indexing Worker</h2>
              <p className="section-card-description">Queue depth, alerts, and operational health.</p>
            </div>
            <div className="section-card-body">
              {data.workerStatus ? (
                <>
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Worker ID</dt>
                      <dd className="detail-value">{data.workerStatus.workerId}</dd>
                    </div>
                    <div>
                      <dt className="label">Concurrency</dt>
                      <dd className="detail-value">{data.workerStatus.concurrency}</dd>
                    </div>
                    <div>
                      <dt className="label">Pending</dt>
                      <dd className="detail-value">{data.workerStatus.queueDepth.pending}</dd>
                    </div>
                    <div>
                      <dt className="label">Dead letter</dt>
                      <dd className="detail-value">{data.workerStatus.queueDepth.deadLetter}</dd>
                    </div>
                  </dl>
                  <div className="subsection-title">Alerts</div>
                  <ul className="compact-list">
                    {data.workerAlerts?.alerts.map((alert) => (
                      <li key={alert.code}>
                        <span>{alert.message}</span>
                        <StatusBadge tone={alert.severity === "critical" ? "danger" : "warning"}>
                          {alert.severity}
                        </StatusBadge>
                        <span>{String(alert.value)}</span>
                      </li>
                    ))}
                  </ul>
                  {data.workerAlerts?.alerts.length === 0 ? <div className="empty-state">No worker alerts.</div> : null}
                </>
              ) : (
                <div className="empty-state">No worker status loaded.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
