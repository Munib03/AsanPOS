// stock-movement.service.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovement } from '../database/entites/stock-movement.entity';
import { StockMovementItem } from '../database/entites/stock-movement-item.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { Product } from '../database/entites/product.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { SequenceService } from '../sequence/sequence.service';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { StockMovementStatus } from '../shared/utils/stock-movement-status.enum';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Meta, PaginateQuery } from '../shared/types/paginate-query.types';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { UpdateStockMovementDto } from './dto/update-stock-movement.dto';
import { EntityName } from '@mikro-orm/nestjs';

@Injectable()
export class StockMovementService {
    constructor(
        private readonly em: EntityManager,
        private readonly stockMovementRepository: BaseRepository<StockMovement>,
        private readonly sequenceService: SequenceService,
        private readonly auditService: AuditService,
    ) { }


    async findAll(store: Store, query: PaginateQuery): Promise<{ data: any[]; meta: Meta }> {
        const [movements, meta] = await this.stockMovementRepository.findAndPaginate(
            { store },
            {
                populate: ['sourceInventory', 'destinationInventory', 'items', 'items.product', 'sequence'],
                fields: [
                    'id', 'status', 'createdAt',
                    'sequence.prefix', 'sequence.lastIndex',
                    'sourceInventory.id', 'sourceInventory.name',
                    'destinationInventory.id', 'destinationInventory.name',
                    'items.id', 'items.quantity',
                    'items.product.id', 'items.product.name',
                ],
            },
            { searchable: ['status'] },
            query,
        );

        return { data: movements, meta };
    }


    async findOne(store: Store, id: string): Promise<StockMovement> {
        const movement = await this.em.findOne(
            StockMovement,
            { id, store },
            { populate: ['sourceInventory', 'destinationInventory', 'items', 'items.product', 'sequence'] },
        );

        if (!movement)
            throw new NotFoundException(`Stock movement with id ${id} not found`);

        return movement;
    }

    
    async create(store: Store, employeeId: string, dto: CreateStockMovementDto) {
        return await this.em.transactional(async (em) => {
            if (dto.sourceInventoryId === dto.destinationInventoryId)
                throw new BadRequestException('Source and destination inventory cannot be the same.');

            const sourceInventory = await this.findOrFail<Inventory>(
                em, Inventory, { id: dto.sourceInventoryId, store }, `Source inventory with id ${dto.sourceInventoryId}`,
            );
            const destinationInventory = await this.findOrFail<Inventory>(
                em, Inventory, { id: dto.destinationInventoryId, store }, `Destination inventory with id ${dto.destinationInventoryId}`,
            );

            if (dto.items.length === 0)
                throw new BadRequestException('At least one item is required.');

            const productIds = [...new Set(dto.items.map((i) => i.productId))];
            if (productIds.length !== dto.items.length)
                throw new BadRequestException('Duplicate products are not allowed in a single stock movement.');

            const productMap = await this.findProductsOrFail(em, productIds);

            for (const item of dto.items) {
                if (item.quantity <= 0)
                    throw new BadRequestException(`Quantity for product ${item.productId} must be greater than zero.`);
            }

            await this.assertSufficientStock(em, sourceInventory, dto.items);

            const sequence = await this.sequenceService.generateSequence(store, 'StockMovement', 'MOV');
            const movement = em.create(StockMovement, {
                store,
                sourceInventory,
                destinationInventory,
                status: StockMovementStatus.DRAFT,
                sequence,
            });
            await em.persistAndFlush(movement);

            const items = dto.items.map((item) =>
                em.create(StockMovementItem, {
                    stockMovement: movement,
                    product: productMap.get(item.productId)!,
                    quantity: item.quantity,
                }),
            );
            await em.persistAndFlush(items);

            const employee = await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee');

            this.auditService.logStatusChange(
                em, employee, AuditEntityType.StockMovement, movement.id, AuditActionType.Create, null, null,
            );

            await em.flush();

            return {
                stockMovementId: movement.id,
                message: `Stock movement created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
            };
        });
    }


    async update(store: Store, id: string, employeeId: string, dto: UpdateStockMovementDto) {
        return await this.em.transactional(async (em) => {
            const movement = await em.findOne(
                StockMovement,
                { id, store },
                { populate: ['items', 'items.product', 'sourceInventory', 'destinationInventory'] },
            );
            if (!movement)
                throw new NotFoundException(`Stock movement with id ${id} not found`);

            if (movement.status === StockMovementStatus.CANCELLED)
                throw new BadRequestException('Cannot update a cancelled stock movement.');

            if (movement.status === StockMovementStatus.DONE)
                throw new BadRequestException('Cannot update a completed stock movement.');

            if (dto.status === undefined || dto.status === null) {
                await em.flush();
                return { message: `Stock movement with id ${id} updated successfully.` };
            }

            this.getAllowedTransitions(movement.status as StockMovementStatus, dto.status);

            const employee = await this.findOrFail<Employee>(em, Employee, { id: employeeId }, 'Employee');

            this.auditService.logStatusChange(
                em, employee, AuditEntityType.StockMovement, movement.id, AuditActionType.Update, movement.status, dto.status,
            );

            if (dto.status === StockMovementStatus.DONE) {
                const items = movement.items.getItems();

                await this.moveStock(em, movement.sourceInventory, movement.destinationInventory, items);
            }

            movement.status = dto.status;
            await em.flush();

            return { message: `Stock movement with id ${id} updated successfully.` };
        });
    }

    

    private async assertSufficientStock(
        em: EntityManager,
        sourceInventory: Inventory,
        items: { productId: string; quantity: number }[],
    ): Promise<void> {
        for (const item of items) {
            const stockQty = await em.findOne(StockQuantity, {
                inventory: sourceInventory,
                product: { id: item.productId },
            });

            const available = stockQty?.quantity ?? 0;
            if (available < item.quantity) {
                throw new BadRequestException(
                    `Insufficient stock for product ${item.productId} in source inventory. Available: ${available}, requested: ${item.quantity}.`,
                );
            }
        }
    }

    private async moveStock(
        em: EntityManager,
        sourceInventory: Inventory,
        destinationInventory: Inventory,
        items: StockMovementItem[],
    ): Promise<void> {
        for (const item of items) {
            const productId = item.product.id;

            const sourceStock = await em.findOne(
                StockQuantity,
                { inventory: sourceInventory, product: { id: productId } },
                { lockMode: 'pessimistic_write' as any },
            );

            const availableQuantity = sourceStock?.quantity ?? 0;
            if (availableQuantity < item.quantity) {
                throw new BadRequestException(
                    `Insufficient stock for product ${productId} in source inventory. Available: ${availableQuantity}, requested: ${item.quantity}.`,
                );
            }

            sourceStock!.quantity = availableQuantity - item.quantity;

            let destinationStock = await em.findOne(
                StockQuantity,
                { inventory: destinationInventory, product: { id: productId } },
                { lockMode: 'pessimistic_write' as any },
            );

            if (!destinationStock) {
                destinationStock = em.create(StockQuantity, {
                    inventory: destinationInventory,
                    product: item.product,
                    quantity: 0,
                });
                em.persist(destinationStock);
            }

            destinationStock.quantity = (destinationStock.quantity ?? 0) + item.quantity;

            await destinationInventory.products.init();
            if (!destinationInventory.products.contains(item.product)) {
                destinationInventory.products.add(item.product);
            }
        }
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

    private getAllowedTransitions(currentStatus: StockMovementStatus, newStatus: StockMovementStatus): void {
        const transitions = new Map([
            [StockMovementStatus.DRAFT, [StockMovementStatus.DONE, StockMovementStatus.CANCELLED]],
            [StockMovementStatus.DONE, []],
            [StockMovementStatus.CANCELLED, []],
        ]);

        const allowedTransitions = transitions.get(currentStatus) ?? [];
        if (!allowedTransitions.includes(newStatus))
            throw new BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'.`);
    }
}
