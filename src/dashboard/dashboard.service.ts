import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Store } from '../database/entites/store.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { CashMovementType } from '../shared/utils/cash-movement.enum';
import {
  CashierStats,
  DailyStats,
  DashboardQueryDto,
  DashboardRange,
  DashboardStats,
} from './dto/dashboard.dto';
import { getEmployeeFullName } from '../shared/utils/employee-name.util';

type RangeBounds = {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
};

type DashboardSaleItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
};

type DashboardSale = {
  id: string;
  createdAt?: Date;
  items: DashboardSaleItem[];
};

type DashboardSaleRow = {
  saleId: string;
  createdAt: Date | string | null;
  itemId: string | null;
  productId: string | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
};

type PaymentSessionRow = {
  saleId: string;
  sessionId: string;
};

type PurchaseBatchRow = {
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
};

type HistoricalSaleItemRow = {
  id: string;
  productId: string;
  quantity: string | number;
};

type StockSummaryRecord = {
  quantity?: number;
  product: {
    id: string;
    name?: string;
    price?: number;
  };
  inventory: {
    name: string;
  };
};

const startOfUtcDay = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const endOfUtcDay = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};
const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};
const toDay = (d: Date | string) => new Date(d).toISOString().split('T')[0];
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayWindow(
  now: Date,
  windowDays: number,
  endOffsetDays: number,
): RangeBounds {
  const currentEnd = endOfUtcDay(addDays(now, -endOffsetDays));
  const currentStart = startOfUtcDay(addDays(currentEnd, -(windowDays - 1)));
  const previousEnd = endOfUtcDay(addDays(currentStart, -1));
  const previousStart = startOfUtcDay(addDays(previousEnd, -(windowDays - 1)));
  return { currentStart, currentEnd, previousStart, previousEnd };
}

const DAY_WINDOW_CONFIG: Partial<
  Record<DashboardRange, { windowDays: number; endOffsetDays: number }>
> = {
  [DashboardRange.TODAY]: { windowDays: 1, endOffsetDays: 0 },
  [DashboardRange.YESTERDAY]: { windowDays: 1, endOffsetDays: 1 },
  [DashboardRange.LAST_WEEK]: { windowDays: 7, endOffsetDays: 0 },
  [DashboardRange.MONTHLY]: { windowDays: 30, endOffsetDays: 0 },
};

@Injectable()
export class DashboardService {
  private static readonly TAX_RATE = 0.1;
  private static readonly DEFAULT_STOCK_PAGE = 1;
  private static readonly DEFAULT_STOCK_PAGE_SIZE = 20;
  private static readonly MAX_STOCK_PAGE_SIZE = 100;

  constructor(private readonly em: EntityManager) {}

  async getDashboardStats(
    store: Store,
    employeeId: string,
    query: DashboardQueryDto,
  ): Promise<DashboardStats> {
    const customRange = this.parseAndValidateDateRange(query.from, query.to);
    if (query.range === DashboardRange.CUSTOM && !customRange) {
      throw new BadRequestException(
        '"from" and "to" are required when range is "custom"',
      );
    }

    const range = customRange
      ? DashboardRange.CUSTOM
      : (query.range ?? DashboardRange.TODAY);
    const { currentStart, currentEnd, previousStart, previousEnd } = customRange
      ? this.getCustomRangeBounds(customRange.from, customRange.to)
      : this.getEnumRangeBounds(range);

    const includeCashierBreakdown = range === DashboardRange.TODAY;
    const includeSessionInfo = range === DashboardRange.TODAY;
    const includeDailyBreakdown =
      range === DashboardRange.LAST_WEEK ||
      range === DashboardRange.MONTHLY ||
      range === DashboardRange.CUSTOM;

    const [currentSales, previousSales] = await Promise.all([
      this.findDashboardSales(store.id, currentStart, currentEnd),
      this.findDashboardSales(store.id, previousStart, previousEnd),
    ]);

    const currentTotalSales = this.calcTotalSales(currentSales);
    const previousTotalSales = this.calcTotalSales(previousSales);
    const salesPercentageChange = this.calcBoundedSignedPercentage(
      currentTotalSales,
      previousTotalSales,
    );

    const productIds = [
      ...new Set(
        [...currentSales, ...previousSales].flatMap((s) =>
          s.items.map((i) => i.productId),
        ),
      ),
    ];
    const [costPriceMap, cashierBreakdown] = await Promise.all([
      this.buildSaleItemCostMap(store, productIds, currentEnd),
      includeCashierBreakdown
        ? this.getCashierBreakdown(
            store,
            currentStart,
            currentEnd,
            currentSales,
          )
        : Promise.resolve([]),
    ]);

    const currentNetProfit = this.calcTotalProfit(currentSales, costPriceMap);
    const previousNetProfit = this.calcTotalProfit(previousSales, costPriceMap);
    const profitPercentageChange = this.calcBoundedSignedPercentage(
      currentNetProfit,
      previousNetProfit,
    );

    const response: DashboardStats = {
      range,
      sales: {
        total: round2(currentTotalSales),
        percentageChange: salesPercentageChange,
      },
      profit: {
        total: round2(currentNetProfit),
        percentageChange: profitPercentageChange,
      },
    };

    if (includeCashierBreakdown) response.cashierBreakdown = cashierBreakdown;
    if (customRange)
      response.customRange = {
        from: currentStart.toISOString(),
        to: currentEnd.toISOString(),
      };

    if (includeSessionInfo) {
      const lowStockPage = this.getPage(query.lowStockPage);
      const lowStockPageSize = this.getPageSize(query.lowStockPageSize);
      const outOfStockPage = this.getPage(query.outOfStockPage);
      const outOfStockPageSize = this.getPageSize(query.outOfStockPageSize);

      const lowStockBaseWhere = {
        inventory: { store },
        quantity: { $gt: 0, $lte: 10 },
      };
      const outOfStockBaseWhere = {
        inventory: { store },
        quantity: 0,
      };

      const [
        lowStockTotal,
        outOfStockTotal,
        lowStockRecords,
        outOfStockRecords,
      ] = await Promise.all([
        this.em.count(StockQuantity, lowStockBaseWhere),
        this.em.count(StockQuantity, outOfStockBaseWhere),
        this.em.find(StockQuantity, lowStockBaseWhere, {
          populate: ['product', 'inventory'],
          fields: [
            'id',
            'quantity',
            'product.id',
            'product.name',
            'product.price',
            'inventory.id',
            'inventory.name',
          ],
          refresh: true,
          orderBy: { quantity: 'ASC', id: 'ASC' },
          limit: lowStockPageSize,
          offset: (lowStockPage - 1) * lowStockPageSize,
        }),
        this.em.find(StockQuantity, outOfStockBaseWhere, {
          populate: ['product', 'inventory'],
          fields: [
            'id',
            'quantity',
            'product.id',
            'product.name',
            'product.price',
            'inventory.id',
            'inventory.name',
          ],
          refresh: true,
          orderBy: { id: 'ASC' },
          limit: outOfStockPageSize,
          offset: (outOfStockPage - 1) * outOfStockPageSize,
        }),
      ]);

      response.lowStockProducts = {
        items: lowStockRecords.map(this.toStockSummary),
        total: lowStockTotal,
        page: lowStockPage,
        pageSize: lowStockPageSize,
        totalPages: Math.max(1, Math.ceil(lowStockTotal / lowStockPageSize)),
      };
      response.outOfStockProducts = {
        items: outOfStockRecords.map(this.toStockSummary),
        total: outOfStockTotal,
        page: outOfStockPage,
        pageSize: outOfStockPageSize,
        totalPages: Math.max(
          1,
          Math.ceil(outOfStockTotal / outOfStockPageSize),
        ),
      };
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

  private toStockSummary = (record: StockSummaryRecord) => ({
    id: record.product.id,
    name: record.product.name ?? '',
    price: record.product.price ?? 0,
    quantity: record.quantity ?? 0,
    inventoryName: record.inventory.name ?? '',
  });

  private getPage(rawValue?: string): number {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
      return DashboardService.DEFAULT_STOCK_PAGE;
    }
    return value;
  }

  private getPageSize(rawValue?: string): number {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
      return DashboardService.DEFAULT_STOCK_PAGE_SIZE;
    }
    return Math.min(value, DashboardService.MAX_STOCK_PAGE_SIZE);
  }

  private sumCashMovements(
    cashMovements: { type: string; amount?: number; createdAt?: Date }[],
    type: CashMovementType,
    from?: Date,
    to?: Date,
  ): number {
    return cashMovements
      .filter((cm) => {
        if (cm.type !== String(type)) return false;
        if (!from || !to || !cm.createdAt) return true;
        return cm.createdAt >= from && cm.createdAt <= to;
      })
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
  }

  private async getCashierBreakdown(
    store: Store,
    currentStart: Date,
    currentEnd: Date,
    sales: DashboardSale[],
  ): Promise<CashierStats[]> {
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
      {
        populate: ['cashMovements', 'openedBy'],
        refresh: true,
        orderBy: { openedAt: 'ASC' },
      },
    );
    if (sessions.length === 0) return [];

    const saleIds = sales.map((s) => s.id);
    const payments: PaymentSessionRow[] = saleIds.length
      ? ((await this.em
          .getKnex()<PaymentSessionRow>('payments as payment')
          .join(
            'store_session as session',
            'session.id',
            'payment.store_session_id',
          )
          .where('session.store_id', store.id)
          .whereIn('payment.sale_id', saleIds)
          .select(
            'payment.sale_id as saleId',
            'payment.store_session_id as sessionId',
          )) as PaymentSessionRow[])
      : [];

    const saleById = new Map(sales.map((s) => [s.id, s]));
    const salesBySessionId = new Map<string, Map<string, DashboardSale>>();
    for (const payment of payments) {
      const sale = saleById.get(payment.saleId);
      if (!sale) continue;

      const bucket =
        salesBySessionId.get(payment.sessionId) ??
        new Map<string, DashboardSale>();
      bucket.set(sale.id, sale);
      salesBySessionId.set(payment.sessionId, bucket);
    }

    return sessions
      .filter((session) => session.openedBy != null)
      .map((session) => {
        const employee = session.openedBy!;
        const cashMovements = session.cashMovements.getItems();
        const sessionSales = Array.from(
          salesBySessionId.get(session.id)?.values() ?? [],
        );

        return {
          sessionId: session.id,
          employeeId: employee.id,
          employeeName: getEmployeeFullName(employee),
          totalSales: round2(this.calcTotalSales(sessionSales)),
          openingAmount: round2(session.openingAmount ?? 0),
          closingAmount:
            session.closedAt != null
              ? round2(session.closingAmount ?? 0)
              : null,
          status:
            session.closedAt != null ? ('closed' as const) : ('open' as const),
          cashIn: round2(
            this.sumCashMovements(
              cashMovements,
              CashMovementType.CashIn,
              currentStart,
              currentEnd,
            ),
          ),
          cashOut: round2(
            this.sumCashMovements(
              cashMovements,
              CashMovementType.CashOut,
              currentStart,
              currentEnd,
            ),
          ),
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  private getEnumRangeBounds(range: DashboardRange): RangeBounds {
    const config =
      DAY_WINDOW_CONFIG[range] ?? DAY_WINDOW_CONFIG[DashboardRange.TODAY]!;

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
    sales: DashboardSale[],
    costPriceMap: Map<string, number>,
    start: Date,
    end: Date,
  ): Promise<DailyStats[]> {
    const salesByDay = new Map<string, DashboardSale[]>();
    for (const sale of sales) {
      if (!sale.createdAt) continue;

      const day = toDay(sale.createdAt);
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

    const startDay = toDay(start);
    const endDay = toDay(end);
    type DayBucket = {
      opened: number;
      closed: number;
      cashIn: number;
      cashOut: number;
    };
    const sessionsByDay = new Map<string, DayBucket>();

    const bump = (
      date: Date | string | null | undefined,
      key: keyof DayBucket,
      value: number,
    ) => {
      if (!date) return;

      const d = toDay(date);
      if (d < startDay || d > endDay) return;

      const bucket = sessionsByDay.get(d) ?? {
        opened: 0,
        closed: 0,
        cashIn: 0,
        cashOut: 0,
      };
      bucket[key] += value;
      sessionsByDay.set(d, bucket);
    };

    for (const session of sessions) {
      if (session.openedAt) bump(session.openedAt, 'opened', 1);
      if (session.closedAt) bump(session.closedAt, 'closed', 1);
      for (const cm of session.cashMovements.getItems()) {
        if (cm.type === String(CashMovementType.CashIn))
          bump(cm.createdAt, 'cashIn', cm.amount ?? 0);
        if (cm.type === String(CashMovementType.CashOut))
          bump(cm.createdAt, 'cashOut', cm.amount ?? 0);
      }
    }

    const days: DailyStats[] = [];
    const cursor = startOfUtcDay(start);
    const endCursor = endOfUtcDay(end);

    while (cursor.getTime() <= endCursor.getTime()) {
      const dateStr = toDay(cursor);
      const daySales = salesByDay.get(dateStr) ?? [];
      const sessionInfo = sessionsByDay.get(dateStr) ?? {
        opened: 0,
        closed: 0,
        cashIn: 0,
        cashOut: 0,
      };

      days.push({
        date: dateStr,
        dayName: cursor.toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: 'UTC',
        }),
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

  private async findDashboardSales(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<DashboardSale[]> {
    const rows = (await this.em
      .getKnex()<DashboardSaleRow>('sale as sale')
      .leftJoin('sale_items as item', 'item.sale_id', 'sale.id')
      .where('sale.store_id', storeId)
      .whereBetween('sale.created_at', [from, to])
      .orderBy('sale.created_at', 'asc')
      .select(
        'sale.id as saleId',
        'sale.created_at as createdAt',
        'item.id as itemId',
        'item.product_id as productId',
        'item.quantity',
        'item.unit_price as unitPrice',
      )) as DashboardSaleRow[];

    const salesById = new Map<string, DashboardSale>();
    for (const row of rows) {
      const sale: DashboardSale = salesById.get(row.saleId) ?? {
        id: row.saleId,
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        items: [],
      };

      if (row.itemId) {
        sale.items.push({
          id: row.itemId,
          productId: row.productId ?? '',
          quantity: Number(row.quantity ?? 0),
          unitPrice: Number(row.unitPrice ?? 0),
        });
      }
      salesById.set(sale.id, sale);
    }

    return [...salesById.values()];
  }

  private calcTotalSales(sales: DashboardSale[]): number {
    return sales.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce((s, item) => s + item.quantity * item.unitPrice, 0),
      0,
    );
  }

  private async buildSaleItemCostMap(
    store: Store,
    productIds: string[],
    upTo: Date,
  ): Promise<Map<string, number>> {
    const costBySaleItemId = new Map<string, number>();
    if (productIds.length === 0) return costBySaleItemId;

    const purchasedItems = (await this.em
      .getKnex()<PurchaseBatchRow>('purchased_items as item')
      .join('purchase', 'purchase.id', 'item.purchase_id')
      .where('purchase.store_id', store.id)
      .whereIn('item.product_id', productIds)
      .where('item.created_at', '<=', upTo)
      .orderBy('item.created_at', 'asc')
      .select(
        'item.product_id as productId',
        'item.quantity',
        'item.unit_price as unitPrice',
      )) as PurchaseBatchRow[];

    const batchesByProduct = new Map<
      string,
      { remaining: number; unitPrice: number }[]
    >();
    for (const pi of purchasedItems) {
      const list = batchesByProduct.get(pi.productId) ?? [];
      list.push({
        remaining: Number(pi.quantity),
        unitPrice: Number(pi.unitPrice),
      });
      batchesByProduct.set(pi.productId, list);
    }
    const nextBatchByProduct = new Map<string, number>();

    const saleItems = (await this.em
      .getKnex()<HistoricalSaleItemRow>('sale_items as item')
      .join('sale', 'sale.id', 'item.sale_id')
      .where('sale.store_id', store.id)
      .whereIn('item.product_id', productIds)
      .where('sale.created_at', '<=', upTo)
      .orderBy('sale.created_at', 'asc')
      .select(
        'item.id',
        'item.product_id as productId',
        'item.quantity',
      )) as HistoricalSaleItemRow[];

    for (const item of saleItems) {
      const batches = batchesByProduct.get(item.productId) ?? [];
      let batchIndex = nextBatchByProduct.get(item.productId) ?? 0;
      let qtyToConsume = Number(item.quantity);
      let totalCost = 0;

      while (batchIndex < batches.length && qtyToConsume > 0) {
        const batch = batches[batchIndex];
        if (qtyToConsume <= 0) break;
        if (batch.remaining <= 0) {
          batchIndex += 1;
          continue;
        }
        const take = Math.min(batch.remaining, qtyToConsume);
        totalCost += take * batch.unitPrice;
        batch.remaining -= take;
        qtyToConsume -= take;
        if (batch.remaining <= 0) batchIndex += 1;
      }
      nextBatchByProduct.set(item.productId, batchIndex);

      const consumedQty = Number(item.quantity) - qtyToConsume;

      if (consumedQty > 0 && qtyToConsume === 0) {
        costBySaleItemId.set(item.id, totalCost / consumedQty);
      }
    }

    return costBySaleItemId;
  }

  private calcTotalProfit(
    sales: DashboardSale[],
    costBySaleItemId: Map<string, number>,
  ): number {
    let hasMissingCost = false;

    const profit = sales.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce((s, item) => {
          const basePrice = item.unitPrice / (1 + DashboardService.TAX_RATE);
          const costPrice = costBySaleItemId.get(item.id);

          if (costPrice === undefined) {
            hasMissingCost = true;
            return s;
          }

          return s + (basePrice - costPrice) * item.quantity;
        }, 0),
      0,
    );

    if (hasMissingCost) {
      console.warn(
        '[profit] some sale items had no cost history — check for missing/orphaned purchase data',
      );
    }

    return profit;
  }

  private calcBoundedSignedPercentage(
    current: number,
    previous: number,
  ): number {
    if (previous === 0) {
      if (current === 0) return 0;
      return current > 0 ? 100 : -100;
    }

    return round2(((current - previous) / Math.abs(previous)) * 100);
  }

  private parseAndValidateDateRange(
    from: string | undefined,
    to: string | undefined,
  ): { from: Date; to: Date } | null {
    if (from === undefined && to === undefined) return null;

    if (from === undefined || to === undefined)
      throw new BadRequestException(
        'Both "from" and "to" must be provided for a custom date range',
      );

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
      throw new BadRequestException(
        'Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
      );

    if (fromDate > toDate)
      throw new BadRequestException('"from" must be on or before "to"');

    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > oneYearMs)
      throw new BadRequestException('Date range cannot exceed 1 year');

    return { from: fromDate, to: toDate };
  }
}
