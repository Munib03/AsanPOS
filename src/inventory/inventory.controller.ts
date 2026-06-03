import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/guards/jwt-auth.guard";
import { InventoryService } from "./inventory.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { UpdateInventoryDto } from "./dto/update-inventory.dto";
import { CurrentStore } from "../shared/decorators/store.decorator";
import { Store } from "../database/entites/store.entity";
import * as paginateQueryTypes from "../shared/types/paginate-query.types";
import { RolesGuard } from "../shared/guards/role.guard";
import { Roles } from "../shared/decorators/role.decorator";
import { Role } from "../shared/utils/role.enum";

@Controller("inventory")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class InventoryController {

  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.inventoryService.findAll(store, query);
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