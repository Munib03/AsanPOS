import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInventoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  address!: string;
}
