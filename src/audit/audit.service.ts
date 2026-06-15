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
    beforeStatus: string,
    afterStatus: string,
  ): void {
    em.create(AuditLog, {
      employee,
      entityType,
      entityId,
      before: { status: beforeStatus },
      after: { status: afterStatus },
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