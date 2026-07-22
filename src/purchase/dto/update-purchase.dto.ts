import {
  IsEnum,
  IsPositive,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';
import { PurchasePaymentStatus } from '../../shared/utils/purchase-payment-status.enum';
import { PurchaseStatus } from '../../shared/utils/purchase-status-enum';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsUUID()
  inventoryId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsEnum(PurchasePaymentStatus)
  paymentStatus?: PurchasePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;
}
