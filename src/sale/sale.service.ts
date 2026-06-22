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
import { BaseRepository } from '../shared/repositories/base.repository';
import { Meta, PaginateQuery } from '../shared/types/paginate-query.types';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { DashboardRange, DashboardStats } from './dto/dashboard.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { PaymentStatus } from '../shared/utils/payments-status.enum';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { ReceiptService } from '../receipt/receipt.service';


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
    private readonly saleRepository: BaseRepository<Sale>,
    private readonly sequenceService: SequenceService,
    private readonly journalEntryService: JournalEntryService,
    private readonly stockQuantityService: StockQuantityService,
    private readonly auditService: AuditService,
    private readonly receiptService: ReceiptService,
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
      {
        searchable: ['customer.name'],
      },
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


  async findOne(store: Store, id: string): Promise<SaleListItem> {
    const sale = await this.em.findOne(
      Sale,
      { id, store },
      { populate: ['customer', 'items', 'items.product', 'sequence'] },
    );

    if (!sale) throw new NotFoundException(`Sale with id ${id} not found`);

    const serialized = serialize(sale, {
      populate: ['customer', 'items', 'items.product', 'sequence'],
    });

    const { sequence, ...rest } = serialized;

    return {
      ...rest,
      sequenceId: this.sequenceService.formatSequence(sale.sequence),
      totalPrice: serialized.items.reduce(
        (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0),
        0,
      ),
    };
  }


  async checkout(store: Store, employeeId: string, dto: CreateSaleDto) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id: dto.customerId });
      if (!customer)
        throw new NotFoundException(`Customer with id ${dto.customerId} not found`);

      const activeSession = await em.findOne(StoreSession, {
        store,
        openedBy: { id: employeeId },
        closedAt: null,
      });

      if (!activeSession)
        throw new BadRequestException('No active session found. Please open a session first.');

      const employee = await em.findOne(Employee, { id: employeeId });
      if (!employee)
        throw new NotFoundException('Employee not found');

      const inventory = await em.findOne(Inventory, { id: dto.inventoryId, store });
      if (!inventory)
        throw new NotFoundException(`Inventory with id ${dto.inventoryId} not found`);

      const products = await em.findAll(Product, {
        where: { id: { $in: dto.items.map((item) => item.productId) } },
      });

      if (products.length !== dto.items.length)
        throw new NotFoundException(`One or more products not found`);

      const productMap = new Map(products.map((product) => [product.id, product]));

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product)
          throw new NotFoundException(`Product with id ${item.productId} not found`);

        const stockRecord = await em.findOne(StockQuantity, {
          product: { id: item.productId },
          inventory: { id: dto.inventoryId },
        });

        const available = stockRecord?.quantity ?? 0;

        if (available < item.quantity)
          throw new BadRequestException(
            `Insufficient stock for product "${product.name}": requested ${item.quantity}, available ${available}.`,
          );
      }

      const sequence = await this.sequenceService.generateSequence('Sale', 'SAL');
      const sale = em.create(Sale, {
        customer,
        store,
        sequence,
        status: SaleStatus.DRAFT,
      });
      await em.persistAndFlush(sale);

      const saleItems = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        return em.create(SaleItem, {
          sale,
          product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      });
      await em.persistAndFlush(saleItems);

      this.auditService.logStatusChange(
        em,
        employee,
        AuditEntityType.Sale,
        sale.id,
        AuditActionType.Create,
        null,
        SaleStatus.DRAFT,
      );

      await em.populate(sale, ['items', 'items.product', 'customer']);
      const journalEntry = await this.journalEntryService.createFromSale(em, store, sale, employeeId);

      this.auditService.logStatusChange(
        em,
        employee,
        AuditEntityType.Sale,
        sale.id,
        AuditActionType.Update,
        SaleStatus.DRAFT,
        SaleStatus.DONE,
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

      for (let i = 0; i < dto.items.length; i++) {
        const saleItem = saleItems[i];
        em.create(StockOutItem, {
          stockOut,
          product: saleItem.product,
          saleItem,
          quantity: dto.items[i].quantity,
        });
      }

      this.auditService.logStatusChange(
        em,
        employee,
        AuditEntityType.StockOut,
        stockOut.id,
        AuditActionType.Create,
        null,
        StockOutStatus.PENDING,
      );

      await em.flush();

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        await this.stockQuantityService.decreaseStockQuantity(
          em,
          inventory,
          product,
          item.quantity,
        );
      }

      this.auditService.logStatusChange(
        em,
        employee,
        AuditEntityType.StockOut,
        stockOut.id,
        AuditActionType.Update,
        StockOutStatus.PENDING,
        StockOutStatus.DONE,
      );
      stockOut.status = StockOutStatus.DONE;

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );

      const payment = em.create(Payment, {
        sale,
        storeSession: activeSession,
        amount: totalAmount,
        status: PaymentStatus.Done,
      });
      em.persist(payment);

      this.auditService.log(
        em,
        employee,
        AuditEntityType.Payment,
        payment.id,
        AuditActionType.Create,
        null,
        { saleId: sale.id, amount: totalAmount, status: PaymentStatus.Done },
      );

      if (payment.amount === totalAmount) {
        this.auditService.logStatusChange(
          em,
          employee,
          AuditEntityType.JournalEntry,
          journalEntry.id,
          AuditActionType.Update,
          JournalEntryStatus.PENDING,
          JournalEntryStatus.DONE,
        );

        journalEntry.status = JournalEntryStatus.DONE;
      }

      await em.flush();

      const createdSale = await em.findOne(
        Sale,
        { id: sale.id },
        { populate: ['items', 'items.product'] },
      );
      const serialized = serialize(createdSale!, {
        populate: ['items', 'items.product'],
      });

      const receiptItems = {
        saleId: sale.id,
        sequenceId: this.sequenceService.formatSequence(sequence),
        customerName: customer.name,
        totalAmount,
        items: serialized.items.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: (item.quantity ?? 0) * (item.unitPrice ?? 0),
        })),
      };

      const receipt = await this.receiptService.create(em, store, activeSession, receiptItems);

      await em.flush();

      return {
        message: "Sale is created successfully!",
        saleId: sale.id,
        receipt: {
          receiptId: receipt.id,
          storeName: receipt.store.name,
          sequenceId: this.sequenceService.formatSequence(sequence),
          customerName: customer.name,
          totalAmount,
          items: serialized.items.map((item) => ({
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subTotal: (item.quantity ?? 0) * (item.unitPrice ?? 0),
          })),
        },
        createdAt: receipt.createdAt,
      };
    });
  }


  async update(store: Store, id: string, employeeId: string, dto: UpdateSaleDto) {
    return await this.em.transactional(async (em) => {
      const sale = await em.findOne(Sale, { id, store });
      if (!sale)
        throw new NotFoundException(`Sale with id ${id} not found`);

      if (sale.status === SaleStatus.DONE)
        throw new BadRequestException(`Cannot update a completed sale.`);

      if (sale.status === SaleStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled sale.`);

      if (dto.status) {
        this.validateSaleTransition(sale.status as SaleStatus, dto.status as SaleStatus);

        const employee = await em.findOne(Employee, { id: employeeId });
        if (!employee)
          throw new NotFoundException('Employee not found');

        if (dto.status === SaleStatus.DONE) {
          await em.populate(sale, ['items', 'items.product', 'customer']);
          await this.journalEntryService.createFromSale(em, store, sale, employeeId);
        }

        this.auditService.logStatusChange(
          em,
          employee,
          AuditEntityType.Sale,
          sale.id,
          AuditActionType.Update,
          sale.status ?? '',
          dto.status,
        );

        sale.status = dto.status;
      }

      await em.flush();
      return { message: `Sale with id ${id} updated successfully.` };
    });
  }


  async getDashboardStats(
    store: Store,
    range: DashboardRange = DashboardRange.TODAY,
  ): Promise<DashboardStats> {
    const { currentStart, currentEnd, previousStart, previousEnd } =
      this.getRangeBounds(range);

    const [currentSales, previousSales] = await Promise.all([
      this.em.find(
        Sale,
        { store, createdAt: { $gte: currentStart, $lte: currentEnd } },
        { populate: ['items', 'items.product'] },
      ),
      this.em.find(
        Sale,
        { store, createdAt: { $gte: previousStart, $lte: previousEnd } },
        { populate: ['items', 'items.product'] },
      ),
    ]);

    const currentTotalSales = this.calcTotalSales(currentSales);
    const previousTotalSales = this.calcTotalSales(previousSales);
    const salesPercentageChange = currentTotalSales + previousTotalSales === 0
      ? 0
      : (currentTotalSales / (currentTotalSales + previousTotalSales)) * 100;

    const costPriceMap = await this.buildCostPriceMap(store, [...currentSales, ...previousSales]);

    const currentTotalProfit = this.calcTotalProfit(currentSales, costPriceMap);
    const previousTotalProfit = this.calcTotalProfit(previousSales, costPriceMap);
    const profitPercentageChange = currentTotalProfit + previousTotalProfit === 0
      ? 0
      : (currentTotalProfit / (currentTotalProfit + previousTotalProfit)) * 100;

    const lowStockRecords = await this.em.find(
      StockQuantity,
      { inventory: { store }, quantity: { $gte: 1, $lte: 10 } },
      { populate: ['product', 'inventory'] },
    );

    const outOfStockRecords = await this.em.find(
      StockQuantity,
      { inventory: { store }, quantity: 0 },
      { populate: ['product', 'inventory'] },
    );

    const lowStockProducts = lowStockRecords.map((record) => ({
      id: record.product.id,
      name: record.product.name ?? '',
      price: record.product.price ?? 0,
      quantity: record.quantity ?? 0,
      inventoryName: record.inventory.name ?? '',
    }));

    const outOfStockProducts = outOfStockRecords.map((record) => ({
      id: record.product.id,
      name: record.product.name ?? '',
      price: record.product.price ?? 0,
      quantity: record.quantity ?? 0,
      inventoryName: record.inventory.name ?? '',
    }));

    return {
      range,
      sales: {
        total: currentTotalSales,
        percentageChange: Math.round(salesPercentageChange * 100) / 100,
      },
      profit: {
        total: currentTotalProfit,
        percentageChange: Math.round(profitPercentageChange * 100) / 100,
      },
      lowStockProducts,
      outOfStockProducts,
    };
  }

  private getRangeBounds(range: DashboardRange) {
    const now = new Date();

    switch (range) {
      case DashboardRange.YESTERDAY: {
        const currentStart = new Date(now);
        currentStart.setDate(now.getDate() - 1);
        currentStart.setHours(0, 0, 0, 0);
        const currentEnd = new Date(now);
        currentEnd.setDate(now.getDate() - 1);
        currentEnd.setHours(23, 59, 59, 999);

        const previousStart = new Date(now);
        previousStart.setDate(now.getDate() - 2);
        previousStart.setHours(0, 0, 0, 0);
        const previousEnd = new Date(now);
        previousEnd.setDate(now.getDate() - 2);
        previousEnd.setHours(23, 59, 59, 999);

        return { currentStart, currentEnd, previousStart, previousEnd };
      }

      case DashboardRange.LAST_WEEK: {
        const currentEnd = new Date(now);
        currentEnd.setHours(23, 59, 59, 999);
        const currentStart = new Date(now);
        currentStart.setDate(now.getDate() - 6);
        currentStart.setHours(0, 0, 0, 0);

        const previousEnd = new Date(currentStart);
        previousEnd.setDate(currentStart.getDate() - 1);
        previousEnd.setHours(23, 59, 59, 999);
        const previousStart = new Date(previousEnd);
        previousStart.setDate(previousEnd.getDate() - 6);
        previousStart.setHours(0, 0, 0, 0);

        return { currentStart, currentEnd, previousStart, previousEnd };
      }

      case DashboardRange.MONTHLY: {
        const currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        return { currentStart, currentEnd, previousStart, previousEnd };
      }

      case DashboardRange.TODAY:
      default: {
        const currentStart = new Date(now);
        currentStart.setHours(0, 0, 0, 0);
        const currentEnd = new Date(now);
        currentEnd.setHours(23, 59, 59, 999);

        const previousStart = new Date(now);
        previousStart.setDate(now.getDate() - 1);
        previousStart.setHours(0, 0, 0, 0);
        const previousEnd = new Date(now);
        previousEnd.setDate(now.getDate() - 1);
        previousEnd.setHours(23, 59, 59, 999);

        return { currentStart, currentEnd, previousStart, previousEnd };
      }
    }
  }



  private calcTotalSales(sales: Sale[]): number {
    return sales.reduce(
      (sum, sale) =>
        sum +
        sale.items
          .getItems()
          .reduce((s, item) => s + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0),
      0,
    );
  }


  private async buildCostPriceMap(store: Store, sales: Sale[]): Promise<Map<string, number>> {
    const productIds = [
      ...new Set(
        sales.flatMap((sale) =>
          sale.items.getItems().map((item) => item.product.id),
        ),
      ),
    ];

    const costPriceMap = new Map<string, number>();

    if (productIds.length === 0) return costPriceMap;

    const latestPurchasedItems = await this.em.find(
      PurchasedItem,
      {
        product: { id: { $in: productIds } },
        purchase: { store },
      },
      { orderBy: { createdAt: 'DESC' } },
    );

    for (const item of latestPurchasedItems) {
      if (!costPriceMap.has(item.product.id))
        costPriceMap.set(item.product.id, item.unitPrice);
    }

    return costPriceMap;
  }

  private calcTotalProfit(sales: Sale[], costPriceMap: Map<string, number>): number {
    return sales.reduce(
      (sum, sale) =>
        sum +
        sale.items.getItems().reduce((s, item) => {
          const costPrice = costPriceMap.get(item.product.id) ?? 0;
          return s + ((item.unitPrice ?? 0) - costPrice) * (item.quantity ?? 0);
        }, 0),
      0,
    );
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
}