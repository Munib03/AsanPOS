import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from '../database/entites/store.entity';
import { Employee } from '../database/entites/employee.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';

@Injectable()
export class StoresService {
  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
  ) {}

  async findAll() {
    return this.em.findAll(Store, {});
  }

  async findOne(id: string) {
    const store = await this.em.findOne(Store, { id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    return store;
  }

  async update(id: string, employeeId: string, dto: UpdateStoreDto) {
    const store = await this.em.findOne(Store, { id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    const before = { name: store.name, address: store.address };

    this.em.assign(store, stripUndefined(dto));

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Store,
      store.id,
      before,
      { name: store.name, address: store.address },
    );

    await this.em.flush();

    return store;
  }

  async remove(id: string, employeeId: string) {
    const store = await this.em.findOne(Store, { id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Store,
      store.id,
      { name: store.name, address: store.address },
      null,
    );

    await this.em.flush();
    await this.em.removeAndFlush(store);

    return { message: `Store ${id} deleted successfully` };
  }
}