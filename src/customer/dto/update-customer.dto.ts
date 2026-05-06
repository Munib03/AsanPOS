import { IsString, IsOptional } from 'class-validator';

export class UpdateCustomerDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;
}