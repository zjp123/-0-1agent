import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class ConsoleLoginDto {
  @IsIn(["email_password", "api_key", "service_token"])
  credentialType!: "email_password" | "api_key" | "service_token";

  @ValidateIf((body: ConsoleLoginDto) => body.credentialType !== "email_password")
  @IsString()
  @MinLength(1)
  credential?: string;

  @ValidateIf((body: ConsoleLoginDto) => body.credentialType === "email_password")
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((body: ConsoleLoginDto) => body.credentialType === "email_password")
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

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
