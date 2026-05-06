import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { InventoryService } from "./inventory.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { UpdateInventoryDto } from "./dto/update-inventory.dto";
import { CurrentStore } from "../shared/decorators/store.decorator";
import { Store } from "../database/entites/store.entity";

@Controller("inventory")
@UseGuards(JwtAuthGuard)
export class InventoryController {

  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.inventoryService.findAll(store);
  }

  @Get(":id")
  findOne(@CurrentStore() store: Store, @Param("id") id: string) {
    return this.inventoryService.findOne(store, id);
  }

  @Post()
  create(@CurrentStore() store: Store, @Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(store, dto);
  }

  @Put(":id")
  update(@CurrentStore() store: Store, @Param("id") id: string, @Body() dto: UpdateInventoryDto) {
    return this.inventoryService.update(store, id, dto);
  }

  @Delete(":id")
  remove(@CurrentStore() store: Store, @Param("id") id: string) {
    return this.inventoryService.delete(store, id);
  }
}