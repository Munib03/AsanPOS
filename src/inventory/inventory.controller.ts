import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { InventoryService } from "./inventory.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";


@Controller("inventory")
@UseGuards(JwtAuthGuard)
export class InventoryController {
    
    constructor(
        private inventoryService: InventoryService,
    ) {}
    
    
    @Post()
    create(@Body() dto: CreateInventoryDto) {
        return this.inventoryService.create(dto);
    }
}