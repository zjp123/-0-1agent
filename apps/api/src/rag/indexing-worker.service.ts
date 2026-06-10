import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisIndexingQueue } from "./redis-indexing-queue.js";
import { RagService } from "./rag.service.js";

@Injectable()
export class IndexingWorkerService implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private readonly maxAttempts: number;
  private readonly heartbeatIntervalMs: number;

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
  }

  onModuleInit(): void {
    const enabled = this.config.get<boolean>("app.redis.workerEnabled", true);
    if (!enabled) {
      return;
    }
    void this.workLoop();
  }

  onModuleDestroy(): void {
    this.stopped = true;
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
      void this.rag.runReindexJob(job);
    }
    return job;
  }

  private async workLoop(): Promise<void> {
    while (!this.stopped && !this.queue.isClosed()) {
      try {
        const message = await this.queue.dequeue();
        if (!message) {
          continue;
        }

        const job = await this.rag.getIndexingJob(
          message.tenantId,
          message.jobId,
        );
        if (!job) {
          continue;
        }
        await this.processJob(job);
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

    const attempted = await this.rag.incrementIndexingJobAttempts(job);
    if (!attempted) {
      return;
    }
    if (attempted.status === "cancelled") {
      return;
    }

    const heartbeat = setInterval(() => {
      void this.rag.heartbeatIndexingJob(attempted);
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
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
