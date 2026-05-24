import { EntityManager, serialize } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inventory } from '../database/entites/inventory.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { StockIn } from '../database/entites/stock-in.entity';
import { Store } from '../database/entites/store.entity';
import { SequenceService } from '../sequence/sequence.service';
import { PurchaseStatus } from '../shared/utils/purchase-status-enum';
import { StockInStatus } from '../shared/utils/stock-in-status.enum';
import { StockQuantityService } from '../stock-quantity/stock-quantity.service';
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

  async findAll(store: Store) {
    const stockIns = await this.em.findAll(StockIn, {
      where: { purchase: { store } },
      populate: STOCK_IN_POPULATE,
    });

    return serialize(stockIns, { populate: STOCK_IN_POPULATE });
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

  async createFromPurchase(
    store: Store,
    dto: CreateStockInDto,
  ): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const inventory = await em.findOne(Inventory, { id: dto.inventoryId });
      const purchase = await em.findOne(
        Purchase,
        { id: dto.purchaseId },
        { populate: ['items', 'items.product', 'customer'] },
      );

      if (!purchase)
        throw new NotFoundException(
          `Purchase with id ${dto.purchaseId} not found`,
        );

      if (!inventory)
        throw new NotFoundException(
          `Inventory with id ${dto.inventoryId} not found`,
        );

      if (purchase.status === PurchaseStatus.CANCELLED)
        throw new BadRequestException(
          `Cannot create stock in for a cancelled purchase`,
        );

      if (purchase.status === PurchaseStatus.DRAFT)
        throw new BadRequestException(
          `Cannot create stock in for a draft purchase`,
        );

      const purchasedItems = purchase.items.getItems();
      const purchasedItemMap = new Map(
        purchasedItems.map((item) => [item.id, item]),
      );

      this.validateItems(dto.items, purchasedItemMap);

      const sequence = await this.sequenceService.generateSequence(
        'StockIn',
        'STK',
      );

      const stockIn = em.create(StockIn, {
        inventory,
        purchase,
        sequence,
        status: StockInStatus.PENDING,
      });

      em.persist(stockIn);

      for (const item of dto.items) {
        const purchasedItem = purchasedItemMap.get(item.purchaseItemId)!;

        em.create(StockInItem, {
          stockIn,
          product: purchasedItem.product,
          purchasedItem,
          quantity: item.quantity,
        });
      }

      await em.flush();

      return {
        message: `Stock in created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
      };
    });
  }

  async update(
    store: Store,
    id: string,
    dto: UpdateStockInDto,
  ): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const stockIn = await em.findOne(
        StockIn,
        { id, purchase: { store } },
        {
          populate: [
            'items',
            'items.product',
            'items.purchasedItem',
            'inventory',
            'inventory.products',
            'purchase',
            'purchase.items',
          ],
        },
      );

      if (!stockIn)
        throw new NotFoundException(`Stock in with id ${id} not found`);

      if (stockIn.status === StockInStatus.DONE)
        throw new BadRequestException(`Cannot update a completed stock in`);

      if (stockIn.status === StockInStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled stock in`);

      if (dto.status) {
        this.validateStockInTransition(
          stockIn.status as StockInStatus,
          dto.status as StockInStatus,
        );

        if (dto.status === StockInStatus.DONE) {
          const purchasedItems = stockIn.purchase.items.getItems();
          const purchasedItemMap = new Map(
            purchasedItems.map((item) => [item.id, item]),
          );

          for (const item of stockIn.items.getItems()) {
            const purchasedItem = purchasedItemMap.get(item.purchasedItem.id)!;
            const remaining =
              purchasedItem.quantity - (purchasedItem.received ?? 0);

            if (item.quantity > remaining)
              throw new BadRequestException(
                `Quantity ${item.quantity} exceeds remaining quantity ${remaining} for purchase item ${item.purchasedItem.product.name}`,
              );
          }

          const existingProductIds = new Set(
            stockIn.inventory.products.getItems().map((p) => p.id),
          );

          await Promise.all(
            stockIn.items.getItems().map(async (item) => {
              await this.stockQuantityService.upsertStockQuantity(
                em,
                stockIn.inventory,
                item.product,
                item.quantity,
              );

              item.purchasedItem.received =
                (item.purchasedItem.received ?? 0) + item.quantity;

              if (!existingProductIds.has(item.product.id)) {
                stockIn.inventory.products.add(item.product);
                existingProductIds.add(item.product.id);
              }
            }),
          );
        }

        stockIn.status = dto.status;
      }

      await em.flush();
      return { message: `Stock in with id ${id} updated successfully.` };
    });
  }

  private validateItems(
    items: StockInItemDto[],
    purchasedItemMap: Map<string, PurchasedItem>,
  ): void {
    for (const item of items) {
      const purchasedItem = purchasedItemMap.get(item.purchaseItemId);

      if (!purchasedItem)
        throw new NotFoundException(
          `Purchase item with id ${item.purchaseItemId} does not belong to this purchase`,
        );
    }
  }

  private validateStockInTransition(
    currentStatus: StockInStatus,
    newStatus: StockInStatus,
  ): void {
    const transitions = new Map([
      [StockInStatus.PENDING, [StockInStatus.DONE, StockInStatus.CANCELLED]],
      [StockInStatus.DONE, []],
      [StockInStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'.`,
      );
  }
}
