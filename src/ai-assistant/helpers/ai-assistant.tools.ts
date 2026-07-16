import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DailyStats, DashboardRange, DashboardStats } from '../../dashboard/dto/dashboard.dto';
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
import { AiAssistantGraphSchema, type AiAssistantGraph } from './ai-assistant.response.schema';

const DEFAULT_TOOL_LIMIT = 10;
const MAX_TOOL_LIMIT = 50;
const TOOL_LIMIT = z.number().int().min(1).max(MAX_TOOL_LIMIT).optional().default(DEFAULT_TOOL_LIMIT);
const LIMIT_INPUT = z.object({ limit: TOOL_LIMIT });
const PRODUCT_QUERY_INPUT = z.object({ query: z.string().optional() });
const DASHBOARD_RANGES: Record<string, DashboardRange> = {
  today: DashboardRange.TODAY,
  yesterday: DashboardRange.YESTERDAY,
  last_week: DashboardRange.LAST_WEEK,
  monthly: DashboardRange.MONTHLY,
  custom: DashboardRange.CUSTOM,
};

type LiveEntityResource =
  | 'employees'
  | 'categories'
  | 'payments'
  | 'stock_ins'
  | 'stock_outs'
  | 'stock_movements'
  | 'cash_movements'
  | 'receipts'
  | 'journal_entries';

type DashboardGraphMetricName = 'sales' | 'profit' | 'cash_in' | 'cash_out' | 'sessions_opened' | 'sessions_closed';
type BusinessGraphSubject =
  | 'dashboard_sales'
  | 'dashboard_profit'
  | 'dashboard_cash_in'
  | 'dashboard_cash_out'
  | 'dashboard_sessions_opened'
  | 'dashboard_sessions_closed'
  | 'top_selling_products'
  | 'products_by_sold_value'
  | 'inventory_by_quantity'
  | 'customers_by_paid_sales'
  | 'top_purchased_products'
  | 'products_by_purchase_cost'
  | 'purchase_customers_by_paid_amount'
  | 'sales_by_cashier';
type BusinessGraphRange = 'all_time' | 'today' | 'last_week' | 'monthly' | 'custom';
type DashboardGraphMetric = {
  label: string;
  valueFormat: 'currency' | 'number';
  color: string;
  getDailyValue: (day: DailyStats) => number;
  getTotalValue: (stats: DashboardStats) => number;
};
type GraphRow = { label: string; value: string | number };

interface CreateAiAssistantToolsParams {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
}

export function createAiAssistantTools({ dashboardService, em, store, employeeId }: CreateAiAssistantToolsParams) {
  const storeWhere = { id: store.id };
  const scope = { storeId: store.id, storeName: store.name };
  return {
    answerWithoutBusinessData: tool({
      description:
        'Use only when the question does not request live AsanPOS database values. This includes general POS guidance, greetings, and out-of-scope questions. Never use this tool for counts, totals, lists, dashboard values, stock, sales, purchases, customers, sessions, or other factual store data.',
      inputSchema: z.object({
        reason: z.enum(['general_pos_guidance', 'out_of_scope']),
      }),
      execute: async ({ reason }) => ({
        reason,
        instruction:
          reason === 'out_of_scope'
            ? 'Explain briefly that you only help with AsanPOS and store operations.'
            : 'Answer using general AsanPOS knowledge without inventing store-specific facts or numbers.',
      }),
    }),

    getDashboardStats: tool({
      description:
        'Get current-store sales, profit, cashier breakdown, low-stock alerts, out-of-stock alerts, and daily breakdowns for analytical POS questions.',
      inputSchema: z.object({
        range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
        from: z
          .string()
          .optional()
          .describe('ISO date string for custom range start, for example 2026-07-01. Required when range is custom.'),
        to: z
          .string()
          .optional()
          .describe('ISO date string for custom range end, for example 2026-07-07. Required when range is custom.'),
      }),
      execute: async ({ range, from, to }) => {
        const stats = await dashboardService.getDashboardStats(store, employeeId, {
          range: DASHBOARD_RANGES[range],
          from,
          to,
        });
        return { scope, stats };
      },
    }),

    createBusinessGraph: tool({
      description:
        'Create a verified graph from current-store data. Supports dashboard sales, profit, cash movements, sessions, top selling products, sold value by product, inventory quantity by product, customers by paid sales, top purchased products, purchase cost by product, purchase customers by paid amount, and sales by cashier. Use only when the user explicitly asks for a graph, chart, trend, ranking, or visualization. Never invent values.',
      inputSchema: z.object({
        subject: z.enum([
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
        ]),
        range: z.enum(['all_time', 'today', 'last_week', 'monthly', 'custom']).optional(),
        from: z.string().optional().describe('ISO date string required for a custom range start.'),
        to: z.string().optional().describe('ISO date string required for a custom range end.'),
        limit: z.number().int().min(1).max(20).optional().default(10),
        type: z.enum(['line', 'bar', 'pie', 'doughnut']).optional().default('bar'),
      }),
      execute: async ({ subject, range, from, to, limit, type }) => {
        const graph = await createBusinessGraph({
          dashboardService,
          em,
          store,
          employeeId,
          subject,
          range: range ?? (isDashboardGraphSubject(subject) ? 'monthly' : 'all_time'),
          from,
          to,
          limit,
          type,
        });
        return { scope, graph };
      },
    }),

    searchProducts: tool({
      description: 'Search products by name or product code and include current stock quantities by inventory.',
      inputSchema: z.object({
        query: z.string().optional(),
        lowStockOnly: z.boolean().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ query, lowStockOnly, limit }) => {
        const take = limit;
        const where = createProductWhere(storeWhere, query);
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
        const stockByProduct = groupBy(stockRecords, (record) => record.product.id);

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
            .filter((product) => !lowStockOnly || product.stock.some((stock) => stock.quantity <= 10)),
        };
      },
    }),

    getProductCount: tool({
      description:
        'Return the total number of products in the current store, optionally filtered by product name or product code.',
      inputSchema: PRODUCT_QUERY_INPUT,
      execute: async ({ query }) => {
        const where = createProductWhere(storeWhere, query);
        return { scope, totalCount: await em.count(Product, where) };
      },
    }),

    getInventorySummary: tool({
      description: 'Summarize inventories, total stock records, low-stock products, and out-of-stock products.',
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
        const [totalStockRecordCount, lowStockCount, outOfStockCount, stockRecords] = await Promise.all([
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
        const recordsByInventory = groupBy(stockRecords, (record) => record.inventory.id);

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
              totalQuantity: records.reduce((sum, record) => sum + (record.quantity ?? 0), 0),
              lowStockProducts: records
                .filter((record) => (record.quantity ?? 0) > 0 && (record.quantity ?? 0) <= 10)
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
        resource: z.enum([
          'employees',
          'categories',
          'payments',
          'stock_ins',
          'stock_outs',
          'stock_movements',
          'cash_movements',
          'receipts',
          'journal_entries',
        ]),
      }),
      execute: async ({ resource }) => ({
        scope,
        resource,
        totalCount: await getLiveEntityCount(em, storeWhere, resource as LiveEntityResource),
      }),
    }),

    getSalesSummary: tool({
      description:
        'Get all sales totals, status breakdown, recent sales, and top products for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
        const take = limit;
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

        const statusBreakdown = sales.reduce<Record<string, number>>((summary, sale) => {
          summary[sale.status] = (summary[sale.status] ?? 0) + 1;
          return summary;
        }, {});
        const productTotals = new Map<
          string,
          {
            productId: string;
            name?: string;
            quantity: number;
            sales: number;
          }
        >();

        for (const sale of sales) {
          for (const item of sale.items.getItems()) {
            const productId = item.product.id;
            const current = productTotals.get(productId) ?? {
              productId,
              name: item.product.name,
              quantity: 0,
              sales: 0,
            };
            current.quantity += item.quantity ?? 0;
            current.sales += (item.quantity ?? 0) * (item.unitPrice ?? 0);
            productTotals.set(productId, current);
          }
        }

        return {
          scope,
          count: sales.length,
          totalSales: sales.reduce(
            (sum, sale) =>
              sum +
              sale.items
                .getItems()
                .reduce((itemSum, item) => itemSum + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
            0,
          ),
          statusBreakdown,
          topProducts: Array.from(productTotals.values())
            .sort((a, b) => b.sales - a.sales)
            .slice(0, take),
          recentSales: sales.slice(0, take).map((sale) => ({
            id: sale.id,
            status: sale.status,
            customerName: sale.customer?.name,
            total: sale.items.getItems().reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
            createdAt: sale.createdAt,
          })),
        };
      },
    }),

    getPurchaseSummary: tool({
      description:
        'Get all purchase totals, status breakdown, recent purchases, and purchased products for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
        const take = limit;
        const purchaseIds = await getEmployeeCreatedEntityIds(em, store, employeeId, AuditEntityType.Purchase);

        if (!purchaseIds.length) {
          return {
            scope,
            count: 0,
            totalPurchases: 0,
            statusBreakdown: {},
            recentPurchases: [],
          };
        }

        const purchases = await em.find(
          Purchase,
          {
            store: storeWhere,
            id: { $in: purchaseIds },
          },
          {
            populate: ['items', 'items.product', 'customer'],
            orderBy: { createdAt: 'DESC' },
            refresh: true,
          },
        );

        const statusBreakdown = purchases.reduce<Record<string, number>>((summary, purchase) => {
          summary[purchase.status] = (summary[purchase.status] ?? 0) + 1;
          return summary;
        }, {});

        return {
          scope,
          count: purchases.length,
          totalPurchases: purchases.reduce(
            (sum, purchase) =>
              sum + purchase.items.getItems().reduce((itemSum, item) => itemSum + item.quantity * item.unitPrice, 0),
            0,
          ),
          statusBreakdown,
          recentPurchases: purchases.slice(0, take).map((purchase) => ({
            id: purchase.id,
            status: purchase.status,
            customerName: purchase.customer?.name,
            total: purchase.items.getItems().reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
            createdAt: purchase.createdAt,
          })),
        };
      },
    }),

    getCustomerSummary: tool({
      description: 'Search customers and summarize their sale and purchase counts for the current logged-in employee.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ query, limit }) => {
        const take = limit;
        const [saleIds, purchaseIds] = await Promise.all([
          getEmployeeSaleIds(em, store, employeeId),
          getEmployeeCreatedEntityIds(em, store, employeeId, AuditEntityType.Purchase),
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
              paymentTotal: session.payments.getItems().reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
              cashIn: cashTotals.cashIn,
              cashOut: cashTotals.cashOut,
            };
          }),
        };
      },
    }),

    getAuditActivity: tool({
      description: 'Get recent audit activity for the current logged-in employee.',
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

async function createBusinessGraph({
  dashboardService,
  em,
  store,
  employeeId,
  subject,
  range,
  from,
  to,
  limit,
  type,
}: {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
  subject: BusinessGraphSubject;
  range: BusinessGraphRange;
  from?: string;
  to?: string;
  limit: number;
  type: AiAssistantGraph['type'];
}): Promise<AiAssistantGraph> {
  if (isDashboardGraphSubject(subject)) {
    const dashboardRange = range === 'all_time' ? 'monthly' : range;
    const metric = getDashboardGraphMetric(getDashboardMetricName(subject));
    const stats = await dashboardService.getDashboardStats(store, employeeId, {
      range: DASHBOARD_RANGES[dashboardRange],
      from,
      to,
    });
    const dailyStats = stats.dailyBreakdown ?? [];
    const rows = dailyStats.length
      ? dailyStats.map((day) => ({ label: day.date, value: metric.getDailyValue(day) }))
      : [{ label: getDashboardGraphRangeLabel(dashboardRange, from, to), value: metric.getTotalValue(stats) }];

    return toGraph(rows, {
      type,
      title: `${metric.label} ${getDashboardGraphRangeLabel(dashboardRange, from, to)}`,
      xAxisLabel: dailyStats.length ? 'Date' : 'Period',
      yAxisLabel: metric.label,
      valueFormat: metric.valueFormat,
      color: metric.color,
    });
  }

  const dateRange = getBusinessGraphDateRange(range, from, to);
  const saleWhere = { store: { id: store.id }, status: SaleStatus.DONE, ...dateRange };
  const purchaseWhere = { store: { id: store.id }, status: PurchaseStatus.DONE, ...dateRange };
  let rows: GraphRow[];
  let title: string;
  let yAxisLabel: string;
  let valueFormat: AiAssistantGraph['valueFormat'];
  let color: string;

  switch (subject) {
    case 'top_selling_products':
      rows = await em
        .createQueryBuilder(SaleItem, 'item')
        .select(['product.name as label', 'sum(item.quantity) as value'])
        .innerJoin('item.sale', 'sale')
        .innerJoin('item.product', 'product')
        .where({ sale: saleWhere })
        .groupBy(['product.id', 'product.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Top selling products';
      yAxisLabel = 'Quantity sold';
      valueFormat = 'number';
      color = '#2563eb';
      break;
    case 'products_by_sold_value':
      rows = await em
        .createQueryBuilder(SaleItem, 'item')
        .select(['product.name as label', 'sum(item.quantity * item.unit_price) as value'])
        .innerJoin('item.sale', 'sale')
        .innerJoin('item.product', 'product')
        .where({ sale: saleWhere })
        .groupBy(['product.id', 'product.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Products by sold value';
      yAxisLabel = 'Sold value';
      valueFormat = 'currency';
      color = '#16a34a';
      break;
    case 'inventory_by_quantity':
      rows = await em
        .createQueryBuilder(StockQuantity, 'stock')
        .select(['product.name as label', 'sum(stock.quantity) as value'])
        .innerJoin('stock.product', 'product')
        .innerJoin('stock.inventory', 'inventory')
        .where({ inventory: { store: { id: store.id } } })
        .groupBy(['product.id', 'product.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Inventory by quantity';
      yAxisLabel = 'Available quantity';
      valueFormat = 'number';
      color = '#7c3aed';
      break;
    case 'customers_by_paid_sales':
      rows = await em
        .createQueryBuilder(Payment, 'payment')
        .select(['customer.name as label', 'sum(payment.amount) as value'])
        .innerJoin('payment.sale', 'sale')
        .innerJoin('sale.customer', 'customer')
        .where({ status: PaymentStatus.Done, sale: saleWhere })
        .groupBy(['customer.id', 'customer.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Customers by paid sales';
      yAxisLabel = 'Paid amount';
      valueFormat = 'currency';
      color = '#0891b2';
      break;
    case 'top_purchased_products':
      rows = await em
        .createQueryBuilder(PurchasedItem, 'item')
        .select(['product.name as label', 'sum(item.quantity) as value'])
        .innerJoin('item.purchase', 'purchase')
        .innerJoin('item.product', 'product')
        .where({ purchase: purchaseWhere })
        .groupBy(['product.id', 'product.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Top purchased products';
      yAxisLabel = 'Purchased quantity';
      valueFormat = 'number';
      color = '#ea580c';
      break;
    case 'products_by_purchase_cost':
      rows = await em
        .createQueryBuilder(PurchasedItem, 'item')
        .select(['product.name as label', 'sum(item.quantity * item.unit_price) as value'])
        .innerJoin('item.purchase', 'purchase')
        .innerJoin('item.product', 'product')
        .where({ purchase: purchaseWhere })
        .groupBy(['product.id', 'product.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Products by purchase cost';
      yAxisLabel = 'Purchase cost';
      valueFormat = 'currency';
      color = '#dc2626';
      break;
    case 'purchase_customers_by_paid_amount':
      rows = await em
        .createQueryBuilder(Payment, 'payment')
        .select(['customer.name as label', 'sum(payment.amount) as value'])
        .innerJoin('payment.purchase', 'purchase')
        .innerJoin('purchase.customer', 'customer')
        .where({ status: PaymentStatus.Done, purchase: purchaseWhere })
        .groupBy(['customer.id', 'customer.name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Purchase customers by paid amount';
      yAxisLabel = 'Paid amount';
      valueFormat = 'currency';
      color = '#9333ea';
      break;
    case 'sales_by_cashier':
      rows = await em
        .createQueryBuilder(Payment, 'payment')
        .select(["concat(employee.first_name, ' ', employee.last_name) as label", 'sum(payment.amount) as value'])
        .innerJoin('payment.sale', 'sale')
        .innerJoin('payment.storeSession', 'session')
        .innerJoin('session.openedBy', 'employee')
        .where({ status: PaymentStatus.Done, sale: saleWhere })
        .groupBy(['employee.id', 'employee.first_name', 'employee.last_name'])
        .orderBy({ value: 'DESC' })
        .limit(limit)
        .execute<GraphRow[]>('all');
      title = 'Sales received by cashier';
      yAxisLabel = 'Received amount';
      valueFormat = 'currency';
      color = '#0f766e';
      break;
    default:
      throw new Error('The graph subject is not supported.');
  }

  return toGraph(rows, {
    type,
    title: `${title} ${getBusinessGraphRangeLabel(range, from, to)}`,
    xAxisLabel: 'Category',
    yAxisLabel,
    valueFormat,
    color,
  });
}

function isDashboardGraphSubject(subject: BusinessGraphSubject): boolean {
  return [
    'dashboard_sales',
    'dashboard_profit',
    'dashboard_cash_in',
    'dashboard_cash_out',
    'dashboard_sessions_opened',
    'dashboard_sessions_closed',
  ].includes(subject);
}

function getDashboardMetricName(subject: BusinessGraphSubject): DashboardGraphMetricName {
  switch (subject) {
    case 'dashboard_sales':
      return 'sales';
    case 'dashboard_profit':
      return 'profit';
    case 'dashboard_cash_in':
      return 'cash_in';
    case 'dashboard_cash_out':
      return 'cash_out';
    case 'dashboard_sessions_opened':
      return 'sessions_opened';
    case 'dashboard_sessions_closed':
      return 'sessions_closed';
    default:
      throw new Error('The graph subject is not a dashboard metric.');
  }
}

function getBusinessGraphDateRange(range: BusinessGraphRange, from?: string, to?: string): Record<string, unknown> {
  if (range === 'all_time') return {};

  if (range === 'custom') {
    if (!from || !to) throw new Error('from and to are required for a custom graph range.');
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end)
      throw new Error('The custom graph range is invalid.');
    end.setUTCHours(23, 59, 59, 999);
    return { createdAt: { $gte: start, $lte: end } };
  }

  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (range === 'today' ? 0 : range === 'last_week' ? 6 : 29));
  return { createdAt: { $gte: start, $lte: end } };
}

function getBusinessGraphRangeLabel(range: BusinessGraphRange, from?: string, to?: string): string {
  if (range === 'custom') return from && to ? `${from} to ${to}` : 'Custom range';
  return range === 'all_time' ? 'All time' : getDashboardGraphRangeLabel(range, from, to);
}

function toGraph(
  rows: GraphRow[],
  config: Omit<AiAssistantGraph, 'labels' | 'datasets'> & { color: string },
): AiAssistantGraph {
  return AiAssistantGraphSchema.parse({
    ...config,
    labels: rows.map((row) => row.label),
    datasets: [
      {
        label: config.yAxisLabel,
        data: rows.map((row) => Number(row.value) || 0),
        color: config.color,
      },
    ],
  });
}

function getDashboardGraphMetric(metric: DashboardGraphMetricName): DashboardGraphMetric {
  const cashierTotal = (stats: DashboardStats, field: 'cashIn' | 'cashOut') =>
    (stats.cashierBreakdown ?? []).reduce((sum, cashier) => sum + cashier[field], 0);
  const sessionTotal = (stats: DashboardStats, closed: boolean) =>
    (stats.cashierBreakdown ?? []).filter((cashier) => (closed ? cashier.status === 'closed' : true)).length;

  switch (metric) {
    case 'sales':
      return {
        label: 'Sales',
        valueFormat: 'currency',
        color: '#2563eb',
        getDailyValue: (day) => day.sales.total,
        getTotalValue: (stats) => stats.sales.total,
      };
    case 'profit':
      return {
        label: 'Profit',
        valueFormat: 'currency',
        color: '#16a34a',
        getDailyValue: (day) => day.profit.total,
        getTotalValue: (stats) => stats.profit.total,
      };
    case 'cash_in':
      return {
        label: 'Cash in',
        valueFormat: 'currency',
        color: '#0891b2',
        getDailyValue: (day) => day.cashIn,
        getTotalValue: (stats) => cashierTotal(stats, 'cashIn'),
      };
    case 'cash_out':
      return {
        label: 'Cash out',
        valueFormat: 'currency',
        color: '#dc2626',
        getDailyValue: (day) => day.cashOut,
        getTotalValue: (stats) => cashierTotal(stats, 'cashOut'),
      };
    case 'sessions_opened':
      return {
        label: 'Opened sessions',
        valueFormat: 'number',
        color: '#7c3aed',
        getDailyValue: (day) => day.sessionsOpened,
        getTotalValue: (stats) => sessionTotal(stats, false),
      };
    case 'sessions_closed':
      return {
        label: 'Closed sessions',
        valueFormat: 'number',
        color: '#ea580c',
        getDailyValue: (day) => day.sessionsClosed,
        getTotalValue: (stats) => sessionTotal(stats, true),
      };
  }
}

function getDashboardGraphRangeLabel(range: string, from?: string, to?: string): string {
  if (range === 'custom') return from && to ? `${from} to ${to}` : 'Custom range';
  return range
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function createProductWhere(storeWhere: { id: string }, query?: string): Record<string, any> {
  const where: Record<string, any> = { store: storeWhere };
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return where;

  const parts = normalizedQuery.split('-');
  const lastIndex = parts.length === 2 ? Number(parts[1]) : 0;
  const code =
    parts.length === 2 && parts[0] && Number.isInteger(lastIndex) && lastIndex > 0
      ? { prefix: parts[0], lastIndex }
      : null;
  where.$or = [
    { name: { $ilike: `%${normalizedQuery}%` } },
    ...(code ? [{ sequence: { prefix: code.prefix, lastIndex: code.lastIndex } }] : []),
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
  switch (resource) {
    case 'employees':
      return em.count(Employee, { store: storeWhere });
    case 'categories':
      return em.count(Category, { store: storeWhere });
    case 'payments':
      return em.count(Payment, {
        $or: [{ sale: { store: storeWhere } }, { purchase: { store: storeWhere } }],
      });
    case 'stock_ins':
      return em.count(StockIn, { inventory: { store: storeWhere } });
    case 'stock_outs':
      return em.count(StockOut, { sale: { store: storeWhere } });
    case 'stock_movements':
      return em.count(StockMovement, { store: storeWhere });
    case 'cash_movements':
      return em.count(CashMovement, { storeSession: { store: storeWhere } });
    case 'receipts':
      return em.count(Receipt, { store: storeWhere });
    case 'journal_entries':
      return em.count(JournalEntry, { store: storeWhere });
  }
}

async function getEmployeeSaleIds(em: EntityManager, store: Store, employeeId: string): Promise<string[]> {
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

  return [...new Set(payments.map((payment) => payment.sale?.id).filter((id): id is string => Boolean(id)))];
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

  return [...new Set(logs.map((log) => log.entityId).filter((id): id is string => Boolean(id)))];
}
