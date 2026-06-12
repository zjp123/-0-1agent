import { IsString, MinLength } from "class-validator";

export class VerifyRefreshTokenDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
