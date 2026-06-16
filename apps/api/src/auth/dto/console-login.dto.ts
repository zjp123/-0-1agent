import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ConsoleLoginDto {
  @IsIn(["api_key", "service_token"])
  credentialType!: "api_key" | "service_token";

  @IsString()
  @MinLength(1)
  credential!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deviceLabel?: string;
}

