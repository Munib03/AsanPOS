import { IsString, IsOptional, IsEmail, IsDate, IsEnum } from 'class-validator';
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
  firstname?: string;

  @IsOptional()
  @IsString()
  lastname?: string;

  @IsOptional()
  @IsDate()
  dob?: Date;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;
}