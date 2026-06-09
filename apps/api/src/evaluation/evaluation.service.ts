import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { EVALUATION_STORE } from "./evaluation.constants.js";
import type {
  CreateEvaluationCaseInput,
  EvaluationCase,
  EvaluationRun,
  EvaluationStore,
  RunEvaluationInput,
} from "./evaluation.types.js";

export type EvaluationStatus = {
  enabled: boolean;
  store: string;
  evaluators: string[];
  capabilities: string[];
};

@Injectable()
export class EvaluationService {
  constructor(
    @Inject(EVALUATION_STORE) private readonly store: EvaluationStore,
  ) {}

  createCase(input: CreateEvaluationCaseInput): Promise<EvaluationCase> {
    return this.store.createCase(input);
  }

  listCases(tenantId: string): Promise<EvaluationCase[]> {
    return this.store.listCases(tenantId);
  }

  listRuns(tenantId: string, caseId?: string): Promise<EvaluationRun[]> {
    return this.store.listRuns(tenantId, caseId);
  }

  async run(input: RunEvaluationInput): Promise<EvaluationRun> {
    const evaluationCase = await this.store.getCase(input.tenantId, input.caseId);
    if (!evaluationCase) {
      throw new NotFoundException("Evaluation case not found");
    }

    const normalizedActual = this.normalize(input.actualOutput);
    const normalizedExpected = this.normalize(evaluationCase.expectedOutput);
    const passed = normalizedActual.includes(normalizedExpected);
    const run: EvaluationRun = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      caseId: input.caseId,
      status: passed ? "passed" : "failed",
      score: passed ? 1 : 0,
      actualOutput: input.actualOutput,
      expectedOutput: evaluationCase.expectedOutput,
      evaluator: "string_contains",
      notes: passed
        ? ["Actual output contains expected output."]
        : ["Actual output does not contain expected output."],
      createdAt: new Date().toISOString(),
    };

    await this.store.saveRun(run);
    return run;
  }

  getStatus(): EvaluationStatus {
    return {
      enabled: true,
      store: "postgres",
      evaluators: ["string_contains"],
      capabilities: [
        "eval case management",
        "deterministic scoring",
        "run history",
        "tenant isolation",
      ],
    };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }
}
