import { IsString, IsUUID } from "class-validator";

import { AuthAdminReasonDto } from "./auth-admin-common.dto.js";

export class AssignUserRoleDto extends AuthAdminReasonDto {
  @IsString()
  @IsUUID()
  roleId!: string;
}
