import type {
  ModelMessage,
  ModelResponse,
  ModelToolDefinition,
  ModelUsage,
} from "../model-gateway/model-gateway.types.js";
import type { BuildContextResult } from "../memory-context/memory-context.types.js";
import type {
  ToolAuditEvent,
  ToolCallResponse,
  ToolExecutionContext,
} from "../tools/tool.types.js";

export type AgentStopReason =
  | "final_answer"
  | "max_steps"
  | "max_duration"
  | "model_error"
  | "max_tool_calls"
  | "empty_model_output"
  | "repeated_tool_call";

export type AgentExecutionPlanStage =
  | "context"
  | "planning"
  | "model"
  | "tool"
  | "finalize";

export type AgentExecutionPlanStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type AgentExecutionPlanStep = {
  id: string;
  stage: AgentExecutionPlanStage;
  title: string;
  status: AgentExecutionPlanStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AgentExecutionPlan = {
  id: string;
  requestId: string;
  status: "running" | "completed" | "failed";
  strategy: "react";
  createdAt: string;
  completedAt?: string;
  steps: AgentExecutionPlanStep[];
};

export type AgentRunOptions = {
  requestId: string;
  userId?: string;
  tenantId?: string;
  permissions: string[];
  systemPrompt?: string;
  messages?: ModelMessage[];
  userMessage: string;
  contextMaxTokens?: number;
  reservedResponseTokens?: number;
  maxSteps?: number;
  maxDurationMs?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AgentRuntimeStep =
  | {
      type: "model";
      step: number;
      response: Pick<
        ModelResponse,
        | "id"
        | "provider"
        | "model"
        | "finishReason"
        | "latencyMs"
        | "attempts"
        | "usage"
      > & {
        contentPreview: string;
        toolCalls: ModelResponse["toolCalls"];
      };
    }
  | {
      type: "tool";
      step: number;
      toolName: string;
      status: ToolCallResponse["status"];
      contentPreview: string;
      latencyMs: number;
      audit: ToolAuditEvent;
    };

export type AgentRunResult = {
  requestId: string;
  answer: string;
  stopReason: AgentStopReason;
  plan: AgentExecutionPlan;
  steps: AgentRuntimeStep[];
  messages: ModelMessage[];
  context: Pick<
    BuildContextResult,
    "budget" | "estimatedInputTokens" | "sources" | "droppedMessages"
  >;
  usage: ModelUsage;
  durationMs: number;
};

export type AgentToolCallPlan = {
  toolDefinitions: ModelToolDefinition[];
  context: ToolExecutionContext;
};
