import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";

import type { TraceEventType } from "../observability.types.js";

const TRACE_EVENT_TYPES: TraceEventType[] = [
  "agent.run.started",
  "agent.context.built",
  "rag.retrieved",
  "model.completed",
  "model.failed",
  "tool.completed",
  "agent.run.completed",
  "orchestration.run.started",
  "orchestration.handoff.started",
  "orchestration.handoff.completed",
  "orchestration.handoff.failed",
  "orchestration.run.completed",
  "workflow.schedule.created",
  "workflow.schedule.run.created",
  "workflow.schedule.run.failed",
];

export class ListTracesDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsIn(TRACE_EVENT_TYPES)
  type?: TraceEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
