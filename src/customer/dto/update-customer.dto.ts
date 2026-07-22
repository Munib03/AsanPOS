import {
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCustomerDto {
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

  @IsOptional()
  @IsNumberString()
  @Length(10, 10)
  phone?: string;
}
