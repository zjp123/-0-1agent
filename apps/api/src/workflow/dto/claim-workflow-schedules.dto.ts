import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ClaimWorkflowSchedulesDto {
  @IsString()
  @MaxLength(160)
  workerId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3_600_000)
  leaseMs?: number;

  @IsOptional()
  @IsString()
  @IsISO8601()
  now?: string;
}
