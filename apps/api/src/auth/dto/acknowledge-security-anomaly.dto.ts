import { IsOptional, IsString, MaxLength } from "class-validator";

export class AcknowledgeSecurityAnomalyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
