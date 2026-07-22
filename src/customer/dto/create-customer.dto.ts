import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
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

  @IsNumberString()
  @Length(10, 10)
  phone!: string;
}
