import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { RequestUser } from "../auth/auth.types.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { WorkflowService } from "../workflow/workflow.service.js";
import type { Workflow, WorkflowStep } from "../workflow/workflow.types.js";
import { AgentRuntimeService } from "./agent-runtime.service.js";
import type { ExecuteWorkflowStepDto } from "./dto/execute-workflow-step.dto.js";
import type { AgentRunResult } from "./agent-runtime.types.js";

export type WorkflowStepExecutionResult = {
  workflow: Workflow;
  step: WorkflowStep;
  agentRun: Pick<
    AgentRunResult,
    "requestId" | "answer" | "stopReason" | "durationMs" | "usage" | "plan"
  >;
};

@Injectable()
export class WorkflowRunExecutorService {
  constructor(
    @Inject(WorkflowService)
    private readonly workflow: WorkflowService,
    @Inject(AgentRuntimeService)
    private readonly agentRuntime: AgentRuntimeService,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  async executeStep(
    workflowId: string,
    stepId: string,
    body: ExecuteWorkflowStepDto,
    user: RequestUser,
  ): Promise<WorkflowStepExecutionResult> {
    const workflow = await this.workflow.get(user.tenantId, workflowId);
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const step = workflow.steps.find((item) => item.id === stepId);
    if (!step) {
      throw new NotFoundException("Workflow step not found");
    }

    await this.workflow.updateStep({
      tenantId: user.tenantId,
      workflowId,
      stepId,
      userId: user.userId,
      status: "running",
    });

    const requestId = crypto.randomUUID();
    this.recordTrace(user, requestId, "workflow.step.execution.started", {
      workflowId,
      stepId,
      stepTitle: step.title,
    });

    const agentRun = await this.agentRuntime.run({
      requestId,
      userId: user.userId,
      tenantId: user.tenantId,
      permissions: user.permissions,
      userMessage: this.buildStepTask(workflow, step, body.instruction),
      maxSteps: body.maxSteps ?? 4,
      maxDurationMs: body.maxDurationMs ?? 60_000,
    });

    const completedStatus = agentRun.stopReason === "final_answer" ? "completed" : "failed";
    const updatedWorkflow = await this.workflow.updateStep({
      tenantId: user.tenantId,
      workflowId,
      stepId,
      userId: user.userId,
      status: completedStatus,
      output: agentRun.answer,
      ...(completedStatus === "failed"
        ? { error: `Agent stopped with ${agentRun.stopReason}` }
        : {}),
    });
    if (!updatedWorkflow) {
      throw new NotFoundException("Workflow or step not found after execution");
    }

    const updatedStep = updatedWorkflow.steps.find((item) => item.id === stepId);
    if (!updatedStep) {
      throw new NotFoundException("Workflow step not found after execution");
    }

    this.recordTrace(
      user,
      requestId,
      completedStatus === "completed"
        ? "workflow.step.execution.completed"
        : "workflow.step.execution.failed",
      {
        workflowId,
        stepId,
        stopReason: agentRun.stopReason,
        durationMs: agentRun.durationMs,
        totalTokens: agentRun.usage.totalTokens,
      },
      agentRun.durationMs,
    );

    return {
      workflow: updatedWorkflow,
      step: updatedStep,
      agentRun: {
        requestId: agentRun.requestId,
        answer: agentRun.answer,
        stopReason: agentRun.stopReason,
        durationMs: agentRun.durationMs,
        usage: agentRun.usage,
        plan: agentRun.plan,
      },
    };
  }

  private buildStepTask(
    workflow: Workflow,
    step: WorkflowStep,
    instruction: string | undefined,
  ): string {
    return [
      `Execute this workflow step.`,
      `Workflow: ${workflow.title}`,
      `Workflow goal: ${workflow.goal}`,
      `Step ${step.order}: ${step.title}`,
      step.description ? `Step description: ${step.description}` : undefined,
      instruction ? `Operator instruction: ${instruction}` : undefined,
      `Return a concise execution result, evidence, and next recommended action.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private recordTrace(
    user: RequestUser,
    requestId: string,
    type: Parameters<ObservabilityService["record"]>[0]["type"],
    attributes: Parameters<ObservabilityService["record"]>[0]["attributes"],
    durationMs?: number,
  ): void {
    const event: Parameters<ObservabilityService["record"]>[0] = {
      requestId,
      type,
      tenantId: user.tenantId,
      userId: user.userId,
      attributes,
    };
    if (durationMs !== undefined) {
      event.durationMs = durationMs;
    }
    this.observability.record(event);
  }
}
