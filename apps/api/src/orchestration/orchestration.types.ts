import type { ModelUsage } from "../model-gateway/model-gateway.types.js";

export type OrchestrationParticipantRole =
  | "coordinator"
  | "worker"
  | "reviewer"
  | "specialist";

export type OrchestrationRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type OrchestrationHandoffStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type OrchestrationParticipant = {
  id: string;
  tenantId: string;
  name: string;
  role: OrchestrationParticipantRole;
  systemPrompt?: string;
  model?: string;
  enabled: boolean;
  maxSteps: number;
  maxDurationMs: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OrchestrationHandoff = {
  id: string;
  tenantId: string;
  runId: string;
  fromParticipantId?: string;
  toParticipantId: string;
  stepOrder: number;
  status: OrchestrationHandoffStatus;
  input: string;
  output?: string;
  error?: string;
  agentRequestId?: string;
  usage: Partial<ModelUsage>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrchestrationRun = {
  id: string;
  tenantId: string;
  createdBy: string;
  requestId: string;
  objective: string;
  strategy: "sequential_handoff";
  status: OrchestrationRunStatus;
  participantIds: string[];
  finalAnswer?: string;
  error?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  handoffs: OrchestrationHandoff[];
};

export type OrchestrationStatus = {
  enabled: boolean;
  store: string;
  strategies: string[];
  capabilities: string[];
};
