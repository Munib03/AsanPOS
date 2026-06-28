import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { Store } from '../database/entites/store.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { CashMovementType } from '../shared/utils/cash-movement.enum';
import { DailyStats, DashboardQueryDto, DashboardRange, DashboardStats } from './dto/dashboard.dto';


type RangeBounds = {
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
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

const RANGE_STRATEGIES: Record<DashboardRange, (now: Date) => RangeBounds> = {
    [DashboardRange.TODAY]: (now) => ({
        currentStart: startOfUtcDay(now),
        currentEnd: endOfUtcDay(now),
        previousStart: startOfUtcDay(addDays(now, -1)),
        previousEnd: endOfUtcDay(addDays(now, -1)),
    }),

    [DashboardRange.YESTERDAY]: (now) => ({
        currentStart: startOfUtcDay(addDays(now, -1)),
        currentEnd: endOfUtcDay(addDays(now, -1)),
        previousStart: startOfUtcDay(addDays(now, -2)),
        previousEnd: endOfUtcDay(addDays(now, -2)),
    }),

    [DashboardRange.LAST_WEEK]: (now) => {
        const currentEnd = endOfUtcDay(now);
        const currentStart = startOfUtcDay(addDays(now, -6));
        const previousEnd = endOfUtcDay(addDays(currentStart, -1));
        const previousStart = startOfUtcDay(addDays(previousEnd, -6));
        return { currentStart, currentEnd, previousStart, previousEnd };
    },

    [DashboardRange.MONTHLY]: (now) => ({
        currentStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
        currentEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
        previousStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)),
        previousEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)),
    }),

    [DashboardRange.CUSTOM]: (now) => ({
        currentStart: startOfUtcDay(now),
        currentEnd: endOfUtcDay(now),
        previousStart: startOfUtcDay(addDays(now, -1)),
        previousEnd: endOfUtcDay(addDays(now, -1)),
    }),
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

        const [currentSales, previousSales] = await Promise.all([
            this.em.find(Sale, { store, createdAt: { $gte: currentStart, $lte: currentEnd } }, { populate: ['items', 'items.product'], refresh: true }),
            this.em.find(Sale, { store, createdAt: { $gte: previousStart, $lte: previousEnd } }, { populate: ['items', 'items.product'], refresh: true }),
        ]);

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange = this.calcBoundedSignedPercentage(currentTotalSales, previousTotalSales);

        const costPriceMap = await this.buildCostPriceMap(store, [...currentSales, ...previousSales]);
        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);

        const profitTotal = Math.max(currentNetProfit, 0);
        const profitPercentageChange = this.calcBoundedSignedPercentage(currentNetProfit, previousNetProfit);

        const response: DashboardStats = {
            range,
            sales: { total: Math.round(currentTotalSales * 100) / 100, percentageChange: salesPercentageChange },
            profit: { total: Math.round(profitTotal * 100) / 100, percentageChange: profitPercentageChange },
        };

        if (customRange) {
            response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };
        } else {
            const queries: Promise<any>[] = [
                this.em.find(StockQuantity, { inventory: { store }, quantity: { $gte: 1, $lte: 10 } }, { populate: ['product', 'inventory'], refresh: true }),
                this.em.find(StockQuantity, { inventory: { store }, quantity: 0 }, { populate: ['product', 'inventory'], refresh: true }),
            ];


            if (range === DashboardRange.TODAY) {
                queries.push(this.getSessionStats(store, employeeId));
            }

            const [lowStockRecords, outOfStockRecords, sessionStats] = await Promise.all(queries);

            response.lowStockProducts = lowStockRecords.map((record) => ({
                id: record.product.id,
                name: record.product.name ?? '',
                price: record.product.price ?? 0,
                quantity: record.quantity ?? 0,
                inventoryName: record.inventory.name ?? '',
            }));

            response.outOfStockProducts = outOfStockRecords.map((record) => ({
                id: record.product.id,
                name: record.product.name ?? '',
                price: record.product.price ?? 0,
                quantity: record.quantity ?? 0,
                inventoryName: record.inventory.name ?? '',
            }));

            if (sessionStats) {
                response.session = sessionStats;
            }
        }

        if (range === DashboardRange.LAST_WEEK) {
            response.dailyBreakdown = this.buildDailyBreakdown(currentSales, costPriceMap, currentStart, currentEnd);
        }

        return response;
    }


    private getEnumRangeBounds(range: DashboardRange): RangeBounds {
        const strategy = RANGE_STRATEGIES[range] ?? RANGE_STRATEGIES[DashboardRange.TODAY];
        return strategy(new Date());
    }


    private getCustomRangeBounds(from: Date, to: Date): RangeBounds {
        const currentStart = startOfUtcDay(from);
        const currentEnd = endOfUtcDay(to);
        const lengthMs = currentEnd.getTime() - currentStart.getTime();
        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - lengthMs);
        return { currentStart, currentEnd, previousStart, previousEnd };
    }


    private async getSessionStats(store: Store, employeeId: string): Promise<DashboardStats['session']> {
        const activeSession = await this.em.findOne(
            StoreSession,
            { store, openedBy: { id: employeeId }, closedAt: null },
            { populate: ['cashMovements', 'payments'], refresh: true },
        );

        if (activeSession) {
            const expectedAmount = this.calculateExpectedAmount(activeSession);
            return {
                status: 'open',
                openingAmount: activeSession.openingAmount ?? 0,
                expectedAmount: Math.round(expectedAmount * 100) / 100,
            };
        }

        const lastClosedSession = await this.em.findOne(
            StoreSession,
            { store, openedBy: { id: employeeId }, closedAt: { $ne: null } },
            { orderBy: { closedAt: 'DESC' }, refresh: true },
        );

        if (!lastClosedSession) return undefined;

        return {
            status: 'closed',
            closingAmount: lastClosedSession.closingAmount ?? 0,
            expectedAmount: lastClosedSession.expectedAmount ?? 0,
        };
    }


    private calculateExpectedAmount(session: StoreSession): number {
        const cashMovements = session.cashMovements.getItems();
        const cashIn = cashMovements.filter((cm) => cm.type === CashMovementType.CashIn).reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
        const cashOut = cashMovements.filter((cm) => cm.type === CashMovementType.CashOut).reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
        const salePayments = session.payments.getItems().reduce((sum, p) => sum + (p.amount ?? 0), 0);
        return (session.openingAmount ?? 0) + cashIn - cashOut + salePayments;
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
            (sum, sale) =>
                sum + sale.items.getItems().reduce((s, item) => s + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
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
}