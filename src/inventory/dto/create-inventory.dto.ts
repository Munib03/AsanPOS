import { IsNotEmpty, IsString } from "class-validator";

export class CreateInventoryDto {
    @IsNotEmpty()
    @IsString()
    name!: string;

    @IsNotEmpty()
    @IsString()
    address!: string;
}