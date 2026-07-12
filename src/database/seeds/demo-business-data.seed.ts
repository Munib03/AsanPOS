import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

const PRODUCT_COUNT = 1000;
const PURCHASE_COUNT = 1000;
const SALE_COUNT = 1000;
const INVENTORY_COUNT = 100;
const CUSTOMER_COUNT = 100;
const SEED_PREFIX = 'seed-demo';

type ProductSeed = {
  id: string;
  name: string;
  price: number;
  purchasePrice: number;
  barcode: string;
};

export async function seed(knex: Knex): Promise<void> {
  const alreadySeeded = await knex('products')
    .where({ barcode: `${SEED_PREFIX}-product-0001` })
    .first('id');

  if (alreadySeeded) return;

  const now = new Date();
  const storeId = await getOrCreateStore(knex, now);
  const saleSequenceId = uuidv4();
  const purchaseSequenceId = uuidv4();

  await knex('sequence').insert([
    {
      id: saleSequenceId,
      entity: 'Sale',
      prefix: 'SAL',
      last_index: SALE_COUNT,
      created_at: now,
      updated_at: now,
    },
    {
      id: purchaseSequenceId,
      entity: 'Purchase',
      prefix: 'PUR',
      last_index: PURCHASE_COUNT,
      created_at: now,
      updated_at: now,
    },
  ]);

  const inventories = buildInventories(storeId, now);
  await insertChunks(knex, 'inventory', inventories);

  const products = buildProducts(storeId, now);
  await insertChunks(
    knex,
    'products',
    products.map(({ purchasePrice, ...product }) => product),
  );

  const customers = buildCustomers(storeId, now);
  await insertChunks(knex, 'customer', customers);

  const purchases = buildPurchases(
    storeId,
    purchaseSequenceId,
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

  const stockQuantities = buildStockQuantities(purchasedItems, now);
  await insertChunks(knex, 'stock_quantity', stockQuantities);

  const sales = buildSales(storeId, saleSequenceId, customers, now);
  await insertChunks(knex, 'sale', sales);

  const saleItems = buildSaleItems(sales, products, now);
  await insertChunks(knex, 'sale_items', saleItems);
}

async function getOrCreateStore(knex: Knex, now: Date): Promise<string> {
  const existingStore = await knex('stores')
    .where({ name: 'Seed Demo Store' })
    .first('id');

  if (existingStore) return existingStore.id;

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

  return storeId;
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

function buildCustomers(storeId: string, now: Date) {
  return Array.from({ length: CUSTOMER_COUNT }, (_, index) => ({
    id: uuidv4(),
    name: `Seed Customer ${index + 1}`,
    address: `Seed Customer Address ${index + 1}`,
    phone: `0799${String(index + 1).padStart(6, '0')}`,
    store_id: storeId,
    payable_id: null,
    receivable_id: null,
    created_at: now,
    updated_at: now,
  }));
}

function buildPurchases(
  storeId: string,
  sequenceId: string,
  customers: Array<{ id: string }>,
  inventories: Array<{ id: string }>,
  now: Date,
) {
  return Array.from({ length: PURCHASE_COUNT }, (_, index) => ({
    id: uuidv4(),
    customer_id: customers[index % customers.length].id,
    inventory_id: inventories[index % inventories.length].id,
    custom_date: daysAgo(index % 90),
    status: 'completed',
    store_id: storeId,
    sequence_id: sequenceId,
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
  now: Date,
) {
  const totals = new Map<string, number>();

  for (const item of purchasedItems) {
    const key = `${item.warehouse_id}:${item.product_id}`;
    totals.set(key, (totals.get(key) ?? 0) + item.quantity);
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

function buildSales(
  storeId: string,
  sequenceId: string,
  customers: Array<{ id: string }>,
  now: Date,
) {
  return Array.from({ length: SALE_COUNT }, (_, index) => ({
    id: uuidv4(),
    sequence_id: sequenceId,
    customer_id: customers[index % customers.length].id,
    store_id: storeId,
    status: 'completed',
    created_at: daysAgo(index % 90),
    updated_at: now,
  }));
}

function buildSaleItems(
  sales: Array<{ id: string }>,
  products: ProductSeed[],
  now: Date,
) {
  return sales.flatMap((sale, saleIndex) =>
    Array.from({ length: 2 }, (_, itemIndex) => {
      const product = products[(saleIndex * 2 + itemIndex) % products.length];

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

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
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
