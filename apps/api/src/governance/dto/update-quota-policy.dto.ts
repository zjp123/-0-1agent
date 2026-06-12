import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateQuotaPolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  windowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  requestLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tokenLimit?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
