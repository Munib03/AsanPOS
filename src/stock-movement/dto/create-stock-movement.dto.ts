// dto/create-stock-movement.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  Min,
} from 'class-validator';

class CreateStockMovementItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class CreateStockMovementDto {
  @IsUUID()
  @IsNotEmpty()
  sourceInventoryId!: string;

  @IsUUID()
  @IsNotEmpty()
  destinationInventoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockMovementItemDto)
  items!: CreateStockMovementItemDto[];
}