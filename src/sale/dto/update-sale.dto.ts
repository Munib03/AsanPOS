import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { SalePaymentStatus } from '../../shared/utils/sale-payment-status.enum';
import { SaleStatus } from '../../shared/utils/sale-status.enum';

export class UpdateSaleDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(SalePaymentStatus)
  paymentStatus?: SalePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;
}
