import { IsString, MinLength } from "class-validator";
import { IsOptional, IsUUID } from "class-validator";

import { AuthAdminReasonDto } from "../../auth/dto/auth-admin-common.dto.js";

export class RotateSecretDto extends AuthAdminReasonDto {
  @IsString()
  @MinLength(1)
  value!: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  approvalId?: string;
}
