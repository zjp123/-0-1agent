import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { RequestUser } from "../auth/auth.types.js";
import { EvaluationService } from "../evaluation/evaluation.service.js";
import type { EvaluationCase, EvaluationRun } from "../evaluation/evaluation.types.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { AgentRuntimeService } from "./agent-runtime.service.js";
import type { AgentRunResult } from "./agent-runtime.types.js";
import type { RunAgentEvaluationBatchDto } from "./dto/run-agent-evaluation-batch.dto.js";
import type { RunAgentEvaluationDto } from "./dto/run-agent-evaluation.dto.js";

export type AgentEvaluationRunResult = {
  evaluationRun: EvaluationRun;
  agentRun: Pick<
    AgentRunResult,
    "requestId" | "answer" | "stopReason" | "durationMs" | "usage" | "plan"
  >;
};

export type AgentEvaluationBatchRunResult = {
  results: AgentEvaluationRunResult[];
  total: number;
  passed: number;
  failed: number;
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

    return this.runEvaluationCase(evaluationCase, body, user);
  }

  async runBatchWithAgent(
    body: RunAgentEvaluationBatchDto,
    user: RequestUser,
  ): Promise<AgentEvaluationBatchRunResult> {
    const allCases = await this.evaluation.listCases(user.tenantId);
    const selectedCases = body.caseIds
      ? allCases.filter((evaluationCase) => body.caseIds?.includes(evaluationCase.id))
      : allCases;
    const limitedCases = selectedCases.slice(0, body.maxCases ?? 25);
    const results: AgentEvaluationRunResult[] = [];

    for (const evaluationCase of limitedCases) {
      const runBody: RunAgentEvaluationDto = {};
      if (body.instruction !== undefined) {
        runBody.instruction = body.instruction;
      }
      if (body.maxSteps !== undefined) {
        runBody.maxSteps = body.maxSteps;
      }
      if (body.maxDurationMs !== undefined) {
        runBody.maxDurationMs = body.maxDurationMs;
      }
      results.push(
        await this.runEvaluationCase(
          evaluationCase,
          runBody,
          user,
        ),
      );
    }

    const passed = results.filter((result) => result.evaluationRun.status === "passed").length;
    return {
      results,
      total: results.length,
      passed,
      failed: results.length - passed,
    };
  }

  private async runEvaluationCase(
    evaluationCase: EvaluationCase,
    body: RunAgentEvaluationDto,
    user: RequestUser,
  ): Promise<AgentEvaluationRunResult> {
    const requestId = crypto.randomUUID();
    this.recordTrace(user, requestId, "evaluation.agent.run.started", {
      caseId: evaluationCase.id,
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
      caseId: evaluationCase.id,
      actualOutput: agentRun.answer,
      notes: [
        `agentRequestId=${agentRun.requestId}`,
        `agentStopReason=${agentRun.stopReason}`,
        `agentDurationMs=${agentRun.durationMs}`,
        `agentTotalTokens=${agentRun.usage.totalTokens}`,
        `caseInputPreview=${this.truncate(evaluationCase.input, 160)}`,
        `expectedPreview=${this.truncate(evaluationCase.expectedOutput, 160)}`,
        `actualPreview=${this.truncate(agentRun.answer, 160)}`,
      ],
    });

    this.recordTrace(
      user,
      requestId,
      evaluationRun.status === "passed"
        ? "evaluation.agent.run.completed"
        : "evaluation.agent.run.failed",
      {
        caseId: evaluationCase.id,
        evaluationRunId: evaluationRun.id,
        status: evaluationRun.status,
        score: evaluationRun.score,
        stopReason: agentRun.stopReason,
        failureReason:
          evaluationRun.status === "failed"
            ? "actual output does not contain expected output"
            : null,
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

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
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
