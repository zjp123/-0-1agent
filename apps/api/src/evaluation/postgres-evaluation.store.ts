import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, and } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { evaluationCases, evaluationRuns } from "../db/schema.js";
import type {
  CreateEvaluationCaseInput,
  EvaluationCase,
  EvaluationCaseType,
  EvaluationRun,
  EvaluationRunStatus,
  EvaluationStore,
} from "./evaluation.types.js";

@Injectable()
export class PostgresEvaluationStore implements EvaluationStore {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async createCase(input: CreateEvaluationCaseInput): Promise<EvaluationCase> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });

    const [created] = await this.db
      .insert(evaluationCases)
      .values({
        tenantId: identity.tenantId,
        createdBy: identity.userId,
        name: input.name,
        type: input.type,
        input: input.input,
        expectedOutput: input.expectedOutput,
        tags: input.tags ?? [],
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create evaluation case");
    }

    return this.toEvaluationCase(created);
  }

  async listCases(tenantId: string): Promise<EvaluationCase[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select()
      .from(evaluationCases)
      .where(eq(evaluationCases.tenantId, resolvedTenantId))
      .orderBy(desc(evaluationCases.createdAt));

    return rows.map((row) => this.toEvaluationCase(row));
  }

  async getCase(
    tenantId: string,
    caseId: string,
  ): Promise<EvaluationCase | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [row] = await this.db
      .select()
      .from(evaluationCases)
      .where(
        and(
          eq(evaluationCases.tenantId, resolvedTenantId),
          eq(evaluationCases.id, caseId),
        ),
      )
      .limit(1);

    return row ? this.toEvaluationCase(row) : undefined;
  }

  async saveRun(run: EvaluationRun): Promise<void> {
    const resolvedTenantId = await this.identity.ensureTenant(run.tenantId);
    await this.db.insert(evaluationRuns).values({
      id: run.id,
      tenantId: resolvedTenantId,
      caseId: run.caseId,
      status: run.status,
      score: run.score,
      actualOutput: run.actualOutput,
      expectedOutput: run.expectedOutput,
      evaluator: run.evaluator,
      notes: run.notes,
      createdAt: new Date(run.createdAt),
    });
  }

  async listRuns(tenantId: string, caseId?: string): Promise<EvaluationRun[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const whereClause = caseId
      ? and(
          eq(evaluationRuns.tenantId, resolvedTenantId),
          eq(evaluationRuns.caseId, caseId),
        )
      : eq(evaluationRuns.tenantId, resolvedTenantId);

    const rows = await this.db
      .select()
      .from(evaluationRuns)
      .where(whereClause)
      .orderBy(desc(evaluationRuns.createdAt));

    return rows.map((row) => this.toEvaluationRun(row, tenantId));
  }

  private toEvaluationCase(row: typeof evaluationCases.$inferSelect): EvaluationCase {
    return {
      id: row.id,
      tenantId: row.tenantId,
      createdBy: row.createdBy ?? "",
      name: row.name,
      type: row.type as EvaluationCaseType,
      input: row.input,
      expectedOutput: row.expectedOutput,
      tags: row.tags,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toEvaluationRun(
    row: typeof evaluationRuns.$inferSelect,
    externalTenantId: string,
  ): EvaluationRun {
    return {
      id: row.id,
      tenantId: externalTenantId,
      caseId: row.caseId,
      status: row.status as EvaluationRunStatus,
      score: row.score,
      actualOutput: row.actualOutput,
      expectedOutput: row.expectedOutput,
      evaluator: "string_contains",
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
