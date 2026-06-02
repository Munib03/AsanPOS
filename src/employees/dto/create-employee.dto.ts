import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';

export class CreateEmployeeDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsString()
  role?: string;
}