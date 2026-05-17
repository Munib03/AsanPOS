import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { Product } from '../database/entites/product.entity';
import { Inventory } from '../database/entites/inventory.entity';

@Injectable()
export class StockQuantityService {
  constructor(private readonly em: EntityManager) {}

  async upsertStockQuantity(em: EntityManager, inventory: Inventory, product: Product, quantity: number): Promise<void> {
    const existing = await em.findOne(StockQuantity, { inventory, product });

    if (existing) 
      existing.quantity = (existing.quantity ?? 0) + quantity;
    
    else {
      em.create(StockQuantity, {
        inventory,
        product,
        quantity,
      });
    }
  }
}