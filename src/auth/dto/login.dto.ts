import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail({}, { message: "Please enter a valid email address" })
  email!: string;

  @IsNotEmpty()
  @IsString({ message: "Password is required" })
  password!: string;

  @IsOptional()
  @IsString()
  code?: string
}