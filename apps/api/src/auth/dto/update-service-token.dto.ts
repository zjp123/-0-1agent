import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
} from "class-validator";

import { ALL_PERMISSIONS } from "../auth.service.js";
import type { Permission, Role } from "../auth.types.js";
import { AuthAdminReasonDto } from "./auth-admin-common.dto.js";

const SERVICE_TOKEN_ROLES: Role[] = [
  "viewer",
  "developer",
  "operator",
  "admin",
  "service",
  "break_glass",
];

export class UpdateServiceTokenDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsArray()
  @IsIn(SERVICE_TOKEN_ROLES, { each: true })
  roles?: Role[];

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;
}
