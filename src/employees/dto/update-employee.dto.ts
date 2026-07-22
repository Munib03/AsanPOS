import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';
import { Role } from '../../shared/utils/role.enum';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  oldPassword?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsNumberString()
  @Length(10, 10)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}
