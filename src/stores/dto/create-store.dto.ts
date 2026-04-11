import { IsString, IsNotEmpty } from 'class-validator';

export class CreateStoreDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  address!: string;
}