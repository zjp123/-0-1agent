import { Injectable } from "@nestjs/common";

import { InMemoryWorkflowStore } from "./in-memory-workflow.store.js";
import type {
  CreateWorkflowInput,
  UpdateWorkflowStepInput,
  Workflow,
} from "./workflow.types.js";

export type WorkflowStatus = {
  enabled: boolean;
  store: string;
  capabilities: string[];
};

@Injectable()
export class WorkflowService {
  constructor(private readonly store: InMemoryWorkflowStore) {}

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

  getStatus(): WorkflowStatus {
    return {
      enabled: true,
      store: "in-memory",
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
