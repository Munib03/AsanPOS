import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateAiChatThreadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
