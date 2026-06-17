import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq, and } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { workflows, workflowSteps } from "../db/schema.js";
import type {
  CreateWorkflowInput,
  UpdateWorkflowStepInput,
  Workflow,
  WorkflowEvent,
  WorkflowStatusValue,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowStore,
} from "./workflow.types.js";

@Injectable()
export class PostgresWorkflowStore implements WorkflowStore {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
  ) {}

  async create(input: CreateWorkflowInput): Promise<Workflow> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });

    const [workflow] = await this.db
      .insert(workflows)
      .values({
        tenantId: identity.tenantId,
        createdBy: identity.userId,
        title: input.title,
        goal: input.goal,
        status: "draft",
      })
      .returning();

    if (!workflow) {
      throw new Error("Failed to create workflow");
    }

    if (input.steps.length > 0) {
      await this.db.insert(workflowSteps).values(
        input.steps.map((step, index) => {
          const row = {
            tenantId: identity.tenantId,
            workflowId: workflow.id,
            title: step.title,
            status: "pending" as const,
            stepOrder: index + 1,
          };
          if (step.description) {
            return { ...row, description: step.description };
          }
          return row;
        }),
      );
    }

    const created = await this.get(input.tenantId, workflow.id);
    if (!created) {
      throw new Error("Failed to load created workflow");
    }
    return created;
  }

  async get(tenantId: string, workflowId: string): Promise<Workflow | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.tenantId, resolvedTenantId),
          eq(workflows.id, workflowId),
        ),
      )
      .limit(1);

    if (!workflow) {
      return undefined;
    }

    const steps = await this.loadSteps(resolvedTenantId, workflow.id);
    return this.toWorkflow(workflow, steps, tenantId);
  }

  async list(tenantId: string): Promise<Workflow[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.tenantId, resolvedTenantId))
      .orderBy(desc(workflows.createdAt));

    const result: Workflow[] = [];
    for (const workflow of rows) {
      const steps = await this.loadSteps(resolvedTenantId, workflow.id);
      result.push(this.toWorkflow(workflow, steps, tenantId));
    }
    return result;
  }

  async updateStep(input: UpdateWorkflowStepInput): Promise<Workflow | undefined> {
    const resolvedTenantId = await this.identity.ensureTenant(input.tenantId);
    const [step] = await this.db
      .update(workflowSteps)
      .set({
        status: input.status,
        output: input.output,
        error: input.error,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowSteps.tenantId, resolvedTenantId),
          eq(workflowSteps.workflowId, input.workflowId),
          eq(workflowSteps.id, input.stepId),
        ),
      )
      .returning();

    if (!step) {
      return undefined;
    }

    const steps = await this.loadSteps(resolvedTenantId, input.workflowId);
    const status = this.deriveWorkflowStatus(steps);
    await this.db
      .update(workflows)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.tenantId, resolvedTenantId),
          eq(workflows.id, input.workflowId),
        ),
      );

    return this.get(input.tenantId, input.workflowId);
  }

  private async loadSteps(
    tenantId: string,
    workflowId: string,
  ): Promise<Array<typeof workflowSteps.$inferSelect>> {
    return this.db
      .select()
      .from(workflowSteps)
      .where(
        and(
          eq(workflowSteps.tenantId, tenantId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      )
      .orderBy(asc(workflowSteps.stepOrder));
  }

  private toWorkflow(
    row: typeof workflows.$inferSelect,
    steps: Array<typeof workflowSteps.$inferSelect>,
    externalTenantId: string,
  ): Workflow {
    return {
      id: row.id,
      tenantId: externalTenantId,
      createdBy: row.createdBy ?? "",
      title: row.title,
      goal: row.goal,
      status: row.status as WorkflowStatusValue,
      steps: steps.map((step) => this.toStep(step)),
      events: this.toEvents(row, steps),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toStep(row: typeof workflowSteps.$inferSelect): WorkflowStep {
    const step: WorkflowStep = {
      id: row.id,
      title: row.title,
      status: row.status as WorkflowStepStatus,
      order: row.stepOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.description) {
      step.description = row.description;
    }
    if (row.output) {
      step.output = row.output;
    }
    if (row.error) {
      step.error = row.error;
    }
    return step;
  }

  private toEvents(
    workflow: typeof workflows.$inferSelect,
    steps: Array<typeof workflowSteps.$inferSelect>,
  ): WorkflowEvent[] {
    const events: WorkflowEvent[] = [
      {
        id: `${workflow.id}:created`,
        type: "created",
        timestamp: workflow.createdAt.toISOString(),
        message: "Workflow created",
        actorUserId: workflow.createdBy ?? "",
      },
    ];

    for (const step of steps) {
      if (step.status !== "pending") {
        events.push({
          id: `${step.id}:status`,
          type: "step_updated",
          timestamp: step.updatedAt.toISOString(),
          message: `Step "${step.title}" is ${step.status}`,
          actorUserId: workflow.createdBy ?? "",
        });
      }
    }

    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private deriveWorkflowStatus(
    steps: Array<typeof workflowSteps.$inferSelect>,
  ): WorkflowStatusValue {
    if (steps.some((step) => step.status === "failed")) {
      return "failed";
    }
    if (steps.every((step) => step.status === "completed" || step.status === "skipped")) {
      return "completed";
    }
    if (steps.some((step) => step.status === "running")) {
      return "running";
    }
    if (steps.some((step) => step.status === "waiting_for_approval")) {
      return "paused";
    }
    return "draft";
  }
}
