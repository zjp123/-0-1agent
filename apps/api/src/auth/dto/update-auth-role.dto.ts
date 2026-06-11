import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { ALL_PERMISSIONS } from "../auth.service.js";
import type { Permission } from "../auth.types.js";
import { AuthAdminReasonDto } from "./auth-admin-common.dto.js";

export class UpdateAuthRoleDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];

  @IsOptional()
  @IsString()
  description?: string;
}
