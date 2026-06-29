import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { Store } from '../database/entites/store.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Payment } from '../database/entites/payments.entity';
import { CashMovementType } from '../shared/utils/cash-movement.enum';
import {
    CashierStats,
    DailyStats,
    DashboardQueryDto,
    DashboardRange,
    DashboardStats,
    SessionDetail,
} from './dto/dashboard.dto';

type RangeBounds = {
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
};

type SessionInfo = {
    openingAmount: number;
    closingAmount: number | null;
    status: 'open' | 'closed';
};

type Attribution = {
    sessionId: string | null;
    employeeId: string;
    employeeName: string;
};

function startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function endOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function dayWindow(now: Date, windowDays: number, endOffsetDays: number): RangeBounds {
    const currentEnd = endOfUtcDay(addDays(now, -endOffsetDays));
    const currentStart = startOfUtcDay(addDays(currentEnd, -(windowDays - 1)));
    const previousEnd = endOfUtcDay(addDays(currentStart, -1));
    const previousStart = startOfUtcDay(addDays(previousEnd, -(windowDays - 1)));
    return { currentStart, currentEnd, previousStart, previousEnd };
}

function monthlyBounds(now: Date): RangeBounds {
    return {
        currentStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
        currentEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
        previousStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)),
        previousEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)),
    };
}

const DAY_WINDOW_CONFIG: Partial<Record<DashboardRange, { windowDays: number; endOffsetDays: number }>> = {
    [DashboardRange.TODAY]: { windowDays: 1, endOffsetDays: 0 },
    [DashboardRange.YESTERDAY]: { windowDays: 1, endOffsetDays: 1 },
    [DashboardRange.LAST_WEEK]: { windowDays: 7, endOffsetDays: 0 },
};

@Injectable()
export class DashboardService {
    constructor(private readonly em: EntityManager) { }

    async getDashboardStats(store: Store, employeeId: string, query: DashboardQueryDto): Promise<DashboardStats> {
        const customRange = this.parseAndValidateDateRange(query.from, query.to);

        if (query.range === DashboardRange.CUSTOM && !customRange) {
            throw new BadRequestException('"from" and "to" are required when range is "custom"');
        }

        const range = customRange ? DashboardRange.CUSTOM : (query.range ?? DashboardRange.TODAY);

        const { currentStart, currentEnd, previousStart, previousEnd } = customRange
            ? this.getCustomRangeBounds(customRange.from, customRange.to)
            : this.getEnumRangeBounds(range);

        const includeSessionInfo = range === DashboardRange.TODAY;

        const [currentSales, previousSales] = await Promise.all([
            this.em.find(Sale, { store, createdAt: { $gte: currentStart, $lte: currentEnd } }, { populate: ['items', 'items.product'], refresh: true }),
            this.em.find(Sale, { store, createdAt: { $gte: previousStart, $lte: previousEnd } }, { populate: ['items', 'items.product'], refresh: true }),
        ]);

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange = this.calcBoundedSignedPercentage(currentTotalSales, previousTotalSales);

        const [costPriceMap, cashierBreakdown] = await Promise.all([
            this.buildCostPriceMap(store, [...currentSales, ...previousSales]),
            this.getCashierBreakdown(store, currentSales, currentTotalSales, includeSessionInfo),
        ]);

        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);

        const profitTotal = Math.max(currentNetProfit, 0);
        const profitPercentageChange = this.calcBoundedSignedPercentage(currentNetProfit, previousNetProfit);

        const response: DashboardStats = {
            range,
            sales: { total: Math.round(currentTotalSales * 100) / 100, percentageChange: salesPercentageChange },
            profit: { total: Math.round(profitTotal * 100) / 100, percentageChange: profitPercentageChange },
            cashierBreakdown,
        };

        if (customRange) {
            response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };
        }

        if (includeSessionInfo) {
            const todayStart = startOfUtcDay(new Date());
            const todayEnd = endOfUtcDay(new Date());

            const [stockRecords, adminSessions] = await Promise.all([
                this.em.find(
                    StockQuantity,
                    { inventory: { store }, quantity: { $lte: 10 } },
                    { populate: ['product', 'inventory'], refresh: true },
                ),
                this.getAdminSessions(store, employeeId, todayStart, todayEnd),
            ]);

            const toStockSummary = (record: StockQuantity) => ({
                id: record.product.id,
                name: record.product.name ?? '',
                price: record.product.price ?? 0,
                quantity: record.quantity ?? 0,
                inventoryName: record.inventory.name ?? '',
            });

            response.lowStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) >= 1).map(toStockSummary);
            response.outOfStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) === 0).map(toStockSummary);
            response.adminSessions = adminSessions;
        }

        if (range === DashboardRange.LAST_WEEK) {
            response.dailyBreakdown = this.buildDailyBreakdown(currentSales, costPriceMap, currentStart, currentEnd);
        }

        return response;
    }

    private async getCashierBreakdown(
        store: Store,
        currentSales: Sale[],
        storeTotal: number,
        includeSessionInfo: boolean,
    ): Promise<CashierStats[]> {
        if (currentSales.length === 0) return [];

        const saleIds = currentSales.map((s) => s.id);

        const payments = await this.em.find(
            Payment,
            { sale: { id: { $in: saleIds } }, storeSession: { store } },
            { populate: ['sale', 'storeSession', 'storeSession.openedBy'], refresh: true },
        );

        const attributionBySaleId = new Map<string, Attribution>();
        for (const payment of payments) {
            if (!payment.sale) continue;
            const session = payment.storeSession;
            const employee = session?.openedBy;
            if (!session || !employee) continue;
            attributionBySaleId.set(payment.sale.id, {
                sessionId: session.id,
                employeeId: employee.id,
                employeeName: employee.name,
            });
        }

        type Bucket = { sessionId: string | null; employeeId: string; employeeName: string; sales: Sale[] };
        const buckets = new Map<string, Bucket>();

        for (const sale of currentSales) {
            const attr = attributionBySaleId.get(sale.id);
            if (!attr) continue;

            const bucketKey = includeSessionInfo ? `session:${attr.sessionId}` : `employee:${attr.employeeId}`;

            const existing = buckets.get(bucketKey);
            if (existing) existing.sales.push(sale);
            else buckets.set(bucketKey, {
                sessionId: attr.sessionId,
                employeeId: attr.employeeId,
                employeeName: attr.employeeName,
                sales: [sale],
            });
        }

        const sessionInfoById = new Map<string, SessionInfo>();
        if (includeSessionInfo) {
            const sessionIds = Array.from(buckets.values())
                .map((b) => b.sessionId)
                .filter((id): id is string => id !== null);

            if (sessionIds.length > 0) {
                const sessions = await this.em.find(
                    StoreSession,
                    { id: { $in: sessionIds }, store },
                    { refresh: true },
                );

                for (const session of sessions) {
                    const isClosed = session.closedAt != null;
                    sessionInfoById.set(session.id, {
                        openingAmount: session.openingAmount ?? 0,
                        closingAmount: isClosed ? (session.closingAmount ?? 0) : null,
                        status: isClosed ? 'closed' : 'open',
                    });
                }
            }
        }

        return Array.from(buckets.values())
            .map((bucket) => {
                const total = this.calcTotalSales(bucket.sales);
                const sessionInfo = bucket.sessionId ? sessionInfoById.get(bucket.sessionId) : undefined;

                return {
                    sessionId: bucket.sessionId,
                    employeeId: bucket.employeeId,
                    employeeName: bucket.employeeName,
                    totalSales: Math.round(total * 100) / 100,
                    percentage: storeTotal === 0 ? 0 : Math.round((total / storeTotal) * 10000) / 100,
                    openingAmount: sessionInfo?.openingAmount ?? 0,
                    closingAmount: sessionInfo?.closingAmount ?? null,
                    status: sessionInfo?.status ?? null,
                };
            })
            .sort((a, b) => b.totalSales - a.totalSales);
    }


    private async getAdminSessions(
        store: Store,
        employeeId: string,
        todayStart: Date,
        todayEnd: Date,
    ): Promise<SessionDetail[]> {
        if (!employeeId) return [];

        const sessions = await this.em.find(
            StoreSession,
            {
                store,
                openedBy: { id: employeeId },
                $or: [{ closedAt: null }, { closedAt: { $gte: todayStart, $lte: todayEnd } }],
            },
            { populate: ['cashMovements', 'payments', 'openedBy'], orderBy: { openedAt: 'DESC' }, refresh: true },
        );

        return sessions.map((session) => {
            const expectedAmount = this.calculateExpectedAmount(session);
            const isClosed = session.closedAt != null;

            return {
                sessionId: session.id,
                employeeId: session.openedBy?.id ?? '',
                employeeName: session.openedBy?.name ?? '',
                status: isClosed ? 'closed' : 'open',
                openingAmount: session.openingAmount ?? 0,
                closingAmount: isClosed ? (session.closingAmount ?? 0) : null,
                expectedAmount: Math.round(expectedAmount * 100) / 100,
                openedAt: session.openedAt,
                closedAt: session.closedAt ?? null,
            };
        });
    }


    private calculateExpectedAmount(session: StoreSession): number {
        const cashMovements = session.cashMovements.getItems();
        const cashIn = cashMovements
            .filter((cm) => cm.type === CashMovementType.CashIn)
            .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
        const cashOut = cashMovements
            .filter((cm) => cm.type === CashMovementType.CashOut)
            .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
        const salePayments = session.payments.getItems().reduce((sum, p) => sum + (p.amount ?? 0), 0);

        return (session.openingAmount ?? 0) + cashIn - cashOut + salePayments;
    }
    

    private getEnumRangeBounds(range: DashboardRange): RangeBounds {
        if (range === DashboardRange.MONTHLY) return monthlyBounds(new Date());

        const config = DAY_WINDOW_CONFIG[range] ?? DAY_WINDOW_CONFIG[DashboardRange.TODAY]!;
        return dayWindow(new Date(), config.windowDays, config.endOffsetDays);
    }


    private getCustomRangeBounds(from: Date, to: Date): RangeBounds {
        const currentStart = startOfUtcDay(from);
        const currentEnd = endOfUtcDay(to);
        const lengthMs = currentEnd.getTime() - currentStart.getTime();
        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - lengthMs);
        return { currentStart, currentEnd, previousStart, previousEnd };
    }


    private buildDailyBreakdown(sales: Sale[], costPriceMap: Map<string, number>, start: Date, end: Date): DailyStats[] {
        const salesByDay = new Map<string, Sale[]>();
        for (const sale of sales) {
            if (sale.createdAt === undefined) continue;
            const day = new Date(sale.createdAt).toISOString().split('T')[0];
            const bucket = salesByDay.get(day);
            if (bucket) bucket.push(sale);
            else salesByDay.set(day, [sale]);
        }

        const days: DailyStats[] = [];
        const cursor = startOfUtcDay(start);
        const endDay = endOfUtcDay(end);

        while (cursor.getTime() <= endDay.getTime()) {
            const dateStr = cursor.toISOString().split('T')[0];
            const daySales = salesByDay.get(dateStr) ?? [];
            const netProfit = this.calcTotalProfit(daySales, costPriceMap);

            days.push({
                date: dateStr,
                dayName: cursor.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
                sales: { total: Math.round(this.calcTotalSales(daySales) * 100) / 100 },
                profit: { total: Math.round(Math.max(netProfit, 0) * 100) / 100 },
            });

            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return days;
    }


    private calcTotalSales(sales: Sale[]): number {
        return sales.reduce(
            (sum, sale) => sum + sale.items.getItems().reduce((s, item) => s + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
            0,
        );
    }


    private async buildCostPriceMap(store: Store, sales: Sale[]): Promise<Map<string, number>> {
        const productIds = [...new Set(sales.flatMap((sale) => sale.items.getItems().map((item) => item.product.id)))];
        const costPriceMap = new Map<string, number>();

        if (productIds.length === 0) return costPriceMap;

        const latestPurchasedItems = await this.em.find(
            PurchasedItem,
            { product: { id: { $in: productIds } }, purchase: { store } },
            { orderBy: { createdAt: 'DESC' }, refresh: true },
        );

        for (const item of latestPurchasedItems) {
            if (!costPriceMap.has(item.product.id)) costPriceMap.set(item.product.id, item.unitPrice);
        }

        return costPriceMap;
    }


    private calcTotalProfit(sales: Sale[], costPriceMap: Map<string, number>): number {
        return sales.reduce(
            (sum, sale) =>
                sum +
                sale.items.getItems().reduce((s, item) => {
                    const costPrice = costPriceMap.get(item.product.id) ?? 0;
                    return s + ((item.unitPrice ?? 0) - costPrice) * (item.quantity ?? 0);
                }, 0),
            0,
        );
    }


    private calcBoundedSignedPercentage(current: number, previous: number): number {
        const denom = Math.abs(current) + Math.abs(previous);
        if (denom === 0) return 0;

        const shareMagnitude = (Math.abs(current) / denom) * 100;
        const signed = Math.sign(current) * shareMagnitude;

        return Math.round(signed * 100) / 100;
    }


    private parseAndValidateDateRange(from: string | undefined, to: string | undefined): { from: Date; to: Date } | null {
        if (from === undefined && to === undefined) return null;

        if (from === undefined || to === undefined) {
            throw new BadRequestException('Both "from" and "to" must be provided for a custom date range');
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            throw new BadRequestException('Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)');
        }
        if (fromDate > toDate) {
            throw new BadRequestException('"from" must be on or before "to"');
        }

        const oneYearMs = 365 * 24 * 60 * 60 * 1000;
        if (toDate.getTime() - fromDate.getTime() > oneYearMs) {
            throw new BadRequestException('Date range cannot exceed 1 year');
        }

        return { from: fromDate, to: toDate };
    }
}