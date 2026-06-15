import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { RolesGuard } from '../shared/guards/role.guard';
import { Role } from '../shared/utils/role.enum';
import { Roles } from '../shared/decorators/role.decorator';

@Controller('purchase')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Get()
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.purchaseService.findAll(store, query);
  }

  @Get(':id')
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.purchaseService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.purchaseService.create(store, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.purchaseService.update(store, id, user.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.purchaseService.remove(store, id);
  }
}