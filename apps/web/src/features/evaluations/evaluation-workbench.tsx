"use client";

import {
  ClipboardCheck,
  FlaskConical,
  Play,
  Plus,
  RefreshCcw,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createEvaluationCase,
  listEvaluationCases,
  listEvaluationRuns,
  runAgentEvaluationBatch,
  runAgentEvaluationCase,
  runEvaluationCase,
  type AuthCredentials,
  type EvaluationCase,
  type EvaluationCaseType,
  type EvaluationRun,
} from "@/lib/api/client";

type EvaluationData = {
  cases: EvaluationCase[];
  runs: EvaluationRun[];
};

const emptyData: EvaluationData = {
  cases: [],
  runs: [],
};

const caseTypes: EvaluationCaseType[] = [
  "agent_response",
  "rag_retrieval",
  "tool_execution",
];

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

function runTone(status: EvaluationRun["status"]) {
  return status === "passed" ? "success" : "danger";
}

export function EvaluationWorkbench() {
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [data, setData] = useState<EvaluationData>(emptyData);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const [runningCase, setRunningCase] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [caseName, setCaseName] = useState("Agent answer contains expected deployment note");
  const [caseType, setCaseType] = useState<EvaluationCaseType>("agent_response");
  const [caseInput, setCaseInput] = useState("Explain how to locally verify the enterprise agent web console.");
  const [expectedOutput, setExpectedOutput] = useState("check:web");
  const [tagsText, setTagsText] = useState("web,smoke");
  const [actualOutput, setActualOutput] = useState(
    "Run npm run check:web and open the local web console to verify the workflow.",
  );

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);
  const selectedCase = data.cases.find((item) => item.id === selectedCaseId);
  const selectedCaseRuns = selectedCase
    ? data.runs.filter((run) => run.caseId === selectedCase.id)
    : data.runs;
  const passedRuns = data.runs.filter((run) => run.status === "passed").length;
  const passRate = data.runs.length > 0 ? Math.round((passedRuns / data.runs.length) * 100) : 0;

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
      const [cases, runs] = await Promise.all([
        listEvaluationCases(credentials),
        listEvaluationRuns(credentials),
      ]);
      setData({ cases, runs });
      setSelectedCaseId((current) => current || cases[0]?.id || "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load evaluations.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCase(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before creating an evaluation case.");
      return;
    }
    if (!caseName.trim() || !caseInput.trim() || !expectedOutput.trim()) {
      setErrorMessage("Name, input, and expected output are required.");
      return;
    }

    setCreatingCase(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const created = await createEvaluationCase({
        ...credentials,
        name: caseName.trim(),
        type: caseType,
        input: caseInput.trim(),
        expectedOutput: expectedOutput.trim(),
        tags: parseTags(tagsText),
      });
      setSelectedCaseId(created.id);
      setActualOutput(created.expectedOutput);
      setSuccessMessage(`Created evaluation case ${created.name}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create evaluation case.");
    } finally {
      setCreatingCase(false);
    }
  }

  async function submitRun(): Promise<void> {
    if (!hasCredentials || !selectedCase) {
      setErrorMessage("Select an evaluation case before running evaluation.");
      return;
    }
    if (!actualOutput.trim()) {
      setErrorMessage("Actual output is required.");
      return;
    }

    setRunningCase(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const run = await runEvaluationCase({
        ...credentials,
        caseId: selectedCase.id,
        actualOutput: actualOutput.trim(),
      });
      setSuccessMessage(`Evaluation ${run.status} with score ${run.score}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run evaluation.");
    } finally {
      setRunningCase(false);
    }
  }

  async function submitAgentRun(): Promise<void> {
    if (!hasCredentials || !selectedCase) {
      setErrorMessage("Select an evaluation case before running Agent evaluation.");
      return;
    }

    setRunningCase(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const result = await runAgentEvaluationCase({
        ...credentials,
        caseId: selectedCase.id,
        instruction: actualOutput.trim() || undefined,
        maxSteps: 4,
      });
      setActualOutput(result.agentRun.answer);
      setSuccessMessage(
        `Agent evaluation ${result.evaluationRun.status} with score ${result.evaluationRun.score}. Stop reason: ${result.agentRun.stopReason}.`,
      );
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run Agent evaluation.");
    } finally {
      setRunningCase(false);
    }
  }

  async function submitAgentBatchRun(): Promise<void> {
    if (!hasCredentials || data.cases.length === 0) {
      setErrorMessage("Load evaluation cases before running Agent batch evaluation.");
      return;
    }

    setRunningCase(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const result = await runAgentEvaluationBatch({
        ...credentials,
        caseIds: data.cases.map((evaluationCase) => evaluationCase.id),
        instruction: actualOutput.trim() || undefined,
        maxSteps: 4,
        maxCases: 25,
      });
      const lastResult = result.results[result.results.length - 1];
      if (lastResult) {
        setActualOutput(lastResult.agentRun.answer);
      }
      setSuccessMessage(
        `Agent batch evaluation finished: ${result.passed}/${result.total} passed, ${result.failed} failed.`,
      );
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run Agent batch evaluation.");
    } finally {
      setRunningCase(false);
    }
  }

  function selectCase(nextCase: EvaluationCase): void {
    setSelectedCaseId(nextCase.id);
    setActualOutput(nextCase.expectedOutput);
  }

  return (
    <div className="evaluation-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Evaluations</h1>
          <p className="dashboard-description">
            Manage deterministic evaluation cases, run checks, and inspect scores for regression testing.
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
          Enter an API key or service token, then refresh to load protected evaluation data.
        </div>
      ) : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Cases</span>
            <ClipboardCheck className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.cases.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Runs</span>
            <FlaskConical className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.runs.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Passed</span>
            <Target className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{passedRuns}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Pass Rate</span>
            <Play className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{passRate}%</div>
            <div className="dependency-detail">string_contains evaluator</div>
          </div>
        </div>
      </section>

      <section className="evaluation-layout">
        <aside className="evaluation-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Credentials</h2>
              <p className="section-card-description">Use a token with evaluation:manage.</p>
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
              <h2 className="section-card-title">Create Case</h2>
              <p className="section-card-description">Expected output is checked as a case-insensitive substring.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Name</span>
                <input value={caseName} onChange={(event) => setCaseName(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Type</span>
                <select
                  value={caseType}
                  onChange={(event) => setCaseType(event.target.value as EvaluationCaseType)}
                  className="text-input"
                >
                  {caseTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Tags</span>
                <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Input</span>
                <textarea
                  value={caseInput}
                  onChange={(event) => setCaseInput(event.target.value)}
                  className="composer-input"
                  rows={4}
                />
              </label>
              <label>
                <span className="label">Expected output</span>
                <textarea
                  value={expectedOutput}
                  onChange={(event) => setExpectedOutput(event.target.value)}
                  className="composer-input"
                  rows={3}
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitCase()}
                disabled={creatingCase || !hasCredentials}
              >
                <Plus className="icon-sm" aria-hidden="true" />
                Create Case
              </button>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Run Case</h2>
              <p className="section-card-description">Score pasted output or run the selected case through Agent Runtime.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Selected case</span>
                <input value={selectedCase?.name ?? ""} readOnly className="text-input" />
              </label>
              <label>
                <span className="label">Actual output</span>
                <textarea
                  value={actualOutput}
                  onChange={(event) => setActualOutput(event.target.value)}
                  className="composer-input"
                  rows={6}
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitRun()}
                disabled={runningCase || !hasCredentials || !selectedCase}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Run Evaluation
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitAgentRun()}
                disabled={runningCase || !hasCredentials || !selectedCase}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Run Agent Evaluation
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitAgentBatchRun()}
                disabled={runningCase || !hasCredentials || data.cases.length === 0}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Run Agent Batch
              </button>
            </div>
          </section>
        </aside>

        <div className="evaluation-main">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Evaluation Cases</h2>
              <p className="section-card-description">Reusable checks grouped by agent, RAG, and tool behavior.</p>
            </div>
            <div className="section-card-body evaluation-list">
              {data.cases.map((evaluationCase) => (
                <button
                  key={evaluationCase.id}
                  type="button"
                  className={evaluationCase.id === selectedCaseId ? "tool-list-item tool-list-item-active" : "tool-list-item"}
                  onClick={() => selectCase(evaluationCase)}
                >
                  <span>
                    <strong>{evaluationCase.name}</strong>
                    <span className="dependency-detail">{evaluationCase.input}</span>
                  </span>
                  <StatusBadge>{evaluationCase.type}</StatusBadge>
                </button>
              ))}
              {data.cases.length === 0 ? <div className="empty-state">No evaluation cases loaded.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Selected Case</h2>
              <p className="section-card-description">Input, expectation, tags, and deterministic evaluator.</p>
            </div>
            <div className="section-card-body">
              {selectedCase ? (
                <>
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Name</dt>
                      <dd className="detail-value">{selectedCase.name}</dd>
                    </div>
                    <div>
                      <dt className="label">Type</dt>
                      <dd className="detail-value">{selectedCase.type}</dd>
                    </div>
                    <div>
                      <dt className="label">Expected</dt>
                      <dd className="detail-value">{selectedCase.expectedOutput}</dd>
                    </div>
                    <div>
                      <dt className="label">Created</dt>
                      <dd className="detail-value">{formatDate(selectedCase.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className="subsection-title">Tags</div>
                  <div className="badge-row">
                    {selectedCase.tags.map((tag) => (
                      <StatusBadge key={tag}>{tag}</StatusBadge>
                    ))}
                    {selectedCase.tags.length === 0 ? <StatusBadge>none</StatusBadge> : null}
                  </div>
                </>
              ) : (
                <div className="empty-state">No evaluation case selected.</div>
              )}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Evaluation Runs</h2>
              <p className="section-card-description">Recent scoring results for the selected case.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Notes</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCaseRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <StatusBadge tone={runTone(run.status)}>{run.status}</StatusBadge>
                          <div className="dependency-detail">{run.evaluator}</div>
                        </td>
                        <td>{run.score}</td>
                        <td>
                          {run.notes.join("; ")}
                          <div className="dependency-detail">{run.actualOutput}</div>
                        </td>
                        <td>{formatDate(run.createdAt)}</td>
                      </tr>
                    ))}
                    {selectedCaseRuns.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No evaluation runs loaded.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
