export type WorkflowScheduleType = "interval" | "cron";

export type WorkflowScheduleRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowSchedule = {
  id: string;
  tenantId: string;
  workflowId: string;
  createdBy: string;
  name: string;
  scheduleType: WorkflowScheduleType;
  cronExpression?: string;
  intervalSeconds?: number;
  timezone: string;
  enabled: boolean;
  maxConcurrentRuns: number;
  nextRunAt: string;
  lastRunAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowScheduleRun = {
  id: string;
  tenantId: string;
  scheduleId: string;
  workflowId: string;
  triggeredBy: "scheduler" | "manual" | "recovery";
  workerId?: string;
  status: WorkflowScheduleRunStatus;
  dueAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSchedulerStatus = {
  enabled: boolean;
  store: string;
  triggerModes: string[];
  capabilities: string[];
};
