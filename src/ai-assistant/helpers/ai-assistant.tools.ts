import { EntityManager } from '@mikro-orm/postgresql';
import { sql, type RawQueryFragment } from '@mikro-orm/core';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import {
  DailyStats,
  DashboardRange,
  DashboardStats,
} from '../../dashboard/dto/dashboard.dto';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { CashMovement } from '../../database/entites/cash-movement.entity';
import { Category } from '../../database/entites/category.entity';
import { Customer } from '../../database/entites/customer.entity';
import { Employee } from '../../database/entites/employee.entity';
import { Inventory } from '../../database/entites/inventory.entity';
import { JournalEntry } from '../../database/entites/journal-entry.entity';
import { Product } from '../../database/entites/product.entity';
import { Purchase } from '../../database/entites/purchase.entity';
import { Sale } from '../../database/entites/sale.entity';
import { SaleItem } from '../../database/entites/sale-item.entity';
import { Payment } from '../../database/entites/payments.entity';
import { PurchasedItem } from '../../database/entites/purchased_item.entity';
import { Receipt } from '../../database/entites/receipt.entity';
import { StockQuantity } from '../../database/entites/stock-quantity.entity';
import { StockIn } from '../../database/entites/stock-in.entity';
import { StockMovement } from '../../database/entites/stock-movement.entity';
import { StockOut } from '../../database/entites/stock-out.entity';
import { Store } from '../../database/entites/store.entity';
import { StoreSession } from '../../database/entites/store-session.entity';
import { AuditActionType } from '../../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';
import { getEmployeeFullName } from '../../shared/utils/employee-name.util';
import { PaymentStatus } from '../../shared/utils/payments-status.enum';
import { PurchaseStatus } from '../../shared/utils/purchase-status-enum';
import { SaleStatus } from '../../shared/utils/sale-status.enum';
import {
  AiAssistantGraphSchema,
  type AiAssistantGraph,
} from './ai-assistant.response.schema';

const DEFAULT_TOOL_LIMIT = 10;
const MAX_TOOL_LIMIT = 50;
const TOOL_LIMIT = z
  .number()
  .int()
  .min(1)
  .max(MAX_TOOL_LIMIT)
  .optional()
  .default(DEFAULT_TOOL_LIMIT);
const LIMIT_INPUT = z.object({ limit: TOOL_LIMIT });
const PRODUCT_FILTER_FIELDS = {
  query: z.string().optional().describe('Product name only.'),
  productCode: z
    .object({
      prefix: z.string().describe('Product code prefix, for example PDT.'),
      number: z
        .number()
        .int()
        .positive()
        .describe('Numeric product code value, for example 1 for PDT-0001.'),
    })
    .optional(),
};
const PRODUCT_QUERY_INPUT = z.object(PRODUCT_FILTER_FIELDS);
const DATE_RANGE_INPUT = z.object({
  from: z
    .string()
    .min(1)
    .describe('Inclusive ISO date, for example 2026-07-01.'),
  to: z.string().min(1).describe('Inclusive ISO date, for example 2026-07-16.'),
  label: z
    .string()
    .min(1)
    .optional()
    .describe('Optional human-readable label for this date range.'),
});
const COMPARISON_PERIOD_INPUT = DATE_RANGE_INPUT.extend({
  label: z.string().min(1).describe('Human-readable label for this period.'),
});
const LIVE_ENTITY_RESOURCES = [
  'employees',
  'categories',
  'payments',
  'stock_ins',
  'stock_outs',
  'stock_movements',
  'cash_movements',
  'receipts',
  'journal_entries',
] as const;
const BUSINESS_GRAPH_SUBJECTS = [
  'dashboard_sales',
  'dashboard_profit',
  'dashboard_cash_in',
  'dashboard_cash_out',
  'dashboard_sessions_opened',
  'dashboard_sessions_closed',
  'top_selling_products',
  'products_by_sold_value',
  'inventory_by_quantity',
  'customers_by_paid_sales',
  'top_purchased_products',
  'products_by_purchase_cost',
  'purchase_customers_by_paid_amount',
  'sales_by_cashier',
] as const;

type LiveEntityResource = (typeof LIVE_ENTITY_RESOURCES)[number];
type DashboardGraphMetricName =
  | 'sales'
  | 'profit'
  | 'cash_in'
  | 'cash_out'
  | 'sessions_opened'
  | 'sessions_closed';
type BusinessGraphSubject = (typeof BUSINESS_GRAPH_SUBJECTS)[number];
type BusinessDateRange = { from: string; to: string; label?: string };
type BusinessGraphComparisonPeriod = BusinessDateRange & { label: string };
type DashboardGraphMetric = {
  label: string;
  valueFormat: 'currency' | 'number';
  getDailyValue: (day: DailyStats) => number;
  getTotalValue: (stats: DashboardStats) => number;
};
type GraphRow = { label: string; value: string | number };
type GraphDefinition = {
  title: string;
  yAxisLabel: string;
  valueFormat: AiAssistantGraph['valueFormat'];
  loadRows: () => Promise<GraphRow[]>;
};
type TransactionItem = {
  product: { id: string; name?: string };
  quantity?: number;
  unitPrice?: number;
};
type TransactionSummaryRecord = {
  id: string;
  status: string;
  customer?: { name?: string };
  createdAt?: Date;
  items: { getItems: () => TransactionItem[] };
};

const DASHBOARD_SUBJECT_METRICS: Partial<
  Record<BusinessGraphSubject, DashboardGraphMetricName>
> = {
  dashboard_sales: 'sales',
  dashboard_profit: 'profit',
  dashboard_cash_in: 'cash_in',
  dashboard_cash_out: 'cash_out',
  dashboard_sessions_opened: 'sessions_opened',
  dashboard_sessions_closed: 'sessions_closed',
};

const DASHBOARD_GRAPH_METRICS: Record<
  DashboardGraphMetricName,
  DashboardGraphMetric
> = {
  sales: {
    label: 'Sales',
    valueFormat: 'currency',
    getDailyValue: (day) => day.sales.total,
    getTotalValue: (stats) => stats.sales.total,
  },
  profit: {
    label: 'Profit',
    valueFormat: 'currency',
    getDailyValue: (day) => day.profit.total,
    getTotalValue: (stats) => stats.profit.total,
  },
  cash_in: {
    label: 'Cash in',
    valueFormat: 'currency',
    getDailyValue: (day) => day.cashIn,
    getTotalValue: (stats) =>
      (stats.cashierBreakdown ?? []).reduce(
        (total, cashier) => total + cashier.cashIn,
        0,
      ),
  },
  cash_out: {
    label: 'Cash out',
    valueFormat: 'currency',
    getDailyValue: (day) => day.cashOut,
    getTotalValue: (stats) =>
      (stats.cashierBreakdown ?? []).reduce(
        (total, cashier) => total + cashier.cashOut,
        0,
      ),
  },
  sessions_opened: {
    label: 'Opened sessions',
    valueFormat: 'number',
    getDailyValue: (day) => day.sessionsOpened,
    getTotalValue: (stats) => (stats.cashierBreakdown ?? []).length,
  },
  sessions_closed: {
    label: 'Closed sessions',
    valueFormat: 'number',
    getDailyValue: (day) => day.sessionsClosed,
    getTotalValue: (stats) =>
      (stats.cashierBreakdown ?? []).filter(
        (cashier) => cashier.status === 'closed',
      ).length,
  },
};

interface CreateAiAssistantToolsParams {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
}

export function createAiAssistantTools({
  dashboardService,
  em,
  store,
  employeeId,
}: CreateAiAssistantToolsParams) {
  const storeWhere = { id: store.id };
  const scope = { storeId: store.id, storeName: store.name };
  return {
    getDashboardStats: tool({
      description:
        'Get live sales, profit, and daily business metrics for one explicit inclusive date range in the verified store. Use getInventorySummary for current stock alerts.',
      inputSchema: z.object({
        dateRange: DATE_RANGE_INPUT,
      }),
      execute: async ({ dateRange }) => ({
        scope,
        stats: await dashboardService.getDashboardStats(store, employeeId, {
          range: DashboardRange.CUSTOM,
          from: dateRange.from,
          to: dateRange.to,
        }),
      }),
    }),

    createBusinessGraph: tool({
      description:
        'Create one verified graph from current-store data. Supports dashboard sales, profit, cash movements, sessions, top selling products, sold value by product, current inventory quantity, customers by paid sales, top purchased products, purchase cost by product, purchase customers by paid amount, and sales by cashier. Supply an explicit dateRange for a time-based graph, or comparisonPeriods for a comparison. Omit dateRange only when all available history is intended or when graphing current inventory. Historical comparisons work for time-based subjects; inventory quantity is a current snapshot.',
      inputSchema: z.object({
        subject: z.enum(BUSINESS_GRAPH_SUBJECTS),
        dateRange: DATE_RANGE_INPUT.optional(),
        comparisonPeriods: z
          .array(COMPARISON_PERIOD_INPUT)
          .min(2)
          .optional()
          .describe(
            'Use only when the request compares two or more time periods. Send every requested period here, with exact dates and labels, to create one graph. This supports arbitrary comparison periods for every time-based subject.',
          ),
        limit: z.number().int().min(1).max(20).optional().default(10),
        type: z
          .enum(['line', 'bar', 'pie', 'doughnut'])
          .optional()
          .default('bar'),
      }),
      execute: async (input) => ({
        scope,
        graph: await createBusinessGraph({
          dashboardService,
          em,
          store,
          employeeId,
          ...input,
        }),
      }),
    }),

    searchProducts: tool({
      description:
        'Search products by name or product code and include current stock quantities by inventory.',
      inputSchema: z.object({
        ...PRODUCT_FILTER_FIELDS,
        lowStockOnly: z.boolean().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ query, productCode, lowStockOnly, limit }) => {
        const take = limit;
        const where = createProductWhere(storeWhere, query, productCode);
        const totalCount = await em.count(Product, where);
        const products = await em.find(Product, where, {
          orderBy: { name: 'ASC' },
          limit: take,
          refresh: true,
          populate: ['sequence'],
        });
        const productIds = products.map((product) => product.id);
        const stockRecords = productIds.length
          ? await em.find(
            StockQuantity,
            {
              product: { id: { $in: productIds } },
              inventory: { store: storeWhere },
              ...(lowStockOnly ? { quantity: { $lte: 10 } } : {}),
            },
            { populate: ['inventory', 'product'], refresh: true },
          )
          : [];
        const stockByProduct = groupBy(
          stockRecords,
          (record) => record.product.id,
        );

        return {
          scope,
          totalCount,
          returnedCount: products.length,
          products: products
            .map((product) => ({
              id: product.id,
              name: product.name,
              productCode: product.sequence
                ? `${product.sequence.prefix}-${String(product.sequence.lastIndex).padStart(4, '0')}`
                : null,
              price: product.price,
              stock: (stockByProduct.get(product.id) ?? []).map((record) => ({
                inventoryId: record.inventory.id,
                inventoryName: record.inventory.name,
                quantity: record.quantity ?? 0,
              })),
            }))
            .filter(
              (product) =>
                !lowStockOnly ||
                product.stock.some((stock) => stock.quantity <= 10),
            ),
        };
      },
    }),

    getProductCount: tool({
      description:
        'Return the total number of products in the current store, optionally filtered by product name or product code.',
      inputSchema: PRODUCT_QUERY_INPUT,
      execute: async ({ query, productCode }) => {
        const where = createProductWhere(storeWhere, query, productCode);
        return { scope, totalCount: await em.count(Product, where) };
      },
    }),

    getInventorySummary: tool({
      description:
        'Summarize inventories, total stock records, low-stock products, and out-of-stock products.',
      inputSchema: z.object({
        inventoryId: z.string().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ inventoryId, limit }) => {
        const take = limit;
        const inventoryWhere = {
          store: storeWhere,
          ...(inventoryId ? { id: inventoryId } : {}),
        };
        const [totalInventoryCount, inventories] = await Promise.all([
          em.count(Inventory, inventoryWhere),
          em.find(Inventory, inventoryWhere, {
            orderBy: { name: 'ASC' },
            limit: take,
            refresh: true,
          }),
        ]);
        const inventoryIds = inventories.map((inventory) => inventory.id);
        const [
          totalStockRecordCount,
          lowStockCount,
          outOfStockCount,
          stockRecords,
        ] = await Promise.all([
          em.count(StockQuantity, { inventory: inventoryWhere }),
          em.count(StockQuantity, {
            inventory: inventoryWhere,
            quantity: { $gt: 0, $lte: 10 },
          }),
          em.count(StockQuantity, { inventory: inventoryWhere, quantity: 0 }),
          inventoryIds.length
            ? em.find(
              StockQuantity,
              {
                inventory: { id: { $in: inventoryIds }, store: storeWhere },
                product: { store: storeWhere },
              },
              { populate: ['inventory', 'product'], refresh: true },
            )
            : Promise.resolve([]),
        ]);
        const recordsByInventory = groupBy(
          stockRecords,
          (record) => record.inventory.id,
        );

        return {
          scope,
          totalInventoryCount,
          totalStockRecordCount,
          lowStockCount,
          outOfStockCount,
          returnedInventoryCount: inventories.length,
          inventories: inventories.map((inventory) => {
            const records = recordsByInventory.get(inventory.id) ?? [];
            return {
              id: inventory.id,
              name: inventory.name,
              address: inventory.address,
              productCount: records.length,
              totalQuantity: records.reduce(
                (sum, record) => sum + (record.quantity ?? 0),
                0,
              ),
              lowStockProducts: records
                .filter(
                  (record) =>
                    (record.quantity ?? 0) > 0 && (record.quantity ?? 0) <= 10,
                )
                .map((record) => ({
                  id: record.product.id,
                  name: record.product.name,
                  quantity: record.quantity ?? 0,
                })),
              outOfStockProducts: records
                .filter((record) => (record.quantity ?? 0) === 0)
                .map((record) => ({
                  id: record.product.id,
                  name: record.product.name,
                  quantity: 0,
                })),
            };
          }),
        };
      },
    }),

    getLiveEntityCount: tool({
      description:
        'Return the exact current count for a CRUD resource in the verified store. Use this for employees, categories, payments, stock-ins, stock-outs, stock movements, cash movements, receipts, or journal entries.',
      inputSchema: z.object({
        resource: z.enum(LIVE_ENTITY_RESOURCES),
      }),
      execute: async ({ resource }) => ({
        scope,
        resource,
        totalCount: await getLiveEntityCount(em, storeWhere, resource),
      }),
    }),

    getSalesSummary: tool({
      description:
        'Get all sales totals, status breakdown, recent sales, and top products for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
        const saleIds = await getEmployeeSaleIds(em, store, employeeId);
        const sales = saleIds.length
          ? await em.find(
            Sale,
            {
              id: { $in: saleIds },
              store: storeWhere,
            },
            {
              populate: ['items', 'items.product', 'customer'],
              orderBy: { createdAt: 'DESC' },
              refresh: true,
            },
          )
          : [];
        const summary = summarizeTransactions(sales, limit, true);

        return {
          scope,
          count: summary.count,
          totalSales: summary.total,
          statusBreakdown: summary.statusBreakdown,
          topProducts: summary.topProducts,
          recentSales: summary.recentTransactions,
        };
      },
    }),

    getPurchaseSummary: tool({
      description:
        'Get all purchase totals, status breakdown, recent purchases, and purchased products for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
        const purchaseIds = await getEmployeeCreatedEntityIds(
          em,
          store,
          employeeId,
          AuditEntityType.Purchase,
        );
        const purchases = purchaseIds.length
          ? await em.find(
            Purchase,
            { store: storeWhere, id: { $in: purchaseIds } },
            {
              populate: ['items', 'items.product', 'customer'],
              orderBy: { createdAt: 'DESC' },
              refresh: true,
            },
          )
          : [];
        const summary = summarizeTransactions(purchases, limit);

        return {
          scope,
          count: summary.count,
          totalPurchases: summary.total,
          statusBreakdown: summary.statusBreakdown,
          recentPurchases: summary.recentTransactions,
        };
      },
    }),

    getCustomerSummary: tool({
      description:
        'Search customers and summarize their sale and purchase counts for the current logged-in employee.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ query, limit }) => {
        const take = limit;
        const [saleIds, purchaseIds] = await Promise.all([
          getEmployeeSaleIds(em, store, employeeId),
          getEmployeeCreatedEntityIds(
            em,
            store,
            employeeId,
            AuditEntityType.Purchase,
          ),
        ]);

        const where: Record<string, any> = { store: storeWhere };
        if (query?.trim()) {
          const q = `%${query.trim()}%`;
          where.$or = [{ name: { $ilike: q } }, { phone: { $ilike: q } }];
        }

        const customers = await em.find(Customer, where, {
          orderBy: { createdAt: 'DESC' },
          limit: take,
          refresh: true,
        });

        const customerResults = await Promise.all(
          customers.map(async (customer) => {
            const [saleCount, purchaseCount] = await Promise.all([
              saleIds.length
                ? em.count(Sale, {
                  store: storeWhere,
                  customer,
                  id: { $in: saleIds },
                })
                : Promise.resolve(0),
              purchaseIds.length
                ? em.count(Purchase, {
                  store: storeWhere,
                  customer,
                  id: { $in: purchaseIds },
                })
                : Promise.resolve(0),
            ]);

            return {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              saleCount,
              purchaseCount,
              createdAt: customer.createdAt,
            };
          }),
        );
        return { scope, customers: customerResults };
      },
    }),

    getOpenSessions: tool({
      description:
        'Get currently open cashier sessions for the current logged-in employee with payments and cash movement totals.',
      inputSchema: z.object({
        limit: TOOL_LIMIT,
      }),
      execute: async ({ limit }) => {
        const take = limit;
        const sessions = await em.find(
          StoreSession,
          {
            store: storeWhere,
            openedBy: { id: employeeId, store: storeWhere },
            closedAt: null,
          },
          {
            populate: ['openedBy', 'payments', 'cashMovements'],
            orderBy: { openedAt: 'DESC' },
            limit: take,
            refresh: true,
          },
        );

        return {
          scope,
          sessions: sessions.map((session) => {
            const cashTotals = session.cashMovements.getItems().reduce(
              (totals, movement) => {
                if (movement.type === 'cash_in') {
                  totals.cashIn += movement.amount ?? 0;
                } else if (movement.type === 'cash_out') {
                  totals.cashOut += movement.amount ?? 0;
                }
                return totals;
              },
              { cashIn: 0, cashOut: 0 },
            );

            return {
              id: session.id,
              openedBy: session.openedBy
                ? {
                  id: session.openedBy.id,
                  name: getEmployeeFullName(session.openedBy),
                  email: session.openedBy.email,
                }
                : null,
              openingAmount: session.openingAmount ?? 0,
              openedAt: session.openedAt,
              paymentTotal: session.payments
                .getItems()
                .reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
              cashIn: cashTotals.cashIn,
              cashOut: cashTotals.cashOut,
            };
          }),
        };
      },
    }),

    getAuditActivity: tool({
      description:
        'Get recent audit activity for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
        const take = limit;
        const logs = await em.find(
          AuditLog,
          {
            employee: { id: employeeId, store: storeWhere },
          },
          {
            populate: ['employee'],
            orderBy: { createdAt: 'DESC' },
            limit: take,
            refresh: true,
          },
        );

        return {
          scope,
          activity: logs.map((log) => ({
            id: log.id,
            employeeId: log.employee.id,
            employeeName: getEmployeeFullName(log.employee),
            actionType: log.actionType,
            entityType: log.entityType,
            entityId: log.entityId,
            createdAt: log.createdAt,
          })),
        };
      },
    }),
  };
}


function summarizeTransactions(
  transactions: TransactionSummaryRecord[],
  limit: number,
  includeTopProducts = false,
) {
  const statusBreakdown: Record<string, number> = {};
  const productTotals = new Map<
    string,
    { productId: string; name?: string; quantity: number; sales: number }
  >();
  let total = 0;

  for (const transaction of transactions) {
    statusBreakdown[transaction.status] =
      (statusBreakdown[transaction.status] ?? 0) + 1;
    const transactionTotal = transaction.items
      .getItems()
      .reduce((sum, item) => {
        const quantity = item.quantity ?? 0;
        const itemTotal = quantity * (item.unitPrice ?? 0);
        if (includeTopProducts) {
          const product = productTotals.get(item.product.id) ?? {
            productId: item.product.id,
            name: item.product.name,
            quantity: 0,
            sales: 0,
          };
          product.quantity += quantity;
          product.sales += itemTotal;
          productTotals.set(product.productId, product);
        }
        return sum + itemTotal;
      }, 0);
    total += transactionTotal;
  }

  return {
    count: transactions.length,
    total,
    statusBreakdown,
    topProducts: includeTopProducts
      ? [...productTotals.values()]
        .sort((first, second) => second.sales - first.sales)
        .slice(0, limit)
      : [],
    recentTransactions: transactions.slice(0, limit).map((transaction) => ({
      id: transaction.id,
      status: transaction.status,
      customerName: transaction.customer?.name,
      total: transaction.items
        .getItems()
        .reduce(
          (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
          0,
        ),
      createdAt: transaction.createdAt,
    })),
  };
}


async function createBusinessGraph({
  dashboardService,
  em,
  store,
  employeeId,
  subject,
  dateRange,
  comparisonPeriods,
  limit,
  type,
}: {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
  subject: BusinessGraphSubject;
  dateRange?: BusinessDateRange;
  comparisonPeriods?: BusinessGraphComparisonPeriod[];
  limit: number;
  type: AiAssistantGraph['type'];
}): Promise<AiAssistantGraph> {
  const dashboardMetricName = DASHBOARD_SUBJECT_METRICS[subject];
  if (comparisonPeriods) {
    return createBusinessComparisonGraph({
      dashboardService,
      em,
      store,
      employeeId,
      subject,
      periods: comparisonPeriods,
      limit,
      type,
    });
  }

  if (dashboardMetricName) {
    if (!dateRange) {
      throw new Error(
        'An explicit dateRange is required for dashboard graph metrics.',
      );
    }

    const metric = DASHBOARD_GRAPH_METRICS[dashboardMetricName];
    const stats = await dashboardService.getDashboardStats(
      store,
      employeeId,
      {
        range: DashboardRange.CUSTOM,
        from: dateRange.from,
        to: dateRange.to,
      },
      {
        allowLongRange: true,
        includeDailyBreakdown: true,
      },
    );
    const dailyStats = stats.dailyBreakdown ?? [];
    const rows = dailyStats.length
      ? dailyStats.map((day) => ({
        label: day.date,
        value: metric.getDailyValue(day),
      }))
      : [
        {
          label: getBusinessDateRangeLabel(dateRange),
          value: metric.getTotalValue(stats),
        },
      ];

    return toGraph(rows, {
      type,
      title: `${metric.label} ${getBusinessDateRangeLabel(dateRange)}`,
      xAxisLabel: dailyStats.length ? 'Date' : 'Period',
      yAxisLabel: metric.label,
      valueFormat: metric.valueFormat,
    });
  }

  const dateRangeWhere = getBusinessGraphDateRange(dateRange);
  const saleWhere = {
    store: { id: store.id },
    status: SaleStatus.DONE,
    ...dateRangeWhere,
  };
  const purchaseWhere = {
    store: { id: store.id },
    status: PurchaseStatus.DONE,
    ...dateRangeWhere,
  };
  const saleProductRows = (value: RawQueryFragment) =>
    em
      .createQueryBuilder(SaleItem, 'item')
      .select(['product.name as label', value.as('value')])
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.product', 'product')
      .where({ sale: saleWhere })
      .groupBy(['product.id', 'product.name'])
      .orderBy({ [sql.ref('value').toString()]: 'DESC' })
      .limit(limit)
      .execute<GraphRow[]>('all');
  const purchasedProductRows = (value: RawQueryFragment) =>
    em
      .createQueryBuilder(PurchasedItem, 'item')
      .select(['product.name as label', value.as('value')])
      .innerJoin('item.purchase', 'purchase')
      .innerJoin('item.product', 'product')
      .where({ purchase: purchaseWhere })
      .groupBy(['product.id', 'product.name'])
      .orderBy({ [sql.ref('value').toString()]: 'DESC' })
      .limit(limit)
      .execute<GraphRow[]>('all');
  const definitions: Partial<Record<BusinessGraphSubject, GraphDefinition>> = {
    top_selling_products: {
      title: 'Top selling products',
      yAxisLabel: 'Quantity sold',
      valueFormat: 'number',
      loadRows: () => saleProductRows(sql`sum(item.quantity)`),
    },
    products_by_sold_value: {
      title: 'Products by sold value',
      yAxisLabel: 'Sold value',
      valueFormat: 'currency',
      loadRows: () =>
        saleProductRows(sql`sum(item.quantity * item.unit_price)`),
    },
    inventory_by_quantity: {
      title: 'Inventory by quantity',
      yAxisLabel: 'Available quantity',
      valueFormat: 'number',
      loadRows: () =>
        em
          .createQueryBuilder(StockQuantity, 'stock')
          .select([
            'product.name as label',
            sql`sum(stock.quantity)`.as('value'),
          ])
          .innerJoin('stock.product', 'product')
          .innerJoin('stock.inventory', 'inventory')
          .where({ inventory: { store: { id: store.id } } })
          .groupBy(['product.id', 'product.name'])
          .orderBy({ [sql.ref('value').toString()]: 'DESC' })
          .limit(limit)
          .execute<GraphRow[]>('all'),
    },
    customers_by_paid_sales: {
      title: 'Customers by paid sales',
      yAxisLabel: 'Paid amount',
      valueFormat: 'currency',
      loadRows: () =>
        em
          .createQueryBuilder(Payment, 'payment')
          .select([
            'customer.name as label',
            sql`sum(payment.amount)`.as('value'),
          ])
          .innerJoin('payment.sale', 'sale')
          .innerJoin('sale.customer', 'customer')
          .where({ status: PaymentStatus.Done, sale: saleWhere })
          .groupBy(['customer.id', 'customer.name'])
          .orderBy({ [sql.ref('value').toString()]: 'DESC' })
          .limit(limit)
          .execute<GraphRow[]>('all'),
    },
    top_purchased_products: {
      title: 'Top purchased products',
      yAxisLabel: 'Purchased quantity',
      valueFormat: 'number',
      loadRows: () => purchasedProductRows(sql`sum(item.quantity)`),
    },
    products_by_purchase_cost: {
      title: 'Products by purchase cost',
      yAxisLabel: 'Purchase cost',
      valueFormat: 'currency',
      loadRows: () =>
        purchasedProductRows(sql`sum(item.quantity * item.unit_price)`),
    },
    purchase_customers_by_paid_amount: {
      title: 'Purchase customers by paid amount',
      yAxisLabel: 'Paid amount',
      valueFormat: 'currency',
      loadRows: () =>
        em
          .createQueryBuilder(Payment, 'payment')
          .select([
            'customer.name as label',
            sql`sum(payment.amount)`.as('value'),
          ])
          .innerJoin('payment.purchase', 'purchase')
          .innerJoin('purchase.customer', 'customer')
          .where({ status: PaymentStatus.Done, purchase: purchaseWhere })
          .groupBy(['customer.id', 'customer.name'])
          .orderBy({ [sql.ref('value').toString()]: 'DESC' })
          .limit(limit)
          .execute<GraphRow[]>('all'),
    },
    sales_by_cashier: {
      title: 'Sales received by cashier',
      yAxisLabel: 'Received amount',
      valueFormat: 'currency',
      loadRows: () =>
        em
          .createQueryBuilder(Payment, 'payment')
          .select([
            sql`concat(employee.first_name, ' ', employee.last_name)`.as(
              'label',
            ),
            sql`sum(payment.amount)`.as('value'),
          ])
          .innerJoin('payment.sale', 'sale')
          .innerJoin('payment.storeSession', 'session')
          .innerJoin('session.openedBy', 'employee')
          .where({ status: PaymentStatus.Done, sale: saleWhere })
          .groupBy(['employee.id', 'employee.first_name', 'employee.last_name'])
          .orderBy({ [sql.ref('value').toString()]: 'DESC' })
          .limit(limit)
          .execute<GraphRow[]>('all'),
    },
  };
  const definition = definitions[subject];
  if (!definition) throw new Error('The graph subject is not supported.');
  const rows = await definition.loadRows();

  return toGraph(rows, {
    type,
    title: `${definition.title} ${getBusinessDateRangeLabel(dateRange)}`,
    xAxisLabel: 'Category',
    yAxisLabel: definition.yAxisLabel,
    valueFormat: definition.valueFormat,
  });
}

async function createBusinessComparisonGraph({
  dashboardService,
  em,
  store,
  employeeId,
  subject,
  periods,
  limit,
  type,
}: {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
  subject: BusinessGraphSubject;
  periods: BusinessGraphComparisonPeriod[];
  limit: number;
  type: AiAssistantGraph['type'];
}): Promise<AiAssistantGraph> {
  if (subject === 'inventory_by_quantity') {
    throw new Error(
      'Inventory quantity is a live snapshot and cannot be compared across historical periods.',
    );
  }

  const graphs = await Promise.all(
    periods.map((period) =>
      createBusinessGraph({
        dashboardService,
        em,
        store,
        employeeId,
        subject,
        dateRange: period,
        limit,
        type,
      }),
    ),
  );
  const dashboardMetricName = DASHBOARD_SUBJECT_METRICS[subject];

  if (dashboardMetricName) {
    const metric = DASHBOARD_GRAPH_METRICS[dashboardMetricName];
    return toGraph(
      periods.map((period, index) => ({
        label: period.label,
        value: graphs[index].datasets[0].data.reduce(
          (total, value) => total + value,
          0,
        ),
      })),
      {
        type,
        title: `${metric.label} comparison`,
        xAxisLabel: 'Period',
        yAxisLabel: metric.label,
        valueFormat: metric.valueFormat,
      },
    );
  }

  const labels = [...new Set(graphs.flatMap((graph) => graph.labels))];
  return AiAssistantGraphSchema.parse({
    type,
    title: `${graphs[0].yAxisLabel} comparison`,
    xAxisLabel: graphs[0].xAxisLabel,
    yAxisLabel: graphs[0].yAxisLabel,
    valueFormat: graphs[0].valueFormat,
    labels,
    datasets: graphs.map((graph, index) => ({
      label: periods[index].label,
      data: labels.map((label) => {
        const labelIndex = graph.labels.indexOf(label);
        return labelIndex === -1 ? 0 : graph.datasets[0].data[labelIndex];
      }),
    })),
  });
}


function getBusinessGraphDateRange(
  dateRange?: BusinessDateRange,
): Record<string, unknown> {
  if (!dateRange) return {};

  const start = new Date(dateRange.from);
  const end = new Date(dateRange.to);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  )
    throw new Error('The date range is invalid.');
  end.setUTCHours(23, 59, 59, 999);
  return { createdAt: { $gte: start, $lte: end } };
}


function getBusinessDateRangeLabel(dateRange?: BusinessDateRange): string {
  if (!dateRange) return 'All time';
  return dateRange.label ?? `${dateRange.from} to ${dateRange.to}`;
}


function toGraph(
  rows: GraphRow[],
  config: Omit<AiAssistantGraph, 'labels' | 'datasets'>,
): AiAssistantGraph {
  return AiAssistantGraphSchema.parse({
    ...config,
    labels: rows.map((row) => row.label),
    datasets: [
      {
        label: config.yAxisLabel,
        data: rows.map((row) => Number(row.value) || 0),
      },
    ],
  });
}


function createProductWhere(
  storeWhere: { id: string },
  query?: string,
  productCode?: { prefix: string; number: number },
): Record<string, any> {
  const where: Record<string, any> = { store: storeWhere };
  const normalizedQuery = query?.trim();
  if (!normalizedQuery && !productCode) return where;

  where.$or = [
    ...(normalizedQuery ? [{ name: { $ilike: `%${normalizedQuery}%` } }] : []),
    ...(productCode
      ? [
        {
          sequence: {
            prefix: productCode.prefix,
            lastIndex: productCode.number,
          },
        },
      ]
      : []),
  ];
  return where;
}


function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  return items.reduce((groups, item) => {
    const groupKey = key(item);
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
    return groups;
  }, new Map<string, T[]>());
}


async function getLiveEntityCount(
  em: EntityManager,
  storeWhere: { id: string },
  resource: LiveEntityResource,
): Promise<number> {
  const counters: Record<LiveEntityResource, () => Promise<number>> = {
    employees: () => em.count(Employee, { store: storeWhere }),
    categories: () => em.count(Category, { store: storeWhere }),
    payments: () =>
      em.count(Payment, {
        $or: [
          { sale: { store: storeWhere } },
          { purchase: { store: storeWhere } },
        ],
      }),
    stock_ins: () => em.count(StockIn, { inventory: { store: storeWhere } }),
    stock_outs: () => em.count(StockOut, { sale: { store: storeWhere } }),
    stock_movements: () => em.count(StockMovement, { store: storeWhere }),
    cash_movements: () =>
      em.count(CashMovement, { storeSession: { store: storeWhere } }),
    receipts: () => em.count(Receipt, { store: storeWhere }),
    journal_entries: () => em.count(JournalEntry, { store: storeWhere }),
  };

  return counters[resource]();
}


async function getEmployeeSaleIds(
  em: EntityManager,
  store: Store,
  employeeId: string,
): Promise<string[]> {
  const payments = await em.find(
    Payment,
    {
      sale: { store: { id: store.id } },
      storeSession: {
        store: { id: store.id },
        openedBy: { id: employeeId, store: { id: store.id } },
      },
    },
    { populate: ['sale'], refresh: true },
  );

  return [
    ...new Set(
      payments
        .map((payment) => payment.sale?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}


async function getEmployeeCreatedEntityIds(
  em: EntityManager,
  store: Store,
  employeeId: string,
  entityType: AuditEntityType,
): Promise<string[]> {
  const logs = await em.find(
    AuditLog,
    {
      employee: { id: employeeId, store: { id: store.id } },
      entityType,
      actionType: AuditActionType.Create,
    },
    { refresh: true },
  );

  return [
    ...new Set(
      logs.map((log) => log.entityId).filter((id): id is string => Boolean(id)),
    ),
  ];
}
