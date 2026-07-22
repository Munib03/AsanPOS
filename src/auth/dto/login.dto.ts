import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsString({ message: 'Password is required' })
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsNumberString()
  @Length(6, 6)
  code?: string;
}
