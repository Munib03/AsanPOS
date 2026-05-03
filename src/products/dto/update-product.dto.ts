import { IsString, IsOptional, IsNumber, IsArray, IsUUID } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  scannerId?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  // @IsOptional()
  // @IsArray()
  // @IsUUID('4', { each: true })
  // categoryIds?: string[];
}