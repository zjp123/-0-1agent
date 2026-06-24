import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAgentConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;
}
