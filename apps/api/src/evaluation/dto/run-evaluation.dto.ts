import { IsString, MinLength } from "class-validator";

export class RunEvaluationDto {
  @IsString()
  @MinLength(1)
  actualOutput!: string;
}
