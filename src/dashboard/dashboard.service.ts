import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { Store } from '../database/entites/store.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Payment } from '../database/entites/payments.entity';
import { CashMovementType } from '../shared/utils/cash-movement.enum';
import { CashierStats, DailyStats, DashboardQueryDto, DashboardRange, DashboardStats } from './dto/dashboard.dto';
import { SaleItem } from '../database/entites/sale-item.entity';

type RangeBounds = { currentStart: Date; currentEnd: Date; previousStart: Date; previousEnd: Date };

const startOfUtcDay = (date: Date): Date => { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d; };
const endOfUtcDay = (date: Date): Date => { const d = new Date(date); d.setUTCHours(23, 59, 59, 999); return d; };
const addDays = (date: Date, days: number): Date => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; };
const toDay = (d: Date | string) => new Date(d).toISOString().split('T')[0];
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayWindow(now: Date, windowDays: number, endOffsetDays: number): RangeBounds {
    const currentEnd = endOfUtcDay(addDays(now, -endOffsetDays));
    const currentStart = startOfUtcDay(addDays(currentEnd, -(windowDays - 1)));
    const previousEnd = endOfUtcDay(addDays(currentStart, -1));
    const previousStart = startOfUtcDay(addDays(previousEnd, -(windowDays - 1)));
    return { currentStart, currentEnd, previousStart, previousEnd };
}

const DAY_WINDOW_CONFIG: Partial<Record<DashboardRange, { windowDays: number; endOffsetDays: number }>> = {
    [DashboardRange.TODAY]: { windowDays: 1, endOffsetDays: 0 },
    [DashboardRange.YESTERDAY]: { windowDays: 1, endOffsetDays: 1 },
    [DashboardRange.LAST_WEEK]: { windowDays: 7, endOffsetDays: 0 },
    [DashboardRange.MONTHLY]: { windowDays: 30, endOffsetDays: 0 },
};

@Injectable()
export class DashboardService {
    private static readonly TAX_RATE = 0.10;

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

        const includeCashierBreakdown = range === DashboardRange.TODAY;
        const includeSessionInfo = range === DashboardRange.TODAY;
        const includeDailyBreakdown =
            range === DashboardRange.LAST_WEEK || range === DashboardRange.MONTHLY || range === DashboardRange.CUSTOM;

        const findSales = (gte: Date, lte: Date) =>
            this.em.find(Sale, { store, createdAt: { $gte: gte, $lte: lte } }, { populate: ['items', 'items.product'], refresh: true });

        const currentSales = await findSales(currentStart, currentEnd);
        const previousSales = await findSales(previousStart, previousEnd);

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange = this.calcBoundedSignedPercentage(currentTotalSales, previousTotalSales);

        const productIds = [...new Set(
            [...currentSales, ...previousSales].flatMap((s) => s.items.getItems().map((i) => i.product.id)),
        )];
        const costPriceMap = await this.buildSaleItemCostMap(store, productIds, currentEnd);

        const cashierBreakdown = includeCashierBreakdown
            ? await this.getCashierBreakdown(store, currentStart, currentEnd)
            : [];

        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);
        const profitPercentageChange = this.calcBoundedSignedPercentage(currentNetProfit, previousNetProfit);

        const response: DashboardStats = {
            range,
            sales: { total: round2(currentTotalSales), percentageChange: salesPercentageChange },
            profit: { total: round2(currentNetProfit), percentageChange: profitPercentageChange },
        };

        if (includeCashierBreakdown) response.cashierBreakdown = cashierBreakdown;
        if (customRange) response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };

        if (includeSessionInfo) {
            const stockRecords = await this.em.find(
                StockQuantity,
                { inventory: { store }, quantity: { $lte: 10 } },
                { populate: ['product', 'inventory'], refresh: true },
            );
            response.lowStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) >= 1).map(this.toStockSummary);
            response.outOfStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) === 0).map(this.toStockSummary);
        }

        if (includeDailyBreakdown) {
            response.dailyBreakdown = await this.buildDailyBreakdown(store, currentSales, costPriceMap, currentStart, currentEnd);
        }

        return response;
    }


    private toStockSummary = (record: StockQuantity) => ({
        id: record.product.id,
        name: record.product.name ?? '',
        price: record.product.price ?? 0,
        quantity: record.quantity ?? 0,
        inventoryName: record.inventory.name ?? '',
    });


    private sumCashMovements(
        cashMovements: { type: string; amount?: number; createdAt?: Date }[],
        type: CashMovementType,
        from?: Date,
        to?: Date,
    ): number {
        return cashMovements
            .filter((cm) => {
                if (cm.type !== type) return false;
                if (!from || !to || !cm.createdAt) return true;
                return cm.createdAt >= from && cm.createdAt <= to;
            })
            .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
    }


    private async getCashierBreakdown(store: Store, currentStart: Date, currentEnd: Date): Promise<CashierStats[]> {
        const sessions = await this.em.find(
            StoreSession,
            {
                store,
                $or: [
                    { closedAt: null },
                    { openedAt: { $gte: currentStart, $lte: currentEnd } },
                    { closedAt: { $gte: currentStart, $lte: currentEnd } },
                ],
            },
            { populate: ['cashMovements', 'openedBy'], refresh: true, orderBy: { openedAt: 'ASC' } },
        );
        if (sessions.length === 0) return [];

        const sales = await this.em.find(Sale, { store, createdAt: { $gte: currentStart, $lte: currentEnd } }, { populate: ['items'], refresh: true });
        const saleIds = sales.map((s) => s.id);
        const payments = saleIds.length
            ? await this.em.find(Payment, { sale: { id: { $in: saleIds } }, storeSession: { store } }, { populate: ['sale', 'storeSession'], refresh: true })
            : [];

        const saleById = new Map(sales.map((s) => [s.id, s]));
        const salesBySessionId = new Map<string, Sale[]>();
        for (const payment of payments) {
            if (!payment.sale || !payment.storeSession)
                continue;

            const sale = saleById.get(payment.sale.id);
            if (!sale)
                continue;

            const bucket = salesBySessionId.get(payment.storeSession.id);
            if (bucket)
                bucket.push(sale);
            else
                salesBySessionId.set(payment.storeSession.id, [sale]);
        }

        return sessions
            .filter((session) => session.openedBy != null)
            .map((session) => {
                const employee = session.openedBy!;
                const cashMovements = session.cashMovements.getItems();
                const sessionSales = salesBySessionId.get(session.id) ?? [];

                return {
                    sessionId: session.id,
                    employeeId: employee.id,
                    employeeName: employee.name ?? '',
                    totalSales: round2(this.calcTotalSales(sessionSales)),
                    openingAmount: round2(session.openingAmount ?? 0),
                    closingAmount: session.closedAt != null ? round2(session.closingAmount ?? 0) : null,
                    status: session.closedAt != null ? ('closed' as const) : ('open' as const),
                    cashIn: round2(this.sumCashMovements(cashMovements, CashMovementType.CashIn, currentStart, currentEnd)),
                    cashOut: round2(this.sumCashMovements(cashMovements, CashMovementType.CashOut, currentStart, currentEnd)),
                };
            })
            .sort((a, b) => b.totalSales - a.totalSales);
    }


    private getEnumRangeBounds(range: DashboardRange): RangeBounds {
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


    private async buildDailyBreakdown(
        store: Store,
        sales: Sale[],
        costPriceMap: Map<string, number>,
        start: Date,
        end: Date,
    ): Promise<DailyStats[]> {
        const salesByDay = new Map<string, Sale[]>();
        for (const sale of sales) {
            if (!sale.createdAt)
                continue;

            const day = toDay(sale.createdAt);
            const bucket = salesByDay.get(day);
            if (bucket)
                bucket.push(sale);
            else
                salesByDay.set(day, [sale]);
        }

        const sessions = await this.em.find(
            StoreSession,
            { store, $or: [{ openedAt: { $gte: start, $lte: end } }, { closedAt: { $gte: start, $lte: end } }] },
            { populate: ['cashMovements'], refresh: true },
        );

        const startDay = toDay(start);
        const endDay = toDay(end);
        type DayBucket = { opened: number; closed: number; cashIn: number; cashOut: number };
        const sessionsByDay = new Map<string, DayBucket>();

        const bump = (date: Date | string | null | undefined, key: keyof DayBucket, value: number) => {
            if (!date)
                return;

            const d = toDay(date);
            if (d < startDay || d > endDay)
                return;

            const bucket = sessionsByDay.get(d) ?? { opened: 0, closed: 0, cashIn: 0, cashOut: 0 };
            bucket[key] += value;
            sessionsByDay.set(d, bucket);
        };

        for (const session of sessions) {
            if (session.openedAt) bump(session.openedAt, 'opened', 1);
            if (session.closedAt) bump(session.closedAt, 'closed', 1);
            for (const cm of session.cashMovements.getItems()) {
                if (cm.type === CashMovementType.CashIn) bump(cm.createdAt, 'cashIn', cm.amount ?? 0);
                if (cm.type === CashMovementType.CashOut) bump(cm.createdAt, 'cashOut', cm.amount ?? 0);
            }
        }

        const days: DailyStats[] = [];
        const cursor = startOfUtcDay(start);
        const endCursor = endOfUtcDay(end);

        while (cursor.getTime() <= endCursor.getTime()) {
            const dateStr = toDay(cursor);
            const daySales = salesByDay.get(dateStr) ?? [];
            const sessionInfo = sessionsByDay.get(dateStr) ?? { opened: 0, closed: 0, cashIn: 0, cashOut: 0 };

            days.push({
                date: dateStr,
                dayName: cursor.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
                sales: { total: round2(this.calcTotalSales(daySales)) },
                profit: { total: round2(this.calcTotalProfit(daySales, costPriceMap)) },
                sessionsOpened: sessionInfo.opened,
                sessionsClosed: sessionInfo.closed,
                cashIn: round2(sessionInfo.cashIn),
                cashOut: round2(sessionInfo.cashOut),
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


    private async buildSaleItemCostMap(store: Store, productIds: string[], upTo: Date): Promise<Map<string, number>> {
        const costBySaleItemId = new Map<string, number>();
        if (productIds.length === 0) return costBySaleItemId;

        const purchasedItems = await this.em.find(
            PurchasedItem,
            { product: { id: { $in: productIds } }, purchase: { store } },
            { orderBy: { createdAt: 'ASC' }, refresh: true },
        );

        const batchesByProduct = new Map<string, { remaining: number; unitPrice: number }[]>();
        for (const pi of purchasedItems) {
            const list = batchesByProduct.get(pi.product.id) ?? [];
            list.push({ remaining: pi.quantity, unitPrice: pi.unitPrice });
            batchesByProduct.set(pi.product.id, list);
        }

        const saleItems = await this.em.find(
            SaleItem,
            { product: { id: { $in: productIds } }, sale: { store, createdAt: { $lte: upTo } } },
            { populate: ['sale', 'product'], orderBy: { sale: { createdAt: 'ASC' } }, refresh: true },
        );

        for (const item of saleItems) {
            const batches = batchesByProduct.get(item.product.id) ?? [];
            let qtyToConsume = item.quantity ?? 0;
            let totalCost = 0;

            for (const batch of batches) {
                if (qtyToConsume <= 0) break;
                if (batch.remaining <= 0) continue;
                const take = Math.min(batch.remaining, qtyToConsume);
                totalCost += take * batch.unitPrice;
                batch.remaining -= take;
                qtyToConsume -= take;
            }

            const consumedQty = (item.quantity ?? 0) - qtyToConsume;

            if (consumedQty > 0 && qtyToConsume === 0) {
                costBySaleItemId.set(item.id, totalCost / consumedQty);
            }
        }

        return costBySaleItemId;
    }


    private calcTotalProfit(sales: Sale[], costBySaleItemId: Map<string, number>): number {
        let hasMissingCost = false;

        const profit = sales.reduce(
            (sum, sale) =>
                sum +
                sale.items.getItems().reduce((s, item) => {
                    const basePrice = (item.unitPrice ?? 0) / (1 + DashboardService.TAX_RATE);
                    const costPrice = costBySaleItemId.get(item.id);

                    if (costPrice === undefined) {
                        hasMissingCost = true;
                        return s;
                    }

                    return s + (basePrice - costPrice) * (item.quantity ?? 0);
                }, 0),
            0,
        );

        if (hasMissingCost) {
            console.warn('[profit] some sale items had no cost history — check for missing/orphaned purchase data');
        }

        return profit;
    }


    private calcBoundedSignedPercentage(current: number, previous: number): number {
        const denom = Math.abs(current) + Math.abs(previous);
        if (denom === 0)
            return 0;

        const shareMagnitude = (Math.abs(current) / denom) * 100;

        return round2(Math.sign(current) * shareMagnitude);
    }


    private parseAndValidateDateRange(from: string | undefined, to: string | undefined): { from: Date; to: Date } | null {
        if (from === undefined && to === undefined)
            return null;

        if (from === undefined || to === undefined)
            throw new BadRequestException('Both "from" and "to" must be provided for a custom date range');


        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
            throw new BadRequestException('Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)');

        if (fromDate > toDate)
            throw new BadRequestException('"from" must be on or before "to"');

        const oneYearMs = 365 * 24 * 60 * 60 * 1000;
        if (toDate.getTime() - fromDate.getTime() > oneYearMs)
            throw new BadRequestException('Date range cannot exceed 1 year');


        return { from: fromDate, to: toDate };
    }
}