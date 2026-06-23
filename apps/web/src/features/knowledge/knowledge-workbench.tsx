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
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
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

function mergeTags(...tagGroups: Array<string[] | undefined>): string[] | undefined {
  const tags = Array.from(new Set(tagGroups.flatMap((group) => group ?? []).map((tag) => tag.trim()).filter(Boolean)));
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
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [uploadSummary, setUploadSummary] = useState<Array<{ name: string; status: "success" | "failed"; message: string }>>([]);
  const [title, setTitle] = useState("Enterprise Agent Runbook");
  const [content, setContent] = useState(
    "This document describes how operators test the enterprise agent knowledge base locally.",
  );
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("manual");
  const [sourceUri, setSourceUri] = useState("local://runbook");
  const [tagsText, setTagsText] = useState("runbook,local");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentTagFilter, setDocumentTagFilter] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [query, setQuery] = useState("enterprise agent knowledge base");
  const [queryTagsText, setQueryTagsText] = useState("");
  const [limit, setLimit] = useState(5);

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);
  const totalChunks = data.jobs.reduce((total, job) => total + job.totalChunks, 0);
  const processedChunks = data.jobs.reduce((total, job) => total + job.processedChunks, 0);
  const filteredDocuments = useMemo(() => {
    const normalizedSearch = documentSearch.trim().toLowerCase();
    const normalizedTag = documentTagFilter.trim().toLowerCase();
    return data.documents.filter((document) => {
      const haystack = [document.title, document.sourceType, document.sourceUri ?? "", document.content, document.id]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesTag =
        !normalizedTag || document.tags.some((tag) => tag.toLowerCase().includes(normalizedTag));
      return matchesSearch && matchesTag;
    });
  }, [data.documents, documentSearch, documentTagFilter]);
  const selectedDocument = useMemo(
    () => data.documents.find((document) => document.id === selectedDocumentId),
    [data.documents, selectedDocumentId],
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
      const [documents, jobs, workerStatus, workerAlerts] = await Promise.all([
        listKnowledgeDocuments(credentials),
        listIndexingJobs(credentials),
        getIndexingWorkerStatus(credentials),
        getIndexingWorkerAlerts(credentials),
      ]);
      setData({ documents, jobs, workerStatus, workerAlerts });
      setSelectedDocumentId((current) =>
        documents.some((document) => document.id === current) ? current : documents[0]?.id ?? "",
      );
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

  async function submitFileUpload(fileList: FileList | null, input: HTMLInputElement): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before uploading knowledge files.");
      input.value = "";
      return;
    }
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    setUploadingFiles(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setUploadSummary([]);
    const summaries: Array<{ name: string; status: "success" | "failed"; message: string }> = [];
    const baseTags = parseTags(tagsText);

    try {
      for (const file of files) {
        try {
          const fileContent = await file.text();
          if (!fileContent.trim()) {
            summaries.push({ name: file.name, status: "failed", message: "File is empty." });
            continue;
          }
          const response = await ingestKnowledge({
            ...credentials,
            title: file.name.replace(/\.[^/.]+$/, "") || file.name,
            content: fileContent,
            sourceType: "upload",
            sourceUri: file.name,
            tags: mergeTags(baseTags, ["upload"]),
          });
          summaries.push({
            name: file.name,
            status: "success",
            message: `${response.chunks.length} chunk(s) indexed.`,
          });
        } catch (error) {
          summaries.push({
            name: file.name,
            status: "failed",
            message: error instanceof Error ? error.message : "Upload ingestion failed.",
          });
        }
      }
      setUploadSummary(summaries);
      const successCount = summaries.filter((summary) => summary.status === "success").length;
      const failureCount = summaries.length - successCount;
      setSuccessMessage(`Uploaded ${successCount}/${summaries.length} file(s). ${failureCount} failed.`);
      await refresh();
    } finally {
      input.value = "";
      setUploadingFiles(false);
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

  function useSelectedDocumentAsQuery(): void {
    if (!selectedDocument) {
      return;
    }
    setQuery(`${selectedDocument.title}\n\n${selectedDocument.content.slice(0, 800)}`.trim());
    setQueryTagsText(selectedDocument.tags.join(", "));
  }

  function copySelectedDocumentToForm(): void {
    if (!selectedDocument) {
      return;
    }
    setTitle(selectedDocument.title);
    setContent(selectedDocument.content);
    setSourceType(selectedDocument.sourceType);
    setSourceUri(selectedDocument.sourceUri ?? "");
    setTagsText(selectedDocument.tags.join(", "));
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
          Sign in or enter an API key/service token, then refresh to load protected Knowledge/RAG data.
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
              <h2 className="section-card-title">Upload Files</h2>
              <p className="section-card-description">Batch ingest local text, markdown, JSON, and CSV files.</p>
            </div>
            <div className="section-card-body auth-form">
              <label className="file-upload-control">
                <UploadCloud className="icon-sm" aria-hidden="true" />
                <span>{uploadingFiles ? "Uploading..." : "Choose Files"}</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.markdown,.json,.csv,.log,text/plain,text/markdown,application/json,text/csv"
                  disabled={uploadingFiles || !hasCredentials}
                  onChange={(event) => void submitFileUpload(event.currentTarget.files, event.currentTarget)}
                />
              </label>
              {uploadSummary.length > 0 ? (
                <ul className="compact-list">
                  {uploadSummary.map((summary) => (
                    <li key={`${summary.name}-${summary.status}`}>
                      <span>{summary.name}</span>
                      <StatusBadge tone={summary.status === "success" ? "success" : "danger"}>{summary.status}</StatusBadge>
                      <span>{summary.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
              <div className="knowledge-filter-grid">
                <label>
                  <span className="label">Search</span>
                  <input
                    value={documentSearch}
                    onChange={(event) => setDocumentSearch(event.target.value)}
                    className="text-input"
                    placeholder="Title, source, content, or id"
                  />
                </label>
                <label>
                  <span className="label">Tag</span>
                  <input
                    value={documentTagFilter}
                    onChange={(event) => setDocumentTagFilter(event.target.value)}
                    className="text-input"
                    placeholder="runbook"
                  />
                </label>
              </div>
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
                    {filteredDocuments.map((document) => (
                      <tr
                        key={document.id}
                        className={document.id === selectedDocumentId ? "clickable-row table-row-active" : "clickable-row"}
                        onClick={() => setSelectedDocumentId(document.id)}
                      >
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
                    {filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No documents matched.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header table-card-header">
              <div>
                <h2 className="section-card-title">Document Preview</h2>
                <p className="section-card-description">Inspect the selected document before retrieval testing.</p>
              </div>
              <div className="mcp-server-actions">
                <button
                  type="button"
                  className="refresh-button"
                  onClick={useSelectedDocumentAsQuery}
                  disabled={!selectedDocument}
                >
                  <Search className="icon-sm" aria-hidden="true" />
                  Use as Query
                </button>
                <button
                  type="button"
                  className="refresh-button secondary-button"
                  onClick={copySelectedDocumentToForm}
                  disabled={!selectedDocument}
                >
                  <FileText className="icon-sm" aria-hidden="true" />
                  Edit Draft
                </button>
              </div>
            </div>
            <div className="section-card-body">
              {selectedDocument ? (
                <div className="knowledge-preview">
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Title</dt>
                      <dd className="detail-value">{selectedDocument.title}</dd>
                    </div>
                    <div>
                      <dt className="label">Source</dt>
                      <dd className="detail-value">{selectedDocument.sourceType}</dd>
                    </div>
                    <div>
                      <dt className="label">Source URI</dt>
                      <dd className="detail-value">{selectedDocument.sourceUri ?? "none"}</dd>
                    </div>
                    <div>
                      <dt className="label">Updated</dt>
                      <dd className="detail-value">{formatDate(selectedDocument.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="badge-row">
                    {selectedDocument.tags.length > 0 ? (
                      selectedDocument.tags.map((tag) => <StatusBadge key={tag}>{tag}</StatusBadge>)
                    ) : (
                      <StatusBadge>no tags</StatusBadge>
                    )}
                  </div>
                  <p className="retrieval-content knowledge-preview-content">{selectedDocument.content}</p>
                </div>
              ) : (
                <div className="empty-state">Select a document to preview it.</div>
              )}
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
