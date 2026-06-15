import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateApprovalRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  action!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  resourceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceId?: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;
}
