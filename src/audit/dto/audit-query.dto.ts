import { IsEnum, IsOptional } from 'class-validator';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';

export class AuditQueryDto {
  @IsOptional()
  @IsEnum(AuditEntityType)
  type?: AuditEntityType;
}