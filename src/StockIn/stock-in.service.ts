import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { SequenceService } from '../sequence/sequence.service';
import { DistributionDto } from '../purchase/dto/update-purchase.dto';
import { Product } from '../database/entites/product.entity';
import { StockQuantityService } from '../stockQuantity/stock-quantity.service';

@Injectable()
export class StockInService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly stockQuantityService: StockQuantityService,
  ) {}

  
  async createFromPurchase(purchaseId: string, distributions: DistributionDto[]): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(Purchase,
        { id: purchaseId },
        { populate: ['items', 'items.product'] }
      );

      if (!purchase)
        throw new NotFoundException(`Purchase with id ${purchaseId} not found`);

      const purchasedItems = purchase.items.getItems();

      // validate remaining quantities
      await Promise.all(
        distributions.flatMap(distribution =>
          distribution.items.map(async item => {
            const purchasedItem = purchasedItems.find(p => p.product.id === item.productId);
            if (!purchasedItem)
              throw new NotFoundException(`Product with id ${item.productId} not found in purchase`);

            const totalDistributing = distributions
              .flatMap(d => d.items)
              .filter(i => i.productId === item.productId)
              .reduce((sum, i) => sum + i.quantity, 0);

            const remaining = purchasedItem.quantity - (purchasedItem.received ?? 0);
            if (totalDistributing > remaining)
              throw new BadRequestException(
                `Distributed quantity ${totalDistributing} exceeds remaining quantity ${remaining} for product ${item.productId}`
              );
          })
        )
      );

      // create stock_in per inventory
      await Promise.all(
        distributions.map(async distribution => {
          const inventory = await em.findOne(Inventory,
            { id: distribution.inventoryId },
            { populate: ['products'] }
          );

          if (!inventory)
            throw new NotFoundException(`Inventory with id ${distribution.inventoryId} not found`);

          const sequence = await this.sequenceService.generateSequence(em, 'StockIn', 'STK');

          const stockIn = em.create(StockIn, {
            inventory,
            purchase,
            sequence,
          });

          await em.persistAndFlush(stockIn);

          const existingProductIds = new Set(inventory.products.getItems().map(p => p.id));

          const newProducts = distribution.items
            .map(item => purchasedItems.find(p => p.product.id === item.productId)!.product)
            .filter(product => !existingProductIds.has(product.id));

          await Promise.all(
            distribution.items.map(async item => {
              const purchasedItem = purchasedItems.find(p => p.product.id === item.productId)!;

              em.create(StockInItem, {
                stockIn,
                product: purchasedItem.product,
                purchasedItem,
                quantity: item.quantity,
              });

              await this.stockQuantityService.upsertStockQuantity(
                em,
                inventory,
                purchasedItem.product,
                item.quantity,
              );

              purchasedItem.received = (purchasedItem.received ?? 0) + item.quantity;
            })
          );

          if (newProducts.length)
            inventory.products.add(...newProducts as [Product, ...Product[]]);
        })
      );

      await em.flush();

      return { message: `Stock in created successfully.` };
    });
  }


  async findOne(id: string) {
    const stockIn = await this.em.findOne(StockIn,
      { id },
      { populate: ['inventory', 'purchase', 'sequence', 'items', 'items.product', 'items.purchasedItem'] }
    );

    if (!stockIn)
      throw new NotFoundException(`Stock in with id ${id} not found`);

    return serialize(stockIn, { populate: ['inventory', 'purchase', 'sequence', 'items', 'items.product', 'items.purchasedItem'] });
  }
}