import { EntityManager } from "@mikro-orm/knex";
import { BadRequestException, Injectable } from "@nestjs/common";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { Inventory } from "../database/entites/inventory.entity";


@Injectable()
export class InventoryService {

    constructor(
        private em: EntityManager
    ) {}


    async create(dto: CreateInventoryDto) {
        const inventory = await this.em.findOne(Inventory, { name: dto.name });
        if (inventory)
            throw new BadRequestException(`Inventory with name ${dto.name} already exits.`);


        
    }
}