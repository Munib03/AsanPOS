import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumberString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';
import { Role } from '../../shared/utils/role.enum';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsNumberString()
  @Length(10, 10)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  storeName!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  storeAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsDateString()
  dob?: Date;
}
