import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PaginateQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemsPerPage?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsObject()
  filter?: Record<string, string | string[]>;

  @IsOptional()
  @IsObject()
  sort?: Record<string, 'asc' | 'desc'>;
}

export type Meta = {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
  totalCount: number;
  search?: string;
  filters?: Record<string, string | string[]>;
  // sorts?: Record<string, 'asc' | 'desc'>;
};
