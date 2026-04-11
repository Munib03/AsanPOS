import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Store } from '../entites/Store';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { v4 as uuidv4 } from 'uuid';


@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: EntityRepository<Store>,
  ) { }

  async findAll() {
    return this.storeRepo.findAll();
  }

  async findOne(id: string) {
    const store = await this.storeRepo.findOne({ id });
    if (!store) throw new NotFoundException(`Store with id ${id} not found`);
    return store;
  }

  async create(dto: CreateStoreDto) {
    const store = this.storeRepo.create({
      id: uuidv4(),
      name: dto.name,
      address: dto.address,
      employees: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.storeRepo.getEntityManager().persistAndFlush(store);
    return { id: store.id, name: store.name, address: store.address };
  }

  async update(id: string, dto: UpdateStoreDto) {
    const store = await this.storeRepo.findOne({ id });
    if (!store) throw new NotFoundException(`Store with id ${id} not found`);
    this.storeRepo.assign(store, dto);
    await this.storeRepo.getEntityManager().flush();
    return store;
  }

  async remove(id: string) {
    const store = await this.storeRepo.findOne({ id });
    if (!store) throw new NotFoundException(`Store with id ${id} not found`);
    await this.storeRepo.getEntityManager().removeAndFlush(store);
    return { message: `Store ${id} deleted successfully` };
  }
}