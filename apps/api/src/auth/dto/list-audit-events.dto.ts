import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAuditEventsDto {
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
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsString()
  @IsISO8601()
  to?: string;
}
