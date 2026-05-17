import { IsString, IsOptional, IsArray, ValidateNested, IsUUID, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class DistributionItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  quantity!: number;
}

export class DistributionDto {
  @IsUUID()
  inventoryId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistributionItemDto)
  items!: DistributionItemDto[];
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistributionDto)
  distributions?: DistributionDto[];
}