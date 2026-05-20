import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { Store } from '../database/entites/store.entity';
import { SequenceService } from '../sequence/sequence.service';
import { StockQuantityService } from '../stock-quantity/stock-quantity.service';
import { PurchaseStatus } from '../shared/utils/purchase-status-enum';
import { StockInStatus } from '../shared/utils/stock-in-status.enum';
import { CreateStockInDto, StockInItemDto } from './dto/create-stock-in.dto';
import { UpdateStockInDto } from './dto/update-stock-in.dto';

const STOCK_IN_POPULATE = [
  'inventory',
  'purchase',
  'sequence',
  'items',
  'items.product',
  'items.purchasedItem',
] as const;

@Injectable()
export class StockInService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly stockQuantityService: StockQuantityService,
  ) {}


  async createFromPurchase(store: Store, dto: CreateStockInDto): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {

      const inventory = await em.findOne(Inventory, { id: dto.inventoryId }, { populate: ['products'] });
      const purchase = await em.findOne(Purchase, { id: dto.purchaseId }, { populate: ['items', 'items.product', 'customer'] });

      if (!purchase)
        throw new NotFoundException(`Purchase with id ${dto.purchaseId} not found`);

      if (!inventory)
        throw new NotFoundException(`Inventory with id ${dto.inventoryId} not found`);

      if (purchase.status === PurchaseStatus.CANCELLED)
        throw new BadRequestException(`Cannot create stock in for a cancelled purchase`);

      if (purchase.status === PurchaseStatus.DRAFT)
        throw new BadRequestException(`Cannot create stock in for a draft purchase, confirm it first by setting status to Done`);

      const purchasedItems = purchase.items.getItems();
      const purchasedItemMap = new Map(purchasedItems.map(item => [item.id, item]));

      this.validateItems(dto.items, purchasedItemMap);

      const sequence = await this.sequenceService.generateSequence('StockIn', 'STK');

      const stockIn = em.create(StockIn, {
        inventory,
        purchase,
        sequence,
        status: StockInStatus.PENDING,
      });

      em.persist(stockIn);

      const existingProductIds = new Set(inventory.products.getItems().map(p => p.id));

      for (const item of dto.items) {
        const purchasedItem = purchasedItemMap.get(item.purchaseItemId)!;

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

        if (!existingProductIds.has(purchasedItem.product.id)) {
          inventory.products.add(purchasedItem.product);
          existingProductIds.add(purchasedItem.product.id);
        }
      }

      await em.flush();

      return { message: `Stock in created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.` };
    });
  }


  async update(store: Store, id: string, dto: UpdateStockInDto): Promise<{ message: string }> {
    const stockIn = await this.em.findOne(StockIn, { id, purchase: { store } });
    if (!stockIn)
      throw new NotFoundException(`Stock in with id ${id} not found`);

    if (stockIn.status === StockInStatus.DONE)
      throw new BadRequestException(`Cannot update a completed stock in`);

    if (dto.status)
      stockIn.status = dto.status;

    await this.em.flush();
    return { message: `Stock in with id ${id} updated successfully.` };
  }

  private validateItems(items: StockInItemDto[], purchasedItemMap: Map<string, PurchasedItem>): void {
    for (const item of items) {
      const purchasedItem = purchasedItemMap.get(item.purchaseItemId);

      if (!purchasedItem)
        throw new NotFoundException(`Purchase item with id ${item.purchaseItemId} does not belong to this purchase`);

      const remaining = purchasedItem.quantity - (purchasedItem.received ?? 0);
      if (item.quantity > remaining)
        throw new BadRequestException(`Quantity ${item.quantity} exceeds remaining quantity ${remaining} for purchase item ${item.purchaseItemId}`);
    }
  }


  async findOne(store: Store, id: string) {
    const stockIn = await this.em.findOne(
      StockIn,
      { id, purchase: { store } },
      { populate: STOCK_IN_POPULATE },
    );

    if (!stockIn)
      throw new NotFoundException(`Stock in with id ${id} not found`);

    return serialize(stockIn, { populate: STOCK_IN_POPULATE });
  }
}