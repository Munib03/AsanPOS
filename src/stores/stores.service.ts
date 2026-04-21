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


  async create(dto: CreateStoreDto) {

    const store = this.em.create(Store, {
      name: dto.name,
      address: dto.address,
    });

    await this.em.persistAndFlush(store);

    return { id: store.id, name: store.name, address: store.address };
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