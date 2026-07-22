import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  address?: string;
}
