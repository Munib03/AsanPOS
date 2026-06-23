import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()                                                   
  inventoryId!: string;                                       

  @IsOptional()
  @IsDateString()
  customDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}