import { IsString, IsOptional, IsNumber, IsArray, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsString()
  categoryName?: string;
}