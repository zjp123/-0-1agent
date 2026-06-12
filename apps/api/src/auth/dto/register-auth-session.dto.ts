import { IsISO8601, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { AuthAdminReasonDto } from "./auth-admin-common.dto.js";

export class RegisterAuthSessionDto extends AuthAdminReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  tokenId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
