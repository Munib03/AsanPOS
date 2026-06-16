import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CloseSessionDto {
  @IsNumber()
  closingAmount!: number;

  @IsOptional()
  @IsString()
  closingNote?: string;
}