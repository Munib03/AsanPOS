import { BadRequestException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardRange } from '../../dashboard/dto/dashboard.dto';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { Customer } from '../../database/entites/customer.entity';
import { Inventory } from '../../database/entites/inventory.entity';
import { Product } from '../../database/entites/product.entity';
import { Purchase } from '../../database/entites/purchase.entity';
import { Sale } from '../../database/entites/sale.entity';
import { StockQuantity } from '../../database/entites/stock-quantity.entity';
import { Store } from '../../database/entites/store.entity';
import { StoreSession } from '../../database/entites/store-session.entity';
import { getEmployeeFullName } from '../../shared/utils/employee-name.util';

const DEFAULT_TOOL_LIMIT = 10;
const MAX_TOOL_LIMIT = 50;

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
  const rangeSchema = z.object({
    range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
    from: z.string().optional(),
    to: z.string().optional(),
  });

  return {
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

        return dashboardService.getDashboardStats(store, employeeId, {
          range: rangeMap[range],
          from,
          to,
        });
      },
    }),

    searchProducts: tool({
      description:
        'Search products by name or barcode and include current stock quantities by inventory.',
      inputSchema: z.object({
        query: z.string().optional(),
        lowStockOnly: z.boolean().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, lowStockOnly, limit }) => {
        const take = clampToolLimit(limit);
        const where: Record<string, any> = { store };
        if (query?.trim()) {
          const q = `%${query.trim()}%`;
          where.$or = [{ name: { $ilike: q } }, { barcode: { $ilike: q } }];
        }

        const products = await em.find(Product, where, {
          orderBy: { name: 'ASC' },
          limit: take,
          refresh: true,
        });
        const productIds = products.map((product) => product.id);
        const stockRecords = productIds.length
          ? await em.find(
              StockQuantity,
              {
                product: { id: { $in: productIds } },
                inventory: { store },
                ...(lowStockOnly ? { quantity: { $lte: 10 } } : {}),
              },
              { populate: ['inventory', 'product'], refresh: true },
            )
          : [];

        return products
          .map((product) => ({
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            price: product.price,
            stock: stockRecords
              .filter((record) => record.product.id === product.id)
              .map((record) => ({
                inventoryId: record.inventory.id,
                inventoryName: record.inventory.name,
                quantity: record.quantity ?? 0,
              })),
          }))
          .filter(
            (product) =>
              !lowStockOnly ||
              product.stock.some((stock) => stock.quantity <= 10),
          );
      },
    }),

    getInventorySummary: tool({
      description:
        'Summarize inventories, total stock records, low-stock products, and out-of-stock products.',
      inputSchema: z.object({
        inventoryId: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ inventoryId, limit }) => {
        const take = clampToolLimit(limit);
        const inventories = await em.find(
          Inventory,
          {
            store,
            ...(inventoryId ? { id: inventoryId } : {}),
          },
          {
            orderBy: { name: 'ASC' },
            limit: take,
            refresh: true,
          },
        );

        const inventoryIds = inventories.map((inventory) => inventory.id);
        const stockRecords = inventoryIds.length
          ? await em.find(
              StockQuantity,
              { inventory: { id: { $in: inventoryIds } } },
              { populate: ['inventory', 'product'], refresh: true },
            )
          : [];

        return inventories.map((inventory) => {
          const records = stockRecords.filter(
            (record) => record.inventory.id === inventory.id,
          );
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
        });
      },
    }),

    getSalesSummary: tool({
      description:
        'Get sales totals, status breakdown, recent sales, and top products for a date range.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const sales = await em.find(
          Sale,
          {
            store,
            createdAt: { $gte: bounds.from, $lte: bounds.to },
          },
          {
            populate: ['items', 'items.product', 'customer'],
            orderBy: { createdAt: 'DESC' },
            refresh: true,
          },
        );

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
          from: bounds.from.toISOString(),
          to: bounds.to.toISOString(),
          count: sales.length,
          totalSales: sales.reduce((sum, sale) => sum + calcSaleTotal(sale), 0),
          statusBreakdown,
          topProducts: Array.from(productTotals.values())
            .sort((a, b) => b.sales - a.sales)
            .slice(0, take),
          recentSales: sales.slice(0, take).map((sale) => ({
            id: sale.id,
            status: sale.status,
            customerName: sale.customer?.name,
            total: calcSaleTotal(sale),
            createdAt: sale.createdAt,
          })),
        };
      },
    }),

    getPurchaseSummary: tool({
      description:
        'Get purchase totals, status breakdown, recent purchases, and purchased products for a date range.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const purchases = await em.find(
          Purchase,
          {
            store,
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
        'Search customers and summarize their sale and purchase counts.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, limit }) => {
        const take = clampToolLimit(limit);
        const where: Record<string, any> = { store };
        if (query?.trim()) {
          const q = `%${query.trim()}%`;
          where.$or = [{ name: { $ilike: q } }, { phone: { $ilike: q } }];
        }

        const customers = await em.find(Customer, where, {
          orderBy: { createdAt: 'DESC' },
          limit: take,
          refresh: true,
        });

        return Promise.all(
          customers.map(async (customer) => {
            const [saleCount, purchaseCount] = await Promise.all([
              em.count(Sale, { store, customer }),
              em.count(Purchase, { store, customer }),
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
      },
    }),

    getOpenSessions: tool({
      description:
        'Get currently open cashier sessions with payments and cash movement totals.',
      inputSchema: z.object({
        limit: z.number().optional(),
      }),
      execute: async ({ limit }) => {
        const take = clampToolLimit(limit);
        const sessions = await em.find(
          StoreSession,
          { store, closedAt: null },
          {
            populate: ['openedBy', 'payments', 'cashMovements'],
            orderBy: { openedAt: 'DESC' },
            limit: take,
            refresh: true,
          },
        );

        return sessions.map((session) => ({
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
        }));
      },
    }),

    getAuditActivity: tool({
      description: 'Get recent audit activity for the current store employees.',
      inputSchema: rangeSchema.extend({
        limit: z.number().optional(),
      }),
      execute: async ({ range, from, to, limit }) => {
        const take = clampToolLimit(limit);
        const bounds = getToolRange(range, from, to);
        const logs = await em.find(
          AuditLog,
          {
            employee: { store },
            createdAt: { $gte: bounds.from, $lte: bounds.to },
          },
          {
            populate: ['employee'],
            orderBy: { createdAt: 'DESC' },
            limit: take,
            refresh: true,
          },
        );

        return logs.map((log) => ({
          id: log.id,
          employeeId: log.employee.id,
          employeeName: getEmployeeFullName(log.employee),
          actionType: log.actionType,
          entityType: log.entityType,
          entityId: log.entityId,
          createdAt: log.createdAt,
        }));
      },
    }),
  };
}

function clampToolLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_TOOL_LIMIT;
  return Math.min(Math.floor(limit), MAX_TOOL_LIMIT);
}

function getToolRange(range: string, from?: string, to?: string) {
  const now = new Date();
  const startOfDay = (date: Date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  const endOfDay = (date: Date) => {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  };
  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  };

  if (range === 'custom') {
    if (!from || !to)
      throw new BadRequestException(
        'from and to are required for custom range',
      );

    return {
      from: startOfDay(new Date(from)),
      to: endOfDay(new Date(to)),
    };
  }

  if (range === 'yesterday') {
    const yesterday = addDays(now, -1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  }

  if (range === 'last_week') {
    return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
  }

  if (range === 'monthly') {
    return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
  }

  return { from: startOfDay(now), to: endOfDay(now) };
}

function calcSaleTotal(sale: Sale): number {
  return sale.items
    .getItems()
    .reduce(
      (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
      0,
    );
}
