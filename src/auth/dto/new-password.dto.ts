import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class NewPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
