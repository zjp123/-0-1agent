import { Inject, Injectable } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { MemoryContextService } from "../memory-context/memory-context.service.js";
import type { BuildContextRequest } from "../memory-context/memory-context.types.js";
import type {
  ModelMessage,
  ModelRequest,
  ModelToolDefinition,
  ModelUsage,
} from "../model-gateway/model-gateway.types.js";
import { ModelGatewayService } from "../model-gateway/model-gateway.service.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { RagService } from "../rag/rag.service.js";
import type { RetrieveKnowledgeInput } from "../rag/rag.types.js";
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
    @Inject(ModelGatewayService)
    private readonly modelGateway: ModelGatewayService,
    @Inject(ToolRegistryService)
    private readonly tools: ToolRegistryService,
    @Inject(MemoryContextService)
    private readonly memoryContext: MemoryContextService,
    @Inject(RagService)
    private readonly rag: RagService,
    @Inject(WorkflowService)
    private readonly workflow: WorkflowService,
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(ObservabilityService)
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
    this.recordTrace(options, "agent.run.started", {
      maxSteps,
      maxDurationMs,
      hasTenant: Boolean(options.tenantId),
      hasHistory: Boolean(options.messages?.length),
    });

    const contextRequest: BuildContextRequest = {
      userMessage: options.userMessage,
    };
    let retrievedKnowledgeCount = 0;
    if (options.tenantId) {
      const retrievalInput: RetrieveKnowledgeInput = {
        tenantId: options.tenantId,
        requestId: options.requestId,
        query: options.userMessage,
        limit: 5,
      };
      if (options.userId) {
        retrievalInput.userId = options.userId;
      }
      const retrievedKnowledge = await this.rag.retrieveAsContextMessages(
        retrievalInput,
      );
      retrievedKnowledgeCount = retrievedKnowledge.length;
      this.recordTrace(options, "rag.retrieved", {
        resultMessageCount: retrievedKnowledge.length,
      });
      if (retrievedKnowledge.length > 0) {
        contextRequest.retrievedKnowledge = retrievedKnowledge;
      }
    }
    if (options.systemPrompt) {
      contextRequest.systemPrompt = options.systemPrompt;
    }
    if (options.messages) {
      contextRequest.history = options.messages;
    }
    if (options.contextMaxTokens !== undefined) {
      contextRequest.maxTokens = options.contextMaxTokens;
    }
    if (options.reservedResponseTokens !== undefined) {
      contextRequest.reservedResponseTokens = options.reservedResponseTokens;
    }

    const context = this.memoryContext.buildContext(contextRequest);
    this.recordTrace(options, "agent.context.built", {
      estimatedInputTokens: context.estimatedInputTokens,
      droppedMessages: context.droppedMessages,
      sourceCount: context.sources.length,
      includedSourceCount: context.sources.filter((source) => source.included).length,
      retrievedKnowledgeCount,
    });

    const messages = [...context.messages];
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
        this.recordTrace(options, "model.failed", {
          step,
          messageCount: messages.length,
        });
        break;
      }
      this.addUsage(usage, modelResponse.usage);
      this.recordTrace(
        options,
        "model.completed",
        {
          step,
          provider: modelResponse.provider,
          model: modelResponse.model,
          latencyMs: modelResponse.latencyMs,
          attempts: modelResponse.attempts,
          finishReason: modelResponse.finishReason,
          toolCallCount: modelResponse.toolCalls.length,
          promptTokens: modelResponse.usage?.promptTokens ?? 0,
          completionTokens: modelResponse.usage?.completionTokens ?? 0,
          totalTokens: modelResponse.usage?.totalTokens ?? 0,
        },
        modelResponse.latencyMs,
      );
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
          this.recordTrace(
            options,
            "tool.completed",
            {
              step,
              toolName: toolResponse.toolName,
              status: toolResponse.status,
              latencyMs: toolResponse.latencyMs,
            },
            toolResponse.latencyMs,
          );
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

    const durationMs = Date.now() - startedAt;
    this.recordTrace(
      options,
      "agent.run.completed",
      {
        stopReason,
        stepCount: steps.length,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
      durationMs,
    );

    return {
      requestId: options.requestId,
      answer,
      stopReason,
      steps,
      messages,
      context: {
        budget: context.budget,
        estimatedInputTokens: context.estimatedInputTokens,
        sources: context.sources,
        droppedMessages: context.droppedMessages,
      },
      usage,
      durationMs,
    };
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

  private recordTrace(
    options: AgentRunOptions,
    type: Parameters<ObservabilityService["record"]>[0]["type"],
    attributes: Parameters<ObservabilityService["record"]>[0]["attributes"],
    durationMs?: number,
  ): void {
    const event: Parameters<ObservabilityService["record"]>[0] = {
      requestId: options.requestId,
      type,
      attributes,
    };
    if (options.userId) {
      event.userId = options.userId;
    }
    if (options.tenantId) {
      event.tenantId = options.tenantId;
    }
    if (durationMs !== undefined) {
      event.durationMs = durationMs;
    }
    this.observability.record(event);
  }
}
