import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  openingNote?: string;
}
