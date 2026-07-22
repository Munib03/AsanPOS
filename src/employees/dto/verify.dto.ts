import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  Length,
  MaxLength,
} from 'class-validator';

export class VerifyDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsNumberString()
  @Length(6, 6)
  code!: string;
}
