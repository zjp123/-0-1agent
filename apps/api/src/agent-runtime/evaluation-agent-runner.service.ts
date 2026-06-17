import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { RequestUser } from "../auth/auth.types.js";
import { EvaluationService } from "../evaluation/evaluation.service.js";
import type { EvaluationRun } from "../evaluation/evaluation.types.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { AgentRuntimeService } from "./agent-runtime.service.js";
import type { AgentRunResult } from "./agent-runtime.types.js";
import type { RunAgentEvaluationDto } from "./dto/run-agent-evaluation.dto.js";

export type AgentEvaluationRunResult = {
  evaluationRun: EvaluationRun;
  agentRun: Pick<
    AgentRunResult,
    "requestId" | "answer" | "stopReason" | "durationMs" | "usage" | "plan"
  >;
};

@Injectable()
export class EvaluationAgentRunnerService {
  constructor(
    @Inject(EvaluationService)
    private readonly evaluation: EvaluationService,
    @Inject(AgentRuntimeService)
    private readonly agentRuntime: AgentRuntimeService,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  async runCaseWithAgent(
    caseId: string,
    body: RunAgentEvaluationDto,
    user: RequestUser,
  ): Promise<AgentEvaluationRunResult> {
    const evaluationCase = await this.evaluation.getCase(user.tenantId, caseId);
    if (!evaluationCase) {
      throw new NotFoundException("Evaluation case not found");
    }

    const requestId = crypto.randomUUID();
    this.recordTrace(user, requestId, "evaluation.agent.run.started", {
      caseId,
      caseName: evaluationCase.name,
      caseType: evaluationCase.type,
    });

    const agentRun = await this.agentRuntime.run({
      requestId,
      userId: user.userId,
      tenantId: user.tenantId,
      permissions: user.permissions,
      userMessage: this.buildEvaluationTask(evaluationCase.input, body.instruction),
      maxSteps: body.maxSteps ?? 4,
      maxDurationMs: body.maxDurationMs ?? 60_000,
    });

    const evaluationRun = await this.evaluation.run({
      tenantId: user.tenantId,
      caseId,
      actualOutput: agentRun.answer,
      notes: [
        `agentRequestId=${agentRun.requestId}`,
        `agentStopReason=${agentRun.stopReason}`,
        `agentDurationMs=${agentRun.durationMs}`,
        `agentTotalTokens=${agentRun.usage.totalTokens}`,
      ],
    });

    this.recordTrace(
      user,
      requestId,
      evaluationRun.status === "passed"
        ? "evaluation.agent.run.completed"
        : "evaluation.agent.run.failed",
      {
        caseId,
        evaluationRunId: evaluationRun.id,
        status: evaluationRun.status,
        score: evaluationRun.score,
        stopReason: agentRun.stopReason,
      },
      agentRun.durationMs,
    );

    return {
      evaluationRun,
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

  private buildEvaluationTask(input: string, instruction: string | undefined): string {
    return [
      `Run this evaluation task as the enterprise agent.`,
      `Task input: ${input}`,
      instruction ? `Evaluator instruction: ${instruction}` : undefined,
      `Return only the final answer that should be scored by the evaluator.`,
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
