import { sql, type RawQueryFragment } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { DashboardService } from '../../dashboard/dashboard.service';
import {
  DailyStats,
  DashboardRange,
  DashboardStats,
} from '../../dashboard/dto/dashboard.dto';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { Customer } from '../../database/entites/customer.entity';
import { Inventory } from '../../database/entites/inventory.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Product } from '../../database/entites/product.entity';
import { Purchase } from '../../database/entites/purchase.entity';
import { PurchasedItem } from '../../database/entites/purchased_item.entity';
import { Sale } from '../../database/entites/sale.entity';
import { SaleItem } from '../../database/entites/sale-item.entity';
import { StockQuantity } from '../../database/entites/stock-quantity.entity';
import { Store } from '../../database/entites/store.entity';
import { AuditActionType } from '../../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';
import { PaymentStatus } from '../../shared/utils/payments-status.enum';
import { PurchaseStatus } from '../../shared/utils/purchase-status-enum';
import { SaleStatus } from '../../shared/utils/sale-status.enum';
import {
  AiAssistantGraphSchema,
  type AiAssistantGraph,
} from './ai-assistant.response.schema';
import type {
  BusinessDateRange,
  BusinessGraphComparisonPeriod,
  BusinessGraphInput,
  BusinessGraphSubject,
  CustomerInsightInput,
  DashboardGraphMetricName,
  ProductCode,
} from './ai-assistant.tools';

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): RawQueryFragment;
  ref(name: string): RawQueryFragment;
};

const rawSql = sql as SqlTag;

type AiAssistantBusinessDataParams = {
  dashboardService: DashboardService;
  em: EntityManager;
  store: Store;
  employeeId: string;
};
type DataContext = AiAssistantBusinessDataParams & {
  storeWhere: { id: string };
};
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

export function createAiAssistantBusinessData(
  params: AiAssistantBusinessDataParams,
) {
  const context: DataContext = {
    ...params,
    storeWhere: { id: params.store.id },
  };
  const { em, storeWhere } = context;

  return {
    createBusinessGraph: (input: BusinessGraphInput) =>
      createBusinessGraph(context, input),
    searchProducts: async ({
      query,
      productCode,
      lowStockOnly,
      limit,
    }: {
      query?: string;
      productCode?: ProductCode;
      lowStockOnly?: boolean;
      limit: number;
    }) => {
      const where = createProductWhere(storeWhere, query, productCode);
      const [totalCount, products] = await Promise.all([
        em.count(Product, where),
        em.find(Product, where, {
          orderBy: { name: 'ASC' },
          limit,
          refresh: true,
          populate: ['sequence'],
        }),
      ]);
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
        totalCount,
        returnedCount: products.length,
        products: products
          .map((product) => ({
            id: product.id,
            name: product.name,
            productCode: product.sequence
              ? getSequenceCode(product.sequence)
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
    getProductCount: async ({
      query,
      productCode,
    }: {
      query?: string;
      productCode?: ProductCode;
    }) => ({
      totalCount: await em.count(
        Product,
        createProductWhere(storeWhere, query, productCode),
      ),
    }),
    getInventorySummary: (input: { inventoryId?: string; limit: number }) =>
      getInventorySummary(context, input),
    getSalesSummary: async (limit: number) => {
      const sales = await getEmployeeTransactions(
        context,
        Sale,
        await getEmployeeSaleIds(context),
      );
      const summary = summarizeTransactions(sales, limit, true);
      return {
        count: summary.count,
        totalSales: summary.total,
        statusBreakdown: summary.statusBreakdown,
        topProducts: summary.topProducts,
        recentSales: summary.recentTransactions,
      };
    },
    getPurchaseSummary: async (limit: number) => {
      const purchases = await getEmployeeTransactions(
        context,
        Purchase,
        await getEmployeeCreatedEntityIds(context, AuditEntityType.Purchase),
      );
      const summary = summarizeTransactions(purchases, limit);
      return {
        count: summary.count,
        totalPurchases: summary.total,
        statusBreakdown: summary.statusBreakdown,
        recentPurchases: summary.recentTransactions,
      };
    },
    getCustomerSummary: (input: CustomerInsightInput) =>
      getCustomerInsights(context, input),
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
    total += getItemsTotal(transaction.items.getItems(), (item) => {
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
    });
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

async function createBusinessGraph(
  context: DataContext,
  {
    subject,
    metrics,
    dateRange,
    comparisonPeriods,
    limit,
    type,
  }: BusinessGraphInput,
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
  if (comparisonPeriods)
    return createBusinessComparisonGraph(context, {
      subject,
      periods: comparisonPeriods,
      limit,
      type,
    });

  const dashboardMetric = DASHBOARD_SUBJECT_METRICS[subject];
  if (dashboardMetric) {
    if (!dateRange)
      throw new Error(
        'An explicit dateRange is required for dashboard graph metrics.',
      );
    return createDashboardMetricsGraph(context, {
      metrics: [dashboardMetric],
      dateRange,
      type,
    });
  }

  const saleWhere = {
    store: { id: store.id },
    status: SaleStatus.DONE,
    ...getBusinessGraphDateRange(dateRange),
  };
  const purchaseWhere = {
    store: { id: store.id },
    status: PurchaseStatus.DONE,
    ...getBusinessGraphDateRange(dateRange),
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
  return toGraph(await definition.loadRows(), {
    type,
    title: `${definition.title} ${getBusinessDateRangeLabel(dateRange)}`,
    xAxisLabel: 'Category',
    yAxisLabel: definition.yAxisLabel,
    valueFormat: definition.valueFormat,
  });
}

async function createDashboardMetricsGraph(
  { dashboardService, store, employeeId }: DataContext,
  {
    metrics,
    dateRange,
    type,
  }: Pick<BusinessGraphInput, 'metrics' | 'dateRange' | 'type'> & {
    metrics: DashboardGraphMetricName[];
    dateRange: BusinessDateRange;
  },
): Promise<AiAssistantGraph> {
  const selectedMetrics = metrics.map(
    (metric) => DASHBOARD_GRAPH_METRICS[metric],
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
    labels: dailyStats.length
      ? dailyStats.map((day) => day.date)
      : [getBusinessDateRangeLabel(dateRange)],
    datasets: selectedMetrics.map((metric) => ({
      label: metric.label,
      data: dailyStats.length
        ? dailyStats.map((day) => metric.getDailyValue(day))
        : [metric.getTotalValue(stats)],
    })),
  });
}

async function createBusinessComparisonGraph(
  context: DataContext,
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
  )
    throw new Error(
      'This graph subject cannot be compared across historical periods.',
    );

  const graphs = await Promise.all(
    periods.map((period) =>
      createBusinessGraph(context, { subject, dateRange: period, limit, type }),
    ),
  );
  const dashboardMetric = DASHBOARD_SUBJECT_METRICS[subject];
  if (dashboardMetric) {
    const metric = DASHBOARD_GRAPH_METRICS[dashboardMetric];
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

async function getInventorySummary(
  { em, storeWhere }: DataContext,
  { inventoryId, limit }: { inventoryId?: string; limit: number },
) {
  const inventoryWhere = {
    store: storeWhere,
    ...(inventoryId ? { id: inventoryId } : {}),
  };
  const [totalInventoryCount, inventories] = await Promise.all([
    em.count(Inventory, inventoryWhere),
    em.find(Inventory, inventoryWhere, {
      orderBy: { name: 'ASC' },
      limit,
      refresh: true,
    }),
  ]);
  const inventoryIds = inventories.map((inventory) => inventory.id);
  const [totalStockRecordCount, lowStockCount, outOfStockCount, stockRecords] =
    await Promise.all([
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
    totalInventoryCount,
    totalStockRecordCount,
    lowStockCount,
    outOfStockCount,
    returnedInventoryCount: inventories.length,
    inventories: inventories.map((inventory) => {
      const records = recordsByInventory.get(inventory.id) ?? [];
      const stockItems = records.map((record) => ({
        id: record.product.id,
        name: record.product.name,
        quantity: record.quantity ?? 0,
      }));
      return {
        id: inventory.id,
        name: inventory.name,
        address: inventory.address,
        productCount: records.length,
        totalQuantity: records.reduce(
          (sum, record) => sum + (record.quantity ?? 0),
          0,
        ),
        lowStockProducts: stockItems.filter(
          (record) => record.quantity > 0 && record.quantity <= 10,
        ),
        outOfStockProducts: stockItems.filter(
          (record) => record.quantity === 0,
        ),
      };
    }),
  };
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
  return (
    dateRange?.label ??
    (dateRange ? `${dateRange.from} to ${dateRange.to}` : 'All time')
  );
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

function getItemsTotal<T extends { quantity?: number; unitPrice?: number }>(
  items: T[],
  onItem?: (item: T) => number,
): number {
  return items.reduce(
    (total, item) =>
      total + (onItem?.(item) ?? (item.quantity ?? 0) * (item.unitPrice ?? 0)),
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
  productCode?: ProductCode,
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

async function getCustomerInsights(
  { dashboardService, em, store, storeWhere }: DataContext,
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

async function getEmployeeSaleIds({ em, store, employeeId }: DataContext) {
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
  return uniqueIds(payments.map((payment) => payment.sale?.id));
}

async function getEmployeeCreatedEntityIds(
  { em, store, employeeId }: DataContext,
  entityType: AuditEntityType,
) {
  const logs = await em.find(
    AuditLog,
    {
      employee: { id: employeeId, store: { id: store.id } },
      entityType,
      actionType: AuditActionType.Create,
    },
    { refresh: true },
  );
  return uniqueIds(logs.map((log) => log.entityId));
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function getEmployeeTransactions(
  { em, storeWhere }: DataContext,
  entity: typeof Sale | typeof Purchase,
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
