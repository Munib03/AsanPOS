import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  saleId!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}