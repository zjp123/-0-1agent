import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const SECURITY_ANOMALY_SEVERITIES = ["info", "warning", "critical"] as const;

export class ListSecurityAnomaliesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(SECURITY_ANOMALY_SEVERITIES)
  severity?: (typeof SECURITY_ANOMALY_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return value;
  })
  @IsBoolean()
  acknowledged?: boolean;
}
