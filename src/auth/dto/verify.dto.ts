import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  code!: string;
}