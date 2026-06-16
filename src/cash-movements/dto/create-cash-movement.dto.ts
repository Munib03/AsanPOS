import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CashMovementType } from '../../shared/utils/cash-movement.enum';

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}