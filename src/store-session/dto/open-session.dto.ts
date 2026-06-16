import { IsNumber, IsOptional, IsString } from 'class-validator';

export class OpenSessionDto {
  @IsNumber()
  openingAmount!: number;

  @IsOptional()
  @IsString()
  openingNote?: string;
}