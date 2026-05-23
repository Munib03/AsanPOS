import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { StockInService } from './stock-in.service';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateStockInDto } from './dto/create-stock-in.dto';
import { UpdateStockInDto } from './dto/update-stock-in.dto';

@Controller('stock-in')
@UseGuards(JwtAuthGuard)
export class StockInController {
  constructor(private readonly stockInService: StockInService) {}
  
  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.stockInService.findAll(store);
  }

  @Get(':id')
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.stockInService.findOne(store, id);
  }
  
  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateStockInDto,
  ) {
    return this.stockInService.createFromPurchase(store, dto);
  }


  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Body() dto: UpdateStockInDto,
  ) {
    return this.stockInService.update(store, id, dto);
  }
}