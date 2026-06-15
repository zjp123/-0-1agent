import { IsIn, IsObject, IsOptional, IsString } from "class-validator";

import type { WorkflowScheduleRunStatus } from "../workflow-schedule.types.js";

const COMPLETE_STATUSES: WorkflowScheduleRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export class CompleteWorkflowScheduleRunDto {
  @IsIn(COMPLETE_STATUSES)
  status!: WorkflowScheduleRunStatus;

  @IsOptional()
  @IsString()
  output?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
