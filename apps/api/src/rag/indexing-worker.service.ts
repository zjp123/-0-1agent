import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  RedisIndexingQueue,
  type IndexingQueueMessage,
} from "./redis-indexing-queue.js";
import { RagService } from "./rag.service.js";
import type {
  DeadLetterBatchResult,
  IndexingJob,
  IndexingWorkerAlerts,
  IndexingWorkerAlert,
  IndexingWorkerMetrics,
  IndexingWorkerStatus,
} from "./rag.types.js";

type IndexingWorkerCounters = IndexingWorkerMetrics["counters"];

@Injectable()
export class IndexingWorkerService implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private readonly maxAttempts: number;
  private readonly heartbeatIntervalMs: number;
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly leaseMs: number;
  private readonly recoveryIntervalMs: number;
  private readonly retryDelayBaseMs: number;
  private readonly retryDelayMaxMs: number;
  private readonly retryPromotionBatchSize: number;
  private readonly pendingClaimMinIdleMs: number;
  private readonly pendingClaimBatchSize: number;
  private readonly alertPendingThreshold: number;
  private readonly alertDelayedThreshold: number;
  private readonly alertDeadLetterThreshold: number;
  private readonly alertQueueErrorsThreshold: number;
  private readonly alertRecoveryFailuresThreshold: number;
  private readonly alertStaleRecoveryMs: number;
  private readonly deadLetterAdminBatchSize: number;
  private recoveryTimer: ReturnType<typeof setInterval> | undefined;
  private recoveryRunning = false;
  private readonly startedAt = Date.now();
  private lastRecoveryAt: string | undefined;
  private lastRecoveryError: string | undefined;
  private readonly counters: IndexingWorkerCounters = {
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
    jobsDeadLettered: 0,
    jobsRetried: 0,
    messagesDequeued: 0,
    messagesAcked: 0,
    delayedPromoted: 0,
    pendingClaimed: 0,
    expiredJobsRequeued: 0,
    recoveryRuns: 0,
    recoveryFailures: 0,
    queueErrors: 0,
  };

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
    this.retryDelayBaseMs = this.config.get<number>(
      "app.redis.retryDelayBaseMs",
      5_000,
    );
    this.retryDelayMaxMs = this.config.get<number>(
      "app.redis.retryDelayMaxMs",
      60_000,
    );
    this.retryPromotionBatchSize = this.config.get<number>(
      "app.redis.retryPromotionBatchSize",
      50,
    );
    this.pendingClaimMinIdleMs = this.config.get<number>(
      "app.redis.pendingClaimMinIdleMs",
      60_000,
    );
    this.pendingClaimBatchSize = this.config.get<number>(
      "app.redis.pendingClaimBatchSize",
      10,
    );
    this.alertPendingThreshold = this.config.get<number>(
      "app.redis.alertPendingThreshold",
      100,
    );
    this.alertDelayedThreshold = this.config.get<number>(
      "app.redis.alertDelayedThreshold",
      100,
    );
    this.alertDeadLetterThreshold = this.config.get<number>(
      "app.redis.alertDeadLetterThreshold",
      1,
    );
    this.alertQueueErrorsThreshold = this.config.get<number>(
      "app.redis.alertQueueErrorsThreshold",
      10,
    );
    this.alertRecoveryFailuresThreshold = this.config.get<number>(
      "app.redis.alertRecoveryFailuresThreshold",
      1,
    );
    this.alertStaleRecoveryMs = this.config.get<number>(
      "app.redis.alertStaleRecoveryMs",
      120_000,
    );
    this.deadLetterAdminBatchSize = this.config.get<number>(
      "app.redis.deadLetterAdminBatchSize",
      100,
    );
  }

  onModuleInit(): void {
    const enabled = this.config.get<boolean>("app.redis.workerEnabled", true);
    if (!enabled) {
      return;
    }
    void this.recoverQueueState();
    this.recoveryTimer = setInterval(() => {
      void this.recoverQueueState();
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
    await this.removeDeadLetterMessagesForJob(job.tenantId, job.id);
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
      retryQueueName: this.queue.getRetryQueueName(),
      deadLetterQueueName: this.queue.getDeadLetterQueueName(),
      consumerGroup: this.queue.getConsumerGroup(),
      leaseMs: this.leaseMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      recoveryIntervalMs: this.recoveryIntervalMs,
      retryDelayBaseMs: this.retryDelayBaseMs,
      retryDelayMaxMs: this.retryDelayMaxMs,
      pendingClaimMinIdleMs: this.pendingClaimMinIdleMs,
    };

    try {
      const depth = await this.queue.depth();
      return {
        ...baseStatus,
        queueAvailable: true,
        queueDepth: {
          pending: depth.pending,
          consumerPending: depth.consumerPending,
          delayed: depth.delayed,
          deadLetter: depth.deadLetter,
        },
      };
    } catch (error) {
      const status: IndexingWorkerStatus = {
        ...baseStatus,
        queueAvailable: false,
        queueDepth: {
          pending: 0,
          consumerPending: 0,
          delayed: 0,
          deadLetter: 0,
        },
      };
      if (error instanceof Error) {
        status.queueError = error.message;
      }
      return status;
    }
  }

  async getMetrics(): Promise<IndexingWorkerMetrics> {
    const status = await this.getStatus();
    const metrics: IndexingWorkerMetrics = {
      ...status,
      uptimeMs: Date.now() - this.startedAt,
      recoveryRunning: this.recoveryRunning,
      counters: { ...this.counters },
    };
    if (this.lastRecoveryAt) {
      metrics.lastRecoveryAt = this.lastRecoveryAt;
    }
    if (this.lastRecoveryError) {
      metrics.lastRecoveryError = this.lastRecoveryError;
    }
    return metrics;
  }

  async getAlerts(): Promise<IndexingWorkerAlerts> {
    const metrics = await this.getMetrics();
    const alerts: IndexingWorkerAlert[] = [];

    if (!metrics.enabled) {
      alerts.push({
        code: "indexing_worker_disabled",
        severity: "warning",
        message: "Indexing worker is disabled.",
        value: false,
      });
    }
    if (metrics.stopped) {
      alerts.push({
        code: "indexing_worker_stopped",
        severity: "critical",
        message: "Indexing worker has stopped.",
        value: true,
      });
    }
    if (!metrics.queueAvailable) {
      alerts.push({
        code: "indexing_queue_unavailable",
        severity: "critical",
        message: "Indexing queue is unavailable.",
        value: metrics.queueError ?? "unavailable",
      });
    }
    this.addThresholdAlert(alerts, {
      code: "indexing_pending_high",
      message: "Redis stream depth is above threshold.",
      value: metrics.queueDepth.pending,
      threshold: this.alertPendingThreshold,
      severity: "warning",
    });
    this.addThresholdAlert(alerts, {
      code: "indexing_delayed_high",
      message: "Delayed retry queue depth is above threshold.",
      value: metrics.queueDepth.delayed,
      threshold: this.alertDelayedThreshold,
      severity: "warning",
    });
    this.addThresholdAlert(alerts, {
      code: "indexing_dead_letter_present",
      message: "Dead-letter queue has messages.",
      value: metrics.queueDepth.deadLetter,
      threshold: this.alertDeadLetterThreshold,
      severity: "critical",
    });
    this.addThresholdAlert(alerts, {
      code: "indexing_queue_errors_high",
      message: "Worker queue error counter is above threshold.",
      value: metrics.counters.queueErrors,
      threshold: this.alertQueueErrorsThreshold,
      severity: "warning",
    });
    this.addThresholdAlert(alerts, {
      code: "indexing_recovery_failures_high",
      message: "Recovery failure counter is above threshold.",
      value: metrics.counters.recoveryFailures,
      threshold: this.alertRecoveryFailuresThreshold,
      severity: "critical",
    });

    const lastRecoveryAgeMs = this.lastRecoveryAgeMs(metrics);
    if (
      metrics.enabled &&
      !metrics.stopped &&
      ((lastRecoveryAgeMs === undefined &&
        metrics.uptimeMs > this.alertStaleRecoveryMs) ||
        (lastRecoveryAgeMs !== undefined &&
          lastRecoveryAgeMs > this.alertStaleRecoveryMs))
    ) {
      alerts.push({
        code: "indexing_recovery_stale",
        severity: "warning",
        message: "Last recovery loop is older than threshold.",
        value: lastRecoveryAgeMs ?? "never",
        threshold: this.alertStaleRecoveryMs,
      });
    }

    const hasCritical = alerts.some((alert) => alert.severity === "critical");
    return {
      status: hasCritical ? "critical" : alerts.length > 0 ? "warning" : "ok",
      checkedAt: new Date().toISOString(),
      thresholds: {
        pending: this.alertPendingThreshold,
        delayed: this.alertDelayedThreshold,
        deadLetter: this.alertDeadLetterThreshold,
        queueErrors: this.alertQueueErrorsThreshold,
        recoveryFailures: this.alertRecoveryFailuresThreshold,
        staleRecoveryMs: this.alertStaleRecoveryMs,
      },
      alerts,
      metrics,
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const alerts = await this.getAlerts();
    const metrics = alerts.metrics;
    const labels = {
      worker_id: metrics.workerId,
      queue: metrics.queueName,
      consumer_group: metrics.consumerGroup,
    };
    const lines: string[] = [];

    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_worker_up",
      "gauge",
      "Worker process is enabled and not stopped.",
    );
    this.addMetric(
      lines,
      "enterprise_agent_indexing_worker_up",
      metrics.enabled && !metrics.stopped ? 1 : 0,
      labels,
    );
    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_queue_available",
      "gauge",
      "Redis indexing queue availability.",
    );
    this.addMetric(
      lines,
      "enterprise_agent_indexing_queue_available",
      metrics.queueAvailable ? 1 : 0,
      labels,
    );
    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_recovery_running",
      "gauge",
      "Whether the recovery loop is currently running.",
    );
    this.addMetric(
      lines,
      "enterprise_agent_indexing_recovery_running",
      metrics.recoveryRunning ? 1 : 0,
      labels,
    );
    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_worker_uptime_ms",
      "gauge",
      "Worker process uptime in milliseconds.",
    );
    this.addMetric(
      lines,
      "enterprise_agent_indexing_worker_uptime_ms",
      metrics.uptimeMs,
      labels,
    );

    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_queue_depth",
      "gauge",
      "Indexing queue depth by queue kind.",
    );
    this.addMetric(lines, "enterprise_agent_indexing_queue_depth", metrics.queueDepth.pending, {
      ...labels,
      kind: "stream",
    });
    this.addMetric(lines, "enterprise_agent_indexing_queue_depth", metrics.queueDepth.consumerPending, {
      ...labels,
      kind: "consumer_pending",
    });
    this.addMetric(lines, "enterprise_agent_indexing_queue_depth", metrics.queueDepth.delayed, {
      ...labels,
      kind: "delayed",
    });
    this.addMetric(lines, "enterprise_agent_indexing_queue_depth", metrics.queueDepth.deadLetter, {
      ...labels,
      kind: "dead_letter",
    });

    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_worker_counter_total",
      "counter",
      "Indexing worker process-level counters.",
    );
    for (const [counter, value] of Object.entries(metrics.counters)) {
      this.addMetric(lines, "enterprise_agent_indexing_worker_counter_total", value, {
        ...labels,
        counter,
      });
    }

    this.addMetricHeader(
      lines,
      "enterprise_agent_indexing_alerts",
      "gauge",
      "Current indexing alert count by severity.",
    );
    this.addMetric(lines, "enterprise_agent_indexing_alerts", alerts.alerts.filter((alert) => alert.severity === "warning").length, {
      ...labels,
      severity: "warning",
    });
    this.addMetric(lines, "enterprise_agent_indexing_alerts", alerts.alerts.filter((alert) => alert.severity === "critical").length, {
      ...labels,
      severity: "critical",
    });

    return `${lines.join("\n")}\n`;
  }

  async replayTenantDeadLetters(input: {
    tenantId: string;
    userId: string;
  }): Promise<DeadLetterBatchResult> {
    const messages = await this.listDeadLetters(this.deadLetterAdminBatchSize);
    const result = this.emptyDeadLetterBatchResult(input.tenantId, messages.length);
    for (const message of messages) {
      if (message.tenantId !== input.tenantId) {
        result.skipped += 1;
        continue;
      }
      result.matched += 1;
      const job = await this.rag.replayDeadLetterIndexingJob(
        input.tenantId,
        message.jobId,
      );
      if (!job) {
        result.skipped += 1;
        continue;
      }
      await this.queue.enqueue({
        tenantId: job.tenantId,
        jobId: job.id,
      });
      await this.queue.removeDeadLetter(message);
      result.processed += 1;
      result.jobIds.push(job.id);
    }
    this.rag.recordIndexingAdminAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "replay_dead_letter_all",
      result: `processed:${result.processed}`,
    });
    return result;
  }

  async purgeTenantDeadLetters(input: {
    tenantId: string;
    userId: string;
  }): Promise<DeadLetterBatchResult> {
    const messages = await this.listDeadLetters(this.deadLetterAdminBatchSize);
    const result = this.emptyDeadLetterBatchResult(input.tenantId, messages.length);
    for (const message of messages) {
      if (message.tenantId !== input.tenantId) {
        result.skipped += 1;
        continue;
      }
      result.matched += 1;
      await this.queue.removeDeadLetter(message);
      result.processed += 1;
      result.jobIds.push(message.jobId);
    }
    this.rag.recordIndexingAdminAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "purge_dead_letter",
      result: `processed:${result.processed}`,
    });
    return result;
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
        this.counters.messagesDequeued += 1;

        const job = await this.rag.getIndexingJob(
          message.tenantId,
          message.jobId,
        );
        if (!job) {
          await this.queue.ack(message);
          this.counters.messagesAcked += 1;
          continue;
        }
        await this.processJob(job);
        await this.queue.ack(message);
        this.counters.messagesAcked += 1;
      } catch {
        this.counters.queueErrors += 1;
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
    this.counters.jobsStarted += 1;

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
        if (result.status === "completed") {
          this.counters.jobsCompleted += 1;
        } else {
          this.counters.jobsSkipped += 1;
        }
        return;
      }
      this.counters.jobsFailed += 1;

      if (attempted.attempts < attempted.maxAttempts) {
        await this.queue.enqueueDelayed(
          {
            tenantId: attempted.tenantId,
            jobId: attempted.id,
          },
          this.retryDelayForAttempt(attempted.attempts),
        );
        this.counters.jobsRetried += 1;
        return;
      }

      await this.rag.deadLetterIndexingJob(
        attempted,
        result.error ?? "Indexing job failed",
      );
      this.counters.jobsDeadLettered += 1;
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

  private async recoverQueueState(): Promise<void> {
    if (this.stopped || this.recoveryRunning) {
      return;
    }

    this.recoveryRunning = true;
    this.counters.recoveryRuns += 1;
    let promotedDelayed = 0;
    let claimedPending = 0;
    let requeuedExpired = 0;
    try {
      promotedDelayed = await this.queue.promoteDueDelayed(
        this.retryPromotionBatchSize,
      );
      this.counters.delayedPromoted += promotedDelayed;
      claimedPending = await this.recoverPendingMessages();
      this.counters.pendingClaimed += claimedPending;
      requeuedExpired = await this.recoverExpiredJobs();
      this.counters.expiredJobsRequeued += requeuedExpired;
      this.lastRecoveryError = undefined;
      this.recordRecoveryTrace({
        promotedDelayed,
        claimedPending,
        requeuedExpired,
        result: "completed",
      });
    } catch (error) {
      this.counters.recoveryFailures += 1;
      this.counters.queueErrors += 1;
      this.lastRecoveryError =
        error instanceof Error ? error.message : "Unknown recovery error";
      this.recordRecoveryTrace({
        promotedDelayed,
        claimedPending,
        requeuedExpired,
        result: "failed",
        error: this.lastRecoveryError,
      });
    } finally {
      this.lastRecoveryAt = new Date().toISOString();
      this.recoveryRunning = false;
    }
  }

  private async recoverPendingMessages(): Promise<number> {
    const messages = await this.queue.claimPending(
      this.workerId,
      this.pendingClaimMinIdleMs,
      this.pendingClaimBatchSize,
    );
    for (const message of messages) {
      if (this.stopped) {
        return messages.length;
      }
      const job = await this.rag.getIndexingJob(message.tenantId, message.jobId);
      if (job) {
        await this.processJob(job);
      }
      await this.queue.ack(message);
      this.counters.messagesAcked += 1;
    }
    return messages.length;
  }

  private async recoverExpiredJobs(): Promise<number> {
    if (this.stopped) {
      return 0;
    }

    let requeued = 0;
    try {
      const expiredJobs = await this.rag.findExpiredIndexingJobs(new Date());
      for (const job of expiredJobs) {
        if (this.stopped) {
          return requeued;
        }
        await this.queue.enqueue({
          tenantId: job.tenantId,
          jobId: job.id,
        });
        requeued += 1;
      }
    } catch {
      // Recovery is best effort; the next interval will retry.
    }
    return requeued;
  }

  private recordRecoveryTrace(input: {
    promotedDelayed: number;
    claimedPending: number;
    requeuedExpired: number;
    result: "completed" | "failed";
    error?: string;
  }): void {
    const recovery = {
      workerId: this.workerId,
      promotedDelayed: input.promotedDelayed,
      claimedPending: input.claimedPending,
      requeuedExpired: input.requeuedExpired,
      result: input.result,
    };
    if (input.error) {
      this.rag.recordIndexingRecoveryAction({
        ...recovery,
        error: input.error,
      });
      return;
    }
    this.rag.recordIndexingRecoveryAction(recovery);
  }

  private addThresholdAlert(
    alerts: IndexingWorkerAlert[],
    input: {
      code: string;
      message: string;
      value: number;
      threshold: number;
      severity: "warning" | "critical";
    },
  ): void {
    if (input.value < input.threshold) {
      return;
    }
    alerts.push({
      code: input.code,
      severity: input.severity,
      message: input.message,
      value: input.value,
      threshold: input.threshold,
    });
  }

  private addMetricHeader(
    lines: string[],
    name: string,
    type: "counter" | "gauge",
    help: string,
  ): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
  }

  private addMetric(
    lines: string[],
    name: string,
    value: number,
    labels: Record<string, string>,
  ): void {
    const serializedLabels = Object.entries(labels)
      .map(([key, labelValue]) => `${key}="${this.escapeMetricLabel(labelValue)}"`)
      .join(",");
    lines.push(`${name}{${serializedLabels}} ${value}`);
  }

  private escapeMetricLabel(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
  }

  private lastRecoveryAgeMs(
    metrics: Pick<IndexingWorkerMetrics, "lastRecoveryAt">,
  ): number | undefined {
    if (!metrics.lastRecoveryAt) {
      return undefined;
    }
    const timestamp = Date.parse(metrics.lastRecoveryAt);
    return Number.isFinite(timestamp) ? Date.now() - timestamp : undefined;
  }

  private emptyDeadLetterBatchResult(
    tenantId: string,
    scanned: number,
  ): DeadLetterBatchResult {
    return {
      tenantId,
      scanned,
      matched: 0,
      processed: 0,
      skipped: 0,
      jobIds: [],
    };
  }

  private async removeDeadLetterMessagesForJob(
    tenantId: string,
    jobId: string,
  ): Promise<void> {
    const messages = await this.listDeadLetters(this.deadLetterAdminBatchSize);
    for (const message of messages) {
      if (message.tenantId === tenantId && message.jobId === jobId) {
        await this.queue.removeDeadLetter(message);
      }
    }
  }

  private retryDelayForAttempt(attempt: number): number {
    const multiplier = 2 ** Math.max(attempt - 1, 0);
    return Math.min(this.retryDelayBaseMs * multiplier, this.retryDelayMaxMs);
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
