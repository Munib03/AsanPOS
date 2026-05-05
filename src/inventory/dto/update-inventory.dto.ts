import { IsOptional, IsString } from "class-validator";

export class UpdateProductDto {
    @IsOptional()
    @IsString()
    name?: string;


    @IsOptional()
    @IsString()
    address?: string;
}