import { IsOptional, IsString } from 'class-validator';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  status?: string;
}