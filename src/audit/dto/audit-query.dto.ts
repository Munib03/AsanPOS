import { IsEnum, IsOptional } from 'class-validator';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';
import { PaginateQuery } from '../../shared/types/paginate-query.types';

export class AuditQueryDto extends PaginateQuery {
  @IsOptional()
  @IsEnum(AuditEntityType)
  type?: AuditEntityType;
}
