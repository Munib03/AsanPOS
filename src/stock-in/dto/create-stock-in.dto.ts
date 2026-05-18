import { IsUUID, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StockInItemDto {
  @IsUUID()
  purchaseItemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateStockInDto {
  @IsUUID()
  purchaseId!: string;

  @IsUUID()
  inventoryId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockInItemDto)
  items!: StockInItemDto[];
}