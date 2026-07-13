import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  Min,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SalePaymentStatus } from '../../shared/utils/sale-payment-status.enum';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class CreateSaleDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  inventoryId!: string;

  @IsEnum(SalePaymentStatus)
  paymentStatus!: SalePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}
