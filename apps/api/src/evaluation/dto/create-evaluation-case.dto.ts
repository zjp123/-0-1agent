import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import type { EvaluationCaseType } from "../evaluation.types.js";

const CASE_TYPES: EvaluationCaseType[] = [
  "agent_response",
  "rag_retrieval",
  "tool_execution",
];

export class CreateEvaluationCaseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(CASE_TYPES)
  type!: EvaluationCaseType;

  @IsString()
  @MinLength(1)
  input!: string;

  @IsString()
  @MinLength(1)
  expectedOutput!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
