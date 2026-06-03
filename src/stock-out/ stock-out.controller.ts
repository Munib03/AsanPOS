import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { StockOutService } from './stock-out.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateStockOutDto } from './dto/create-stock-out.dto';
import { UpdateStockOutDto } from './dto/update-stock-out.dto';

@Controller('stock-out')
@UseGuards(JwtAuthGuard)
export class StockOutController {
  constructor(private readonly stockOutService: StockOutService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.stockOutService.findAll(store);
  }

  @Get(':id')
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.stockOutService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateStockOutDto,
  ) {
    return this.stockOutService.create(store, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Body() dto: UpdateStockOutDto,
  ) {
    return this.stockOutService.update(store, id, dto);
  }
}