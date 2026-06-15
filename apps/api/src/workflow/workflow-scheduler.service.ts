import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";

import type { RequestUser } from "../auth/auth.types.js";
import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  workflowScheduleRuns,
  workflowSchedules,
  workflows,
} from "../db/schema.js";
import { ObservabilityService } from "../observability/observability.service.js";
import type { ClaimWorkflowSchedulesDto } from "./dto/claim-workflow-schedules.dto.js";
import type { CompleteWorkflowScheduleRunDto } from "./dto/complete-workflow-schedule-run.dto.js";
import type { CreateWorkflowScheduleDto } from "./dto/create-workflow-schedule.dto.js";
import type {
  WorkflowSchedule,
  WorkflowScheduleRun,
  WorkflowScheduleRunStatus,
  WorkflowScheduleType,
  WorkflowSchedulerStatus,
} from "./workflow-schedule.types.js";

@Injectable()
export class WorkflowSchedulerService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
    private readonly observability: ObservabilityService,
  ) {}

  getStatus(): WorkflowSchedulerStatus {
    return {
      enabled: true,
      store: "postgres",
      triggerModes: ["interval", "cron", "manual", "worker claim"],
      capabilities: [
        "schedule registry",
        "due schedule claiming",
        "lease based concurrency control",
        "manual trigger",
        "schedule run history",
        "run completion recording",
        "trace events",
      ],
    };
  }

  async listSchedules(actor: RequestUser): Promise<WorkflowSchedule[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(workflowSchedules)
      .where(eq(workflowSchedules.tenantId, tenantUuid))
      .orderBy(desc(workflowSchedules.createdAt));
    return rows.map((row) => this.toSchedule(row, actor.tenantId));
  }

  async createSchedule(
    body: CreateWorkflowScheduleDto,
    actor: RequestUser,
  ): Promise<WorkflowSchedule> {
    this.assertScheduleShape(body);
    const identity = await this.identity.resolve({
      tenantExternalId: actor.tenantId,
      userExternalId: actor.userId,
    });
    await this.assertWorkflowExists(identity.tenantId, body.workflowId);
    const [created] = await this.db
      .insert(workflowSchedules)
      .values({
        tenantId: identity.tenantId,
        workflowId: body.workflowId,
        createdBy: identity.userId,
        name: body.name.trim(),
        scheduleType: body.scheduleType,
        cronExpression: body.cronExpression,
        intervalSeconds: body.intervalSeconds,
        timezone: body.timezone ?? "UTC",
        enabled: body.enabled ?? true,
        maxConcurrentRuns: body.maxConcurrentRuns ?? 1,
        nextRunAt: new Date(body.nextRunAt),
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create workflow schedule");
    }
    this.recordTrace(actor, created.id, "workflow.schedule.created", {
      workflowId: created.workflowId,
      scheduleType: created.scheduleType,
      enabled: created.enabled,
    });
    return this.toSchedule(created, actor.tenantId);
  }

  async listRuns(
    scheduleId: string | undefined,
    actor: RequestUser,
  ): Promise<WorkflowScheduleRun[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const filters = [eq(workflowScheduleRuns.tenantId, tenantUuid)];
    if (scheduleId) {
      filters.push(eq(workflowScheduleRuns.scheduleId, scheduleId));
    }
    const rows = await this.db
      .select()
      .from(workflowScheduleRuns)
      .where(and(...filters))
      .orderBy(desc(workflowScheduleRuns.createdAt))
      .limit(100);
    return rows.map((row) => this.toRun(row, actor.tenantId));
  }

  async triggerSchedule(
    scheduleId: string,
    actor: RequestUser,
  ): Promise<WorkflowScheduleRun> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const schedule = await this.getTenantSchedule(tenantUuid, scheduleId);
    const run = await this.createRun({
      tenantUuid,
      schedule,
      triggeredBy: "manual",
      dueAt: new Date(),
      workerId: actor.userId,
      metadata: { triggeredByUserId: actor.userId },
    });
    this.recordTrace(actor, run.id, "workflow.schedule.run.created", {
      scheduleId,
      workflowId: schedule.workflowId,
      triggeredBy: "manual",
    });
    return this.toRun(run, actor.tenantId);
  }

  async claimDueSchedules(
    body: ClaimWorkflowSchedulesDto,
    actor: RequestUser,
  ): Promise<WorkflowScheduleRun[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const now = body.now ? new Date(body.now) : new Date();
    const leaseMs = body.leaseMs ?? 60_000;
    const limit = body.limit ?? 10;
    const dueSchedules = await this.db
      .select()
      .from(workflowSchedules)
      .where(
        and(
          eq(workflowSchedules.tenantId, tenantUuid),
          eq(workflowSchedules.enabled, true),
          lte(workflowSchedules.nextRunAt, now),
          or(isNull(workflowSchedules.leaseUntil), lte(workflowSchedules.leaseUntil, now)),
        ),
      )
      .orderBy(asc(workflowSchedules.nextRunAt))
      .limit(limit);

    const runs: WorkflowScheduleRun[] = [];
    for (const schedule of dueSchedules) {
      const activeRuns = await this.countActiveRuns(tenantUuid, schedule.id);
      if (activeRuns >= schedule.maxConcurrentRuns) {
        continue;
      }
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const nextRunAt = this.computeNextRunAt(schedule, now);
      const [claimed] = await this.db
        .update(workflowSchedules)
        .set({
          leaseOwner: body.workerId,
          leaseUntil,
          lastRunAt: now,
          nextRunAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(workflowSchedules.tenantId, tenantUuid),
            eq(workflowSchedules.id, schedule.id),
            or(isNull(workflowSchedules.leaseUntil), lte(workflowSchedules.leaseUntil, now)),
          ),
        )
        .returning();
      if (!claimed) {
        continue;
      }
      const run = await this.createRun({
        tenantUuid,
        schedule: claimed,
        triggeredBy: "scheduler",
        dueAt: schedule.nextRunAt,
        workerId: body.workerId,
        metadata: { leaseUntil: leaseUntil.toISOString() },
      });
      this.recordTrace(actor, run.id, "workflow.schedule.run.created", {
        scheduleId: run.scheduleId,
        workflowId: run.workflowId,
        triggeredBy: "scheduler",
        workerId: body.workerId,
      });
      runs.push(this.toRun(run, actor.tenantId));
    }
    return runs;
  }

  async completeRun(
    runId: string,
    body: CompleteWorkflowScheduleRunDto,
    actor: RequestUser,
  ): Promise<WorkflowScheduleRun> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const [existing] = await this.db
      .select()
      .from(workflowScheduleRuns)
      .where(
        and(
          eq(workflowScheduleRuns.tenantId, tenantUuid),
          eq(workflowScheduleRuns.id, runId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Workflow schedule run not found");
    }
    const now = new Date();
    const [updated] = await this.db
      .update(workflowScheduleRuns)
      .set({
        status: body.status,
        output: body.output,
        error: body.error,
        metadata: body.metadata ?? existing.metadata,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowScheduleRuns.tenantId, tenantUuid),
          eq(workflowScheduleRuns.id, runId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to complete workflow schedule run");
    }
    if (body.status !== "completed") {
      this.recordTrace(actor, updated.id, "workflow.schedule.run.failed", {
        scheduleId: updated.scheduleId,
        workflowId: updated.workflowId,
        status: body.status,
      });
    }
    return this.toRun(updated, actor.tenantId);
  }

  private assertScheduleShape(body: CreateWorkflowScheduleDto): void {
    if (body.scheduleType === "interval" && !body.intervalSeconds) {
      throw new ConflictException("intervalSeconds is required for interval schedules");
    }
    if (body.scheduleType === "cron" && !body.cronExpression) {
      throw new ConflictException("cronExpression is required for cron schedules");
    }
    if (body.scheduleType === "cron" && body.cronExpression) {
      this.parseCronExpression(body.cronExpression);
    }
  }

  private async assertWorkflowExists(
    tenantUuid: string,
    workflowId: string,
  ): Promise<void> {
    const [workflow] = await this.db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.tenantId, tenantUuid), eq(workflows.id, workflowId)))
      .limit(1);
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
  }

  private async getTenantSchedule(
    tenantUuid: string,
    scheduleId: string,
  ): Promise<typeof workflowSchedules.$inferSelect> {
    const [schedule] = await this.db
      .select()
      .from(workflowSchedules)
      .where(
        and(
          eq(workflowSchedules.tenantId, tenantUuid),
          eq(workflowSchedules.id, scheduleId),
        ),
      )
      .limit(1);
    if (!schedule) {
      throw new NotFoundException("Workflow schedule not found");
    }
    return schedule;
  }

  private async countActiveRuns(
    tenantUuid: string,
    scheduleId: string,
  ): Promise<number> {
    const rows = await this.db
      .select()
      .from(workflowScheduleRuns)
      .where(
        and(
          eq(workflowScheduleRuns.tenantId, tenantUuid),
          eq(workflowScheduleRuns.scheduleId, scheduleId),
          or(
            eq(workflowScheduleRuns.status, "pending"),
            eq(workflowScheduleRuns.status, "running"),
          ),
        ),
      );
    return rows.length;
  }

  private async createRun(input: {
    tenantUuid: string;
    schedule: typeof workflowSchedules.$inferSelect;
    triggeredBy: "scheduler" | "manual" | "recovery";
    dueAt: Date;
    workerId?: string;
    metadata: Record<string, unknown>;
  }): Promise<typeof workflowScheduleRuns.$inferSelect> {
    const [run] = await this.db
      .insert(workflowScheduleRuns)
      .values({
        tenantId: input.tenantUuid,
        scheduleId: input.schedule.id,
        workflowId: input.schedule.workflowId,
        triggeredBy: input.triggeredBy,
        workerId: input.workerId,
        status: "running",
        dueAt: input.dueAt,
        startedAt: new Date(),
        metadata: input.metadata,
      })
      .returning();
    if (!run) {
      throw new Error("Failed to create workflow schedule run");
    }
    return run;
  }

  private computeNextRunAt(
    schedule: typeof workflowSchedules.$inferSelect,
    now: Date,
  ): Date {
    if (schedule.scheduleType === "interval") {
      const intervalSeconds = schedule.intervalSeconds ?? 60;
      return new Date(now.getTime() + intervalSeconds * 1000);
    }
    return this.computeNextCronRunAt(schedule.cronExpression ?? "* * * * *", now);
  }

  private computeNextCronRunAt(expression: string, from: Date): Date {
    const cron = this.parseCronExpression(expression);
    const candidate = new Date(from.getTime());
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

    const maxIterations = 366 * 24 * 60;
    for (let index = 0; index < maxIterations; index += 1) {
      if (
        cron.minutes.has(candidate.getUTCMinutes()) &&
        cron.hours.has(candidate.getUTCHours()) &&
        cron.daysOfMonth.has(candidate.getUTCDate()) &&
        cron.months.has(candidate.getUTCMonth() + 1) &&
        cron.daysOfWeek.has(candidate.getUTCDay())
      ) {
        return candidate;
      }
      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    }
    throw new ConflictException("Unable to compute next cron run within one year");
  }

  private parseCronExpression(expression: string): {
    minutes: Set<number>;
    hours: Set<number>;
    daysOfMonth: Set<number>;
    months: Set<number>;
    daysOfWeek: Set<number>;
  } {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new ConflictException("Cron expression must have 5 fields");
    }
    return {
      minutes: this.parseCronField(parts[0] ?? "", 0, 59, false),
      hours: this.parseCronField(parts[1] ?? "", 0, 23, false),
      daysOfMonth: this.parseCronField(parts[2] ?? "", 1, 31, false),
      months: this.parseCronField(parts[3] ?? "", 1, 12, false),
      daysOfWeek: this.parseCronField(parts[4] ?? "", 0, 7, true),
    };
  }

  private parseCronField(
    field: string,
    min: number,
    max: number,
    normalizeSevenToZero: boolean,
  ): Set<number> {
    const values = new Set<number>();
    for (const segment of field.split(",")) {
      const [rangePart, stepPart] = segment.split("/");
      const step = stepPart ? Number(stepPart) : 1;
      if (!Number.isInteger(step) || step < 1) {
        throw new ConflictException("Cron step must be a positive integer");
      }
      let start: number;
      let end: number;
      if (rangePart === "*") {
        start = min;
        end = max;
      } else if (rangePart?.includes("-")) {
        const [rawStart, rawEnd] = rangePart.split("-");
        start = Number(rawStart);
        end = Number(rawEnd);
      } else {
        start = Number(rangePart);
        end = Number(rangePart);
      }
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        throw new ConflictException("Cron field value is out of range");
      }
      for (let value = start; value <= end; value += step) {
        values.add(normalizeSevenToZero && value === 7 ? 0 : value);
      }
    }
    if (values.size === 0) {
      throw new ConflictException("Cron field cannot be empty");
    }
    return values;
  }

  private recordTrace(
    actor: RequestUser,
    requestId: string,
    type: Parameters<ObservabilityService["record"]>[0]["type"],
    attributes: Parameters<ObservabilityService["record"]>[0]["attributes"],
  ): void {
    this.observability.record({
      tenantId: actor.tenantId,
      userId: actor.userId,
      requestId,
      type,
      attributes,
    });
  }

  private toSchedule(
    row: typeof workflowSchedules.$inferSelect,
    externalTenantId: string,
  ): WorkflowSchedule {
    const schedule: WorkflowSchedule = {
      id: row.id,
      tenantId: externalTenantId,
      workflowId: row.workflowId,
      createdBy: row.createdBy ?? "",
      name: row.name,
      scheduleType: row.scheduleType as WorkflowScheduleType,
      timezone: row.timezone,
      enabled: row.enabled,
      maxConcurrentRuns: row.maxConcurrentRuns,
      nextRunAt: row.nextRunAt.toISOString(),
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.cronExpression) {
      schedule.cronExpression = row.cronExpression;
    }
    if (row.intervalSeconds) {
      schedule.intervalSeconds = row.intervalSeconds;
    }
    if (row.lastRunAt) {
      schedule.lastRunAt = row.lastRunAt.toISOString();
    }
    if (row.leaseOwner) {
      schedule.leaseOwner = row.leaseOwner;
    }
    if (row.leaseUntil) {
      schedule.leaseUntil = row.leaseUntil.toISOString();
    }
    return schedule;
  }

  private toRun(
    row: typeof workflowScheduleRuns.$inferSelect,
    externalTenantId: string,
  ): WorkflowScheduleRun {
    const run: WorkflowScheduleRun = {
      id: row.id,
      tenantId: externalTenantId,
      scheduleId: row.scheduleId,
      workflowId: row.workflowId,
      triggeredBy: row.triggeredBy as WorkflowScheduleRun["triggeredBy"],
      status: row.status as WorkflowScheduleRunStatus,
      dueAt: row.dueAt.toISOString(),
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.workerId) {
      run.workerId = row.workerId;
    }
    if (row.startedAt) {
      run.startedAt = row.startedAt.toISOString();
    }
    if (row.completedAt) {
      run.completedAt = row.completedAt.toISOString();
    }
    if (row.error) {
      run.error = row.error;
    }
    if (row.output) {
      run.output = row.output;
    }
    return run;
  }
}
