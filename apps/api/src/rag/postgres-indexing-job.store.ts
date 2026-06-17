import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lte, or, sql } from "drizzle-orm";

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
    @Inject(IdentityService)
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
        maxAttempts: input.maxAttempts,
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

  async findExpiredRunningJobs(now: Date): Promise<IndexingJob[]> {
    const rows = await this.db
      .select()
      .from(indexingJobs)
      .where(
        and(
          eq(indexingJobs.status, "running"),
          or(
            lte(indexingJobs.leaseUntil, now),
            sql`${indexingJobs.leaseUntil} is null`,
          ),
        ),
      )
      .orderBy(desc(indexingJobs.updatedAt));

    return rows.map((row) => this.toIndexingJob(row, this.externalTenantId(row)));
  }

  async acquireLease(input: {
    tenantId: string;
    jobId: string;
    workerId: string;
    leaseUntil: Date;
  }): Promise<IndexingJob | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(input.tenantId);
    const now = new Date();
    const [updated] = await this.db
      .update(indexingJobs)
      .set({
        workerId: input.workerId,
        leaseUntil: input.leaseUntil,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, input.jobId),
          or(
            eq(indexingJobs.status, "pending"),
            and(
              eq(indexingJobs.status, "failed"),
              sql`${indexingJobs.deadLetteredAt} is null`,
            ),
            and(
              eq(indexingJobs.status, "running"),
              or(
                lte(indexingJobs.leaseUntil, now),
                sql`${indexingJobs.leaseUntil} is null`,
              ),
            ),
          ),
        ),
      )
      .returning();

    return updated ? this.toIndexingJob(updated, input.tenantId) : undefined;
  }

  async releaseLease(tenantId: string, jobId: string): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      workerId: null,
      leaseUntil: null,
      updatedAt: new Date(),
    });
  }

  async markRunning(
    tenantId: string,
    jobId: string,
    totalChunks: number,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      status: "running" as const,
      totalChunks,
      error: null,
      completedAt: null,
      deadLetteredAt: null,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async incrementAttempts(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [updated] = await this.db
      .update(indexingJobs)
      .set({
        attempts: sql`${indexingJobs.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, jobId),
        ),
      )
      .returning();

    return updated ? this.toIndexingJob(updated, tenantId) : undefined;
  }

  async heartbeat(input: {
    tenantId: string;
    jobId: string;
    workerId: string;
    leaseUntil: Date;
  }): Promise<void> {
    const resolvedTenantId = await this.identity.ensureTenant(input.tenantId);
    await this.db
      .update(indexingJobs)
      .set({
        heartbeatAt: new Date(),
        leaseUntil: input.leaseUntil,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, input.jobId),
          eq(indexingJobs.workerId, input.workerId),
        ),
      );
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

  async markDeadLettered(
    tenantId: string,
    jobId: string,
    error: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.updateByTenantAndJob(tenantId, jobId, {
      status: "failed" as const,
      error,
      metadata,
      completedAt: new Date(),
      deadLetteredAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async replayDeadLetter(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [updated] = await this.db
      .update(indexingJobs)
      .set({
        status: "pending" as const,
        attempts: 0,
        processedChunks: 0,
        failedChunks: 0,
        error: null,
        workerId: null,
        leaseUntil: null,
        heartbeatAt: null,
        completedAt: null,
        cancelledAt: null,
        deadLetteredAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, jobId),
          eq(indexingJobs.status, "failed"),
          sql`${indexingJobs.deadLetteredAt} is not null`,
        ),
      )
      .returning();

    return updated ? this.toIndexingJob(updated, tenantId) : undefined;
  }

  async cancel(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [updated] = await this.db
      .update(indexingJobs)
      .set({
        status: "cancelled" as const,
        cancelledAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(indexingJobs.tenantId, resolvedTenantId),
          eq(indexingJobs.id, jobId),
        ),
      )
      .returning();

    return updated ? this.toIndexingJob(updated, tenantId) : undefined;
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
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      totalChunks: row.totalChunks,
      processedChunks: row.processedChunks,
      failedChunks: row.failedChunks,
      metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.workerId) {
      job.workerId = row.workerId;
    }
    if (row.leaseUntil) {
      job.leaseUntil = row.leaseUntil.toISOString();
    }
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
    if (row.heartbeatAt) {
      job.heartbeatAt = row.heartbeatAt.toISOString();
    }
    if (row.completedAt) {
      job.completedAt = row.completedAt.toISOString();
    }
    if (row.cancelledAt) {
      job.cancelledAt = row.cancelledAt.toISOString();
    }
    if (row.deadLetteredAt) {
      job.deadLetteredAt = row.deadLetteredAt.toISOString();
    }
    return job;
  }

  private externalTenantId(row: typeof indexingJobs.$inferSelect): string {
    const metadata = row.metadata;
    const tenantId = metadata.externalTenantId;
    return typeof tenantId === "string" ? tenantId : row.tenantId;
  }
}
