import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, lte, or, isNull } from "drizzle-orm";

import type { RequestUser } from "../auth/auth.types.js";
import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { tenants, workflowScheduleRuns, workflowSchedules } from "../db/schema.js";
import { ObservabilityService } from "../observability/observability.service.js";
import type { WorkflowScheduleRun } from "../workflow/workflow-schedule.types.js";
import { WorkflowSchedulerService } from "../workflow/workflow-scheduler.service.js";
import { WorkflowRunExecutorService } from "./workflow-run-executor.service.js";

const LOOP_WORKER_ID = "workflow-scheduler-loop";
const LOOP_USER_ID = "workflow-scheduler";

type DueTenantRow = {
  tenantId: string;
  tenantName: string;
};

@Injectable()
export class WorkflowSchedulerLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowSchedulerLoopService.name);
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly leaseMs: number;
  private readonly maxSteps: number;
  private readonly stuckTimeoutMs: number;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(WorkflowSchedulerService)
    private readonly scheduler: WorkflowSchedulerService,
    @Inject(WorkflowRunExecutorService)
    private readonly executor: WorkflowRunExecutorService,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {
    this.enabled = this.config.get<boolean>("app.workflow.schedulerEnabled", true);
    this.intervalMs = this.config.get<number>("app.workflow.schedulerIntervalMs", 30_000);
    this.leaseMs = this.config.get<number>("app.workflow.schedulerLeaseMs", 120_000);
    this.maxSteps = this.config.get<number>("app.workflow.schedulerMaxSteps", 10);
    this.stuckTimeoutMs = this.config.get<number>("app.workflow.schedulerStuckTimeoutMs", 300_000);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("Workflow scheduler loop is disabled by configuration");
      return;
    }
    this.logger.log(`Workflow scheduler loop starting (interval=${this.intervalMs}ms)`);
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.processDueSchedules();
      await this.recoverStuckRuns();
    } catch (error) {
      this.logger.error(
        `Scheduler loop tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private async processDueSchedules(): Promise<void> {
    const now = new Date();
    const dueTenants = await this.findDueTenants(now);
    if (dueTenants.length === 0) {
      return;
    }

    for (const { tenantName } of dueTenants) {
      if (this.stopped) {
        break;
      }
      const systemUser = this.buildSystemUser(tenantName);
      try {
        const runs = await this.scheduler.claimDueSchedules(
          {
            workerId: LOOP_WORKER_ID,
            limit: 20,
            leaseMs: this.leaseMs,
            now: now.toISOString(),
          },
          systemUser,
        );
        for (const run of runs) {
          if (this.stopped) {
            break;
          }
          await this.executeRun(run, systemUser);
        }
      } catch (error) {
        this.logger.error(
          `Failed to claim/execute schedules for tenant "${tenantName}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async executeRun(
    run: WorkflowScheduleRun,
    user: RequestUser,
  ): Promise<void> {
    const startedAt = Date.now();
    this.recordTrace(user, run.id, "workflow.schedule.loop.tick", {
      scheduleId: run.scheduleId,
      workflowId: run.workflowId,
      runId: run.id,
      triggeredBy: run.triggeredBy,
    });

    try {
      const result = await this.executor.executePendingSteps(
        run.workflowId,
        {
          maxWorkflowSteps: this.maxSteps,
          continueOnFailure: false,
        },
        user,
      );

      const status = result.stoppedOnFailure ? "failed" : "completed";
      const output = JSON.stringify({
        stepsExecuted: result.results.length,
        workflowStatus: result.workflow.status,
      });

      await this.scheduler.completeRun(
        run.id,
        {
          status,
          output,
          ...(status === "failed"
            ? { error: "One or more workflow steps failed during scheduled execution" }
            : {}),
        },
        user,
      );

      this.recordTrace(
        user,
        run.id,
        status === "completed"
          ? "workflow.schedule.loop.run.completed"
          : "workflow.schedule.loop.run.failed",
        {
          scheduleId: run.scheduleId,
          workflowId: run.workflowId,
          runId: run.id,
          stepsExecuted: result.results.length,
          durationMs: Date.now() - startedAt,
        },
        Date.now() - startedAt,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Scheduled run ${run.id} failed: ${errorMessage}`,
      );
      try {
        await this.scheduler.completeRun(
          run.id,
          {
            status: "failed",
            error: errorMessage,
          },
          user,
        );
      } catch {
        // Best effort — the run may have already been completed or the DB may be unavailable.
      }
      this.recordTrace(
        user,
        run.id,
        "workflow.schedule.loop.run.failed",
        {
          scheduleId: run.scheduleId,
          workflowId: run.workflowId,
          runId: run.id,
          error: errorMessage,
          durationMs: Date.now() - startedAt,
        },
        Date.now() - startedAt,
      );
    }
  }

  private async recoverStuckRuns(): Promise<void> {
    const cutoff = new Date(Date.now() - this.stuckTimeoutMs);
    try {
      const stuckRuns = await this.db
        .select({
          id: workflowScheduleRuns.id,
          tenantId: workflowScheduleRuns.tenantId,
          scheduleId: workflowScheduleRuns.scheduleId,
          workflowId: workflowScheduleRuns.workflowId,
          startedAt: workflowScheduleRuns.startedAt,
        })
        .from(workflowScheduleRuns)
        .where(
          and(
            eq(workflowScheduleRuns.status, "running"),
            lte(workflowScheduleRuns.startedAt, cutoff),
          ),
        )
        .limit(50);

      if (stuckRuns.length === 0) {
        return;
      }

      this.logger.warn(`Found ${stuckRuns.length} stuck workflow schedule runs (started before ${cutoff.toISOString()})`);

      for (const run of stuckRuns) {
        const tenantName = await this.identity.externalTenantId(run.tenantId);
        const systemUser = this.buildSystemUser(tenantName);
        try {
          await this.scheduler.completeRun(
            run.id,
            {
              status: "failed",
              error: `Run timed out (started at ${run.startedAt?.toISOString() ?? "unknown"}, exceeded ${this.stuckTimeoutMs}ms)`,
            },
            systemUser,
          );
          this.recordTrace(systemUser, run.id, "workflow.schedule.loop.stuck.recovered", {
            scheduleId: run.scheduleId,
            workflowId: run.workflowId,
            runId: run.id,
            stuckSince: run.startedAt?.toISOString() ?? "unknown",
          });
        } catch (error) {
          this.logger.error(
            `Failed to recover stuck run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Stuck run recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findDueTenants(now: Date): Promise<DueTenantRow[]> {
    const rows = await this.db
      .select({
        tenantId: workflowSchedules.tenantId,
        tenantName: tenants.name,
      })
      .from(workflowSchedules)
      .innerJoin(tenants, eq(workflowSchedules.tenantId, tenants.id))
      .where(
        and(
          eq(workflowSchedules.enabled, true),
          lte(workflowSchedules.nextRunAt, now),
          or(isNull(workflowSchedules.leaseUntil), lte(workflowSchedules.leaseUntil, now)),
        ),
      )
      .groupBy(workflowSchedules.tenantId, tenants.name);

    return rows.map((row) => ({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
    }));
  }

  private buildSystemUser(tenantId: string): RequestUser {
    return {
      userId: LOOP_USER_ID,
      tenantId,
      roles: ["developer"],
      permissions: ["agent:run", "tools:execute", "workflow:manage", "knowledge:read", "knowledge:write", "observability:read", "evaluation:manage"],
      authType: "service_token",
    };
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
