import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { Store } from '../database/entites/store.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { DailyStats, DashboardQueryDto, DashboardRange, DashboardStats } from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
    constructor(private readonly em: EntityManager) { }

    async getDashboardStats(store: Store, query: DashboardQueryDto): Promise<DashboardStats> {
        const customRange = this.parseAndValidateDateRange(query.from, query.to);

        if (query.range === DashboardRange.CUSTOM && !customRange) {
            throw new BadRequestException('"from" and "to" are required when range is "custom"');
        }

        const range = customRange ? DashboardRange.CUSTOM : (query.range ?? DashboardRange.TODAY);

        const { currentStart, currentEnd, previousStart, previousEnd } = customRange
            ? this.getCustomRangeBounds(customRange.from, customRange.to)
            : this.getEnumRangeBounds(range);

        const [currentSales, previousSales] = await Promise.all([
            this.em.find(
                Sale,
                { store, createdAt: { $gte: currentStart, $lte: currentEnd } },
                { populate: ['items', 'items.product'] },
            ),
            this.em.find(
                Sale,
                { store, createdAt: { $gte: previousStart, $lte: previousEnd } },
                { populate: ['items', 'items.product'] },
            ),
        ]);

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange = this.calcSignedPercentageChange(currentTotalSales, previousTotalSales);

        const costPriceMap = await this.buildCostPriceMap(store, [...currentSales, ...previousSales]);
        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);
        const profitPercentageChange = this.calcSignedPercentageChange(currentNetProfit, previousNetProfit);

        const response: DashboardStats = {
            range,
            sales: {
                total: Math.round(currentTotalSales * 100) / 100,
                percentageChange: salesPercentageChange,
            },
            profit: {
                total: Math.round(currentNetProfit * 100) / 100,
                percentageChange: profitPercentageChange,
            },
        };

        if (customRange) {
            response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };
        } else {
            const [lowStockRecords, outOfStockRecords] = await Promise.all([
                this.em.find(
                    StockQuantity,
                    { inventory: { store }, quantity: { $gte: 1, $lte: 10 } },
                    { populate: ['product', 'inventory'] },
                ),
                this.em.find(
                    StockQuantity,
                    { inventory: { store }, quantity: 0 },
                    { populate: ['product', 'inventory'] },
                ),
            ]);

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
        }

        if (range === DashboardRange.LAST_WEEK) {
            response.dailyBreakdown = this.buildDailyBreakdown(currentSales, costPriceMap, currentStart, currentEnd);
        }

        return response;
    }

    private parseAndValidateDateRange(
        from: string | undefined,
        to: string | undefined,
    ): { from: Date; to: Date } | null {
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

    private getCustomRangeBounds(from: Date, to: Date) {
        const currentStart = new Date(from);
        currentStart.setHours(0, 0, 0, 0);

        const currentEnd = new Date(to);
        currentEnd.setHours(23, 59, 59, 999);

        const lengthMs = currentEnd.getTime() - currentStart.getTime();
        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - lengthMs);

        return { currentStart, currentEnd, previousStart, previousEnd };
    }

    private getEnumRangeBounds(range: DashboardRange) {
        const now = new Date();

        switch (range) {
            case DashboardRange.YESTERDAY: {
                const currentStart = new Date(now);
                currentStart.setDate(now.getDate() - 1);
                currentStart.setHours(0, 0, 0, 0);
                const currentEnd = new Date(now);
                currentEnd.setDate(now.getDate() - 1);
                currentEnd.setHours(23, 59, 59, 999);

                const previousStart = new Date(now);
                previousStart.setDate(now.getDate() - 2);
                previousStart.setHours(0, 0, 0, 0);
                const previousEnd = new Date(now);
                previousEnd.setDate(now.getDate() - 2);
                previousEnd.setHours(23, 59, 59, 999);

                return { currentStart, currentEnd, previousStart, previousEnd };
            }

            case DashboardRange.LAST_WEEK: {
                const currentEnd = new Date(now);
                currentEnd.setHours(23, 59, 59, 999);
                const currentStart = new Date(now);
                currentStart.setDate(now.getDate() - 6);
                currentStart.setHours(0, 0, 0, 0);

                const previousEnd = new Date(currentStart);
                previousEnd.setDate(currentStart.getDate() - 1);
                previousEnd.setHours(23, 59, 59, 999);
                const previousStart = new Date(previousEnd);
                previousStart.setDate(previousEnd.getDate() - 6);
                previousStart.setHours(0, 0, 0, 0);

                return { currentStart, currentEnd, previousStart, previousEnd };
            }

            case DashboardRange.MONTHLY: {
                const currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
                const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

                return { currentStart, currentEnd, previousStart, previousEnd };
            }

            case DashboardRange.TODAY:
            default: {
                const currentStart = new Date(now);
                currentStart.setHours(0, 0, 0, 0);
                const currentEnd = new Date(now);
                currentEnd.setHours(23, 59, 59, 999);

                const previousStart = new Date(now);
                previousStart.setDate(now.getDate() - 1);
                previousStart.setHours(0, 0, 0, 0);
                const previousEnd = new Date(now);
                previousEnd.setDate(now.getDate() - 1);
                previousEnd.setHours(23, 59, 59, 999);

                return { currentStart, currentEnd, previousStart, previousEnd };
            }
        }
    }

    private buildDailyBreakdown(
        sales: Sale[],
        costPriceMap: Map<string, number>,
        start: Date,
        end: Date,
    ): DailyStats[] {
        const salesByDay = new Map<string, Sale[]>();
        for (const sale of sales) {
            if (sale.createdAt === undefined) continue;
            const day = new Date(sale.createdAt).toISOString().split('T')[0];
            const bucket = salesByDay.get(day);
            if (bucket) bucket.push(sale);
            else salesByDay.set(day, [sale]);
        }

        const days: DailyStats[] = [];
        const cursor = new Date(start);
        cursor.setHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setHours(23, 59, 59, 999);

        while (cursor.getTime() <= endDay.getTime()) {
            const dateStr = cursor.toISOString().split('T')[0];
            const daySales = salesByDay.get(dateStr) ?? [];
            const netProfit = this.calcTotalProfit(daySales, costPriceMap);

            days.push({
                date: dateStr,
                dayName: cursor.toLocaleDateString('en-US', { weekday: 'long' }),
                sales: { total: Math.round(this.calcTotalSales(daySales) * 100) / 100 },
                profit: { total: Math.round(netProfit * 100) / 100 },
            });

            cursor.setDate(cursor.getDate() + 1);
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
            { orderBy: { createdAt: 'DESC' } },
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


    private calcSignedPercentageChange(current: number, previous: number): number {
        if (previous === 0) {
            if (current === 0) return 0;
            return current > 0 ? 100 : -100;
        }

        const change = ((current - previous) / Math.abs(previous)) * 100;
        return Math.round(change * 100) / 100;
    }
}