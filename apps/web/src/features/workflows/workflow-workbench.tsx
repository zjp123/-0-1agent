"use client";

import {
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Square,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelWorkflow,
  createWorkflow,
  createWorkflowSchedule,
  deleteWorkflowSchedule,
  executeWorkflowPendingSteps,
  executeWorkflowStep,
  getWorkflowSchedulerStatus,
  listWorkflowScheduleRuns,
  listWorkflowSchedules,
  listWorkflows,
  pauseWorkflow,
  resumeWorkflow,
  triggerWorkflowSchedule,
  updateWorkflowSchedule,
  updateWorkflowStep,
  type AuthCredentials,
  type Workflow,
  type WorkflowSchedule,
  type WorkflowScheduleRun,
  type WorkflowSchedulerStatus,
  type WorkflowStep,
  type WorkflowStepStatus,
} from "@/lib/api/client";

type WorkflowData = {
  workflows: Workflow[];
  schedules: WorkflowSchedule[];
  runs: WorkflowScheduleRun[];
  schedulerStatus?: WorkflowSchedulerStatus;
};

const emptyData: WorkflowData = {
  workflows: [],
  schedules: [],
  runs: [],
};

const workflowStepStatuses: WorkflowStepStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting_for_approval",
];

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  goal: string;
  steps: string;
};

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "production-readiness",
    name: "Production Readiness",
    description: "上线前检查基础设施、核心链路和审批记录。",
    title: "Production Readiness Review",
    goal: "Validate the enterprise agent before production deployment.",
    steps:
      "Check infrastructure - Confirm database, Redis, vector store, API, and Web readiness.\nRun smoke tests - Execute auth, agent streaming, tools, RAG, workflow, and observability checks.\nReview security gates - Verify RBAC, audit events, rate limits, and approval policies.\nApprove rollout - Record operator approval and next action before deployment.",
  },
  {
    id: "incident-triage",
    name: "Incident Triage",
    description: "生产故障排查，先定级，再定位，再恢复。",
    title: "Incident Triage Workflow",
    goal: "Triage a production incident and produce a safe recovery plan.",
    steps:
      "Classify incident - Identify severity, affected tenants, and customer impact.\nCollect signals - Inspect traces, logs, health checks, queue depth, and recent deploys.\nIsolate root cause - Compare symptoms with recent changes and dependency status.\nExecute mitigation - Apply the lowest-risk recovery action and record evidence.\nWrite follow-up - Summarize cause, mitigation, owner, and prevention tasks.",
  },
  {
    id: "rag-quality-review",
    name: "RAG Quality Review",
    description: "检查知识库导入、检索质量和引用结果。",
    title: "RAG Quality Review",
    goal: "Evaluate whether the knowledge base returns useful, traceable retrieval results.",
    steps:
      "Review source coverage - Confirm target documents are ingested and tagged.\nRun retrieval probes - Test representative queries and inspect matched chunks.\nCheck answer grounding - Verify agent responses cite relevant retrieved sources.\nRecord gaps - List missing documents, bad chunks, and query failures.",
  },
];

function formatDate(value?: string): string {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "completed") {
    return "success" as const;
  }
  if (status === "failed" || status === "cancelled") {
    return "danger" as const;
  }
  if (status === "running" || status === "waiting_for_approval") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function parseSteps(value: string): Array<{ title: string; description?: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...descriptionParts] = line.split(" - ");
      const description = descriptionParts.join(" - ").trim();
      return {
        title: title.trim(),
        ...(description ? { description } : {}),
      };
    });
}

function nextHourIso(): string {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  return next.toISOString();
}

export function WorkflowWorkbench() {
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [data, setData] = useState<WorkflowData>(emptyData);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [stepStatus, setStepStatus] = useState<WorkflowStepStatus>("running");
  const [stepOutput, setStepOutput] = useState("");
  const [stepError, setStepError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [updatingStep, setUpdatingStep] = useState(false);
  const [executingStep, setExecutingStep] = useState(false);
  const [triggeringSchedule, setTriggeringSchedule] = useState(false);
  const [togglingSchedule, setTogglingSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [updatingWorkflowStatus, setUpdatingWorkflowStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [workflowTitle, setWorkflowTitle] = useState("Production Readiness Review");
  const [workflowGoal, setWorkflowGoal] = useState("Validate the enterprise agent before production deployment.");
  const [stepsText, setStepsText] = useState(
    "Check infrastructure - Confirm database, Redis, and vector store readiness.\nRun smoke tests - Execute core API and Web console checks.\nApprove rollout - Record operator approval before deployment.",
  );
  const [scheduleName, setScheduleName] = useState("Manual production readiness trigger");
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");
  const [intervalSeconds, setIntervalSeconds] = useState(3600);
  const [cronExpression, setCronExpression] = useState("0 * * * *");
  const [nextRunAt, setNextRunAt] = useState(nextHourIso());

  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);

  const selectedWorkflow = data.workflows.find((workflow) => workflow.id === selectedWorkflowId);
  const selectedStep = selectedWorkflow?.steps.find((step) => step.id === selectedStepId);
  const selectedSchedule = data.schedules.find((schedule) => schedule.id === selectedScheduleId);
  const selectedRun = data.runs.find((run) => run.id === selectedRunId);
  const activeRuns = data.runs.filter((run) => run.status === "pending" || run.status === "running");
  const selectedWorkflowRuns = data.runs.filter((run) => run.workflowId === selectedWorkflowId);
  const failedSteps = selectedWorkflow?.steps.filter((step) => step.status === "failed") ?? [];

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
      const [workflows, schedules, runs, schedulerStatus] = await Promise.all([
        listWorkflows(credentials),
        listWorkflowSchedules(credentials),
        listWorkflowScheduleRuns(credentials),
        getWorkflowSchedulerStatus(credentials),
      ]);
      setData({ workflows, schedules, runs, schedulerStatus });
      const workflowId = selectedWorkflowId || workflows[0]?.id || "";
      setSelectedWorkflowId(workflowId);
      const workflow = workflows.find((item) => item.id === workflowId) ?? workflows[0];
      setSelectedStepId((current) => current || workflow?.steps[0]?.id || "");
      setSelectedScheduleId((current) => current || schedules[0]?.id || "");
      setSelectedRunId((current) =>
        runs.some((run) => run.id === current) ? current : runs[0]?.id ?? "",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load workflows.");
    } finally {
      setLoading(false);
    }
  }

  async function submitWorkflow(): Promise<void> {
    if (!hasCredentials) {
      setErrorMessage("Enter an API key or service token before creating a workflow.");
      return;
    }
    const steps = parseSteps(stepsText);
    if (!workflowTitle.trim() || !workflowGoal.trim() || steps.length === 0) {
      setErrorMessage("Workflow title, goal, and at least one step are required.");
      return;
    }

    setCreatingWorkflow(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const workflow = await createWorkflow({
        ...credentials,
        title: workflowTitle.trim(),
        goal: workflowGoal.trim(),
        steps,
      });
      setSelectedWorkflowId(workflow.id);
      setSelectedStepId(workflow.steps[0]?.id ?? "");
      setSuccessMessage(`Created workflow ${workflow.title}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create workflow.");
    } finally {
      setCreatingWorkflow(false);
    }
  }

  async function submitStepUpdate(): Promise<void> {
    if (!hasCredentials || !selectedWorkflow || !selectedStep) {
      setErrorMessage("Select a workflow step before updating status.");
      return;
    }

    setUpdatingStep(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const workflow = await updateWorkflowStep({
        ...credentials,
        workflowId: selectedWorkflow.id,
        stepId: selectedStep.id,
        status: stepStatus,
        output: stepOutput.trim() || undefined,
        error: stepError.trim() || undefined,
      });
      setSelectedWorkflowId(workflow.id);
      setSelectedStepId(selectedStep.id);
      setSuccessMessage(`Updated step ${selectedStep.title}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update workflow step.");
    } finally {
      setUpdatingStep(false);
    }
  }

  async function executeSelectedStep(): Promise<void> {
    if (!hasCredentials || !selectedWorkflow || !selectedStep) {
      setErrorMessage("Select a workflow step before executing it.");
      return;
    }
    await executeWorkflowStepById(selectedStep.id, stepOutput);
  }

  async function executePendingSteps(): Promise<void> {
    if (!hasCredentials || !selectedWorkflow) {
      setErrorMessage("Select a workflow before executing pending steps.");
      return;
    }

    setExecutingStep(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const result = await executeWorkflowPendingSteps({
        ...credentials,
        workflowId: selectedWorkflow.id,
        instruction: stepOutput.trim() || undefined,
        continueOnFailure: false,
        maxStepsPerAgentRun: 4,
        maxWorkflowSteps: 10,
      });
      setData((current) => ({
        ...current,
        workflows: current.workflows.map((workflow) =>
          workflow.id === result.workflow.id ? result.workflow : workflow,
        ),
      }));
      setSelectedWorkflowId(result.workflow.id);
      const lastResult = result.results[result.results.length - 1];
      if (lastResult) {
        setSelectedStepId(lastResult.step.id);
        setStepStatus(lastResult.step.status);
        setStepOutput(lastResult.step.output ?? "");
        setStepError(lastResult.step.error ?? "");
      }
      setSuccessMessage(
        `Executed ${result.results.length} pending step${result.results.length === 1 ? "" : "s"}${
          result.stoppedOnFailure ? " and stopped on failure" : ""
        }.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to execute pending workflow steps.");
    } finally {
      setExecutingStep(false);
    }
  }

  async function submitSchedule(): Promise<void> {
    if (!hasCredentials || !selectedWorkflow) {
      setErrorMessage("Select a workflow before creating a schedule.");
      return;
    }

    setCreatingSchedule(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const schedule = await createWorkflowSchedule({
        ...credentials,
        workflowId: selectedWorkflow.id,
        name: scheduleName.trim(),
        scheduleType,
        cronExpression: scheduleType === "cron" ? cronExpression.trim() : undefined,
        intervalSeconds: scheduleType === "interval" ? intervalSeconds : undefined,
        timezone: "Asia/Shanghai",
        enabled: true,
        maxConcurrentRuns: 1,
        nextRunAt: nextRunAt.trim(),
        metadata: { source: "web-console" },
      });
      setSelectedScheduleId(schedule.id);
      setSuccessMessage(`Created schedule ${schedule.name}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create workflow schedule.");
    } finally {
      setCreatingSchedule(false);
    }
  }

  async function triggerSchedule(): Promise<void> {
    if (!hasCredentials || !selectedSchedule) {
      setErrorMessage("Select a schedule before triggering a workflow run.");
      return;
    }

    setTriggeringSchedule(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const run = await triggerWorkflowSchedule({
        ...credentials,
        scheduleId: selectedSchedule.id,
      });
      setSelectedRunId(run.id);
      setSuccessMessage(`Triggered workflow run ${run.id}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to trigger workflow schedule.");
    } finally {
      setTriggeringSchedule(false);
    }
  }

  async function toggleScheduleEnabled(schedule: WorkflowSchedule): Promise<void> {
    if (!hasCredentials) {
      return;
    }
    setTogglingSchedule(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      await updateWorkflowSchedule({
        ...credentials,
        scheduleId: schedule.id,
        enabled: !schedule.enabled,
      });
      setSuccessMessage(`${schedule.enabled ? "Disabled" : "Enabled"} schedule ${schedule.name}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update schedule.");
    } finally {
      setTogglingSchedule(false);
    }
  }

  async function removeSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!hasCredentials) {
      return;
    }
    if (!window.confirm(`Delete schedule "${schedule.name}"? This also removes its run history.`)) {
      return;
    }
    setDeletingSchedule(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      await deleteWorkflowSchedule({
        ...credentials,
        scheduleId: schedule.id,
      });
      if (selectedScheduleId === schedule.id) {
        setSelectedScheduleId("");
      }
      setSuccessMessage(`Deleted schedule ${schedule.name}.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete schedule.");
    } finally {
      setDeletingSchedule(false);
    }
  }

  async function changeWorkflowStatus(workflow: Workflow, action: "pause" | "resume" | "cancel"): Promise<void> {
    if (!hasCredentials) {
      return;
    }
    setUpdatingWorkflowStatus(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const input = { ...credentials, workflowId: workflow.id };
      if (action === "pause") {
        await pauseWorkflow(input);
        setSuccessMessage(`Paused workflow ${workflow.title}.`);
      } else if (action === "resume") {
        await resumeWorkflow(input);
        setSuccessMessage(`Resumed workflow ${workflow.title}.`);
      } else {
        await cancelWorkflow(input);
        setSuccessMessage(`Cancelled workflow ${workflow.title}.`);
      }
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Failed to ${action} workflow.`);
    } finally {
      setUpdatingWorkflowStatus(false);
    }
  }

  function selectWorkflow(workflowId: string): void {
    const workflow = data.workflows.find((item) => item.id === workflowId);
    setSelectedWorkflowId(workflowId);
    setSelectedStepId(workflow?.steps[0]?.id ?? "");
    setStepOutput("");
    setStepError("");
  }

  function selectStep(step: WorkflowStep): void {
    setSelectedStepId(step.id);
    setStepStatus(step.status);
    setStepOutput(step.output ?? "");
    setStepError(step.error ?? "");
  }

  function applyTemplate(template: WorkflowTemplate): void {
    setWorkflowTitle(template.title);
    setWorkflowGoal(template.goal);
    setStepsText(template.steps);
    setSuccessMessage(`Loaded template: ${template.name}.`);
    setErrorMessage(undefined);
  }

  async function retryStep(step: WorkflowStep): Promise<void> {
    selectStep(step);
    setStepOutput(step.output ?? "Retry this failed workflow step and explain what changed.");
    await executeWorkflowStepById(step.id, step.output ?? "Retry this failed workflow step and explain what changed.");
  }

  async function executeWorkflowStepById(stepId: string, instruction?: string): Promise<void> {
    if (!hasCredentials || !selectedWorkflow) {
      setErrorMessage("Select a workflow step before executing it.");
      return;
    }

    setExecutingStep(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const result = await executeWorkflowStep({
        ...credentials,
        workflowId: selectedWorkflow.id,
        stepId,
        instruction: instruction?.trim() || undefined,
        maxSteps: 4,
      });
      setData((current) => ({
        ...current,
        workflows: current.workflows.map((workflow) =>
          workflow.id === result.workflow.id ? result.workflow : workflow,
        ),
      }));
      setSelectedWorkflowId(result.workflow.id);
      setSelectedStepId(result.step.id);
      setStepStatus(result.step.status);
      setStepOutput(result.step.output ?? "");
      setStepError(result.step.error ?? "");
      setSuccessMessage(
        `Executed step ${result.step.title}. Agent stop reason: ${result.agentRun.stopReason}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to execute workflow step.");
    } finally {
      setExecutingStep(false);
    }
  }

  return (
    <div className="workflow-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Workflows</h1>
          <p className="dashboard-description">
            Create workflow drafts, inspect steps, trigger schedules, and advance execution state.
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
          Enter an API key or service token, then refresh to load protected workflow data.
        </div>
      ) : null}

      <section className="security-summary">
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Workflows</span>
            <WorkflowIcon className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.workflows.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Schedules</span>
            <CalendarClock className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.schedules.length}</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Selected Runs</span>
            <Play className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{selectedWorkflowRuns.length}</div>
            <div className="dependency-detail">{activeRuns.length} active globally</div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-head">
            <span className="label">Scheduler</span>
            <GitBranch className="icon-sm" aria-hidden="true" />
          </div>
          <div className="metric-body">
            <div className="metric-value">{data.schedulerStatus?.enabled ? "enabled" : "unknown"}</div>
            <div className="dependency-detail">{data.schedulerStatus?.store ?? "not loaded"}</div>
          </div>
        </div>
      </section>

      <section className="workflow-layout">
        <aside className="workflow-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Credentials</h2>
              <p className="section-card-description">Use a token with workflow:manage.</p>
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
              <h2 className="section-card-title">Workflow Templates</h2>
              <p className="section-card-description">Load an enterprise workflow template into the draft form.</p>
            </div>
            <div className="section-card-body workflow-template-list">
              {workflowTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="workflow-template-card"
                  onClick={() => applyTemplate(template)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Create Workflow Draft</h2>
              <p className="section-card-description">One step per line, optionally using "title - description".</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Title</span>
                <input
                  value={workflowTitle}
                  onChange={(event) => setWorkflowTitle(event.target.value)}
                  className="text-input"
                />
              </label>
              <label>
                <span className="label">Goal</span>
                <textarea
                  value={workflowGoal}
                  onChange={(event) => setWorkflowGoal(event.target.value)}
                  className="composer-input"
                  rows={3}
                />
              </label>
              <label>
                <span className="label">Steps</span>
                <textarea
                  value={stepsText}
                  onChange={(event) => setStepsText(event.target.value)}
                  className="composer-input"
                  rows={7}
                />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitWorkflow()}
                disabled={creatingWorkflow || !hasCredentials}
              >
                <Plus className="icon-sm" aria-hidden="true" />
                Create Workflow
              </button>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Create Schedule</h2>
              <p className="section-card-description">Attach a schedule to the selected workflow.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">Name</span>
                <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Type</span>
                <select
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value as "interval" | "cron")}
                  className="text-input"
                >
                  <option value="interval">interval</option>
                  <option value="cron">cron</option>
                </select>
              </label>
              {scheduleType === "interval" ? (
                <label>
                  <span className="label">Interval seconds</span>
                  <input
                    type="number"
                    min={60}
                    value={intervalSeconds}
                    onChange={(event) => setIntervalSeconds(Number(event.target.value))}
                    className="text-input"
                  />
                </label>
              ) : (
                <label>
                  <span className="label">Cron expression</span>
                  <input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    className="text-input"
                  />
                </label>
              )}
              <label>
                <span className="label">Next run ISO</span>
                <input value={nextRunAt} onChange={(event) => setNextRunAt(event.target.value)} className="text-input" />
              </label>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitSchedule()}
                disabled={creatingSchedule || !hasCredentials || !selectedWorkflow}
              >
                <CalendarClock className="icon-sm" aria-hidden="true" />
                Create Schedule
              </button>
            </div>
          </section>
        </aside>

        <div className="workflow-main">
          <section className="section-card">
            <div className="section-card-header table-card-header">
              <div>
                <h2 className="section-card-title">Workflow List</h2>
                <p className="section-card-description">Drafts and execution history foundation for the current tenant.</p>
              </div>
              {selectedWorkflow ? (
                <div className="workflow-status-actions">
                  {(selectedWorkflow.status === "running" || selectedWorkflow.status === "draft") && (
                    <button
                      type="button"
                      className="schedule-action-btn"
                      onClick={() => void changeWorkflowStatus(selectedWorkflow, "pause")}
                      disabled={updatingWorkflowStatus || !hasCredentials}
                    >
                      <Pause className="icon-sm" aria-hidden="true" />
                      Pause
                    </button>
                  )}
                  {selectedWorkflow.status === "paused" && (
                    <button
                      type="button"
                      className="schedule-action-btn"
                      onClick={() => void changeWorkflowStatus(selectedWorkflow, "resume")}
                      disabled={updatingWorkflowStatus || !hasCredentials}
                    >
                      <Play className="icon-sm" aria-hidden="true" />
                      Resume
                    </button>
                  )}
                  {selectedWorkflow.status !== "completed" && selectedWorkflow.status !== "cancelled" && (
                    <button
                      type="button"
                      className="schedule-action-btn schedule-action-danger"
                      onClick={() => void changeWorkflowStatus(selectedWorkflow, "cancel")}
                      disabled={updatingWorkflowStatus || !hasCredentials}
                    >
                      <Square className="icon-sm" aria-hidden="true" />
                      Cancel
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <div className="section-card-body workflow-list">
              {data.workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  className={workflow.id === selectedWorkflowId ? "tool-list-item tool-list-item-active" : "tool-list-item"}
                  onClick={() => selectWorkflow(workflow.id)}
                >
                  <span>
                    <strong>{workflow.title}</strong>
                    <span className="dependency-detail">{workflow.goal}</span>
                  </span>
                  <StatusBadge tone={statusTone(workflow.status)}>{workflow.status}</StatusBadge>
                </button>
              ))}
              {data.workflows.length === 0 ? <div className="empty-state">No workflows loaded.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Failed Step Retry</h2>
              <p className="section-card-description">Retry failed steps with the same workflow context.</p>
            </div>
            <div className="section-card-body workflow-list">
              {failedSteps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  className="tool-list-item"
                  onClick={() => void retryStep(step)}
                  disabled={executingStep || !hasCredentials}
                >
                  <span>
                    <strong>{step.title}</strong>
                    <span className="dependency-detail">{step.error ?? "failed without error detail"}</span>
                  </span>
                  <RotateCcw className="icon-sm" aria-hidden="true" />
                </button>
              ))}
              {failedSteps.length === 0 ? <div className="empty-state">No failed steps for the selected workflow.</div> : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Workflow Events</h2>
              <p className="section-card-description">Selected workflow timeline for audit and replay context.</p>
            </div>
            <div className="section-card-body timeline-list">
              {selectedWorkflow?.events.map((event) => (
                <article key={event.id} className="timeline-item">
                  <div className="timeline-marker">
                    <GitBranch className="icon-sm" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="dependency-name">{event.type}</div>
                    <div className="dependency-detail">{event.message}</div>
                    <div className="dependency-detail">
                      {formatDate(event.timestamp)} / {event.actorUserId}
                    </div>
                  </div>
                </article>
              ))}
              {!selectedWorkflow || selectedWorkflow.events.length === 0 ? (
                <div className="empty-state">No workflow events loaded.</div>
              ) : null}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header table-card-header">
              <div>
                <h2 className="section-card-title">Steps</h2>
                <p className="section-card-description">Select a step and advance its state.</p>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void submitStepUpdate()}
                disabled={updatingStep || executingStep || !hasCredentials || !selectedStep}
              >
                <CheckCircle2 className="icon-sm" aria-hidden="true" />
                Update Step
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void executeSelectedStep()}
                disabled={executingStep || updatingStep || !hasCredentials || !selectedStep}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Execute Step
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void executePendingSteps()}
                disabled={executingStep || updatingStep || !hasCredentials || !selectedWorkflow}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Execute Pending
              </button>
            </div>
            <div className="section-card-body workflow-steps-layout">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWorkflow?.steps.map((step) => (
                      <tr
                        key={step.id}
                        onClick={() => selectStep(step)}
                        className={step.id === selectedStepId ? "clickable-row table-row-active" : "clickable-row"}
                      >
                        <td>
                          <div className="dependency-name">{step.order}. {step.title}</div>
                          <div className="dependency-detail">{step.description ?? step.id}</div>
                        </td>
                        <td>
                          <StatusBadge tone={statusTone(step.status)}>{step.status}</StatusBadge>
                        </td>
                        <td>{formatDate(step.updatedAt)}</td>
                      </tr>
                    ))}
                    {!selectedWorkflow || selectedWorkflow.steps.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <div className="table-empty">No workflow selected.</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="auth-form">
                <label>
                  <span className="label">Selected step</span>
                  <input value={selectedStep?.title ?? ""} readOnly className="text-input" />
                </label>
                <label>
                  <span className="label">Status</span>
                  <select
                    value={stepStatus}
                    onChange={(event) => setStepStatus(event.target.value as WorkflowStepStatus)}
                    className="text-input"
                  >
                    {workflowStepStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Output</span>
                  <textarea
                    value={stepOutput}
                    onChange={(event) => setStepOutput(event.target.value)}
                    className="composer-input"
                    rows={4}
                  />
                </label>
                <label>
                  <span className="label">Error</span>
                  <textarea
                    value={stepError}
                    onChange={(event) => setStepError(event.target.value)}
                    className="composer-input"
                    rows={3}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header table-card-header">
              <div>
                <h2 className="section-card-title">Schedules</h2>
                <p className="section-card-description">Run workflow schedules manually or inspect next run state.</p>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => void triggerSchedule()}
                disabled={triggeringSchedule || !hasCredentials || !selectedSchedule}
              >
                <Play className="icon-sm" aria-hidden="true" />
                Trigger
              </button>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Enabled</th>
                      <th>Next run</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.schedules.map((schedule) => (
                      <tr
                        key={schedule.id}
                        onClick={() => setSelectedScheduleId(schedule.id)}
                        className={schedule.id === selectedScheduleId ? "clickable-row table-row-active" : "clickable-row"}
                      >
                        <td>
                          <div className="dependency-name">{schedule.name}</div>
                          <div className="dependency-detail">{schedule.workflowId}</div>
                        </td>
                        <td>{schedule.scheduleType}</td>
                        <td>
                          <StatusBadge tone={schedule.enabled ? "success" : "warning"}>
                            {schedule.enabled ? "enabled" : "disabled"}
                          </StatusBadge>
                        </td>
                        <td>{formatDate(schedule.nextRunAt)}</td>
                        <td>
                          <div className="schedule-row-actions">
                            <button
                              type="button"
                              className="schedule-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleScheduleEnabled(schedule);
                              }}
                              disabled={togglingSchedule || !hasCredentials}
                              title={schedule.enabled ? "Disable" : "Enable"}
                            >
                              {schedule.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              className="schedule-action-btn schedule-action-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeSchedule(schedule);
                              }}
                              disabled={deletingSchedule || !hasCredentials}
                              title="Delete"
                            >
                              <Trash2 className="icon-sm" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {data.schedules.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="table-empty">No schedules loaded.</div>
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
              <h2 className="section-card-title">Schedule Runs</h2>
              <p className="section-card-description">Recent manual and scheduler-triggered runs.</p>
            </div>
            <div className="section-card-body">
              <div className="dependency-table-wrap">
                <table className="dependency-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Trigger</th>
                      <th>Due</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((run) => (
                      <tr
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        className={run.id === selectedRunId ? "clickable-row table-row-active" : "clickable-row"}
                      >
                        <td>
                          <StatusBadge tone={statusTone(run.status)}>{run.status}</StatusBadge>
                          <div className="dependency-detail">{run.id}</div>
                        </td>
                        <td>{run.triggeredBy}</td>
                        <td>{formatDate(run.dueAt)}</td>
                        <td>{formatDate(run.updatedAt)}</td>
                      </tr>
                    ))}
                    {data.runs.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-empty">No schedule runs loaded.</div>
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
              <h2 className="section-card-title">Run Details</h2>
              <p className="section-card-description">Inspect selected schedule run output, error, and metadata.</p>
            </div>
            <div className="section-card-body">
              {selectedRun ? (
                <div className="knowledge-preview">
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Run ID</dt>
                      <dd className="detail-value">{selectedRun.id}</dd>
                    </div>
                    <div>
                      <dt className="label">Status</dt>
                      <dd className="detail-value">{selectedRun.status}</dd>
                    </div>
                    <div>
                      <dt className="label">Triggered By</dt>
                      <dd className="detail-value">{selectedRun.triggeredBy}</dd>
                    </div>
                    <div>
                      <dt className="label">Completed</dt>
                      <dd className="detail-value">{formatDate(selectedRun.completedAt)}</dd>
                    </div>
                  </dl>
                  {selectedRun.output ? (
                    <>
                      <div className="subsection-title">Output</div>
                      <p className="retrieval-content knowledge-preview-content">{selectedRun.output}</p>
                    </>
                  ) : null}
                  {selectedRun.error ? (
                    <>
                      <div className="subsection-title">Error</div>
                      <p className="retrieval-content knowledge-preview-content">{selectedRun.error}</p>
                    </>
                  ) : null}
                  <pre className="code-block compact-code">{JSON.stringify(selectedRun.metadata, null, 2)}</pre>
                </div>
              ) : (
                <div className="empty-state">Select a schedule run to inspect details.</div>
              )}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Scheduler Status</h2>
              <p className="section-card-description">Workflow scheduler mode and supported capabilities.</p>
            </div>
            <div className="section-card-body">
              {data.schedulerStatus ? (
                <>
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Enabled</dt>
                      <dd className="detail-value">{String(data.schedulerStatus.enabled)}</dd>
                    </div>
                    <div>
                      <dt className="label">Store</dt>
                      <dd className="detail-value">{data.schedulerStatus.store}</dd>
                    </div>
                  </dl>
                  <div className="subsection-title">Capabilities</div>
                  <div className="badge-row">
                    {data.schedulerStatus.capabilities.map((capability) => (
                      <StatusBadge key={capability}>{capability}</StatusBadge>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">No scheduler status loaded.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
