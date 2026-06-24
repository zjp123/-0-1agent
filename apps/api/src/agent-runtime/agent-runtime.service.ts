import { Inject, Injectable } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import type { RequestUser } from "../auth/auth.types.js";
import { ApprovalService } from "../governance/approval.service.js";
import { MemoryContextService } from "../memory-context/memory-context.service.js";
import type { BuildContextRequest } from "../memory-context/memory-context.types.js";
import type {
  ModelMessage,
  ModelRequest,
  ModelToolDefinition,
  ModelToolCall,
  ModelUsage,
} from "../model-gateway/model-gateway.types.js";
import { ModelGatewayError } from "../model-gateway/model-gateway.errors.js";
import { ModelGatewayService } from "../model-gateway/model-gateway.service.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { RagService } from "../rag/rag.service.js";
import type { RetrieveKnowledgeInput } from "../rag/rag.types.js";
import { ToolRegistryService } from "../tools/tool-registry.service.js";
import type {
  ToolCallResponse,
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
  AgentRunPreflight,
  AgentRuntimeStep,
  AgentStopReason,
} from "./agent-runtime.types.js";
import { resolveModelToolCall, toModelSafeToolName } from "./tool-name-alias.js";

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
    @Inject(ApprovalService)
    private readonly approvals: ApprovalService,
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
    const preflight = this.buildPreflight(options);
    this.recordTrace(options, "agent.preflight.completed", {
      allowed: preflight.allowed,
      checkCount: preflight.checks.length,
      failedCheckCount: preflight.checks.filter((check) => check.status === "failed").length,
      warningCheckCount: preflight.checks.filter((check) => check.status === "warning").length,
      lowRiskToolCount: preflight.toolRisk.low,
      mediumRiskToolCount: preflight.toolRisk.medium,
      highRiskToolCount: preflight.toolRisk.high,
      criticalRiskToolCount: preflight.toolRisk.critical,
    });
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
    const toolNameAliases = new Map<string, string>();
    const toolDefinitions = this.tools
      .listDefinitions(this.toolRegistryContext(options))
      .map((definition) => this.toModelToolDefinition(definition, toolNameAliases));
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
    let modelErrorDetail: string | undefined;

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
      } catch (error) {
        modelErrorDetail = this.extractModelErrorDetail(error);
        // eslint-disable-next-line no-console
        console.error(`[AgentRuntime] model request failed at step ${step}:`, modelErrorDetail);
        stopReason = "model_error";
        this.completePlanStep(options, modelPlanStep, "failed", {
          summary: `Model request failed: ${modelErrorDetail}`,
          metadata: { loopStep: step, messageCount: messages.length, error: modelErrorDetail },
        });
        this.recordTrace(options, "model.failed", {
          step,
          messageCount: messages.length,
          error: modelErrorDetail,
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
        modelResponse.toolCalls.map((toolCall) =>
          resolveModelToolCall(toolCall, toolNameAliases),
        ),
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
      const toolResponses: Array<{
        toolCall: ModelToolCall;
        toolResponse: ToolCallResponse;
      }> = [];
      for (const rawToolCall of modelResponse.toolCalls) {
          const toolCall = resolveModelToolCall(rawToolCall, toolNameAliases);
          const toolPlanStep = this.startPlanStep(
            options,
            plan,
            "tool",
            step,
            toolCall.name,
          );
          const definition = this.tools
            .listDefinitions(this.toolRegistryContext(options))
            .find((candidate) => candidate.name === toolCall.name);
          if (definition && this.requiresApproval(definition.riskLevel)) {
            const approvalRequest = await this.createToolApprovalRequest(
              options,
              toolCall.name,
              this.parseToolArguments(toolCall.arguments),
              definition.riskLevel,
            );
            this.completePlanStep(options, toolPlanStep, "skipped", {
              summary: `${toolCall.name} requires approval`,
              metadata: {
                loopStep: step,
                toolName: toolCall.name,
                source: definition.source,
                riskLevel: definition.riskLevel,
                approvalRequestId: approvalRequest.id,
              },
            });
            this.recordTrace(options, "tool.completed", {
              step,
              toolName: toolCall.name,
              source: definition.source,
              riskLevel: definition.riskLevel,
              status: "denied",
              latencyMs: 0,
              hasStructuredOutput: false,
              requiredPermissionCount: definition.requiredPermissions.length,
              approvalRequired: true,
              approvalRequestId: approvalRequest.id,
            });
            steps.push({
              type: "tool",
              step,
              toolName: toolCall.name,
              source: definition.source,
              riskLevel: definition.riskLevel,
              requiredPermissions: definition.requiredPermissions,
              status: "denied",
              contentPreview: `Approval required before executing ${toolCall.name}.`,
              approvalRequestId: approvalRequest.id,
              latencyMs: 0,
              audit: {
                requestId: options.requestId,
                toolName: toolCall.name,
                source: definition.source,
                riskLevel: definition.riskLevel,
                status: "denied",
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                latencyMs: 0,
                inputPreview: this.truncate(toolCall.arguments, 500),
                resultPreview: "Approval required",
                error: "Approval required",
                requiredPermissions: definition.requiredPermissions,
                ...(options.userId ? { userId: options.userId } : {}),
                ...(options.tenantId ? { tenantId: options.tenantId } : {}),
              },
            });
            stopReason = "approval_required";
            break;
          }
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
          toolResponses.push({
            toolCall,
            toolResponse,
          });
        }

      if (stopReason === "approval_required") {
        break;
      }

      for (const { toolCall, toolResponse } of toolResponses) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: toolResponse.content,
        });
      }
    }

    if (!answer && stopReason !== "final_answer") {
      answer = this.stopReasonMessage(stopReason, modelErrorDetail);
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

  private buildPreflight(options: AgentRunOptions): AgentRunPreflight {
    const toolRisk: AgentRunPreflight["toolRisk"] = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const definition of this.tools.listDefinitions(this.toolRegistryContext(options))) {
      toolRisk[definition.riskLevel] += 1;
    }
    const checks: AgentRunPreflight["checks"] = [
      {
        name: "tenant_context",
        status: options.tenantId ? "passed" : "warning",
        summary: options.tenantId ? "Tenant context resolved." : "Run has no tenant context.",
      },
      {
        name: "agent_permission",
        status: options.permissions.includes("agent:run") ? "passed" : "failed",
        summary: options.permissions.includes("agent:run")
          ? "Actor has agent:run."
          : "Actor is missing agent:run.",
      },
      {
        name: "tool_permission",
        status: options.permissions.includes("tools:execute") ? "passed" : "warning",
        summary: options.permissions.includes("tools:execute")
          ? "Actor can execute tools when the model requests them."
          : "Tool calls may be denied because tools:execute is missing.",
      },
      {
        name: "tool_risk_catalog",
        status: toolRisk.high + toolRisk.critical > 0 ? "warning" : "passed",
        summary:
          toolRisk.high + toolRisk.critical > 0
            ? "High or critical risk tools are registered."
            : "No high or critical risk tools are registered.",
      },
      {
        name: "quota_request_check",
        status: "passed",
        summary: "Request quota is enforced before runtime execution by AgentRuntimeController.",
      },
    ];
    const preflight: AgentRunPreflight = {
      requestId: options.requestId,
      allowed: checks.every((check) => check.status !== "failed"),
      checks,
      toolRisk,
    };
    if (options.tenantId) {
      preflight.tenantId = options.tenantId;
    }
    if (options.userId) {
      preflight.userId = options.userId;
    }
    return preflight;
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

  private toModelToolDefinition(
    definition: ToolDefinition,
    aliases: Map<string, string>,
  ): ModelToolDefinition {
    const name = toModelSafeToolName(definition.name, aliases);
    return {
      type: "function",
      function: {
        name,
        description: definition.description,
        parameters: definition.inputSchema,
      },
    };
  }

  private toolRegistryContext(options: AgentRunOptions): { tenantId?: string } | undefined {
    return options.tenantId ? { tenantId: options.tenantId } : undefined;
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

  private stopReasonMessage(stopReason: AgentStopReason, errorDetail?: string): string {
    if (stopReason === "max_duration") {
      return "Agent stopped because the maximum duration was reached.";
    }
    if (stopReason === "model_error") {
      const base = "Agent stopped because the model request failed.";
      return errorDetail ? `${base} (${errorDetail})` : base;
    }
    if (stopReason === "approval_required") {
      return "Agent stopped because a high-risk tool requires approval before execution.";
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

  private extractModelErrorDetail(error: unknown): string {
    const cause = error instanceof ModelGatewayError ? error.options.cause : error;

    if (cause && typeof cause === "object") {
      const obj = cause as Record<string, unknown>;
      // OpenAI SDK errors carry an inner `.error` object with the provider message
      const innerError = obj["error"];
      if (innerError && typeof innerError === "object" && "message" in innerError) {
        const innerMessage = String((innerError as Record<string, unknown>)["message"]);
        const status = typeof obj["status"] === "number" ? obj["status"] : undefined;
        return status ? `[HTTP ${status}] ${innerMessage}` : innerMessage;
      }
      if (typeof obj["message"] === "string") {
        const status = typeof obj["status"] === "number" ? obj["status"] : undefined;
        const modelStatus = error instanceof ModelGatewayError ? error.options.statusCode : undefined;
        const httpStatus = status ?? modelStatus;
        return httpStatus ? `[HTTP ${httpStatus}] ${obj["message"]}` : obj["message"];
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
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

  private requiresApproval(riskLevel: ToolDefinition["riskLevel"]): boolean {
    return riskLevel === "high" || riskLevel === "critical";
  }

  private async createToolApprovalRequest(
    options: AgentRunOptions,
    toolName: string,
    toolArguments: Record<string, unknown>,
    riskLevel: ToolDefinition["riskLevel"],
  ): Promise<{ id: string }> {
    if (!options.tenantId || !options.userId) {
      return { id: `approval-unavailable-${options.requestId}` };
    }
    const actor: RequestUser = {
      tenantId: options.tenantId,
      userId: options.userId,
      roles: [],
      permissions: options.permissions as RequestUser["permissions"],
      authType: "service_token",
    };
    const request = await this.approvals.createRequest(
      {
        action: "tool.execute",
        resourceType: "tool",
        resourceId: toolName,
        reason: `Approve ${riskLevel} risk tool execution for Agent request ${options.requestId}.`,
        payload: {
          requestId: options.requestId,
          toolName,
          arguments: toolArguments,
        },
        metadata: {
          riskLevel,
          createdBy: "agent-runtime",
        },
      },
      actor,
    );
    return { id: request.id };
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
