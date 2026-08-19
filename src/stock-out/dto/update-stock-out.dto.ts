import { IsEnum, IsOptional } from 'class-validator';
import { StockOutStatus } from '../../shared/utils/stock-out-status.enum';

export class UpdateStockOutDto {
  @IsOptional()
  @IsEnum(StockOutStatus)
  status?: StockOutStatus;
}
