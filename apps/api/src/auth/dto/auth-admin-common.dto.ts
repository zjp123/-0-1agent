import { IsOptional, IsString, MinLength } from "class-validator";

export class AuthAdminReasonDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
