import { IsEnum, IsOptional } from 'class-validator';
import { StockInStatus } from '../../shared/utils/stock-in-status.enum';

export class UpdateStockInDto {
  @IsOptional()
  @IsEnum(StockInStatus)
  status?: StockInStatus;
}
