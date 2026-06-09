import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

import type { ModelMessage } from "../../model-gateway/model-gateway.types.js";

export class RunAgentDto {
  @IsString()
  message!: string;

  @IsUUID()
  requestId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  messages?: ModelMessage[];

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
  @IsString()
  model?: string;
}
