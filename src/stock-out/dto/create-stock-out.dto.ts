import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StockOutItemDto {
  @IsUUID()
  saleItemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateStockOutDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  inventoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockOutItemDto)
  items!: StockOutItemDto[];
}
