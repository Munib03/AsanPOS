import { IsOptional, IsString } from 'class-validator';

export class AskAiAssistantDto {
  @IsString()
  question!: string;

  @IsOptional()
  @IsString()
  threadId?: string;
}
