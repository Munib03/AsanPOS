import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PaginateQuery } from '../../shared/types/paginate-query.types';

export class InventoryDetailQueryDto extends PaginateQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stockMovementAuditPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stockMovementAuditItemsPerPage?: number;
}
