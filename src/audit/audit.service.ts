import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { AuditLog } from '../database/entites/audit-log.entity';
import { Employee } from '../database/entites/employee.entity';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: BaseRepository<AuditLog>,
  ) {}

  logStatusChange(
    em: EntityManager,
    employee: Employee,
    entityType: AuditEntityType,
    entityId: string,
    beforeStatus: string | null,
    afterStatus: string | null,
  ): void {
    em.create(AuditLog, {
      employee,
      entityType,
      entityId,
      before: beforeStatus ? { status: beforeStatus } : null,
      after: afterStatus ? { status: afterStatus } : null,
    });
  }

  log(
    em: EntityManager,
    employee: Employee,
    entityType: AuditEntityType,
    entityId: string,
    before: Record<string, any> | null,
    after: Record<string, any> | null,
  ): void {
    em.create(AuditLog, {
      employee,
      entityType,
      entityId,
      before,
      after,
    });
  }

  async findAll(query: PaginateQuery) {
    const [logs, meta] = await this.auditRepository.findAndPaginate(
      {},
      {
        populate: ['employee'],
        orderBy: { createdAt: 'DESC' },
        fields: [
          'id',
          'entityType',
          'entityId',
          'before',
          'after',
          'createdAt',
          'employee.id',
          'employee.name',
          'employee.email',
        ],
      },
      { searchable: [] },
      query,
    );

    return { data: logs, meta };
  }
}