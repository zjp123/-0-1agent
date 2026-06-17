import {
  Body,
  Controller,
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
    @Inject(WorkflowRunExecutorService)
    private readonly workflowExecutor: WorkflowRunExecutorService,
    @Inject(EvaluationAgentRunnerService)
    private readonly evaluationAgentRunner: EvaluationAgentRunnerService,
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
    const options = this.toRunOptions(body, user);

    const result = await this.agentRuntime.run(options);
    await this.enforceTokenQuota(body, user, result);
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

    writeEvent("started", {
      requestId: body.requestId,
      timestamp: new Date().toISOString(),
    });

    try {
      await this.enforceRequestQuota(body, user);
      const result = await this.agentRuntime.run(this.toRunOptions(body, user));
      await this.enforceTokenQuota(body, user, result);

      for (const chunk of this.chunkText(result.answer, 120)) {
        writeEvent("delta", {
          requestId: result.requestId,
          content: chunk,
        });
      }

      writeEvent("result", {
        requestId: result.requestId,
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
      writeEvent("error", {
        requestId: body.requestId,
        message: error instanceof Error ? error.message : "Agent stream failed.",
      });
    } finally {
      response.end();
    }
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

  private toRunOptions(body: RunAgentDto, user: RequestUser): AgentRunOptions {
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
    if (body.messages) {
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
