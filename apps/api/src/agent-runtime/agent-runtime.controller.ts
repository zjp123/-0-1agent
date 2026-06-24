import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { QuotaService } from "../governance/quota.service.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { AgentConversationService } from "./agent-conversation.service.js";
import type {
  AgentConversation,
  AgentConversationMessage,
} from "./agent-conversation.types.js";
import { CreateAgentConversationDto } from "./dto/create-agent-conversation.dto.js";
import {
  AgentCapabilitySnapshot,
  AgentRuntimeService,
} from "./agent-runtime.service.js";
import { ExecuteWorkflowStepDto } from "./dto/execute-workflow-step.dto.js";
import { ExecuteWorkflowPendingStepsDto } from "./dto/execute-workflow-pending-steps.dto.js";
import { RunAgentEvaluationDto } from "./dto/run-agent-evaluation.dto.js";
import { RunAgentEvaluationBatchDto } from "./dto/run-agent-evaluation-batch.dto.js";
import { RunAgentDto } from "./dto/run-agent.dto.js";
import type { AgentRunOptions, AgentRunResult } from "./agent-runtime.types.js";
import {
  EvaluationAgentRunnerService,
  type AgentEvaluationBatchRunResult,
  type AgentEvaluationRunResult,
} from "./evaluation-agent-runner.service.js";
import {
  WorkflowRunExecutorService,
  type WorkflowPendingStepsExecutionResult,
  type WorkflowStepExecutionResult,
} from "./workflow-run-executor.service.js";

@Controller("agent")
export class AgentRuntimeController {
  constructor(
    @Inject(AgentRuntimeService)
    private readonly agentRuntime: AgentRuntimeService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
    @Inject(WorkflowRunExecutorService)
    private readonly workflowExecutor: WorkflowRunExecutorService,
    @Inject(EvaluationAgentRunnerService)
    private readonly evaluationAgentRunner: EvaluationAgentRunnerService,
    @Inject(AgentConversationService)
    private readonly conversations: AgentConversationService,
  ) {}

  @Get("capabilities")
  getCapabilities(): AgentCapabilitySnapshot {
    return this.agentRuntime.getCapabilitySnapshot();
  }

  @Post("run")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  async runAgent(
    @Body() body: RunAgentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentRunResult> {
    await this.enforceRequestQuota(body, user);
    const conversation = await this.conversations.ensureConversation(
      user,
      body.sessionId,
      body.message,
    );
    const persistedHistory = await this.conversations.getModelHistory(
      user,
      conversation.id,
    );
    await this.conversations.appendMessage({
      tenantId: user.tenantId,
      userId: user.userId,
      sessionId: conversation.id,
      role: "user",
      content: body.message,
    });
    const options = this.toRunOptions(body, user, persistedHistory);

    const result = await this.agentRuntime.run(options);
    await this.enforceTokenQuota(body, user, result);
    await this.conversations.appendMessage({
      tenantId: user.tenantId,
      userId: user.userId,
      sessionId: conversation.id,
      role: "assistant",
      content: result.answer,
    });
    return result;
  }

  @Post("run/stream")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  async streamAgentRun(
    @Body() body: RunAgentDto,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const writeEvent = (event: string, data: Record<string, unknown>): void => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      writeEvent("heartbeat", {
        requestId: body.requestId,
        timestamp: new Date().toISOString(),
      });
    }, 15_000);

    let conversation: AgentConversation | undefined;
    try {
      await this.enforceRequestQuota(body, user);
      conversation = await this.conversations.ensureConversation(
        user,
        body.sessionId,
        body.message,
      );
      writeEvent("started", {
        requestId: body.requestId,
        sessionId: conversation.id,
        timestamp: new Date().toISOString(),
      });
      const persistedHistory = await this.conversations.getModelHistory(
        user,
        conversation.id,
      );
      await this.conversations.appendMessage({
        tenantId: user.tenantId,
        userId: user.userId,
        sessionId: conversation.id,
        role: "user",
        content: body.message,
      });
      const result = await this.agentRuntime.run(
        this.toRunOptions(body, user, persistedHistory),
      );
      await this.enforceTokenQuota(body, user, result);
      await this.conversations.appendMessage({
        tenantId: user.tenantId,
        userId: user.userId,
        sessionId: conversation.id,
        role: "assistant",
        content: result.answer,
      });

      for (const chunk of this.chunkText(result.answer, 120)) {
        writeEvent("delta", {
          requestId: result.requestId,
          sessionId: conversation.id,
          content: chunk,
        });
      }

      writeEvent("result", {
        requestId: result.requestId,
        sessionId: conversation.id,
        stopReason: result.stopReason,
        sourceSummary: result.sourceSummary,
        plan: result.plan,
        steps: result.steps,
        context: result.context,
        usage: result.usage,
        durationMs: result.durationMs,
      });
      writeEvent("done", {
        requestId: result.requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (conversation) {
        await this.conversations.appendMessage({
          tenantId: user.tenantId,
          userId: user.userId,
          sessionId: conversation.id,
          role: "assistant",
          content: "生成失败。请查看本次运行详情或稍后重试。",
        });
      }
      writeEvent("error", {
        requestId: body.requestId,
        ...(conversation ? { sessionId: conversation.id } : {}),
        message: error instanceof Error ? error.message : "Agent stream failed.",
      });
    } finally {
      clearInterval(heartbeat);
      response.end();
    }
  }

  @Get("conversations")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  listConversations(
    @CurrentUser() user: RequestUser,
  ): Promise<AgentConversation[]> {
    return this.conversations.list(user);
  }

  @Post("conversations")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  createConversation(
    @Body() body: CreateAgentConversationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentConversation> {
    const input = {
      tenantId: user.tenantId,
      userId: user.userId,
      ...(body.title ? { title: body.title } : {}),
    };
    return this.conversations.create(input);
  }

  @Get("conversations/:sessionId/messages")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  listConversationMessages(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentConversationMessage[]> {
    return this.conversations.getMessages(user, sessionId);
  }

  @Delete("conversations/:sessionId")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  deleteConversation(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ deleted: true }> {
    return this.conversations.delete(user, sessionId);
  }

  @Post("workflows/:workflowId/steps/:stepId/execute")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("workflow:manage")
  executeWorkflowStep(
    @Param("workflowId") workflowId: string,
    @Param("stepId") stepId: string,
    @Body() body: ExecuteWorkflowStepDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowStepExecutionResult> {
    return this.workflowExecutor.executeStep(workflowId, stepId, body, user);
  }

  @Post("workflows/:workflowId/execute-pending")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("workflow:manage")
  executeWorkflowPendingSteps(
    @Param("workflowId") workflowId: string,
    @Body() body: ExecuteWorkflowPendingStepsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowPendingStepsExecutionResult> {
    return this.workflowExecutor.executePendingSteps(workflowId, body, user);
  }

  @Post("evaluations/cases/:caseId/run")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("evaluation:manage")
  runEvaluationCaseWithAgent(
    @Param("caseId") caseId: string,
    @Body() body: RunAgentEvaluationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentEvaluationRunResult> {
    return this.evaluationAgentRunner.runCaseWithAgent(caseId, body, user);
  }

  @Post("evaluations/run-batch")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("evaluation:manage")
  runEvaluationBatchWithAgent(
    @Body() body: RunAgentEvaluationBatchDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentEvaluationBatchRunResult> {
    return this.evaluationAgentRunner.runBatchWithAgent(body, user);
  }

  private toRunOptions(
    body: RunAgentDto,
    user: RequestUser,
    persistedHistory?: AgentRunOptions["messages"],
  ): AgentRunOptions {
    const options: AgentRunOptions = {
      requestId: body.requestId,
      userMessage: body.message,
      userId: user.userId,
      tenantId: user.tenantId,
      permissions: user.permissions,
    };

    if (body.systemPrompt) {
      options.systemPrompt = body.systemPrompt;
    }
    if (persistedHistory) {
      options.messages = persistedHistory;
    } else if (body.messages) {
      options.messages = body.messages;
    }
    if (body.maxSteps !== undefined) {
      options.maxSteps = body.maxSteps;
    }
    if (body.contextMaxTokens !== undefined) {
      options.contextMaxTokens = body.contextMaxTokens;
    }
    if (body.reservedResponseTokens !== undefined) {
      options.reservedResponseTokens = body.reservedResponseTokens;
    }
    if (body.maxDurationMs !== undefined) {
      options.maxDurationMs = body.maxDurationMs;
    }
    if (body.model) {
      options.model = body.model;
    }

    return options;
  }

  private async enforceRequestQuota(
    body: RunAgentDto,
    user: RequestUser,
  ): Promise<void> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "agent.run",
      metadata: { requestId: body.requestId, model: body.model ?? null },
    });
  }

  private async enforceTokenQuota(
    body: RunAgentDto,
    user: RequestUser,
    result: AgentRunResult,
  ): Promise<void> {
    if (result.usage.totalTokens <= 0) {
      this.recordUsageTrace(body, user, result, "skipped_zero_tokens");
      return;
    }

    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "agent.run",
      requestCost: 0,
      tokenCost: result.usage.totalTokens,
      metadata: {
        requestId: body.requestId,
        model: body.model ?? null,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
      },
    });
    this.recordUsageTrace(body, user, result, "recorded");
  }

  private recordUsageTrace(
    body: RunAgentDto,
    user: RequestUser,
    result: AgentRunResult,
    status: "recorded" | "skipped_zero_tokens",
  ): void {
    this.observability.record({
      requestId: body.requestId,
      type: "agent.usage.recorded",
      tenantId: user.tenantId,
      userId: user.userId,
      attributes: {
        status,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        model: body.model ?? null,
      },
    });
  }

  private chunkText(value: string, chunkSize: number): string[] {
    if (!value) {
      return [];
    }

    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += chunkSize) {
      chunks.push(value.slice(index, index + chunkSize));
    }
    return chunks;
  }
}
