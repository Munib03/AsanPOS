import { IsEnum, IsOptional } from 'class-validator';

export enum DashboardRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_WEEK = 'last-week',
  MONTHLY = 'monthly',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(DashboardRange)
  range?: DashboardRange = DashboardRange.TODAY;
}

export interface DashboardStats {
  range: DashboardRange;
  sales: {
    total: number;
    percentageChange: number;
  };
  profit: {
    total: number;
    percentageChange: number;
  };
  loss: {
    total: number;
    percentageChange: number;
  };
  lowStockProducts: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];

  outOfStockProducts: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];
}