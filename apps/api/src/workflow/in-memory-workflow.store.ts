import { Injectable } from "@nestjs/common";

import type {
  CreateWorkflowInput,
  UpdateWorkflowStepInput,
  Workflow,
  WorkflowEvent,
  WorkflowStatusValue,
  WorkflowStore,
} from "./workflow.types.js";

@Injectable()
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly workflows = new Map<string, Workflow>();

  async create(input: CreateWorkflowInput): Promise<Workflow> {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      createdBy: input.userId,
      title: input.title,
      goal: input.goal,
      status: "draft",
      steps: input.steps.map((step, index) => {
        const workflowStep = {
          id: crypto.randomUUID(),
          title: step.title,
          status: "pending" as const,
          order: index + 1,
          createdAt: now,
          updatedAt: now,
        };
        if (step.description) {
          return { ...workflowStep, description: step.description };
        }
        return workflowStep;
      }),
      events: [
        this.event("created", "Workflow created", input.userId, now),
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.set(this.key(input.tenantId, workflow.id), workflow);
    return workflow;
  }

  async get(tenantId: string, workflowId: string): Promise<Workflow | undefined> {
    return this.workflows.get(this.key(tenantId, workflowId));
  }

  async list(tenantId: string): Promise<Workflow[]> {
    return [...this.workflows.values()]
      .filter((workflow) => workflow.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateStep(input: UpdateWorkflowStepInput): Promise<Workflow | undefined> {
    const workflow = this.workflows.get(this.key(input.tenantId, input.workflowId));
    if (!workflow) {
      return undefined;
    }

    const step = workflow.steps.find((item) => item.id === input.stepId);
    if (!step) {
      return undefined;
    }

    const now = new Date().toISOString();
    step.status = input.status;
    step.updatedAt = now;
    if (input.output !== undefined) {
      step.output = input.output;
    }
    if (input.error !== undefined) {
      step.error = input.error;
    }

    workflow.status = this.deriveWorkflowStatus(workflow);
    workflow.updatedAt = now;
    workflow.events.push(
      this.event(
        "step_updated",
        `Step "${step.title}" updated to ${step.status}`,
        input.userId,
        now,
      ),
    );
    workflow.events.push(
      this.event(
        "status_updated",
        `Workflow status is now ${workflow.status}`,
        input.userId,
        now,
      ),
    );

    return workflow;
  }

  private deriveWorkflowStatus(workflow: Workflow): WorkflowStatusValue {
    if (workflow.steps.some((step) => step.status === "failed")) {
      return "failed";
    }
    if (workflow.steps.every((step) => step.status === "completed" || step.status === "skipped")) {
      return "completed";
    }
    if (workflow.steps.some((step) => step.status === "running")) {
      return "running";
    }
    if (workflow.steps.some((step) => step.status === "waiting_for_approval")) {
      return "paused";
    }
    return "draft";
  }

  private event(
    type: WorkflowEvent["type"],
    message: string,
    actorUserId: string,
    timestamp: string,
  ): WorkflowEvent {
    return {
      id: crypto.randomUUID(),
      type,
      timestamp,
      message,
      actorUserId,
    };
  }

  private key(tenantId: string, workflowId: string): string {
    return `${tenantId}:${workflowId}`;
  }
}
