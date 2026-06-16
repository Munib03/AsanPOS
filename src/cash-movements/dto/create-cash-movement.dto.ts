import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { CashMovementType } from '../../shared/utils/cash-movement.enum';

export class CreateCashMovementDto {
  @IsUUID()
  sessionId!: string;

  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}