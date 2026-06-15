import { IsBoolean, IsObject, IsOptional, IsString, IsISO8601 } from "class-validator";

import { AuthAdminReasonDto } from "../../auth/dto/auth-admin-common.dto.js";

export class UpdateSecretDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  rotationRequired?: boolean;

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
