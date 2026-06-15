import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import type { OrchestrationParticipantRole } from "../orchestration.types.js";

const PARTICIPANT_ROLES: OrchestrationParticipantRole[] = [
  "coordinator",
  "worker",
  "reviewer",
  "specialist",
];

export class CreateParticipantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(PARTICIPANT_ROLES)
  role!: OrchestrationParticipantRole;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxSteps?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  maxDurationMs?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
