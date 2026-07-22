import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockInItemDto)
  items!: StockInItemDto[];
}
