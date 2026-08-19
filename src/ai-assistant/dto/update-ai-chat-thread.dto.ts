import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateAiChatThreadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
