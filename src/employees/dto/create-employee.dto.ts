import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class CreateEmployeeDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsNotEmpty()
  @IsString()
  storeName!: string;
}