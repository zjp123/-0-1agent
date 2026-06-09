import { Injectable } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { MemoryContextService } from "../memory-context/memory-context.service.js";
import type {
  ModelMessage,
  ModelRequest,
  ModelToolDefinition,
  ModelUsage,
} from "../model-gateway/model-gateway.types.js";
import { ModelGatewayService } from "../model-gateway/model-gateway.service.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { RagService } from "../rag/rag.service.js";
import { ToolRegistryService } from "../tools/tool-registry.service.js";
import type {
  ToolDefinition,
  ToolExecutionContext,
} from "../tools/tool.types.js";
import { WorkflowService } from "../workflow/workflow.service.js";
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeStep,
  AgentStopReason,
} from "./agent-runtime.types.js";

export type AgentCapabilitySnapshot = {
  runtime: {
    strategies: string[];
    controls: string[];
  };
  modelGateway: ReturnType<ModelGatewayService["getStatus"]>;
  tools: ReturnType<ToolRegistryService["getStatus"]>;
  memoryContext: ReturnType<MemoryContextService["getStatus"]>;
  rag: ReturnType<RagService["getStatus"]>;
  workflow: ReturnType<WorkflowService["getStatus"]>;
  auth: ReturnType<AuthService["getStatus"]>;
  observability: ReturnType<ObservabilityService["getStatus"]>;
};

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly modelGateway: ModelGatewayService,
    private readonly tools: ToolRegistryService,
    private readonly memoryContext: MemoryContextService,
    private readonly rag: RagService,
    private readonly workflow: WorkflowService,
    private readonly auth: AuthService,
    private readonly observability: ObservabilityService,
  ) {}

  getCapabilitySnapshot(): AgentCapabilitySnapshot {
    return {
      runtime: {
        strategies: ["ReAct", "Plan/Execute", "Reflection"],
        controls: [
          "max steps",
          "max duration",
          "tool error recovery",
          "loop termination",
          "task state tracking",
        ],
      },
      modelGateway: this.modelGateway.getStatus(),
      tools: this.tools.getStatus(),
      memoryContext: this.memoryContext.getStatus(),
      rag: this.rag.getStatus(),
      workflow: this.workflow.getStatus(),
      auth: this.auth.getStatus(),
      observability: this.observability.getStatus(),
    };
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const maxSteps = options.maxSteps ?? 6;
    const maxDurationMs = options.maxDurationMs ?? 60_000;
    const steps: AgentRuntimeStep[] = [];
    const usage = this.emptyUsage();
    const messages = this.buildInitialMessages(options);
    const toolDefinitions = this.tools
      .listDefinitions()
      .map((definition) => this.toModelToolDefinition(definition));

    let answer = "";
    let stopReason: AgentStopReason = "max_steps";

    for (let step = 1; step <= maxSteps; step += 1) {
      if (Date.now() - startedAt >= maxDurationMs) {
        stopReason = "max_duration";
        break;
      }

      const modelRequest: ModelRequest = {
        messages,
        tools: toolDefinitions,
      };
      if (options.model) {
        modelRequest.model = options.model;
      }
      if (options.temperature !== undefined) {
        modelRequest.temperature = options.temperature;
      }
      if (options.maxTokens !== undefined) {
        modelRequest.maxTokens = options.maxTokens;
      }

      let modelResponse;
      try {
        modelResponse = await this.modelGateway.generateText(modelRequest);
      } catch {
        stopReason = "model_error";
        break;
      }
      this.addUsage(usage, modelResponse.usage);
      const modelStep: AgentRuntimeStep = {
        type: "model",
        step,
        response: {
          id: modelResponse.id,
          provider: modelResponse.provider,
          model: modelResponse.model,
          finishReason: modelResponse.finishReason,
          latencyMs: modelResponse.latencyMs,
          attempts: modelResponse.attempts,
          contentPreview: this.truncate(modelResponse.content, 500),
          toolCalls: modelResponse.toolCalls,
        },
      };
      if (modelResponse.usage) {
        modelStep.response.usage = modelResponse.usage;
      }
      steps.push(modelStep);

      messages.push({
        role: "assistant",
        content: modelResponse.content,
        toolCalls: modelResponse.toolCalls,
      });

      if (modelResponse.toolCalls.length === 0) {
        answer = modelResponse.content;
        stopReason = "final_answer";
        break;
      }

      const toolContext = this.buildToolContext(options);
      const toolResponses = await Promise.all(
        modelResponse.toolCalls.map(async (toolCall) => {
          const toolResponse = await this.tools.execute({
            name: toolCall.name,
            arguments: this.parseToolArguments(toolCall.arguments),
            context: toolContext,
          });
          steps.push({
            type: "tool",
            step,
            toolName: toolResponse.toolName,
            status: toolResponse.status,
            contentPreview: this.truncate(toolResponse.content, 500),
            latencyMs: toolResponse.latencyMs,
            audit: toolResponse.audit,
          });
          return {
            toolCall,
            toolResponse,
          };
        }),
      );

      for (const { toolCall, toolResponse } of toolResponses) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: toolResponse.content,
        });
      }
    }

    if (!answer && stopReason !== "final_answer") {
      answer = this.stopReasonMessage(stopReason);
    }

    return {
      requestId: options.requestId,
      answer,
      stopReason,
      steps,
      messages,
      usage,
      durationMs: Date.now() - startedAt,
    };
  }

  private buildInitialMessages(options: AgentRunOptions): ModelMessage[] {
    const messages: ModelMessage[] = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    } else {
      messages.push({
        role: "system",
        content:
          "You are an enterprise-grade agent. Use tools when needed, keep answers concise, and explain uncertainty clearly.",
      });
    }

    if (options.messages) {
      messages.push(...options.messages);
    }

    messages.push({ role: "user", content: options.userMessage });
    return messages;
  }

  private buildToolContext(options: AgentRunOptions): ToolExecutionContext {
    const context: ToolExecutionContext = {
      requestId: options.requestId,
      permissions: options.permissions,
    };
    if (options.userId) {
      context.userId = options.userId;
    }
    if (options.tenantId) {
      context.tenantId = options.tenantId;
    }
    return context;
  }

  private toModelToolDefinition(definition: ToolDefinition): ModelToolDefinition {
    return {
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.inputSchema,
      },
    };
  }

  private parseToolArguments(rawArguments: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(rawArguments);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }

  private emptyUsage(): ModelUsage {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  private addUsage(total: ModelUsage, next: ModelUsage | undefined): void {
    if (!next) {
      return;
    }

    total.promptTokens += next.promptTokens;
    total.completionTokens += next.completionTokens;
    total.totalTokens += next.totalTokens;
  }

  private stopReasonMessage(stopReason: AgentStopReason): string {
    if (stopReason === "max_duration") {
      return "Agent stopped because the maximum duration was reached.";
    }
    if (stopReason === "model_error") {
      return "Agent stopped because the model request failed.";
    }
    return "Agent stopped because the maximum number of steps was reached.";
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }
}
