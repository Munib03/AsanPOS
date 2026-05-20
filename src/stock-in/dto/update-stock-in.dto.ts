import { IsString, IsOptional } from 'class-validator';

export class UpdateStockInDto {
  @IsOptional()
  @IsString()
  status?: string;
}