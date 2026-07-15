import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardRange } from '../../dashboard/dto/dashboard.dto';
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
import { Payment } from '../../database/entites/payments.entity';
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

const DEFAULT_TOOL_LIMIT = 10;
const MAX_TOOL_LIMIT = 50;
const TOOL_LIMIT = z
  .number()
  .int()
  .min(1)
  .max(MAX_TOOL_LIMIT)
  .optional()
  .default(DEFAULT_TOOL_LIMIT);
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
        const stats = await dashboardService.getDashboardStats(
          store,
          employeeId,
          {
            range: DASHBOARD_RANGES[range],
            from,
            to,
          },
        );
        return { scope, stats };
      },
    }),

    searchProducts: tool({
      description:
        'Search products by name or product code and include current stock quantities by inventory.',
      inputSchema: z.object({
        query: z.string().optional(),
        lowStockOnly: z.boolean().optional(),
        limit: TOOL_LIMIT,
      }),
      execute: async ({ query, lowStockOnly, limit }) => {
        const take = limit;
        const where: Record<string, any> = { store: storeWhere };
        if (query?.trim()) {
          const queryPattern = `%${query.trim()}%`;
          const code = parseProductCode(query.trim());
          where.$or = [
            { name: { $ilike: queryPattern } },
            ...(code
              ? [
                  {
                    sequence: {
                      prefix: code.prefix,
                      lastIndex: code.lastIndex,
                    },
                  },
                ]
              : []),
          ];
        }

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
        const stockByProduct = new Map<string, typeof stockRecords>();
        for (const record of stockRecords) {
          const productStock = stockByProduct.get(record.product.id) ?? [];
          productStock.push(record);
          stockByProduct.set(record.product.id, productStock);
        }

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
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        const where: Record<string, any> = { store: storeWhere };
        if (query?.trim()) {
          const queryPattern = `%${query.trim()}%`;
          const code = parseProductCode(query.trim());
          where.$or = [
            { name: { $ilike: queryPattern } },
            ...(code
              ? [
                  {
                    sequence: {
                      prefix: code.prefix,
                      lastIndex: code.lastIndex,
                    },
                  },
                ]
              : []),
          ];
        }
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
        const recordsByInventory = new Map<string, typeof stockRecords>();
        for (const record of stockRecords) {
          const inventoryRecords =
            recordsByInventory.get(record.inventory.id) ?? [];
          inventoryRecords.push(record);
          recordsByInventory.set(record.inventory.id, inventoryRecords);
        }

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
        'Get all sales totals, status breakdown, recent sales, and top products for the current logged-in employee.',
      inputSchema: z.object({ limit: TOOL_LIMIT }),
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
        'Get all purchase totals, status breakdown, recent purchases, and purchased products for the current logged-in employee.',
      inputSchema: z.object({ limit: TOOL_LIMIT }),
      execute: async ({ limit }) => {
        const take = limit;
        const purchaseIds = await getEmployeeCreatedEntityIds(
          em,
          store,
          employeeId,
          AuditEntityType.Purchase,
        );

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

        const statusBreakdown = purchases.reduce<Record<string, number>>(
          (summary, purchase) => {
            summary[purchase.status] = (summary[purchase.status] ?? 0) + 1;
            return summary;
          },
          {},
        );

        return {
          scope,
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
      inputSchema: z.object({ limit: TOOL_LIMIT }),
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
        $or: [
          { sale: { store: storeWhere } },
          { purchase: { store: storeWhere } },
        ],
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

function calculateSaleTotal(sale: Sale): number {
  return sale.items
    .getItems()
    .reduce(
      (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
      0,
    );
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

function parseProductCode(
  value: string,
): { prefix: string; lastIndex: number } | null {
  const parts = value.split('-');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const lastIndex = Number(parts[1]);
  return Number.isInteger(lastIndex) && lastIndex > 0
    ? { prefix: parts[0], lastIndex }
    : null;
}
