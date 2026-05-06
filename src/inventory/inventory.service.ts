import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Inventory } from '../database/entites/inventory.entity';
import { Store } from '../database/entites/store.entity';
import { stripUndefined } from '../shared/utils/strip-undefined.util';

@Injectable()
export class InventoryService {
  constructor(private readonly em: EntityManager) {}

  async findAll(store: Store) {
    return this.em.findAll(Inventory, {
      where: { storeId: store.id },
      fields: ['id', 'name', 'address'],
    });
  }

  async findOne(store: Store, id: string) {
    const inventory = await this.em.findOne(Inventory, { id, storeId: store.id });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    return inventory;
  }


  async create(store: Store, dto: CreateInventoryDto) {
    const existingInventory = await this.em.findOne(Inventory, { name: dto.name, storeId: store.id });
    if (existingInventory)
      throw new BadRequestException(`Inventory with name ${dto.name} already exists.`);

    const inventory = this.em.create(Inventory, {
      name: dto.name,
      address: dto.address,
      storeId: store.id,
    });

    await this.em.persistAndFlush(inventory);
    return { message: 'Inventory created successfully.' };
  }


  async update(store: Store, id: string, dto: UpdateInventoryDto) {
    const inventory = await this.em.findOne(Inventory, { id, storeId: store.id });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    this.em.assign(inventory, stripUndefined(dto));
    await this.em.flush();
    return { message: `Inventory with id ${id} updated successfully.` };
  }


  async delete(store: Store, id: string) {
    const inventory = await this.em.findOne(Inventory, { id, storeId: store.id });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    await this.em.removeAndFlush(inventory);
    return { message: `Inventory with id ${id} deleted successfully.` };
  }
}