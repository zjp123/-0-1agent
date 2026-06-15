import {
  IsBoolean,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import { AuthAdminReasonDto } from "../../auth/dto/auth-admin-common.dto.js";

export class CreateProviderCredentialDto extends AuthAdminReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  credentialType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  alias!: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  secretValueId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
