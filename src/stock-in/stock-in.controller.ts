import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { StockInService } from './stock-in.service';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateStockInDto } from './dto/create-stock-in.dto';

@Controller('stock-in')
@UseGuards(JwtAuthGuard)
export class StockInController {
  constructor(private readonly stockInService: StockInService) {}

  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateStockInDto,
  ) {
    return this.stockInService.createFromPurchase(store, dto);
  }


}