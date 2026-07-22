import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsNumberString()
  @Length(6, 6)
  code!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
