import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Inventory } from '../database/entites/inventory.entity';
import { Store } from '../database/entites/store.entity';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';


@Injectable()
export class InventoryService {
  constructor(
    private readonly em: EntityManager,
    private readonly inventoryRepository: BaseRepository<Inventory>,
  ) {}


  async findAll(store: Store, query: PaginateQuery) {
    const [inventories, meta] = await this.inventoryRepository.findAndPaginate(
      { store },
      {
        populate: ['products'],
        fields: ['id', 'name', 'address', 'products.id', 'products.name', 'products.price'],
      },
      {
        searchable: ['name'],
      },
      query,
    );

    return {
      data: serialize(inventories, { populate: ['products'] }),
      meta,
    };
  }


  async findOne(store: Store, id: string) {
    const inventory = await this.em.findOne(Inventory, 
      { id, store },
      {
        populate: ['products'],
        fields: ['id', 'name', 'address', 'products.id', 'products.name', 'products.price'],
      }
    );

    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    return serialize(inventory, { populate: ['products'] });
  }


  async create(store: Store, dto: CreateInventoryDto) {
    const existingInventory = await this.em.findOne(Inventory, { name: dto.name, store });
    if (existingInventory)
      throw new BadRequestException(`Inventory with name ${dto.name} already exists.`);

    const inventory = this.em.create(Inventory, {
      name: dto.name,
      address: dto.address,
      store,
    });

    await this.em.persistAndFlush(inventory);

    return { message: 'Inventory created successfully.' };
  }


  async update(store: Store, id: string, dto: UpdateInventoryDto) {
    const inventory = await this.em.findOne(Inventory, { id, store });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    this.em.assign(inventory, stripUndefined(dto));
    await this.em.flush();

    return { message: `Inventory with id ${id} updated successfully.` };
  }


  async delete(store: Store, id: string) {
    const inventory = await this.em.findOne(Inventory, { id, store });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    await this.em.removeAndFlush(inventory);

    return { message: `Inventory with id ${id} deleted successfully.` };
  }
}