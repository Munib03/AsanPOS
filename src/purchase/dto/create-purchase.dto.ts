import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchasePaymentStatus } from '../../shared/utils/purchase-payment-status.enum';

export class CreatePurchaseItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
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
  @MaxLength(1000)
  note?: string;

  @IsEnum(PurchasePaymentStatus)
  paymentStatus!: PurchasePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
