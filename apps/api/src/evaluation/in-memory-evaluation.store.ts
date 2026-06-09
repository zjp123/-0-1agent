import { Injectable } from "@nestjs/common";

import type {
  CreateEvaluationCaseInput,
  EvaluationCase,
  EvaluationRun,
  EvaluationStore,
} from "./evaluation.types.js";

@Injectable()
export class InMemoryEvaluationStore implements EvaluationStore {
  private readonly cases = new Map<string, EvaluationCase>();
  private readonly runs = new Map<string, EvaluationRun[]>();

  async createCase(input: CreateEvaluationCaseInput): Promise<EvaluationCase> {
    const now = new Date().toISOString();
    const evaluationCase: EvaluationCase = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      createdBy: input.userId,
      name: input.name,
      type: input.type,
      input: input.input,
      expectedOutput: input.expectedOutput,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(this.key(input.tenantId, evaluationCase.id), evaluationCase);
    return evaluationCase;
  }

  async listCases(tenantId: string): Promise<EvaluationCase[]> {
    return [...this.cases.values()]
      .filter((evaluationCase) => evaluationCase.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getCase(
    tenantId: string,
    caseId: string,
  ): Promise<EvaluationCase | undefined> {
    return this.cases.get(this.key(tenantId, caseId));
  }

  async saveRun(run: EvaluationRun): Promise<void> {
    const key = this.key(run.tenantId, run.caseId);
    const runs = this.runs.get(key) ?? [];
    runs.push(run);
    this.runs.set(key, runs);
  }

  async listRuns(tenantId: string, caseId?: string): Promise<EvaluationRun[]> {
    if (caseId) {
      return [...(this.runs.get(this.key(tenantId, caseId)) ?? [])].reverse();
    }

    return [...this.runs.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .flatMap(([, runs]) => runs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
