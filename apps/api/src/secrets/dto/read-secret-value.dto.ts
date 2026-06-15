import { IsOptional, IsString, IsUUID } from "class-validator";

export class ReadSecretValueDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  approvalId?: string;
}
