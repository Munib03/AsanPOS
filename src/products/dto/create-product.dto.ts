import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  scannerId?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  categoryName?: string;
}