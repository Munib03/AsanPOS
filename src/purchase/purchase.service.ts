// src/purchase/purchase.service.ts

import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from '../database/entites/customer.entity';
import { Product } from '../database/entites/product.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Store } from '../database/entites/store.entity';
import { JournalEntryService } from '../journal/journal-entry.service';
import { SequenceService } from '../sequence/sequence.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Meta, PaginateQuery } from '../shared/types/paginate-query.types';
import {
  PurchaseItemType,
  PurchaseListItem,
  StockInDetail,
} from '../shared/types/purchase.types';
import { PurchaseStatus } from '../shared/utils/purchase-status-enum';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly em: EntityManager,
    private readonly purchaseRepository: BaseRepository<Purchase>,
    private readonly sequenceService: SequenceService,
    private readonly journalEntryService: JournalEntryService,
  ) {}


  async findAll(
    store: Store,
    query: PaginateQuery,
  ): Promise<{ data: PurchaseListItem[]; meta: Meta }> {
    const [purchases, meta] = await this.purchaseRepository.findAndPaginate(
      { store },
      {
        populate: ['customer', 'items', 'items.product', 'sequence'],
        fields: ['id', 'status', 'customDate', 'createdAt', 'sequence.prefix', 'sequence.lastIndex', 'customer.id', 'customer.name',
          'items.id', 'items.quantity', 'items.unitPrice', 'items.product.id', 'items.product.name', 'items.product.price',],
      },
      {
        searchable: ['customer.name', 'status'],
      },
      query,
    );

    const data = purchases.map((purchase) => {
      const serialized = serialize(purchase, {
        populate: ['customer', 'items', 'items.product', 'sequence'],
      });

      return this.mapPurchaseToListItem(serialized);
    });

    return { data, meta };
  }


  async findOne(store: Store, id: string): Promise<PurchaseListItem> {
    const purchase = await this.em.findOne(
      Purchase,
      { id, store },
      {
        populate: ['customer', 'items', 'items.product', 'sequence'],
        fields: ['id', 'status', 'customDate', 'sequence.prefix', 'sequence.lastIndex', 'customer.id', 'customer.name', 'customer.phone',
          'customer.address', 'items.id', 'items.quantity', 'items.unitPrice', 'items.received',
          'items.product.id',
          'items.product.name',
          'items.product.price',
        ],
      },
    );

    if (!purchase)
      throw new NotFoundException(`Purchase with id ${id} not found`);

    const purchasedItems = purchase.items.getItems();
    const purchasedItemIds = purchasedItems.map((item) => item.id);

    if (purchasedItemIds.length === 0) {
      const serialized = serialize(purchase, {
        populate: ['customer', 'items', 'items.product', 'sequence'],
      });
      
      return this.mapPurchaseToListItem(serialized);
    }

    let stockInsMap: Map<string, StockInDetail> = new Map();

    try {
      const stockInItems = await this.em.find(
        StockInItem,
        {
          purchasedItem: { id: { $in: purchasedItemIds } },
        },
        {
          populate: [
            'stockIn',
            'stockIn.inventory',
            'stockIn.sequence',
            'purchasedItem',
            'purchasedItem.product',
          ],
        },
      );

      stockInsMap = this.buildStockInsMap(stockInItems);
    } catch (error) {
      console.error('Error fetching stock-in items:', error);
    }

    const serialized = serialize(purchase, {
      populate: ['customer', 'items', 'items.product', 'sequence'],
    });
    return this.mapPurchaseToListItem(serialized, stockInsMap);
  }


  async create(store: Store, dto: CreatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id: dto.customerId });
      if (!customer)
        throw new NotFoundException(
          `Customer with id ${dto.customerId} not found`,
        );

      const sequence = await this.sequenceService.generateSequence(
        'Purchase',
        'PUR',
      );

      const purchase = em.create(Purchase, {
        customer,
        store,
        customDate: dto.customDate,
        status: PurchaseStatus.DRAFT,
        sequence,
      });

      await em.persistAndFlush(purchase);

      const products = await em.findAll(Product, {
        where: { id: { $in: dto.items.map((item) => item.productId) } },
      });

      if (products.length !== dto.items.length)
        throw new NotFoundException(`One or more products not found`);

      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );

      const purchasedItems = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product)
          throw new NotFoundException(
            `Product with id ${item.productId} not found`,
          );

        return em.create(PurchasedItem, {
          purchase,
          product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      });

      await em.persistAndFlush(purchasedItems);

      return {
        message: `Purchase created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
      };
    });
  }


  async remove(store: Store, id: string) {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(
        Purchase,
        { id, store },
        { populate: ['items'] },
      );
      if (!purchase)
        throw new NotFoundException(`Purchase with id ${id} not found`);

      await em.removeAndFlush(purchase);
      return { message: `Purchase with id ${id} deleted successfully.` };
    });
  }


  async update(store: Store, id: string, dto: UpdatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(
        Purchase,
        { id, store },
        { populate: ['items', 'items.product', 'customer'] },
      );
      if (!purchase)
        throw new NotFoundException(`Purchase with id ${id} not found`);

      if (purchase.status === PurchaseStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled purchase.`);
      
      if (purchase.status === PurchaseStatus.DONE)
        throw new BadRequestException(`Cannot update a completed purchase.`);

      if (dto.status) {
        this.getAllowedTransitions(
          purchase.status as PurchaseStatus,
          dto.status as PurchaseStatus,
        );
        purchase.status = dto.status;

        if (dto.status === PurchaseStatus.DONE)
          await this.journalEntryService.createFromPurchase(
            em,
            store,
            purchase,
          );
      }

      await em.flush();
      return { message: `Purchase with id ${id} updated successfully.` };
    });
  }



  private buildStockInsMap(
    stockInItems: StockInItem[],
  ): Map<string, StockInDetail> {
    const stockInsMap = new Map<string, StockInDetail>();

    for (const item of stockInItems) {
      if (!item.stockIn || !item.stockIn.inventory) continue;

      const sequence = item.stockIn.sequence;
      const sequenceId = sequence
        ? `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`
        : '';

      const stockInId = item.stockIn.id;

      if (!stockInsMap.has(stockInId)) {
        stockInsMap.set(stockInId, {
          stockInId,
          sequenceId,
          inventoryId: item.stockIn.inventory.id,
          inventoryName: item.stockIn.inventory.name,
          inventoryAddress: item.stockIn.inventory.address,
          status: item.stockIn.status,
          createdAt: item.stockIn.createdAt,
          products: [],
        });
      }

      const purchasedItem = item.purchasedItem;
      if (!purchasedItem?.id || !purchasedItem?.product) 
        continue;

      stockInsMap.get(stockInId)!.products.push({
        purchasedItemId: purchasedItem.id,
        productId: purchasedItem.product.id,
        productName: purchasedItem.product.name ?? '',
        quantity: item.quantity,
      });
    }

    return stockInsMap;
  }


  private getAllowedTransitions(
    currentStatus: PurchaseStatus,
    newStatus: PurchaseStatus,
  ): void {
    const transitions = new Map([
      [PurchaseStatus.DRAFT, [PurchaseStatus.DONE, PurchaseStatus.CANCELLED]],
      [PurchaseStatus.DONE, []],
      [PurchaseStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'.`,
      );
  }

  
  private mapPurchaseToListItem(
    serialized: any,
    stockInsMap?: Map<string, StockInDetail>,
  ): PurchaseListItem {
    const { sequence, createdAt, updatedAt, ...rest } = serialized;

    const items: PurchaseItemType[] = serialized.items.map((item: any) => {
      const { purchase, ...itemData } = item;
      return itemData;
    });

    return {
      ...rest,
      sequenceId: `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`,
      totalPrice: serialized.items.reduce((sum: number, item: any) => {
        return sum + item.unitPrice * item.quantity;
      }, 0),
      items,
      stockIns: stockInsMap ? Array.from(stockInsMap.values()) : [],
    };
  }
}
