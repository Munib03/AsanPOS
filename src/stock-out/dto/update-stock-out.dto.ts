import { IsString, IsOptional } from 'class-validator';

export class UpdateStockOutDto {
  @IsOptional()
  @IsString()
  status?: string;
}