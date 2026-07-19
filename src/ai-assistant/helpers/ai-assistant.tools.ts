import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardRange } from '../../dashboard/dto/dashboard.dto';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { CashMovement } from '../../database/entites/cash-movement.entity';
import { Category } from '../../database/entites/category.entity';
import { Employee } from '../../database/entites/employee.entity';
import { JournalEntry } from '../../database/entites/journal-entry.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Receipt } from '../../database/entites/receipt.entity';
import { StockIn } from '../../database/entites/stock-in.entity';
import { StockMovement } from '../../database/entites/stock-movement.entity';
import { StockOut } from '../../database/entites/stock-out.entity';
import { Store } from '../../database/entites/store.entity';
import { StoreSession } from '../../database/entites/store-session.entity';
import { getEmployeeFullName } from '../../shared/utils/employee-name.util';
import type { AiAssistantGraph } from './ai-assistant.response.schema';
import { createAiAssistantBusinessData } from './ai-assistant.business-data';

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

export const LIVE_ENTITY_RESOURCES = [
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
export const BUSINESS_GRAPH_SUBJECTS = [
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
export const DASHBOARD_GRAPH_METRIC_NAMES = [
  'sales',
  'profit',
  'cash_in',
  'cash_out',
  'sessions_opened',
  'sessions_closed',
] as const;

export type LiveEntityResource = (typeof LIVE_ENTITY_RESOURCES)[number];
export type BusinessGraphSubject = (typeof BUSINESS_GRAPH_SUBJECTS)[number];
export type DashboardGraphMetricName =
  (typeof DASHBOARD_GRAPH_METRIC_NAMES)[number];
export type BusinessDateRange = { from: string; to: string; label?: string };
export type BusinessGraphComparisonPeriod = BusinessDateRange & {
  label: string;
};
export type ProductCode = { prefix: string; number: number };
export type CustomerInsightInput = {
  customerId?: string;
  query?: string;
  dateRange?: BusinessDateRange;
  includeProfit: boolean;
  limit: number;
};
export type BusinessGraphInput = {
  subject?: BusinessGraphSubject;
  metrics?: DashboardGraphMetricName[];
  dateRange?: BusinessDateRange;
  comparisonPeriods?: BusinessGraphComparisonPeriod[];
  limit: number;
  type: AiAssistantGraph['type'];
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
  const data = createAiAssistantBusinessData({
    dashboardService,
    em,
    store,
    employeeId,
  });

  return {
    getDashboardStats: tool({
      description:
        'Get live sales, profit, and daily business metrics for one explicit inclusive date range in the verified store. Use getInventorySummary for current stock alerts.',
      inputSchema: z.object({ dateRange: DATE_RANGE_INPUT }),
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
        graph: await data.createBusinessGraph(input),
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
      execute: async (input) => ({
        scope,
        ...(await data.searchProducts(input)),
      }),
    }),

    getProductCount: tool({
      description:
        'Return the total number of products in the current store, optionally filtered by product name or product code.',
      inputSchema: PRODUCT_QUERY_INPUT,
      execute: async (input) => ({
        scope,
        ...(await data.getProductCount(input)),
      }),
    }),

    getInventorySummary: tool({
      description:
        'Summarize inventories, total stock records, low-stock products, and out-of-stock products.',
      inputSchema: z.object({
        inventoryId: z.string().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async (input) => ({
        scope,
        ...(await data.getInventorySummary(input)),
      }),
    }),

    getLiveEntityCount: tool({
      description:
        'Return the exact current count for a CRUD resource in the verified store. Use this for employees, categories, payments, stock-ins, stock-outs, stock movements, cash movements, receipts, or journal entries.',
      inputSchema: z.object({ resource: z.enum(LIVE_ENTITY_RESOURCES) }),
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
      execute: async ({ limit }) => ({
        scope,
        ...(await data.getSalesSummary(limit)),
      }),
    }),

    getPurchaseSummary: tool({
      description:
        'Get all purchase totals, status breakdown, recent purchases, and purchased products for the current logged-in employee.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => ({
        scope,
        ...(await data.getPurchaseSummary(limit)),
      }),
    }),

    getCustomerSummary: tool({
      description:
        'Answer customer questions in the verified store. List customers when no customer ID, name, or phone is supplied, using exactly the requested limit. Search by customer ID, name, or phone when one is supplied. Return contact details, sale and purchase counts, billed totals, paid amounts, outstanding balances, and customer profit when includeProfit is true. Use this for any customer-specific question before saying customer data is unavailable.',
      inputSchema: CUSTOMER_INSIGHT_INPUT,
      execute: async (input) => ({
        scope,
        ...(await data.getCustomerSummary(input)),
      }),
    }),

    getOpenSessions: tool({
      description:
        'Get currently open cashier sessions for the current logged-in employee with payments and cash movement totals.',
      inputSchema: LIMIT_INPUT,
      execute: async ({ limit }) => {
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
            limit,
            refresh: true,
          },
        );
        return {
          scope,
          sessions: sessions.map((session) => {
            const cashTotals = session.cashMovements.getItems().reduce(
              (totals, movement) => {
                if (movement.type === 'cash_in')
                  totals.cashIn += movement.amount ?? 0;
                if (movement.type === 'cash_out')
                  totals.cashOut += movement.amount ?? 0;
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
        const logs = await em.find(
          AuditLog,
          { employee: { id: employeeId, store: storeWhere } },
          {
            populate: ['employee'],
            orderBy: { createdAt: 'DESC' },
            limit,
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
