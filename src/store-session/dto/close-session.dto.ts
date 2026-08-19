import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CloseSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  closingNote?: string;
}
