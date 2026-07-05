import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditLog } from '../database/entites/audit-log.entity';
import { Employee } from '../database/entites/employee.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: BaseRepository<AuditLog>) {}

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
          'employee.name',
          'employee.email',
        ],
      },
      { searchable: ['entityType'] },
      query,
    );

    return { data: logs, meta };
  }

  async findByEntity(entityId: string, query: PaginateQuery) {
    const [logs, meta] = await this.auditRepository.findAndPaginate(
      { entityId },
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
          'employee.name',
          'employee.email',
        ],
      },
      { searchable: ['entityType'] },
      query,
    );

    return { data: logs, meta };
  }
}
