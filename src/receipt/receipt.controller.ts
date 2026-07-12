import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import type { PaginateQuery } from '../shared/types/paginate-query.types';

@Controller('receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Cashier)
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get()
  findAll(@CurrentStore() store: Store, @Query() query: PaginateQuery) {
    return this.receiptService.findAll(store, query);
  }

  @Get(':id')
  findOne(@CurrentStore() store: Store, @Param('id') id: string) {
    return this.receiptService.findOne(store, id);
  }
}
