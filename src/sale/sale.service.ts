import { EntityManager, serialize } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Customer } from '../database/entites/customer.entity';
import { Employee } from '../database/entites/employee.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { Product } from '../database/entites/product.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { Sale } from '../database/entites/sale.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { Store } from '../database/entites/store.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { StockOut } from '../database/entites/stock-out.entity';
import { StockOutItem } from '../database/entites/stock-out-item.entity';
import { Payment } from '../database/entites/payments.entity';
import { JournalEntryService } from '../journal/journal-entry.service';
import { SequenceService } from '../sequence/sequence.service';
import { StockQuantityService } from '../stock-quantity/stock-quantity.service';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { SaleStatus } from '../shared/utils/sale-status.enum';
import { StockOutStatus } from '../shared/utils/stock-out-status.enum';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { PaymentStatus } from '../shared/utils/payments-status.enum';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { ReceiptService } from '../receipt/receipt.service';
import { PaginateQuery, Meta } from '../shared/types/paginate-query.types';
import { BaseRepository } from '../shared/repositories/base.repository';
import { EntityName } from '@mikro-orm/core';


export interface SaleListItem {
  id: string;
  sequenceId?: string;
  createdAt?: Date;
  customer: { id?: string; name?: string };
  items: {
    id?: string;
    quantity?: number;
    unitPrice?: number;
    product: { id?: string; name?: string; price?: number };
  }[];
  totalPrice: number;
}

@Injectable()
export class SaleService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly journalEntryService: JournalEntryService,
    private readonly stockQuantityService: StockQuantityService,
    private readonly auditService: AuditService,
    private readonly receiptService: ReceiptService,
    private readonly saleRepository: BaseRepository<Sale>,
  ) { }


  async findAll(
    store: Store,
    query: PaginateQuery,
  ): Promise<{ data: SaleListItem[]; meta: Meta }> {
    const [sales, meta] = await this.saleRepository.findAndPaginate(
      { store },
      {
        populate: ['customer', 'items', 'items.product', 'sequence'],
        fields: [
          'id',
          'createdAt',
          'status',
          'sequence.prefix',
          'sequence.lastIndex',
          'sequence.entity',
          'customer.id',
          'customer.name',
          'items.id',
          'items.quantity',
          'items.unitPrice',
          'items.product.id',
          'items.product.name',
          'items.product.price',
        ],
      },
      { searchable: ['customer.name'] },
      query,
    );

    const serialized = serialize(sales, {
      populate: ['customer', 'items', 'items.product', 'sequence'],
    });

    const data: SaleListItem[] = sales.map((sale, index) => ({
      ...serialized[index],
      sequenceId: this.sequenceService.formatSequence(sale.sequence),
      totalPrice: serialized[index].items.reduce(
        (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0),
        0,
      ),
    }));

    return { data, meta };
  }


  async checkout(store: Store, employeeId: string, dto: CreateSaleDto) {
    return await this.em.transactional(async (em) => {
      const customer = await this.findOrFail<Customer>(
        em, Customer, { id: dto.customerId }, `Customer with id ${dto.customerId}`,
      );

      const activeSession = await em.findOne(StoreSession, {
        store,
        openedBy: { id: employeeId },
        closedAt: null,
      });
      if (!activeSession)
        throw new BadRequestException('No active session found. Please open a session first.');

      const employee = await this.findOrFail<Employee>(
        em, Employee, { id: employeeId }, 'Employee',
      );

      const inventory = await this.findOrFail<Inventory>(
        em, Inventory, { id: dto.inventoryId, store }, `Inventory with id ${dto.inventoryId}`,
      );

      const productMap = await this.findProductsOrFail(em, dto.items.map((i) => i.productId));

      await this.validateStockAvailability(em, dto, inventory, productMap);

      const sequence = await this.sequenceService.generateSequence('Sale', 'SAL');
      const sale = em.create(Sale, {
        customer,
        store,
        sequence,
        status: SaleStatus.DRAFT,
      });
      await em.persistAndFlush(sale);

      const saleItems = dto.items.map((item) =>
        em.create(SaleItem, {
          sale,
          product: productMap.get(item.productId)!,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }),
      );
      await em.persistAndFlush(saleItems);

      this.auditService.logStatusChange(
        em, employee, AuditEntityType.Sale, sale.id,
        AuditActionType.Create, null, SaleStatus.DRAFT,
      );

      await em.populate(sale, ['items', 'items.product', 'customer']);
      const journalEntry = await this.journalEntryService.createFromSale(em, store, sale, employeeId);

      this.auditService.logStatusChange(
        em, employee, AuditEntityType.Sale, sale.id,
        AuditActionType.Update, SaleStatus.DRAFT, SaleStatus.DONE,
      );
      sale.status = SaleStatus.DONE;

      const stockOutSequence = await this.sequenceService.generateSequence('StockOut', 'STO');
      const stockOut = em.create(StockOut, {
        inventory,
        sale,
        sequence: stockOutSequence,
        status: StockOutStatus.PENDING,
      });
      em.persist(stockOut);

      dto.items.forEach((item, i) => {
        em.create(StockOutItem, {
          stockOut,
          product: saleItems[i].product,
          saleItem: saleItems[i],
          quantity: item.quantity,
        });
      });

      this.auditService.logStatusChange(
        em, employee, AuditEntityType.StockOut, stockOut.id,
        AuditActionType.Create, null, StockOutStatus.PENDING,
      );

      await em.flush();

      for (const item of dto.items) {
        await this.stockQuantityService.decreaseStockQuantity(
          em, inventory, productMap.get(item.productId)!, item.quantity,
        );
      }

      this.auditService.logStatusChange(
        em, employee, AuditEntityType.StockOut, stockOut.id,
        AuditActionType.Update, StockOutStatus.PENDING, StockOutStatus.DONE,
      );
      stockOut.status = StockOutStatus.DONE;

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice, 0,
      );

      const payment = em.create(Payment, {
        sale,
        storeSession: activeSession,
        amount: totalAmount,
        status: PaymentStatus.Done,
      });
      em.persist(payment);

      this.auditService.log(
        em, employee, AuditEntityType.Payment, payment.id,
        AuditActionType.Create, null,
        { saleId: sale.id, amount: totalAmount, status: PaymentStatus.Done },
      );

      if (payment.amount === totalAmount) {
        this.auditService.logStatusChange(
          em, employee, AuditEntityType.JournalEntry, journalEntry.id,
          AuditActionType.Update, JournalEntryStatus.PENDING, JournalEntryStatus.DONE,
        );
        journalEntry.status = JournalEntryStatus.DONE;
      }

      await em.flush();

      const createdSale = await em.findOne(
        Sale, { id: sale.id }, { populate: ['items', 'items.product'] },
      );
      const serialized = serialize(createdSale!, { populate: ['items', 'items.product'] });
      const formattedItems = this.formatSaleItems(serialized.items);

      const receipt = await this.receiptService.create(em, store, activeSession, {
        saleId: sale.id,
        sequenceId: this.sequenceService.formatSequence(sequence),
        customerName: customer.name,
        totalAmount,
        items: formattedItems,
      });

      await em.flush();

      return {
        message: 'Sale is created successfully!',
        saleId: sale.id,
        receipt: {
          receiptId: receipt.id,
          storeName: receipt.store.name,
          sequenceId: this.sequenceService.formatSequence(sequence),
          customerName: customer.name,
          totalAmount,
          items: formattedItems.map(({ productName, quantity, unitPrice, total }) => ({
            productName, quantity, unitPrice, subTotal: total,
          })),
        },
        createdAt: receipt.createdAt,
      };
    });
  }


  async update(store: Store, id: string, employeeId: string, dto: UpdateSaleDto) {
    return await this.em.transactional(async (em) => {
      const sale = await em.findOne(Sale, { id, store });
      if (!sale) throw new NotFoundException(`Sale with id ${id} not found`);

      if (sale.status === SaleStatus.DONE)
        throw new BadRequestException(`Cannot update a completed sale.`);

      if (sale.status === SaleStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled sale.`);

      if (dto.status) {
        this.validateSaleTransition(sale.status as SaleStatus, dto.status as SaleStatus);

        const employee = await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee');

        if (dto.status === SaleStatus.DONE) {
          await em.populate(sale, ['items', 'items.product', 'customer']);
          await this.journalEntryService.createFromSale(em, store, sale, employeeId);
        }

        this.auditService.logStatusChange(
          em, employee, AuditEntityType.Sale, sale.id,
          AuditActionType.Update, sale.status ?? '', dto.status,
        );

        sale.status = dto.status;
      }

      await em.flush();
      return { message: `Sale with id ${id} updated successfully.` };
    });
  }



  private validateSaleTransition(currentStatus: SaleStatus, newStatus: SaleStatus): void {
    const transitions = new Map([
      [SaleStatus.DRAFT, [SaleStatus.DONE, SaleStatus.CANCELLED]],
      [SaleStatus.DONE, []],
      [SaleStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'.`,
      );
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


  private async findProductsOrFail(
    em: EntityManager,
    productIds: string[],
  ): Promise<Map<string, Product>> {
    const products = await em.findAll(Product, { where: { id: { $in: productIds } } });
    if (products.length !== productIds.length)
      throw new NotFoundException('One or more products not found');
    
    return new Map(products.map((p) => [p.id, p]));
  }


  private async validateStockAvailability(
    em: EntityManager,
    dto: CreateSaleDto,
    inventory: Inventory,
    productMap: Map<string, Product>,
  ): Promise<void> {
    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException(`Product with id ${item.productId} not found`);

      const stockRecord = await em.findOne(StockQuantity, {
        product: { id: item.productId },
        inventory: { id: inventory.id },
      });

      const available = stockRecord?.quantity ?? 0;
      if (available < item.quantity)
        throw new BadRequestException(
          `Insufficient stock for product "${product.name}": requested ${item.quantity}, available ${available}.`,
        );
    }
  }
  

  private formatSaleItems(items: any[]) {
    return items.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: (item.quantity ?? 0) * (item.unitPrice ?? 0),
    }));
  }
}