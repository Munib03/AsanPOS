import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StockOutService } from './stock-out.service';
import { StockOut } from '../database/entites/stock-out.entity';
import { StockOutItem } from '../database/entites/stock-out-item.entity';
import { SequenceModule } from '../sequence/sequence.module';
import { StockQuantityModule } from '../stock-quantity/stock-quantity.module';
import { AuditModule } from '../audit/audit.module';
import { StockOutController } from './ stock-out.controller';

@Module({
  imports: [
    MikroOrmModule.forFeature([StockOut, StockOutItem]),
    SequenceModule,
    StockQuantityModule,
    AuditModule,
  ],
  controllers: [StockOutController],
  providers: [StockOutService],
  exports: [StockOutService],
})
export class StockOutModule {}