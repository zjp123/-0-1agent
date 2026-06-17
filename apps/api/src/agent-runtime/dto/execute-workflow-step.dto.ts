import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ExecuteWorkflowStepDto {
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
  @Min(1000)
  @Max(120000)
  maxDurationMs?: number;
}
