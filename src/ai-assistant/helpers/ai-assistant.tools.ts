import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardRange } from '../../dashboard/dto/dashboard.dto';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { Customer } from '../../database/entites/customer.entity';
import { Purchase } from '../../database/entites/purchase.entity';
import { Sale } from '../../database/entites/sale.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Store } from '../../database/entites/store.entity';
import { StoreSession } from '../../database/entites/store-session.entity';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';
import { getEmployeeFullName } from '../../shared/utils/employee-name.util';
import { createCatalogTools } from './ai-assistant.catalog.tools';
import {
  calculateSaleTotal,
  clampToolLimit,
  getEmployeeCreatedEntityIds,
  getEmployeeSaleIdsByRange,
  getLiveEntityCount,
  getToolRange,
  LiveEntityResource,
} from './ai-assistant.tool-helpers';

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
  const rangeSchema = z.object({
    range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
    from: z.string().optional(),
    to: z.string().optional(),
  });

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
        'Get sales, profit, cashier breakdown, low-stock alerts, out-of-stock alerts, and daily breakdowns for analytical POS questions.',
      inputSchema: z.object({
        range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
        from: z
          .string()
          .optional()
          .describe(
            'ISO date string for custom range start, for example 2026-07-01. Required when range is custom.',
          ),
        to: z
          .string()
          .optional()
          .describe(
            'ISO date string for custom range end, for example 2026-07-07. Required when range is custom.',
          ),
      }),
      execute: async ({ range, from, to }) => {
        const rangeMap: Record<string, DashboardRange> = {
          today: DashboardRange.TODAY,
          yesterday: DashboardRange.YESTERDAY,
          last_week: DashboardRange.LAST_WEEK,
          monthly: DashboardRange.MONTHLY,
          custom: DashboardRange.CUSTOM,
        };

        const stats = await dashboardService.getDashboardStats(
          store,
          employeeId,
          {
            range: rangeMap[range],
            from,
            to,
          },
        );
        return { scope, stats };
      },
    }),

    getMyDashboardStats: tool({
      description:
        "Get sales, profit, cashier metrics, and breakdowns for the current logged-in employee's verified store.",
      inputSchema: z.object({
        range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
        from: z
          .string()
          .optional()
          .describe(
            'ISO date string for custom range start, for example 2026-07-01. Required when range is custom.',
          ),
        to: z
          .string()
          .optional()
          .describe(
            'ISO date string for custom range end, for example 2026-07-07. Required when range is custom.',
          ),
      }),
      execute: async ({ range, from, to }) => {
        const rangeMap: Record<string, DashboardRange> = {
          today: DashboardRange.TODAY,
          yesterday: DashboardRange.YESTERDAY,
          last_week: DashboardRange.LAST_WEEK,
          monthly: DashboardRange.MONTHLY,
          custom: DashboardRange.CUSTOM,
        };

        const stats = await dashboardService.getDashboardStats(
          store,
          employeeId,
          {
            range: rangeMap[range],
            from,
            to,
          },
        );
        return { scope, stats };
      },
    }),

    ...createCatalogTools({ em, storeWhere, scope }),

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
        totalCount: await getLiveEntityCount(
          em,
          storeWhere,
          resource as LiveEntityResource,
        ),
      }),
    }),

    getSalesSummary: tool({
      description:
        'Get sales totals, status breakdown, recent sales, and top products for a date range for the current logged-in employee.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const saleIds = await getEmployeeSaleIdsByRange(
          em,
          store,
          employeeId,
          bounds,
        );
        const sales = saleIds.length
          ? await em.find(
              Sale,
              {
                id: { $in: saleIds },
                store: storeWhere,
                createdAt: { $gte: bounds.from, $lte: bounds.to },
              },
              {
                populate: ['items', 'items.product', 'customer'],
                orderBy: { createdAt: 'DESC' },
                refresh: true,
              },
            )
          : [];

        const statusBreakdown = sales.reduce<Record<string, number>>(
          (summary, sale) => {
            summary[sale.status] = (summary[sale.status] ?? 0) + 1;
            return summary;
          },
          {},
        );
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
          from: bounds.from.toISOString(),
          to: bounds.to.toISOString(),
          count: sales.length,
          totalSales: sales.reduce(
            (sum, sale) => sum + calculateSaleTotal(sale),
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
            total: calculateSaleTotal(sale),
            createdAt: sale.createdAt,
          })),
        };
      },
    }),

    getPurchaseSummary: tool({
      description:
        'Get purchase totals, status breakdown, recent purchases, and purchased products for a date range for the current logged-in employee.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const purchaseIds = await getEmployeeCreatedEntityIds(
          em,
          store,
          employeeId,
          AuditEntityType.Purchase,
          bounds,
        );

        if (!purchaseIds.length) {
          return {
            scope,
            from: bounds.from.toISOString(),
            to: bounds.to.toISOString(),
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
            createdAt: { $gte: bounds.from, $lte: bounds.to },
          },
          {
            populate: ['items', 'items.product', 'customer'],
            orderBy: { createdAt: 'DESC' },
            refresh: true,
          },
        );

        const statusBreakdown = purchases.reduce<Record<string, number>>(
          (summary, purchase) => {
            summary[purchase.status] = (summary[purchase.status] ?? 0) + 1;
            return summary;
          },
          {},
        );

        return {
          scope,
          from: bounds.from.toISOString(),
          to: bounds.to.toISOString(),
          count: purchases.length,
          totalPurchases: purchases.reduce(
            (sum, purchase) =>
              sum +
              purchase.items
                .getItems()
                .reduce(
                  (itemSum, item) => itemSum + item.quantity * item.unitPrice,
                  0,
                ),
            0,
          ),
          statusBreakdown,
          recentPurchases: purchases.slice(0, take).map((purchase) => ({
            id: purchase.id,
            status: purchase.status,
            customerName: purchase.customer?.name,
            total: purchase.items
              .getItems()
              .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
            createdAt: purchase.createdAt,
          })),
        };
      },
    }),

    getCustomerSummary: tool({
      description:
        'Search customers and summarize their sale and purchase counts for the current logged-in employee.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, limit }) => {
        const take = clampToolLimit(limit);
        const [saleIds, purchaseIds] = await Promise.all([
          getEmployeeSaleIdsByRange(em, store, employeeId),
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
        limit: z.number().optional(),
      }),
      execute: async ({ limit }) => {
        const take = clampToolLimit(limit);
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
          sessions: sessions.map((session) => ({
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
            cashIn: session.cashMovements
              .getItems()
              .filter((movement) => movement.type === 'cash_in')
              .reduce((sum, movement) => sum + (movement.amount ?? 0), 0),
            cashOut: session.cashMovements
              .getItems()
              .filter((movement) => movement.type === 'cash_out')
              .reduce((sum, movement) => sum + (movement.amount ?? 0), 0),
          })),
        };
      },
    }),

    getAuditActivity: tool({
      description:
        'Get recent audit activity for the current logged-in employee.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const logs = await em.find(
          AuditLog,
          {
            employee: { id: employeeId, store: storeWhere },
            createdAt: { $gte: bounds.from, $lte: bounds.to },
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
