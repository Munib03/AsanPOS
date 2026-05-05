import { Controller, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { InventoryService } from "./inventory.service";


@Controller("inventory")
@UseGuards(JwtAuthGuard)
export class InventoryController {
    
    constructor(
        private inventoryService: InventoryService,
    ) {}
    
}