import { IsOptional, IsString } from "class-validator";

export class UpdateInventoryDto {
    @IsOptional()
    @IsString()
    name?: string;


    @IsOptional()
    @IsString()
    address?: string;
}