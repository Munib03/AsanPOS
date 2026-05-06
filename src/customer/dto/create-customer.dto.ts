import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateCustomerDto {
  @IsNotEmpty()
  @IsString()
  name!: string;
  
  @IsNotEmpty()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}