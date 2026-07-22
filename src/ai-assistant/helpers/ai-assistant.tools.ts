import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { CreateCustomerDto } from '../../customer/dto/create-customer.dto';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DashboardRange } from '../../dashboard/dto/dashboard.dto';
import { Account } from '../../database/entites/account.entity';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { CashMovement } from '../../database/entites/cash-movement.entity';
import { Category } from '../../database/entites/category.entity';
import { Customer } from '../../database/entites/customer.entity';
import { Employee } from '../../database/entites/employee.entity';
import { Inventory } from '../../database/entites/inventory.entity';
import { JournalEntry } from '../../database/entites/journal-entry.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Receipt } from '../../database/entites/receipt.entity';
import { Product } from '../../database/entites/product.entity';
import { StockIn } from '../../database/entites/stock-in.entity';
import { StockMovement } from '../../database/entites/stock-movement.entity';
import { StockOut } from '../../database/entites/stock-out.entity';
import { Store } from '../../database/entites/store.entity';
import { StoreSession } from '../../database/entites/store-session.entity';
import { AuditService } from '../../audit/audit.service';
import { CreateInventoryDto } from '../../inventory/dto/create-inventory.dto';
import { CreateProductDto } from '../../products/dto/create-product.dto';
import { UpdateProductDto } from '../../products/dto/update-product.dto';
import { SequenceService } from '../../sequence/sequence.service';
import { AuditActionType } from '../../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';
import { getEmployeeFullName } from '../../shared/utils/employee-name.util';
import { validateDto } from '../../shared/utils/validate-dto.util';
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
const PRODUCT_CATEGORY_INPUT = z.object({
  categoryName: z.string().trim().min(1).max(255),
});
const CREATE_PRODUCT_INPUT = z.object({
  name: z.string(),
  price: z.number(),
  categoryName: z.string(),
});
const PRODUCT_ID_INPUT = z.object({
  productId: z.string().uuid(),
});
const UPDATE_PRODUCT_INPUT = PRODUCT_ID_INPUT.extend({
  name: z.string().optional(),
  price: z.number().optional(),
  categoryName: z.string().optional(),
});
const CREATE_CATEGORY_INPUT = z.object({
  name: z.string(),
});
const CREATE_INVENTORY_INPUT = z.object({
  name: z.string(),
  address: z.string(),
});
const CREATE_CUSTOMER_INPUT = z.object({
  name: z.string(),
  phone: z.string(),
  address: z.string(),
});
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

const BUSINESS_GRAPH_INPUT = z.object({
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
  type: z.enum(['line', 'bar', 'pie', 'doughnut']).optional().default('bar'),
});
const BUSINESS_PDF_INPUT = BUSINESS_GRAPH_INPUT.extend({
  title: z.string().min(1).optional().describe('Optional exact PDF title.'),
  includeGraph: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Set true only when the user explicitly asks for a graph in the PDF.',
    ),
});

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
export type BusinessPdfInput = BusinessGraphInput & {
  title?: string;
  includeGraph: boolean;
};

interface CreateAiAssistantToolsParams {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
  auditService: AuditService;
  sequenceService: SequenceService;
}

export function createAiAssistantTools({
  dashboardService,
  em,
  store,
  employeeId,
  auditService,
  sequenceService,
}: CreateAiAssistantToolsParams) {
  const storeWhere = { id: store.id };
  const scope = { storeId: store.id, storeName: store.name };
  const data = createAiAssistantBusinessData({
    dashboardService,
    em,
    store,
    employeeId,
  });
  const getCurrentEmployee = async (manager = em) => {
    const employee = await manager.findOne(Employee, {
      id: employeeId,
      store: storeWhere,
    });
    if (!employee) throw new Error('Employee not found');
    return employee;
  };
  const invalidInput = (errors: string[]) => ({
    scope,
    created: false,
    message: errors.join(' '),
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
      inputSchema: BUSINESS_GRAPH_INPUT,
      execute: async (input) => ({
        scope,
        graph: await data.createBusinessGraph(input),
      }),
    }),

    createBusinessPdf: tool({
      description:
        'Create exactly one backend-generated PDF from verified current-store data. It always includes a summary and data table. Set includeGraph to true only when the user explicitly asks for a graph or chart inside the PDF. Use subject for one measure, comparisonPeriods for one measure across multiple periods, or metrics for multiple compatible dashboard measures over one date range. Do not use metrics and comparisonPeriods together.',
      inputSchema: BUSINESS_PDF_INPUT,
      execute: async (input) => ({
        scope,
        pdf: await data.createBusinessPdf(input),
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

    createCategory: tool({
      description:
        'Create one category in the verified store after the user supplies its name. Do not create a product with it unless the user separately asks for a product.',
      inputSchema: CREATE_CATEGORY_INPUT,
      execute: async (input) => {
        const validation = await validateDto(CreateCategoryDto, input);
        if (!validation.valid) return invalidInput(validation.errors);

        const { name } = validation.value;
        const existing = await em.findOne(Category, {
          name,
          store: storeWhere,
        });
        if (existing)
          return {
            scope,
            created: false,
            message: `Category "${name}" already exists in this store.`,
          };

        const category = em.create(Category, { name, store });
        await em.persistAndFlush(category);
        auditService.log(
          em,
          await getCurrentEmployee(),
          AuditEntityType.Category,
          category.id,
          AuditActionType.Create,
          null,
          null,
        );
        await em.flush();

        return {
          scope,
          created: true,
          category: { id: category.id, name: category.name },
        };
      },
    }),

    getProductCategory: tool({
      description:
        'Verify whether one product category is available in the verified store. Use this before creating a product when the user gives a category name. Do not create a category.',
      inputSchema: PRODUCT_CATEGORY_INPUT,
      execute: async ({ categoryName }) => {
        const category = await em.findOne(Category, {
          name: { $ilike: categoryName },
          store: storeWhere,
        });

        return {
          scope,
          available: Boolean(category),
          category: category ? { id: category.id, name: category.name } : null,
        };
      },
    }),

    createProduct: tool({
      description:
        'Create one product in the verified store. Call only after the user has supplied a name, selling price, and category. The category is checked again here, and no product is created when it is unavailable.',
      inputSchema: CREATE_PRODUCT_INPUT,
      execute: async (input) => {
        const validation = await validateDto(CreateProductDto, input);
        if (!validation.valid) return invalidInput(validation.errors);

        const { name, price, categoryName } = validation.value;
        const category = await em.findOne(Category, {
          name: { $ilike: categoryName },
          store: storeWhere,
        });
        if (!category)
          return {
            scope,
            created: false,
            message: `Category "${categoryName}" is not available in this store.`,
          };

        const sequence = await sequenceService.generateSequence(
          store,
          'Product',
          'PDT',
        );
        const product = em.create(Product, {
          name,
          price,
          sequence,
          store,
          updatedAt: null,
        });
        product.categories.add(category);

        const employee = await getCurrentEmployee();

        auditService.log(
          em,
          employee,
          AuditEntityType.Product,
          product.id,
          AuditActionType.Create,
          null,
          null,
        );
        await em.persistAndFlush(product);

        return {
          scope,
          created: true,
          product: {
            id: product.id,
            name,
            price,
            category: { id: category.id, name: category.name },
            productCode: sequenceService.formatSequence(sequence),
          },
        };
      },
    }),

    updateProduct: tool({
      description:
        'Update one existing product in the verified store. First use searchProducts to identify the exact product and use its returned ID. Send only fields the user explicitly wants to change: name, price, or categoryName. When changing category, it must already exist in the verified store. Do not update product images or attachments.',
      inputSchema: UPDATE_PRODUCT_INPUT,
      execute: async ({ productId, ...input }) => {
        const validation = await validateDto(UpdateProductDto, input);
        if (!validation.valid)
          return {
            scope,
            updated: false,
            message: validation.errors.join(' '),
          };

        const dto = validation.value;
        if (
          dto.name === undefined &&
          dto.price === undefined &&
          dto.categoryName === undefined
        )
          return {
            scope,
            updated: false,
            message: 'Provide at least one product field to update.',
          };

        const product = await em.findOne(
          Product,
          { id: productId, store: storeWhere },
          { populate: ['categories'] },
        );
        if (!product)
          return {
            scope,
            updated: false,
            message: 'Product not found in this store.',
          };

        const category =
          dto.categoryName === undefined
            ? undefined
            : await em.findOne(Category, {
                name: { $ilike: dto.categoryName },
                store: storeWhere,
              });
        if (dto.categoryName !== undefined && !category)
          return {
            scope,
            updated: false,
            message: `Category "${dto.categoryName}" is not available in this store.`,
          };

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};

        if (dto.name !== undefined && dto.name !== product.name) {
          before.name = product.name;
          after.name = dto.name;
          product.name = dto.name;
        }

        if (dto.price !== undefined && dto.price !== product.price) {
          before.price = product.price;
          after.price = dto.price;
          product.price = dto.price;
        }

        const currentCategoryName = product.categories
          .getItems()
          .map((currentCategory) => currentCategory.name)
          .join(', ');
        if (category && category.name !== currentCategoryName) {
          before.category = currentCategoryName;
          after.category = category.name;
          product.categories.set([category]);
        }

        const categories = product.categories
          .getItems()
          .map((currentCategory) => ({
            id: currentCategory.id,
            name: currentCategory.name,
          }));
        if (!Object.keys(before).length)
          return {
            scope,
            updated: false,
            message: 'The product already has the requested values.',
            product: {
              id: product.id,
              name: product.name,
              price: product.price,
              categories,
            },
          };

        product.updatedAt = new Date();
        auditService.log(
          em,
          await getCurrentEmployee(),
          AuditEntityType.Product,
          product.id,
          AuditActionType.Update,
          before,
          after,
        );
        await em.flush();

        return {
          scope,
          updated: true,
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            categories,
          },
        };
      },
    }),

    deleteProduct: tool({
      description:
        'Soft-delete one existing product in the verified store. First use searchProducts to identify the exact product and use its returned ID. Call only when the user explicitly asks to delete that product. Do not delete when the product is ambiguous.',
      inputSchema: PRODUCT_ID_INPUT,
      execute: async ({ productId }) => {
        const product = await em.findOne(Product, {
          id: productId,
          store: storeWhere,
        });
        if (!product)
          return {
            scope,
            deleted: false,
            message: 'Product not found in this store.',
          };

        auditService.log(
          em,
          await getCurrentEmployee(),
          AuditEntityType.Product,
          product.id,
          AuditActionType.Delete,
          { name: product.name, price: product.price },
          null,
        );
        product.deletedAt = new Date();
        await em.flush();

        return {
          scope,
          deleted: true,
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
          },
        };
      },
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

    createInventory: tool({
      description:
        'Create one inventory in the verified store after the user supplies its name and address. An inventory starts empty; do not add products or stock unless the user separately asks.',
      inputSchema: CREATE_INVENTORY_INPUT,
      execute: async (input) => {
        const validation = await validateDto(CreateInventoryDto, input);
        if (!validation.valid) return invalidInput(validation.errors);

        const { name, address } = validation.value;
        const existing = await em.findOne(Inventory, {
          name,
          store: storeWhere,
        });
        if (existing)
          return {
            scope,
            created: false,
            message: `Inventory "${name}" already exists in this store.`,
          };

        const inventory = em.create(Inventory, { name, address, store });
        await em.persistAndFlush(inventory);
        auditService.log(
          em,
          await getCurrentEmployee(),
          AuditEntityType.Inventory,
          inventory.id,
          AuditActionType.Create,
          null,
          null,
        );
        await em.flush();

        return {
          scope,
          created: true,
          inventory: {
            id: inventory.id,
            name: inventory.name,
            address: inventory.address,
          },
        };
      },
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

    createCustomer: tool({
      description:
        'Create one customer in the verified store after the user supplies a name, phone number, and address. It also creates the customer payable and receivable accounts. Do not create a customer when the phone number already belongs to a customer in this store.',
      inputSchema: CREATE_CUSTOMER_INPUT,
      execute: async (input) => {
        const validation = await validateDto(CreateCustomerDto, input);
        if (!validation.valid) return invalidInput(validation.errors);

        const { name, phone, address } = validation.value;
        return em.transactional(async (transactionalEm) => {
          const existing = await transactionalEm.findOne(Customer, {
            phone,
            store: storeWhere,
          });
          if (existing)
            return {
              scope,
              created: false,
              message: `Customer with phone "${phone}" already exists in this store.`,
            };

          const payable = transactionalEm.create(Account, {
            name: `${name} - Accounts Payable`,
            type: 'liability',
          });
          const receivable = transactionalEm.create(Account, {
            name: `${name} - Accounts Receivable`,
            type: 'asset',
          });
          transactionalEm.persist(payable);
          transactionalEm.persist(receivable);

          const customer = transactionalEm.create(Customer, {
            name,
            phone,
            address,
            store,
            payable,
            receivable,
          });
          await transactionalEm.persistAndFlush(customer);

          auditService.log(
            transactionalEm,
            await getCurrentEmployee(transactionalEm),
            AuditEntityType.Customer,
            customer.id,
            AuditActionType.Create,
            null,
            null,
          );
          await transactionalEm.flush();

          return {
            scope,
            created: true,
            customer: {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
            },
          };
        });
      },
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
