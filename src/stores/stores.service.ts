import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from '../database/entites/store.entity';
import { stripUndefined } from '../shared/utils/strip-undefined.util';

@Injectable()
export class StoresService {
  constructor(
    private readonly em: EntityManager,
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

  async update(id: string, dto: UpdateStoreDto) {
    const store = await this.em.findOne(Store, { id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    this.em.assign(store, stripUndefined(dto));
    await this.em.flush();

    return store;
  }


  async remove(id: string) {
    const store = await this.em.findOne(Store, { id });
    if (!store)
      throw new NotFoundException(`Store with id ${id} not found`);

    await this.em.removeAndFlush(store);

    return { message: `Store ${id} deleted successfully` };
  }
}