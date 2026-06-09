import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import type { KnowledgeSourceType } from "../rag.types.js";

const SOURCE_TYPES: KnowledgeSourceType[] = [
  "manual",
  "upload",
  "wiki",
  "webpage",
  "api",
];

export class IngestKnowledgeDto {
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: KnowledgeSourceType;

  @IsOptional()
  @IsString()
  sourceUri?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
