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
  AiAssistantReportSchema,
  type AiAssistantReport,
} from './ai-assistant.response.schema';

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): RawQueryFragment;
  ref(name: string): RawQueryFragment;
};

const rawSql = sql as SqlTag;

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
const CUSTOMER_INSIGHT_INPUT = z.object({
  customerId: z.string().optional(),
  query: z.string().optional().describe('Customer name or phone number.'),
  dateRange: DATE_RANGE_INPUT.optional(),
  includeProfit: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set true only when the user asks about customer profit.'),
  limit: TOOL_LIMIT,
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
  'customers_by_profit',
  'customers_by_sales_and_profit',
  'top_purchased_products',
  'products_by_purchase_cost',
  'purchase_customers_by_paid_amount',
  'sales_by_cashier',
] as const;
const BUSINESS_REPORT_SUBJECTS = [
  'business_summary',
  'sales',
  'profit',
  'inventory',
  'products',
  'purchases',
] as const;
const DASHBOARD_GRAPH_METRIC_NAMES = [
  'sales',
  'profit',
  'cash_in',
  'cash_out',
  'sessions_opened',
  'sessions_closed',
] as const;

type LiveEntityResource = (typeof LIVE_ENTITY_RESOURCES)[number];
type DashboardGraphMetricName = (typeof DASHBOARD_GRAPH_METRIC_NAMES)[number];
type BusinessGraphSubject = (typeof BUSINESS_GRAPH_SUBJECTS)[number];
type BusinessReportSubject = (typeof BUSINESS_REPORT_SUBJECTS)[number];
type BusinessDateRange = { from: string; to: string; label?: string };
type CustomerInsightInput = z.infer<typeof CUSTOMER_INSIGHT_INPUT>;
type BusinessGraphComparisonPeriod = BusinessDateRange & { label: string };
type DashboardGraphMetric = {
  label: string;
  valueFormat: 'currency' | 'number';
  getDailyValue: (day: DailyStats) => number;
  getTotalValue: (stats: DashboardStats) => number;
};
type GraphRow = { label: string; value: string | number };
type CustomerGraphRow = GraphRow & { id: string };
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
type SequenceLike = { prefix: string; lastIndex: number };
type ReportPeriod = NonNullable<AiAssistantReport['period']>;

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

type AiAssistantToolContext = CreateAiAssistantToolsParams & {
  storeWhere: { id: string };
  scope: { storeId: string; storeName: string };
};

export function createAiAssistantTools({
  dashboardService,
  em,
  store,
  employeeId,
}: CreateAiAssistantToolsParams) {
  const storeWhere = { id: store.id };
  const scope = { storeId: store.id, storeName: store.name };
  const context: AiAssistantToolContext = {
    dashboardService,
    em,
    store,
    employeeId,
    storeWhere,
    scope,
  };
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
        'Create exactly one verified graph from current-store data. Use subject for one business measure. Use comparisonPeriods with one subject to compare that same measure across two or more requested periods in one graph. Use metrics with an explicit dateRange to put two or more compatible dashboard measures, such as sales and profit, into one graph as separate datasets. Do not use metrics and comparisonPeriods together. Supports dashboard sales, profit, cash movements, sessions, top selling products, sold value by product, current inventory quantity, customer paid sales, customer profit, customer paid sales and profit in the same chart, top purchased products, purchase cost by product, purchase customers by paid amount, and sales by cashier.',
      inputSchema: z.object({
        subject: z.enum(BUSINESS_GRAPH_SUBJECTS).optional(),
        metrics: z
          .array(z.enum(DASHBOARD_GRAPH_METRIC_NAMES))
          .min(2)
          .max(DASHBOARD_GRAPH_METRIC_NAMES.length)
          .optional()
          .describe(
            'Use for one graph with multiple compatible dashboard metrics over the same dateRange, for example sales and profit. Every selected metric must use the same value format.',
          ),
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
        graph: await createBusinessGraph(context, input),
      }),
    }),

    createBusinessReport: tool({
      description:
        'Create one verified report payload for the frontend to preview and export as a PDF. Use this alone whenever the user asks to create, download, export, print, or prepare a PDF/report; do not call another tool for that request. It returns JSON only, never a PDF file. Choose only the requested report subject. Set includeGraphs to true only when the user explicitly asks for charts or graphs in the report. Use an explicit dateRange for business_summary, sales, profit, and purchases reports. Inventory and products reports are current snapshots.',
      inputSchema: z.object({
        subject: z.enum(BUSINESS_REPORT_SUBJECTS),
        dateRange: DATE_RANGE_INPUT.optional(),
        limit: z.number().int().min(1).max(50).optional().default(20),
        includeGraphs: z.boolean().optional().default(false),
      }),
      execute: async (input) => ({
        scope,
        report: await createBusinessReport(context, input),
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
        const sales = await getEmployeeTransactions(
          em,
          Sale,
          storeWhere,
          saleIds,
        );
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
        const purchases = await getEmployeeTransactions(
          em,
          Purchase,
          storeWhere,
          purchaseIds,
        );
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
        'Answer customer questions in the verified store. Search by customer ID, name, or phone and return contact details, sale and purchase counts, billed totals, paid amounts, outstanding balances, and customer profit when includeProfit is true. Use this for any customer-specific question before saying customer data is unavailable.',
      inputSchema: CUSTOMER_INSIGHT_INPUT,
      execute: async (input) => ({
        scope,
        ...(await getCustomerInsights(context, input)),
      }),
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
    const transactionTotal = getItemsTotal(
      transaction.items.getItems(),
      (item) => {
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
        return itemTotal;
      },
    );
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
      total: getItemsTotal(transaction.items.getItems()),
      createdAt: transaction.createdAt,
    })),
  };
}

async function createBusinessReport(
  {
    dashboardService,
    em,
    store,
    employeeId,
    storeWhere,
  }: AiAssistantToolContext,
  {
    subject,
    dateRange,
    limit,
    includeGraphs,
  }: {
    subject: BusinessReportSubject;
    dateRange?: BusinessDateRange;
    limit: number;
    includeGraphs: boolean;
  },
): Promise<AiAssistantReport> {
  if (subject === 'inventory') {
    const inventoryWhere = { store: storeWhere };
    const [inventoryCount, lowStockCount, outOfStockCount, records] =
      await Promise.all([
        em.count(Inventory, inventoryWhere),
        em.count(StockQuantity, {
          inventory: inventoryWhere,
          quantity: { $gt: 0, $lte: 10 },
        }),
        em.count(StockQuantity, { inventory: inventoryWhere, quantity: 0 }),
        em.find(
          StockQuantity,
          { inventory: inventoryWhere },
          {
            populate: ['inventory', 'product'],
            orderBy: { quantity: 'ASC' },
            limit,
            refresh: true,
          },
        ),
      ]);

    return createReport(
      subject,
      'Inventory report',
      [
        reportMetric('Inventories', inventoryCount),
        reportMetric('Low stock products', lowStockCount),
        reportMetric('Out of stock products', outOfStockCount),
      ],
      [
        reportTable(
          'Inventory quantities',
          ['Product', 'Inventory', 'Quantity', 'Unit price'],
          records.map((record) => [
            record.product.name ?? '',
            record.inventory.name,
            record.quantity ?? 0,
            record.product.price ?? 0,
          ]),
        ),
      ],
    );
  }

  if (subject === 'products') {
    const [totalProducts, products] = await Promise.all([
      em.count(Product, { store: storeWhere }),
      em.find(
        Product,
        { store: storeWhere },
        {
          populate: ['sequence'],
          orderBy: { name: 'ASC' },
          limit,
          refresh: true,
        },
      ),
    ]);

    return createReport(
      subject,
      'Product catalog report',
      [reportMetric('Total products', totalProducts)],
      [
        reportTable(
          'Products',
          ['Product code', 'Name', 'Unit price'],
          products.map((product) => [
            getSequenceCode(product.sequence),
            product.name ?? '',
            product.price ?? 0,
          ]),
        ),
      ],
    );
  }

  if (!dateRange)
    throw new Error(
      `An explicit dateRange is required for ${subject} reports.`,
    );

  const period = {
    from: dateRange.from,
    to: dateRange.to,
    label: getBusinessDateRangeLabel(dateRange),
  };
  const dateRangeWhere = getBusinessGraphDateRange(dateRange);

  if (subject === 'purchases') {
    const purchases = await em.find(
      Purchase,
      {
        store: storeWhere,
        status: PurchaseStatus.DONE,
        ...dateRangeWhere,
      },
      {
        populate: ['customer', 'items', 'sequence'],
        orderBy: { createdAt: 'DESC' },
        limit,
        refresh: true,
      },
    );
    const total = purchases.reduce(
      (sum, purchase) => sum + getItemsTotal(purchase.items.getItems()),
      0,
    );

    return createReport(
      subject,
      `Purchase report ${period.label}`,
      [
        reportMetric('Purchases shown', purchases.length),
        reportMetric('Purchase cost', total, 'currency'),
      ],
      [
        reportTable(
          'Purchases',
          ['Purchase code', 'Customer', 'Items', 'Total', 'Date'],
          purchases.map((purchase) => [
            getSequenceCode(purchase.sequence, purchase.id),
            purchase.customer.name,
            purchase.items.getItems().length,
            getItemsTotal(purchase.items.getItems()),
            purchase.createdAt?.toISOString() ?? '',
          ]),
        ),
      ],
      period,
    );
  }

  const stats = await getDashboardRangeStats(
    dashboardService,
    store,
    employeeId,
    dateRange,
  );
  const dailyStats = stats.dailyBreakdown ?? [];
  const salesOnly = subject === 'sales';
  const profitOnly = subject === 'profit';
  const graphRows = dailyStats.map((day) => ({
    label: day.date,
    value: profitOnly ? day.profit.total : day.sales.total,
  }));

  return createReport(
    subject,
    `${salesOnly ? 'Sales' : profitOnly ? 'Profit' : 'Business summary'} report ${period.label}`,
    [
      ...(!profitOnly
        ? [reportMetric('Total sales', stats.sales.total, 'currency')]
        : []),
      ...(!salesOnly
        ? [reportMetric('Profit', stats.profit.total, 'currency')]
        : []),
    ],
    [
      reportTable(
        'Daily performance',
        salesOnly
          ? ['Date', 'Sales']
          : profitOnly
            ? ['Date', 'Profit']
            : ['Date', 'Sales', 'Profit'],
        dailyStats.map((day) =>
          salesOnly
            ? [day.date, day.sales.total]
            : profitOnly
              ? [day.date, day.profit.total]
              : [day.date, day.sales.total, day.profit.total],
        ),
      ),
    ],
    period,
    includeGraphs
      ? [
          toGraph(graphRows, {
            type: 'line',
            title: `${profitOnly ? 'Profit' : 'Sales'} ${period.label}`,
            xAxisLabel: 'Date',
            yAxisLabel: profitOnly ? 'Profit' : 'Sales',
            valueFormat: 'currency',
          }),
        ]
      : [],
  );
}

async function createBusinessGraph(
  context: AiAssistantToolContext,
  {
    subject,
    metrics,
    dateRange,
    comparisonPeriods,
    limit,
    type,
  }: {
    subject?: BusinessGraphSubject;
    metrics?: DashboardGraphMetricName[];
    dateRange?: BusinessDateRange;
    comparisonPeriods?: BusinessGraphComparisonPeriod[];
    limit: number;
    type: AiAssistantGraph['type'];
  },
): Promise<AiAssistantGraph> {
  const { dashboardService, em, store } = context;
  if (metrics?.length) {
    if (comparisonPeriods)
      throw new Error(
        'Use one subject with comparisonPeriods, or metrics with one dateRange.',
      );
    if (!dateRange)
      throw new Error(
        'An explicit dateRange is required for a multi-metric graph.',
      );

    return createDashboardMetricsGraph(context, { metrics, dateRange, type });
  }

  if (!subject) throw new Error('A graph subject is required.');
  const dashboardMetricName = DASHBOARD_SUBJECT_METRICS[subject];
  if (comparisonPeriods) {
    return createBusinessComparisonGraph(context, {
      subject,
      periods: comparisonPeriods,
      limit,
      type,
    });
  }

  if (dashboardMetricName) {
    if (!dateRange)
      throw new Error(
        'An explicit dateRange is required for dashboard graph metrics.',
      );
    return createDashboardMetricsGraph(context, {
      metrics: [dashboardMetricName],
      dateRange,
      type,
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
  const productRows = (
    item: typeof SaleItem | typeof PurchasedItem,
    transaction: 'sale' | 'purchase',
    transactionWhere: typeof saleWhere | typeof purchaseWhere,
    value: RawQueryFragment,
  ) =>
    em
      .createQueryBuilder(item, 'item')
      .select(['product.name as label', value.as('value')])
      .innerJoin(`item.${transaction}`, transaction)
      .innerJoin('item.product', 'product')
      .where(
        transaction === 'sale'
          ? { sale: transactionWhere }
          : { purchase: transactionWhere },
      )
      .groupBy(['product.id', 'product.name'])
      .orderBy({ [rawSql.ref('value').toString()]: 'DESC' })
      .limit(limit)
      .execute<GraphRow[]>('all');
  const customerPaymentRows = (transaction: 'sale' | 'purchase') =>
    em
      .createQueryBuilder(Payment, 'payment')
      .select([
        'customer.id as id',
        'customer.name as label',
        rawSql`sum(payment.amount)`.as('value'),
      ])
      .innerJoin(`payment.${transaction}`, transaction)
      .innerJoin(`${transaction}.customer`, 'customer')
      .where(
        transaction === 'sale'
          ? { status: PaymentStatus.Done, sale: saleWhere }
          : { status: PaymentStatus.Done, purchase: purchaseWhere },
      )
      .groupBy(['customer.id', 'customer.name'])
      .orderBy({ [rawSql.ref('value').toString()]: 'DESC' })
      .limit(limit)
      .execute<CustomerGraphRow[]>('all');
  if (subject === 'customers_by_sales_and_profit') {
    const paidSales = await customerPaymentRows('sale');
    const profits = await dashboardService.getCustomerProfitBreakdown(
      store,
      dateRange,
      limit,
      paidSales.map((row) => row.id),
    );
    const profitByCustomer = new Map(profits.map((row) => [row.id, row.value]));

    return AiAssistantGraphSchema.parse({
      type,
      title: `Customer paid sales and profit ${getBusinessDateRangeLabel(dateRange)}`,
      xAxisLabel: 'Customer',
      yAxisLabel: 'Amount',
      valueFormat: 'currency',
      labels: paidSales.map((row) => row.label),
      datasets: [
        {
          label: 'Paid sales',
          data: paidSales.map((row) => Number(row.value)),
        },
        {
          label: 'Profit',
          data: paidSales.map((row) => profitByCustomer.get(row.id) ?? 0),
        },
      ],
    });
  }
  const definitions: Partial<Record<BusinessGraphSubject, GraphDefinition>> = {
    top_selling_products: {
      title: 'Top selling products',
      yAxisLabel: 'Quantity sold',
      valueFormat: 'number',
      loadRows: () =>
        productRows(SaleItem, 'sale', saleWhere, rawSql`sum(item.quantity)`),
    },
    products_by_sold_value: {
      title: 'Products by sold value',
      yAxisLabel: 'Sold value',
      valueFormat: 'currency',
      loadRows: () =>
        productRows(
          SaleItem,
          'sale',
          saleWhere,
          rawSql`sum(item.quantity * item.unit_price)`,
        ),
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
            rawSql`sum(stock.quantity)`.as('value'),
          ])
          .innerJoin('stock.product', 'product')
          .innerJoin('stock.inventory', 'inventory')
          .where({ inventory: { store: { id: store.id } } })
          .groupBy(['product.id', 'product.name'])
          .orderBy({ [rawSql.ref('value').toString()]: 'DESC' })
          .limit(limit)
          .execute<GraphRow[]>('all'),
    },
    customers_by_paid_sales: {
      title: 'Customers by paid sales',
      yAxisLabel: 'Paid amount',
      valueFormat: 'currency',
      loadRows: () => customerPaymentRows('sale'),
    },
    customers_by_profit: {
      title: 'Customers by profit',
      yAxisLabel: 'Profit',
      valueFormat: 'currency',
      loadRows: () =>
        dashboardService.getCustomerProfitBreakdown(store, dateRange, limit),
    },
    top_purchased_products: {
      title: 'Top purchased products',
      yAxisLabel: 'Purchased quantity',
      valueFormat: 'number',
      loadRows: () =>
        productRows(
          PurchasedItem,
          'purchase',
          purchaseWhere,
          rawSql`sum(item.quantity)`,
        ),
    },
    products_by_purchase_cost: {
      title: 'Products by purchase cost',
      yAxisLabel: 'Purchase cost',
      valueFormat: 'currency',
      loadRows: () =>
        productRows(
          PurchasedItem,
          'purchase',
          purchaseWhere,
          rawSql`sum(item.quantity * item.unit_price)`,
        ),
    },
    purchase_customers_by_paid_amount: {
      title: 'Purchase customers by paid amount',
      yAxisLabel: 'Paid amount',
      valueFormat: 'currency',
      loadRows: () => customerPaymentRows('purchase'),
    },
    sales_by_cashier: {
      title: 'Sales received by cashier',
      yAxisLabel: 'Received amount',
      valueFormat: 'currency',
      loadRows: () =>
        em
          .createQueryBuilder(Payment, 'payment')
          .select([
            rawSql`concat(employee.first_name, ' ', employee.last_name)`.as(
              'label',
            ),
            rawSql`sum(payment.amount)`.as('value'),
          ])
          .innerJoin('payment.sale', 'sale')
          .innerJoin('payment.storeSession', 'session')
          .innerJoin('session.openedBy', 'employee')
          .where({ status: PaymentStatus.Done, sale: saleWhere })
          .groupBy(['employee.id', 'employee.first_name', 'employee.last_name'])
          .orderBy({ [rawSql.ref('value').toString()]: 'DESC' })
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

async function createDashboardMetricsGraph(
  {
    dashboardService,
    store,
    employeeId,
  }: Pick<AiAssistantToolContext, 'dashboardService' | 'store' | 'employeeId'>,
  {
    metrics,
    dateRange,
    type,
  }: {
    metrics: DashboardGraphMetricName[];
    dateRange: BusinessDateRange;
    type: AiAssistantGraph['type'];
  },
): Promise<AiAssistantGraph> {
  const selectedMetrics = metrics.map(
    (metricName) => DASHBOARD_GRAPH_METRICS[metricName],
  );
  const valueFormat = selectedMetrics[0].valueFormat;
  if (selectedMetrics.some((metric) => metric.valueFormat !== valueFormat))
    throw new Error(
      'A multi-metric graph can only combine metrics with the same value format.',
    );

  const stats = await getDashboardRangeStats(
    dashboardService,
    store,
    employeeId,
    dateRange,
  );
  const dailyStats = stats.dailyBreakdown ?? [];
  const labels = dailyStats.length
    ? dailyStats.map((day) => day.date)
    : [getBusinessDateRangeLabel(dateRange)];

  return AiAssistantGraphSchema.parse({
    type,
    title: `${selectedMetrics.map((metric) => metric.label).join(' and ')} ${getBusinessDateRangeLabel(dateRange)}`,
    xAxisLabel: dailyStats.length ? 'Date' : 'Period',
    yAxisLabel:
      selectedMetrics.length === 1
        ? selectedMetrics[0].label
        : valueFormat === 'currency'
          ? 'Amount'
          : 'Count',
    valueFormat,
    labels,
    datasets: selectedMetrics.map((metric) => ({
      label: metric.label,
      data: dailyStats.length
        ? dailyStats.map((day) => metric.getDailyValue(day))
        : [metric.getTotalValue(stats)],
    })),
  });
}

async function createBusinessComparisonGraph(
  context: AiAssistantToolContext,
  {
    subject,
    periods,
    limit,
    type,
  }: {
    subject: BusinessGraphSubject;
    periods: BusinessGraphComparisonPeriod[];
    limit: number;
    type: AiAssistantGraph['type'];
  },
): Promise<AiAssistantGraph> {
  if (
    subject === 'inventory_by_quantity' ||
    subject === 'customers_by_sales_and_profit'
  ) {
    throw new Error(
      'This graph subject cannot be compared across historical periods.',
    );
  }

  const graphs = await Promise.all(
    periods.map((period) =>
      createBusinessGraph(context, { subject, dateRange: period, limit, type }),
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

function getDashboardRangeStats(
  dashboardService: DashboardService,
  store: Store,
  employeeId: string,
  dateRange: BusinessDateRange,
) {
  return dashboardService.getDashboardStats(
    store,
    employeeId,
    {
      range: DashboardRange.CUSTOM,
      from: dateRange.from,
      to: dateRange.to,
    },
    { allowLongRange: true, includeDailyBreakdown: true },
  );
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

function reportMetric(
  label: string,
  value: number,
  valueFormat: 'number' | 'currency' = 'number',
) {
  return { label, value, valueFormat };
}

function reportTable(
  title: string,
  columns: string[],
  rows: Array<Array<string | number>>,
) {
  return { title, columns, rows };
}

function createReport(
  reportType: BusinessReportSubject,
  title: string,
  summary: AiAssistantReport['summary'],
  tables: AiAssistantReport['tables'],
  period?: ReportPeriod,
  graphs: AiAssistantGraph[] = [],
): AiAssistantReport {
  return AiAssistantReportSchema.parse({
    type: 'report',
    reportType,
    title,
    generatedAt: new Date().toISOString(),
    summary,
    tables,
    graphs,
    ...(period ? { period } : {}),
  });
}

function getItemsTotal<T extends { quantity?: number; unitPrice?: number }>(
  items: T[],
  onItem?: (item: T) => number,
): number {
  return items.reduce(
    (total, item) =>
      onItem
        ? total + onItem(item)
        : total + (item.quantity ?? 0) * (item.unitPrice ?? 0),
    0,
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSequenceCode(
  sequence?: SequenceLike | null,
  fallback = '',
): string {
  return sequence
    ? `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`
    : fallback;
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

async function getCustomerInsights(
  { dashboardService, em, store, storeWhere }: AiAssistantToolContext,
  { customerId, query, dateRange, includeProfit, limit }: CustomerInsightInput,
) {
  const where: Record<string, any> = {
    store: storeWhere,
    ...(customerId ? { id: customerId } : {}),
  };
  if (query?.trim()) {
    const value = `%${query.trim()}%`;
    where.$or = [{ name: { $ilike: value } }, { phone: { $ilike: value } }];
  }

  const [totalCount, customers] = await Promise.all([
    em.count(Customer, where),
    em.find(Customer, where, {
      orderBy: { createdAt: 'DESC' },
      limit,
      refresh: true,
    }),
  ]);
  if (!customers.length) return { totalCount, customers: [] };

  const customerIds = customers.map((customer) => customer.id);
  const createdAt = getBusinessGraphDateRange(dateRange);
  const [sales, purchases] = await Promise.all([
    em.find(
      Sale,
      {
        store: storeWhere,
        customer: { id: { $in: customerIds } },
        status: SaleStatus.DONE,
        ...createdAt,
      },
      { populate: ['customer', 'items'], refresh: true },
    ),
    em.find(
      Purchase,
      {
        store: storeWhere,
        customer: { id: { $in: customerIds } },
        status: PurchaseStatus.DONE,
        ...createdAt,
      },
      { populate: ['customer', 'items'], refresh: true },
    ),
  ]);
  const saleTotals = new Map(
    sales.map((sale) => [sale.id, getItemsTotal(sale.items.getItems())]),
  );
  const purchaseTotals = new Map(
    purchases.map((purchase) => [
      purchase.id,
      getItemsTotal(purchase.items.getItems()),
    ]),
  );
  const paymentConditions = [
    ...(sales.length
      ? [{ sale: { id: { $in: [...saleTotals.keys()] } } }]
      : []),
    ...(purchases.length
      ? [{ purchase: { id: { $in: [...purchaseTotals.keys()] } } }]
      : []),
  ];
  const payments = paymentConditions.length
    ? await em.find(
        Payment,
        { status: PaymentStatus.Done, $or: paymentConditions },
        { populate: ['sale', 'purchase'], refresh: true },
      )
    : [];
  const paidBySale = new Map<string, number>();
  const paidByPurchase = new Map<string, number>();
  for (const payment of payments) {
    if (payment.sale?.id)
      paidBySale.set(
        payment.sale.id,
        (paidBySale.get(payment.sale.id) ?? 0) + payment.amount,
      );
    if (payment.purchase?.id)
      paidByPurchase.set(
        payment.purchase.id,
        (paidByPurchase.get(payment.purchase.id) ?? 0) + payment.amount,
      );
  }

  const totalsByCustomer = new Map(
    customerIds.map((id) => [
      id,
      {
        saleCount: 0,
        salesTotal: 0,
        paidSales: 0,
        purchaseCount: 0,
        purchaseTotal: 0,
        paidPurchases: 0,
      },
    ]),
  );
  for (const sale of sales) {
    const totals = totalsByCustomer.get(sale.customer.id)!;
    const total = saleTotals.get(sale.id) ?? 0;
    totals.saleCount += 1;
    totals.salesTotal += total;
    totals.paidSales += Math.min(total, paidBySale.get(sale.id) ?? 0);
  }
  for (const purchase of purchases) {
    const totals = totalsByCustomer.get(purchase.customer.id)!;
    const total = purchaseTotals.get(purchase.id) ?? 0;
    totals.purchaseCount += 1;
    totals.purchaseTotal += total;
    totals.paidPurchases += Math.min(
      total,
      paidByPurchase.get(purchase.id) ?? 0,
    );
  }
  const profitByCustomer = includeProfit
    ? new Map(
        (
          await dashboardService.getCustomerProfitBreakdown(
            store,
            dateRange,
            customerIds.length,
            customerIds,
          )
        ).map((row) => [row.id, row.value]),
      )
    : new Map<string, number>();

  return {
    totalCount,
    customers: customers.map((customer) => {
      const totals = totalsByCustomer.get(customer.id)!;
      const salesTotal = roundMoney(totals.salesTotal);
      const paidSales = roundMoney(totals.paidSales);
      const purchaseTotal = roundMoney(totals.purchaseTotal);
      const paidPurchases = roundMoney(totals.paidPurchases);
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        saleCount: totals.saleCount,
        salesTotal,
        paidSales,
        salesBalance: roundMoney(salesTotal - paidSales),
        purchaseCount: totals.purchaseCount,
        purchaseTotal,
        paidPurchases,
        purchaseBalance: roundMoney(purchaseTotal - paidPurchases),
        ...(includeProfit
          ? { profit: roundMoney(profitByCustomer.get(customer.id) ?? 0) }
          : {}),
        createdAt: customer.createdAt,
      };
    }),
  };
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

async function getEmployeeTransactions(
  em: EntityManager,
  entity: typeof Sale | typeof Purchase,
  storeWhere: { id: string },
  ids: string[],
): Promise<TransactionSummaryRecord[]> {
  if (!ids.length) return [];

  return em.find(
    entity,
    { store: storeWhere, id: { $in: ids } },
    {
      populate: ['items', 'items.product', 'customer'],
      orderBy: { createdAt: 'DESC' },
      refresh: true,
    },
  );
}
