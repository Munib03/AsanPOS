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
} from './dto/dashboard.dto';

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
            range === DashboardRange.LAST_WEEK ||
            range === DashboardRange.MONTHLY ||
            range === DashboardRange.CUSTOM;

        const currentSales = await this.em.find(
            Sale,
            { store, createdAt: { $gte: currentStart, $lte: currentEnd } },
            { populate: ['items', 'items.product'], refresh: true },
        );
        const previousSales = await this.em.find(
            Sale,
            { store, createdAt: { $gte: previousStart, $lte: previousEnd } },
            { populate: ['items', 'items.product'], refresh: true },
        );

        const currentTotalSales = this.calcTotalSales(currentSales);
        const previousTotalSales = this.calcTotalSales(previousSales);
        const salesPercentageChange = this.calcBoundedSignedPercentage(currentTotalSales, previousTotalSales);

        const costPriceMap = await this.buildCostPriceMap(store, [...currentSales, ...previousSales]);

        const cashierBreakdown = includeCashierBreakdown
            ? await this.getCashierBreakdown(store, currentStart, currentEnd)
            : ([] as CashierStats[]);

        const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
        const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);

        const profitTotal = currentNetProfit;
        const profitPercentageChange = this.calcBoundedSignedPercentage(currentNetProfit, previousNetProfit);

        const response: DashboardStats = {
            range,
            sales: { total: Math.round(currentTotalSales * 100) / 100, percentageChange: salesPercentageChange },
            profit: {
                total: Math.round(profitTotal * 100) / 100,
                percentageChange: profitPercentageChange,
            },
        };

        if (includeCashierBreakdown) {
            response.cashierBreakdown = cashierBreakdown;
        }

        if (customRange) {
            response.customRange = { from: currentStart.toISOString(), to: currentEnd.toISOString() };
        }

        if (includeSessionInfo) {
            const stockRecords = await this.em.find(
                StockQuantity,
                { inventory: { store }, quantity: { $lte: 10 } },
                { populate: ['product', 'inventory'], refresh: true },
            );

            const toStockSummary = (record: StockQuantity) => ({
                id: record.product.id,
                name: record.product.name ?? '',
                price: record.product.price ?? 0,
                quantity: record.quantity ?? 0,
                inventoryName: record.inventory.name ?? '',
            });

            response.lowStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) >= 1).map(toStockSummary);
            response.outOfStockProducts = stockRecords.filter((r) => (r.quantity ?? 0) === 0).map(toStockSummary);
        }

        if (includeDailyBreakdown) {
            response.dailyBreakdown = await this.buildDailyBreakdown(
                store,
                currentSales,
                costPriceMap,
                currentStart,
                currentEnd,
            );
        }

        return response;
    }

    /**
     * PER-SESSION breakdown. The previous version aggregated everything by
     * employee.id, so a freshly-opened session with zero sales got glued to
     * the old closed session's row and looked like nothing changed.
     *
     * Now each session produces its own row, with openingAmount / cashIn /
     * cashOut read directly from StoreSession + CashMovement — independent
     * of whether any sale has been recorded.
     */
    private async getCashierBreakdown(
        store: Store,
        currentStart: Date,
        currentEnd: Date,
    ): Promise<CashierStats[]> {
        // 1. Fetch every session that touches today: still open, opened today, or closed today.
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

        // Safety net — force-load the collections so .getItems() is never empty.
        await this.em.populate(sessions, ['cashMovements', 'openedBy'], { refresh: true });

        if (sessions.length === 0) return [];

        // 2. Fetch today's sales and link them to sessions via Payment.
        const sales = await this.em.find(
            Sale,
            { store, createdAt: { $gte: currentStart, $lte: currentEnd } },
            { populate: ['items'], refresh: true },
        );

        const saleIds = sales.map((s) => s.id);

        const payments = saleIds.length
            ? await this.em.find(
                Payment,
                { sale: { id: { $in: saleIds } }, storeSession: { store } },
                { populate: ['sale', 'storeSession'], refresh: true },
            )
            : [];

        const saleById = new Map(sales.map((s) => [s.id, s]));
        const salesBySessionId = new Map<string, Sale[]>();
        for (const payment of payments) {
            if (!payment.sale || !payment.storeSession) continue;
            const sale = saleById.get(payment.sale.id);
            if (!sale) continue;

            const bucket = salesBySessionId.get(payment.storeSession.id);
            if (bucket) bucket.push(sale);
            else salesBySessionId.set(payment.storeSession.id, [sale]);
        }

        // 3. Build ONE entry per session.
        const breakdown: CashierStats[] = sessions
            .filter((session) => session.openedBy != null)
            .map((session) => {
                const employee = session.openedBy!;

                const cashMovements = session.cashMovements.getItems();
                const cashIn = cashMovements
                    .filter((cm) => {
                        if (cm.type !== CashMovementType.CashIn) return false;
                        const ts = cm.createdAt;
                        if (!ts) return true;
                        return ts >= currentStart && ts <= currentEnd;
                    })
                    .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
                const cashOut = cashMovements
                    .filter((cm) => {
                        if (cm.type !== CashMovementType.CashOut) return false;
                        const ts = cm.createdAt;
                        if (!ts) return true;
                        return ts >= currentStart && ts <= currentEnd;
                    })
                    .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);

                const sessionSales = salesBySessionId.get(session.id) ?? [];
                const totalSales = this.calcTotalSales(sessionSales);

                return {
                    sessionId: session.id,
                    employeeId: employee.id,
                    employeeName: employee.name ?? '',
                    totalSales: Math.round(totalSales * 100) / 100,
                    openingAmount: Math.round((session.openingAmount ?? 0) * 100) / 100,
                    closingAmount:
                        session.closedAt != null
                            ? Math.round((session.closingAmount ?? 0) * 100) / 100
                            : null,
                    status: session.closedAt != null ? ('closed' as const) : ('open' as const),
                    cashIn: Math.round(cashIn * 100) / 100,
                    cashOut: Math.round(cashOut * 100) / 100,
                };
            });

        return breakdown.sort((a, b) => b.totalSales - a.totalSales);
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

    /**
     * Now also reflects session lifecycle activity per day — opens, closes,
     * cash-in, cash-out — so dashboard updates the moment those events
     * happen, not only when a sale is recorded.
     */
    private async buildDailyBreakdown(
        store: Store,
        sales: Sale[],
        costPriceMap: Map<string, number>,
        start: Date,
        end: Date,
    ): Promise<DailyStats[]> {
        const salesByDay = new Map<string, Sale[]>();
        for (const sale of sales) {
            if (sale.createdAt === undefined) continue;
            const day = new Date(sale.createdAt).toISOString().split('T')[0];
            const bucket = salesByDay.get(day);
            if (bucket) bucket.push(sale);
            else salesByDay.set(day, [sale]);
        }

        const sessions = await this.em.find(
            StoreSession,
            {
                store,
                $or: [
                    { openedAt: { $gte: start, $lte: end } },
                    { closedAt: { $gte: start, $lte: end } },
                ],
            },
            { populate: ['cashMovements'], refresh: true },
        );
        await this.em.populate(sessions, ['cashMovements'], { refresh: true });

        const startDay = new Date(start).toISOString().split('T')[0];
        const endDay = new Date(end).toISOString().split('T')[0];

        type DayBucket = { opened: number; closed: number; cashIn: number; cashOut: number };
        const sessionsByDay = new Map<string, DayBucket>();

        const bump = (
            date: Date | string | null | undefined,
            key: keyof DayBucket,
            value: number,
        ) => {
            if (!date) return;
            const d = new Date(date).toISOString().split('T')[0];
            if (d < startDay || d > endDay) return;
            const bucket = sessionsByDay.get(d) ?? { opened: 0, closed: 0, cashIn: 0, cashOut: 0 };
            bucket[key] = (bucket[key] ?? 0) + value;
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
            const dateStr = cursor.toISOString().split('T')[0];
            const daySales = salesByDay.get(dateStr) ?? [];
            const netProfit = this.calcTotalProfit(daySales, costPriceMap);
            const sessionInfo = sessionsByDay.get(dateStr) ?? { opened: 0, closed: 0, cashIn: 0, cashOut: 0 };

            days.push({
                date: dateStr,
                dayName: cursor.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
                sales: { total: Math.round(this.calcTotalSales(daySales) * 100) / 100 },
                profit: { total: Math.round(netProfit * 100) / 100 },
                sessionsOpened: sessionInfo.opened,
                sessionsClosed: sessionInfo.closed,
                cashIn: Math.round(sessionInfo.cashIn * 100) / 100,
                cashOut: Math.round(sessionInfo.cashOut * 100) / 100,
            });

            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return days;
    }

    private calcTotalSales(sales: Sale[]): number {
        return sales.reduce(
            (sum, sale) =>
                sum +
                sale.items
                    .getItems()
                    .reduce((s, item) => s + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
            0,
        );
    }

    private async buildCostPriceMap(store: Store, sales: Sale[]): Promise<Map<string, number>> {
        const productIds = [
            ...new Set(sales.flatMap((sale) => sale.items.getItems().map((item) => item.product.id))),
        ];
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
            throw new BadRequestException(
                'Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
            );
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