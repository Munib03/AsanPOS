import { IsString, IsOptional } from 'class-validator';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  status?: string;
}