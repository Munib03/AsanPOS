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
  sessionsOpened: number;
  sessionsClosed: number;
  cashIn: number;
  cashOut: number;
}

export interface CashierStats {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  totalSales: number;
  openingAmount: number;
  closingAmount: number | null;
  status: 'open' | 'closed';
  cashIn: number;
  cashOut: number;
}

export interface DashboardStats {
  range: DashboardRange;
  customRange?: { from: string; to: string };
  sales: { total: number; percentageChange: number };
  profit: { total: number; percentageChange: number };
  cashierBreakdown?: CashierStats[];
  lowStockProducts?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];
  outOfStockProducts?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];
  dailyBreakdown?: DailyStats[];
}