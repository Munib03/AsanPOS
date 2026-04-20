import { IsString, IsOptional, IsEmail, IsDateString, IsEnum } from 'class-validator';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

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
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;
}