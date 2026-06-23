import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum DashboardRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_WEEK = 'last-week',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',   
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(DashboardRange)
  range?: DashboardRange = DashboardRange.TODAY;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export interface DailyStats {
  date: string;
  dayName: string;
  sales: { total: number };
  profit: { total: number };
  loss: { total: number };
}

export interface DashboardStats {
  range: DashboardRange;
  customRange?: { from: string; to: string };
  sales: { total: number; percentageChange: number };
  profit: { total: number; percentageChange: number };
  loss: { total: number; percentageChange: number };
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
  dailyBreakdown?: DailyStats[];
}

