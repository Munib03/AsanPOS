import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StockInController } from './stock-in.controller';
import { StockInService } from './stock-in.service';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { SequenceModule } from '../sequence/sequence.module';
import { StockQuantityModule } from '../stock-quantity/stock-quantity.module';
import { JournalEntryModule } from '../journal/journal.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([StockIn, StockInItem]),
    SequenceModule,
    StockQuantityModule,
    JournalEntryModule,
    AuditModule,
  ],
  controllers: [StockInController],
  providers: [StockInService],
  exports: [StockInService],
})
export class StockInModule {}