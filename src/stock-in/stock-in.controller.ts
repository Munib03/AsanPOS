import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StockInService } from './stock-in.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateStockInDto } from './dto/create-stock-in.dto';
import { UpdateStockInDto } from './dto/update-stock-in.dto';
import type { PaginateQuery } from '../shared/types/paginate-query.types';

@Controller('stock-in')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class StockInController {
  constructor(private readonly stockInService: StockInService) {}

  @Get()
  findAll(@CurrentStore() store: Store, @Query() query: PaginateQuery) {
    return this.stockInService.findAll(store, query);
  }

  @Get(':id')
  findOne(@CurrentStore() store: Store, @Param('id') id: string) {
    return this.stockInService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateStockInDto,
  ) {
    return this.stockInService.createFromPurchase(store, user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateStockInDto,
  ) {
    return this.stockInService.update(store, id, user.id, dto);
  }
}
