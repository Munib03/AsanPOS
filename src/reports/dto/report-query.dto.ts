import { IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum ReportType {
    Sale = 'sale',
    Purchase = 'purchase',
    Inventory = 'inventory',
    StockIn = 'stock_in',
    StockOut = 'stock_out',
    Payment = 'payment',
    CashMovement = 'cash_movement',
}

export enum ExportFormat {
    CSV = 'csv',
    JSON = 'json',
}

export class ReportQueryDto {
    @IsEnum(ReportType)
    type!: ReportType;

    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;
}

export class ReportExportQueryDto {
    @IsEnum(ReportType)
    type!: ReportType;

    @IsEnum(ExportFormat)
    format!: ExportFormat;

    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;
}