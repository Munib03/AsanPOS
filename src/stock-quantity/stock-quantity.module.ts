import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { StockQuantityService } from './stock-quantity.service';

@Module({
  imports: [MikroOrmModule.forFeature([StockQuantity])],
  providers: [StockQuantityService],
  exports: [StockQuantityService],
})
export class StockQuantityModule {}