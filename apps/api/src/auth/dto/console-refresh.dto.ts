import { IsString, MinLength } from "class-validator";

export class ConsoleRefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

