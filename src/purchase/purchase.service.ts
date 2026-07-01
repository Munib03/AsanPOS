import { EntityManager, EntityName, serialize } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from '../database/entites/customer.entity';
import { Employee } from '../database/entites/employee.entity';
import { Product } from '../database/entites/product.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { Store } from '../database/entites/store.entity';
import { JournalEntryService } from '../journal/journal-entry.service';
import { SequenceService } from '../sequence/sequence.service';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Meta, PaginateQuery } from '../shared/types/paginate-query.types';
import { PurchaseItemType, PurchaseListItem, StockInDetail } from '../shared/types/purchase.types';
import { PurchaseStatus } from '../shared/utils/purchase-status-enum';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { Inventory } from '../database/entites/inventory.entity';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly em: EntityManager,
    private readonly purchaseRepository: BaseRepository<Purchase>,
    private readonly sequenceService: SequenceService,
    private readonly journalEntryService: JournalEntryService,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store, query: PaginateQuery): Promise<{ data: PurchaseListItem[]; meta: Meta }> {
    const [purchases, meta] = await this.purchaseRepository.findAndPaginate(
      { store },
      {
        populate: ['customer', 'items', 'items.product', 'sequence'],
        fields: [
          'id', 'status', 'customDate', 'createdAt', 'items.received',
          'sequence.prefix', 'sequence.lastIndex',
          'customer.id', 'customer.name',
          'items.id', 'items.quantity', 'items.unitPrice',
          'items.product.id', 'items.product.name', 'items.product.price',
        ],
      },
      { searchable: ['customer.name', 'status'] },
      query,
    );

    const data = purchases.map((purchase) => {
      const serialized = serialize(purchase, { populate: ['customer', 'items', 'items.product', 'sequence'] });
      return this.mapPurchaseToListItem(serialized);
    });

    return { data, meta };
  }

  async findOne(store: Store, id: string): Promise<PurchaseListItem> {
    const purchase = await this.em.findOne(
      Purchase,
      { id, store },
      {
        populate: ['customer', 'inventory', 'items', 'items.product', 'sequence'],
        fields: [
          'id', 'status', 'customDate',
          'inventory.id', 'inventory.name', 'inventory.address',
          'sequence.prefix', 'sequence.lastIndex',
          'customer.id', 'customer.name', 'customer.phone', 'customer.address',
          'items.id', 'items.quantity', 'items.unitPrice', 'items.received',
          'items.product.id', 'items.product.name', 'items.product.price',
        ],
      },
    );

    if (!purchase) throw new NotFoundException(`Purchase with id ${id} not found`);

    const purchasedItems = purchase.items.getItems();
    const purchasedItemIds = purchasedItems.map((item) => item.id);
    const inventoryId = purchase.inventory?.id ?? null;

    if (purchasedItemIds.length === 0) {
      const serialized = serialize(purchase, { populate: ['customer', 'inventory', 'items', 'items.product', 'sequence'] });
      return this.mapPurchaseToListItem(serialized, undefined, inventoryId);
    }

    let stockInsMap: Map<string, StockInDetail> = new Map();

    try {
      const stockInItems = await this.em.find(
        StockInItem,
        { purchasedItem: { id: { $in: purchasedItemIds } } },
        { populate: ['stockIn', 'stockIn.inventory', 'stockIn.sequence', 'purchasedItem', 'purchasedItem.product'] },
      );
      stockInsMap = this.buildStockInsMap(stockInItems);
    } catch (error) {
      console.error('Error fetching stock-in items:', error);
    }

    const serialized = serialize(purchase, { populate: ['customer', 'inventory', 'items', 'items.product', 'sequence'] });
    return this.mapPurchaseToListItem(serialized, stockInsMap, inventoryId, purchase.inventory?.name);
  }

  async create(store: Store, employeeId: string, dto: CreatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const customer = await this.findOrFail<Customer>(em, Customer, { id: dto.customerId }, `Customer with id ${dto.customerId}`);
      const inventory = await this.findOrFail<Inventory>(em, Inventory, { id: dto.inventoryId, store }, `Inventory with id ${dto.inventoryId}`);

      const sequence = await this.sequenceService.generateSequence('Purchase', 'PUR');
      const purchase = em.create(Purchase, {
        customer,
        store,
        inventory,
        customDate: dto.customDate,
        status: PurchaseStatus.DRAFT,
        sequence,
      });
      await em.persistAndFlush(purchase);

      const productMap = await this.findProductsOrFail(em, dto.items.map((item) => item.productId));

      const purchasedItems = dto.items.map((item) =>
        em.create(PurchasedItem, {
          purchase,
          product: productMap.get(item.productId)!,
          warehouse: inventory,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }),
      );
      await em.persistAndFlush(purchasedItems);

      const employee = await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee');

      this.auditService.logStatusChange(em, employee, AuditEntityType.Purchase, purchase.id, AuditActionType.Create, null, null);

      await em.flush();

      return {
        purchaseId: purchase.id,
        message: `Purchase created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
      };
    });
  }

  async update(store: Store, id: string, employeeId: string, dto: UpdatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(Purchase, { id, store }, { populate: ['items', 'items.product', 'customer'] });
      if (!purchase) throw new NotFoundException(`Purchase with id ${id} not found`);

      if (purchase.status === PurchaseStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled purchase.`);
      if (purchase.status === PurchaseStatus.DONE)
        throw new BadRequestException(`Cannot update a completed purchase.`);

      if (dto.status) {
        this.getAllowedTransitions(purchase.status as PurchaseStatus, dto.status as PurchaseStatus);

        const employee = await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee');

        this.auditService.logStatusChange(em, employee, AuditEntityType.Purchase, purchase.id, AuditActionType.Update, purchase.status, dto.status);

        purchase.status = dto.status;

        if (dto.status === PurchaseStatus.DONE) {
          const journalEntry = await this.journalEntryService.createFromPurchase(em, store, purchase, employeeId);

          const journalItems = journalEntry.items.getItems();
          const journalDebitTotal = journalItems.reduce((sum, item) => sum + (item.debit ?? 0), 0);
          const journalCreditTotal = journalItems.reduce((sum, item) => sum + (item.credit ?? 0), 0);

          if (journalDebitTotal === journalCreditTotal) {
            this.auditService.logStatusChange(
              em, employee, AuditEntityType.JournalEntry, journalEntry.id,
              AuditActionType.Update, JournalEntryStatus.PENDING, JournalEntryStatus.DONE,
            );
            journalEntry.status = JournalEntryStatus.DONE;
          }
        }
      }

      await em.flush();
      return { message: `Purchase with id ${id} updated successfully.` };
    });
  }

  private async findOrFail<T extends object>(
    em: EntityManager,
    entity: EntityName<T>,
    where: any,
    label: string,
  ): Promise<T> {
    const result = await em.findOne(entity, where);
    if (!result) throw new NotFoundException(`${label} not found`);
    return result;
  }

  private async findProductsOrFail(em: EntityManager, productIds: string[]): Promise<Map<string, Product>> {
    const products = await em.findAll(Product, { where: { id: { $in: productIds } } });
    if (products.length !== productIds.length) throw new NotFoundException('One or more products not found');
    return new Map(products.map((p) => [p.id, p]));
  }

  private buildStockInsMap(stockInItems: StockInItem[]): Map<string, StockInDetail> {
    const stockInsMap = new Map<string, StockInDetail>();

    for (const item of stockInItems) {
      if (!item.stockIn || !item.stockIn.inventory) continue;

      const sequence = item.stockIn.sequence;
      const sequenceId = sequence ? `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}` : '';
      const stockInId = item.stockIn.id;

      if (!stockInsMap.has(stockInId)) {
        stockInsMap.set(stockInId, {
          stockInId, sequenceId,
          inventoryId: item.stockIn.inventory.id,
          inventoryName: item.stockIn.inventory.name,
          inventoryAddress: item.stockIn.inventory.address,
          status: item.stockIn.status,
          createdAt: item.stockIn.createdAt,
          products: [],
        });
      }

      const purchasedItem = item.purchasedItem;
      if (!purchasedItem?.id || !purchasedItem?.product) continue;

      stockInsMap.get(stockInId)!.products.push({
        purchasedItemId: purchasedItem.id,
        productId: purchasedItem.product.id,
        productName: purchasedItem.product.name ?? '',
        quantity: item.quantity,
      });
    }

    return stockInsMap;
  }

  private getAllowedTransitions(currentStatus: PurchaseStatus, newStatus: PurchaseStatus): void {
    const transitions = new Map([
      [PurchaseStatus.DRAFT, [PurchaseStatus.DONE, PurchaseStatus.CANCELLED]],
      [PurchaseStatus.DONE, []],
      [PurchaseStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'.`);
  }

  private mapPurchaseToListItem(
    serialized: any,
    stockInsMap?: Map<string, StockInDetail>,
    inventoryId?: string | null,
    inventoryName?: string,
  ): PurchaseListItem {
    const { sequence, createdAt, updatedAt, ...rest } = serialized;

    const items: PurchaseItemType[] = serialized.items.map((item: any) => {
      const { purchase, ...itemData } = item;
      return itemData;
    });

    return {
      ...rest,
      sequenceId: `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`,
      totalPrice: serialized.items.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0),
      items,
      stockIns: stockInsMap ? Array.from(stockInsMap.values()) : [],
      inventoryId,
      inventoryName,
    };
  }
}