import { IsString, IsUUID, IsArray, IsNumber, IsOptional, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";

class CreatePurchasedItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  customerId!: string;


  @IsOptional()
  customDate?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchasedItemDto)
  items!: CreatePurchasedItemDto[];
}