import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { SequenceService } from '../sequence/sequence.service';
import { Product } from '../database/entites/product.entity';
import { StockQuantityService } from '../stockQuantity/stock-quantity.service';

@Injectable()
export class StockInService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly stockQuantityService: StockQuantityService,
  ) {
    
  }

  async createFromPurchase(purchaseId: string, inventoryId: string, quantity: number): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(Purchase,
        { id: purchaseId },
        { populate: ['items', 'items.product'] }
      );

      if (!purchase)
        throw new NotFoundException(`Purchase with id ${purchaseId} not found`);

      const purchasedItem = purchase.items.getItems()[0];
      if (!purchasedItem)
        throw new NotFoundException(`No items found in purchase`);

      const remaining = purchasedItem.quantity - (purchasedItem.received ?? 0);
      if (quantity > remaining)
        throw new BadRequestException(`Quantity ${quantity} exceeds remaining quantity ${remaining}`);

      const inventory = await em.findOne(Inventory,
        { id: inventoryId },
        { populate: ['products'] }
      );

      if (!inventory)
        throw new NotFoundException(`Inventory with id ${inventoryId} not found`);

      const sequence = await this.sequenceService.generateSequence(em, 'StockIn', 'STK');

      const stockIn = em.create(StockIn, {
        inventory,
        purchase,
        sequence,
      });

      await em.persistAndFlush(stockIn);

      em.create(StockInItem, {
        stockIn,
        product: purchasedItem.product,
        purchasedItem,
        quantity,
      });

      await this.stockQuantityService.upsertStockQuantity(
        em,
        inventory,
        purchasedItem.product,
        quantity,
      );

      purchasedItem.received = (purchasedItem.received ?? 0) + quantity;

      const existingProductIds = new Set(inventory.products.getItems().map(p => p.id));
      if (!existingProductIds.has(purchasedItem.product.id))
        inventory.products.add(purchasedItem.product);

      await em.flush();

      return { message: `Stock in created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.` };
    });
  }
}