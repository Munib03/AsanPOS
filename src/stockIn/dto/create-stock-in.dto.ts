import { IsUUID, IsNumber } from 'class-validator';

export class CreateStockInDto {
  @IsUUID()
  purchaseId!: string;

  @IsUUID()
  inventoryId!: string;

  @IsNumber()
  quantity!: number;
}