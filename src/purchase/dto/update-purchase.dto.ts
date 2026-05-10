import { IsOptional, IsEnum } from "class-validator";
import { PurchaseStatus } from "../../shared/utils/purchase-status-enum";

export class UpdatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}