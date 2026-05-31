import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { Customer } from '../database/entites/customer.entity';
import { Product } from '../database/entites/product.entity';
import { Store } from '../database/entites/store.entity';
import { SequenceService } from '../sequence/sequence.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery, Meta } from '../shared/types/paginate-query.types';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Inventory } from '../database/entites/inventory.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';


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
    ) { }


    async findAll(store: Store, query: PaginateQuery): Promise<{ data: SaleListItem[]; meta: Meta }> {
        const [sales, meta] = await this.saleRepository.findAndPaginate(
            { store },
            {
                populate: ['customer', 'items', 'items.product', 'sequence'],
                fields: [
                    'id', 'createdAt',
                    'sequence.prefix', 'sequence.lastIndex',
                    'customer.id', 'customer.name',
                    'items.id', 'items.quantity', 'items.unitPrice',
                    'items.product.id', 'items.product.name', 'items.product.price',
                ],
            },
            {
                searchable: ['customer.name'],
            },
            query,
        );

        const serialized = serialize(sales, { populate: ['customer', 'items', 'items.product', 'sequence'] });

        const data: SaleListItem[] = serialized.map(sale => ({
            ...sale,
            sequenceId: `${sale.sequence.prefix}-${String(sale.sequence.lastIndex).padStart(4, '0')}`,
            totalPrice: sale.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0), 0),
        }));

        return { data, meta };
    }


    async findOne(store: Store, id: string): Promise<SaleListItem> {
        const sale = await this.em.findOne(Sale,
            { id, store },
            { populate: ['customer', 'items', 'items.product', 'sequence'] }
        );

        if (!sale)
            throw new NotFoundException(`Sale with id ${id} not found`);

        const serialized = serialize(sale, { populate: ['customer', 'items', 'items.product', 'sequence'] });
        const { sequence, ...rest } = serialized;

        return {
            ...rest,
            sequenceId: `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`,
            totalPrice: serialized.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0), 0),
        };
    }

    async create(store: Store, dto: CreateSaleDto) {
        return await this.em.transactional(async (em) => {
            const customer = await em.findOne(Customer, { id: dto.customerId });
            if (!customer)
            throw new NotFoundException(`Customer with id ${dto.customerId} not found`);

            const sequence = await this.sequenceService.generateSequence('Sale', 'SAL');

            const sale = em.create(Sale, { customer, store, sequence });
            await em.persistAndFlush(sale);

            const products = await em.findAll(Product, {
            where: { id: { $in: dto.items.map(item => item.productId) } },
            });

            if (products.length !== dto.items.length)
            throw new NotFoundException(`One or more products not found`);

            const productMap = new Map(products.map(product => [product.id, product]));

            const storeInventories = await em.find(Inventory, { store });

            if (storeInventories.length === 0)
            throw new BadRequestException(`No inventories are configured for this store.`);

            for (const item of dto.items) {
                const product = productMap.get(item.productId);
                if (!product)
                    throw new NotFoundException(`Product with id ${item.productId} not found`);

                const stockRecords = await em.find(StockQuantity, {
                    product: { id: item.productId },
                    inventory: { $in: storeInventories.map(inv => inv.id) },
            });

            const totalStock = stockRecords.reduce(
                (sum, sq) => sum + (sq.quantity ?? 0),
                0,
            );

            if (totalStock < item.quantity)
                throw new BadRequestException(
                `Insufficient stock for product "${product.name}": ` +
                `requested ${item.quantity}, available ${totalStock}.`,
                );
            }

            const saleItems = dto.items.map(item => {
            const product = productMap.get(item.productId)!;
            return em.create(SaleItem, {
                sale,
                product,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
            });
            });

            await em.persistAndFlush(saleItems);

            return {
            message: `Sale created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
            };
        });
    }



    async remove(store: Store, id: string) {
        return await this.em.transactional(async (em) => {
            const sale = await em.findOne(Sale, { id, store }, { populate: ['items'] });
            if (!sale)
                throw new NotFoundException(`Sale with id ${id} not found`);

            await em.removeAndFlush(sale);
            return { message: `Sale with id ${id} deleted successfully.` };
        });
    }
}