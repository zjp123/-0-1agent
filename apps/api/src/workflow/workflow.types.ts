export type WorkflowStatusValue =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_for_approval";

export type WorkflowStep = {
  id: string;
  title: string;
  description?: string;
  status: WorkflowStepStatus;
  order: number;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowEvent = {
  id: string;
  type: "created" | "step_updated" | "status_updated";
  timestamp: string;
  message: string;
  actorUserId: string;
};

export type Workflow = {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  goal: string;
  status: WorkflowStatusValue;
  steps: WorkflowStep[];
  events: WorkflowEvent[];
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowInput = {
  tenantId: string;
  userId: string;
  title: string;
  goal: string;
  steps: Array<{
    title: string;
    description?: string;
  }>;
};

export type UpdateWorkflowStepInput = {
  tenantId: string;
  workflowId: string;
  stepId: string;
  userId: string;
  status: WorkflowStepStatus;
  output?: string;
  error?: string;
};

export type UpdateWorkflowStatusInput = {
  tenantId: string;
  workflowId: string;
  userId: string;
  status: WorkflowStatusValue;
};

export interface WorkflowStore {
  create(input: CreateWorkflowInput): Promise<Workflow>;
  get(tenantId: string, workflowId: string): Promise<Workflow | undefined>;
  list(tenantId: string): Promise<Workflow[]>;
  updateStep(input: UpdateWorkflowStepInput): Promise<Workflow | undefined>;
  updateStatus(input: UpdateWorkflowStatusInput): Promise<Workflow | undefined>;
}
