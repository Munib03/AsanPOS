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

        const range = customRange ? DashboardRange.CUSTOM : (query.range ?? DashboardRange.TODAY);

        const { currentStart, currentEnd, previousStart, previousEnd } = customRange
            ? this.getCustomRangeBounds(customRange.from, customRange.to)
            : this.getEnumRangeBounds(range);

        const [currentSales, previousSales] = await Promise.all([
            this.em.find(Sale, { store, createdAt: { $gte: currentStart, $lte: currentEnd } }, { populate: ['items', 'items.product'] }),
            this.em.find(Sale, { store, createdAt: { $gte: previousStart, $lte: previousEnd } }, { populate: ['items', 'items.product'] }),
        ]);

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange =
            currentTotalSales + previousTotalSales === 0
                ? 0
                : (currentTotalSales / (currentTotalSales + previousTotalSales)) * 100;

        const costPriceMap = await this.buildCostPriceMap(store, [...currentSales, ...previousSales]);
        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);
        const { profit, loss } = this.calcProfitAndLoss(currentNetProfit, previousNetProfit);

        const [lowStockRecords, outOfStockRecords] = await Promise.all([
            this.em.find(StockQuantity, { inventory: { store }, quantity: { $gte: 1, $lte: 10 } }, { populate: ['product', 'inventory'] }),
            this.em.find(StockQuantity, { inventory: { store }, quantity: 0 }, { populate: ['product', 'inventory'] }),
        ]);

        const lowStockProducts = lowStockRecords.map((record) => ({
            id: record.product.id,
            name: record.product.name ?? '',
            price: record.product.price ?? 0,
            quantity: record.quantity ?? 0,
            inventoryName: record.inventory.name ?? '',
        }));

        const outOfStockProducts = outOfStockRecords.map((record) => ({
            id: record.product.id,
            name: record.product.name ?? '',
            price: record.product.price ?? 0,
            quantity: record.quantity ?? 0,
            inventoryName: record.inventory.name ?? '',
        }));

        let dailyBreakdown: DailyStats[] | undefined;
        if (range === DashboardRange.LAST_WEEK) {
            dailyBreakdown = await this.getDailyBreakdown(store, currentStart, currentEnd);
        }

        const response: DashboardStats = {
            range,
            sales: { total: currentTotalSales, percentageChange: Math.round(salesPercentageChange * 100) / 100 },
            profit,
            loss,
            lowStockProducts,
            outOfStockProducts,
        };

        if (customRange) {
            response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };
        }

        if (dailyBreakdown) {
            response.dailyBreakdown = dailyBreakdown;
        }

        return response;
    }

    private parseAndValidateDateRange(from: string | undefined, to: string | undefined): { from: Date; to: Date } | null {
        if (from === undefined && to === undefined) return null;

        if (from === undefined) {
            throw new BadRequestException('Both "from" and "to" must be provided for a custom date range');
        }
        if (to === undefined) {
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
            case DashboardRange.CUSTOM:
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

    private async getDailyBreakdown(store: Store, start: Date, end: Date): Promise<DailyStats[]> {
        const allSales = await this.em.find(Sale, { store, createdAt: { $gte: start, $lte: end } }, { populate: ['items', 'items.product'] });
        const costPriceMap = await this.buildCostPriceMap(store, allSales);

        const salesByDay = new Map<string, Sale[]>();
        for (const sale of allSales) {
            if (sale.createdAt === undefined) continue;
            const day = new Date(sale.createdAt).toISOString().split('T')[0];
            const bucket = salesByDay.get(day);
            if (bucket) {
                bucket.push(sale);
            } else {
                salesByDay.set(day, [sale]);
            }
        }

        const days: DailyStats[] = [];
        const cursor = new Date(start);
        cursor.setHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setHours(23, 59, 59, 999);

        while (cursor <= endDay) {
            const dateStr = cursor.toISOString().split('T')[0];
            const daySales = salesByDay.get(dateStr) ?? [];
            const netProfit = this.calcTotalProfit(daySales, costPriceMap);

            days.push({
                date: dateStr,
                dayName: cursor.toLocaleDateString('en-US', { weekday: 'long' }),
                sales: { total: this.calcTotalSales(daySales) },
                profit: { total: netProfit > 0 ? Math.round(netProfit * 100) / 100 : 0 },
                loss: { total: netProfit < 0 ? Math.round(Math.abs(netProfit) * 100) / 100 : 0 },
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

        const latestPurchasedItems = await this.em.find(PurchasedItem, { product: { id: { $in: productIds } }, purchase: { store } }, { orderBy: { createdAt: 'DESC' } });

        for (const item of latestPurchasedItems) {
            if (!costPriceMap.has(item.product.id)) {
                costPriceMap.set(item.product.id, item.unitPrice);
            }
        }

        return costPriceMap;
    }

    private calcTotalProfit(sales: Sale[], costPriceMap: Map<string, number>): number {
        return sales.reduce(
            (sum, sale) =>
                sum + sale.items.getItems().reduce((s, item) => {
                    const costPrice = costPriceMap.get(item.product.id) ?? 0;
                    return s + ((item.unitPrice ?? 0) - costPrice) * (item.quantity ?? 0);
                }, 0),
            0,
        );
    }

    private calcProfitAndLoss(currentNetProfit: number, previousNetProfit: number): { profit: { total: number; percentageChange: number }; loss: { total: number; percentageChange: number } } {
        const profitSum = currentNetProfit + previousNetProfit;
        const rawProfitPercentage = profitSum === 0 ? 0 : (currentNetProfit / profitSum) * 100;

        const profitPercentageChange =
            currentNetProfit === 0 ? 0 : currentNetProfit > 0 ? Math.abs(rawProfitPercentage) : -Math.abs(rawProfitPercentage);

        const profitTotal = currentNetProfit > 0 ? currentNetProfit : 0;
        const currentLoss = currentNetProfit < 0 ? Math.abs(currentNetProfit) : 0;
        const previousLoss = previousNetProfit < 0 ? Math.abs(previousNetProfit) : 0;
        const lossSum = currentLoss + previousLoss;
        const lossPercentageChange = lossSum === 0 ? 0 : (currentLoss / lossSum) * 100;

        return {
            profit: { total: Math.round(profitTotal * 100) / 100, percentageChange: Math.round(profitPercentageChange * 100) / 100 },
            loss: { total: Math.round(currentLoss * 100) / 100, percentageChange: Math.round(lossPercentageChange * 100) / 100 },
        };
    }
}