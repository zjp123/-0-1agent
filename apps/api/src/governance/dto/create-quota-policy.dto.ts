import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import type { QuotaAction, QuotaSubjectType } from "../governance.types.js";

const ACTIONS: QuotaAction[] = [
  "agent.run",
  "tool.execute",
  "knowledge.ingest",
  "knowledge.retrieve",
  "knowledge.reindex",
];

const SUBJECT_TYPES: QuotaSubjectType[] = ["global", "tenant", "user"];

export class CreateQuotaPolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(ACTIONS)
  action!: QuotaAction;

  @IsIn(SUBJECT_TYPES)
  subjectType!: QuotaSubjectType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subjectId?: string;

  @IsInt()
  @Min(1)
  windowSeconds!: number;

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
