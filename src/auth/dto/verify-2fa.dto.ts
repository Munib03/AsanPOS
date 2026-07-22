import { IsNotEmpty, IsNumberString, Length } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsNotEmpty()
  @IsNumberString()
  @Length(6, 6)
  code!: string;
}
