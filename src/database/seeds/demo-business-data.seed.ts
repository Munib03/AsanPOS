import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

const PRODUCT_COUNT = 1000;
const PURCHASE_COUNT = 1000;
const SALE_COUNT = 1000;
const INVENTORY_COUNT = 100;
const CUSTOMER_COUNT = 100;
const CATEGORY_COUNT = 20;
const SEED_PREFIX = 'seed-demo';
const SEED_EMPLOYEE_ID = process.env.SEED_EMPLOYEE_ID?.trim();
const SEED_STORE_ID = process.env.SEED_STORE_ID?.trim();

type ProductSeed = {
  id: string;
  name: string;
  price: number;
  purchasePrice: number;
  barcode: string;
};

type SequenceSeed = {
  id: string;
  entity: string;
  prefix: string;
  last_index: number;
  created_at: Date;
  updated_at: Date;
};

type PurchaseSeed = {
  id: string;
  customer_id: string;
  inventory_id: string;
  custom_date: Date;
  status: string;
  store_id: string;
  sequence_id: string;
  created_at: Date;
  updated_at: Date;
};

type SaleSeed = {
  id: string;
  inventory_id: string;
  sequence_id: string;
  customer_id: string;
  store_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export async function seed(knex: Knex): Promise<void> {
  const now = new Date();
  const { storeId, employeeId } = await getOrCreateSeedTarget(knex, now);

  const alreadySeeded = await knex('products')
    .where({ store_id: storeId, barcode: `${SEED_PREFIX}-product-0001` })
    .first('id');

  if (alreadySeeded) {
    await deleteExistingSeedData(knex, storeId);
  }

  const accounts = await createSeedAccounts(knex, now, storeId);
  const sessionId = await createSeedSession(knex, storeId, now, employeeId);

  const inventories = buildInventories(storeId, now);
  await insertChunks(knex, 'inventory', inventories);

  const categories = buildCategories(storeId, now);
  await insertChunks(knex, 'categories', categories);

  const products = buildProducts(storeId, now);
  await insertChunks(
    knex,
    'products',
    products.map(({ purchasePrice, ...product }) => product),
  );

  const categoryProducts = buildCategoryProducts(products, categories);
  await insertChunks(knex, 'category_product', categoryProducts);

  const nextCustomerPhone = await getNextCustomerPhoneIndex(knex);
  const customers = await buildCustomers(storeId, now, nextCustomerPhone);
  await insertChunks(knex, 'customer', customers);

  const purchaseSequences = buildSequences(
    'Purchase',
    'PUR',
    PURCHASE_COUNT,
    now,
  );
  await insertChunks(knex, 'sequence', purchaseSequences);

  const purchases = buildPurchases(
    storeId,
    purchaseSequences,
    customers,
    inventories,
    now,
  );
  await insertChunks(knex, 'purchase', purchases);

  const purchasedItems = buildPurchasedItems(
    purchases,
    products,
    inventories,
    now,
  );
  await insertChunks(knex, 'purchased_items', purchasedItems);

  const inventoryProducts = buildInventoryProducts(purchasedItems);
  await insertChunks(knex, 'inventory_product', inventoryProducts);

  const stockInSequences = buildSequences(
    'StockIn',
    'STK',
    PURCHASE_COUNT,
    now,
  );
  await insertChunks(knex, 'sequence', stockInSequences);

  const stockIns = buildStockIns(purchases, stockInSequences, now);
  await insertChunks(knex, 'stock_in', stockIns);

  const stockInItems = buildStockInItems(stockIns, purchasedItems, now);
  await insertChunks(knex, 'stock_in_items', stockInItems);

  const saleSequences = buildSequences('Sale', 'SAL', SALE_COUNT, now);
  await insertChunks(knex, 'sequence', saleSequences);

  const sales = buildSales(storeId, saleSequences, customers, inventories, now);
  await insertChunks(
    knex,
    'sale',
    sales.map(({ inventory_id, ...sale }) => sale),
  );

  const saleItems = buildSaleItems(sales, purchasedItems, products, now);
  await insertChunks(knex, 'sale_items', saleItems);

  const stockQuantities = buildStockQuantities(
    purchasedItems,
    saleItems,
    sales,
    now,
  );
  await insertChunks(knex, 'stock_quantity', stockQuantities);

  const stockOutSequences = buildSequences('StockOut', 'STO', SALE_COUNT, now);
  await insertChunks(knex, 'sequence', stockOutSequences);

  const stockOuts = buildStockOuts(sales, stockOutSequences, now);
  await insertChunks(knex, 'stock_out', stockOuts);

  const stockOutItems = buildStockOutItems(stockOuts, saleItems, now);
  await insertChunks(knex, 'stock_out_items', stockOutItems);

  const salePayments = buildSalePayments(sales, saleItems, sessionId, now);
  await insertChunks(knex, 'payments', salePayments);

  const journalSequences = buildSequences(
    'JournalEntry',
    'JRN',
    SALE_COUNT,
    now,
  );
  await insertChunks(knex, 'sequence', journalSequences);

  const journalEntries = buildJournalEntries(
    sales,
    storeId,
    journalSequences,
    now,
  );
  await insertChunks(knex, 'journal_entry', journalEntries);

  const journalItems = buildJournalItems(
    journalEntries,
    saleItems,
    accounts,
    now,
  );
  await insertChunks(knex, 'journal_entry_items', journalItems);

  const receipts = buildReceipts(
    sales,
    saleItems,
    products,
    storeId,
    sessionId,
    now,
  );
  await insertChunks(knex, 'receipt', receipts);
}

async function deleteExistingSeedData(knex: Knex, storeId: string): Promise<void> {
  const products = await knex('products')
    .where({ store_id: storeId })
    .whereLike('barcode', `${SEED_PREFIX}-product-%`)
    .select('id');
  const productIds = products.map((product) => product.id);

  const customers = await knex('customer')
    .where({ store_id: storeId })
    .whereLike('name', 'Seed Customer %')
    .select('id');
  const customerIds = customers.map((customer) => customer.id);

  const inventories = await knex('inventory')
    .where({ store_id: storeId })
    .whereLike('name', 'Seed Inventory %')
    .select('id');
  const inventoryIds = inventories.map((inventory) => inventory.id);

  const sessions = await knex('store_session')
    .where({ store_id: storeId, opening_note: 'Seed demo session' })
    .select('id');
  const sessionIds = sessions.map((session) => session.id);

  const categories = await knex('categories')
    .where({ store_id: storeId })
    .whereLike('name', 'Seed Category %')
    .select('id');
  const categoryIds = categories.map((category) => category.id);

  const saleItems = productIds.length
    ? await knex('sale_items')
        .whereIn('product_id', productIds)
        .select('id', 'sale_id')
    : [];
  const saleItemIds = saleItems.map((item) => item.id);
  const saleIds = [...new Set(saleItems.map((item) => item.sale_id))];

  const purchasedItems = productIds.length
    ? await knex('purchased_items')
        .whereIn('product_id', productIds)
        .select('id', 'purchase_id')
    : [];
  const purchasedItemIds = purchasedItems.map((item) => item.id);
  const purchaseIds = [
    ...new Set(purchasedItems.map((item) => item.purchase_id)),
  ];

  const journalItems = saleIds.length
    ? await knex('journal_entry_items')
        .whereIn('sale_id', saleIds)
        .select('journal_entry_id')
    : [];
  const journalEntryIds = [
    ...new Set(journalItems.map((item) => item.journal_entry_id)),
  ];

  const stockOuts = saleIds.length
    ? await knex('stock_out').whereIn('sale_id', saleIds).select('id')
    : [];
  const stockOutIds = stockOuts.map((stockOut) => stockOut.id);

  const stockIns = purchaseIds.length
    ? await knex('stock_in').whereIn('purchase_id', purchaseIds).select('id')
    : [];
  const stockInIds = stockIns.map((stockIn) => stockIn.id);

  if (sessionIds.length)
    await knex('receipt').whereIn('session_id', sessionIds).delete();
  if (saleIds.length)
    await knex('payments').whereIn('sale_id', saleIds).delete();
  if (journalEntryIds.length)
    await knex('journal_entry_items')
      .whereIn('journal_entry_id', journalEntryIds)
      .delete();
  if (journalEntryIds.length)
    await knex('journal_entry').whereIn('id', journalEntryIds).delete();
  if (stockOutIds.length)
    await knex('stock_out_items').whereIn('stock_out_id', stockOutIds).delete();
  if (stockOutIds.length)
    await knex('stock_out').whereIn('id', stockOutIds).delete();
  if (saleItemIds.length)
    await knex('sale_items').whereIn('id', saleItemIds).delete();
  if (saleIds.length) await knex('sale').whereIn('id', saleIds).delete();
  if (stockInIds.length)
    await knex('stock_in_items').whereIn('stock_in_id', stockInIds).delete();
  if (stockInIds.length)
    await knex('stock_in').whereIn('id', stockInIds).delete();
  if (productIds.length)
    await knex('stock_quantity').whereIn('product_id', productIds).delete();
  if (productIds.length)
    await knex('inventory_product').whereIn('product_id', productIds).delete();
  if (productIds.length)
    await knex('category_product').whereIn('product_id', productIds).delete();
  if (purchasedItemIds.length)
    await knex('purchased_items').whereIn('id', purchasedItemIds).delete();
  if (purchaseIds.length)
    await knex('purchase').whereIn('id', purchaseIds).delete();
  if (productIds.length)
    await knex('products').whereIn('id', productIds).delete();
  if (customerIds.length)
    await knex('customer').whereIn('id', customerIds).delete();
  if (inventoryIds.length)
    await knex('inventory').whereIn('id', inventoryIds).delete();
  if (categoryIds.length)
    await knex('category_product').whereIn('category_id', categoryIds).delete();
  if (categoryIds.length)
    await knex('categories').whereIn('id', categoryIds).delete();
  if (sessionIds.length)
    await knex('store_session').whereIn('id', sessionIds).delete();
  await knex('accounts')
    .whereLike('name', `Seed Demo Cash (${storeId}%)`)
    .orWhereLike('name', `Seed Demo Sales Revenue (${storeId}%)`)
    .delete();
}

async function getOrCreateSeedTarget(
  knex: Knex,
  now: Date,
): Promise<{ storeId: string; employeeId?: string }> {
  if (SEED_EMPLOYEE_ID) {
    const employee = await knex('employees')
      .where({ id: SEED_EMPLOYEE_ID, deleted_at: null })
      .first('id', 'store_id');

    if (!employee) {
      throw new Error(`Employee ${SEED_EMPLOYEE_ID} not found`);
    }

    if (!employee.store_id) {
      throw new Error(`Employee ${SEED_EMPLOYEE_ID} has no store assigned`);
    }

    return {
      storeId: employee.store_id,
      employeeId: employee.id,
    };
  }

  if (SEED_STORE_ID) {
    const store = await knex('stores').where({ id: SEED_STORE_ID }).first('id');

    if (!store) {
      throw new Error(`Store ${SEED_STORE_ID} not found`);
    }

    return { storeId: store.id };
  }

  const existingStore = await knex('stores').first('id');

  if (existingStore) return { storeId: existingStore.id };

  const accountId = uuidv4();
  const storeSettingsId = uuidv4();
  const storeId = uuidv4();

  await knex('accounts').insert({
    id: accountId,
    name: 'Seed Demo Default Account',
    type: 'asset',
    created_at: now,
    updated_at: now,
  });

  await knex('store_settings').insert({
    id: storeSettingsId,
    default_account_id: accountId,
    created_at: now,
    updated_at: now,
  });

  await knex('stores').insert({
    id: storeId,
    name: 'Seed Demo Store',
    address: 'Seed Demo Address',
    store_settings_id: storeSettingsId,
    created_at: now,
    updated_at: now,
  });

  return { storeId };
}

async function createSeedAccounts(
  knex: Knex,
  now: Date,
  storeId: string,
) {
  const cashAccountId = uuidv4();
  const salesAccountId = uuidv4();
  const accountSuffix = `(${storeId})`;

  await knex('accounts').insert([
    {
      id: cashAccountId,
      name: `Seed Demo Cash ${accountSuffix}`,
      type: 'asset',
      created_at: now,
      updated_at: now,
    },
    {
      id: salesAccountId,
      name: `Seed Demo Sales Revenue ${accountSuffix}`,
      type: 'revenue',
      created_at: now,
      updated_at: now,
    },
  ]);

  return { cashAccountId, salesAccountId };
}

async function createSeedSession(
  knex: Knex,
  storeId: string,
  now: Date,
  employeeId?: string,
): Promise<string> {
  const sessionId = uuidv4();

  await knex('store_session').insert({
    id: sessionId,
    store_id: storeId,
    opened_by_emp_id: employeeId ?? null,
    closed_by_emp_id: null,
    opening_amount: 0,
    opening_note: 'Seed demo session',
    closing_amount: null,
    expected_amount: null,
    closing_note: null,
    opened_at: now,
    closed_at: null,
  });

  return sessionId;
}

function buildInventories(storeId: string, now: Date) {
  return Array.from({ length: INVENTORY_COUNT }, (_, index) => ({
    id: uuidv4(),
    name: `Seed Inventory ${index + 1}`,
    address: `Seed Warehouse Block ${index + 1}`,
    store_id: storeId,
    created_at: now,
    updated_at: now,
  }));
}

function buildCategories(storeId: string, now: Date) {
  return Array.from({ length: CATEGORY_COUNT }, (_, index) => ({
    id: uuidv4(),
    name: `Seed Category ${index + 1}`,
    store_id: storeId,
    created_at: now,
    updated_at: now,
  }));
}

function buildProducts(storeId: string, now: Date): ProductSeed[] {
  const productTypes = [
    'Rice',
    'Flour',
    'Oil',
    'Tea',
    'Sugar',
    'Soap',
    'Shampoo',
    'Juice',
    'Milk',
    'Spice',
  ];

  return Array.from({ length: PRODUCT_COUNT }, (_, index) => {
    const price = 50 + ((index * 17) % 950);
    return {
      id: uuidv4(),
      name: `${productTypes[index % productTypes.length]} Product ${index + 1}`,
      price,
      purchasePrice: Math.max(1, Math.round(price * 0.72)),
      barcode: `${SEED_PREFIX}-product-${String(index + 1).padStart(4, '0')}`,
      store_id: storeId,
      sequence_id: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
  });
}

function buildCategoryProducts(
  products: Array<{ id: string }>,
  categories: Array<{ id: string }>,
) {
  return products.map((product, index) => ({
    id: uuidv4(),
    product_id: product.id,
    category_id: categories[index % categories.length].id,
  }));
}

function buildSequences(
  entity: string,
  prefix: string,
  count: number,
  now: Date,
): SequenceSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    id: uuidv4(),
    entity,
    prefix,
    last_index: index + 1,
    created_at: now,
    updated_at: now,
  }));
}

async function getNextCustomerPhoneIndex(knex: Knex): Promise<number> {
  const rows = await knex('customer')
    .where('phone', 'like', '0799%')
    .select('phone');

  let maxSuffix = 0;

  for (const row of rows) {
    const phone = row.phone as string | null;
    if (!phone) continue;
    const match = /^0799(\d+)$/.exec(phone.trim());
    if (!match) continue;

    const suffix = Number(match[1]);
    if (!Number.isNaN(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return maxSuffix + 1;
}

function buildCustomers(
  storeId: string,
  now: Date,
  startPhoneIndex: number,
) {
  return Array.from({ length: CUSTOMER_COUNT }, (_, index) => ({
    id: uuidv4(),
    name: `Seed Customer ${index + 1}`,
    address: `Seed Customer Address ${index + 1}`,
    phone: `0799${String(startPhoneIndex + index).padStart(6, '0')}`,
    store_id: storeId,
    payable_id: null,
    receivable_id: null,
    created_at: now,
    updated_at: now,
  }));
}

function buildPurchases(
  storeId: string,
  sequences: SequenceSeed[],
  customers: Array<{ id: string }>,
  inventories: Array<{ id: string }>,
  now: Date,
): PurchaseSeed[] {
  return Array.from({ length: PURCHASE_COUNT }, (_, index) => ({
    id: uuidv4(),
    customer_id: customers[index % customers.length].id,
    inventory_id: inventories[index % inventories.length].id,
    custom_date: daysAgo(index % 90),
    status: 'Done',
    store_id: storeId,
    sequence_id: sequences[index].id,
    created_at: daysAgo(index % 90),
    updated_at: now,
  }));
}

function buildPurchasedItems(
  purchases: Array<{ id: string; inventory_id: string }>,
  products: ProductSeed[],
  inventories: Array<{ id: string }>,
  now: Date,
) {
  return purchases.flatMap((purchase, purchaseIndex) =>
    Array.from({ length: 3 }, (_, itemIndex) => {
      const product =
        products[(purchaseIndex * 3 + itemIndex) % products.length];
      const quantity = 20 + ((purchaseIndex + itemIndex) % 80);

      return {
        id: uuidv4(),
        purchase_id: purchase.id,
        warehouse_id:
          purchase.inventory_id ||
          inventories[purchaseIndex % inventories.length].id,
        product_id: product.id,
        quantity,
        unit_price: product.purchasePrice,
        received: quantity,
        created_at: now,
      };
    }),
  );
}

function buildStockQuantities(
  purchasedItems: Array<{
    warehouse_id: string;
    product_id: string;
    quantity: number;
  }>,
  saleItems: Array<{
    sale_id: string;
    product_id: string;
    quantity: number;
  }>,
  sales: SaleSeed[],
  now: Date,
) {
  const totals = new Map<string, number>();
  const inventoryIdBySaleId = new Map(
    sales.map((sale) => [sale.id, sale.inventory_id]),
  );

  for (const item of purchasedItems) {
    const key = `${item.warehouse_id}:${item.product_id}`;
    totals.set(key, (totals.get(key) ?? 0) + item.quantity);
  }

  for (const item of saleItems) {
    const inventoryId = inventoryIdBySaleId.get(item.sale_id);
    if (!inventoryId) continue;

    const key = `${inventoryId}:${item.product_id}`;
    totals.set(key, Math.max(0, (totals.get(key) ?? 0) - item.quantity));
  }

  return Array.from(totals.entries()).map(([key, quantity]) => {
    const [inventoryId, productId] = key.split(':');
    return {
      id: uuidv4(),
      inventory_id: inventoryId,
      product_id: productId,
      quantity,
      created_at: now,
      updated_at: now,
    };
  });
}

function buildInventoryProducts(
  purchasedItems: Array<{
    warehouse_id: string;
    product_id: string;
  }>,
) {
  const pairs = new Set<string>();

  for (const item of purchasedItems) {
    pairs.add(`${item.warehouse_id}:${item.product_id}`);
  }

  return Array.from(pairs).map((pair) => {
    const [inventoryId, productId] = pair.split(':');
    return {
      id: uuidv4(),
      inventory_id: inventoryId,
      product_id: productId,
    };
  });
}

function buildStockIns(
  purchases: PurchaseSeed[],
  sequences: SequenceSeed[],
  now: Date,
) {
  return purchases.map((purchase, index) => ({
    id: uuidv4(),
    inventory_id: purchase.inventory_id,
    purchase_id: purchase.id,
    sequence_id: sequences[index].id,
    status: 'Done',
    created_at: purchase.created_at,
    updated_at: now,
  }));
}

function buildStockInItems(
  stockIns: Array<{ id: string; purchase_id: string }>,
  purchasedItems: Array<{
    id: string;
    purchase_id: string;
    product_id: string;
    quantity: number;
  }>,
  now: Date,
) {
  const stockInByPurchaseId = new Map(
    stockIns.map((stockIn) => [stockIn.purchase_id, stockIn]),
  );

  return purchasedItems.map((item) => ({
    id: uuidv4(),
    stock_in_id: stockInByPurchaseId.get(item.purchase_id)!.id,
    product_id: item.product_id,
    purchased_item_id: item.id,
    quantity: item.quantity,
    created_at: now,
    updated_at: now,
  }));
}

function buildSales(
  storeId: string,
  sequences: SequenceSeed[],
  customers: Array<{ id: string }>,
  inventories: Array<{ id: string }>,
  now: Date,
): SaleSeed[] {
  return Array.from({ length: SALE_COUNT }, (_, index) => ({
    id: uuidv4(),
    inventory_id: inventories[index % inventories.length].id,
    sequence_id: sequences[index].id,
    customer_id: customers[index % customers.length].id,
    store_id: storeId,
    status: 'Done',
    created_at: daysAgo(index % 90),
    updated_at: now,
  }));
}

function buildJournalEntries(
  sales: Array<{ id: string }>,
  storeId: string,
  sequences: SequenceSeed[],
  now: Date,
) {
  return sales.map((_, index) => ({
    id: uuidv4(),
    sequence_id: sequences[index].id,
    status: 'Done',
    store_id: storeId,
    created_at: now,
    updated_at: now,
  }));
}

function buildJournalItems(
  journalEntries: Array<{ id: string }>,
  saleItems: Array<{
    sale_id: string;
    quantity: number;
    unit_price: number;
  }>,
  accounts: { cashAccountId: string; salesAccountId: string },
  now: Date,
) {
  const saleTotals = calcSaleTotals(saleItems);
  const saleIds = Array.from(saleTotals.keys());

  return journalEntries.flatMap((entry, index) => {
    const saleId = saleIds[index];
    const total = saleTotals.get(saleId) ?? 0;

    return [
      {
        id: uuidv4(),
        journal_entry_id: entry.id,
        purchase_id: null,
        sale_id: saleId,
        account_id: accounts.cashAccountId,
        debit: total,
        credit: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        journal_entry_id: entry.id,
        purchase_id: null,
        sale_id: saleId,
        account_id: accounts.salesAccountId,
        debit: null,
        credit: total,
        created_at: now,
        updated_at: now,
      },
    ];
  });
}

function buildSaleItems(
  sales: SaleSeed[],
  purchasedItems: Array<{ warehouse_id: string; product_id: string }>,
  products: ProductSeed[],
  now: Date,
) {
  const productIdsByInventoryId = new Map<string, string[]>();

  for (const item of purchasedItems) {
    const productIds = productIdsByInventoryId.get(item.warehouse_id) ?? [];
    productIds.push(item.product_id);
    productIdsByInventoryId.set(item.warehouse_id, productIds);
  }

  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );

  return sales.flatMap((sale, saleIndex) =>
    Array.from({ length: 2 }, (_, itemIndex) => {
      const inventoryProductIds =
        productIdsByInventoryId.get(sale.inventory_id) ?? [];
      const productId =
        inventoryProductIds[
          (saleIndex * 2 + itemIndex) % inventoryProductIds.length
        ];
      const product = productsById.get(productId)!;

      return {
        id: uuidv4(),
        sale_id: sale.id,
        product_id: product.id,
        quantity: 1 + ((saleIndex + itemIndex) % 5),
        unit_price: product.price,
        created_at: now,
        updated_at: now,
      };
    }),
  );
}

function buildStockOuts(
  sales: SaleSeed[],
  sequences: SequenceSeed[],
  now: Date,
) {
  return sales.map((sale, index) => ({
    id: uuidv4(),
    inventory_id: sale.inventory_id,
    sale_id: sale.id,
    sequence_id: sequences[index].id,
    status: 'Done',
    created_at: sale.created_at,
    updated_at: now,
  }));
}

function buildStockOutItems(
  stockOuts: Array<{ id: string; sale_id: string }>,
  saleItems: Array<{
    id: string;
    sale_id: string;
    product_id: string;
    quantity: number;
  }>,
  now: Date,
) {
  const stockOutBySaleId = new Map(
    stockOuts.map((stockOut) => [stockOut.sale_id, stockOut]),
  );

  return saleItems.map((item) => ({
    id: uuidv4(),
    stock_out_id: stockOutBySaleId.get(item.sale_id)!.id,
    product_id: item.product_id,
    sale_item_id: item.id,
    quantity: item.quantity,
    created_at: now,
    updated_at: now,
  }));
}

function buildSalePayments(
  sales: Array<{ id: string }>,
  saleItems: Array<{ sale_id: string; quantity: number; unit_price: number }>,
  sessionId: string,
  now: Date,
) {
  const saleTotals = calcSaleTotals(saleItems);

  return sales.map((sale) => ({
    id: uuidv4(),
    purchase_id: null,
    sale_id: sale.id,
    store_session_id: sessionId,
    amount: saleTotals.get(sale.id) ?? 0,
    note: 'Seed sale payment',
    status: 'done',
    created_at: now,
    updated_at: now,
  }));
}

function buildReceipts(
  sales: Array<{ id: string }>,
  saleItems: Array<{
    sale_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
  }>,
  products: ProductSeed[],
  storeId: string,
  sessionId: string,
  now: Date,
) {
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const itemsBySaleId = new Map<string, typeof saleItems>();

  for (const item of saleItems) {
    const items = itemsBySaleId.get(item.sale_id) ?? [];
    items.push(item);
    itemsBySaleId.set(item.sale_id, items);
  }

  return sales.map((sale) => {
    const items = itemsBySaleId.get(sale.id) ?? [];

    return {
      id: uuidv4(),
      store_id: storeId,
      session_id: sessionId,
      items: JSON.stringify({
        saleId: sale.id,
        items: items.map((item) => ({
          productId: item.product_id,
          productName: productsById.get(item.product_id)?.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          total: item.quantity * item.unit_price,
        })),
        total: items.reduce(
          (sum, item) => sum + item.quantity * item.unit_price,
          0,
        ),
      }),
      created_at: now,
    };
  });
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function calcSaleTotals(
  saleItems: Array<{ sale_id: string; quantity: number; unit_price: number }>,
) {
  const totals = new Map<string, number>();

  for (const item of saleItems) {
    totals.set(
      item.sale_id,
      (totals.get(item.sale_id) ?? 0) + item.quantity * item.unit_price,
    );
  }

  return totals;
}

async function insertChunks(
  knex: Knex,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const chunkSize = 500;

  for (let index = 0; index < rows.length; index += chunkSize) {
    await knex(tableName).insert(rows.slice(index, index + chunkSize));
  }
}
