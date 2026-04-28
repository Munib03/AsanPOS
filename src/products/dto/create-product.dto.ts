import { IsString, IsOptional, IsNumber, IsArray, IsUUID } from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsString()
  categoryName?: string;
}