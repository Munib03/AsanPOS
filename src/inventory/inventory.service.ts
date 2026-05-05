import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Inventory } from '../database/entites/inventory.entity';

@Injectable()
export class InventoryService {
  constructor(private readonly em: EntityManager) {}

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
}