import { IsOptional, IsString, MinLength } from "class-validator";

export class DecideApprovalRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  comment?: string;
}
