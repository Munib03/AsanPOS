import { EntityManager, serialize } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Customer } from '../database/entites/customer.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { Product } from '../database/entites/product.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { Sale } from '../database/entites/sale.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { Store } from '../database/entites/store.entity';
import { JournalEntryService } from '../journal/journal-entry.service';
import { SequenceService } from '../sequence/sequence.service';
import { StockQuantityService } from '../stock-quantity/stock-quantity.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Meta, PaginateQuery } from '../shared/types/paginate-query.types';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { DashboardStats } from './dto/dashboard.dto';

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

  async create(store: Store, dto: CreateSaleDto) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id: dto.customerId });
      if (!customer)
        throw new NotFoundException(
          `Customer with id ${dto.customerId} not found`,
        );

      const sequence = await this.sequenceService.generateSequence(
        'Sale',
        'SAL',
      );

      const sale = em.create(Sale, { customer, store, sequence });
      await em.persistAndFlush(sale);

      const products = await em.findAll(Product, {
        where: { id: { $in: dto.items.map((item) => item.productId) } },
      });

      if (products.length !== dto.items.length)
        throw new NotFoundException(`One or more products not found`);

      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );

      const inventory = await em.findOne(Inventory, {
        id: dto.inventoryId,
        store,
      });
      if (!inventory)
        throw new NotFoundException(
          `Inventory with id ${dto.inventoryId} not found`,
        );

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product)
          throw new NotFoundException(
            `Product with id ${item.productId} not found`,
          );

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

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        await this.stockQuantityService.decreaseStockQuantity(
          em,
          inventory,
          product,
          item.quantity,
        );
      }

      await em.populate(sale, ['items', 'items.product', 'customer']);
      await this.journalEntryService.createFromSale(em, store, sale);

      const createdSale = await em.findOne(
        Sale,
        { id: sale.id },
        { populate: ['items', 'items.product'] },
      );
      const serialized = serialize(createdSale!, {
        populate: ['items', 'items.product'],
      });

      return {
        message: `Sale created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
        id: sale.id,
        items: serialized.items.map((item) => ({
          id: item.id,
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };
    });
  }

  async remove(store: Store, id: string) {
    return await this.em.transactional(async (em) => {
      const sale = await em.findOne(
        Sale,
        { id, store },
        { populate: ['items'] },
      );
      if (!sale) throw new NotFoundException(`Sale with id ${id} not found`);

      await em.removeAndFlush(sale);
      return { message: `Sale with id ${id} deleted successfully.` };
    });
  }


  async getDashboardStats(store: Store): Promise<DashboardStats> {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(now.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(now.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const [todaySales, yesterdaySales] = await Promise.all([
      this.em.find(
        Sale,
        { store, createdAt: { $gte: todayStart, $lte: todayEnd } },
        { populate: ['items', 'items.product'] },
      ),
      this.em.find(
        Sale,
        { store, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } },
        { populate: ['items', 'items.product'] },
      ),
    ]);

    const calcTotalSales = (sales: Sale[]) =>
      sales.reduce(
        (sum, sale) =>
          sum +
          sale.items
            .getItems()
            .reduce(
              (s, item) => s + (item.quantity ?? 0) * (item.unitPrice ?? 0),
              0,
            ),
        0,
      );

    const todayTotalSales = calcTotalSales(todaySales);
    const yesterdayTotalSales = calcTotalSales(yesterdaySales);

    const salesPercentageChange =
      yesterdayTotalSales === 0
        ? 0
        : ((todayTotalSales - yesterdayTotalSales) / yesterdayTotalSales) * 100;

    const allSales = [...todaySales, ...yesterdaySales];
    const productIds = [
      ...new Set(
        allSales.flatMap((sale) =>
          sale.items.getItems().map((item) => item.product.id),
        ),
      ),
    ];

    const costPriceMap = new Map<string, number>();
    const latestPurchasedItems = await this.em.find(
      PurchasedItem,
      { product: { id: { $in: productIds } } },
      { orderBy: { createdAt: 'DESC' } },
    );
    for (const item of latestPurchasedItems) {
      if (!costPriceMap.has(item.product.id))
        costPriceMap.set(item.product.id, item.unitPrice);
    }

    const calcTotalProfit = (sales: Sale[]) =>
      sales.reduce(
        (sum, sale) =>
          sum +
          sale.items.getItems().reduce((s, item) => {
            const costPrice = costPriceMap.get(item.product.id) ?? 0;
            return s + ((item.unitPrice ?? 0) - costPrice) * (item.quantity ?? 0);
          }, 0),
        0,
      );

    const todayTotalProfit = calcTotalProfit(todaySales);
    const yesterdayTotalProfit = calcTotalProfit(yesterdaySales);

    const profitPercentageChange =
      yesterdayTotalProfit === 0
        ? 0
        : ((todayTotalProfit - yesterdayTotalProfit) / yesterdayTotalProfit) * 100;

    const lowStockRecords = await this.em.find(
      StockQuantity,
      {
        inventory: { store },
        quantity: { $gte: 1, $lte: 10 },
      },
      { populate: ['product', 'inventory'] },
    );

    const lowStockProducts = lowStockRecords.map((record) => ({
      id: record.product.id,
      name: record.product.name ?? '',
      price: record.product.price ?? 0,
      quantity: record.quantity ?? 0,
      inventoryName: record.inventory.name ?? '',
    }));

    return {
      todaySales: {
        total: todayTotalSales,
        percentageChange: Math.round(salesPercentageChange * 100) / 100,
      },
      todayProfit: {
        total: todayTotalProfit,
        percentageChange: Math.round(profitPercentageChange * 100) / 100,
      },
      lowStockProducts,
    };
  }
}