import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Inventory } from '../database/entites/inventory.entity';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import { stripUndefined } from '../shared/utils/strip-undefined.util';

@Injectable()
export class InventoryService {
  constructor(private readonly em: EntityManager) {}

  async findAll() {
    return await this.em.findAll(Inventory, { fields: ["name", "address" ] })
  }

  async findOne(inventoryName: string) {
    const inventory = await this.em.findOne(Inventory, { name: inventoryName });
    if (!inventory)
      throw new BadRequestException(`Inventory with name ${inventoryName} does not exists!`);

    return inventory;
  }


  async create(dto: CreateInventoryDto) {
    const existingInventory = await this.em.findOne(Inventory, { name: dto.name });
    if (existingInventory)
      throw new BadRequestException(`Inventory with name ${dto.name} already exists.`);

    const inventory = this.em.create(Inventory, {
      name: dto.name,
      address: dto.address,
    });

    await this.em.persistAndFlush(inventory);

    return { message: 'Inventory created successfully.' };
  }


  async update(id: string, dto: UpdateCategoryDto) {
    const inventory = await this.em.findOne(Inventory, { id: id });
    if (!inventory)
      throw new BadRequestException(`Inventory with name ${id} does not exist!`);

    this.em.assign(inventory, stripUndefined(dto));
    await this.em.flush();

    return { message: `Inventory with id ${id} updated successfully.`}
  }


  async delete(id: string) {
    const inventory = await this.em.findOne(Inventory, { id: id });
    if (!inventory)
      throw new BadRequestException(`Inventory with id ${id} does not exist!`);

    await this.em.removeAndFlush(inventory);

    return { message: `Inventory with id ${id} deleted successfully.` };
  }
}