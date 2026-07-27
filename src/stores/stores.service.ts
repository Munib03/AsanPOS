import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from '../database/entites/store.entity';
import { Employee } from '../database/entites/employee.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';

@Injectable()
export class StoresService {
  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
  ) {}

  async findAll(store: Store) {
    return this.em.find(Store, { id: store.id });
  }

  async findOne(currentStore: Store, id: string) {
    if (id !== currentStore.id)
      throw new NotFoundException(`Store with id ${id} not found`);

    const store = await this.em.findOne(Store, { id: currentStore.id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    return store;
  }

  async update(
    currentStore: Store,
    id: string,
    employeeId: string,
    dto: UpdateStoreDto,
  ) {
    const store = await this.findOne(currentStore, id);

    const before = { name: store.name, address: store.address };

    this.em.assign(store, stripUndefined(dto));

    const employee = await this.em.findOne(Employee, {
      id: employeeId,
      store: currentStore,
    });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Store,
      store.id,
      AuditActionType.Update,
      before,
      { name: store.name, address: store.address },
    );

    await this.em.flush();

    return store;
  }

  async remove(currentStore: Store, id: string, employeeId: string) {
    const store = await this.findOne(currentStore, id);

    const employee = await this.em.findOne(Employee, {
      id: employeeId,
      store: currentStore,
    });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Store,
      store.id,
      AuditActionType.Delete,
      { name: store.name, address: store.address },
      null,
    );

    await this.em.flush();
    await this.em.removeAndFlush(store);

    return { message: `Store ${id} deleted successfully` };
  }
}
