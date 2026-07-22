import { IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../shared/utils/role.enum';
import { PaginateQuery } from '../../shared/types/paginate-query.types';

export class EmployeeQueryDto extends PaginateQuery {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
