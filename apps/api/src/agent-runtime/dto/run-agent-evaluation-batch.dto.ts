import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class RunAgentEvaluationBatchDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  caseIds?: string[];

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxSteps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxCases?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  maxDurationMs?: number;
}
