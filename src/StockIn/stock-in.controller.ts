import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { StockInService } from './stock-in.service';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';

@Controller('stock-in')
@UseGuards(JwtAuthGuard)
export class StockInController {
  constructor(private readonly stockInService: StockInService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockInService.findOne(id);
  }
}