// dto/update-stock-movement.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { StockMovementStatus } from '../../shared/utils/stock-movement-status.enum';

export class UpdateStockMovementDto {
  @IsOptional()
  @IsEnum(StockMovementStatus)
  status?: StockMovementStatus;
}