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
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
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
import { SalePaymentStatus } from '../shared/utils/sale-payment-status.enum';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { ReceiptService } from '../receipt/receipt.service';
import { PaginateQuery, Meta } from '../shared/types/paginate-query.types';
import { BaseRepository } from '../shared/repositories/base.repository';
import { EntityName } from '@mikro-orm/core';


export interface SaleListItem {
  id: string;
  sequenceId: string;
  status: string;
  paymentStatus: SalePaymentStatus;
  createdAt?: Date;
  customer: { id: string; name: string };
  totalPrice: number;
}

export interface SaleDetail extends SaleListItem {
  remainingBalance: number;
  paymentHistory: {
    id: string;
    amount: number;
    paidAt?: Date;
    cashier: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
  }[];
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    subTotal: number;
    product: { id: string; name: string };
  }[];
}

type SaleTotalRow = {
  saleId: string;
  quantity: string | number | null;
  unitPrice: string | number | null;
};

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
        populate: ['customer', 'sequence'],
        fields: [
          'id',
          'createdAt',
          'status',
          'paymentStatus',
          'sequence.prefix',
          'sequence.lastIndex',
          'customer.id',
          'customer.name',
        ],
      },
      { searchable: ['customer.name'] },
      query,
    );

    const totals = await this.getSaleTotals(sales.map((sale) => sale.id));

    const data: SaleListItem[] = sales.map((sale) => ({
      id: sale.id,
      sequenceId: this.formatSequence(sale.sequence),
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      customer: {
        id: sale.customer.id,
        name: sale.customer.name,
      },
      totalPrice: totals.get(sale.id) ?? 0,
      createdAt: sale.createdAt,
    }));

    return { data, meta };
  }

  async findOne(store: Store, id: string): Promise<SaleDetail> {
    const sale = await this.saleRepository.findOneOrFail(
      { id, store },
      {
        populate: ['customer', 'items', 'items.product', 'sequence'],
        fields: [
          'id',
          'status',
          'paymentStatus',
          'createdAt',
          'sequence.prefix',
          'sequence.lastIndex',
          'customer.id',
          'customer.name',
          'items.id',
          'items.quantity',
          'items.unitPrice',
          'items.product.id',
          'items.product.name',
        ],
        notFoundMessage: `Sale with id ${id} not found`,
      },
    );

    const items = sale.items.getItems().map((item) => {
      const quantity = item.quantity ?? 0;
      const unitPrice = item.unitPrice ?? 0;

      return {
        id: item.id,
        quantity,
        unitPrice,
        subTotal: quantity * unitPrice,
        product: {
          id: item.product.id,
          name: item.product.name ?? '',
        },
      };
    });

    const totalPrice = this.roundMoney(
      items.reduce((sum, item) => sum + item.subTotal, 0),
    );
    const payments = await this.em.find(
      Payment,
      { sale: { id: sale.id }, status: PaymentStatus.Done },
      {
        populate: ['storeSession', 'storeSession.openedBy'],
        fields: [
          'id',
          'amount',
          'createdAt',
          'storeSession.id',
          'storeSession.openedBy.id',
          'storeSession.openedBy.firstName',
          'storeSession.openedBy.lastName',
        ],
        orderBy: { createdAt: 'ASC' },
      },
    );
    const paidAmount = this.roundMoney(
      payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    );

    return {
      id: sale.id,
      sequenceId: this.formatSequence(sale.sequence),
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      customer: {
        id: sale.customer.id,
        name: sale.customer.name,
      },
      items,
      totalPrice,
      remainingBalance: this.roundMoney(Math.max(0, totalPrice - paidAmount)),
      paymentHistory: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.createdAt,
        cashier: payment.storeSession?.openedBy
          ? {
              id: payment.storeSession.openedBy.id,
              firstName: payment.storeSession.openedBy.firstName,
              lastName: payment.storeSession.openedBy.lastName,
            }
          : null,
      })),
      createdAt: sale.createdAt,
    };
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

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice, 0,
      );
      const paymentAmount = this.resolveCheckoutPaymentAmount(dto, totalAmount);

      const sequence = await this.sequenceService.generateSequence(store, 'Sale', 'SAL');
      const sale = em.create(Sale, {
        customer,
        store,
        sequence,
        status: SaleStatus.DRAFT,
        paymentStatus: dto.paymentStatus,
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

      const stockOutSequence = await this.sequenceService.generateSequence(store, 'StockOut', 'STO');
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

      if (paymentAmount > 0) {
        const payment = em.create(Payment, {
          sale,
          storeSession: activeSession,
          amount: paymentAmount,
          status: PaymentStatus.Done,
        });
        em.persist(payment);

        this.auditService.log(
          em, employee, AuditEntityType.Payment, payment.id,
          AuditActionType.Create, null,
          { saleId: sale.id, amount: paymentAmount, status: PaymentStatus.Done },
        );
      }

      if (dto.paymentStatus === SalePaymentStatus.FullyPaid) {
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
        cashier: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
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
          cashier: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
          },
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

      if (dto.status && sale.status === SaleStatus.DONE)
        throw new BadRequestException(`Cannot update a completed sale.`);

      if (sale.status === SaleStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled sale.`);

      const hasPaymentUpdate = dto.amount !== undefined || dto.paymentStatus !== undefined;
      const employee = dto.status || hasPaymentUpdate
        ? await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee')
        : undefined;

      if (dto.status) {
        this.validateSaleTransition(sale.status as SaleStatus, dto.status as SaleStatus);

        if (dto.status === SaleStatus.DONE) {
          await em.populate(sale, ['items', 'items.product', 'customer']);
          await this.journalEntryService.createFromSale(em, store, sale, employeeId);
        }

        this.auditService.logStatusChange(
          em, employee!, AuditEntityType.Sale, sale.id,
          AuditActionType.Update, sale.status ?? '', dto.status,
        );

        sale.status = dto.status;
      }

      if (hasPaymentUpdate) {
        await this.addPaymentToSale(em, store, sale, employee!, employeeId, dto);
      }

      await em.flush();
      return { message: `Sale with id ${id} updated successfully.` };
    });
  }


  private resolveCheckoutPaymentAmount(
    dto: CreateSaleDto,
    totalAmount: number,
  ): number {
    const total = this.roundMoney(totalAmount);
    const amount = dto.amount === undefined ? undefined : this.roundMoney(dto.amount);

    if (dto.paymentStatus === SalePaymentStatus.FullyPaid) {
      if (amount === undefined)
        throw new BadRequestException(
          'Amount is required for a fully paid sale.',
        );

      if (amount !== total)
        throw new BadRequestException(
          `A fully paid sale must receive the full amount of ${total}.`,
        );

      return amount;
    }

    if (dto.paymentStatus === SalePaymentStatus.PartiallyPaid) {
      if (amount === undefined)
        throw new BadRequestException(
          'Amount is required for a partially paid sale.',
        );

      if (amount >= total)
        throw new BadRequestException(
          'A partial payment must be less than the sale total.',
        );

      return amount;
    }

    if (amount !== undefined && amount !== 0)
      throw new BadRequestException(
        'The amount for an unpaid sale must be 0.',
      );

    return 0;
  }

  private async addPaymentToSale(
    em: EntityManager,
    store: Store,
    sale: Sale,
    employee: Employee,
    employeeId: string,
    dto: UpdateSaleDto,
  ): Promise<void> {
    if (dto.amount === undefined || dto.paymentStatus === undefined)
      throw new BadRequestException(
        'Both amount and paymentStatus are required when adding a payment.',
      );

    if (sale.paymentStatus === SalePaymentStatus.FullyPaid)
      throw new BadRequestException('This sale is already fully paid.');

    await em.populate(sale, ['items']);
    const totalAmount = this.roundMoney(
      sale.items
        .getItems()
        .reduce(
          (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
          0,
        ),
    );

    const previousPayments = await em.find(Payment, {
      sale,
      status: PaymentStatus.Done,
    });
    const previouslyPaid = this.roundMoney(
      previousPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
    const paymentAmount = this.roundMoney(dto.amount);
    const remainingAmount = this.roundMoney(totalAmount - previouslyPaid);

    if (paymentAmount > remainingAmount)
      throw new BadRequestException(
        `Payment exceeds the remaining balance of ${remainingAmount}.`,
      );

    const newPaidTotal = this.roundMoney(previouslyPaid + paymentAmount);
    const newPaymentStatus = newPaidTotal === totalAmount
      ? SalePaymentStatus.FullyPaid
      : SalePaymentStatus.PartiallyPaid;

    if (dto.paymentStatus !== newPaymentStatus)
      throw new BadRequestException(
        `paymentStatus must be '${newPaymentStatus}' for this payment amount.`,
      );

    const activeSession = await em.findOne(StoreSession, {
      store,
      openedBy: { id: employeeId },
      closedAt: null,
    });
    if (!activeSession)
      throw new BadRequestException(
        'No active session found. Please open a session first.',
      );

    const payment = em.create(Payment, {
      sale,
      storeSession: activeSession,
      amount: paymentAmount,
      status: PaymentStatus.Done,
    });
    em.persist(payment);

    this.auditService.log(
      em, employee, AuditEntityType.Payment, payment.id,
      AuditActionType.Create, null,
      { saleId: sale.id, amount: paymentAmount, status: PaymentStatus.Done },
    );

    const previousPaymentStatus = sale.paymentStatus;
    sale.paymentStatus = newPaymentStatus;
    this.auditService.logStatusChange(
      em, employee, AuditEntityType.Sale, sale.id,
      AuditActionType.Update, previousPaymentStatus, newPaymentStatus,
    );

    if (newPaymentStatus === SalePaymentStatus.FullyPaid) {
      const journalItem = await em.findOne(
        JournalEntryItem,
        { sale },
        { populate: ['journalEntry'] },
      );
      if (!journalItem)
        throw new NotFoundException('Journal entry for this sale not found.');

      if (journalItem.journalEntry.status !== JournalEntryStatus.DONE) {
        this.auditService.logStatusChange(
          em, employee, AuditEntityType.JournalEntry, journalItem.journalEntry.id,
          AuditActionType.Update, journalItem.journalEntry.status, JournalEntryStatus.DONE,
        );
        journalItem.journalEntry.status = JournalEntryStatus.DONE;
      }
    }
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

  private async getSaleTotals(saleIds: string[]): Promise<Map<string, number>> {
    if (saleIds.length === 0) return new Map();

    const rows = (await this.em
      .getKnex()<SaleTotalRow>('sale_items')
      .whereIn('sale_id', saleIds)
      .select(
        'sale_id as saleId',
        'quantity',
        'unit_price as unitPrice',
      )) as SaleTotalRow[];

    const totals = new Map<string, number>();
    for (const row of rows) {
      const subTotal = Number(row.quantity ?? 0) * Number(row.unitPrice ?? 0);
      totals.set(row.saleId, (totals.get(row.saleId) ?? 0) + subTotal);
    }

    return totals;
  }

  private formatSequence(sequence: { prefix: string; lastIndex: number }): string {
    return `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`;
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
