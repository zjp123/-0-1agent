import { Inject, Injectable } from "@nestjs/common";

import { WORKFLOW_STORE } from "./workflow.constants.js";
import type {
  CreateWorkflowInput,
  UpdateWorkflowStepInput,
  UpdateWorkflowStatusInput,
  Workflow,
  WorkflowStore,
} from "./workflow.types.js";

export type WorkflowStatus = {
  enabled: boolean;
  store: string;
  capabilities: string[];
};

@Injectable()
export class WorkflowService {
  constructor(@Inject(WORKFLOW_STORE) private readonly store: WorkflowStore) {}

  create(input: CreateWorkflowInput): Promise<Workflow> {
    return this.store.create(input);
  }

  list(tenantId: string): Promise<Workflow[]> {
    return this.store.list(tenantId);
  }

  get(tenantId: string, workflowId: string): Promise<Workflow | undefined> {
    return this.store.get(tenantId, workflowId);
  }

  updateStep(input: UpdateWorkflowStepInput): Promise<Workflow | undefined> {
    return this.store.updateStep(input);
  }

  updateStatus(input: UpdateWorkflowStatusInput): Promise<Workflow | undefined> {
    return this.store.updateStatus(input);
  }

  getStatus(): WorkflowStatus {
    return {
      enabled: true,
      store: "postgres",
      capabilities: [
        "planning",
        "step state",
        "pause and resume foundation",
        "human approval state",
        "execution history",
      ],
    };
  }
}
