import type { AgentStopReason } from "../agent-runtime/agent-runtime.types.js";
import type { ModelUsage } from "../model-gateway/model-gateway.types.js";
import type { ToolStatus } from "../tools/tool.types.js";

export type TraceEventType =
  | "agent.run.started"
  | "agent.context.built"
  | "rag.retrieved"
  | "model.completed"
  | "model.failed"
  | "tool.completed"
  | "agent.run.completed";

export type TraceEvent = {
  id: string;
  requestId: string;
  type: TraceEventType;
  timestamp: string;
  durationMs?: number;
  userId?: string;
  tenantId?: string;
  attributes: Record<string, string | number | boolean | null>;
};

export type TraceQuery = {
  requestId?: string;
  type?: TraceEventType;
  limit?: number;
};

export type AgentRunCompletedAttributes = {
  stopReason: AgentStopReason;
  durationMs: number;
  stepCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelCompletedAttributes = {
  provider: string;
  model: string;
  latencyMs: number;
  attempts: number;
  finishReason: string | null;
  toolCallCount: number;
  usage?: ModelUsage;
};

export type ToolCompletedAttributes = {
  toolName: string;
  status: ToolStatus;
  latencyMs: number;
};
