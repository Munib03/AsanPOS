import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString({ message: "Name is required" })
  name!: string;

  @IsNotEmpty()
  @IsEmail({}, { message: "Please enter a valid email address" })
  email!: string;

  @IsOptional()
  @IsString({ message: "Phone number is required" })
  phone?: string;

  @IsNotEmpty()
  @IsString({ message: "Password is required" })
  password!: string;

  @IsNotEmpty()
  @IsString({ message: "Store name is required" })
  storeName!: string;

  @IsOptional()
  @IsString()
  storeAddress?: string;
}