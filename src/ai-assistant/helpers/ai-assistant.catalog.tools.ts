import { EntityManager } from '@mikro-orm/postgresql';
import { tool } from 'ai';
import { z } from 'zod';
import { Inventory } from '../../database/entites/inventory.entity';
import { Product } from '../../database/entites/product.entity';
import { StockQuantity } from '../../database/entites/stock-quantity.entity';
import { clampToolLimit } from './ai-assistant.tool-helpers';

interface CatalogToolContext {
  em: EntityManager;
  storeWhere: { id: string };
  scope: { storeId: string; storeName: string };
}

export function createCatalogTools({
  em,
  storeWhere,
  scope,
}: CatalogToolContext) {
  return {
    searchProducts: tool({
      description:
        'Search products by name or product code and include current stock quantities by inventory.',
      inputSchema: z.object({
        query: z.string().optional(),
        lowStockOnly: z.boolean().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, lowStockOnly, limit }) => {
        const take = clampToolLimit(limit);
        const where: Record<string, any> = { store: storeWhere };
        if (query?.trim()) {
          const queryPattern = `%${query.trim()}%`;
          const code = /^([A-Za-z]+)-(\d+)$/.exec(query.trim());
          where.$or = [
            { name: { $ilike: queryPattern } },
            ...(code
              ? [{
                  sequence: {
                    prefix: code[1],
                    lastIndex: Number(code[2]),
                  },
                }]
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
            ),
        };
      },
    }),

    getProductCount: tool({
      description:
        'Return the total number of products in the current store, optionally filtered by product name.',
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        const where: Record<string, any> = { store: storeWhere };
        if (query?.trim()) {
          const queryPattern = `%${query.trim()}%`;
          const code = /^([A-Za-z]+)-(\d+)$/.exec(query.trim());
          where.$or = [
            { name: { $ilike: queryPattern } },
            ...(code
              ? [{
                  sequence: {
                    prefix: code[1],
                    lastIndex: Number(code[2]),
                  },
                }]
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
        limit: z.number().optional(),
      }),
      execute: async ({ inventoryId, limit }) => {
        const take = clampToolLimit(limit);
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

        return {
          scope,
          totalInventoryCount,
          totalStockRecordCount,
          lowStockCount,
          outOfStockCount,
          returnedInventoryCount: inventories.length,
          inventories: inventories.map((inventory) => {
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
          }),
        };
      },
    }),
  };
}
