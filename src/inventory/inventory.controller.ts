import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { InventoryDetailQueryDto } from './dto/inventory-detail-query.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(Role.Admin, Role.Cashier)
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.inventoryService.findAll(store, query);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Cashier)
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Query() query: InventoryDetailQueryDto,
  ) {
    return this.inventoryService.findOne(store, id, query);
  }

  @Post()
  @Roles(Role.Admin)
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateInventoryDto,
  ) {
    return this.inventoryService.create(store, user.id, dto);
  }

  @Put(':id')
  @Roles(Role.Admin)
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.inventoryService.update(store, id, user.id, dto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.inventoryService.delete(store, id, user.id);
  }
}
