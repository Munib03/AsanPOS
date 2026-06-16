import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Store } from '../database/entites/store.entity';
import { Roles } from '../shared/decorators/role.decorator';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { Role } from '../shared/utils/role.enum';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @Roles(Role.Admin, Role.Cashier)
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.customerService.findAll(store, query);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Cashier)
  findOne(@Param('id') id: string) {
    return this.customerService.findOne(id);
  }

  @Post()
  @Roles(Role.Admin)
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.create(store, user.id, dto);
  }

  @Put(':id')
  @Roles(Role.Admin)
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.customerService.remove(id, user.id);
  }
}