import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../shared/utils/role.enum';

export class EmployeeQueryDto {
    @IsOptional()
    @IsEnum(Role)
    role?: Role;

    @IsOptional()
    @IsString()
    search?: string;
}