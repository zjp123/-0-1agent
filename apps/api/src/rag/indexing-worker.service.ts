import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisIndexingQueue } from "./redis-indexing-queue.js";
import { RagService } from "./rag.service.js";

@Injectable()
export class IndexingWorkerService implements OnModuleInit, OnModuleDestroy {
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: RedisIndexingQueue,
    private readonly rag: RagService,
  ) {}

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
    const job = await this.rag.createReindexJob(input);
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
        await this.rag.runReindexJob(job);
      } catch {
        await this.sleep(1_000);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
