import { IsUUID, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StockOutItemDto {
  @IsUUID()
  saleItemId!: string;

  @IsNumber()
  quantity!: number;
}

export class CreateStockOutDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  inventoryId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOutItemDto)
  items!: StockOutItemDto[];
}