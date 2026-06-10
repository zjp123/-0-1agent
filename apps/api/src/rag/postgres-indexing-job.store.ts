import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { indexingJobs } from "../db/schema.js";
import type {
  CreateIndexingJobInput,
  IndexingJob,
  IndexingJobStatus,
  IndexingJobStore,
  IndexingJobType,
} from "./rag.types.js";

@Injectable()
export class PostgresIndexingJobStore implements IndexingJobStore {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async create(input: CreateIndexingJobInput): Promise<IndexingJob> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });

    const [created] = await this.db
      .insert(indexingJobs)
      .values({
        tenantId: identity.tenantId,
        createdBy: identity.userId,
        type: input.type,
        status: "pending",
        metadata: {
          ...input.metadata,
          externalTenantId: input.tenantId,
          externalUserId: input.userId,
        },
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create indexing job");
    }
    return this.toIndexingJob(created, input.tenantId);
  }

  async get(tenantId: string, jobId: string): Promise<IndexingJob | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [row] = await this.db
      .select()
      .from(indexingJobs)
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, jobId),
        ),
      )
      .limit(1);

    return row ? this.toIndexingJob(row, tenantId) : undefined;
  }

  async list(tenantId: string): Promise<IndexingJob[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select()
      .from(indexingJobs)
      .where(eq(indexingJobs.tenantId, resolvedTenantId))
      .orderBy(desc(indexingJobs.createdAt));

    return rows.map((row) => this.toIndexingJob(row, tenantId));
  }

  async markRunning(
    tenantId: string,
    jobId: string,
    totalChunks: number,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      status: "running" as const,
      totalChunks,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markCompleted(
    tenantId: string,
    jobId: string,
    processedChunks: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      status: "completed" as const,
      processedChunks,
      failedChunks: 0,
      metadata,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markProgress(
    tenantId: string,
    jobId: string,
    processedChunks: number,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      processedChunks,
      updatedAt: new Date(),
    });
  }

  async markFailed(
    tenantId: string,
    jobId: string,
    processedChunks: number,
    failedChunks: number,
    error: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      status: "failed" as const,
      processedChunks,
      failedChunks,
      error,
      metadata,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private async updateByTenantAndJob(
    tenantId: string,
    jobId: string,
    values: Partial<typeof indexingJobs.$inferInsert>,
  ): Promise<void> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    await this.db
      .update(indexingJobs)
      .set(values)
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, jobId),
        ),
      );
  }

  private toIndexingJob(
    row: typeof indexingJobs.$inferSelect,
    externalTenantId: string,
  ): IndexingJob {
    const metadata = row.metadata;
    const job: IndexingJob = {
      id: row.id,
      tenantId: externalTenantId,
      type: row.type as IndexingJobType,
      status: row.status as IndexingJobStatus,
      totalChunks: row.totalChunks,
      processedChunks: row.processedChunks,
      failedChunks: row.failedChunks,
      metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    const createdBy = metadata.externalUserId;
    if (typeof createdBy === "string") {
      job.createdBy = createdBy;
    } else if (row.createdBy) {
      job.createdBy = row.createdBy;
    }
    if (row.error) {
      job.error = row.error;
    }
    if (row.startedAt) {
      job.startedAt = row.startedAt.toISOString();
    }
    if (row.completedAt) {
      job.completedAt = row.completedAt.toISOString();
    }
    return job;
  }
}
