import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { StockOutService } from './stock-out.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateStockOutDto } from './dto/create-stock-out.dto';
import { UpdateStockOutDto } from './dto/update-stock-out.dto';

@Controller('stock-out')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockOutController {
  constructor(private readonly stockOutService: StockOutService) { }

  @Get()
  @Roles(Role.Admin)
  findAll(@CurrentStore() store: Store) {
    return this.stockOutService.findAll(store);
  }

  @Get(':id')
  @Roles(Role.Admin)
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.stockOutService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateStockOutDto,
  ) {
    return this.stockOutService.create(store, user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateStockOutDto,
  ) {
    return this.stockOutService.update(store, id, user.id, dto);
  }
}