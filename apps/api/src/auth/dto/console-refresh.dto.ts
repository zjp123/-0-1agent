import { IsOptional, IsString, MinLength } from "class-validator";

export class ConsoleRefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}
