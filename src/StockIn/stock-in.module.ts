import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StockInService } from './stock-in.service';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { SequenceModule } from '../sequence/sequence.module';
import { StockQuantityModule } from '../stockQuantity/stock-quantity.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([StockIn, StockInItem]),
    SequenceModule,
    StockQuantityModule,
  ],
  providers: [StockInService],
  exports: [StockInService],
})
export class StockInModule {}