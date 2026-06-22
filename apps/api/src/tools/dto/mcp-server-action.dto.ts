import { IsOptional, IsString } from "class-validator";

import { AuthAdminReasonDto } from "../../auth/dto/auth-admin-common.dto.js";

export class McpServerActionDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsString()
  approvalId?: string;
}
