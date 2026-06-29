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
}

export interface CashierStats {
  sessionId: string | null;
  employeeId: string;
  employeeName: string;
  totalSales: number;
  percentage: number;
  openingAmount: number;
  closingAmount: number | null;
  status: 'open' | 'closed' | null;
}

export interface SessionDetail {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  status: 'open' | 'closed';
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number;
  openedAt?: Date;
  closedAt: Date | null;
}

export interface DashboardStats {
  range: DashboardRange;
  customRange?: { from: string; to: string };
  sales: { total: number; percentageChange: number };
  profit: { total: number; percentageChange: number };
  cashierBreakdown: CashierStats[];
  adminSessions?: SessionDetail[];
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