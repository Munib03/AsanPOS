import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchasePaymentStatus } from '../../shared/utils/purchase-payment-status.enum';

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

  @IsEnum(PurchasePaymentStatus)
  paymentStatus!: PurchasePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
