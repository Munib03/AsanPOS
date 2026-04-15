import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsNotEmpty()
  @IsString()
  code!: string;
}