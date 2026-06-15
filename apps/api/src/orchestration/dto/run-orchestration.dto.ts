import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class RunOrchestrationDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @MinLength(1)
  objective!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUUID("4", { each: true })
  participantIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  workflowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  correlationId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
