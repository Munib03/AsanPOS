import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { InventoryService } from "./inventory.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { UpdateInventoryDto } from "./dto/update-inventory.dto";


@Controller("inventory")
@UseGuards(JwtAuthGuard)
export class InventoryController {
    
    constructor(
        private inventoryService: InventoryService,
    ) {}


    @Get()
    findAll() {
        return this.inventoryService.findAll();
    }

    @Post()
    findOne(@Body("inventoryName") inventoryName: string) {
        return this.inventoryService.findOne(inventoryName);
    }
    
    
    @Post()
    create(@Body() dto: CreateInventoryDto) {
        return this.inventoryService.create(dto);
    }

    @Put(":id")
    update(@Param("id") id: string, @Body() dto: UpdateInventoryDto) {
        return this.inventoryService.update(id, dto);
    }
}