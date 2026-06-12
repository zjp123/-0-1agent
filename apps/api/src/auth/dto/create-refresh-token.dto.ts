import { IsISO8601, IsOptional, IsString } from "class-validator";

import { AuthAdminReasonDto } from "./auth-admin-common.dto.js";

export class CreateRefreshTokenDto extends AuthAdminReasonDto {
  @IsOptional()
  @IsString()
  @IsISO8601()
  expiresAt?: string;
}
