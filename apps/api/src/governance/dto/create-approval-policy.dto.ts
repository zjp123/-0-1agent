import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateApprovalPolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  action!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  resourceType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  requiredApprovals?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
