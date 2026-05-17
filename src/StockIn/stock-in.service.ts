import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { SequenceService } from '../sequence/sequence.service';
import { StockQuantityService } from '../stockQuantity/stock-quantity.service';
import { Product } from '../database/entites/product.entity';

@Injectable()
export class StockInService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly stockQuantityService: StockQuantityService,
  ) {}

    async createFromPurchase(purchaseId: string): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
        const purchase = await em.findOne(Purchase,
        { id: purchaseId },
        { populate: ['items', 'items.product', 'inventory', 'inventory.products'] }
        );

        if (!purchase)
        throw new NotFoundException(`Purchase with id ${purchaseId} not found`);

        const sequence = await this.sequenceService.generateSequence(em, 'StockIn');

        const stockIn = em.create(StockIn, {
        inventory: purchase.inventory,
        purchase,
        sequence,
        });

        await em.persistAndFlush(stockIn);

        const purchasedProducts = purchase.items.getItems().map(item => item.product);
        const existingProductIds = new Set(purchase.inventory.products.getItems().map(p => p.id));
        const newProducts = purchasedProducts.filter(p => !existingProductIds.has(p.id));

        purchase.items.getItems().map(purchasedItem => {
        em.create(StockInItem, {
            stockIn,
            product: purchasedItem.product,
            purchasedItem,
            quantity: purchasedItem.quantity,
        });

        this.stockQuantityService.upsertStockQuantity(
            em,
            purchase.inventory,
            purchasedItem.product,
            purchasedItem.quantity,
        );
        });

        if (newProducts.length)
        purchase.inventory.products.add(...newProducts as [Product, ...Product[]]);

        await em.flush();

        return { message: `Stock in created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.` };
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