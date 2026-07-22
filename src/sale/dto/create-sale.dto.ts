import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { SalePaymentStatus } from '../../shared/utils/sale-payment-status.enum';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}
