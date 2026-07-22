import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CashMovementType } from '../../shared/utils/cash-movement.enum';

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
