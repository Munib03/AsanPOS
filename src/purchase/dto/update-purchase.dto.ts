import { IsString, IsOptional } from "class-validator";

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  status?: string;
}