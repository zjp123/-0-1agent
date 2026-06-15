import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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

export class CreateServiceTokenDto extends AuthAdminReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsIn(SERVICE_TOKEN_ROLES, { each: true })
  roles?: Role[];

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];

  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;
}
