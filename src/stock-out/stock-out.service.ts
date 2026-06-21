import { EntityManager, serialize } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Employee } from '../database/entites/employee.entity';
import { Inventory } from '../database/entites/inventory.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { Sale } from '../database/entites/sale.entity';
import { StockOutItem } from '../database/entites/stock-out-item.entity';
import { StockOut } from '../database/entites/stock-out.entity';
import { Store } from '../database/entites/store.entity';
import { SequenceService } from '../sequence/sequence.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { StockOutStatus } from '../shared/utils/stock-out-status.enum';
import { StockQuantityService } from '../stock-quantity/stock-quantity.service';
import { CreateStockOutDto, StockOutItemDto } from './dto/create-stock-out.dto';
import { UpdateStockOutDto } from './dto/update-stock-out.dto';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';

const STOCK_OUT_POPULATE = [
  'inventory',
  'sale',
  'sequence',
  'items',
  'items.product',
  'items.saleItem',
] as const;

@Injectable()
export class StockOutService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
    private readonly stockQuantityService: StockQuantityService,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store) {
    const stockOuts = await this.em.findAll(StockOut, {
      where: { sale: { store } },
      populate: STOCK_OUT_POPULATE,
    });

    return serialize(stockOuts, { populate: STOCK_OUT_POPULATE });
  }

  async findOne(store: Store, id: string) {
    const stockOut = await this.em.findOne(
      StockOut,
      { id, sale: { store } },
      { populate: STOCK_OUT_POPULATE },
    );

    if (!stockOut)
      throw new NotFoundException(`Stock out with id ${id} not found`);

    return serialize(stockOut, { populate: STOCK_OUT_POPULATE });
  }

  async create(
    store: Store,
    employeeId: string,
    dto: CreateStockOutDto,
  ): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const [sale, inventory] = await Promise.all([
        em.findOne(
          Sale,
          { id: dto.saleId, store },
          { populate: ['items', 'items.product'] },
        ),
        em.findOne(Inventory, { id: dto.inventoryId }),
      ]);

      if (!sale)
        throw new NotFoundException(`Sale with id ${dto.saleId} not found`);

      if (!inventory)
        throw new NotFoundException(
          `Inventory with id ${dto.inventoryId} not found`,
        );

      const saleItemMap = new Map(
        sale.items.getItems().map((item) => [item.id, item]),
      );

      this.validateItems(dto.items, saleItemMap);

      const sequence = await this.sequenceService.generateSequence(
        'StockOut',
        'STO',
      );

      const stockOut = em.create(StockOut, {
        inventory,
        sale,
        sequence,
        status: StockOutStatus.PENDING,
      });

      em.persist(stockOut);

      for (const item of dto.items) {
        const saleItem = saleItemMap.get(item.saleItemId)!;

        em.create(StockOutItem, {
          stockOut,
          product: saleItem.product,
          saleItem,
          quantity: item.quantity,
        });
      }

      const employee = await em.findOne(Employee, { id: employeeId });
      if (!employee) throw new NotFoundException('Employee not found');

      this.auditService.logStatusChange(
        em,
        employee,
        AuditEntityType.StockOut,
        stockOut.id,
        AuditActionType.Create,
        null,
        null
      );

      await em.flush();

      return {
        id: `${stockOut.id}`,
        message: `Stock out created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.`,
      };
    });
  }


  async update(
    store: Store,
    id: string,
    employeeId: string,
    dto: UpdateStockOutDto,
  ): Promise<{ message: string }> {
    return await this.em.transactional(async (em) => {
      const stockOut = await em.findOne(
        StockOut,
        { id, sale: { store } },
        {
          populate: [
            'items',
            'items.product',
            'items.saleItem',
            'inventory',
            'inventory.products',
            'sale',
            'sale.items',
          ],
        },
      );

      if (!stockOut)
        throw new NotFoundException(`Stock out with id ${id} not found`);

      if (stockOut.status === StockOutStatus.DONE)
        throw new BadRequestException(`Cannot update a completed stock out`);

      if (stockOut.status === StockOutStatus.CANCELLED)
        throw new BadRequestException(`Cannot update a cancelled stock out`);

      if (dto.status) {
        this.validateStockOutTransition(
          stockOut.status as StockOutStatus,
          dto.status as StockOutStatus,
        );

        if (dto.status === StockOutStatus.DONE) {
          for (const item of stockOut.items.getItems()) {
            const available = await this.stockQuantityService.getStockQuantity(
              em,
              stockOut.inventory,
              item.product,
            );

            if (available < (item.quantity ?? 0))
              throw new BadRequestException(
                `Insufficient stock for product "${item.product.name}". Available: ${available}, Requested: ${item.quantity ?? 0}`,
              );
          }

          for (const item of stockOut.items.getItems()) {
            await this.stockQuantityService.decreaseStockQuantity(
              em,
              stockOut.inventory,
              item.product,
              item.quantity ?? 0,
            );
          }
        }

        const employee = await em.findOne(Employee, { id: employeeId });
        if (!employee) throw new NotFoundException('Employee not found');

        this.auditService.logStatusChange(
          em,
          employee,
          AuditEntityType.StockOut,
          stockOut.id,
          AuditActionType.Delete,
          stockOut.status ?? '',
          dto.status!,
        );

        stockOut.status = dto.status!;
      }

      await em.flush();
      return { message: `Stock out with id ${id} updated successfully.` };
    });
  }

  private validateItems(
    items: StockOutItemDto[],
    saleItemMap: Map<string, SaleItem>,
  ): void {
    for (const item of items) {
      const saleItem = saleItemMap.get(item.saleItemId);
      if (!saleItem)
        throw new NotFoundException(
          `Sale item with id ${item.saleItemId} does not belong to this sale`,
        );
    }
  }

  private validateStockOutTransition(
    currentStatus: StockOutStatus,
    newStatus: StockOutStatus,
  ): void {
    const transitions = new Map([
      [StockOutStatus.PENDING, [StockOutStatus.DONE, StockOutStatus.CANCELLED]],
      [StockOutStatus.DONE, []],
      [StockOutStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'.`,
      );
  }
}
