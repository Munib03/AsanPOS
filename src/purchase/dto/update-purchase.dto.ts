import { IsString, IsOptional, IsUUID, IsNumber } from 'class-validator';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  inventoryId?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;
}