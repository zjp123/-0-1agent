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
  | "model_error";

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
