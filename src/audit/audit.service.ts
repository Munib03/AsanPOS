import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditLog } from '../database/entites/audit-log.entity';
import { Employee } from '../database/entites/employee.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockOut } from '../database/entites/stock-out.entity';
import { getEmployeeFullName } from '../shared/utils/employee-name.util';

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: BaseRepository<AuditLog>,
    private readonly em: EntityManager,
  ) {}

  log(
    em: EntityManager,
    employee: Employee,
    entityType: AuditEntityType,
    entityId: string,
    actionType: AuditActionType,
    before: Record<string, any> | null,
    after: Record<string, any> | null,
  ): void {
    em.create(AuditLog, {
      employee,
      entityType,
      entityId,
      actionType,
      before,
      after,
    });
  }

  logStatusChange(
    em: EntityManager,
    employee: Employee,
    entityType: AuditEntityType,
    entityId: string,
    actionType: AuditActionType,
    beforeStatus: string | null,
    afterStatus: string | null,
  ): void {
    em.create(AuditLog, {
      employee,
      entityType,
      entityId,
      actionType,
      before: beforeStatus ? { status: beforeStatus } : null,
      after: afterStatus ? { status: afterStatus } : null,
    });
  }

  async findAll(query: PaginateQuery, type?: AuditEntityType) {
    const [logs, meta] = await this.auditRepository.findAndPaginate(
      type ? { entityType: type } : {},
      {
        populate: ['employee'],
        orderBy: { createdAt: 'DESC' },
        fields: [
          'id',
          'entityType',
          'entityId',
          'actionType',
          'before',
          'after',
          'createdAt',
          'employee.id',
          'employee.firstName',
          'employee.lastName',
          'employee.email',
        ],
      },
      { searchable: ['entityType'] },
      query,
    );

    return { data: logs, meta };
  }

  async findByEntity(entityId: string, query: PaginateQuery) {
    const [stockIns, stockOuts] = await Promise.all([
      this.em.find(
        StockIn,
        { inventory: { id: entityId } },
        {
          populate: [
            'inventory',
            'purchase',
            'sequence',
            'items',
            'items.product',
          ],
          fields: [
            'id',
            'status',
            'createdAt',
            'inventory.id',
            'inventory.name',
            'purchase.id',
            'sequence.prefix',
            'sequence.lastIndex',
            'items.id',
            'items.quantity',
            'items.product.id',
            'items.product.name',
          ],
        },
      ),
      this.em.find(
        StockOut,
        { inventory: { id: entityId } },
        {
          populate: ['inventory', 'sale', 'sequence', 'items', 'items.product'],
          fields: [
            'id',
            'status',
            'createdAt',
            'inventory.id',
            'inventory.name',
            'sale.id',
            'sale.status',
            'sequence.prefix',
            'sequence.lastIndex',
            'items.id',
            'items.quantity',
            'items.product.id',
            'items.product.name',
          ],
        },
      ),
    ]);

    const stockInIds = stockIns.map((s) => s.id);
    const stockOutIds = stockOuts.map((s) => s.id);
    const entityIds = [entityId, ...stockInIds, ...stockOutIds];

    const [logs, meta] = await this.auditRepository.findAndPaginate(
      { entityId: { $in: entityIds } },
      {
        populate: ['employee'],
        orderBy: { createdAt: 'DESC' },
        fields: [
          'id',
          'entityType',
          'entityId',
          'actionType',
          'before',
          'after',
          'createdAt',
          'employee.id',
          'employee.firstName',
          'employee.lastName',
          'employee.email',
        ],
      },
      { searchable: ['entityType', 'actionType'] },
      query,
    );

    const stockInById = new Map(stockIns.map((s) => [s.id, s]));
    const stockOutById = new Map(stockOuts.map((s) => [s.id, s]));

    const seenLogIds = new Set<string>();

    const data = logs.reduce<any[]>((acc, log) => {
      if (seenLogIds.has(log.id)) return acc;
      seenLogIds.add(log.id);

      const base = {
        id: log.id,
        actionType: log.actionType,
        entityType: log.entityType,
        entityId: log.entityId,
        before: log.before,
        after: log.after,
        createdAt: log.createdAt,
        performedBy: {
          id: (log.employee as any)?.id,
          name: getEmployeeFullName(log.employee),
        },
      };

      if (log.entityType === AuditEntityType.StockIn) {
        const stockIn = stockInById.get(base.entityId!) ?? null;
        acc.push({
          ...base,
          stockIn: stockIn
            ? {
                id: stockIn.id,
                status: stockIn.status,
                createdAt: stockIn.createdAt,
                inventory: stockIn.inventory as any,
                purchase: stockIn.purchase as any,
                sequence: stockIn.sequence as any,
                items: stockIn.items.getItems(),
              }
            : null,
        });
        return acc;
      }

      if (log.entityType === AuditEntityType.StockOut) {
        const stockOut = stockOutById.get(base.entityId!) ?? null;
        acc.push({
          ...base,
          stockOut: stockOut
            ? {
                id: stockOut.id,
                status: stockOut.status,
                createdAt: stockOut.createdAt,
                inventory: stockOut.inventory as any,
                sale: stockOut.sale as any,
                sequence: stockOut.sequence as any,
                items: stockOut.items.getItems(),
              }
            : null,
        });
        return acc;
      }

      acc.push(base);
      return acc;
    }, []);

    return { data, meta };
  }
}
