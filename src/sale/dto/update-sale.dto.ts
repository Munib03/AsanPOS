import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { SalePaymentStatus } from '../../shared/utils/sale-payment-status.enum';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(SalePaymentStatus)
  paymentStatus?: SalePaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;
}
