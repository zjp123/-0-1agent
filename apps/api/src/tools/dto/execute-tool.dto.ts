import { IsObject, IsOptional, IsString, IsUUID } from "class-validator";

export class ExecuteToolDto {
  @IsString()
  name!: string;

  @IsObject()
  arguments!: Record<string, unknown>;

  @IsUUID()
  requestId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
