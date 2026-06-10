import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  RedisIndexingQueue,
  type IndexingQueueMessage,
} from "./redis-indexing-queue.js";
import { RagService } from "./rag.service.js";
import type {
  IndexingJob,
  IndexingWorkerStatus,
} from "./rag.types.js";

@Injectable()
export class IndexingWorkerService implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private readonly maxAttempts: number;
  private readonly heartbeatIntervalMs: number;
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly leaseMs: number;
  private readonly recoveryIntervalMs: number;
  private recoveryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: RedisIndexingQueue,
    private readonly rag: RagService,
  ) {
    this.maxAttempts = this.config.get<number>("app.redis.maxAttempts", 3);
    this.heartbeatIntervalMs = this.config.get<number>(
      "app.redis.heartbeatIntervalMs",
      10_000,
    );
    this.workerId = this.config.get<string>(
      "app.redis.workerId",
      crypto.randomUUID(),
    );
    this.concurrency = this.config.get<number>("app.redis.concurrency", 1);
    this.leaseMs = this.config.get<number>("app.redis.leaseMs", 60_000);
    this.recoveryIntervalMs = this.config.get<number>(
      "app.redis.recoveryIntervalMs",
      30_000,
    );
  }

  onModuleInit(): void {
    const enabled = this.config.get<boolean>("app.redis.workerEnabled", true);
    if (!enabled) {
      return;
    }
    void this.recoverExpiredJobs();
    this.recoveryTimer = setInterval(() => {
      void this.recoverExpiredJobs();
    }, this.recoveryIntervalMs);
    for (let index = 0; index < this.concurrency; index += 1) {
      void this.workLoop();
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
    }
  }

  async enqueueReindexJob(input: {
    tenantId: string;
    userId: string;
  }): Promise<Awaited<ReturnType<RagService["createReindexJob"]>>> {
    const job = await this.rag.createReindexJob({
      ...input,
      maxAttempts: this.maxAttempts,
    });
    try {
      await this.queue.enqueue({
        tenantId: job.tenantId,
        jobId: job.id,
      });
    } catch {
      void this.processJob(job);
    }
    this.rag.recordIndexingAdminAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "enqueue_reindex",
      jobId: job.id,
      result: "accepted",
    });
    return job;
  }

  async replayDeadLetterJob(input: {
    tenantId: string;
    userId: string;
    jobId: string;
  }): Promise<Awaited<ReturnType<RagService["replayDeadLetterIndexingJob"]>>> {
    const job = await this.rag.replayDeadLetterIndexingJob(
      input.tenantId,
      input.jobId,
    );
    if (!job) {
      return undefined;
    }
    await this.queue.enqueue({
      tenantId: job.tenantId,
      jobId: job.id,
    });
    this.rag.recordIndexingAdminAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "replay_dead_letter",
      jobId: job.id,
      result: "accepted",
    });
    return job;
  }

  async getStatus(): Promise<IndexingWorkerStatus> {
    const baseStatus = {
      workerId: this.workerId,
      enabled: this.config.get<boolean>("app.redis.workerEnabled", true),
      stopped: this.stopped,
      concurrency: this.concurrency,
      queueName: this.queue.getQueueName(),
      deadLetterQueueName: this.queue.getDeadLetterQueueName(),
      consumerGroup: this.queue.getConsumerGroup(),
      leaseMs: this.leaseMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      recoveryIntervalMs: this.recoveryIntervalMs,
    };

    try {
      const depth = await this.queue.depth();
      return {
        ...baseStatus,
        queueAvailable: true,
        queueDepth: {
          pending: depth.pending,
          deadLetter: depth.deadLetter,
        },
      };
    } catch (error) {
      const status: IndexingWorkerStatus = {
        ...baseStatus,
        queueAvailable: false,
        queueDepth: {
          pending: 0,
          deadLetter: 0,
        },
      };
      if (error instanceof Error) {
        status.queueError = error.message;
      }
      return status;
    }
  }

  async listDeadLetters(limit: number): Promise<IndexingQueueMessage[]> {
    try {
      return await this.queue.listDeadLetters(limit);
    } catch {
      return [];
    }
  }

  listStuckJobs(): Promise<IndexingJob[]> {
    return this.rag.findExpiredIndexingJobs(new Date());
  }

  recordCancel(input: {
    tenantId: string;
    userId: string;
    jobId: string;
    result: string;
  }): void {
    this.rag.recordIndexingAdminAction({
      ...input,
      action: "cancel",
    });
  }

  private async workLoop(): Promise<void> {
    while (!this.stopped && !this.queue.isClosed()) {
      try {
        const message = await this.queue.dequeue(this.workerId);
        if (!message) {
          continue;
        }

        const job = await this.rag.getIndexingJob(
          message.tenantId,
          message.jobId,
        );
        if (!job) {
          await this.queue.ack(message);
          continue;
        }
        await this.processJob(job);
        await this.queue.ack(message);
      } catch {
        await this.sleep(1_000);
      }
    }
  }

  private async processJob(
    job: Awaited<ReturnType<RagService["getIndexingJob"]>> & {},
  ): Promise<void> {
    if (!job || job.status === "cancelled" || job.status === "completed") {
      return;
    }

    const leased = await this.rag.acquireIndexingJobLease({
      tenantId: job.tenantId,
      jobId: job.id,
      workerId: this.workerId,
      leaseUntil: this.nextLeaseUntil(),
    });
    if (!leased) {
      return;
    }

    const attempted = await this.rag.incrementIndexingJobAttempts(leased);
    if (!attempted) {
      return;
    }
    if (attempted.status === "cancelled") {
      return;
    }

    const heartbeat = setInterval(() => {
      void this.rag.heartbeatIndexingJob({
        job: attempted,
        workerId: this.workerId,
        leaseUntil: this.nextLeaseUntil(),
      });
    }, this.heartbeatIntervalMs);

    try {
      const result = await this.rag.runReindexJob(attempted);
      if (result.status !== "failed") {
        return;
      }

      if (attempted.attempts < attempted.maxAttempts) {
        await this.queue.enqueue({
          tenantId: attempted.tenantId,
          jobId: attempted.id,
        });
        return;
      }

      await this.rag.deadLetterIndexingJob(
        attempted,
        result.error ?? "Indexing job failed",
      );
      try {
        await this.queue.deadLetter({
          tenantId: attempted.tenantId,
          jobId: attempted.id,
        });
      } catch {
        // The PostgreSQL job record is the source of truth; DLQ write is best effort.
      }
    } finally {
      clearInterval(heartbeat);
      await this.rag.releaseIndexingJobLease(attempted);
    }
  }

  private async recoverExpiredJobs(): Promise<void> {
    if (this.stopped) {
      return;
    }

    try {
      const expiredJobs = await this.rag.findExpiredIndexingJobs(new Date());
      for (const job of expiredJobs) {
        if (this.stopped) {
          return;
        }
        await this.queue.enqueue({
          tenantId: job.tenantId,
          jobId: job.id,
        });
      }
    } catch {
      // Recovery is best effort; the next interval will retry.
    }
  }

  private nextLeaseUntil(): Date {
    return new Date(Date.now() + this.leaseMs);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
