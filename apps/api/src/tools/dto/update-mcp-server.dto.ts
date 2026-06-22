import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { AuthAdminReasonDto } from "../../auth/dto/auth-admin-common.dto.js";

export class UpdateMcpServerDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(["stdio"])
  transport?: "stdio";

  @IsOptional()
  @IsString()
  command?: string;

  @IsOptional()
  @IsArray()
  args?: string[];

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  riskLevel?: "low" | "medium" | "high" | "critical";

  @IsOptional()
  @IsArray()
  requiredPermissions?: string[];

  @IsOptional()
  @IsString()
  toolNamePrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(120_000)
  timeoutMs?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
