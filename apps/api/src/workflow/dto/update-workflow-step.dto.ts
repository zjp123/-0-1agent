import { IsIn, IsOptional, IsString } from "class-validator";

import type { WorkflowStepStatus } from "../workflow.types.js";

const STEP_STATUSES: WorkflowStepStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting_for_approval",
];

export class UpdateWorkflowStepDto {
  @IsIn(STEP_STATUSES)
  status!: WorkflowStepStatus;

  @IsOptional()
  @IsString()
  output?: string;

  @IsOptional()
  @IsString()
  error?: string;
}
