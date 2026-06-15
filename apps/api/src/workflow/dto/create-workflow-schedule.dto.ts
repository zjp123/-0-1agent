import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import type { WorkflowScheduleType } from "../workflow-schedule.types.js";

const SCHEDULE_TYPES: WorkflowScheduleType[] = ["interval", "cron"];

export class CreateWorkflowScheduleDto {
  @IsUUID()
  workflowId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(SCHEDULE_TYPES)
  scheduleType!: WorkflowScheduleType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cronExpression?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(31_536_000)
  intervalSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentRuns?: number;

  @IsString()
  @IsISO8601()
  nextRunAt!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
