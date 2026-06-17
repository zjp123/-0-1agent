import { Inject, Injectable } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { MemoryContextService } from "../memory-context/memory-context.service.js";
import type { BuildContextRequest } from "../memory-context/memory-context.types.js";
import type {
  ModelMessage,
  ModelRequest,
  ModelToolDefinition,
  ModelToolCall,
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
  AgentExecutionPlan,
  AgentExecutionPlanStage,
  AgentExecutionPlanStep,
  AgentExecutionPlanStepStatus,
  AgentRuntimeStep,
  AgentStopReason,
} from "./agent-runtime.types.js";

const DEFAULT_MAX_TOTAL_TOOL_CALLS = 12;
const DEFAULT_MAX_CONSECUTIVE_EMPTY_MODEL_OUTPUTS = 2;
const DEFAULT_MAX_REPEATED_TOOL_CALLS = 3;

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
    const maxTotalToolCalls = Math.min(maxSteps * 3, DEFAULT_MAX_TOTAL_TOOL_CALLS);
    const steps: AgentRuntimeStep[] = [];
    const usage = this.emptyUsage();
    const plan = this.createExecutionPlan(options);
    const loopGuard = {
      totalToolCalls: 0,
      consecutiveEmptyModelOutputs: 0,
      toolCallCounts: new Map<string, number>(),
    };
    this.recordTrace(options, "agent.run.started", {
      maxSteps,
      maxDurationMs,
      maxTotalToolCalls,
      maxConsecutiveEmptyModelOutputs: DEFAULT_MAX_CONSECUTIVE_EMPTY_MODEL_OUTPUTS,
      maxRepeatedToolCalls: DEFAULT_MAX_REPEATED_TOOL_CALLS,
      hasTenant: Boolean(options.tenantId),
      hasHistory: Boolean(options.messages?.length),
    });
    this.recordTrace(options, "agent.plan.created", {
      planId: plan.id,
      strategy: plan.strategy,
      stepCount: plan.steps.length,
    });

    const contextPlanStep = this.startPlanStep(options, plan, "context");
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
      const retrievedKnowledge = await this.rag.retrieveAsContext(
        retrievalInput,
      );
      retrievedKnowledgeCount = retrievedKnowledge.results.length;
      this.recordTrace(options, "rag.retrieved", {
        resultMessageCount: retrievedKnowledge.messages.length,
        resultCount: retrievedKnowledge.results.length,
      });
      if (retrievedKnowledge.messages.length > 0) {
        contextRequest.retrievedKnowledge = retrievedKnowledge.messages;
        contextRequest.retrievedKnowledgeSources = retrievedKnowledge.sources;
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
    this.completePlanStep(options, contextPlanStep, "completed", {
      summary: `${context.sources.filter((source) => source.included).length}/${context.sources.length} context sources included`,
      metadata: {
        estimatedInputTokens: context.estimatedInputTokens,
        droppedMessages: context.droppedMessages,
        retrievedKnowledgeCount,
      },
    });
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
    const planningPlanStep = this.startPlanStep(options, plan, "planning");
    this.completePlanStep(options, planningPlanStep, "completed", {
      summary: `${toolDefinitions.length} tools available for ReAct loop`,
      metadata: {
        maxSteps,
        maxDurationMs,
        maxTotalToolCalls,
        maxConsecutiveEmptyModelOutputs: DEFAULT_MAX_CONSECUTIVE_EMPTY_MODEL_OUTPUTS,
        maxRepeatedToolCalls: DEFAULT_MAX_REPEATED_TOOL_CALLS,
        toolDefinitionCount: toolDefinitions.length,
      },
    });

    let answer = "";
    let stopReason: AgentStopReason = "max_steps";

    for (let step = 1; step <= maxSteps; step += 1) {
      if (Date.now() - startedAt >= maxDurationMs) {
        stopReason = "max_duration";
        break;
      }

      const modelPlanStep = this.startPlanStep(options, plan, "model", step);
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
        this.completePlanStep(options, modelPlanStep, "failed", {
          summary: "Model request failed",
          metadata: { loopStep: step, messageCount: messages.length },
        });
        this.recordTrace(options, "model.failed", {
          step,
          messageCount: messages.length,
        });
        break;
      }
      this.completePlanStep(options, modelPlanStep, "completed", {
        summary:
          modelResponse.toolCalls.length > 0
            ? `${modelResponse.toolCalls.length} tool call(s) requested`
            : "Final answer produced",
        metadata: {
          loopStep: step,
          provider: modelResponse.provider,
          model: modelResponse.model,
          latencyMs: modelResponse.latencyMs,
          toolCallCount: modelResponse.toolCalls.length,
        },
      });
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

      if (modelResponse.content.trim().length === 0 && modelResponse.toolCalls.length === 0) {
        loopGuard.consecutiveEmptyModelOutputs += 1;
      } else {
        loopGuard.consecutiveEmptyModelOutputs = 0;
      }

      messages.push({
        role: "assistant",
        content: modelResponse.content,
        toolCalls: modelResponse.toolCalls,
      });

      if (modelResponse.toolCalls.length === 0) {
        if (modelResponse.content.trim().length === 0) {
          if (
            loopGuard.consecutiveEmptyModelOutputs >=
            DEFAULT_MAX_CONSECUTIVE_EMPTY_MODEL_OUTPUTS
          ) {
            stopReason = "empty_model_output";
            this.completePlanStep(options, modelPlanStep, "failed", {
              summary: "Stopped after repeated empty model output",
              metadata: {
                loopStep: step,
                consecutiveEmptyModelOutputs: loopGuard.consecutiveEmptyModelOutputs,
              },
            });
            break;
          }
          messages.push({
            role: "user",
            content:
              "The previous model response was empty. Continue with a concise final answer or request a tool if needed.",
          });
          continue;
        }
        answer = modelResponse.content;
        stopReason = "final_answer";
        break;
      }

      const guardStopReason = this.evaluateToolLoopGuard(
        modelResponse.toolCalls,
        loopGuard,
        maxTotalToolCalls,
      );
      if (guardStopReason) {
        stopReason = guardStopReason;
        this.completePlanStep(options, modelPlanStep, "failed", {
          summary: this.stopReasonMessage(stopReason),
          metadata: {
            loopStep: step,
            totalToolCalls: loopGuard.totalToolCalls,
          },
        });
        break;
      }

      const toolContext = this.buildToolContext(options);
      const toolResponses = await Promise.all(
        modelResponse.toolCalls.map(async (toolCall) => {
          const toolPlanStep = this.startPlanStep(
            options,
            plan,
            "tool",
            step,
            toolCall.name,
          );
          const toolResponse = await this.tools.execute({
            name: toolCall.name,
            arguments: this.parseToolArguments(toolCall.arguments),
            context: toolContext,
          });
          this.completePlanStep(
            options,
            toolPlanStep,
            toolResponse.status === "success" ? "completed" : "failed",
            {
              summary: `${toolResponse.toolName} ${toolResponse.status}`,
              metadata: {
                loopStep: step,
                toolName: toolResponse.toolName,
                source: toolResponse.source,
                riskLevel: toolResponse.riskLevel,
                latencyMs: toolResponse.latencyMs,
                hasStructuredOutput: Boolean(toolResponse.data),
              },
            },
          );
          this.recordTrace(
            options,
            "tool.completed",
            {
              step,
              toolName: toolResponse.toolName,
              source: toolResponse.source,
              riskLevel: toolResponse.riskLevel,
              status: toolResponse.status,
              latencyMs: toolResponse.latencyMs,
              hasStructuredOutput: Boolean(toolResponse.data),
              requiredPermissionCount: toolResponse.requiredPermissions.length,
            },
            toolResponse.latencyMs,
          );
          const runtimeToolStep: AgentRuntimeStep = {
            type: "tool",
            step,
            toolName: toolResponse.toolName,
            source: toolResponse.source,
            riskLevel: toolResponse.riskLevel,
            requiredPermissions: toolResponse.requiredPermissions,
            status: toolResponse.status,
            contentPreview: this.truncate(toolResponse.content, 500),
            latencyMs: toolResponse.latencyMs,
            audit: toolResponse.audit,
          };
          if (toolResponse.data) {
            runtimeToolStep.structuredOutput = toolResponse.data;
          }
          steps.push(runtimeToolStep);
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

    const finalizePlanStep = this.startPlanStep(options, plan, "finalize");
    const durationMs = Date.now() - startedAt;
    this.completePlanStep(options, finalizePlanStep, "completed", {
      summary: `Run finished with ${stopReason}`,
      metadata: {
        stopReason,
        runtimeStepCount: steps.length,
        totalTokens: usage.totalTokens,
      },
    });
    plan.status = stopReason === "model_error" ? "failed" : "completed";
    plan.completedAt = new Date().toISOString();
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
      sourceSummary: this.buildSourceSummary(context.sources),
      stopReason,
      plan,
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

  private buildSourceSummary(
    sources: AgentRunResult["context"]["sources"],
  ): AgentRunResult["sourceSummary"] {
    return sources
      .filter((source) => source.layer === "retrieved_knowledge" && source.included)
      .map((source) => {
        const metadata = source.metadata ?? {};
        const summary: AgentRunResult["sourceSummary"][number] = {
          id: source.id,
        };
        if (typeof metadata.title === "string") {
          summary.title = metadata.title;
        }
        if (typeof metadata.sourceType === "string") {
          summary.sourceType = metadata.sourceType;
        }
        if (typeof metadata.sourceUri === "string") {
          summary.sourceUri = metadata.sourceUri;
        }
        if (typeof metadata.documentId === "string") {
          summary.documentId = metadata.documentId;
        }
        if (typeof metadata.chunkId === "string") {
          summary.chunkId = metadata.chunkId;
        }
        if (typeof metadata.score === "number") {
          summary.score = metadata.score;
        }
        if (typeof metadata.retrievalMode === "string") {
          summary.retrievalMode = metadata.retrievalMode;
        }
        return summary;
      });
  }

  private createExecutionPlan(options: AgentRunOptions): AgentExecutionPlan {
    return {
      id: `${options.requestId}:plan`,
      requestId: options.requestId,
      status: "running",
      strategy: "react",
      createdAt: new Date().toISOString(),
      steps: [
        this.createPlanStep("context", "Build memory and RAG context"),
        this.createPlanStep("planning", "Prepare ReAct loop controls and available tools"),
      ],
    };
  }

  private createPlanStep(
    stage: AgentExecutionPlanStage,
    title: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): AgentExecutionPlanStep {
    const step: AgentExecutionPlanStep = {
      id: crypto.randomUUID(),
      stage,
      title,
      status: "pending",
    };
    if (metadata) {
      step.metadata = metadata;
    }
    return step;
  }

  private startPlanStep(
    options: AgentRunOptions,
    plan: AgentExecutionPlan,
    stage: AgentExecutionPlanStage,
    loopStep?: number,
    label?: string,
  ): AgentExecutionPlanStep {
    const existing = plan.steps.find((step) => step.stage === stage && step.status === "pending");
    const step =
      existing ??
      this.createPlanStep(
        stage,
        this.planStepTitle(stage, loopStep, label),
        this.planStepMetadata(loopStep, label),
      );

    if (!existing) {
      plan.steps.push(step);
    }

    step.status = "running";
    step.startedAt = new Date().toISOString();
    this.recordTrace(options, "agent.plan.step.started", {
      planId: plan.id,
      planStepId: step.id,
      stage: step.stage,
      title: step.title,
      loopStep: loopStep ?? null,
      label: label ?? null,
    });
    return step;
  }

  private completePlanStep(
    options: AgentRunOptions,
    step: AgentExecutionPlanStep,
    status: AgentExecutionPlanStepStatus,
    details: {
      summary?: string;
      metadata?: Record<string, string | number | boolean | null>;
    } = {},
  ): void {
    step.status = status;
    step.completedAt = new Date().toISOString();
    if (step.startedAt) {
      step.durationMs = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
    }
    if (details.summary) {
      step.summary = details.summary;
    }
    if (details.metadata) {
      step.metadata = { ...(step.metadata ?? {}), ...details.metadata };
    }
    this.recordTrace(
      options,
      "agent.plan.step.completed",
      {
        planStepId: step.id,
        stage: step.stage,
        status: step.status,
        summary: step.summary ?? null,
      },
      step.durationMs,
    );
  }

  private planStepTitle(
    stage: AgentExecutionPlanStage,
    loopStep?: number,
    label?: string,
  ): string {
    if (stage === "model") {
      return `Model reasoning step ${loopStep ?? "unknown"}`;
    }
    if (stage === "tool") {
      return `Execute tool ${label ?? "unknown"}`;
    }
    if (stage === "finalize") {
      return "Finalize answer and run metadata";
    }
    if (stage === "planning") {
      return "Prepare ReAct loop controls and available tools";
    }
    return "Build memory and RAG context";
  }

  private planStepMetadata(
    loopStep?: number,
    label?: string,
  ): Record<string, string | number | boolean | null> | undefined {
    if (loopStep === undefined && label === undefined) {
      return undefined;
    }
    return {
      loopStep: loopStep ?? null,
      label: label ?? null,
    };
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
    if (stopReason === "max_tool_calls") {
      return "Agent stopped because the maximum number of tool calls was reached.";
    }
    if (stopReason === "empty_model_output") {
      return "Agent stopped because the model returned empty output repeatedly.";
    }
    if (stopReason === "repeated_tool_call") {
      return "Agent stopped because the same tool call repeated too many times.";
    }
    return "Agent stopped because the maximum number of steps was reached.";
  }

  private evaluateToolLoopGuard(
    toolCalls: ModelToolCall[],
    guard: {
      totalToolCalls: number;
      consecutiveEmptyModelOutputs: number;
      toolCallCounts: Map<string, number>;
    },
    maxTotalToolCalls: number,
  ): AgentStopReason | undefined {
    guard.totalToolCalls += toolCalls.length;
    if (guard.totalToolCalls > maxTotalToolCalls) {
      return "max_tool_calls";
    }

    for (const toolCall of toolCalls) {
      const signature = this.toolCallSignature(toolCall);
      const count = (guard.toolCallCounts.get(signature) ?? 0) + 1;
      guard.toolCallCounts.set(signature, count);
      if (count >= DEFAULT_MAX_REPEATED_TOOL_CALLS) {
        return "repeated_tool_call";
      }
    }

    return undefined;
  }

  private toolCallSignature(toolCall: ModelToolCall): string {
    return `${toolCall.name}:${this.normalizeToolArguments(toolCall.arguments)}`;
  }

  private normalizeToolArguments(rawArguments: string): string {
    try {
      return JSON.stringify(JSON.parse(rawArguments));
    } catch {
      return rawArguments.trim();
    }
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
