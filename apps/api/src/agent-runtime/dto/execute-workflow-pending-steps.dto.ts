import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ExecuteWorkflowPendingStepsDto {
  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsBoolean()
  continueOnFailure?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxStepsPerAgentRun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxWorkflowSteps?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  maxDurationMsPerAgentRun?: number;
}
